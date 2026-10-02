import type { DevpostParseResult } from './types.js';

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'required' | 'recommended';
}

export interface ChallengeValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
  sponsors: {
    valid: boolean;
    message: string;
    found: string[];
  };
  judgingCriteria: {
    valid: boolean;
    message: string;
    found: number;
  };
  tracks: {
    valid: boolean;
    message: string;
    found: string[];
  };
  submissionRequirements: {
    valid: boolean;
    message: string;
    total: number;
    unassigned: number;
  };
}

function extractBody(html: string): string {
  const m = html.match(/<body[\s>][\s\S]*?<\/body>/i);
  return m ? m[0] : html;
}

function extractSectionText(body: string, keywords: string[]): string {
  const pattern = keywords.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const headingRe = new RegExp(`<h[234][^>]*>\\s*(?:${pattern})[^<]*<\\/h[234]>`, 'i');
  const sectionMatch = body.match(headingRe);
  if (!sectionMatch) return '';
  const afterHeading = body.slice(sectionMatch.index! + sectionMatch[0].length);
  const nextHeading = afterHeading.search(/<\/?h[1-6]/i);
  return nextHeading > 0 ? afterHeading.slice(0, nextHeading) : afterHeading;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countSponsorNameOccurrences(text: string, names: string[]): number {
  let count = 0;
  for (const name of names) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(text)) count++;
  }
  return count;
}

function extractTrackHeadings(body: string): string[] {
  const tracks: string[] = [];
  const trackRe = /<h[234][^>]*>([^<]*(?:track|prize|challenge|category)[^<]*)<\/h[234]>/gi;
  let m: RegExpExecArray | null;
  while ((m = trackRe.exec(body)) !== null) {
    const name = stripHtml(m[1]!).trim();
    if (name && !tracks.includes(name)) tracks.push(name);
  }
  return tracks;
}

function extractListItemTexts(sectionText: string): string[] {
  const items: string[] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(sectionText)) !== null) {
    const text = stripHtml(m[1]!).trim();
    if (text) items.push(text);
  }
  return items;
}

export function validateSponsors(body: string, parsed: DevpostParseResult): { valid: boolean; message: string; found: string[] } {
  const sponsorSectionText = extractSectionText(body, ['sponsor', 'partner', 'supported by']);
  if (!sponsorSectionText) {
    const sponsorNames = (parsed.confidence?.sponsorAPIs?.value ?? []).length > 0
      ? parsed.confidence!.sponsorAPIs!.value
      : [];
    if (sponsorNames.length > 0) {
      return {
        valid: false,
        message: `Found ${sponsorNames.length} sponsor(s) (${sponsorNames.join(', ')}) but no Sponsors section heading exists in the HTML. These may be false positives from navigation, footer badges, or OG meta tags.`,
        found: sponsorNames,
      };
    }
    return { valid: true, message: 'No sponsors detected and no Sponsors section expected.', found: [] };
  }
  const sectionPlain = stripHtml(sponsorSectionText).toLowerCase();
  const namesInSection = (parsed.confidence?.sponsorAPIs?.value ?? []).filter(n =>
    sectionPlain.includes(n.toLowerCase()),
  );
  if (namesInSection.length === 0 && (parsed.confidence?.sponsorAPIs?.value ?? []).length > 0) {
    return {
      valid: false,
      message: `Sponsor names found in parsed data but none appear within the Sponsors section heading. Potential false positives.`,
      found: parsed.confidence?.sponsorAPIs?.value ?? [],
    };
  }
  return { valid: true, message: `${namesInSection.length} sponsor(s) confirmed within Sponsors section.`, found: namesInSection };
}

export function validateJudgingCriteria(body: string, parsed: DevpostParseResult): { valid: boolean; message: string; found: number } {
  const criteriaCount = parsed.judgingCriteria.length;
  if (criteriaCount === 0) {
    return { valid: true, message: 'No judging criteria to validate.', found: 0 };
  }

  const sectionText = extractSectionText(body, ['judging', 'criteria', 'evaluation', 'scoring']);
  if (!sectionText) {
    return {
      valid: false,
      message: `${criteriaCount} judging criteria found but no Judging/Criteria section heading exists. These may be inferred from general text patterns rather than an actual criteria list.`,
      found: criteriaCount,
    };
  }

  const sectionPlain = stripHtml(sectionText).toLowerCase();
  const confirmed: string[] = [];
  for (const c of parsed.judgingCriteria) {
    const cLc = c.toLowerCase();
    if (sectionPlain.includes(cLc) || sectionPlain.includes(cLc.replace(/[^a-z0-9 ]/g, '').trim())) {
      confirmed.push(c);
    }
  }

  if (confirmed.length === 0 && criteriaCount > 0) {
    return {
      valid: false,
      message: `${criteriaCount} criteria found but none confirmed within a Judging/Criteria section.`,
      found: criteriaCount,
    };
  }

  return {
    valid: confirmed.length === criteriaCount,
    message: `${confirmed.length}/${criteriaCount} criteria confirmed within Judging section.`,
    found: criteriaCount,
  };
}

