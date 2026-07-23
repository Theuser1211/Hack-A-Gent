import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { confirmed, inferred, unknownField, type ExtractedField } from '../confidence.js';

import type { CompetitionAnalysis, DevpostParseResult } from './types.js';

const SPONSOR_NAMES = [
  'OpenAI', 'Twilio', 'Stripe', 'Firebase', 'AWS', 'Azure', 'Supabase',
  'Vercel', 'Hugging Face', 'Gemini', 'Google', 'Microsoft', 'Meta',
  'Netlify', 'MongoDB', 'Cloudflare',
];

export class CompetitionIntelligence {
  private analyses: Array<CompetitionAnalysis> = [];

  analyze(input: DevpostParseResult): CompetitionAnalysis {
    const text = input.rawText || input.problemStatement;
    const confidence = input.confidence ?? {
      title: unknownField(input.title),
      judgingCriteria: unknownField(input.judgingCriteria),
      deadlines: unknownField([]),
      sponsorAPIs: unknownField([]),
      organizer: unknownField(''),
      techStack: unknownField(input.recommendedStack),
      restrictions: unknownField([]),
    };

    // Parse judging criteria with inferred weights
    const judgingCriteria = input.judgingCriteria.map(c => {
      const weightMatch = c.match(/(\d+)%/);
      const pointsMatch = c.match(/(\d+)\s*(?:pts|points)/i);
      const weightVal = weightMatch ? parseInt(weightMatch[1]!) : pointsMatch ? parseInt(pointsMatch[1]!) : 25;
      const cleanName = c.replace(/\(\d+%\)/, '').replace(/\d+%\s*/, '').replace(/[()]/g, '').trim();
      return {
        name: cleanName || c,
        weight: weightVal,
        weightRaw: weightMatch ? weightMatch[0] : pointsMatch ? pointsMatch[0] : 'equal',
        description: this.describeCriterion(cleanName || c),
        priority: (weightVal >= 30 ? 'critical' : weightVal >= 20 ? 'high' : weightVal >= 10 ? 'medium' : 'low') as 'critical' | 'high' | 'medium' | 'low',
      };
    });

    // Normalize weights to sum to 100
    const totalW = judgingCriteria.reduce((s, c) => s + c.weight, 0);
    if (totalW > 0 && Math.abs(totalW - 100) > 1) {
      for (const c of judgingCriteria) c.weight = Math.round((c.weight / totalW) * 100);
    }
    const finalW = judgingCriteria.reduce((s, c) => s + c.weight, 0);
    if (judgingCriteria.length > 0 && finalW !== 100) {
      judgingCriteria[judgingCriteria.length - 1]!.weight += 100 - finalW;
    }

    // Extract sponsor APIs with confidence from the parse result
    const sponsorAPIs = this.findSponsorAPIs(input);
    const sponsorConfidence = confidence.sponsorAPIs;

    // Extract deliverables
    const deliverables = this.findDeliverables(text);

    // Extract restrictions with confidence
    const restrictions = this.findRestrictions(input.constraints, text);

    // Extract deadlines with confidence
    const deadlines = this.findDeadlines(text);

    // Theme inference
    const theme = this.inferTheme(text, input.title);

    // Organizer
    const organizer = this.extractOrganizer(text);

    // Difficulty
    const difficulty = this.inferDifficulty(input.constraints, input.recommendedStack);

    // Build confidence metadata
    const extractionConfidence = {
      title: confidence.title,
      theme: theme !== 'General'
        ? inferred(theme, 'keyword match in description')
        : unknownField('General'),
      difficulty: inferred(difficulty, 'keyword analysis of constraints and stack'),
      organizer: confidence.organizer,
      participants: this.estimateParticipants(text),
      judgingCriteria: confidence.judgingCriteria,
      sponsorAPIs: sponsorConfidence,
      restrictions: confidence.restrictions,
      deadlines: confidence.deadlines,
    };

    const analysis: CompetitionAnalysis = {
      analysisId: 'ca-' + createDeterministicUuid(this.analyses.length, this.analyses.length).slice(0, 8),
      challenge: {
        title: input.title,
        problemStatement: input.problemStatement,
        theme,
        difficulty,
        estimatedParticipants: this.estimateParticipants(text).value,
        organizer: organizer.value,
      },
      judgingCriteria,
      sponsorAPIs,
      deliverables,
      restrictions: restrictions.value,
      deadlines: deadlines.value,
      extractionConfidence,
    };

    this.analyses.push(analysis);
    return analysis;
  }

  getLatest(): CompetitionAnalysis | null {
    return this.analyses.length > 0 ? this.analyses[this.analyses.length - 1]! : null;
  }

