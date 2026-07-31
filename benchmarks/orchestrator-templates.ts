// Static data extracted from internet-hackathon-orchestrator.ts.
// These are pure data constants — no logic. Imported verbatim by the orchestrator.

export const KNOWN_PACKAGE_VERSIONS: Record<string, string> = { uuid: '^9.0.0', 'styled-components': '^6.0.0', 'swr': '^2.0.0', zustand: '^4.0.0', 'react-hook-form': '^7.0.0', 'react-query': '^3.0.0', '@tanstack/react-query': '^5.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0', stripe: '^14.0.0', openai: '^4.0.0', langchain: '^0.2.0', 'react-markdown': '^9.0.0', 'react-syntax-highlighter': '^15.0.0', date: 'npm:date-fns@^3.0.0', 'date-fns': '^3.0.0', lodash: '^4.0.0', axios: '^1.7.0', tailwindcss: '^3.4.0', postcss: '^8.4.0', autoprefixer: '^10.4.0', express: '^4.18.0', '@types/express': '^4.17.0', mongoose: '^8.0.0', cors: '^2.8.0', dotenv: '^16.0.0' };

export const KNOWN_PACKAGE_VERSIONS_FALLBACK: Record<string, string> = { tailwindcss: '^3.4.0', postcss: '^8.4.0', autoprefixer: '^10.4.0', express: '^4.18.0', '@types/express': '^4.17.0', mongoose: '^8.0.0', cors: '^2.8.0', dotenv: '^16.0.0', axios: '^1.7.0', uuid: '^9.0.0', 'react-hook-form': '^7.0.0', zustand: '^4.0.0', 'react-query': '^3.0.0', '@tanstack/react-query': '^5.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0', stripe: '^14.0.0', openai: '^4.0.0', 'react-markdown': '^9.0.0', 'react-syntax-highlighter': '^15.0.0', 'date-fns': '^3.0.0', lodash: '^4.0.0', 'next-auth': '^4.24.0', '@types/cors': '^2.8.0', 'socket.io': '^4.7.0', 'socket.io-client': '^4.7.0' };

export const LLM_GENERATION_SYSTEM_PROMPT = `You are building a hackathon project that could WIN. Every project must be unique — do NOT reuse the same architecture, components, UI direction, or README structure.

GOAL: A working demo that solves the SPECIFIC hackathon challenge. Judges should immediately see how your project addresses the problem, uses sponsor APIs, and aligns with judging criteria.

CRITICAL — NEVER generate these anti-patterns:
- Generic SaaS dashboards with sidebar + cards + tables
- CRUD apps with "Create/Read/Update/Delete" as features
- Landing pages with hero section + feature cards + CTA
- Todo apps, note apps, or chat apps unless the hackathon specifically asks for them
- "Get Started" buttons that go nowhere
- Fake data or placeholder content — use realistic mock data
- Identical component structures across projects

MANDATORY — Vary your output:
- Architecture: Choose structure that fits the problem (real-time? use WebSockets. Data-heavy? use charts. Mobile? use touch-optimized UI)
- UI direction: Different layout, color palette, typography, and component structure for each project
- Features: Address the SPECIFIC judging criteria and sponsor APIs — not generic feature cards
- README: Explain architecture decisions and how they relate to this hackathon
- APIs: Use the exact sponsor APIs mentioned in the context — show them in the UI, not just in package.json

JUDGING ALIGNMENT (this is how you win):
- Read the judging criteria weights — spend effort proportional to weight
- If "Innovation" is 40%, your project MUST have a distinctive technical approach
- If "Design" is 30%, your UI must be polished with consistent spacing, typography, and color
- If "Technical Difficulty" is 20%, show real API integration, data processing, or complex state
- If "Completeness" is 10%, ensure all features work end-to-end

SPONSOR API INTEGRATION (this is how you score bonus points):
- Import the sponsor SDK in package.json AND use it in actual code
- Show the API response in the UI — don't just call it silently
- Add error handling for API failures — judges notice this
- If the API has a free tier, mention it in README

RULES:
- Export default for components. Define types inline. { children: React.ReactNode }
- Import with @/ alias. Generate every imported file. NEVER leave dangling imports.
- SEMICOLONS. Newlines between functions.
- Use Tailwind CSS utility classes for all styling. Use className="..." not "class=".
- Create working, interactive pages — not just static mockups.
- Every page must have a clear purpose that maps to a judging criterion
- Use realistic domain-specific content, not "Lorem ipsum" or "TODO"

THEME-SPECIFIC STYLING (adapt to the hackathon domain):
- AI/ML hackathon: Data visualizations, model outputs, gradient accents, dark theme
- Healthcare: Calming blues/greens, clean typography, medical iconography
- Fintech: Professional dark theme, charts, numerical displays, trust signals
- Climate/Green: Earth tones, nature imagery, sustainability metrics
- Gaming: Bold colors, animations, playful typography, game-like UI
- Developer tools: Monospace fonts, terminal aesthetics, dark backgrounds
- Social/Community: Warm colors, avatars, activity feeds, engagement metrics

OUTPUT: Return ONLY valid JSON (no markdown, no fences, no code blocks):
{ "files": [{ "path": "...", "content": "..." }] }

PRIORITIES:
1. Working demo — judges can interact with it
2. Visible sponsor API integration matching the hackathon's sponsor APIs
3. Domain-appropriate UI that reflects the hackathon theme
4. README that explains what you built, why it wins, and how to run it

One fully working page beats 5 half-finished ones.
`;

