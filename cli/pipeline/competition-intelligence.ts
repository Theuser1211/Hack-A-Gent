import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';

import type { CompetitionAnalysis, DevpostParseResult } from './types.js';

export class CompetitionIntelligence {
  private analyses: Array<CompetitionAnalysis> = [];

  analyze(input: DevpostParseResult): CompetitionAnalysis {
    const text = input.rawText || input.problemStatement;
    
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
    // Fix rounding
    const finalW = judgingCriteria.reduce((s, c) => s + c.weight, 0);
    if (judgingCriteria.length > 0 && finalW !== 100) {
      judgingCriteria[judgingCriteria.length - 1]!.weight += 100 - finalW;
    }

    // Extract sponsor APIs from text and stack
    const sponsorAPIs = this.findSponsorAPIs(text, input.recommendedStack);
    
    // Extract deliverables
    const deliverables = this.findDeliverables(text);
    
    // Extract restrictions
    const restrictions = this.findRestrictions(input.constraints, text);
    
    // Extract deadlines
    const deadlines = this.findDeadlines(text);
    
    // Theme inference
    const theme = this.inferTheme(text, input.title);

    const analysis: CompetitionAnalysis = {
      analysisId: 'ca-' + createDeterministicUuid(this.analyses.length, this.analyses.length).slice(0, 8),
      challenge: {
        title: input.title,
        problemStatement: input.problemStatement,
        theme,
        difficulty: this.inferDifficulty(input.constraints, input.recommendedStack),
        estimatedParticipants: this.estimateParticipants(text),
        organizer: this.extractOrganizer(text),
      },
      judgingCriteria,
      sponsorAPIs,
      deliverables,
      restrictions,
      deadlines,
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

  private findSponsorAPIs(text: string, stack: string[]): Array<CompetitionAnalysis['sponsorAPIs'][0]> {
    const knownSponsors: Record<string, { provider: string; desc: string }> = {
      'openai': { provider: 'OpenAI', desc: 'GPT models for AI features' },
      'twilio': { provider: 'Twilio', desc: 'SMS and communication APIs' },
      'stripe': { provider: 'Stripe', desc: 'Payment processing' },
      'firebase': { provider: 'Firebase', desc: 'Backend and hosting' },
      'aws': { provider: 'AWS', desc: 'Cloud infrastructure' },
      'azure': { provider: 'Azure', desc: 'Cloud services' },
      'supabase': { provider: 'Supabase', desc: 'Open-source backend' },
      'vercel': { provider: 'Vercel', desc: 'Frontend deployment' },
      'huggingface': { provider: 'Hugging Face', desc: 'AI models' },
    };
    const lt = text.toLowerCase();
    const ls = stack.map(s => s.toLowerCase());
    return Object.entries(knownSponsors)
      .filter(([kw]) => ls.some(s => s.includes(kw)) || lt.includes(kw))
      .map(([kw, info]) => ({
        name: info.provider,
        provider: info.provider,
        description: info.desc,
        strategicValue: (new RegExp('sponsor.*' + kw + '|' + kw + '.*prize', 'i').test(text) ? 'must_use' : 'should_use') as 'must_use' | 'should_use' | 'nice_to_have',
      }));
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

  private findRestrictions(constraints: string[], text: string): string[] {
    const r = new Set(constraints);
    const pats = [/(?:time|duration)\s*(?:limit|constraint)[:\s]+([^.\n]+)/i, /(?:must\s+not|cannot|prohibited|banned)[:\s]+([^.\n]+)/i];
    for (const p of pats) { const m = text.match(p); if (m?.[1]) r.add(m[1].trim()); }
    return [...r];
  }

  private findDeadlines(text: string): Array<CompetitionAnalysis['deadlines'][0]> {
    const d: Array<CompetitionAnalysis['deadlines'][0]> = [];
    const pats = [
      { p: /(?:submission|deadline|due)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Submission', type: 'submission' as const },
      { p: /(?:judging|evaluation)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Judging', type: 'judging' as const },
      { p: /(?:demo\s+day|final)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Demo Day', type: 'demo' as const },
    ];
    for (const pat of pats) {
      const ms = text.matchAll(pat.p);
      for (const m of ms) { if (m[1]) d.push({ label: pat.label, date: m[1].trim(), type: pat.type }); }
    }
    return d;
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
    return 'intermediate' as const;
  }

  private estimateParticipants(text: string): number {
    const m = text.match(/(\d[\d,]*)\s*(participants|teams|submissions|entries)/i);
    return m ? parseInt(m[1]!.replace(/,/g, ''), 10) : 500;
  }

  private extractOrganizer(text: string): string {
    const m = text.match(/(?:hosted by|organized by|presented by|by)\s+([A-Z][A-Za-z0-9\s]+?)(?:\.|!|\n|$)/i);
    return m ? m[1]!.trim() : 'Unknown';
  }

  /** Generate a competition brief */
  generateBrief(analysis: CompetitionAnalysis): string {
    return [
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
    ].filter(Boolean).join('\n');
  }
}