export function validateTracks(body: string): { valid: boolean; message: string; found: string[] } {
  const tracks = extractTrackHeadings(body);
  if (tracks.length === 0) {
    return { valid: true, message: 'No track/prize headings found — assuming single-track challenge.', found: [] };
  }
  return { valid: true, message: `${tracks.length} track(s) found: ${tracks.join(', ')}`, found: tracks };
}

export function validateSubmissionRequirements(body: string, parsed: DevpostParseResult, tracks: string[]): { valid: boolean; message: string; total: number; unassigned: number } {
  const reqs = parsed.submissionRequirements;
  if (reqs.length === 0) {
    return { valid: true, message: 'No submission requirements to validate.', total: 0, unassigned: 0 };
  }

  if (tracks.length === 0) {
    return { valid: true, message: `${reqs.length} requirement(s) — no explicit tracks to assign against.`, total: reqs.length, unassigned: 0 };
  }

  let unassigned = 0;
  const bodyLc = body.toLowerCase();
  for (const req of reqs) {
    const reqLc = req.toLowerCase();
    const assignedToTrack = tracks.some(t => {
      const trackSection = extractSectionText(body, [t]);
      return trackSection && trackSection.toLowerCase().includes(reqLc);
    });
    if (!assignedToTrack) unassigned++;
  }

  return {
    valid: unassigned === 0,
    message: unassigned === 0
      ? `All ${reqs.length} requirement(s) are associated with a track.`
      : `${unassigned}/${reqs.length} requirement(s) could not be assigned to any track.`,
    total: reqs.length,
    unassigned,
  };
}

export function validateNoInferredData(parsed: DevpostParseResult): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const sponsorConfidence = parsed.confidence?.sponsorAPIs;
  if (sponsorConfidence && sponsorConfidence.value.length > 0) {
    if (sponsorConfidence.confidence === 'inferred') {
      checks.push({
        name: 'sponsor-inferred',
        passed: false,
        message: `Sponsor name "${sponsorConfidence.value[0]}" was inferred (not confirmed in HTML). No fabricated sponsor names allowed.`,
        severity: 'required',
      });
    } else if (sponsorConfidence.confidence === 'unknown') {
      checks.push({
        name: 'sponsor-unknown',
        passed: true,
        message: 'No sponsors detected.',
        severity: 'required',
      });
    } else {
      checks.push({
        name: 'sponsor-confirmed',
        passed: true,
        message: `Sponsors confirmed: ${sponsorConfidence.value.join(', ')}`,
        severity: 'required',
      });
    }
  } else {
    checks.push({
      name: 'sponsor-none',
      passed: true,
      message: 'No sponsors data to validate.',
      severity: 'required',
    });
  }

  return checks;
}

export function validateChallenge(html: string, parsed: DevpostParseResult): ChallengeValidationResult {
  const body = extractBody(html);

  const sponsorCheck = validateSponsors(body, parsed);
  const judgingCheck = validateJudgingCriteria(body, parsed);
  const trackCheck = validateTracks(body);
  const submissionCheck = validateSubmissionRequirements(body, parsed, trackCheck.found);

  const inferenceChecks = validateNoInferredData(parsed);

  const allChecks: ValidationCheck[] = [
    {
      name: 'sponsors-from-section',
      passed: sponsorCheck.valid,
      message: sponsorCheck.message,
      severity: 'required',
    },
    {
      name: 'judging-from-section',
      passed: judgingCheck.valid,
      message: judgingCheck.message,
      severity: 'required',
    },
    {
      name: 'tracks-parsed',
      passed: trackCheck.valid,
      message: trackCheck.message,
      severity: 'recommended',
    },
    {
      name: 'requirements-assigned',
      passed: submissionCheck.valid,
      message: submissionCheck.message,
      severity: 'required',
    },
    ...inferenceChecks,
  ];

  return {
    valid: allChecks.every(c => c.severity === 'recommended' ? true : c.passed),
    checks: allChecks,
    sponsors: sponsorCheck,
    judgingCriteria: judgingCheck,
    tracks: trackCheck,
    submissionRequirements: submissionCheck,
  };
}
