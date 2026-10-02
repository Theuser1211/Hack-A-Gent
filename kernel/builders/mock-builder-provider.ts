import type { ArchitectureBlueprint } from '../planning/architect-types.js';

import type { BuilderProvider } from './builder-provider.js';
import type { GeneratedModule } from './builder-types.js';

export class MockBuilderProvider implements BuilderProvider {
  async generateFrontend(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const feTech = blueprint.recommended_stack.frontend[0]?.name ?? 'React';
    return {
      name: 'frontend',
      type: 'frontend',
      description: `Frontend application using ${feTech}`,
      files: [
        { path: 'src/frontend/App.tsx', content: this.renderAppComponent(feTech), language: 'tsx' },
        { path: 'src/frontend/main.tsx', content: this.renderMainEntry(feTech), language: 'tsx' },
        {
          path: 'src/frontend/styles/globals.css',
          content: '/* Global styles */\nbody { margin: 0; font-family: sans-serif; }',
          language: 'css',
        },
        {
          path: 'src/frontend/components/Header.tsx',
          content: 'export function Header() { return <header><h1>Hack-A-Gent Project</h1></header>; }',
          language: 'tsx',
        },
        {
          path: 'src/frontend/services/api.ts',
          content:
            'const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";\nexport async function fetchJSON<T>(path: string): Promise<T> { const res = await fetch(`${API_BASE}${path}`); return res.json(); }',
          language: 'ts',
        },
        {
          path: 'src/frontend/hooks/useAuth.ts',
          content:
            'export function useAuth() { return { user: null, login: async () => {}, logout: async () => {} }; }',
          language: 'ts',
        },
      ],
    };
  }

  async generateBackend(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const beTech = blueprint.recommended_stack.backend[0]?.name ?? 'Node.js';
    const isPython = beTech.toLowerCase().includes('python');
    return {
      name: 'backend',
      type: 'backend',
      description: `Backend API using ${beTech}`,
      files: isPython
        ? [
            {
              path: 'src/backend/main.py',
              content:
                'from fastapi import FastAPI\n\napp = FastAPI(title="Hack-A-Gent API")\n\n@app.get("/api/health")\nasync def health():\n    return {"status": "ok"}\n',
              language: 'python',
            },
            {
              path: 'src/backend/requirements.txt',
              content: 'fastapi==0.110.0\nuvicorn==0.27.0\nsqlalchemy==2.0.25\n',
              language: 'text',
            },
            {
              path: 'src/backend/models.py',
              content:
                'from sqlalchemy import Column, Integer, String, DateTime\nfrom database import Base\n\nclass User(Base):\n    __tablename__ = "users"\n    id = Column(Integer, primary_key=True)\n    email = Column(String, unique=True)\n',
              language: 'python',
            },
          ]
        : [
            {
              path: 'src/backend/src/index.ts',
              content:
                "import express from 'express';\nconst app = express();\napp.use(express.json());\napp.get('/api/health', (_req, res) => res.json({ status: 'ok' }));\nexport { app };",
              language: 'ts',
            },
            {
              path: 'src/backend/src/routes/auth.ts',
              content:
                "import { Router } from 'express';\nconst router = Router();\nrouter.post('/register', (req, res) => { res.json({ message: 'registered' }); });\nrouter.post('/login', (req, res) => { res.json({ token: 'mock-jwt' }); });\nexport default router;",
              language: 'ts',
            },
            {
              path: 'src/backend/src/models/User.ts',
              content: 'export interface User { id: string; email: string; name: string; created_at: Date; }',
              language: 'ts',
            },
            {
              path: 'src/backend/package.json',
              content: JSON.stringify(
                { name: 'hackagent-backend', version: '1.0.0', dependencies: { express: '^4.18.0' } },
                null,
                2,
              ),
              language: 'json',
            },
          ],
    };
  }

  async generateDatabase(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const engine = blueprint.database_schema.engine ?? 'PostgreSQL';
    const tables = blueprint.database_schema.tables ?? [];
    const migrationContent = tables
      .map((t) => {
        const cols = t.columns.map((c) => {
          const parts = [`"${c.name}"`, c.type];
          if (c.primary_key) parts.push('PRIMARY KEY');
          if (c.unique) parts.push('UNIQUE');
          if (!c.nullable) parts.push('NOT NULL');
          if (c.default) parts.push(`DEFAULT ${c.default}`);
          return parts.join(' ');
        });
        return `CREATE TABLE IF NOT EXISTS "${t.name}" (\n  ${cols.join(',\n  ')}\n);`;
      })
      .join('\n\n');

    return {
      name: 'database',
      type: 'database',
      description: `Database schema for ${engine}`,
      files: [
        {
          path: 'database/migrations/001_initial.sql',
          content: `-- ${engine} Migration\n-- Generated by Hack-A-Gent Architect\n\n${migrationContent}`,
          language: 'sql',
        },
        {
          path: 'database/seeds/001_sample_data.sql',
          content: "-- Sample seed data\n-- INSERT INTO users (email, name) VALUES ('user@example.com', 'Test User');",
          language: 'sql',
        },
        {
          path: 'database/schema.ts',
          content:
            "export const DB_CONFIG = {\n  host: process.env.DB_HOST ?? 'localhost',\n  port: Number(process.env.DB_PORT ?? 5432),\n  database: process.env.DB_NAME ?? 'hackagent',\n  user: process.env.DB_USER ?? 'postgres',\n  password: process.env.DB_PASSWORD ?? '',\n};",
          language: 'ts',
        },
      ],
    };
  }

