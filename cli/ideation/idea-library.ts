/**
 * Curated concept library for startup-quality brainstorming.
 *
 * Each angle is a complete, specific pitch: a clear user, a sharp pain, and a
 * concrete mechanic with an implied demo moment — the kind of "wait, that's
 * actually useful" idea judges remember. Nothing here is a generic
 * "AI-powered platform"; the LLM/API layer is added by the engine afterwards.
 */

export interface IdeaAngle {
  title: string;
  user: string;
  line: string;
}

export interface IdeaDomain {
  id: string;
  keywords: string[];
  /** Sponsor/tech keywords that make sponsorFit high for this domain. */
  techHints: string[];
  label: string;
  angles: IdeaAngle[];
}

export const IDEA_DOMAINS: IdeaDomain[] = [
  {
    id: 'ai',
    keywords: ['ai', 'ml', 'llm', 'neural', 'gpt', 'model', 'vision', 'voice', 'agent', 'intelligence', 'openai', 'gemini', 'machine learning'],
    techHints: ['openai', 'gemini', 'hugging', 'anthropic', 'cohere', 'llm'],
    label: 'AI',
    angles: [
      { title: 'Siftline', user: 'anyone with a half-remembered memory', line: 'a reverse search engine that turns a vague memory into the exact video, article, or song you cannot name' },
      { title: 'Traceback', user: 'developers', line: 'an AI detective that replays a bug from your git history and pinpoints the exact commit that introduced it' },
      { title: 'Vocalise', user: 'remote teams', line: 'a standup bot that turns messy voice notes into crisp, assignable action items with owners and dates' },
      { title: 'Foresight', user: 'founders and PMs', line: 'a planning agent that stress-tests your roadmap against the ways projects die and patches the top risk first' },
    ],
  },
  {
    id: 'health',
    keywords: ['health', 'wellness', 'mental', 'care', 'fitness', 'patient', 'medical', 'therapy', 'sleep', 'nutrition', 'senior'],
    techHints: ['openai', 'twilio', 'fitbit', 'apple health'],
    label: 'health',
    angles: [
      { title: 'Vitals', user: 'family caregivers', line: 'a care pal that spots the early signs loved ones miss and nudges the right person at the right time' },
      { title: 'Bloom', user: 'people in therapy', line: 'a five-minute check-in that turns mood patterns into a plan your therapist can actually use in session' },
      { title: 'Signal', user: 'wearable owners', line: 'an interpreter that translates sleep, heart-rate, and stress data into one honest daily score' },
      { title: 'Carelink', user: 'home care shifts', line: 'a shift handoff board so no medication, meal, or mood detail falls through the cracks between caregivers' },
    ],
  },
  {
    id: 'climate',
    keywords: ['climate', 'sustain', 'green', 'carbon', 'eco', 'energy', 'waste', 'environment', 'planet', 'solar'],
    techHints: ['openai', 'mapbox', 'stripe'],
    label: 'climate',
    angles: [
      { title: 'Drift', user: 'neighborhoods', line: 'a local carbon ledger that shows your block emissions in real time and rewards the households cutting the most' },
      { title: 'Harvest', user: 'grocers and food banks', line: 'a surplus spotter that tells them which produce to rescue before it spoils and matches it to a pickup' },
      { title: 'Ember', user: 'homeowners', line: 'an energy coach that finds the silent power drainers and re-schedules usage to the cheapest, greenest hours' },
      { title: 'Sway', user: 'commuters', line: 'a transit planner that makes the low-carbon route the obvious, fastest choice instead of the guilt trip' },
    ],
  },
  {
    id: 'education',
    keywords: ['edu', 'learn', 'study', 'school', 'teach', 'student', 'skill', 'tutor', 'course', 'classroom', 'exam'],
    techHints: ['openai', 'gemini', 'twilio'],
    label: 'learning',
    angles: [
      { title: 'StudyMesh', user: 'students', line: 'a study-group router that matches people with complementary strengths the night before the exam' },
      { title: 'Quester', user: 'self-learners', line: 'a tool that turns a dense textbook chapter into a ten-minute quest with checkpoints and instant feedback' },
      { title: 'Reteach', user: 'struggling students', line: 'a tutor that re-explains the same concept in five different styles until one finally clicks' },
      { title: 'Gradr', user: 'job-seeking graduates', line: 'a portfolio builder that extracts real skill evidence from your messy project and assignment history' },
    ],
  },
  {
    id: 'finance',
    keywords: ['finance', 'money', 'bank', 'fintech', 'budget', 'invest', 'pay', 'spend', 'save', 'crypto', 'loan', 'credit'],
    techHints: ['stripe', 'plaid', 'twilio'],
    label: 'money',
    angles: [
      { title: 'Keeper', user: 'subscription-fatigued households', line: 'a money coach that catches subscription creep and rounds up the escapees into a shared savings pool' },
      { title: 'Split', user: 'roommates and friend groups', line: 'a group-payment matcher that settles rent, trips, and dinners without anyone owing anyone' },
      { title: 'Ledgerly', user: 'freelancers', line: 'a gig-income forecaster that shows true take-home pay before you accept the job, taxes and gaps included' },
      { title: 'Pulse', user: 'young credit-card users', line: 'a buy-now-pay-later radar that flags the hidden interest before a single tap' },
    ],
  },
  {
    id: 'productivity',
    keywords: ['productivity', 'work', 'focus', 'task', 'meeting', 'calendar', 'email', 'project', 'team', 'remote', 'office', 'organization'],
    techHints: ['openai', 'twilio'],
    label: 'work',
    angles: [
      { title: 'Focusr', user: 'distracted knowledge workers', line: 'a distraction firewall that turns your attention into a visible, shareable focus streak' },
      { title: 'Catchup', user: 'teams stuck in meetings', line: 'meeting notes that write themselves — decisions, owners, and deadlines extracted live' },
      { title: 'Sift', user: 'inbox-drowning professionals', line: 'an email triage agent that answers the eighty percent of mail that does not need a human' },
      { title: 'Squad', user: 'remote teams', line: 'a team heartbeat that surfaces who is stuck, who is overloaded, and who quietly needs a break' },
    ],
  },
  {
    id: 'community',
    keywords: ['community', 'social', 'local', 'neighborhood', 'volunteer', 'civic', 'connect', 'friends', 'nonprofit', 'charity'],
    techHints: ['twilio', 'mapbox'],
    label: 'community',
    angles: [
      { title: 'Huddle', user: 'neighbors', line: 'a skill swap that pays in favors, not cash, and keeps the ledger friendly and forgiving' },
      { title: 'Handoff', user: 'volunteers', line: 'a matchmaker that fits people to two-hour shifts instead of year-long commitments' },
      { title: 'Porch', user: 'city residents', line: 'a lost-and-found for a block, so the found headphones get home the same day' },
      { title: 'Common', user: 'residents', line: 'a micro-grant ballot where people pool small money and vote on what gets fixed first' },
    ],
  },
  {
    id: 'careers',
    keywords: ['career', 'job', 'hire', 'resume', 'interview', 'portfolio', 'salary', 'recruit', 'employment', 'cv'],
    techHints: ['openai', 'gemini'],
    label: 'careers',
    angles: [
      { title: 'Candid', user: 'job seekers', line: 'an interview coach that grills you with the questions that company actually asks and scores your answers' },
      { title: 'Proof', user: 'recruiters', line: 'a skill-match radar that shows what a candidate actually built, not what they claim on a resume' },
      { title: 'Bridge', user: 'mid-career switchers', line: 'a career-path planner that maps your current skills to the shortest route to a better title' },
      { title: 'Showcase', user: 'developers and designers', line: 'a portfolio that updates itself from your shipped projects, pull requests, and talks' },
    ],
  },
  {
    id: 'accessibility',
    keywords: ['accessib', 'disability', 'elder', 'senior', 'deaf', 'blind', 'inclusion', 'language', 'barrier', 'translate'],
    techHints: ['openai', 'twilio', 'whisper'],
    label: 'accessibility',
    angles: [
      { title: 'Clear', user: 'anyone facing a wall of jargon', line: 'a plain-language layer that rewrites any form, contract, or notice into sixth-grade English' },
      { title: 'Echo', user: 'deaf and hard-of-hearing viewers', line: 'live captions that preserve the speaker tone, so laughter and sarcasm survive the transcript' },
      { title: 'Reach', user: 'mobility-challenged travelers', line: 'a wayfinding app that maps the accessible route, not just the shortest one' },
      { title: 'Airshare', user: 'quiet voices in meetings', line: 'a meeting moderator that gently balances airtime so everyone gets heard' },
    ],
  },
  {
    id: 'creative',
    keywords: ['creative', 'music', 'art', 'design', 'video', 'content', 'game', 'storytelling', 'film', 'podcast', 'writer'],
    techHints: ['openai', 'gemini', 'elevenlabs'],
    label: 'creative',
    angles: [
      { title: 'Vibes', user: 'music lovers', line: 'a playlist builder that reads your mood from typing speed and the morning calendar' },
      { title: 'Storyboard', user: 'photographers and storytellers', line: 'a tool that turns a photo dump into a shareable story with beats, captions, and pacing' },
      { title: 'Loop', user: 'podcasters', line: 'a remix engine for your own voice so every intro is on-brand without re-recording' },
      { title: 'Muse', user: 'creators in a rut', line: 'a co-writer that breaks creative block by pitching the next five directions for your idea' },
    ],
  },
  {
    id: 'civic',
    keywords: ['civic', 'government', 'public', 'city', 'open data', 'transit', 'policy', 'municipal', 'council', 'ballot'],
    techHints: ['mapbox', 'openai'],
    label: 'civic',
    angles: [
      { title: 'Watchdog', user: 'residents', line: 'a tool that turns council transcripts into a plain-language scorecard of who voted for what' },
      { title: 'Radar', user: 'homeowners', line: 'a public-data feed that alerts you the moment a permit or project touches your block' },
      { title: 'Ballot', user: 'undecided voters', line: 'a decision assistant that compares every candidate against the issues you actually care about' },
      { title: 'Fixit', user: 'constituents', line: 'a complaint tracker that shows which 311 tickets actually got fixed, and when' },
    ],
  },
  {
    id: 'food',
    keywords: ['food', 'restaurant', 'grocery', 'cook', 'kitchen', 'meal', 'cafe', 'delivery', 'recipe'],
    techHints: ['openai', 'twilio', 'stripe'],
    label: 'food',
    angles: [
      { title: 'Pantry', user: 'home cooks', line: 'a pantry scanner that invents tomorrow dinner from the ingredients about to expire' },
      { title: 'Table', user: 'diners', line: 'a last-minute seat finder that books the table nobody claimed at the restaurant around the corner' },
      { title: 'Ration', user: 'budget households', line: 'a meal-budget planner that beats inflation one grocery run at a time' },
      { title: 'Swarm', user: 'office lunch groups', line: 'a group order that splits delivery fees fairly and gets everyone fed in one trip' },
    ],
  },
];

