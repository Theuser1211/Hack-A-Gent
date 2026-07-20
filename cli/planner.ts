import type { HackathonContext, ExecutionPlan } from './hackathon-context.js';

/**
 * Generates a context-aware execution plan.
 * The planner thinks like a senior hackathon mentor:
 * - Prefers simpler solutions over complex ones
 * - Every feature must explain why it increases win probability
 * - Architecture fits the hackathon, not personal preference
 * - Includes demo strategy and submission prep
 */
export class HackathonPlanner {
  private readonly ctx: HackathonContext;

  constructor(ctx: HackathonContext) {
    this.ctx = ctx;
  }

  plan(): ExecutionPlan {
    const { ctx } = this;

    return {
      title: ctx.projectName,
      targetPrize: this.determineTargetPrize(),
      estimatedTime: this.formatTime(ctx.hoursRemaining),
      strategy: this.buildStrategy(),
      architecture: this.selectArchitecture(),
      features: this.selectFeatures(),
      risks: this.assessRisks(),
      timeline: this.buildTimeline(),
      demoStrategy: this.buildDemoStrategy(),
      submissionStrategy: this.buildSubmissionStrategy(),
    };
  }

  private buildStrategy(): string[] {
    const { ctx } = this;
    const s: string[] = [];
    const tight = ctx.hoursRemaining <= 3;
    const moderate = ctx.hoursRemaining <= 8;

    // Time-awareness — specific, not generic
    if (tight) {
      s.push('Ship one working feature that judges can see. Nothing else matters if the demo is broken.');
      s.push('Skip auth, skip tests, skip documentation until the core demo works.');
      s.push('Deploy before building anything else. A live URL is worth more than a polished localhost.');
    } else if (moderate) {
      s.push('Core workflow + one memorable detail. Judges remember one thing — make it the right thing.');
      s.push('Deploy after the first feature works. Iterate on a live URL, not localhost.');
    } else {
      s.push('Build the MVP first. Then add one wow moment. Then polish. In that order.');
    }

    // Team — practical splits, not generic "divide work"
    if (ctx.teamSize <= 1) {
      s.push('Work sequentially: frontend → backend → deploy → demo prep. Context-switching kills momentum for solo devs.');
    } else if (ctx.teamSize >= 3) {
      s.push(`Split: person 1 = core feature, person 2 = sponsor APIs + deploy, person 3 = UI + demo prep. No overlap.`);
    } else if (ctx.teamSize === 2) {
      s.push('Split: one builds features, the other handles deployment, sponsor APIs, and the demo script.');
    }

    // Goal-driven
    if (ctx.primaryGoal === 'sponsor_prize' && ctx.sponsorPrizes.length > 0) {
      s.push(`Target ${ctx.sponsorPrizes[0]!.sponsor} prize explicitly. Build the demo around their API, not the other way around.`);
    }

    // Sponsor requirements
    if (ctx.requiredAPIs.length > 0) {
      s.push(`Required: ${ctx.requiredAPIs.join(', ')}. Integrate first, build features on top. Verify eligibility before polishing.`);
    }

    // Judging criteria — practical alignment
    const top = [...ctx.judgingCriteria].sort((a, b) => b.weight - a.weight).slice(0, 2);
    if (top.length > 0) {
      s.push(`Lead the demo with ${top[0]!.name} (${top[0]!.weight}% of score). The opening 30 seconds determines the judge's impression.`);
      if (top[1]) {
        s.push(`Secondary focus: ${top[1]!.name} (${top[1]!.weight}%). Mention it early, demonstrate it mid-way.`);
      }
    }

    // Simplicity rule
    s.push('No Kubernetes, no microservices, no event buses. If it takes longer than 30 minutes to set up, find a simpler alternative.');

    return s;
  }

