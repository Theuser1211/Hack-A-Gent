/**
 * Real Benchmark Suite — Category Definitions
 * ==========================================
 *
 * 16 reproducible hackathon categories. Each category is a *real*
 * generation target: it declares what a generated project must contain and
 * which of the 15 evaluation dimensions matter most for that kind of app.
 *
 * No synthetic Devpost URLs, no fabricated scores. A category is run by
 * (1) generating/using a project directory and (2) evaluating it with
 * the framework in `framework.ts`. The category defines the contract;
 * the framework measures it deterministically.
 */

export type BenchDimension =
  | 'compilation'
  | 'type_safety'
  | 'lint'
  | 'tests'
  | 'performance'
  | 'accessibility'
  | 'seo'
  | 'responsiveness'
  | 'bundle_size'
  | 'code_quality'
  | 'architecture'
  | 'maintainability'
  | 'documentation'
  | 'file_organization'
  | 'deployment_readiness';

export const ALL_DIMENSIONS: BenchDimension[] = [
  'compilation',
  'type_safety',
  'lint',
  'tests',
  'performance',
  'accessibility',
  'seo',
  'responsiveness',
  'bundle_size',
  'code_quality',
  'architecture',
  'maintainability',
  'documentation',
  'file_organization',
  'deployment_readiness',
];

export interface CategorySpec {
  id: string;
  name: string;
  description: string;
  /** Framework / language the generated project targets. */
  stack: string[];
  /** What a generated project MUST contain (verifiable patterns). */
  acceptance: Array<{
    id: string;
    description: string;
    /** File path or directory to inspect. */
    target: string;
    /** Required regex (matched loosely; case-insensitive). */
    pattern: string;
    /** Dimension this check primarily supports. */
    dimension: BenchDimension;
  }>;
  /** Per-dimension weights (0-100 total after normalization). */
  weights: Partial<Record<BenchDimension, number>>;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedMinutes: number;
  /** Short generation brief for an LLM or starter generator. */
  brief: string;
}

function weights(over: Partial<Record<BenchDimension, number>>): Partial<Record<BenchDimension, number>> {
  return over;
}

