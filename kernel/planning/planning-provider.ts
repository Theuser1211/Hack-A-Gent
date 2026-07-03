import type {
  HackathonInput,
  HackathonData,
  ProjectIdea,
  Unknown,
  RecommendedQuestion,
  Risk,
} from './planner-types.js';

// ── Planning Provider Interface ────────────────────────────────────────────

export interface PlanningProvider {
  ingestHackathon(input: HackathonInput): Promise<HackathonData>;
  generateProjectIdeas(data: HackathonData): Promise<ProjectIdea[]>;
  assessRisks(data: HackathonData, ideas: ProjectIdea[]): Promise<Risk[]>;
  identifyUnknowns(data: HackathonData, ideas: ProjectIdea[]): Promise<Unknown[]>;
  generateQuestions(unknowns: Unknown[]): Promise<RecommendedQuestion[]>;
}

// ── Mock Planning Provider ─────────────────────────────────────────────────

export class MockPlanningProvider implements PlanningProvider {
  async ingestHackathon(input: HackathonInput): Promise<HackathonData> {
    const text = input.hackathon_description ?? input.raw_text ?? '';
    const url = input.hackathon_url;

    return {
      hackathon_name: this.extractName(text, url),
      theme: this.extractTheme(text),
      tracks: [
        { name: 'General', description: 'Open track for any hackathon project' },
        { name: 'AI/ML', description: 'Projects leveraging artificial intelligence' },
        { name: 'Social Impact', description: 'Projects with positive social impact' },
      ],
      judging_criteria: [
        { name: 'Creativity', weight: 25, description: 'Originality of the idea' },
        { name: 'Technical Difficulty', weight: 25, description: 'Complexity of implementation' },
        { name: 'Polish', weight: 20, description: 'Quality of the submission' },
        { name: 'Impact', weight: 30, description: 'Potential real-world impact' },
      ],
      sponsor_technologies: [
        { sponsor_name: 'Mock Sponsor', technology: 'Mock API', prize_category: 'Best Use of Mock' },
      ],
      timeline: {
        submission_deadline: this.extractDeadline(text),
      },
      submission_requirements: [
        { category: 'Source Code', description: 'Link to public repository', required: true },
        { category: 'Demo', description: 'Video or live demo URL', required: true },
        { category: 'Description', description: 'Written description of the project', required: true },
      ],
      description: text.length > 200 ? text.slice(0, 200) + '...' : text,
    };
  }

  async generateProjectIdeas(data: HackathonData): Promise<ProjectIdea[]> {
    const theme = data.theme ?? 'general';
    const tracks = data.tracks.map((t) => t.name);

    return [
      {
        id: 'idea-001',
        title: `${this.capitalize(theme)} AI Assistant`,
        description: `Build an AI-powered assistant tailored to the "${data.hackathon_name}" theme. Uses natural language processing to help users accomplish domain-specific tasks with minimal setup.`,
        tracks,
        difficulty: 7,
        innovation: 8,
        estimated_build_time_hours: 24,
        risks: ['LLM integration complexity', 'Prompt engineering required', 'API rate limits'],
        key_features: ['Natural language interface', 'Domain-specific knowledge base', 'Real-time response'],
        required_skills: ['TypeScript', 'React', 'Node.js', 'LLM APIs'],
        sponsor_technology_used: [],
      },
      {
        id: 'idea-002',
        title: `${this.capitalize(theme)} Analytics Dashboard`,
        description: `A real-time analytics dashboard that visualizes key metrics related to ${theme}. Features customizable widgets, data export, and collaborative annotations.`,
        tracks,
        difficulty: 5,
        innovation: 6,
        estimated_build_time_hours: 16,
        risks: ['Data source availability', 'Chart library limitations'],
        key_features: ['Real-time data visualization', 'Customizable widgets', 'Export to PDF/CSV'],
        required_skills: ['TypeScript', 'React', 'Chart.js/D3.js'],
        sponsor_technology_used: [],
      },
      {
        id: 'idea-003',
        title: `${this.capitalize(theme)} Marketplace`,
        description: `A community marketplace platform connecting ${theme} enthusiasts. Includes user profiles, listing management, messaging, and rating systems.`,
        tracks,
        difficulty: 8,
        innovation: 5,
        estimated_build_time_hours: 32,
        risks: ['Scope creep', 'Authentication complexity', 'Payment integration'],
        key_features: ['User authentication', 'Listing management', 'Messaging system', 'Rating system'],
        required_skills: ['TypeScript', 'React', 'Node.js', 'Database', 'Auth'],
        sponsor_technology_used: [],
      },
      {
        id: 'idea-004',
        title: `${this.capitalize(theme)} Gamification Engine`,
        description: `Turn ${theme} participation into a game with points, badges, leaderboards, and achievements. Increases engagement through rewards and competition.`,
        tracks,
        difficulty: 6,
        innovation: 9,
        estimated_build_time_hours: 20,
        risks: ['Game mechanics balance', 'User adoption'],
        key_features: ['Points system', 'Badges and achievements', 'Leaderboards', 'Challenges'],
        required_skills: ['TypeScript', 'React', 'Node.js', 'Database'],
        sponsor_technology_used: [],
      },
      {
        id: 'idea-005',
        title: `${this.capitalize(theme)} Collaboration Hub`,
        description: `A real-time collaboration platform designed for ${theme} projects. Features shared workspaces, video chat, document co-editing, and task management.`,
        tracks,
        difficulty: 9,
        innovation: 7,
        estimated_build_time_hours: 40,
        risks: ['WebRTC complexity', 'Real-time sync challenges', 'Testing across devices'],
        key_features: ['Shared workspaces', 'Real-time co-editing', 'Video chat', 'Task management'],
        required_skills: ['TypeScript', 'React', 'WebRTC', 'WebSockets', 'Node.js'],
        sponsor_technology_used: [],
      },
    ];
  }

