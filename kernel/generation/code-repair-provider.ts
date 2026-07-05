import type { BuildFailure } from '../execution/execution-types.js';
import type { JudgeIssue } from '../judge/judge-types.js';
import type { LLMRequest, ProviderId } from '../llm/llm-types.js';
import type { RouterEngine } from '../llm/router-engine.js';

import type { GenerationMetricsTracker } from './generation-metrics.js';
import type { FilePatch, CodeRepairResult, PatchOperation } from './generation-types.js';
import { CodeRepairResultSchema } from './generation-types.js';

export type RepairSource = BuildFailure | JudgeIssue | PlaywrightFailure;

export interface PlaywrightFailure {
  type: 'playwright';
  test_file: string;
  test_name: string;
  error_message: string;
  location?: { file: string; line: number; column?: number };
}

export interface CodeRepairConfig {
  max_attempts: number;
  routerEngine: RouterEngine;
  taskType?: string;
  metricsTracker?: GenerationMetricsTracker;
}

const PATCH_PROMPT_TEMPLATE = `You are a code repair specialist. Given a source file and an error description, produce patch operations to fix the issue.

## Current File Content
\`\`\`{{LANGUAGE}}
{{FILE_CONTENT}}
\`\`\`

## Issue to Fix
- Type: {{ISSUE_TYPE}}
- Message: {{ISSUE_MESSAGE}}
- Location: {{ISSUE_LOCATION}}
{{EXTRA_CONTEXT}}

## Instructions
Analyze the issue carefully and generate patch operations. Each operation must specify:
1. "type": one of "replace", "insert_before", "insert_after", "delete", "append", "prepend"
2. "target": unique string in the file content to match (for replace/insert_before/insert_after/delete)
3. "content": the new content to insert (not needed for delete)
4. "line": optional line number for precision

Return a JSON object:
{
  "file_path": "{{FILE_PATH}}",
  "operations": [
    { "type": "replace|insert_before|insert_after|delete|append|prepend", "target": "string to find", "content": "replacement or inserted content", "line": null }
  ],
  "language": "{{LANGUAGE}}"
}`;

export class CodeRepairProvider {
  private readonly config: CodeRepairConfig;

  constructor(config: CodeRepairConfig) {
    this.config = config;
  }

  async repairFromBuildFailure(failure: BuildFailure, fileContent: string): Promise<CodeRepairResult> {
    const filePath = failure.file ?? 'unknown';
    const location = failure.line
      ? `${filePath}:${failure.line}${failure.column ? `:${failure.column}` : ''}`
      : filePath;

    return this.repair({
      file_path: filePath,
      content: fileContent,
      issueType: `build_${failure.type}`,
      issueMessage: failure.message,
      issueLocation: location,
      language: this.inferLanguage(filePath),
      extraContext: failure.code ? `Error code: ${failure.code}` : '',
    });
  }

  async repairFromJudgeIssue(issue: JudgeIssue, fileContent: string): Promise<CodeRepairResult> {
    const filePath = issue.file ?? 'unknown';
    const location = issue.line ? `${filePath}:${issue.line}` : filePath;

    return this.repair({
      file_path: filePath,
      content: fileContent,
      issueType: `judge_${issue.category}`,
      issueMessage: issue.message,
      issueLocation: location,
      language: this.inferLanguage(filePath),
      extraContext: issue.recommendation ? `Recommendation: ${issue.recommendation}` : '',
    });
  }

  async repairFromPlaywrightFailure(failure: PlaywrightFailure, fileContent: string): Promise<CodeRepairResult> {
    const filePath = failure.location?.file ?? failure.test_file;
    const location = failure.location ? `${failure.location.file}:${failure.location.line}` : failure.test_file;

    return this.repair({
      file_path: filePath,
      content: fileContent,
      issueType: 'playwright',
      issueMessage: `Test "${failure.test_name}" failed: ${failure.error_message}`,
      issueLocation: location,
      language: this.inferLanguage(filePath),
      extraContext: `Test file: ${failure.test_file}\nTest name: ${failure.test_name}`,
    });
  }

  async applyPatch(patch: FilePatch, originalContent: string): Promise<CodeRepairResult> {
    const startTime = Date.now();
    try {
      const patchedContent = this.applyOperations(originalContent, patch.operations);
      const result: CodeRepairResult = {
        file_path: patch.file_path,
        original_content: originalContent,
        patched_content: patchedContent,
        operations_applied: patch.operations,
        success: patchedContent !== originalContent,
        error: patchedContent === originalContent ? 'No changes applied' : null,
        latency_ms: Date.now() - startTime,
      };

      this.config.metricsTracker?.recordRepair(result.success, result.latency_ms);
      return result;
    } catch (err) {
      const result: CodeRepairResult = {
        file_path: patch.file_path,
        original_content: originalContent,
        patched_content: originalContent,
        operations_applied: patch.operations,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - startTime,
      };
      this.config.metricsTracker?.recordRepair(false, result.latency_ms);
      return result;
    }
  }

