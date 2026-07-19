// Static data extracted from internet-hackathon-orchestrator.ts.
// These are pure data constants — no logic. Imported verbatim by the orchestrator.

export const KNOWN_PACKAGE_VERSIONS: Record<string, string> = { uuid: '^9.0.0', 'styled-components': '^6.0.0', 'swr': '^2.0.0', zustand: '^4.0.0', 'react-hook-form': '^7.0.0', 'react-query': '^3.0.0', '@tanstack/react-query': '^5.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0', stripe: '^14.0.0', openai: '^4.0.0', langchain: '^0.2.0', 'react-markdown': '^9.0.0', 'react-syntax-highlighter': '^15.0.0', date: 'npm:date-fns@^3.0.0', 'date-fns': '^3.0.0', lodash: '^4.0.0', axios: '^1.7.0', tailwindcss: '^3.4.0', postcss: '^8.4.0', autoprefixer: '^10.4.0', express: '^4.18.0', '@types/express': '^4.17.0', mongoose: '^8.0.0', cors: '^2.8.0', dotenv: '^16.0.0' };

export const KNOWN_PACKAGE_VERSIONS_FALLBACK: Record<string, string> = { tailwindcss: '^3.4.0', postcss: '^8.4.0', autoprefixer: '^10.4.0', express: '^4.18.0', '@types/express': '^4.17.0', mongoose: '^8.0.0', cors: '^2.8.0', dotenv: '^16.0.0', axios: '^1.7.0', uuid: '^9.0.0', 'react-hook-form': '^7.0.0', zustand: '^4.0.0', 'react-query': '^3.0.0', '@tanstack/react-query': '^5.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0', stripe: '^14.0.0', openai: '^4.0.0', 'react-markdown': '^9.0.0', 'react-syntax-highlighter': '^15.0.0', 'date-fns': '^3.0.0', lodash: '^4.0.0', 'next-auth': '^4.24.0', '@types/cors': '^2.8.0', 'socket.io': '^4.7.0', 'socket.io-client': '^4.7.0' };

export const LLM_GENERATION_SYSTEM_PROMPT = `You are an expert full-stack TypeScript developer building a hackathon project. You generate production-quality code that builds without errors.

RULES:
- Use 'export default' for all React components and page files
- Use 'export default function ComponentName()' pattern (NOT named exports)
- For type imports, use 'import type { X } from "..."' or 'export type { X }'
- Define types inline in the same file — do NOT create separate type files
- Every component with children must accept '{ children: React.ReactNode }' prop
- Never use 'import { X } from "@/types/..."' — define types locally
- Use semicolons between statements and newlines between functions
- ALL component files MUST go under src/components/
- ALL page files MUST go under src/app/ (Next.js App Router)
- ALL API routes MUST go under src/app/api/
- Import components using: import ComponentName from '@/components/ComponentName'
- Use the @/ alias which maps to src/

OUTPUT FORMAT: Return ONLY valid JSON. No markdown, no explanation, no code fences.
{
  "files": [
    {
      "path": "relative/path/filename.tsx",
      "content": "file content here"
    }
  ]
}

CONFIG / IMPORT RULES:
- If you import from @/config, you MUST generate src/config.ts with safe defaults.
- If you import from @/lib/*, @/hooks/*, @/utils/*, @/constants/*, @/types/*, etc., you MUST generate those target files in the same response.
- NEVER leave an import pointing at a file that does not exist in the generated file list.
- If environment variables are used, generate .env.example documenting them.
- Generate src/config.ts and .env.example for any API keys, secrets, or configuration values.
`;

// The `frontend`, `backend`, `database` entries embed `${context.specificTask}`.
// At module scope that identifier is unavailable, so the placeholder `{specificTask}`
// is used here and substituted at the (single) call site, preserving exact runtime output.
export const LLM_TASK_DESCRIPTIONS: Record<string, string> = {
  scaffold: 'Generate the complete project scaffold including package.json, tsconfig.json, next.config.js, src/app/layout.tsx, src/app/page.tsx, .gitignore, and any other essential config files.',
  frontend: `Generate frontend React/Next.js component code for: {specificTask}. Include actual implementation, not stubs.`,
  backend: `Generate backend API code for: {specificTask}. Include Next.js API routes with real handlers.`,
  database: `Generate database schema and configuration for: {specificTask}. Include SQL schemas and ORM models.`,
  config: `Generate configuration files for the project.`,
};
