import { z } from 'zod';

export const TestStepActionSchema = z.enum([
  'navigate',
  'click',
  'type',
  'wait',
  'assert',
  'screenshot',
  'scroll',
  'hover',
  'select',
]);
export type TestStepAction = z.infer<typeof TestStepActionSchema>;

export const TestAssertionSchema = z.object({
  type: z.enum([
    'url',
    'title',
    'text_visible',
    'element_exists',
    'element_not_exists',
    'console_error_count',
    'network_error_count',
    'custom_js',
  ]),
  expected: z.union([z.string(), z.number(), z.boolean()]),
  actual: z.union([z.string(), z.number(), z.boolean()]).optional(),
  passed: z.boolean(),
  message: z.string(),
});
export type TestAssertion = z.infer<typeof TestAssertionSchema>;

export const TestStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  action: TestStepActionSchema,
  selector: z.string().optional(),
  value: z.string().optional(),
  url: z.string().optional(),
  wait_ms: z.number().int().nonnegative().optional(),
  assertions: z.array(TestAssertionSchema).default([]),
});
export type TestStep = z.infer<typeof TestStepSchema>;

export const TestPlanSchema = z.object({
  name: z.string(),
  base_url: z.string(),
  steps: z.array(TestStepSchema),
  screenshots: z.array(z.string()).default([]),
  timeout_ms: z.number().int().positive().default(30000),
});
export type TestPlan = z.infer<typeof TestPlanSchema>;

export const ScreenshotArtifactSchema = z.object({
  name: z.string(),
  data_base64: z.string(),
  mime_type: z.string().default('image/png'),
  captured_at: z.string().datetime(),
  viewport: z.object({ width: z.number(), height: z.number() }).optional(),
  step_id: z.string().optional(),
});
export type ScreenshotArtifact = z.infer<typeof ScreenshotArtifactSchema>;

export const DomSnapshotSchema = z.object({
  url: z.string(),
  title: z.string(),
  html: z.string(),
  captured_at: z.string().datetime(),
  step_id: z.string().optional(),
  viewport: z.object({ width: z.number(), height: z.number() }).optional(),
});
export type DomSnapshot = z.infer<typeof DomSnapshotSchema>;

export const ConsoleLogArtifactSchema = z.object({
  level: z.enum(['log', 'info', 'warn', 'error', 'debug']),
  message: z.string(),
  source: z.string().default('browser'),
  timestamp: z.string().datetime(),
  stack: z.string().optional(),
  step_id: z.string().optional(),
});
export type ConsoleLogArtifact = z.infer<typeof ConsoleLogArtifactSchema>;

export const NetworkArtifactSchema = z.object({
  url: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']),
  status_code: z.number().int().nullable(),
  request_headers: z.record(z.string()).optional(),
  response_headers: z.record(z.string()).optional(),
  request_body: z.string().optional(),
  response_body: z.string().optional(),
  duration_ms: z.number().nonnegative(),
  success: z.boolean(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
  step_id: z.string().optional(),
});
export type NetworkArtifact = z.infer<typeof NetworkArtifactSchema>;

export const TestFailureSchema = z.object({
  step_id: z.string(),
  step_description: z.string(),
  error_type: z.enum([
    'navigation',
    'assertion',
    'timeout',
    'element_not_found',
    'script_error',
    'network',
    'crash',
    'unknown',
  ]),
  message: z.string(),
  console_errors: z.array(ConsoleLogArtifactSchema).default([]),
  network_errors: z.array(NetworkArtifactSchema).default([]),
  screenshot: ScreenshotArtifactSchema.optional(),
  dom_snapshot: DomSnapshotSchema.optional(),
  timestamp: z.string().datetime(),
});
export type TestFailure = z.infer<typeof TestFailureSchema>;

export const BrowserTestResultSchema = z.object({
  plan_name: z.string(),
  base_url: z.string(),
  passed: z.boolean(),
  total_steps: z.number().int().nonnegative(),
  passed_steps: z.number().int().nonnegative(),
  failed_steps: z.number().int().nonnegative(),
  skipped_steps: z.number().int().nonnegative().default(0),
  failures: z.array(TestFailureSchema).default([]),
  screenshots: z.array(ScreenshotArtifactSchema).default([]),
  console_logs: z.array(ConsoleLogArtifactSchema).default([]),
  network_artifacts: z.array(NetworkArtifactSchema).default([]),
  dom_snapshots: z.array(DomSnapshotSchema).default([]),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
  duration_ms: z.number().nonnegative(),
});
export type BrowserTestResult = z.infer<typeof BrowserTestResultSchema>;

export const TestReportSchema = z.object({
  project_name: z.string(),
  test_plan: TestPlanSchema,
  browser_results: z.array(BrowserTestResultSchema).default([]),
  summary: z.string(),
  total_tests: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total_screenshots: z.number().int().nonnegative(),
  total_console_errors: z.number().int().nonnegative(),
  total_network_errors: z.number().int().nonnegative(),
  bugs_filed: z.number().int().nonnegative().default(0),
  generated_at: z.string().datetime(),
  test_runner_version: z.string().default('1.0.0'),
});
export type TestReport = z.infer<typeof TestReportSchema>;

export interface TestStepResult {
  step: TestStep;
  passed: boolean;
  assertions: TestAssertion[];
  screenshot?: ScreenshotArtifact;
  dom_snapshot?: DomSnapshot;
  console_logs: ConsoleLogArtifact[];
  network_artifacts: NetworkArtifact[];
  error?: string;
  duration_ms: number;
}
