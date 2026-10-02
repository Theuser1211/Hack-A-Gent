// ── Core types for the conversation intelligence pipeline ───────────────────

export type Speaker = 'Agent' | 'Customer';

export interface TurnWord {
  text: string;
  atMs: number;
  durationMs: number;
}

export interface CallTurn {
  speaker: Speaker;
  startMs: number;
  words: TurnWord[];
}

export interface SampleCall {
  id: string;
  title: string;
  context: string;
  durationMs: number;
  turns: CallTurn[];
}

export interface WaveformFrame {
  atMs: number;
  level: number;
}

export interface SentimentResult {
  score: number;
  label: 'positive' | 'neutral' | 'negative';
  confidence: number;
}

export interface TopicResult {
  topic: string;
  weight: number;
}

export interface CallMetrics {
  talkTimeAgentMs: number;
  talkTimeCustomerMs: number;
  interjections: number;
  wordCount: number;
  longestTurnMs: number;
  avgResponseDelayMs: number;
}

export interface AnalysisResult {
  callId: string;
  sentiment: SentimentResult;
  topics: TopicResult[];
  actionItems: string[];
  metrics: CallMetrics;
  summary: string;
  processedLocally: boolean;
  apiBoundary: string;
}