  async generateConfig(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return {
      name: 'config',
      type: 'config',
      description: 'Project configuration files',
      files: [
        {
          path: '.env.example',
          content:
            '# Environment Variables\nNODE_ENV=development\nPORT=3000\nDATABASE_URL=postgresql://localhost:5432/hackagent\nJWT_SECRET=change-me\n',
          language: 'text',
        },
        {
          path: 'docker-compose.yml',
          content:
            'version: "3.8"\nservices:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n    environment:\n      - DATABASE_URL=postgresql://postgres:postgres@db:5432/hackagent\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_DB: hackagent\n      POSTGRES_PASSWORD: postgres\n    ports:\n      - "5432:5432"\n',
          language: 'yaml',
        },
        {
          path: 'Dockerfile',
          content:
            'FROM node:20-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD ["npm", "start"]\n',
          language: 'dockerfile',
        },
        { path: '.gitignore', content: 'node_modules/\ndist/\n.env\n*.log\n.workspace/\n', language: 'text' },
        {
          path: 'tsconfig.json',
          content: JSON.stringify(
            {
              compilerOptions: {
                target: 'ES2022',
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                strict: true,
                outDir: 'dist',
                rootDir: 'src',
              },
              include: ['src'],
            },
            null,
            2,
          ),
          language: 'json',
        },
      ],
    };
  }

  async generateDocumentation(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return {
      name: 'docs',
      type: 'docs',
      description: 'Project documentation',
      files: [
        {
          path: 'README.md',
          content: `# ${blueprint.project_name}\n\n> Generated by Hack-A-Gent\n\n## Stack\n- Frontend: ${blueprint.recommended_stack.frontend.map((t) => t.name).join(', ')}\n- Backend: ${blueprint.recommended_stack.backend.map((t) => t.name).join(', ')}\n- Database: ${blueprint.recommended_stack.database.map((t) => t.name).join(', ')}\n\n## Getting Started\n\n1. Clone the repository\n2. Copy \`.env.example\` to \`.env\` and fill in values\n3. Run \`docker-compose up\`\n4. Open http://localhost:3000\n\n## Project Structure\n\nSee the architecture blueprint for full details.\n`,
          language: 'markdown',
        },
        {
          path: 'docs/api.md',
          content: `# API Documentation\n\n## Endpoints\n${blueprint.api_contracts.endpoints.map((e) => `- \`${e.method} ${e.path}\`: ${e.description}`).join('\n')}\n`,
          language: 'markdown',
        },
      ],
    };
  }

  async generateTests(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return {
      name: 'tests',
      type: 'tests',
      description: 'Test suites',
      files: [
        {
          path: 'tests/unit/example.test.ts',
          content:
            "import { describe, it, expect } from 'vitest';\n\ndescribe('Example', () => {\n  it('should pass', () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n",
          language: 'ts',
        },
        {
          path: 'tests/integration/api.test.ts',
          content:
            "import { describe, it, expect } from 'vitest';\n\ndescribe('API', () => {\n  it('health endpoint returns ok', async () => {\n    const res = await fetch('/api/health');\n    expect(res.status).toBe(200);\n  });\n});\n",
          language: 'ts',
        },
      ],
    };
  }

  private renderAppComponent(feTech: string): string {
    if (feTech.toLowerCase().includes('next')) {
      return 'import Link from \'next/link\';\nexport default function App() {\n  return <div><h1>Hack-A-Gent Project</h1><Link href="/about">About</Link></div>;\n}';
    }
    return "import React from 'react';\nexport function App() {\n  return <div><h1>Hack-A-Gent Project</h1></div>;\n}";
  }

  private renderMainEntry(feTech: string): string {
    if (feTech.toLowerCase().includes('next')) {
      return "// Next.js App Router entry\nexport { default } from './App';";
    }
    return "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport { App } from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);";
  }
}
