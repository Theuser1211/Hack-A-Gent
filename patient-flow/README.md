# Haven

> Haven — a planning agent that stress-tests your roadmap against the ways projects die and patches the top risk first.

## Problem Statement

Patient Flow is a website for healthcare providers to efficiently manage patient care. Providers could view, update, and delete records, and potential additions include medication reminders.

## Key Features
- Responsive UI with polished interactions
- Deployed live demo accessible via URL

## Why This Wins
- Foresight is not another ai dashboard — it turns "a planning agent that stress-tests your roadmap against the ways projects die and patches the top…" into a live, demo-able moment and leads with the criterion judges weight most (Technical Depth).
- Live demo URL — judges do not need to install or configure anything
- Direct alignment with top-weighted judging criteria
- Clean, focused implementation

## Tech Stack

- **Frontend**: Next.js
- **Backend**: Next.js API Routes
- **Database**: SQLite (better-sqlite3)
- **Deployment**: Vercel
- **Styling**: Tailwind CSS
- **Testing**: Vitest
- asp.net
- c#
- css
- daisy-ui
- html

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## Architecture

```
src/
├── app/              # Pages and API routes
│   ├── page.tsx      # Main demo page
│   ├── layout.tsx    # Root layout
│   └── api/          # Backend API routes
├── components/       # Reusable UI components
└── lib/              # Utilities and helpers
```

## Deployment

```bash
# Deploy to Vercel
npx vercel
```

## License

MIT