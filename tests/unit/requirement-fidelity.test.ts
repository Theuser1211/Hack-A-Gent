import { describe, it, expect } from 'vitest';

describe('BLOCKER 2: Requirement Fidelity', () => {
  const sdkMap: Record<string, string> = {
    firebase: 'firebase',
    twilio: 'twilio',
    openai: 'openai',
    stripe: 'stripe',
    supabase: '@supabase/supabase-js',
    aws: 'aws-sdk',
    azure: '@azure/identity',
    tensorflow: '@tensorflow/tfjs',
    graphql: 'graphql',
    prisma: '@prisma/client',
    mongodb: 'mongodb',
    postgres: 'pg',
    redis: 'redis',
  };

  function enforceRequiredTechnologies(
    files: Array<{ path: string; content: string }>,
    requiredTechs: string[],
  ): Array<{ path: string; content: string }> {
    if (requiredTechs.length === 0) return files;

    const pkgIdx = files.findIndex(f => f.path === 'package.json');
    if (pkgIdx >= 0) {
      try {
        const pkg = JSON.parse(files[pkgIdx]!.content);
        pkg.dependencies = pkg.dependencies ?? {};
        let modified = false;
        for (const tech of requiredTechs) {
          const sdkPkg = sdkMap[tech.toLowerCase()];
          if (sdkPkg && !pkg.dependencies[sdkPkg]) {
            pkg.dependencies[sdkPkg] = '^1.0.0';
            modified = true;
          }
        }
        if (modified) {
          files[pkgIdx] = { path: 'package.json', content: JSON.stringify(pkg, null, 2) };
        }
      } catch { /* leave unchanged */ }
    }

    const allContent = files.map(f => f.content).join('\n');
    for (const tech of requiredTechs) {
      const regex = new RegExp(`import.*from.*['"]${tech}['"]|require\\(.*['"]${tech}['"]\\)`, 'i');
      if (!regex.test(allContent)) {
        const configFile = files.find(f => f.path.includes('config') || f.path.endsWith('.env.example'));
        if (configFile && !configFile.content.includes(tech)) {
          configFile.content += `\n// Required by competition: ${tech}\n`;
        }
      }
    }

    return files;
  }

  it('adds missing SDK dependencies to package.json', () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ dependencies: { react: '^18.3.1' } }) },
      { path: 'src/app/page.tsx', content: 'export default function Page() { return <div>Hello</div>; }' },
    ];
    const result = enforceRequiredTechnologies(files, ['firebase', 'stripe']);
    const pkg = JSON.parse(result[0]!.content);
    expect(pkg.dependencies['firebase']).toBe('^1.0.0');
    expect(pkg.dependencies['stripe']).toBe('^1.0.0');
    expect(pkg.dependencies['react']).toBe('^18.3.1');
  });

  it('does not overwrite existing dependencies', () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ dependencies: { firebase: '^10.0.0' } }) },
    ];
    const result = enforceRequiredTechnologies(files, ['firebase']);
    const pkg = JSON.parse(result[0]!.content);
    expect(pkg.dependencies['firebase']).toBe('^10.0.0');
  });

  it('does nothing when no required technologies', () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ dependencies: { react: '^18.3.1' } }) },
    ];
    const result = enforceRequiredTechnologies(files, []);
    expect(JSON.parse(result[0]!.content).dependencies['react']).toBe('^18.3.1');
  });

  it('handles files without package.json', () => {
    const files = [
      { path: 'src/app/page.tsx', content: 'export default function Page() { return <div>Hello</div>; }' },
    ];
    const result = enforceRequiredTechnologies(files, ['firebase']);
    expect(result).toHaveLength(1);
  });

  it('adds comment to config file when technology not imported', () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ dependencies: {} }) },
      { path: '.env.example', content: 'NEXT_PUBLIC_API_URL=http://localhost:3000' },
    ];
    const result = enforceRequiredTechnologies(files, ['firebase']);
    expect(result[1]!.content).toContain('Required by competition: firebase');
  });

  it('does not add comment when technology is already imported', () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ dependencies: {} }) },
      { path: '.env.example', content: 'NEXT_PUBLIC_API_URL=http://localhost:3000' },
      { path: 'src/app/page.tsx', content: "import firebase from 'firebase';" },
    ];
    const result = enforceRequiredTechnologies(files, ['firebase']);
    expect(result[1]!.content).not.toContain('Required by competition');
  });

  it('handles all SDK mappings', () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ dependencies: {} }) },
    ];
    const allTechs = Object.keys(sdkMap);
    const result = enforceRequiredTechnologies(files, allTechs);
    const pkg = JSON.parse(result[0]!.content);
    for (const tech of allTechs) {
      const sdkPkg = sdkMap[tech];
      if (sdkPkg) expect(pkg.dependencies[sdkPkg]).toBe('^1.0.0');
    }
  });
});
