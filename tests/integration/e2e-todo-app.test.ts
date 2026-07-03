import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import { GeneratedRepositorySchema } from '../../kernel/builders/builder-types.js';
import { RepositoryValidator } from '../../kernel/builders/repository-validator.js';
import { DefaultBuildExecutor } from '../../kernel/execution/build-executor.js';
import { DefaultRepositoryMaterializer } from '../../kernel/execution/repository-materializer.js';
import { DefaultWorkspaceProvisioner } from '../../kernel/execution/workspace-provisioner.js';
import { LLMBuilderProvider } from '../../kernel/generation/llm-builder-provider.js';
import type { LLMProvider } from '../../kernel/llm/llm-provider.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';

const TODO_ARCHITECTURE_BLUEPRINT: ArchitectureBlueprint = {
  project_name: 'TodoApp',
  version: '1.0.0',
  summary: 'A simple Todo application with React frontend and Express backend',
  recommended_stack: {
    frontend: [{ name: 'React', version: '18', purpose: 'UI framework', alternatives: [] }],
    backend: [{ name: 'Node.js', version: '20', purpose: 'Runtime', alternatives: [] }],
    database: [{ name: 'PostgreSQL', purpose: 'Primary DB', alternatives: [] }],
    infrastructure: [],
    tooling: [],
  },
  folder_structure: {
    root: 'src',
    entries: [
      { path: 'frontend', type: 'dir', children: [] },
      { path: 'backend', type: 'dir', children: [] },
    ],
  },
  database_schema: {
    engine: 'PostgreSQL',
    tables: [
      {
        name: 'todos',
        columns: [
          { name: 'id', type: 'SERIAL', primary_key: true, nullable: false, unique: false },
          { name: 'title', type: 'VARCHAR(255)', primary_key: false, nullable: false, unique: false },
          { name: 'completed', type: 'BOOLEAN', primary_key: false, default: 'false', nullable: false, unique: false },
          {
            name: 'created_at',
            type: 'TIMESTAMP',
            primary_key: false,
            default: 'NOW()',
            nullable: false,
            unique: false,
          },
        ],
        indexes: [],
      },
    ],
    relationships: [],
  },
  api_contracts: {
    base_url: '/api',
    endpoints: [
      {
        method: 'GET',
        path: '/api/todos',
        description: 'List all todos',
        auth_required: false,
        query_params: [],
        path_params: [],
        error_responses: [],
      },
      {
        method: 'POST',
        path: '/api/todos',
        description: 'Create a todo',
        auth_required: false,
        query_params: [],
        path_params: [],
        error_responses: [],
      },
      {
        method: 'PUT',
        path: '/api/todos/:id',
        description: 'Update a todo',
        auth_required: false,
        query_params: [],
        path_params: [{ name: 'id', type: 'number', description: 'Todo ID' }],
        error_responses: [],
      },
      {
        method: 'DELETE',
        path: '/api/todos/:id',
        description: 'Delete a todo',
        auth_required: false,
        query_params: [],
        path_params: [{ name: 'id', type: 'number', description: 'Todo ID' }],
        error_responses: [],
      },
    ],
    auth_scheme: 'none',
  },
  frontend_modules: [
    {
      name: 'TodoList',
      description: 'Main todo list component',
      components: [{ name: 'TodoList', description: 'Displays todos', props: [], dependencies: [] }],
      services: ['api'],
    },
    {
      name: 'TodoForm',
      description: 'Add todo form',
      components: [{ name: 'TodoForm', description: 'Form to add new todos', props: [], dependencies: [] }],
      services: [],
    },
  ],
  backend_modules: [
    {
      name: 'todos',
      description: 'Todo CRUD operations',
      endpoints: ['/api/todos', '/api/todos/:id'],
      dependencies: ['express'],
      environment_variables: [],
    },
  ],
  milestones: [],
  execution_graph: {
    nodes: [{ id: 'm1', label: 'Build', type: 'task', depends_on: [] }],
    edges: [],
    entry_point: 'm1',
  },
  required_skills: [],
  risks: [],
  human_checkpoints: [],
  generated_at: new Date().toISOString(),
  architect_version: '1.0.0',
};

