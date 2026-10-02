import { getLLMConfig } from '../cli/config-manager.js';
import { ProviderFactory } from '../kernel/providers/provider-factory.js';
import { ApiKeyManager, RateLimitTracker, TokenUsageTracker } from '../kernel/providers/provider-types.js';
import type { LLMRequest } from '../kernel/llm/llm-types.js';

// This simulates a typical Hack-A-Gent coding phase prompt (much larger)
const LARGE_SYSTEM_PROMPT = `# Role: Expert Full-Stack Engineer

You are an expert full-stack engineer generating production-quality code for a hackathon project.

## Project Context
- **Project**: Foresight — an innovative general idea: a planning agent that stress-tests your architecture against realistic load patterns
- **Stack**: Next.js 14 (App Router), TypeScript, Tailwind CSS, SQLite (better-sqlite3), Vercel deployment
- **Architecture**: Single-repo Next.js app on SQLite, deployed to Vercel. One screen owns the core loop; sponsor APIs sit behind adapters.

## Technical Requirements
- Implement the core planning agent that stress-tests architecture
- Create API routes for load testing
- Build a React dashboard for visualizing results
- Integrate with sponsor APIs (if any)
- Ensure type safety with TypeScript
- Follow Next.js 14 App Router conventions
- Use Tailwind CSS for styling
- SQLite database with better-sqlite3 for persistence

## Code Quality Standards
- Write clean, modular, well-documented code
- Use proper TypeScript types (no \`any\`)
- Handle errors gracefully
- Follow React best practices (hooks, components)
- Optimize for performance
- Include proper validation

## Output Format
Return a JSON object with the following structure:
{
  "files": [
    {
      "path": "path/to/file.ts",
      "content": "// file content"
    }
  ],
  "dependencies": ["package1", "package2"],
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}`;

const LARGE_USER_PROMPT = `Generate the complete Next.js project structure for the Foresight planning agent. Include:

1. Package.json with all dependencies
2. Next.js configuration
3. TypeScript configuration
4. Tailwind configuration
5. Database schema and SQLite setup
6. API routes for load testing (/api/load-test, /api/results)
7. React components for the dashboard
8. Main page with the planning interface
9. Environment configuration
10. README with setup instructions

Focus on the core load testing engine and dashboard. The planning agent should accept a target URL, configuration (concurrency, duration, ramp-up), execute load tests, and display real-time results with charts.

Make it production-ready with proper error handling, validation, and TypeScript types.`;

async function testModelWithLargePrompt(model: string) {
  const llmConfig = getLLMConfig();
  process.env.NVIDIA_API_KEY = llmConfig.apiKey ?? '';

  const apiKeyManager = ProviderFactory.createApiKeyManager(
    llmConfig.baseUrl ? { baseUrls: { [llmConfig.provider]: llmConfig.baseUrl } } : undefined,
  );
  const rateLimitTracker = ProviderFactory.createRateLimitTracker();
  const tokenUsageTracker = ProviderFactory.createTokenUsageTracker();

  const provider = ProviderFactory.createLLMProvider(
    'nvidia',
    apiKeyManager,
    rateLimitTracker,
    tokenUsageTracker,
    llmConfig.baseUrl ? { baseUrls: { nvidia: llmConfig.baseUrl } } : undefined,
  );

  const promptChars = LARGE_SYSTEM_PROMPT.length + LARGE_USER_PROMPT.length;
  const promptTokens = Math.ceil(promptChars / 4);
  
  console.log(`\n=== Testing ${model} with LARGE prompt (${promptChars} chars, ~${promptTokens} tokens) ===`);

  const request: LLMRequest = {
    model_id: model,
    provider: 'nvidia',
    messages: [
      { role: 'system', content: LARGE_SYSTEM_PROMPT },
      { role: 'user', content: LARGE_USER_PROMPT },
    ],
    max_tokens: 8192,
    temperature: 0.3,
    response_format: 'json_object',
  };

  const startTime = Date.now();
  
  try {
    const response = await provider.execute(request);
    const elapsed = Date.now() - startTime;
    console.log(`SUCCESS: ${elapsed}ms - ${response.content.length} chars`);
    console.log(`  Latency: ${response.latency_ms}ms, Finish: ${response.finish_reason}`);
    return { success: true, elapsed, latency: response.latency_ms };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.log(`FAILURE: ${elapsed}ms - ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && 'status' in err) {
      console.log(`  Status: ${(err as any).status}`);
    }
    if (err instanceof Error && err.name === 'AbortError') {
      console.log(`  ERROR TYPE: AbortError (client-side timeout/abort)`);
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log(`  ERROR TYPE: DOMException AbortError (client-side timeout/abort)`);
    }
    return { success: false, elapsed, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log('=== NVIDIA Large Prompt Test (simulating Hack-A-Gent coding phase) ===');
  
  const models = [
    'stepfun-ai/step-3.7-flash',
    'minimaxai/minimax-m3',
    'meta/llama-3.1-70b-instruct',
    'meta/llama-3.1-8b-instruct',
  ];

  for (const model of models) {
    await testModelWithLargePrompt(model);
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(console.error);