  private describeCriterion(name: string): string {
    const l = name.toLowerCase();
    if (l.includes('innovation')) return 'Originality, creativity, and novel approach';
    if (l.includes('technical') || l.includes('complexity')) return 'Technical sophistication and implementation depth';
    if (l.includes('impact')) return 'Real-world applicability and potential';
    if (l.includes('ux') || l.includes('design') || l.includes('usability')) return 'User experience and interface polish';
    if (l.includes('functionality') || l.includes('complete')) return 'Feature completeness and working functionality';
    if (l.includes('presentation') || l.includes('pitch')) return 'Demo presentation quality';
    return 'Addresses: ' + name;
  }

  /**
   * Extract sponsor APIs from the parsed input.
   * Only returns sponsors that were mentioned in the page (confirmed from parsing).
   * Does NOT assume Google → Gemini or Microsoft → Azure without evidence.
   */
  private findSponsorAPIs(input: DevpostParseResult): Array<CompetitionAnalysis['sponsorAPIs'][0]> {
    // Check if we found any sponsor mentions in the HTML (from the parser)
    const confirmedSponsors = input.confidence?.sponsorAPIs ?? unknownField([]);
    const text = input.rawText || input.problemStatement;
    const lcText = text.toLowerCase();

    const names =
      confirmedSponsors.confidence === 'confirmed' && confirmedSponsors.value.length > 0
        ? confirmedSponsors.value
        : SPONSOR_NAMES.filter(n => lcText.includes(n.toLowerCase()));

    if (names.length === 0) {
      return [];
    }

    return names.map(name => ({
      name,
      provider: name,
      description: this.describeSponsorAPI(name),
      strategicValue: this.inferSponsorPriority(name, text) as 'must_use' | 'should_use' | 'nice_to_have',
    }));
  }

  private describeSponsorAPI(name: string): string {
    const descs: Record<string, string> = {
      'OpenAI': 'GPT models for AI features',
      'Twilio': 'SMS and communication APIs',
      'Stripe': 'Payment processing',
      'Firebase': 'Backend and hosting',
      'AWS': 'Cloud infrastructure',
      'Azure': 'Cloud services',
      'Supabase': 'Open-source backend',
      'Vercel': 'Frontend deployment',
      'Hugging Face': 'AI models',
      'Gemini': 'Google AI models',
      'Google': 'Google Cloud and APIs',
      'Microsoft': 'Microsoft Azure and services',
      'Meta': 'Meta platforms and tools',
      'Netlify': 'Frontend deployment',
      'MongoDB': 'NoSQL database',
      'Cloudflare': 'CDN and edge computing',
    };
    return descs[name] || `${name} API integration`;
  }

  /**
   * Infer sponsor priority based on context, not assumptions.
   * Only elevated to must_use if the text explicitly says "required" or
   * "must use" near the sponsor name.
   */
  private inferSponsorPriority(name: string, text: string): string {
    const lc = text.toLowerCase();
    const nameLc = name.toLowerCase();
    // Check if the sponsor prize requires using their tech
    if (new RegExp(`${nameLc}.*(?:required|must|mandatory|need to use)`, 'i').test(lc) ||
        new RegExp(`(?:required|must|mandatory).*${nameLc}`, 'i').test(lc)) {
      return 'must_use';
    }
    // Check if explicitly mentioned as a sponsor prize
    if (new RegExp(`${nameLc}.*prize|prize.*${nameLc}`, 'i').test(lc)) {
      return 'should_use';
    }
    return 'nice_to_have';
  }

  private findDeliverables(text: string): Array<CompetitionAnalysis['deliverables'][0]> {
    const out: Array<CompetitionAnalysis['deliverables'][0]> = [];
    const checks = [
      { p: /github|repository/i, d: 'Source code repository', f: 'GitHub URL' },
      { p: /demo|live|deploy|url|website/i, d: 'Live demo', f: 'URL' },
      { p: /video|screencast/i, d: 'Demo video', f: 'Video URL' },
      { p: /readme|documentation/i, d: 'Documentation', f: 'README' },
    ];
    for (const c of checks) {
      if (c.p.test(text)) out.push({ description: c.d, format: c.f, required: true });
    }
    return out;
  }

  private findRestrictions(constraints: string[], text: string): ExtractedField<string[]> {
    const r = new Set(constraints);
    const pats = [
      /(?:time|duration)\s*(?:limit|constraint)[:\s]+([^.\n]+)/i,
      /(?:must\s+not|cannot|prohibited|banned)[:\s]+([^.\n]+)/i,
    ];
    for (const p of pats) {
      const m = text.match(p);
      if (m?.[1]) r.add(m[1].trim());
    }
    if (r.size > 0) {
      return { value: [...r], confidence: 'inferred', source: 'text pattern matches' };
    }
    return { value: [], confidence: 'unknown' };
  }