function createMockLLMProvider(): LLMProvider {
  let callCount = 0;
  return {
    providerId: 'local',
    getModels: () => [
      {
        model_id: 'e2e-model',
        provider: 'local' as const,
        capabilities: ['code_generation', 'json_output'],
        context_window: 128000,
        supports_json_mode: true,
        supports_tool_calling: false,
        typical_latency_ms: 10,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
      },
    ],
    getHealth: () => ({
      provider_id: 'local' as const,
      status: 'healthy' as const,
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 0,
    }),
    execute: vi.fn().mockImplementation(async () => {
      callCount++;
      const responses: Record<string, string> = {
        'App.tsx':
          'import React from "react";\nexport function App() {\n  const [todos, setTodos] = React.useState<Array<{id: number; title: string; completed: boolean}>>([]);\n  return <div><h1>Todo App</h1></div>;\n}',
        'main.tsx':
          'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport { App } from "./App";\nReactDOM.createRoot(document.getElementById("root")!).render(<App />);',
        'globals.css':
          'body { margin: 0; font-family: sans-serif; }\n.container { max-width: 800px; margin: 0 auto; padding: 20px; }',
        'Header.tsx': 'export function Header() {\n  return <header><h1>Todo App</h1></header>;\n}',
        'api.ts':
          'const API_BASE = "/api";\nexport async function fetchTodos() {\n  const res = await fetch(`${API_BASE}/todos`);\n  if (!res.ok) throw new Error("Failed to fetch");\n  return res.json();\n}\nexport async function createTodo(title: string) {\n  const res = await fetch(`${API_BASE}/todos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });\n  return res.json();\n}\nexport async function deleteTodo(id: number) {\n  await fetch(`${API_BASE}/todos/${id}`, { method: "DELETE" });\n}',
        'backend/src/index.ts':
          'import express from "express";\nconst app = express();\napp.use(express.json());\napp.get("/api/todos", async (_req, res) => {\n  res.json([{ id: 1, title: "Sample todo", completed: false }]);\n});\napp.post("/api/todos", async (req, res) => {\n  const { title } = req.body;\n  res.status(201).json({ id: Date.now(), title, completed: false });\n});\napp.put("/api/todos/:id", async (req, res) => {\n  res.json({ id: Number(req.params.id), ...req.body });\n});\napp.delete("/api/todos/:id", async (_req, res) => {\n  res.status(204).send();\n});\nexport { app };',
        'routes/index.ts':
          'import { Router } from "express";\nconst router = Router();\nrouter.get("/todos", async (_req, res) => {\n  res.json([{ id: 1, title: "Todo", completed: false }]);\n});\nrouter.post("/todos", async (req, res) => {\n  res.status(201).json({ id: 2, title: req.body.title, completed: false });\n});\nrouter.put("/todos/:id", async (req, res) => {\n  res.json({ id: Number(req.params.id), title: req.body.title, completed: req.body.completed ?? false });\n});\nrouter.delete("/todos/:id", async (req, res) => {\n  res.status(204).send();\n});\nexport default router;',
        'models/index.ts':
          'export interface Todo {\n  id: number;\n  title: string;\n  completed: boolean;\n  created_at: Date;\n}\nexport type CreateTodoInput = Pick<Todo, "title">;\nexport type UpdateTodoInput = Partial<Pick<Todo, "title" | "completed">>;',
        '001_initial.sql':
          'CREATE TABLE IF NOT EXISTS todos (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(255) NOT NULL,\n  completed BOOLEAN DEFAULT false,\n  created_at TIMESTAMP DEFAULT NOW()\n);\nCREATE INDEX idx_todos_completed ON todos(completed);',
        '001_sample_data.sql':
          "INSERT INTO todos (title, completed) VALUES\n  ('Buy groceries', false),\n  ('Walk the dog', true),\n  ('Write docs', false);",
        'schema.ts':
          'export const DB_CONFIG = {\n  host: process.env.DB_HOST ?? "localhost",\n  port: Number(process.env.DB_PORT ?? 5432),\n  database: process.env.DB_NAME ?? "todos",\n  user: process.env.DB_USER ?? "postgres",\n  password: process.env.DB_PASSWORD ?? "",\n};',
        'todos.ts':
          'import type { Todo, CreateTodoInput, UpdateTodoInput } from "./types";\nexport class TodoModel {\n  private items: Todo[] = [];\n  async findAll(): Promise<Todo[]> { return this.items; }\n  async create(input: CreateTodoInput): Promise<Todo> {\n    const todo: Todo = { id: this.items.length + 1, title: input.title, completed: false, created_at: new Date() };\n    this.items.push(todo);\n    return todo;\n  }\n  async update(id: number, input: UpdateTodoInput): Promise<Todo | null> {\n    const idx = this.items.findIndex((t) => t.id === id);\n    if (idx === -1) return null;\n    this.items[idx] = { ...this.items[idx], ...input };\n    return this.items[idx]!;\n  }\n  async delete(id: number): Promise<boolean> {\n    const idx = this.items.findIndex((t) => t.id === id);\n    if (idx === -1) return false;\n    this.items.splice(idx, 1);\n    return true;\n  }\n}',
        'index.ts': 'export { app } from "./src/index";',
        'babel.config.js':
          'module.exports = {\n  presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-typescript"],\n};',
        'example.test.ts':
          'import { describe, it, expect } from "vitest";\ndescribe("Todo App", () => {\n  it("should pass", () => {\n    expect(1 + 1).toBe(2);\n  });\n  it("todo structure", () => {\n    const todo = { id: 1, title: "Test", completed: false };\n    expect(todo).toHaveProperty("id");\n    expect(todo).toHaveProperty("title");\n    expect(todo).toHaveProperty("completed");\n  });\n});',
        'api.test.ts':
          'import { describe, it, expect } from "vitest";\ndescribe("Todo API", () => {\n  it("todo has required fields", () => {\n    const todo = { id: 1, title: "Test todo", completed: false, created_at: new Date() };\n    expect(todo.id).toBeDefined();\n    expect(todo.title).toBeDefined();\n    expect(todo.completed).toBeDefined();\n  });\n});',
        'TodoList.test.ts':
          'import { describe, it, expect } from "vitest";\ndescribe("TodoList", () => {\n  it("renders without crashing", () => {\n    expect(true).toBe(true);\n  });\n});',
        'todos.test.ts':
          'import { describe, it, expect } from "vitest";\ndescribe("Todos API", () => {\n  it("handles todo CRUD", () => {\n    const todo = { id: 1, title: "Test", completed: false };\n    expect(todo.id).toBe(1);\n  });\n});',
        'README.md':
          '# TodoApp\nA simple Todo application built with React and Express.\n## Getting Started\n1. Install dependencies\n2. Start the backend\n3. Start the frontend\n',
        'api.md':
          '# API Documentation\n## Endpoints\n- GET /api/todos: List all todos\n- POST /api/todos: Create a todo\n- PUT /api/todos/:id: Update a todo\n- DELETE /api/todos/:id: Delete a todo\n',
        'architecture.md':
          '# Architecture\nTodoApp uses React for the frontend and Express for the backend with PostgreSQL as the database.\n',
        '.env.example': 'NODE_ENV=development\nPORT=3001\nDATABASE_URL=postgresql://localhost:5432/todos\n',
        'tsconfig.json':
          '{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "NodeNext",\n    "moduleResolution": "NodeNext",\n    "strict": true,\n    "outDir": "dist",\n    "rootDir": "src",\n    "esModuleInterop": true\n  },\n  "include": ["src"]\n}',
        'package.json':
          '{\n  "name": "todo-app",\n  "version": "1.0.0",\n  "private": true,\n  "scripts": {\n    "start": "node dist/index.js",\n    "build": "tsc",\n    "dev": "ts-node src/index.ts"}, "dependencies": {"express": "^4.18.0", "cors": "^2.8.5"}, "devDependencies": {"typescript": "^5.3.0", "@types/express": "^4.17.0", "@types/node": "^20.0.0", "vitest": "^1.0.0"}}',
        'docker-compose.yml':
          'version: "3.8"\nservices:\n  app:\n    build: .\n    ports:\n      - "3001:3001"\n    environment:\n      - DATABASE_URL=postgresql://postgres:postgres@db:5432/todos\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_DB: todos\n      POSTGRES_PASSWORD: postgres\n',
        Dockerfile:
          'FROM node:20-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install\nCOPY . .\nRUN npm run build\nEXPOSE 3001\nCMD ["node", "dist/index.js"]\n',
        '.gitignore': 'node_modules/\ndist/\n.env\n*.log\n.workspace/\n',
      };

      const paths = Object.keys(responses);
      const idx = (callCount - 1) % paths.length;
      const filePath = paths[idx]!;
      const content = responses[filePath]!;

      return {
        content: JSON.stringify({
          path: `src/frontend/${filePath}`,
          content,
          language:
            filePath.endsWith('.ts') || filePath.endsWith('.tsx')
              ? 'typescript'
              : filePath.endsWith('.css')
                ? 'css'
                : 'text',
          dependencies: [],
          exports: [{ name: 'default', type: 'function' }],
          imports: [],
        }),
        model_id: 'e2e-model',
        provider: 'local' as const,
        usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        finish_reason: 'stop',
        latency_ms: 10,
      };
    }),
  };
}

