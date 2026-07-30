import { z } from 'zod';

export const HackathonDataSchema = z.object({
  title: z.string().optional(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  themes: z.array(z.string()).optional(),
  organizer: z.string().optional(),
  sponsorAPIs: z.array(z.object({ name: z.string(), category: z.string(), mustUse: z.boolean().optional(), strategicValue: z.number().optional(), notes: z.string().optional() })).optional(),
  judgingCriteria: z.array(z.object({ name: z.string(), weight: z.number().optional() })).optional(),
  prizes: z.array(z.string()).optional(),
  deadlines: z.array(z.string()).optional(),
  rules: z.array(z.string()).optional(),
});

export const ProjectIdeaSchema = z.object({ title: z.string(), description: z.string().optional(), techStack: z.array(z.string()).optional(), difficulty: z.string().optional() });
export const ProjectIdeaArraySchema = z.array(ProjectIdeaSchema);

export const RiskSchema = z.object({ category: z.string(), description: z.string(), severity: z.string().optional(), mitigation: z.string().optional() });
export const RiskArraySchema = z.array(RiskSchema);

export const UnknownSchema = z.object({ question: z.string(), context: z.string().optional() });
export const UnknownArraySchema = z.array(UnknownSchema);

export const RecommendedQuestionSchema = z.object({ question: z.string(), rationale: z.string().optional() });
export const RecommendedQuestionArraySchema = z.array(RecommendedQuestionSchema);

export const RecommendedStackSchema = z.object({ frontend: z.array(z.string()).optional(), backend: z.array(z.string()).optional(), database: z.array(z.string()).optional(), apis: z.array(z.string()).optional(), hosting: z.string().optional() });

export const FolderStructureSchema = z.object({ directories: z.array(z.string()).optional(), files: z.array(z.object({ path: z.string(), content: z.string().optional() })).optional() });

export const TableSchema = z.object({ name: z.string(), columns: z.array(z.object({ name: z.string(), type: z.string(), constraints: z.array(z.string()).optional() })) });
export const DatabaseSchemaSchema = z.object({ engine: z.string(), tables: z.array(TableSchema) });

export const RequestSchemaSchema = z.object({ path: z.string(), method: z.string(), requestBody: z.any().optional(), responseBody: z.any().optional() });
export const RequestSchemaArraySchema = z.array(RequestSchemaSchema);

export const ComponentSchema = z.object({ name: z.string(), description: z.string().optional(), props: z.array(z.object({ name: z.string(), type: z.string() })).optional() });
export const ComponentArraySchema = z.array(ComponentSchema);

export const BackendModuleSchema = z.object({ name: z.string(), description: z.string().optional(), endpoints: z.array(z.string()).optional(), dependencies: z.array(z.string()).optional() });
export const BackendModuleArraySchema = z.array(BackendModuleSchema);

export const MilestoneSchema = z.object({ id: z.string(), name: z.string(), description: z.string().optional(), due_offset_hours: z.number().optional(), tasks: z.array(z.string()).optional() });
export const MilestoneArraySchema = z.array(MilestoneSchema);

export const ExecutionNodeSchema = z.object({ id: z.string(), type: z.string().optional(), description: z.string().optional(), depends_on: z.array(z.string()).optional() });
export const ExecutionGraphSchema = z.object({ nodes: z.array(ExecutionNodeSchema), entryPoint: z.string() });

export const SkillRequirementSchema = z.object({ name: z.string(), level: z.string().optional() });
export const SkillRequirementArraySchema = z.array(SkillRequirementSchema);

export const ArchitectureRiskSchema = z.object({ category: z.string(), description: z.string(), severity: z.string().optional(), mitigation: z.string().optional() });
export const ArchitectureRiskArraySchema = z.array(ArchitectureRiskSchema);

export const HumanCheckpointSchema = z.object({ id: z.string(), name: z.string(), description: z.string().optional(), decision_type: z.string().optional() });
export const HumanCheckpointArraySchema = z.array(HumanCheckpointSchema);

export const GeneratedModuleSchema = z.object({ name: z.string(), type: z.string(), files: z.array(z.object({ path: z.string(), content: z.string() })), description: z.string().optional() });

export const GeneratedFileSchema = z.object({ path: z.string(), content: z.string(), language: z.string().optional() });
export const CodeGenOutputSchema = z.object({ files: z.array(GeneratedFileSchema) });

export const NormalizedHackathonSchema = z.object({ title: z.string().optional(), tagline: z.string().optional(), description: z.string().optional(), technologies: z.array(z.string()).optional(), sponsors: z.array(z.string()).optional(), prizes: z.array(z.string()).optional(), themes: z.array(z.string()).optional() });