  private selectArchitecture(): string {
    const { ctx } = this;
    const tight = ctx.hoursRemaining <= 3;
    const moderate = ctx.hoursRemaining <= 8;

    // If user has a preferred stack, use it
    if (ctx.preferredStack.length > 0) {
      const stack = ctx.preferredStack[0]!;
      const lc = stack.toLowerCase();
      if (lc.includes('next')) return 'Next.js + Vercel: zero-config deploy, works in 5 minutes';
      if (lc.includes('react')) return 'React + Vite + GitHub Pages: no backend needed, deploy in 2 minutes';
      if (lc.includes('vue')) return 'Vue + Netlify: simple SPA, instant deploy';
      if (lc.includes('python') || lc.includes('flask') || lc.includes('django')) return 'Flask + Render: API-first, minimal setup';
      if (lc.includes('svelte')) return 'SvelteKit + Vercel: less code than React, faster builds';
      if (lc.includes('vanilla') || lc.includes('html')) return 'Single HTML file + CSS/JS: zero dependencies, deploy anywhere';
      return `${stack} — preferred by user`;
    }

    // Extreme time pressure — single file approach
    if (tight && ctx.hoursRemaining <= 1) {
      return 'Single HTML file with embedded CSS/JS: one file, deploy to any static host, zero build step';
    }

    // AI/ML sponsor — use Python/FastAPI to match
    if (tight && ctx.requiredAPIs.some(a => /ai|openai|gemini|hugging/i.test(a))) {
      return 'Python + FastAPI + Streamlit (quick AI demo) or Next.js + Vercel AI SDK (if JS preferred)';
    }

    // Sponsor API detection — choose framework that matches
    if (ctx.requiredAPIs.length > 0) {
      const apis = ctx.requiredAPIs.join(' ').toLowerCase();
      if (apis.includes('firebase')) return 'Vanilla JS + Firebase Hosting: direct Firebase integration, no framework overhead';
      if (apis.includes('twilio')) return 'Node.js + Express + Render: SMS/voice APIs work natively';
      if (apis.includes('stripe')) return 'Next.js + Stripe SDK: best payment integration DX';
      if (apis.includes('supabase')) return 'SvelteKit + Supabase: real-time ready, minimal boilerplate';
    }

    // Moderate time — lightweight full-stack
    if (moderate) {
      if (ctx.teamSize <= 1) return 'Next.js (single repo): frontend + API routes + deploy from one project. No separate backend needed.';
      return 'Next.js + SQLite (via better-sqlite3): file-based DB, zero setup, good enough for judging';
    }

    // Plenty of time
    return 'Next.js + SQLite: single-process full-stack. Avoid PostgreSQL unless you need joins at scale (you probably don\'t).';
  }

  private selectFeatures(): Array<{ name: string; reason: string }> {
    const { ctx } = this;
    const features: Array<{ name: string; reason: string }> = [];
    const maxFeatures = ctx.hoursRemaining <= 3 ? 3 : ctx.hoursRemaining <= 8 ? 5 : 8;

    // 1. Working demo — always first
    features.push({
      name: 'Working core feature',
      reason: 'Without a working demo, nothing else matters. Judges test every submission.',
    });

    // 2. Sponsor API integration — if required
    if (ctx.requiredAPIs.length > 0) {
      features.push({
        name: `${ctx.requiredAPIs[0]} API integration`,
        reason: 'Required for sponsor prize eligibility. Also demonstrates real API usage to judges.',
      });
    }

    // 3. Top judging criterion alignment
    const topCriterion = [...ctx.judgingCriteria].sort((a, b) => b.weight - a.weight)[0];
    if (topCriterion) {
      const lc = topCriterion.name.toLowerCase();
      if (lc.includes('innovation') || lc.includes('creativity')) {
        features.push({
          name: 'Unique approach to problem',
          reason: `${topCriterion.name} is ${topCriterion.weight}% of the score. Judges reward novel solutions over standard CRUD apps.`,
        });
      } else if (lc.includes('technical') || lc.includes('complexity')) {
        features.push({
          name: 'Technical showcase (API integration, data processing, or real-time feature)',
          reason: `${topCriterion.name} is ${topCriterion.weight}% of the score. Demonstrate implementation depth.`,
        });
      } else if (lc.includes('impact') || lc.includes('practical')) {
        features.push({
          name: 'Realistic use case with demo data',
          reason: `${topCriterion.name} is ${topCriterion.weight}% of the score. Judges want to see real-world applicability.`,
        });
      } else if (lc.includes('design') || lc.includes('ux')) {
        features.push({
          name: 'Clean, responsive UI',
          reason: `${topCriterion.name} is ${topCriterion.weight}% of the score. First impression matters — make it look professional.`,
        });
      }
    }

    // 4. Deploy (if room)
    if (features.length < maxFeatures) {
      features.push({
        name: 'Live deployment',
        reason: 'Judges do not install projects. A URL they can click is worth more than any feature they cannot see.',
      });
    }

    // 5. README (if room and time)
    if (features.length < maxFeatures && ctx.hoursRemaining > 2) {
      features.push({
        name: 'README with demo link, stack, and judging criteria table',
        reason: 'Judges read READMEs. A clear README saves them time and frames your project in the best light.',
      });
    }

    // 6. Demo walkthrough (if room and time)
    if (features.length < maxFeatures && ctx.hoursRemaining > 1) {
      features.push({
        name: '2-minute demo video or GIF in README',
        reason: 'Judges may not have time to explore. A video shows the complete flow in 2 minutes.',
      });
    }

    return features.slice(0, maxFeatures);
  }

