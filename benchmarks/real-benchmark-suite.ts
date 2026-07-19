/**
 * Real Benchmark Suite
 *
 * Replaces fabricated Devpost URLs with deterministic, reproducible
 * test scenarios that evaluate actual code generation quality.
 *
 * Each benchmark defines:
 * - What the LLM should generate (input spec)
 * - What the output must contain (acceptance criteria)
 * - How to verify quality (verification steps)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type BenchmarkAppType =
  | 'landing-page'
  | 'dashboard'
  | 'saas'
  | 'healthcare'
  | 'ai-chat'
  | 'education'
  | 'crm'
  | 'portfolio'
  | 'cli'
  | 'api'
  | 'documentation';

export interface BenchmarkSpec {
  id: string;
  name: string;
  description: string;
  /** The application archetype this benchmark represents (for cross-cutting comparison). */
  appType: BenchmarkAppType;
  input: {
    title: string;
    problemStatement: string;
    techStack: string[];
    constraints: string[];
    judgingCriteria: string[];
  };
  acceptanceCriteria: AcceptanceCriterion[];
  verificationSteps: VerificationStep[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedMinutes: number;
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
  weight: number;
  verification: 'file_exists' | 'file_content' | 'build_check' | 'test_check' | 'structure_check';
  target?: string;
  contentPattern?: RegExp;
}

export interface VerificationStep {
  name: string;
  command: string;
  successPattern: RegExp;
  timeout: number;
}

export interface BenchmarkResult {
  benchmarkId: string;
  startTime: number;
  endTime: number;
  passed: boolean;
  criteria: CriterionResult[];
  score: number;
  maxScore: number;
  errors: string[];
}

export interface CriterionResult {
  criterionId: string;
  passed: boolean;
  score: number;
  maxScore: number;
  message: string;
}

/**
 * Realistic, self-contained benchmark definitions.
 * No fake Devpost URLs — these test actual generation quality.
 */