  private async repair(params: {
    file_path: string;
    content: string;
    issueType: string;
    issueMessage: string;
    issueLocation: string;
    language: string;
    extraContext: string;
  }): Promise<CodeRepairResult> {
    const startTime = Date.now();
    let lastError: string | null = null;

    for (let attempt = 0; attempt < this.config.max_attempts; attempt++) {
      try {
        const prompt = PATCH_PROMPT_TEMPLATE.replace(/{{FILE_PATH}}/g, params.file_path)
          .replace(/{{FILE_CONTENT}}/g, params.content)
          .replace(/{{LANGUAGE}}/g, params.language)
          .replace(/{{ISSUE_TYPE}}/g, params.issueType)
          .replace(/{{ISSUE_MESSAGE}}/g, params.issueMessage)
          .replace(/{{ISSUE_LOCATION}}/g, params.issueLocation)
          .replace(/{{EXTRA_CONTEXT}}/g, params.extraContext);

        const modelId = this.config.routerEngine.selectModel(this.config.taskType ?? 'coding', prompt.length).model_id;

        const request: LLMRequest = {
          model_id: modelId,
          provider: this.config.routerEngine.selectModel(this.config.taskType ?? 'coding', prompt.length)
            .provider as ProviderId,
          messages: [
            {
              role: 'system',
              content:
                'You are a code repair specialist. Generate precise patch operations to fix issues. Return valid JSON.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 4096,
          response_format: 'json_object',
        };

        const { response } = await this.config.routerEngine.execute(this.config.taskType ?? 'coding', request);

        const patch = this.parsePatchResponse(response, params.file_path, params.language);
        if (patch) {
          return this.applyPatch(patch, params.content);
        }

        lastError = 'Failed to parse patch response';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const latency = Date.now() - startTime;
    this.config.metricsTracker?.recordRepair(false, latency);
    console.error(`Code repair failed for ${params.file_path} after ${this.config.max_attempts} attempts: ${lastError}`);
    return {
      file_path: params.file_path,
      original_content: params.content,
      patched_content: params.content,
      operations_applied: [],
      success: false,
      error: lastError ?? 'All repair attempts failed',
      latency_ms: latency,
    };
  }

  private parsePatchResponse(response: { content: string }, expectedPath: string, language: string): FilePatch | null {
    try {
      let content = response.content;
      if (content.startsWith('```')) {
        content = content.replace(/```[\w]*\n?/g, '').trim();
      }

      const parsed = JSON.parse(content) as { file_path?: string; operations?: PatchOperation[]; language?: string };

      if (!parsed.operations || !Array.isArray(parsed.operations) || parsed.operations.length === 0) {
        return null;
      }

      return {
        file_path: parsed.file_path ?? expectedPath,
        operations: parsed.operations.map((op) => ({
          type: op.type,
          target: op.target ?? '',
          content: op.content ?? '',
          line: op.line ?? null,
        })),
        language: parsed.language ?? language,
      };
    } catch {
      return null;
    }
  }

  private applyOperations(content: string, operations: PatchOperation[]): string {
    let result = content;

    for (const op of operations) {
      switch (op.type) {
        case 'replace':
          if (!result.includes(op.target)) {
            throw new Error(`Replace target not found: "${op.target.slice(0, 50)}..."`);
          }
          result = result.replace(op.target, op.content);
          break;

        case 'insert_before':
          if (!result.includes(op.target)) {
            throw new Error(`Insert target not found: "${op.target.slice(0, 50)}..."`);
          }
          result = result.replace(op.target, `${op.content}\n${op.target}`);
          break;

        case 'insert_after':
          if (!result.includes(op.target)) {
            throw new Error(`Insert target not found: "${op.target.slice(0, 50)}..."`);
          }
          result = result.replace(op.target, `${op.target}\n${op.content}`);
          break;

        case 'delete':
          if (!result.includes(op.target)) {
            throw new Error(`Delete target not found: "${op.target.slice(0, 50)}..."`);
          }
          result = result.replace(op.target, '');
          break;

        case 'append':
          result = `${result}\n${op.content}`;
          break;

        case 'prepend':
          result = `${op.content}\n${result}`;
          break;
      }
    }

    return result;
  }

  private inferLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      sql: 'sql',
      css: 'css',
      scss: 'scss',
      html: 'html',
      json: 'json',
      yml: 'yaml',
      yaml: 'yaml',
      md: 'markdown',
      dockerfile: 'dockerfile',
      sh: 'bash',
      env: 'text',
      gitignore: 'text',
    };
    return map[ext] ?? 'text';
  }
}
