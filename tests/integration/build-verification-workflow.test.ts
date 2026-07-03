import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BuildVerificationAgent } from '../../agents/build-verification-v1.js';
import type { GeneratedRepository } from '../../kernel/builders/builder-types.js';
import { DefaultBuildExecutor } from '../../kernel/execution/build-executor.js';
import { DefaultRepositoryMaterializer } from '../../kernel/execution/repository-materializer.js';
import { DefaultWorkspaceProvisioner } from '../../kernel/execution/workspace-provisioner.js';
import type { Task } from '../../kernel/tasks/task-entity.js';

function makeRepo(files: Array<{ path: string; content: string }>): GeneratedRepository {
  return {
    project_name: 'integration-test',
    blueprint_version: '1.0.0',
    modules: [
      {
        name: 'app',
        type: 'frontend',
        files,
        description: '',
      },
    ],
    total_files: files.length,
    total_lines: files.reduce((s, f) => s + f.content.split('\n').length, 0),
    generated_at: new Date().toISOString(),
    build_results: [],
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    task_id: 'int-build-001',
    project_id: 'int-proj-001',
    type: 'implementation',
    description: 'Integration build verification',
    parent_task_id: null,
    creator_agent: 'test',
    assigned_agent: null,
    priority: 'high' as const,
    status: 'PENDING' as const,
    dependencies: [],
    retries: { max_retries: 3, backoff_ms: 1000, current_attempt: 0 },
    checkpoint_required: false,
    required_skills: [],
    input: {},
    expected_outputs: [],
    error: null,
    acceptance_criteria: [
      {
        criterion_id: 'ac-int-1',
        description: 'Build passes',
        verification_method: 'automated_test' as const,
        verified: false,
      },
    ],
    timestamps: {
      created_at: new Date().toISOString(),
      assigned_at: null,
      started_at: null,
      completed_at: null,
      deadline: null,
    },
    ...overrides,
  };
}

describe('Build Verification Integration', () => {
  let tmpDir: string;
  let workspaceProvisioner: DefaultWorkspaceProvisioner;
  let agent: BuildVerificationAgent;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-verify-int-'));
    workspaceProvisioner = new DefaultWorkspaceProvisioner(tmpDir);
    agent = new BuildVerificationAgent({
      materializer: new DefaultRepositoryMaterializer(tmpDir),
      provisioner: workspaceProvisioner,
      buildExecutor: new DefaultBuildExecutor(),
      devServerExecutor: {
        start: async () => ({
          pid: null,
          port: null,
          url: 'http://localhost:3000',
          ready: true,
          process_path: 'echo',
          started_at: new Date().toISOString(),
          project_path: '',
        }),
        stop: async () => {},
        isRunning: async () => false,
      },
      agentId: 'test.build.verification',
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best effort
    }
  });

  it('materializes files to correct paths', async () => {
    const materializer = new DefaultRepositoryMaterializer(tmpDir);
    const repo = makeRepo([
      { path: 'src/app.ts', content: 'export const a = 1;' },
      { path: 'src/utils/helper.ts', content: 'export const b = 2;' },
    ]);

    const result = await materializer.materialize(repo, 'integration-output');
    expect(result.success).toBe(true);
    expect(result.files_written).toHaveLength(2);
    expect(result.files_written).toContain('src/app.ts');
    expect(result.files_written).toContain('src/utils/helper.ts');

    const appContent = fs.readFileSync(path.join(tmpDir, 'integration-output', 'src', 'app.ts'), 'utf-8');
    expect(appContent).toBe('export const a = 1;');
  });

  it('creates workspace and project directories', async () => {
    const workspace = await workspaceProvisioner.createWorkspace('int-test');
    const rootExists = fs.existsSync(workspace.root_path);
    const projectExists = fs.existsSync(workspace.project_path);
    expect(rootExists).toBe(true);
    expect(projectExists).toBe(true);

    await workspaceProvisioner.cleanup(workspace.root_path);
  });

  it('handles empty repository', async () => {
    const repo = makeRepo([]);

    const result = await agent.executeTask(makeTask({ input: { repository: repo, project_name: 'integration-test' } }));
    expect(result.status).toBe('COMPLETED');
  });

  it('cleans up workspace after completion', { timeout: 30000 }, async () => {
    const repo = makeRepo([{ path: 'package.json', content: JSON.stringify({ name: 'test', version: '1.0.0' }) }]);
    await agent.executeTask(makeTask({ input: { repository: repo, project_name: 'integration-test' } }));

    const dirs = fs.readdirSync(tmpDir);
    const activeWorkspaces = dirs.filter((d) => d.startsWith('build-integration-test'));
    expect(activeWorkspaces.length).toBe(0);
  });
});