export const REAL_BENCHMARKS: BenchmarkSpec[] = [
  {
    id: 'real-todo-api',
    name: 'Todo API Service',
  description: 'Generate a RESTful API for todo management with SQLite',
  appType: 'api',
  input: {
      title: 'Todo API',
      problemStatement: 'Build a RESTful API service for managing todo items with SQLite persistence. Must support CRUD operations, filtering by status, and pagination.',
      techStack: ['typescript', 'express', 'sqlite'],
      constraints: ['Must use TypeScript', 'SQLite for persistence', 'REST API only'],
      judgingCriteria: [
        'Code quality and structure (40%)',
        'Functional completeness (30%)',
        'Error handling (20%)',
        'Documentation (10%)',
      ],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json exists with dependencies', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'tsconfig', description: 'tsconfig.json exists', weight: 1, verification: 'file_exists', target: 'tsconfig.json' },
      { id: 'src', description: 'Source files in src/', weight: 1, verification: 'structure_check', target: 'src' },
      { id: 'types', description: 'TypeScript types defined', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /interface|type\s+\w+/ },
      { id: 'db', description: 'Database connection code exists', weight: 1, verification: 'file_content', target: 'src', contentPattern: /sqlite|better-sqlite|Database/ },
      { id: 'routes', description: 'Express routes defined', weight: 1, verification: 'file_content', target: 'src', contentPattern: /app\.(get|post|put|delete)|router\.(get|post|put|delete)/ },
      { id: 'validation', description: 'Input validation present', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /validat|zod|joi|yup/ },
      { id: 'error', description: 'Error handling middleware', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /catch|error.*middleware|\.use\(.*err/ },
      { id: 'readme', description: 'README with usage instructions', weight: 0.5, verification: 'file_content', target: 'README.md', contentPattern: /#|npm|install|run/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'easy',
    estimatedMinutes: 5,
  },
  {
    id: 'real-chatbot-frontend',
    name: 'Chatbot Frontend',
  description: 'Generate a React chat UI with message history',
  appType: 'ai-chat',
  input: {
      title: 'Chatbot UI',
      problemStatement: 'Build a modern chat interface with message history, typing indicators, and message grouping by sender. Must be responsive and accessible.',
      techStack: ['typescript', 'react', 'tailwind'],
      constraints: ['React 18+', 'TypeScript required', 'Tailwind CSS', 'Responsive design'],
      judgingCriteria: [
        'UI/UX quality (35%)',
        'Component architecture (25%)',
        'Responsive design (20%)',
        'Accessibility (20%)',
      ],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json with React deps', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'components', description: 'React components exist', weight: 1, verification: 'structure_check', target: 'src' },
      { id: 'tsx', description: 'TypeScript/JSX files', weight: 1, verification: 'file_content', target: 'src', contentPattern: /\.tsx$|jsx$/ },
      { id: 'useState', description: 'React state management', weight: 1, verification: 'file_content', target: 'src', contentPattern: /useState|useReducer|useContext|zustand|redux/ },
      { id: 'message', description: 'Message component defined', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /message|Message|chat|Chat/ },
      { id: 'tailwind', description: 'Tailwind classes used', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /className=.*\b(flex|grid|p-|m-|text-|bg-)/ },
      { id: 'aria', description: 'ARIA attributes present', weight: 0.6, verification: 'file_content', target: 'src', contentPattern: /aria-|role=|tabIndex/ },
      { id: 'responsive', description: 'Responsive breakpoints', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /sm:|md:|lg:|xl:|@media/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'medium',
    estimatedMinutes: 8,
  },
  {
    id: 'real-fullstack-auth',
    name: 'Full-Stack Auth App',
  description: 'Generate a Next.js app with authentication',
  appType: 'saas',
  input: {
      title: 'Auth Dashboard',
      problemStatement: 'Build a Next.js application with user authentication (login/register), protected dashboard route, and session management. Use SQLite for user storage.',
      techStack: ['typescript', 'nextjs', 'sqlite'],
      constraints: ['Next.js App Router', 'Server-side auth', 'SQLite storage', 'TypeScript'],
      judgingCriteria: [
        'Security (30%)',
        'Code quality (25%)',
        'Feature completeness (25%)',
        'User experience (20%)',
      ],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'Next.js project structure', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'app', description: 'App Router directory structure', weight: 1, verification: 'structure_check', target: 'src/app' },
      { id: 'auth', description: 'Authentication logic exists', weight: 1, verification: 'file_content', target: 'src', contentPattern: /auth|login|register|session|jwt|bcrypt/ },
      { id: 'middleware', description: 'Route protection middleware', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /middleware|protect|guard|auth.*check/ },
      { id: 'db', description: 'Database schema/models', weight: 1, verification: 'file_content', target: 'src', contentPattern: /sqlite|prisma|drizzle|schema|model|CREATE TABLE/ },
      { id: 'forms', description: 'Login/register forms', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /form|input.*type.*password|submit/ },
      { id: 'password', description: 'Password hashing', weight: 1, verification: 'file_content', target: 'src', contentPattern: /bcrypt|argon|hash|scrypt/ },
      { id: 'session', description: 'Session/token management', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /session|cookie|token|jwt|JWT/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx next build', successPattern: /Compiled|Route|static/, timeout: 120000 },
    ],
    difficulty: 'hard',
    estimatedMinutes: 12,
  },
  {
    id: 'real-data-viz',
    name: 'Data Visualization Dashboard',
  description: 'Generate a dashboard with charts and data tables',
  appType: 'dashboard',
  input: {
      title: 'Analytics Dashboard',
      problemStatement: 'Build a data analytics dashboard with interactive charts (line, bar, pie) and sortable data tables. Data should be fetched from a mock API and displayed with real-time updates.',
      techStack: ['typescript', 'react', 'tailwind'],
      constraints: ['Use recharts or chart.js', 'Responsive charts', 'Sortable tables', 'Loading states'],
      judgingCriteria: [
        'Data visualization quality (30%)',
        'Interactivity (25%)',
        'Code organization (25%)',
        'Performance (20%)',
      ],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json with charting lib', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'charts', description: 'Chart components exist', weight: 1, verification: 'file_content', target: 'src', contentPattern: /chart|Chart|recharts|d3|plotly|victory/ },
      { id: 'table', description: 'Data table component', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /table|Table|sort|filter|column/ },
      { id: 'fetch', description: 'API data fetching', weight: 1, verification: 'file_content', target: 'src', contentPattern: /fetch|axios|swr|react-query|useEffect.*get/ },
      { id: 'loading', description: 'Loading states', weight: 0.6, verification: 'file_content', target: 'src', contentPattern: /loading|spinner|Skeleton|isLoading|suspense/ },
      { id: 'responsive', description: 'Responsive layout', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /flex|grid|sm:|md:|lg:/ },
      { id: 'typescript', description: 'Typed data models', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /interface|type\s+\w+\s*=|:\s*(string|number|boolean)/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'medium',
    estimatedMinutes: 10,
  },
  {
    id: 'real-cli-tool',
    name: 'CLI Utility Tool',
  description: 'Generate a Node.js CLI tool with argument parsing',
  appType: 'cli',
  input: {
      title: 'File Organizer CLI',
      problemStatement: 'Build a CLI tool that organizes files in a directory by extension. Should support dry-run mode, custom rules, and progress reporting.',
      techStack: ['typescript', 'node'],
      constraints: ['CLI only (no web)', 'TypeScript', 'Cross-platform paths', 'Graceful error handling'],
      judgingCriteria: [
        'CLI UX (30%)',
        'Error handling (25%)',
        'Code quality (25%)',
        'Documentation (20%)',
      ],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json with bin entry', weight: 1, verification: 'file_content', target: 'package.json', contentPattern: /"bin"/ },
      { id: 'tsconfig', description: 'TypeScript config', weight: 1, verification: 'file_exists', target: 'tsconfig.json' },
      { id: 'cli', description: 'CLI entry point', weight: 1, verification: 'file_content', target: 'src', contentPattern: /process\.argv|commander|yargs|meow|parseArgs/ },
      { id: 'help', description: 'Help text / usage info', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /help|usage|--help|-h/ },
      { id: 'dryrun', description: 'Dry-run mode support', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /dry.?run|--dry|preview/ },
      { id: 'error', description: 'Error handling', weight: 1, verification: 'file_content', target: 'src', contentPattern: /catch|try\s*\{|error.*message|process\.exit/ },
      { id: 'progress', description: 'Progress reporting', weight: 0.6, verification: 'file_content', target: 'src', contentPattern: /progress|spinner|percentage|ora|chalk/ },
      { id: 'readme', description: 'README with examples', weight: 0.5, verification: 'file_content', target: 'README.md', contentPattern: /#|npm|install|example|usage/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'easy',
    estimatedMinutes: 5,
  },

  {
    id: 'real-landing-page',
    name: 'Marketing Landing Page',
    description: 'Generate a responsive marketing landing page with hero, features, and CTA',
    appType: 'landing-page',
    input: {
      title: 'Marketing Landing Page',
      problemStatement: 'Build a conversion-focused landing page for a SaaS product.',
      techStack: ['next', 'react', 'typescript', 'tailwind'],
      constraints: ['Responsive', 'Accessible', 'Fast first paint'],
      judgingCriteria: ['Visual design', 'Responsiveness', 'Accessibility', 'Performance'],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json exists', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'page', description: 'Landing page component', weight: 1, verification: 'file_content', target: 'src', contentPattern: /hero|Hero|landing|Landing|section|Section/ },
      { id: 'cta', description: 'Call-to-action button', weight: 1, verification: 'file_content', target: 'src', contentPattern: /button|Button|cta|CTA|signup|Sign ?up|get started/i },
      { id: 'responsive', description: 'Responsive classes', weight: 1, verification: 'file_content', target: 'src', contentPattern: /sm:|md:|lg:|xl:|@media|grid|flex/ },
      { id: 'aria', description: 'Accessible markup', weight: 0.6, verification: 'file_content', target: 'src', contentPattern: /aria-|role=|alt=|label/i },
      { id: 'readme', description: 'README', weight: 0.5, verification: 'file_content', target: 'README.md', contentPattern: /#|npm|install|run/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'easy',
    estimatedMinutes: 5,
  },

  {
    id: 'real-healthcare',
    name: 'Healthcare Patient Dashboard',
    description: 'Generate a HIPAA-aware patient dashboard with records and appointments',
    appType: 'healthcare',
    input: {
      title: 'Healthcare Patient Dashboard',
      problemStatement: 'Build a patient dashboard showing records, appointments, and alerts.',
      techStack: ['next', 'react', 'typescript', 'tailwind'],
      constraints: ['Privacy-aware', 'Accessible', 'Clear data presentation'],
      judgingCriteria: ['Data clarity', 'Accessibility', 'Security awareness', 'UX'],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json exists', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'records', description: 'Patient records view', weight: 1, verification: 'file_content', target: 'src', contentPattern: /patient|Patient|record|Record|appointment|Appointment/i },
      { id: 'privacy', description: 'Privacy/consent handling', weight: 1, verification: 'file_content', target: 'src', contentPattern: /consent|privacy|phi|hipaa|auth/i },
      { id: 'aria', description: 'Accessible tables/lists', weight: 0.6, verification: 'file_content', target: 'src', contentPattern: /aria-|role=|scope=|caption/i },
      { id: 'responsive', description: 'Responsive layout', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /sm:|md:|lg:|grid|flex/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'medium',
    estimatedMinutes: 10,
  },

  {
    id: 'real-education',
    name: 'Education Course Platform',
    description: 'Generate a course/lesson platform with modules and progress',
    appType: 'education',
    input: {
      title: 'Education Course Platform',
      problemStatement: 'Build a platform to browse courses, view lessons, and track progress.',
      techStack: ['next', 'react', 'typescript', 'tailwind'],
      constraints: ['Clear learning path', 'Progress tracking', 'Accessible'],
      judgingCriteria: ['Content structure', 'Progress UX', 'Accessibility'],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json exists', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'courses', description: 'Course listing', weight: 1, verification: 'file_content', target: 'src', contentPattern: /course|Course|lesson|Lesson|module|Module/i },
      { id: 'progress', description: 'Progress tracking', weight: 1, verification: 'file_content', target: 'src', contentPattern: /progress|Progress|complete|Complete|percent|%/ },
      { id: 'aria', description: 'Accessible navigation', weight: 0.6, verification: 'file_content', target: 'src', contentPattern: /aria-|role=|nav|Nav/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'medium',
    estimatedMinutes: 10,
  },

  {
    id: 'real-crm',
    name: 'CRM Contact Manager',
    description: 'Generate a CRM with contacts, notes, and pipeline views',
    appType: 'crm',
    input: {
      title: 'CRM Contact Manager',
      problemStatement: 'Build a CRM to manage contacts, log notes, and track deal stages.',
      techStack: ['next', 'react', 'typescript', 'tailwind'],
      constraints: ['Data entry ergonomics', 'Searchable', 'Accessible'],
      judgingCriteria: ['CRUD completeness', 'Search UX', 'Data presentation'],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json exists', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'contacts', description: 'Contact model/views', weight: 1, verification: 'file_content', target: 'src', contentPattern: /contact|Contact|deal|Deal|pipeline|Pipeline/i },
      { id: 'crud', description: 'CRUD operations', weight: 1, verification: 'file_content', target: 'src', contentPattern: /create|update|delete|POST|PUT|DELETE/i },
      { id: 'search', description: 'Search/filter', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /search|filter|query|find/i },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'medium',
    estimatedMinutes: 10,
  },

  {
    id: 'real-portfolio',
    name: 'Developer Portfolio',
    description: 'Generate a personal developer portfolio with projects and bio',
    appType: 'portfolio',
    input: {
      title: 'Developer Portfolio',
      problemStatement: 'Build a portfolio site showcasing projects, skills, and contact.',
      techStack: ['next', 'react', 'typescript', 'tailwind'],
      constraints: ['Fast', 'Responsive', 'Accessible'],
      judgingCriteria: ['Visual design', 'Project showcase', 'Responsiveness'],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json exists', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'projects', description: 'Projects section', weight: 1, verification: 'file_content', target: 'src', contentPattern: /project|Project|work|Work|portfolio/i },
      { id: 'bio', description: 'About/bio section', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /about|bio|About|hello|intro/i },
      { id: 'responsive', description: 'Responsive layout', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /sm:|md:|lg:|grid|flex/ },
      { id: 'aria', description: 'Accessible markup', weight: 0.6, verification: 'file_content', target: 'src', contentPattern: /aria-|role=|alt=|label/i },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'easy',
    estimatedMinutes: 5,
  },

  {
    id: 'real-documentation',
    name: 'API Documentation Site',
    description: 'Generate a documentation site for an API with guides and references',
    appType: 'documentation',
    input: {
      title: 'API Documentation Site',
      problemStatement: 'Build a docs site with sidebar navigation, guides, and an API reference.',
      techStack: ['next', 'react', 'typescript', 'tailwind', 'mdx'],
      constraints: ['Navigable', 'Searchable', 'Clear examples'],
      judgingCriteria: ['Information architecture', 'Code examples', 'Navigation UX'],
    },
    acceptanceCriteria: [
      { id: 'pkg', description: 'package.json exists', weight: 1, verification: 'file_exists', target: 'package.json' },
      { id: 'docs', description: 'Docs pages', weight: 1, verification: 'file_content', target: 'src', contentPattern: /doc|Doc|guide|Guide|reference|api/i },
      { id: 'nav', description: 'Sidebar/nav', weight: 1, verification: 'file_content', target: 'src', contentPattern: /nav|Nav|sidebar|Sidebar|menu|Menu/ },
      { id: 'code', description: 'Code examples', weight: 0.8, verification: 'file_content', target: 'src', contentPattern: /```|code|Code|snippet|example/i },
      { id: 'readme', description: 'README', weight: 0.5, verification: 'file_content', target: 'README.md', contentPattern: /#|npm|install|run/ },
    ],
    verificationSteps: [
      { name: 'install', command: 'npm install', successPattern: /added \d+ packages/, timeout: 60000 },
      { name: 'build', command: 'npx tsc --noEmit', successPattern: /$|error/, timeout: 30000 },
    ],
    difficulty: 'medium',
    estimatedMinutes: 10,
  },
];

/**
 * Get a benchmark by ID.
 */
export function getBenchmark(id: string): BenchmarkSpec | undefined {
  return REAL_BENCHMARKS.find(b => b.id === id);
}

/**
 * Get benchmarks by difficulty.
 */
export function getBenchmarksByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): BenchmarkSpec[] {
  return REAL_BENCHMARKS.filter(b => b.difficulty === difficulty);
}

/**
 * Get all benchmark IDs.
 */
export function getAllBenchmarkIds(): string[] {
  return REAL_BENCHMARKS.map(b => b.id);
}
