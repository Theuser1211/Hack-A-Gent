import { describe, it, expect } from 'vitest';
import {
  validateChallenge,
  validateSponsors,
  validateJudgingCriteria,
  validateTracks,
  validateSubmissionRequirements,
  validateNoInferredData,
} from '../../cli/pipeline/challenge-validation.js';
import type { DevpostParseResult } from '../../cli/pipeline/types.js';
import { confirmed, inferred, unknownField } from '../../cli/confidence.js';

function makeParsed(overrides: Partial<DevpostParseResult> = {}): DevpostParseResult {
  return {
    title: 'Test Hackathon',
    problemStatement: 'Build something great',
    judgingCriteria: [],
    constraints: [],
    recommendedStack: [],
    rawText: '',
    submissionRequirements: [],
    confidence: {
      title: confirmed('Test Hackathon', 'meta tag'),
      judgingCriteria: unknownField([]),
      deadlines: unknownField([]),
      sponsorAPIs: unknownField([]),
      organizer: unknownField(''),
      techStack: unknownField([]),
      restrictions: unknownField([]),
    },
    ...overrides,
  };
}

describe('validateSponsors', () => {
  it('passes when sponsors are inside a Sponsors section heading', () => {
    const body = `<body>
      <h2>Sponsors</h2>
      <p>OpenAI, Vercel</p>
    </body>`;
    const parsed = makeParsed({
      confidence: {
        ...makeParsed().confidence!,
        sponsorAPIs: confirmed(['OpenAI', 'Vercel'], 'sponsor mentions'),
      },
    });
    const result = validateSponsors(body, parsed);
    expect(result.valid).toBe(true);
    expect(result.found).toContain('OpenAI');
  });

  it('fails when sponsors are detected but no Sponsors section heading exists', () => {
    const body = `<body>
      <nav><a href="/aws">AWS</a></nav>
      <footer>Powered by Meta</footer>
    </body>`;
    const parsed = makeParsed({
      confidence: {
        ...makeParsed().confidence!,
        sponsorAPIs: confirmed(['AWS', 'Meta'], 'sponsor mentions'),
      },
    });
    const result = validateSponsors(body, parsed);
    expect(result.valid).toBe(false);
    expect(result.found).toContain('AWS');
  });

  it('passes when no sponsors data exists and no section', () => {
    const body = `<body><h1>Hello</h1></body>`;
    const parsed = makeParsed({
      confidence: {
        ...makeParsed().confidence!,
        sponsorAPIs: unknownField([]),
      },
    });
    const result = validateSponsors(body, parsed);
    expect(result.valid).toBe(true);
    expect(result.found).toEqual([]);
  });
});

describe('validateJudgingCriteria', () => {
  it('passes when criteria are inside a Judging section heading', () => {
    const body = `<body>
      <h2>Judging Criteria</h2>
      <ul>
        <li>Innovation — 40%</li>
        <li>Technical — 35%</li>
      </ul>
    </body>`;
    const parsed = makeParsed({
      judgingCriteria: ['Innovation — 40%', 'Technical — 35%'],
    });
    const result = validateJudgingCriteria(body, parsed);
    expect(result.valid).toBe(true);
    expect(result.found).toBe(2);
  });

  it('fails when criteria exist but no Judging section heading', () => {
    const body = `<body>
      <p>Innovation — 40% is a good criterion.</p>
    </body>`;
    const parsed = makeParsed({
      judgingCriteria: ['Innovation — 40%'],
    });
    const result = validateJudgingCriteria(body, parsed);
    expect(result.valid).toBe(false);
  });

  it('passes when no criteria at all', () => {
    const body = `<body><h1>Hello</h1></body>`;
    const parsed = makeParsed({ judgingCriteria: [] });
    const result = validateJudgingCriteria(body, parsed);
    expect(result.valid).toBe(true);
  });
});

describe('validateTracks', () => {
  it('detects track headings', () => {
    const body = `<body>
      <h3>AI Track</h3>
      <h3>Web3 Track</h3>
    </body>`;
    const result = validateTracks(body);
    expect(result.valid).toBe(true);
    expect(result.found).toHaveLength(2);
    expect(result.found[0]!.toLowerCase()).toContain('ai');
  });

  it('returns empty when no track headings', () => {
    const body = `<body><h1>Hello</h1></body>`;
    const result = validateTracks(body);
    expect(result.valid).toBe(true);
    expect(result.found).toEqual([]);
  });
});

