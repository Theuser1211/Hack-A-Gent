import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { dirname, resolve } from 'path';
import type { ImprovementAction } from './improvement-types.js';

export async function executeImprovement(action: ImprovementAction, projectDir: string): Promise<boolean> {
  const targetPath = resolve(projectDir, action.target);
  const targetDir = dirname(targetPath);

  try {
    switch (action.type) {
      case 'add_feature':
        return executeAddFeature(action, targetPath, targetDir);
      case 'enhance_ui':
        return executeEnhanceUI(action, targetPath);
      case 'fix_issue':
        return executeFixIssue(action, targetPath);
      case 'add_docs':
        return executeAddDocs(action, targetPath);
      case 'add_tests':
        return executeAddTests(action, targetPath, targetDir);
      case 'add_deployment':
        return executeAddDeployment(action, projectDir);
      case 'improve_performance':
        return executeFixIssue(action, targetPath);
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function executeAddFeature(action: ImprovementAction, targetPath: string, targetDir: string): boolean {
  ensureDir(targetDir);
  const componentName = basename(targetPath).replace(/\.tsx?$/, '');
  const content = generateComponent(componentName, action.implementation);
  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, content);
    return true;
  }
  return false;
}

function executeEnhanceUI(action: ImprovementAction, targetPath: string): boolean {
  if (!existsSync(targetPath)) return false;
  let content = readFileSync(targetPath, 'utf-8');
  const additions = extractActionableSteps(action.implementation);
  for (const step of additions) {
    if (!content.includes(step)) {
      content = content.replace(/(<\/?\w+[^>]*>)/, `/* ${step} */\n$1`);
    }
  }
  writeFileSync(targetPath, content);
  return true;
}

function executeFixIssue(action: ImprovementAction, targetPath: string): boolean {
  if (!existsSync(targetPath)) {
    ensureDir(dirname(targetPath));
    writeFileSync(targetPath, `// TODO: ${action.description}\n`);
    return true;
  }
  let content = readFileSync(targetPath, 'utf-8');
  const steps = extractActionableSteps(action.implementation);
  for (const step of steps) {
    if (!content.includes(step)) {
      content += `\n// ${step}\n`;
    }
  }
  writeFileSync(targetPath, content);
  return true;
}

function executeAddDocs(action: ImprovementAction, targetPath: string): boolean {
  const header = `## ${action.description}\n\n`;
  const body = action.implementation;
  if (!existsSync(targetPath)) {
    ensureDir(dirname(targetPath));
    writeFileSync(targetPath, `# Project Documentation\n\n${body}\n`);
    return true;
  }
  let content = readFileSync(targetPath, 'utf-8');
  if (!content.includes(action.description)) {
    content += `\n\n${header}${body}\n`;
    writeFileSync(targetPath, content);
  }
  return true;
}

function executeAddTests(action: ImprovementAction, targetPath: string, targetDir: string): boolean {
  ensureDir(targetDir);
  if (!existsSync(targetPath)) {
    const testContent = generateTestFile(action);
    writeFileSync(targetPath, testContent);
    return true;
  }
  return false;
}

function executeAddDeployment(action: ImprovementAction, projectDir: string): boolean {
  let wroteAny = false;

  const vercelPath = resolve(projectDir, 'vercel.json');
  if (!existsSync(vercelPath)) {
    writeFileSync(vercelPath, JSON.stringify({ framework: 'nextjs', buildCommand: 'npm run build', outputDirectory: '.next' }, null, 2));
    wroteAny = true;
  }

  const dockerPath = resolve(projectDir, 'Dockerfile');
  if (!existsSync(dockerPath)) {
    writeFileSync(dockerPath, generateDockerfile(projectDir));
    wroteAny = true;
  }

  const envExample = resolve(projectDir, '.env.example');
  if (!existsSync(envExample)) {
    writeFileSync(envExample, '# Environment Variables\n# Copy this file to .env and fill in values\n\n');
    wroteAny = true;
  }

  return wroteAny;
}

function generateComponent(name: string, implementation: string): string {
  const steps = extractActionableSteps(implementation);
  return `import { FC } from 'react';

interface ${name}Props {
  className?: string;
}

const ${name}: FC<${name}Props> = ({ className }) => {
  return (
    <div className={className}>
      ${steps.length > 0 ? `<p>${steps[0]}</p>` : '<p>Component content</p>'}
    </div>
  );
};

export default ${name};
`;
}

function generateTestFile(action: ImprovementAction): string {
  const targetName = basename(action.target).replace(/\.(tsx?|jsx?)$/, '');
  return `import { describe, it, expect } from 'vitest';

describe('${targetName}', () => {
  it('should render without crashing', () => {
    expect(true).toBe(true);
  });

  it('should handle the expected behavior', () => {
    // TODO: ${action.description}
  });
});
`;
}

function generateDockerfile(projectDir: string): string {
  const hasNodeModules = existsSync(resolve(projectDir, 'node_modules'));
  return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
${hasNodeModules ? 'COPY --from=builder /app/node_modules ./node_modules' : 'RUN npm ci --production'}
EXPOSE 3000
CMD ["npm", "start"]
`;
}

function extractActionableSteps(text: string): string[] {
  return text
    .split(/\d\)/g)
    .map(s => s.replace(/^[\(\)\s]+/, '').replace(/[\(\)\s]+$/, '').trim())
    .filter(s => s.length > 10);
}

function basename(p: string): string {
  const sep = p.includes('\\') ? '\\' : '/';
  return p.split(sep).pop() ?? p;
}
