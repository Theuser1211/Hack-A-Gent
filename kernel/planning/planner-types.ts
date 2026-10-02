import { z } from 'zod';

// ── Hackathon Input ────────────────────────────────────────────────────────

export const UserPreferencesSchema = z.object({
  team_size: z.enum(['solo', 'small', 'medium', 'large']).optional(),
  platform: z.enum(['web', 'mobile', 'desktop', 'cli', 'api', 'hardware', 'ai']).optional(),
  experience: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  preferred_stack: z.array(z.string()).optional(),
  sponsor_apis_allowed: z.boolean().optional(),
  preferred_track: z.string().optional(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const HackathonInputSchema = z.object({
  hackathon_url: z.string().url().optional(),
  hackathon_description: z.string().optional(),
  raw_text: z.string().optional(),
  preferences: UserPreferencesSchema.optional(),
});

export type HackathonInput = z.infer<typeof HackathonInputSchema>;

// ── Extracted Hackathon Data ───────────────────────────────────────────────

export const TrackSchema = z.object({
  name: z.string(),
  description: z.string(),
  sponsor: z.string().optional(),
});

export type Track = z.infer<typeof TrackSchema>;

export const JudgingCriterionSchema = z.object({
  name: z.string(),
  weight: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
});

export type JudgingCriterion = z.infer<typeof JudgingCriterionSchema>;

export const SponsorTechnologySchema = z.object({
  sponsor_name: z.string(),
  technology: z.string(),
  documentation_url: z.string().url().optional(),
  prize_category: z.string().optional(),
});

export type SponsorTechnology = z.infer<typeof SponsorTechnologySchema>;

export const TimelineSchema = z.object({
  start_date: z.string().optional(),
  submission_deadline: z.string(),
  judging_period: z.string().optional(),
  winners_announced: z.string().optional(),
});

export type Timeline = z.infer<typeof TimelineSchema>;

export const SubmissionRequirementSchema = z.object({
  category: z.string(),
  description: z.string(),
  required: z.boolean().default(true),
});

export type SubmissionRequirement = z.infer<typeof SubmissionRequirementSchema>;

export const HackathonDataSchema = z.object({
  hackathon_name: z.string(),
  theme: z.string().optional(),
  tracks: z.array(TrackSchema).default([]),
  judging_criteria: z.array(JudgingCriterionSchema).default([]),
  sponsor_technologies: z.array(SponsorTechnologySchema).default([]),
  timeline: TimelineSchema.optional(),
  submission_requirements: z.array(SubmissionRequirementSchema).default([]),
  description: z.string().optional(),
});

export type HackathonData = z.infer<typeof HackathonDataSchema>;

// ── Project Idea ───────────────────────────────────────────────────────────

export const ProjectIdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tracks: z.array(z.string()).default([]),
  difficulty: z.number().min(1).max(10),
  innovation: z.number().min(1).max(10),
  estimated_build_time_hours: z.number().positive(),
  risks: z.array(z.string()).default([]),
  key_features: z.array(z.string()).default([]),
  required_skills: z.array(z.string()).default([]),
  sponsor_technology_used: z.array(z.string()).default([]),
});

export type ProjectIdea = z.infer<typeof ProjectIdeaSchema>;

// ── Risk ───────────────────────────────────────────────────────────────────

export const RiskSchema = z.object({
  category: z.enum(['technical', 'time', 'scope', 'team', 'sponsor', 'external']),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  mitigation: z.string().optional(),
});

export type Risk = z.infer<typeof RiskSchema>;

// ── Unknown / Question ─────────────────────────────────────────────────────

export const UnknownSchema = z.object({
  category: z.string(),
  question: z.string(),
  impact: z.enum(['low', 'medium', 'high']),
});

export type Unknown = z.infer<typeof UnknownSchema>;

export const RecommendedQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  context: z.string(),
  priority: z.enum(['essential', 'recommended', 'nice_to_have']),
});

export type RecommendedQuestion = z.infer<typeof RecommendedQuestionSchema>;

// ── Planner Output ─────────────────────────────────────────────────────────

export const PlannerOutputSchema = z.object({
  summary: z.string(),
  hackathon_data: HackathonDataSchema,
  project_ideas: z.array(ProjectIdeaSchema).default([]),
  risks: z.array(RiskSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  unknowns: z.array(UnknownSchema).default([]),
  recommended_questions: z.array(RecommendedQuestionSchema).default([]),
  generated_at: z.string().datetime(),
  planner_version: z.string().default('1.0.0'),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;