  private buildDemoStrategy(): string[] {
    const { ctx } = this;
    const topCriterion = [...ctx.judgingCriteria].sort((a, b) => b.weight - a.weight)[0];
    const d: string[] = [];

    // Demo order
    d.push('1. Open the live URL. First 5 seconds should show the core value proposition.');
    d.push('2. Demonstrate the main workflow end-to-end without rushing.');
    if (topCriterion) {
      d.push(`3. Explicitly call out how you addressed "${topCriterion.name}" — this is ${topCriterion.weight}% of the score.`);
    }
    d.push('4. Show sponsor API integration (if applicable). Judges specifically look for this.');
    d.push('5. End with the deployed URL visible. Judges should be able to find and test it immediately.');

    // Talking points
    d.push('');
    d.push('  Talking points:');
    d.push(`  - "We built this for ${ctx.title}"`);
    d.push(`  - "The key challenge was ${ctx.restrictions.slice(0, 1).join(', ') || 'making it work under time constraints'}"`);
    if (ctx.sponsorPrizes.length > 0) {
      d.push(`  - "We used ${ctx.sponsorPrizes[0]!.sponsor}'s API because ${ctx.sponsorPrizes[0]!.requirements.length > 0 ? 'it was required for the prize track' : 'it enables [specific capability]'}"`);
    }
    d.push('  - "The architecture is simple by design — we prioritized a working demo over complexity"');

    // Backup plan
    d.push('');
    d.push('  Backup: If the live demo fails, have screenshots and a local recording ready. Judges understand demos fail — show preparation.');

    return d;
  }

  private buildSubmissionStrategy(): string[] {
    const { ctx } = this;
    const s: string[] = [];

    // README improvements
    s.push('README must include: project description, live demo link, tech stack, setup instructions, and a judging criteria alignment table.');
    s.push('If time allows, add screenshots of the working application. Judges skim — visuals communicate faster than text.');

    // Sponsor verification
    if (ctx.requiredAPIs.length > 0) {
      s.push(`Verify sponsor eligibility: confirm ${ctx.requiredAPIs.join(', ')} is integrated and visible in the demo.`);
    }
    if (ctx.sponsorPrizes.length > 0 && ctx.requiredAPIs.length === 0) {
      s.push(`Check sponsor prize requirements: ${ctx.sponsorPrizes.map(p => p.sponsor).join(', ')} may have specific evaluation criteria beyond API usage.`);
    }

    // Deadline check
    s.push('Submission deadline check: ensure all required fields (title, description, tech stack, demo URL, team members) are filled before the deadline.');
    s.push('Last 10 minutes: no code changes. Only README edits, submission form verification, and screenshot capture.');

    return s;
  }