/** Normalize a string for keyword matching. */
export function normalizeKeywords(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
}

/** Domain match strength (0 = no match) for a given theme/problem statement. */
export interface DomainMatch {
  domain: IdeaDomain;
  score: number;
}

/** Score every domain against the theme/problem statement; strongest first. */
export function scoreDomains(theme: string, problemStatement: string): DomainMatch[] {
  const haystack = normalizeKeywords(`${theme} ${problemStatement}`);
  const scored = IDEA_DOMAINS.map((domain) => {
    let score = 0;
    for (const kw of domain.keywords) {
      if (haystack.includes(kw.toLowerCase())) score += kw.length > 3 ? 2 : 1;
    }
    return { domain, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
}

/** Rank domains by how strongly they match the hackathon theme/problem statement. */
export function detectDomains(theme: string, problemStatement: string): IdeaDomain[] {
  const matched = scoreDomains(theme, problemStatement);
  // Always include the generic AI domain as a fallback so the pool is never empty.
  if (matched.length === 0) {
    const ai = IDEA_DOMAINS.find((d) => d.id === 'ai')!;
    return [ai];
  }
  // Mix in the AI domain when it didn't match, so AI ideas still compete.
  const ids = new Set(matched.map((m) => m.domain.id));
  if (!ids.has('ai')) {
    matched.push({ domain: IDEA_DOMAINS.find((d) => d.id === 'ai')!, score: 0 });
  }
  return matched.map((m) => m.domain);
}
