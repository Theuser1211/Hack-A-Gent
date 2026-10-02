---
noteId: "a2ad49d08cde11f1b695393e183977c7"
tags: []

---

# Hack-A-Gent Hardening Plan

## Generation Quality Sprint — v1.3.0

### Quality Improvements

#### 1. LLM System Prompt (orchestrator-templates.ts)

**Before**: Generic prompt that allowed SaaS dashboards, CRUD apps, landing pages
**After**: Anti-generic rules, judging alignment, sponsor integration, theme-specific styling

Key changes:
- Added 7 anti-patterns to NEVER generate (SaaS dashboards, CRUD apps, landing pages, todo apps, etc.)
- Added judging alignment guidance (Innovation 40% → distinctive approach, Design 30% → polished UI)
- Added sponsor API integration rules (import SDK, show response, handle errors)
- Added 8 theme-specific styling palettes (AI purple, healthcare teal, fintech slate, etc.)
- Added layout variation options (split-screen, dashboard, step-by-step, bento-grid, etc.)

#### 2. Scaffold Template (internet-hackathon-orchestrator.ts)

**Before**: Centered h1 + tagline + "Get Started" button
**After**: Theme-aware landing page with tabbed interface, dark theme, gradient accents

Key changes:
- Landing page now shows product in action (not just title + tagline)
- Added tabbed interface (Overview, Features, Architecture)
- Added dark theme with gradient backgrounds
- Added realistic mock data for features
- Added architecture diagram in ASCII art

#### 3. Frontend Templates

**Before**: Generic NavBar with "Features", "How It Works", "Get Started"
**After**: Hackathon-specific components with loading states, error handling, accessibility

Key changes:
- AuthForm: Added loading states, error handling, input validation, ARIA labels
- NavBar: Added mobile menu, gradient logo, active states
- globals.css: Added custom scrollbar, selection color, dark theme

#### 4. Backend Templates

**Before**: Generic CRUD items endpoint with no validation
**After**: Structured API routes with input validation, error handling, realistic mock data

Key changes:
- Schema: Added realistic tables (projects, analyses, metrics) with indexes and seed data
- Auth: Added input validation (email format, password length), structured error responses
- Data: Added realistic mock data with proper CRUD operations
- Validation: Added comprehensive validation functions (email, password, required)

#### 5. README Template

**Before**: Basic tech stack + getting started + project structure
**After**: Judge-aligned with "Why This Wins" section, judging criteria alignment table

Key changes:
- Added "Problem Statement" section
- Added "Why This Wins" section (Innovation, Technical Depth, Execution, Design)
- Added "Key Features" section with sponsor integration
- Added "Judging Criteria Alignment" table
- Added deployment instructions

#### 6. Generation Diversity System (cli/pipeline/generation-diversity.ts)

**New**: Enforces variation across generated projects

Features:
- `inferThemeStyle()`: Determines layout and color palette from hackathon theme
- `checkDiversity()`: Detects when new project is too similar to existing ones
- `diversify()`: Suggests alternative layout/color when conflicts detected
- 8 layout patterns: split-screen, dashboard, step-by-step, bento-grid, full-screen-demo, sidebar-main, centered-card, multi-column
- 8 color palettes: ai-purple, healthcare-teal, fintech-slate, climate-green, gaming-pink, developer-mono, social-orange, minimal-white
- 8 component patterns: data-visualization, interactive-form, real-time-feed, chart-dashboard, step-wizard, comparison-table, media-gallery, chat-interface

#### 7. Judge Simulation Tests (tests/unit/judge-simulation.test.ts)

**New**: Scores projects across 7 dimensions with 3 independent judges

Dimensions:
- Innovation: Novel approach, unique technical solution
- Technical Difficulty: Real API integration, complex state, data processing
- Execution: Fully working demo, no placeholder content
- Design: Polished UI, consistent typography, spacing, color
- Completeness: All features working, error handling, edge cases
- Presentation: README quality, demo narrative, talking points
- Overall: Weighted average

### Diversity Metrics

| Metric | Before | After |
|--------|--------|-------|
| Layout patterns | 1 (centered) | 8 |
| Color palettes | 1 (slate/white) | 8 |
| Component patterns | 3 (NavBar, AuthForm, Items) | 8 |
| README structure | Generic | Judge-aligned |
| Landing page | Static hero | Interactive demo |

### Judge Scores (Simulated)

| Project Type | Before | After |
|--------------|--------|-------|
| High-quality | 6.5/10 | 8.5/10 |
| Medium-quality | 4.5/10 | 6.5/10 |
| Low-quality | 2.5/10 | 4.0/10 |

### Remaining Quality Issues

1. **Improvement Pass**: Template-only, cannot add real features (only comments/boilerplate)
2. **Single LLM Call**: Only attempts LLM generation once per file type, falls back to templates
3. **Self-Review Simulation**: Scores are projected, not re-measured after improvements
4. **Package Version Normalization**: Falls back to `^1.0.0` for unknown packages
5. **Build Validation Short-circuit**: Uses all files even if <50% pass validation

### Verification Results

- **Typecheck**: 25 errors (all pre-existing), 0 new
- **Tests**: 1,175 pass, 3 fail (all pre-existing)
- **New Tests**: 24 pass (16 diversity + 8 judge simulation)
- **Build**: Succeeds

### Commits

1. `23ac246` — feat: improve generation quality - anti-generic prompts, theme-aware templates, diversity enforcement
2. `fd442ec` — test: add judge simulation scoring tests
3. `8fc591a` — fix: resolve TS errors in diversity and judge simulation files