  private findDeadlines(text: string): ExtractedField<Array<{ label: string; date: string; type: 'submission' | 'judging' | 'demo' }>> {
    const d: Array<{ label: string; date: string; type: 'submission' | 'judging' | 'demo' }> = [];
    const pats = [
      { p: /(?:submission|deadline|due)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Submission', type: 'submission' as const },
      { p: /(?:judging|evaluation)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Judging', type: 'judging' as const },
      { p: /(?:demo\s+day|final)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Demo Day', type: 'demo' as const },
    ];
    for (const pat of pats) {
      const ms = text.matchAll(pat.p);
      for (const m of ms) { if (m[1]) d.push({ label: pat.label, date: m[1].trim(), type: pat.type }); }
    }
    if (d.length > 0) {
      return { value: d, confidence: 'inferred', source: 'date patterns in text' };
    }
    return { value: [], confidence: 'unknown' };
  }

  private inferTheme(text: string, fallbackTitle: string): string {
    const p = [/(?:theme|track)[:\s]+(.+?)(?:\.|!|\n|$)/i];
    for (const pat of p) {
      const m = text.match(pat);
      if (m?.[1]) return m[1].trim();
    }
    const terms = ['ai','ml','climate','health','education','fintech','sustainability','web3','blockchain','iot','gaming','social'];
    const found = terms.find(t => text.toLowerCase().includes(t));
    return found ? found.charAt(0).toUpperCase() + found.slice(1) : 'General';
  }

  private inferDifficulty(constraints: string[], stack: string[]): CompetitionAnalysis['challenge']['difficulty'] {
    const all = [...constraints, ...stack].join(' ').toLowerCase();
    const adv = ['blockchain','kubernetes','tensorflow','pytorch','web3','distributed','microservices'];
    const beg = ['html','css','python','beginner','starter'];
    if (adv.filter(k => all.includes(k)).length >= 2) return 'advanced';
    if (beg.filter(k => all.includes(k)).length >= 2) return 'beginner';
    if (constraints.some(c => /complex|advanced/i.test(c))) return 'advanced';
    if (constraints.some(c => /easy|simple|starter/i.test(c))) return 'beginner';
    return 'intermediate';
  }

  private estimateParticipants(text: string): ExtractedField<number> {
    const m = text.match(/(\d[\d,]*)\s*(participants|teams|submissions|entries)/i);
    if (m) {
      return { value: parseInt(m[1]!.replace(/,/g, ''), 10), confidence: 'inferred', source: 'text match' };
    }
    return { value: 500, confidence: 'unknown' };
  }

  private extractOrganizer(text: string): ExtractedField<string> {
    const m = text.match(/(?:hosted by|organized by|presented by|by)\s+([A-Z][A-Za-z0-9\s]+?)(?:\.|!|\n|$)/i);
    if (m && m[1]!.trim().length > 1 && !m[1]!.includes('Devpost')) {
      return { value: m[1]!.trim(), confidence: 'inferred', source: 'text pattern match' };
    }
    return { value: 'Unknown', confidence: 'unknown' };
  }

  /** Generate a competition brief */
  generateBrief(analysis: CompetitionAnalysis): string {
    const lines = [
      '# ' + analysis.challenge.title,
      '',
      '**Theme:** ' + analysis.challenge.theme,
      '**Difficulty:** ' + analysis.challenge.difficulty,
      '',
      '## Judging Criteria',
      ...analysis.judgingCriteria.map(c => '- ' + c.name + ': ' + c.weight + '% [' + c.priority + ']'),
      '',
      analysis.sponsorAPIs.length ? '## Sponsor APIs' : '',
      ...analysis.sponsorAPIs.map(a => '- ' + a.name + ': ' + a.description + ' [' + a.strategicValue + ']'),
      '',
      analysis.restrictions.length ? '## Restrictions' : '',
      ...analysis.restrictions.map(r => '- ' + r),
      '',
      analysis.deadlines.length ? '## Deadlines' : '',
      ...analysis.deadlines.map(d => '- ' + d.label + ': ' + d.date),
    ].filter(Boolean);

    // Add confidence note if extraction was partial
    const conf = analysis.extractionConfidence;
    if (conf) {
      const unknown = [
        conf.judgingCriteria.confidence === 'unknown' ? 'judging criteria' : null,
        conf.sponsorAPIs.confidence === 'unknown' ? 'sponsor APIs' : null,
        conf.deadlines.confidence === 'unknown' ? 'deadlines' : null,
        conf.restrictions.confidence === 'unknown' ? 'restrictions' : null,
      ].filter(Boolean);
      if (unknown.length > 0) {
        lines.push('', '> **Note:** Could not extract: ' + unknown.join(', ') + '. These fields are not confirmed.');
      }
    }

    return lines.join('\n');
  }
}