describe('E2E: Todo App Pipeline', () => {
  let tmpDir: string;
  let provider: LLMBuilderProvider;
  let router: RouterEngine;
  let validator: RepositoryValidator;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-e2e-todo-'));
    const mockProvider = createMockLLMProvider();
    router = new RouterEngine(
      [mockProvider],
      {},
      { coding: { preferred: 'e2e-model', fallback: 'e2e-model', emergency: 'e2e-model' } },
    );
    provider = new LLMBuilderProvider({ router, taskType: 'coding', selfRepairConfig: { max_attempts: 1 } });
    validator = new RepositoryValidator();
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1. generates all modules with LLMBuilderProvider', async () => {
    const modules = await Promise.all([
      provider.generateFrontend(TODO_ARCHITECTURE_BLUEPRINT),
      provider.generateBackend(TODO_ARCHITECTURE_BLUEPRINT),
      provider.generateDatabase(TODO_ARCHITECTURE_BLUEPRINT),
      provider.generateConfig(TODO_ARCHITECTURE_BLUEPRINT),
      provider.generateDocumentation(TODO_ARCHITECTURE_BLUEPRINT),
      provider.generateTests(TODO_ARCHITECTURE_BLUEPRINT),
    ]);

    for (const mod of modules) {
      expect(mod.files.length).toBeGreaterThan(0);
    }

    const totalFiles = modules.reduce((s, m) => s + m.files.length, 0);
    const totalLines = modules.reduce((s, m) => s + m.files.reduce((fs, f) => fs + f.content.split('\n').length, 0), 0);

    const repository = {
      project_name: 'TodoApp',
      blueprint_version: '1.0.0',
      modules,
      total_files: totalFiles,
      total_lines: totalLines,
      generated_at: new Date().toISOString(),
      build_results: [],
    };

    const parsed = GeneratedRepositorySchema.safeParse(repository);
    expect(parsed.success).toBe(true);

    const validation = validator.validate(repository);
    expect(validation.valid).toBe(true);
    expect(validation.total_files).toBeGreaterThan(10);
  });

  it('2. validates generated files have real content', async () => {
    const fe = await provider.generateFrontend(TODO_ARCHITECTURE_BLUEPRINT);
    for (const file of fe.files) {
      expect(file.content.length).toBeGreaterThan(10);
      expect(file.content).not.toContain('MockBuilderProvider');
    }

    const be = await provider.generateBackend(TODO_ARCHITECTURE_BLUEPRINT);
    for (const file of be.files) {
      expect(file.content.length).toBeGreaterThan(10);
    }

    const db = await provider.generateDatabase(TODO_ARCHITECTURE_BLUEPRINT);
    const hasSql = db.files.some((f) => f.path.endsWith('.sql'));
    expect(hasSql).toBe(true);
  });

  it('3. materializes generated files to disk', async () => {
    const modules = await Promise.all([
      provider.generateFrontend(TODO_ARCHITECTURE_BLUEPRINT),
      provider.generateBackend(TODO_ARCHITECTURE_BLUEPRINT),
      provider.generateDatabase(TODO_ARCHITECTURE_BLUEPRINT),
      provider.generateConfig(TODO_ARCHITECTURE_BLUEPRINT),
    ]);

    const materializer = new DefaultRepositoryMaterializer();
    const allFiles = modules.flatMap((m) => m.files.map((f) => ({ path: f.path, content: f.content })));
    const repository = {
      project_name: 'TodoApp',
      blueprint_version: '1.0.0',
      modules: modules as any,
      total_files: allFiles.length,
      total_lines: allFiles.reduce((s: number, f: { content: string }) => s + f.content.split('\n').length, 0),
      generated_at: new Date().toISOString(),
      build_results: [],
    };

    const result = await materializer.materialize(repository as any, tmpDir);

    expect(result.success).toBe(true);
    expect(result.files_written.length).toBeGreaterThan(0);
    expect(result.root_path).toBe(tmpDir);

    for (const filePath of result.files_written) {
      const fullPath = path.join(tmpDir, filePath);
      expect(existsSync(fullPath)).toBe(true);
      const written = readFileSync(fullPath, 'utf-8');
      expect(written.length).toBeGreaterThan(0);
    }
  });

  it('4. materialization handles workspace provisioner', async () => {
    const provisioner = new DefaultWorkspaceProvisioner(tmpDir);
    const workspace = await provisioner.createWorkspace('e2e-test');
    expect(existsSync(workspace.root_path)).toBe(true);

    const mod = await provider.generateFrontend(TODO_ARCHITECTURE_BLUEPRINT);
    const materializer = new DefaultRepositoryMaterializer();
    const allFiles = mod.files.map((f: { path: string; content: string }) => ({ path: f.path, content: f.content }));
    const repository = {
      project_name: 'TodoApp',
      blueprint_version: '1.0.0',
      modules: [mod] as any,
      total_files: allFiles.length,
      total_lines: allFiles.reduce((s: number, f: { content: string }) => s + f.content.split('\n').length, 0),
      generated_at: new Date().toISOString(),
      build_results: [],
    };

    const result = await materializer.materialize(repository as any, workspace.project_path);
    expect(result.success).toBe(true);
    expect(result.files_written.length).toBeGreaterThan(0);

    await provisioner.cleanup(workspace.root_path);
    expect(existsSync(workspace.root_path)).toBe(false);
  });
});