  async assessRisks(data: HackathonData, ideas: ProjectIdea[]): Promise<Risk[]> {
    return [
      {
        category: 'time',
        description: `All project ideas require ${Math.min(...ideas.map((i) => i.estimated_build_time_hours))}-${Math.max(...ideas.map((i) => i.estimated_build_time_hours))} hours. Ensure the team can commit this time before the deadline of ${data.timeline?.submission_deadline ?? 'the deadline'}.`,
        severity: 'high',
        mitigation: 'Choose a smaller-scoped idea (like the Analytics Dashboard) if time is constrained.',
      },
      {
        category: 'scope',
        description: 'Several ideas have feature sets that may grow during development.',
        severity: 'medium',
        mitigation: 'Define an MVP feature set and stick to it. Use the risk list to negotiate scope.',
      },
      {
        category: 'technical',
        description: 'Ideas with difficulty 7+ require experience with multiple technologies.',
        severity: 'medium',
        mitigation: 'Pair less experienced members with stronger ones on complex components.',
      },
      {
        category: 'team',
        description: 'Unknown team size and skill distribution may impact feasibility.',
        severity: 'low',
        mitigation: 'Clarify team composition before selecting the final idea.',
      },
    ];
  }

  async identifyUnknowns(data: HackathonData, ideas: ProjectIdea[]): Promise<Unknown[]> {
    return [
      {
        category: 'team',
        question: "Are you participating solo or as a team? What are team members' skill levels?",
        impact: 'high',
      },
      {
        category: 'platform',
        question: 'Do you have a preferred platform (web, mobile, desktop)?',
        impact: 'medium',
      },
      {
        category: 'experience',
        question: 'What is your experience level with the required technologies for your chosen idea?',
        impact: 'high',
      },
      {
        category: 'stack',
        question: 'Do you have a preferred tech stack or are you open to suggestions?',
        impact: 'medium',
      },
      {
        category: 'sponsor',
        question: 'Are sponsor APIs available for use? Do you need API keys or approval?',
        impact: 'medium',
      },
      {
        category: 'scope',
        question: 'Do you want to focus on a single track or build something that spans multiple tracks?',
        impact: 'low',
      },
    ];
  }

  async generateQuestions(unknowns: Unknown[]): Promise<RecommendedQuestion[]> {
    return [
      {
        id: 'q-001',
        question: "What is your team size and members' skill levels?",
        context: 'Helps narrow down project scope and complexity.',
        priority: 'essential',
      },
      {
        id: 'q-002',
        question: 'Which track(s) are you most interested in competing in?',
        context: 'Focuses ideation toward relevant judging criteria.',
        priority: 'essential',
      },
      {
        id: 'q-003',
        question: 'Do you have any constraints (time, technology, deployment)?',
        context: 'Identifies hard limits that eliminate certain ideas.',
        priority: 'recommended',
      },
      {
        id: 'q-004',
        question: 'Are sponsor prizes a priority for you?',
        context: 'If yes, ideas should incorporate sponsor technologies.',
        priority: 'recommended',
      },
      {
        id: 'q-005',
        question: 'Do you have existing code or assets to build upon?',
        context: 'Leveraging existing work can save time.',
        priority: 'nice_to_have',
      },
    ];
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private extractName(text: string, url?: string): string {
    if (url) {
      const match = url.match(/\/\/(?:www\.)?([^.]+)\.devpost/i);
      if (match) return this.capitalize(match[1]!.replace(/[_-]/g, ' '));
    }
    const lines = text.trim().split('\n');
    return lines[0]?.trim() || 'Untitled Hackathon';
  }

  private extractTheme(text: string): string | undefined {
    const themeMatch = text.match(/theme[:\s]+(.+)/i);
    return themeMatch?.[1]?.trim() ?? undefined;
  }

  private extractDeadline(text: string): string {
    const dateMatch = text.match(/(?:deadline|due|submissions?\s+close)[:\s]+(.+)/i);
    return dateMatch?.[1]?.trim() ?? 'To be determined';
  }

  private capitalize(str: string): string {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
