// Static data extracted from internet-hackathon-orchestrator.ts.
// These are pure data constants — no logic. Imported verbatim by the orchestrator.

export const KNOWN_PACKAGE_VERSIONS: Record<string, string> = { uuid: '^9.0.0', 'styled-components': '^6.0.0', 'swr': '^2.0.0', zustand: '^4.0.0', 'react-hook-form': '^7.0.0', 'react-query': '^3.0.0', '@tanstack/react-query': '^5.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0', stripe: '^14.0.0', openai: '^4.0.0', langchain: '^0.2.0', 'react-markdown': '^9.0.0', 'react-syntax-highlighter': '^15.0.0', date: 'npm:date-fns@^3.0.0', 'date-fns': '^3.0.0', lodash: '^4.0.0', axios: '^1.7.0', tailwindcss: '^3.4.0', postcss: '^8.4.0', autoprefixer: '^10.4.0', express: '^4.18.0', '@types/express': '^4.17.0', mongoose: '^8.0.0', cors: '^2.8.0', dotenv: '^16.0.0' };

export const KNOWN_PACKAGE_VERSIONS_FALLBACK: Record<string, string> = { tailwindcss: '^3.4.0', postcss: '^8.4.0', autoprefixer: '^10.4.0', express: '^4.18.0', '@types/express': '^4.17.0', mongoose: '^8.0.0', cors: '^2.8.0', dotenv: '^16.0.0', axios: '^1.7.0', uuid: '^9.0.0', 'react-hook-form': '^7.0.0', zustand: '^4.0.0', 'react-query': '^3.0.0', '@tanstack/react-query': '^5.0.0', prisma: '^5.0.0', '@prisma/client': '^5.0.0', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0', stripe: '^14.0.0', openai: '^4.0.0', 'react-markdown': '^9.0.0', 'react-syntax-highlighter': '^15.0.0', 'date-fns': '^3.0.0', lodash: '^4.0.0', 'next-auth': '^4.24.0', '@types/cors': '^2.8.0', 'socket.io': '^4.7.0', 'socket.io-client': '^4.7.0' };

export const LLM_GENERATION_SYSTEM_PROMPT = `You are building a hackathon project that could WIN. Every project must be unique — do NOT reuse the same architecture, components, UI direction, or README structure.

PRIMARY SOURCE: The STRATEGY block in the user prompt defines your application.
It contains: Key screens, Feature priority, MVP scope, API surfaces, UI direction, and judging approach.
Build exactly what the STRATEGY block describes — do NOT override it with generic layouts.

GOAL: A working demo that solves the SPECIFIC hackathon challenge. Judges should immediately see how your project addresses the problem, uses sponsor APIs, and aligns with judging criteria.

CRITICAL — NEVER generate these anti-patterns:
- Generic SaaS dashboards with sidebar + cards + tables
- CRUD apps with "Create/Read/Update/Delete" as features
- Landing pages with hero section + feature cards + CTA
- Todo apps, note apps, or chat apps unless the hackathon specifically asks for them
- "Get Started" buttons that go nowhere
- Fake data or placeholder content — use realistic mock data
- Identical component structures across projects

VERTICAL SLICE FIRST — one complete workflow, nothing else:
- Pick THE single end-to-end workflow this product exists for (from the STRATEGY block: MVP scope, Key screens, API surfaces, wow moment). Shape it as 3-5 explicit steps, e.g. input → process → result → action.
- Implement that one workflow COMPLETELY before touching any secondary feature. Every step must work and be reachable from the UI: no dead buttons, no empty states in the walkthrough, no "coming soon".
- Render the workflow as a visible stepper/progress bar on the main page so a judge can walk it top to bottom in one pass.
- Every screen/page you generate must map to (a) a screen from the STRATEGY block's "Key screens" AND (b) one step of this workflow. A screen that belongs to no workflow step is scope creep — drop it.
- Every heading, button, label and mock data item must use THIS competition's domain vocabulary (health, fintech, climate, gaming, dev-tools, AI, ...). Generic SaaS words — "Dashboard", "Welcome", "Get Started", "User Profile", "Admin Panel", "Sign in to access your dashboard" — are FAILURES unless the STRATEGY block explicitly asks for them.
- At least one sponsor/API call must be wired INTO the workflow and its result rendered in the UI — not buried in a config file.

MANDATORY — Vary your output based on the STRATEGY block:
- Architecture: Use the architecture described in the STRATEGY block
- UI direction: Build the screens listed in "Key screens" from the STRATEGY block
- Features: Implement the features listed in "Feature priority" from the STRATEGY block
- README: Explain architecture decisions and how they relate to this hackathon
- APIs: Use the exact sponsor APIs mentioned in the STRATEGY block — show them in the UI, not just in package.json

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
- The STRATEGY block defines what to build — follow it exactly
- Export default for components. Define types inline. { children: React.ReactNode }
- Import with @/ alias. Generate every imported file. NEVER leave dangling imports.
- SEMICOLONS. Newlines between functions.
- Use Tailwind CSS utility classes for all styling. Use className="..." not "class=".
- Create working, interactive pages — not just static mockups.
- Every page must map to a screen from the STRATEGY block's "Key screens"
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
1. Build the application defined by the STRATEGY block — not a generic template
2. Working demo — judges can interact with it
3. Visible sponsor API integration matching the STRATEGY block's sponsor APIs
4. Domain-appropriate UI that reflects the STRATEGY block's UI direction
5. README that explains what you built, why it wins, and how to run it

One fully working page beats 5 half-finished ones.
`;

// The `frontend`, `backend`, `database` entries embed `${context.specificTask}`.
// At module scope that identifier is unavailable, so the placeholder `{specificTask}`
// is used here and substituted at the (single) call site, preserving exact runtime output.
export const LLM_TASK_DESCRIPTIONS: Record<string, string> = {
  scaffold: `Generate the full hackathon project. Include: package.json, tsconfig.json, tailwind.config.js, postcss.config.js, .gitignore, src/app/globals.css, src/app/layout.tsx, src/app/page.tsx, src/app/loading.tsx, src/app/error.tsx, README.md.

BUILD THE APPLICATION DEFINED BY THE STRATEGY BLOCK — not a generic landing page.
The STRATEGY block contains: Key screens, Feature priority, MVP scope, API surfaces, and UI direction.
Use the STRATEGY block as your primary source for what to build.

page.tsx REQUIREMENTS:
- Build the screens listed in "Key screens" from the STRATEGY block — these ARE your application
- Each screen should be a tab, step, or section that the user navigates through
- Render THE single end-to-end workflow as a 3-5 step stepper (input → process → result), every step functional and reachable — no dead buttons, no empty states in the walkthrough
- Label every workflow step with domain-specific terms from THIS hackathon (e.g. "Patient scenario → Risk assessment → Care plan"), never "Step 1 / Step 2" or generic SaaS labels
- Show realistic mock data that demonstrates the use case (not placeholder text)
- Wire up interactive elements: buttons that do something, forms that submit, toggles that switch views
- If API surfaces are listed, show them in action — fetch from /api/* endpoints and display results
- No "Welcome" headers, no "Get Started" buttons, no "Learn More" CTAs — the page IS the product
- Use the color palette below, adapted to the hackathon domain

COLOR PALETTE (adapt to domain from STRATEGY block):
- AI/ML: Deep purples (#7c3aed) + electric blue (#3b82f6) on dark (#0f172a)
- Healthcare: Calming teal (#0d9488) + soft white (#f8fafc) on light
- Fintech: Professional slate (#334155) + gold accent (#eab308) on dark
- Climate: Forest green (#16a34a) + earth brown (#92400e) on cream
- Gaming: Hot pink (#ec4899) + cyan (#06b6d4) on dark
- Developer: Monochrome (#1e293b) + terminal green (#22c55e) on black
- Social: Warm orange (#f97316) + coral (#f43f5e) on white`,
  frontend: `Generate frontend code for: {specificTask}. ONE file per component. Use Tailwind CSS classes. Merge into existing files when possible. Requirements:
- Component must have typed props and handle loading/error/empty states
- The component implements ONE step of the hackathon's single end-to-end workflow end-to-end (state → action → result) — not a standalone screen
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