  private assessRisks(): Array<{ risk: string; mitigation: string }> {
    const { ctx } = this;
    const risks: Array<{ risk: string; mitigation: string }> = [];

    if (ctx.hoursRemaining <= 3) {
      risks.push({ risk: 'Not enough time to finish', mitigation: 'Ship one working feature. One complete feature beats three half-finished ones.' });
    }
    if (ctx.teamSize <= 1 && ctx.hoursRemaining <= 5) {
      risks.push({ risk: 'Solo developer trying to do too much', mitigation: 'Cut scope aggressively. You will not finish everything you plan. Choose the demo-critical path.' });
    }
    if (ctx.requiredAPIs.length > 0) {
      risks.push({ risk: `${ctx.requiredAPIs[0]} API integration fails`, mitigation: 'Integrate and verify in the first 30 minutes. If it fails, have a fallback that shows the concept without the live API.' });
    }
    if (ctx.hoursRemaining > 8) {
      risks.push({ risk: 'Scope creep with the extra time', mitigation: 'Set a hard cutoff for features at 70% of available time. Use remaining 30% for polish, demo prep, and buffer.' });
    }
    if (!ctx.preferredStack.length && !ctx.stackDetected) {
      risks.push({ risk: 'No preferred tech stack decided', mitigation: 'Use Next.js + Vercel. It is the safest default for hackathons — quick setup, zero-config deploy, large community.' });
    }

    return risks;
  }

  private buildTimeline(): string[] {
    const { ctx } = this;
    const h = ctx.hoursRemaining;
    const t: string[] = [];

    if (h <= 1) {
      t.push('0:00-0:05: Scaffold + deploy skeleton. Get a URL working immediately.');
      t.push('0:05-0:35: Build one core feature. No tests, no polish, just working.');
      t.push('0:35-0:50: Polish the demo. Ensure the flow is clear and the URL works.');
      t.push('0:50-1:00: Submit. README, screenshots, submission form.');
    } else if (h <= 3) {
      t.push('0:00-0:15: Scaffold + deploy skeleton + configure sponsor APIs.');
      t.push('0:15-1:30: Build core feature. Resist adding a second feature until the first works end-to-end.');
      t.push('1:30-2:00: Deploy, test flow, fix critical bugs.');
      t.push('2:00-2:30: README, demo prep, sponsor verification.');
      t.push('2:30-3:00: Final verification, screenshots, submit.');
    } else if (h <= 8) {
      t.push('0:00-0:30: Project setup, architecture choice, deploy skeleton.');
      t.push('0:30-3:00: Build core features. Feature freeze at 5h mark (no new features after this).');
      t.push('3:00-4:00: Sponsor API integration.');
      t.push('4:00-5:30: UI polish, responsive design, demo flow.');
      t.push('5:30-6:30: Deploy, browser test, fix deploy bugs.');
      t.push('6:30-7:30: README, demo video/screenshots, submission form prep.');
      t.push('7:30-8:00: Buffer for unexpected issues. Final submission.');
    } else {
      t.push('Phase 1 (0-4h): Core MVP + deploy. Everything else depends on this existing.');
      t.push('Phase 2 (4-8h): Feature expansion + sponsor APIs. Hard feature cutoff at 70% of total time.');
      t.push('Phase 3 (8+): Polish, testing, demo prep, README. No new features.');
    }

    return t;
  }

  private determineTargetPrize(): string {
    const { ctx } = this;
    if (ctx.primaryGoal === 'sponsor_prize' && ctx.sponsorPrizes.length > 0) {
      const best = [...ctx.sponsorPrizes].sort((a, b) => b.requirements.length - a.requirements.length)[0]!;
      return `${best.sponsor} Prize`;
    }
    if (ctx.requiredAPIs.length > 0) return `${ctx.requiredAPIs[0]} Prize`;
    return 'General competition — no specific prize targeted';
  }

  private formatTime(hours: number): string {
    if (hours < 1) return `${Math.round(hours * 60)} minutes`;
    if (hours === 1) return '1 hour';
    if (hours % 1 === 0) return `${hours} hours`;
    return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  }
}