export const CATEGORY_SUITE: CategorySpec[] = [
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'A marketing landing page with hero, features, and CTA.',
    stack: ['nextjs', 'react', 'tailwind'],
    acceptance: [
      { id: 'hero', description: 'Hero section', target: 'app', pattern: 'hero|headline|cta|get started', dimension: 'seo' },
      { id: 'responsive', description: 'Responsive classes', target: 'app', pattern: 'sm:|md:|lg:|flex|grid', dimension: 'responsiveness' },
      { id: 'aria', description: 'Accessible markup', target: 'app', pattern: 'aria-|role=|alt=', dimension: 'accessibility' },
      { id: 'meta', description: 'SEO metadata', target: 'app', pattern: 'metadata|title|description|openGraph', dimension: 'seo' },
    ],
    weights: weights({ compilation: 15, type_safety: 10, seo: 15, responsiveness: 15, accessibility: 15, code_quality: 10, documentation: 5, file_organization: 5, deployment_readiness: 10 }),
    difficulty: 'easy',
    estimatedMinutes: 5,
    brief: 'Generate a Next.js landing page: hero with value prop, 3 feature blocks, pricing teaser, and a primary CTA. Tailwind, responsive, accessible, with metadata for SEO.',
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'A data dashboard with charts and tables.',
    stack: ['nextjs', 'react', 'tailwind'],
    acceptance: [
      { id: 'chart', description: 'Chart component', target: 'app', pattern: 'chart|recharts|d3|plotly|victory|svg', dimension: 'code_quality' },
      { id: 'table', description: 'Data table', target: 'app', pattern: 'table|tbody|grid.*row', dimension: 'architecture' },
      { id: 'fetch', description: 'Data fetching', target: 'app', pattern: 'fetch|axios|swr|react-query|useEffect', dimension: 'performance' },
      { id: 'state', description: 'Loading/state', target: 'app', pattern: 'loading|skeleton|isLoading|useSWR|useQuery', dimension: 'code_quality' },
    ],
    weights: weights({ compilation: 12, type_safety: 12, performance: 12, code_quality: 14, architecture: 14, maintainability: 8, documentation: 6, file_organization: 8, deployment_readiness: 14 }),
    difficulty: 'medium',
    estimatedMinutes: 10,
    brief: 'Generate a Next.js analytics dashboard: a line chart, a bar chart, a sortable data table, and KPI cards. Fetch from a mock API with loading/empty states.',
  },
  {
    id: 'ai-chat',
    name: 'AI Chat',
    description: 'A chat UI backed by an LLM with streaming and history.',
    stack: ['nextjs', 'react', 'tailwind', 'ai-sdk'],
    acceptance: [
      { id: 'chat-ui', description: 'Chat UI', target: 'app', pattern: 'chat|message|conversation', dimension: 'architecture' },
      { id: 'stream', description: 'Streaming response', target: 'app', pattern: 'stream|ReadableStream|onToken|append', dimension: 'performance' },
      { id: 'history', description: 'Message history', target: 'app', pattern: 'history|messages|useState|useReducer', dimension: 'maintainability' },
      { id: 'api', description: 'LLM API route', target: 'app/api', pattern: 'openai|anthropic|completion|chat', dimension: 'type_safety' },
    ],
    weights: weights({ compilation: 12, type_safety: 12, performance: 14, architecture: 16, code_quality: 12, maintainability: 10, documentation: 8, deployment_readiness: 16 }),
    difficulty: 'hard',
    estimatedMinutes: 14,
    brief: 'Generate a Next.js AI chat app: streaming chat UI, persistent message history, and an API route that calls an LLM. Handle errors and rate limits gracefully.',
  },
  {
    id: 'saas',
    name: 'SaaS',
    description: 'A SaaS app shell with auth, billing, and a dashboard.',
    stack: ['nextjs', 'react', 'tailwind', 'auth', 'db'],
    acceptance: [
      { id: 'auth', description: 'Auth logic', target: 'app', pattern: 'login|register|session|auth|signin', dimension: 'type_safety' },
      { id: 'db', description: 'Data layer', target: 'app', pattern: 'prisma|drizzle|schema|CREATE TABLE|sqlite', dimension: 'architecture' },
      { id: 'billing', description: 'Billing surface', target: 'app', pattern: 'plan|subscription|stripe|pricing', dimension: 'code_quality' },
      { id: 'guard', description: 'Route protection', target: 'app', pattern: 'middleware|protect|guard|requireAuth', dimension: 'type_safety' },
    ],
    weights: weights({ compilation: 10, type_safety: 12, lint: 8, architecture: 16, code_quality: 14, maintainability: 10, documentation: 8, file_organization: 10, deployment_readiness: 12 }),
    difficulty: 'hard',
    estimatedMinutes: 16,
    brief: 'Generate a SaaS app shell: email/password auth, a protected dashboard, a pricing page, and a Prisma/SQLite data layer with a couple of models.',
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    description: 'A patient/health tracker with privacy-aware UX.',
    stack: ['nextjs', 'react', 'tailwind', 'db'],
    acceptance: [
      { id: 'records', description: 'Health records UI', target: 'app', pattern: 'record|patient|metric|vital', dimension: 'architecture' },
      { id: 'privacy', description: 'Privacy-aware UI', target: 'app', pattern: 'consent|privacy|gdpr|encrypt', dimension: 'accessibility' },
      { id: 'db', description: 'Data model', target: 'app', pattern: 'schema|model|prisma|CREATE TABLE', dimension: 'type_safety' },
      { id: 'a11y', description: 'Accessible forms', target: 'app', pattern: 'label|aria-|fieldset|role=', dimension: 'accessibility' },
    ],
    weights: weights({ compilation: 12, type_safety: 14, accessibility: 18, architecture: 14, code_quality: 12, maintainability: 10, documentation: 10, deployment_readiness: 10 }),
    difficulty: 'medium',
    estimatedMinutes: 12,
    brief: 'Generate a health tracker: log daily metrics, view trends, and a privacy/consent notice. Accessible forms, a typed data model, and clear empty/error states.',
  },
  {
    id: 'education',
    name: 'Education',
    description: 'A learning app with lessons, quizzes, and progress.',
    stack: ['nextjs', 'react', 'tailwind'],
    acceptance: [
      { id: 'lesson', description: 'Lesson view', target: 'app', pattern: 'lesson|course|module|chapter', dimension: 'architecture' },
      { id: 'quiz', description: 'Quiz component', target: 'app', pattern: 'quiz|question|answer|score', dimension: 'code_quality' },
      { id: 'progress', description: 'Progress tracking', target: 'app', pattern: 'progress|completion|streak|xp|badge', dimension: 'maintainability' },
    ],
    weights: weights({ compilation: 12, type_safety: 12, code_quality: 16, architecture: 16, maintainability: 12, accessibility: 10, documentation: 8, deployment_readiness: 14 }),
    difficulty: 'medium',
    estimatedMinutes: 11,
    brief: 'Generate an education app: a list of lessons, a lesson reader, a quiz with scoring, and a progress tracker with streaks.',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'A personal portfolio with projects and contact.',
    stack: ['nextjs', 'react', 'tailwind'],
    acceptance: [
      { id: 'projects', description: 'Projects grid', target: 'app', pattern: 'project|work|case.?study', dimension: 'architecture' },
      { id: 'about', description: 'About section', target: 'app', pattern: 'about|bio|skills', dimension: 'seo' },
      { id: 'contact', description: 'Contact form', target: 'app', pattern: 'contact|email|form|mailto', dimension: 'accessibility' },
      { id: 'responsive', description: 'Responsive layout', target: 'app', pattern: 'sm:|md:|lg:|grid|flex', dimension: 'responsiveness' },
    ],
    weights: weights({ compilation: 14, type_safety: 10, seo: 16, responsiveness: 16, accessibility: 14, code_quality: 12, documentation: 6, file_organization: 6, deployment_readiness: 6 }),
    difficulty: 'easy',
    estimatedMinutes: 6,
    brief: 'Generate a portfolio site: hero, projects grid with detail, about/skills, and a contact form. Responsive, accessible, SEO metadata.',
  },
  {
    id: 'task-manager',
    name: 'Task Manager',
    description: 'A task manager with lists, due dates, and persistence.',
    stack: ['nextjs', 'react', 'tailwind', 'db'],
    acceptance: [
      { id: 'tasks', description: 'Task CRUD', target: 'app', pattern: 'task|todo|addTask|toggleComplete', dimension: 'code_quality' },
      { id: 'persist', description: 'Persistence', target: 'app', pattern: 'localStorage|prisma|sqlite|indexedDB|store', dimension: 'architecture' },
      { id: 'filter', description: 'Filtering', target: 'app', pattern: 'filter|completed|active|all', dimension: 'maintainability' },
    ],
    weights: weights({ compilation: 12, type_safety: 12, tests: 10, code_quality: 16, architecture: 16, maintainability: 12, documentation: 8, deployment_readiness: 14 }),
    difficulty: 'medium',
    estimatedMinutes: 9,
    brief: 'Generate a task manager: add/edit/complete/delete tasks, filter by status, due dates, and persistence (localStorage or SQLite).',
  },
  {
    id: 'crm',
    name: 'CRM',
    description: 'A CRM with contacts, notes, and a pipeline view.',
    stack: ['nextjs', 'react', 'tailwind', 'db'],
    acceptance: [
      { id: 'contacts', description: 'Contacts list', target: 'app', pattern: 'contact|customer|lead|account', dimension: 'architecture' },
      { id: 'pipeline', description: 'Pipeline/Kanban', target: 'app', pattern: 'pipeline|stage|kanban|deal|column', dimension: 'code_quality' },
      { id: 'notes', description: 'Notes', target: 'app', pattern: 'note|comment|activity', dimension: 'maintainability' },
      { id: 'db', description: 'Data model', target: 'app', pattern: 'schema|model|prisma|CREATE TABLE', dimension: 'type_safety' },
    ],
    weights: weights({ compilation: 10, type_safety: 12, architecture: 18, code_quality: 14, maintainability: 12, documentation: 8, file_organization: 10, deployment_readiness: 16 }),
    difficulty: 'hard',
    estimatedMinutes: 15,
    brief: 'Generate a CRM: contacts with search, a deal pipeline (drag or buttons), notes/activity, and a typed data model.',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    description: 'A storefront with catalog, cart, and checkout.',
    stack: ['nextjs', 'react', 'tailwind', 'payments'],
    acceptance: [
      { id: 'catalog', description: 'Product catalog', target: 'app', pattern: 'product|catalog|shop|store', dimension: 'architecture' },
      { id: 'cart', description: 'Cart', target: 'app', pattern: 'cart|addToCart|checkout|bag', dimension: 'code_quality' },
      { id: 'pay', description: 'Checkout/payment', target: 'app', pattern: 'stripe|checkout|payment|order', dimension: 'type_safety' },
      { id: 'db', description: 'Order model', target: 'app', pattern: 'order|schema|prisma|CREATE TABLE', dimension: 'architecture' },
    ],
    weights: weights({ compilation: 10, type_safety: 14, performance: 12, architecture: 16, code_quality: 14, maintainability: 10, documentation: 8, deployment_readiness: 16 }),
    difficulty: 'hard',
    estimatedMinutes: 16,
    brief: 'Generate a storefront: product grid with detail pages, a cart, and a checkout flow. Typed models and a payments-ready surface (mock or real).',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'An analytics product with reports and exports.',
    stack: ['nextjs', 'react', 'tailwind'],
    acceptance: [
      { id: 'reports', description: 'Report views', target: 'app', pattern: 'report|insight|metric|funnel', dimension: 'architecture' },
      { id: 'export', description: 'Export', target: 'app', pattern: 'export|csv|download|json', dimension: 'code_quality' },
      { id: 'chart', description: 'Visualizations', target: 'app', pattern: 'chart|recharts|d3|victory', dimension: 'performance' },
    ],
    weights: weights({ compilation: 12, type_safety: 12, performance: 14, code_quality: 14, architecture: 16, maintainability: 12, documentation: 8, deployment_readiness: 12 }),
    difficulty: 'medium',
    estimatedMinutes: 12,
    brief: 'Generate an analytics product: a reports dashboard, charts, and CSV/JSON export. Real-ish mock data with loading states.',
  },
  {
    id: 'docs-site',
    name: 'Documentation Site',
    description: 'A docs site with sidebar navigation and searchable pages.',
    stack: ['nextjs', 'react', 'tailwind', 'mdx'],
    acceptance: [
      { id: 'nav', description: 'Sidebar nav', target: 'app', pattern: 'sidebar|nav|toc|contents', dimension: 'architecture' },
      { id: 'pages', description: 'Doc pages', target: 'app', pattern: 'mdx|markdown|article|prose', dimension: 'file_organization' },
      { id: 'search', description: 'Search', target: 'app', pattern: 'search|filter|query|cmdk', dimension: 'code_quality' },
      { id: 'seo', description: 'Per-page SEO', target: 'app', pattern: 'metadata|title|description', dimension: 'seo' },
    ],
    weights: weights({ compilation: 12, type_safety: 10, seo: 14, accessibility: 12, code_quality: 12, architecture: 14, maintainability: 12, documentation: 14 }),
    difficulty: 'medium',
    estimatedMinutes: 10,
    brief: 'Generate a documentation site: a sidebar of sections, rendered doc pages (markdown/MDX), basic client-side search, and per-page metadata.',
  },
  {
    id: 'blog',
    name: 'Blog',
    description: 'A blog with posts, tags, and an RSS feed.',
    stack: ['nextjs', 'react', 'tailwind'],
    acceptance: [
      { id: 'posts', description: 'Post list', target: 'app', pattern: 'post|article|blog', dimension: 'architecture' },
      { id: 'tags', description: 'Tagging', target: 'app', pattern: 'tag|category|filter', dimension: 'code_quality' },
      { id: 'rss', description: 'RSS/feed', target: 'app', pattern: 'rss|feed.xml|atom', dimension: 'seo' },
      { id: 'seo', description: 'Post metadata', target: 'app', pattern: 'metadata|title|description|og:', dimension: 'seo' },
    ],
    weights: weights({ compilation: 12, type_safety: 10, seo: 18, responsiveness: 12, accessibility: 12, code_quality: 12, architecture: 12, documentation: 12 }),
    difficulty: 'easy',
    estimatedMinutes: 7,
    brief: 'Generate a blog: post index, individual post pages, tag filtering, and RSS. Per-post SEO metadata.',
  },
  {
    id: 'dev-tool',
    name: 'Developer Tool',
    description: 'A developer utility (CLI or web) with a clear API.',
    stack: ['typescript', 'node'],
    acceptance: [
      { id: 'cli', description: 'CLI entry', target: 'src', pattern: 'process.argv|commander|yargs|meow|parseArgs', dimension: 'type_safety' },
      { id: 'api', description: 'Clear interface', target: 'src', pattern: 'export function|export const|interface ', dimension: 'architecture' },
      { id: 'help', description: 'Help/usage', target: 'src', pattern: 'help|usage|--help|-h', dimension: 'documentation' },
      { id: 'err', description: 'Error handling', target: 'src', pattern: 'try|catch|throw|process.exit', dimension: 'code_quality' },
    ],
    weights: weights({ compilation: 14, type_safety: 14, tests: 14, code_quality: 16, architecture: 12, maintainability: 12, documentation: 18 }),
    difficulty: 'medium',
    estimatedMinutes: 9,
    brief: 'Generate a developer CLI tool: argument parsing, a clear typed API, helpful --help, and graceful error handling with a README example.',
  },
  {
    id: 'cli',
    name: 'CLI',
    description: 'A command-line application with subcommands.',
    stack: ['typescript', 'node'],
    acceptance: [
      { id: 'subcommands', description: 'Subcommands', target: 'src', pattern: 'command|subcommand|case|switch', dimension: 'architecture' },
      { id: 'flags', description: 'Flag parsing', target: 'src', pattern: 'flag|--|argv|options', dimension: 'type_safety' },
      { id: 'output', description: 'Formatted output', target: 'src', pattern: 'console.log|chalk|table|json', dimension: 'code_quality' },
      { id: 'err', description: 'Exit codes', target: 'src', pattern: 'process.exit|exitCode|throw', dimension: 'maintainability' },
    ],
    weights: weights({ compilation: 14, type_safety: 14, tests: 12, code_quality: 16, architecture: 12, maintainability: 12, documentation: 20 }),
    difficulty: 'easy',
    estimatedMinutes: 6,
    brief: 'Generate a CLI with subcommands, flag parsing, sensible output formatting, and documented exit codes in a README.',
  },
  {
    id: 'api',
    name: 'API',
    description: 'A REST/JSON API service with routes and persistence.',
    stack: ['typescript', 'node', 'express'],
    acceptance: [
      { id: 'routes', description: 'REST routes', target: 'src', pattern: 'app.get|router.get|app.post|@Get|@Post', dimension: 'architecture' },
      { id: 'validation', description: 'Input validation', target: 'src', pattern: 'zod|joi|yup|validate|schema', dimension: 'type_safety' },
      { id: 'db', description: 'Persistence', target: 'src', pattern: 'prisma|sqlite|pg|mongoose|CREATE TABLE', dimension: 'code_quality' },
      { id: 'err', description: 'Error handling', target: 'src', pattern: 'try|catch|error middleware|AppError', dimension: 'maintainability' },
    ],
    weights: weights({ compilation: 12, type_safety: 16, tests: 14, code_quality: 14, architecture: 14, maintainability: 12, documentation: 12, deployment_readiness: 6 }),
    difficulty: 'medium',
    estimatedMinutes: 9,
    brief: 'Generate a REST API: CRUD routes for a resource, input validation, a typed data layer, structured error handling, and request/response types.',
  },
];

export function getCategory(id: string): CategorySpec | undefined {
  return CATEGORY_SUITE.find((c) => c.id === id);
}
