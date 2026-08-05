import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

export interface ReadinessCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface ReadinessResult {
  checks: ReadinessCheck[];
  ready: boolean;
}

export function checkReadiness(projectDir: string): ReadinessResult {
  const checks: ReadinessCheck[] = [];

  checks.push(checkProjectBuilds(projectDir));
  checks.push(checkReadmeExists(projectDir));
  checks.push(checkDeploymentConfig(projectDir));
  checks.push(checkLicense(projectDir));
  checks.push(checkGitignore(projectDir));
  checks.push(checkNoPlaceholders(projectDir));

  const ready = checks.every(c => c.status !== 'fail');
  return { checks, ready };
}

function checkProjectBuilds(projectDir: string): ReadinessCheck {
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return { name: 'Project builds', status: 'warn', message: 'No package.json found — cannot verify build' };
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const hasBuild = !!(pkg.scripts?.build);
    if (!hasBuild) {
      return { name: 'Project builds', status: 'warn', message: 'No build script defined in package.json' };
    }
    return { name: 'Project builds', status: 'pass', message: 'Build script defined in package.json' };
  } catch {
    return { name: 'Project builds', status: 'warn', message: 'Could not parse package.json' };
  }
}

function checkReadmeExists(projectDir: string): ReadinessCheck {
  const readmePath = join(projectDir, 'README.md');
  if (!existsSync(readmePath)) {
    return { name: 'README exists', status: 'fail', message: 'README.md is missing — add project documentation' };
  }
  const content = readFileSync(readmePath, 'utf-8');
  const hasSetup = /install|setup|run|start/i.test(content);
  const hasDeploy = /deploy|vercel|netlify|docker/i.test(content);
  if (!hasSetup && !hasDeploy) {
    return { name: 'README exists', status: 'warn', message: 'README.md exists but may be missing setup or deploy instructions' };
  }
  return { name: 'README exists', status: 'pass', message: 'README.md exists with setup and deploy coverage' };
}

function checkDeploymentConfig(projectDir: string): ReadinessCheck {
  const configs = [
    { file: 'vercel.json', name: 'Vercel' },
    { file: 'netlify.toml', name: 'Netlify' },
    { file: 'Dockerfile', name: 'Docker' },
    { file: 'now.json', name: 'Vercel (legacy)' },
  ];
  const found = configs.filter(c => existsSync(join(projectDir, c.file)));
  if (found.length === 0) {
    return { name: 'Deployment config', status: 'fail', message: 'No deployment configuration found — add vercel.json, netlify.toml, or Dockerfile' };
  }
  return {
    name: 'Deployment config',
    status: 'pass',
    message: `Found deployment config: ${found.map(f => f.name).join(', ')}`,
  };
}

function checkLicense(projectDir: string): ReadinessCheck {
  const licenseFiles = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'LICENCE'];
  const found = licenseFiles.find(f => existsSync(join(projectDir, f)));
  if (!found) {
    return { name: 'License file', status: 'warn', message: 'No license file found — add LICENSE (MIT recommended for hackathons)' };
  }
  return { name: 'License file', status: 'pass', message: `${found} exists` };
}

function checkGitignore(projectDir: string): ReadinessCheck {
  const gitignore = join(projectDir, '.gitignore');
  if (!existsSync(gitignore)) {
    return { name: '.gitignore', status: 'fail', message: '.gitignore is missing — add one to exclude node_modules, .env, and build output' };
  }
  const content = readFileSync(gitignore, 'utf-8');
  const coversNodeModules = /node_modules/i.test(content);
  if (!coversNodeModules) {
    return { name: '.gitignore', status: 'warn', message: '.gitignore exists but may not exclude node_modules' };
  }
  return { name: '.gitignore', status: 'pass', message: '.gitignore exists with common exclusions' };
}

function checkNoPlaceholders(projectDir: string): ReadinessCheck {
  const placeholderPatterns = [
    /\/\/\s*TODO\b/i,
    /\/\*\s*TODO\b/i,
    /\/\/\s*FIXME\b/i,
    /\/\*\s*FIXME\b/i,
    /\/\/\s*HACK\b/i,
    /\/\/\s*XXX\b/i,
    /lorem ipsum/i,
    /change ?me/i,
    /insert your code/i,
    /insert your text/i,
  ];
  let count = 0;
  const sourceDirs = ['src', 'app', 'pages', 'components', 'lib', 'utils'];
  for (const dir of sourceDirs) {
    const full = resolve(projectDir, dir);
    if (!existsSync(full)) continue;
    walkFiles(full, (filePath) => {
      try {
        const content = readFileSync(filePath, 'utf-8');
        for (const pattern of placeholderPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            count += matches.length;
          }
        }
      } catch { /* skip binary files */ }
    });
  }
  if (count > 0) {
    return { name: 'No placeholder content', status: 'warn', message: `Found ${count} placeholder${count === 1 ? '' : 's'} (TODO, FIXME, etc.) in source files` };
  }
  return { name: 'No placeholder content', status: 'pass', message: 'No placeholder content detected in source files' };
}

function walkFiles(dir: string, cb: (path: string) => void) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walkFiles(full, cb);
      } else if (entry.isFile() && /\.(tsx?|jsx?|css|json|md)$/i.test(entry.name)) {
        cb(full);
      }
    }
  } catch { /* skip unreadable */ }
}