// The `frontend`, `backend`, `database` entries embed `${context.specificTask}`.
// At module scope that identifier is unavailable, so the placeholder `{specificTask}`
// is used here and substituted at the (single) call site, preserving exact runtime output.
export const LLM_TASK_DESCRIPTIONS: Record<string, string> = {
  scaffold: `Generate the full hackathon project. Include: package.json, tsconfig.json, tailwind.config.js, postcss.config.js, .gitignore, src/app/globals.css, src/app/layout.tsx, src/app/page.tsx, src/app/loading.tsx, src/app/error.tsx, README.md.

LANDING PAGE (page.tsx) REQUIREMENTS:
- The page MUST demonstrate the core value proposition immediately — no "Welcome" or "Get Started" headers
- Show the actual product in action: a working demo, data visualization, interactive component, or live API call
- Use domain-appropriate design: not always centered-hero-with-buttons
- Include realistic mock data that demonstrates the use case
- Add interactive elements: buttons that do something, forms that submit, toggles that switch views
- Map each section to a judging criterion (e.g., "Innovation" section shows the unique approach)

LAYOUT VARIATION (pick one that fits the hackathon):
- Split-screen: demo on left, explanation on right
- Dashboard: data-heavy with charts and metrics
- Step-by-step: wizard-style flow showing the process
- Dashboard-grid: bento layout with multiple data views
- Full-screen demo: the entire page IS the product
- Sidebar + main: navigation on side, content area (only if complex app)

COLOR PALETTE (pick based on domain):
- AI/ML: Deep purples (#7c3aed) + electric blue (#3b82f6) on dark (#0f172a)
- Healthcare: Calming teal (#0d9488) + soft white (#f8fafc) on light
- Fintech: Professional slate (#334155) + gold accent (#eab308) on dark
- Climate: Forest green (#16a34a) + earth brown (#92400e) on cream
- Gaming: Hot pink (#ec4899) + cyan (#06b6d4) on dark
- Developer: Monochrome (#1e293b) + terminal green (#22c55e) on black
- Social: Warm orange (#f97316) + coral (#f43f5e) on white`,
  frontend: `Generate frontend code for: {specificTask}. ONE file per component. Use Tailwind CSS classes. Merge into existing files when possible. Requirements:
- Component must have typed props and handle loading/error/empty states
- Use realistic mock data, not placeholder text
- Add interactive elements (onClick handlers, state changes, form submissions)
- Include proper ARIA labels for accessibility
- Vary the component structure — do not generate the same pattern every time`,
  backend: `Generate API route for: {specificTask}. ONE file per route. Use Next.js App Router API routes. Requirements:
- Validate input at the boundary (check required fields, types)
- Return structured JSON responses with consistent shape: { data?: T, error?: { message: string, code: string } }
- Handle errors gracefully — never throw raw errors to the client
- Include realistic mock data or database queries`,
  database: `Generate database schema for: {specificTask}. Single schema file. Requirements:
- Define tables with explicit types, primary keys, and foreign keys
- Add indexes for common query patterns
- Include seed data for demo purposes`,
  config: `Generate one config file.`,
};
