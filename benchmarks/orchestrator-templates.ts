// Static data extracted from internet-hackathon-orchestrator.ts.
// These are pure data constants — no logic. Imported verbatim by the orchestrator.

export const KNOWN_PACKAGE_VERSIONS: Record<string, string> = { uuid: '^9.0.0', 'styled-components': '^6.0.0', 'swr': '^2.0.0', zustand: '^4.0.0', 'react-hook-form': '^7.0.0', 'react-query': '^3.0.0', '@tanstack/react-query': '^5.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0', stripe: '^14.0.0', openai: '^4.0.0', langchain: '^0.2.0', 'react-markdown': '^9.0.0', 'react-syntax-highlighter': '^15.0.0', date: 'npm:date-fns@^3.0.0', 'date-fns': '^3.0.0', lodash: '^4.0.0', axios: '^1.7.0', tailwindcss: '^3.4.0', postcss: '^8.4.0', autoprefixer: '^10.4.0', express: '^4.18.0', '@types/express': '^4.17.0', mongoose: '^8.0.0', cors: '^2.8.0', dotenv: '^16.0.0' };

export const KNOWN_PACKAGE_VERSIONS_FALLBACK: Record<string, string> = { tailwindcss: '^3.4.0', postcss: '^8.4.0', autoprefixer: '^10.4.0', express: '^4.18.0', '@types/express': '^4.17.0', mongoose: '^8.0.0', cors: '^2.8.0', dotenv: '^16.0.0', axios: '^1.7.0', uuid: '^9.0.0', 'react-hook-form': '^7.0.0', zustand: '^4.0.0', 'react-query': '^3.0.0', '@tanstack/react-query': '^5.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0', stripe: '^14.0.0', openai: '^4.0.0', 'react-markdown': '^9.0.0', 'react-syntax-highlighter': '^15.0.0', 'date-fns': '^3.0.0', lodash: '^4.0.0', 'next-auth': '^4.24.0', '@types/cors': '^2.8.0', 'socket.io': '^4.7.0', 'socket.io-client': '^4.7.0' };

export const LLM_GENERATION_SYSTEM_PROMPT = `You are building a hackathon project that must ship in under 5 hours.

GOAL: A working demo that judges can see and interact with. Not production perfection.

RULES:
- Generate the MINIMUM number of files needed. Merge code into existing files instead of creating new ones.
- Export default for components. Define types inline. { children: React.ReactNode }
- Import with @/ alias. Generate every imported file. NEVER leave dangling imports.
- SEMICOLONS. Newlines between functions.

OUTPUT: Return ONLY JSON (no markdown, no fences):
{ "files": [{ "path": "...", "content": "..." }] }

PRIORITIES:
1. Working demo — judges can click through it
2. Visible sponsor API integration
3. Clean enough UI
4. README that explains what you built

One fully working page beats 5 half-finished ones.
`;

// The `frontend`, `backend`, `database` entries embed `${context.specificTask}`.
// At module scope that identifier is unavailable, so the placeholder `{specificTask}`
// is used here and substituted at the (single) call site, preserving exact runtime output.
export const LLM_TASK_DESCRIPTIONS: Record<string, string> = {
  scaffold: 'Generate the minimum project scaffold: package.json, tsconfig.json, src/app/layout.tsx, src/app/page.tsx, .gitignore, README.md. No extra configs or components.',
  frontend: `Generate frontend code for: {specificTask}. ONE file per component. Merge into existing files when possible.`,
  backend: `Generate API route for: {specificTask}. ONE file per route. Use Next.js App Router API routes.`,
  database: `Generate database schema for: {specificTask}. Single schema file.`,
  config: `Generate one config file.`,
};