describe('validateSubmissionRequirements', () => {
  it('passes when all requirements are in a track section', () => {
    const body = `<body>
      <h3>AI Track</h3>
      <p>Build an AI model</p>
      <h3>Web3 Track</h3>
      <p>Build a dApp</p>
    </body>`;
    const parsed = makeParsed({
      submissionRequirements: ['Build an AI model', 'Build a dApp'],
    });
    const result = validateSubmissionRequirements(body, parsed, ['AI Track', 'Web3 Track']);
    expect(result.valid).toBe(true);
    expect(result.unassigned).toBe(0);
  });

  it('passes when no tracks to assign against', () => {
    const body = `<body><p>Submit a video</p></body>`;
    const parsed = makeParsed({
      submissionRequirements: ['Submit a video'],
    });
    const result = validateSubmissionRequirements(body, parsed, []);
    expect(result.valid).toBe(true);
  });

  it('passes when no requirements at all', () => {
    const parsed = makeParsed({ submissionRequirements: [] });
    const result = validateSubmissionRequirements('<body></body>', parsed, ['AI Track']);
    expect(result.valid).toBe(true);
  });
});

describe('validateNoInferredData', () => {
  it('passes when sponsors are confirmed', () => {
    const parsed = makeParsed({
      confidence: {
        ...makeParsed().confidence!,
        sponsorAPIs: confirmed(['OpenAI'], 'sponsor section'),
      },
    });
    const checks = validateNoInferredData(parsed);
    expect(checks.every(c => c.passed)).toBe(true);
  });

  it('fails when sponsors are inferred', () => {
    const parsed = makeParsed({
      confidence: {
        ...makeParsed().confidence!,
        sponsorAPIs: inferred(['OpenAI'], 'keyword match'),
      },
    });
    const checks = validateNoInferredData(parsed);
    expect(checks.some(c => !c.passed)).toBe(true);
  });

  it('passes when no sponsors at all', () => {
    const parsed = makeParsed({
      confidence: {
        ...makeParsed().confidence!,
        sponsorAPIs: unknownField([]),
      },
    });
    const checks = validateNoInferredData(parsed);
    expect(checks.every(c => c.passed)).toBe(true);
  });
});

describe('validateChallenge', () => {
  it('passes for a well-structured Devpost page', () => {
    const html = `<html><body>
      <h2>Sponsors</h2>
      <p>OpenAI and Vercel</p>
      <h2>Judging Criteria</h2>
      <ul>
        <li>Innovation — 40%</li>
        <li>Technical — 35%</li>
      </ul>
      <h3>AI Track</h3>
      <p>Build an AI model</p>
    </body></html>`;
    const parsed = makeParsed({
      judgingCriteria: ['Innovation — 40%', 'Technical — 35%'],
      rawText: html,
      submissionRequirements: ['Build an AI model'],
      confidence: {
        ...makeParsed().confidence!,
        sponsorAPIs: confirmed(['OpenAI', 'Vercel'], 'sponsor section'),
        judgingCriteria: confirmed(['Innovation — 40%', 'Technical — 35%'], 'judging section'),
      },
    });
    const result = validateChallenge(html, parsed);
    expect(result.valid).toBe(true);
    expect(result.checks.every(c => c.passed)).toBe(true);
  });

  it('fails for data from nav/footer without section headings', () => {
    const html = `<html><body>
      <nav><a href="/aws">AWS</a></nav>
      <h1>Hackathon</h1>
      <p>Innovation — 40%</p>
      <footer>Powered by Meta</footer>
    </body></html>`;
    const parsed = makeParsed({
      judgingCriteria: ['Innovation — 40%'],
      rawText: html,
      confidence: {
        ...makeParsed().confidence!,
        sponsorAPIs: confirmed(['AWS', 'Meta'], 'general text'),
      },
    });
    const result = validateChallenge(html, parsed);
    expect(result.valid).toBe(false);
    expect(result.sponsors.valid).toBe(false);
    expect(result.judgingCriteria.valid).toBe(false);
  });

  it('returns valid=true for empty/no-data pages', () => {
    const html = `<html><body><h1>Hello</h1></body></html>`;
    const parsed = makeParsed({
      rawText: html,
    });
    const result = validateChallenge(html, parsed);
    expect(result.valid).toBe(true);
  });
});
