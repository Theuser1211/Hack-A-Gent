# Deployment Guide

## Option 1: Vercel (Recommended)

1. Push your code to a GitHub repository.
2. Import the repository on [Vercel](https://vercel.com/new).
3. Vercel auto-detects Next.js — no additional configuration needed.
4. Add environment variables in the Vercel dashboard.
5. Deploy.

## Option 2: Docker

```bash
docker build -t my-hackathon-app .
docker run -p 3000:3000 my-hackathon-app
```

## Option 3: Netlify

1. Push to GitHub.
2. Import on Netlify.
3. Set build command to `npm run build` and publish directory to `dist` (Vite) or `.next` (Next.js).
4. Deploy.
