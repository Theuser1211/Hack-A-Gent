import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BuildVerificationAgent } from '../../agents/build-verification-v1.js';
import type { GeneratedRepository } from '../../kernel/builders/builder-types.js';
import type { EventBus } from '../../kernel/events/event-bus.js';
import type { BuildExecutor } from '../../kernel/execution/build-executor.js';
import type { DevServerExecutor } from '../../kernel/execution/dev-server-executor.js';
import type {
  MaterializationResult,
  BuildCommandResult,
  BuildFailure,
  BuildWarning,
  RunningApplication,
} from '../../kernel/execution/execution-types.js';
import type { RepositoryMaterializer } from '../../kernel/execution/repository-materializer.js';
import type { WorkspaceProvisioner, Workspace } from '../../kernel/execution/workspace-provisioner.js';
import type { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import type { Task } from '../../kernel/tasks/task-entity.js';

function makeTask(overrides?: Partial<Task>): Task {
  return {
    task_id: 'task-001',
    project_id: 'proj-001',
    type: 'implementation',
    description: 'Build verification',
    parent_task_id: null,
    creator_agent: 'test',
    assigned_agent: null,
    priority: 'high' as const,
    status: 'PENDING' as const,
    dependencies: [],
    retries: { max_retries: 3, backoff_ms: 1000, current_attempt: 0 },
    checkpoint_required: false,
    required_skills: [],
    input: {},
    expected_outputs: [],
    error: null,
    acceptance_criteria: [
      {
        criterion_id: 'ac-1',
        description: 'Build passes',
        verification_method: 'automated_test' as const,
        verified: false,
      },
      {
        criterion_id: 'ac-2',
        description: 'Dependencies install',
        verification_method: 'automated_test' as const,
        verified: false,
      },
    ],
    timestamps: {
      created_at: '2026-01-01T00:00:00.000Z',
      assigned_at: null,
      started_at: null,
      completed_at: null,
      deadline: null,
    },
    ...overrides,
  };
}

function makeRepository(overrides?: Partial<GeneratedRepository>): GeneratedRepository {
  return {
    project_name: 'test-project',
    blueprint_version: '1.0.0',
    modules: [
      {
        name: 'frontend',
        type: 'frontend',
        files: [{ path: 'src/index.ts', content: 'export const x = 1;' }],
        description: '',
      },
    ],
    total_files: 1,
    total_lines: 1,
    generated_at: '2026-01-01T00:00:00.000Z',
    build_results: [],
    ...overrides,
  };
}

describe('BuildVerificationAgent', () => {
  let agent: BuildVerificationAgent;
  let mockMaterializer: RepositoryMaterializer;
  let mockProvisioner: WorkspaceProvisioner;
  let mockBuildExecutor: BuildExecutor;
  let mockDevServer: DevServerExecutor;
  let mockMemory: MemoryWriter;
  let mockEventBus: EventBus;

  beforeEach(() => {
    mockMaterializer = {
      materialize: vi.fn().mockResolvedValue({
        success: true,
        files_written: ['src/index.ts'],
        directories_created: ['src'],
        root_path: '/tmp/project',
        timestamp: '2026-01-01T00:00:00.000Z',
        error: null,
      } satisfies MaterializationResult),
    };

    mockProvisioner = {
      createWorkspace: vi.fn().mockResolvedValue({
        root_path: '/tmp/workspace-root',
        project_path: '/tmp/workspace-root/project',
        created_at: '2026-01-01T00:00:00.000Z',
      } satisfies Workspace),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    const makeResult = (success: boolean, overrides?: Partial<BuildCommandResult>): BuildCommandResult => ({
      command: 'test',
      stdout: success ? 'ok' : 'error',
      stderr: '',
      exit_code: success ? 0 : 1,
      duration_ms: 100,
      success,
      project_path: '/tmp/project',
      ...overrides,
    });

    mockBuildExecutor = {
      detectProjectType: vi.fn().mockReturnValue('node'),
      installDependencies: vi.fn().mockResolvedValue(makeResult(true)),
      runBuild: vi.fn().mockResolvedValue(makeResult(true)),
      runLint: vi.fn().mockResolvedValue(makeResult(true)),
      runTests: vi.fn().mockResolvedValue(makeResult(true)),
      detectFailures: vi.fn().mockReturnValue([] as BuildFailure[]),
      detectWarnings: vi.fn().mockReturnValue([] as BuildWarning[]),
    };

    mockDevServer = {
      start: vi.fn().mockResolvedValue({
        pid: 12345,
        port: 3000,
        url: 'http://localhost:3000',
        ready: true,
        process_path: 'npm start',
        started_at: '2026-01-01T00:00:00.000Z',
        project_path: '/tmp/project',
      } satisfies RunningApplication),
      stop: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockResolvedValue(true),
    };

    mockMemory = {
      appendBug: vi.fn().mockResolvedValue(undefined),
      appendLog: vi.fn().mockResolvedValue(undefined),
      appendDecision: vi.fn().mockResolvedValue(undefined),
    } as unknown as MemoryWriter;

    mockEventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventBus;

    agent = new BuildVerificationAgent({
      materializer: mockMaterializer,
      provisioner: mockProvisioner,
      buildExecutor: mockBuildExecutor,
      devServerExecutor: mockDevServer,
      memoryWriter: mockMemory,
      eventBus: mockEventBus,
    });
  });

  describe('manifest', () => {
    it('has correct agent_id', () => {
      expect(agent.manifest.agent_id).toBe('agent.build.verification.v1');
    });

    it('has build_verification capability', () => {
      expect(agent.manifest.capabilities.map((c) => c.capability_id)).toContain('build_verification');
    });

    it('subscribes to BUILD_COMPLETED and REPOSITORY_CREATED', () => {
      expect(agent.manifest.event_subscriptions).toContain('BUILD_COMPLETED');
      expect(agent.manifest.event_subscriptions).toContain('REPOSITORY_CREATED');
    });

    it('accepts implementation task type', () => {
      expect(agent.manifest.accepted_tasks).toContain('implementation');
    });

    it('has memory access to BUGS.md, AGENT_LOG.md, DECISIONS.md', () => {
      const memories = agent.manifest.accessible_memories;
      expect(memories?.map((m) => m.file)).toContain('BUGS.md');
      expect(memories?.map((m) => m.file)).toContain('AGENT_LOG.md');
      expect(memories?.map((m) => m.file)).toContain('DECISIONS.md');
    });
  });

  describe('lifecycle', () => {
    it('initialize does not throw', async () => {
      await expect(agent.initialize()).resolves.not.toThrow();
    });

    it('shutdown does not throw', async () => {
      await expect(agent.shutdown()).resolves.not.toThrow();
    });
  });

  describe('onEvent', () => {
    it('handles BUILD_COMPLETED event', async () => {
      await expect(
        agent.onEvent({ type: 'BUILD_COMPLETED', payload: { project_name: 'test' } }),
      ).resolves.not.toThrow();
    });

    it('handles REPOSITORY_CREATED event', async () => {
      await expect(agent.onEvent({ type: 'REPOSITORY_CREATED', payload: {} })).resolves.not.toThrow();
    });

    it('ignores unknown event types', async () => {
      await expect(agent.onEvent({ type: 'UNKNOWN_EVENT', payload: {} })).resolves.not.toThrow();
    });
  });

  describe('executeTask', () => {
    it('returns COMPLETED when all steps succeed', async () => {
      const result = await agent.executeTask(
        makeTask({ input: { repository: makeRepository(), project_name: 'test-project' } }),
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.exit_code).toBe('AGENT_OK');
      expect(result.summary).toContain('PASSED');
    });

    it('returns FAILED when input is missing repository', async () => {
      const result = await agent.executeTask(makeTask({ input: {} }));

      expect(result.status).toBe('FAILED');
      expect(result.exit_code).toBe('AGENT_FAIL');
      expect(result.error?.message).toContain('GeneratedRepository');
    });

    it('returns COMPLETED when build fails but other steps pass', async () => {
      mockBuildExecutor.runBuild = vi.fn().mockResolvedValue({
        command: 'Build',
        stdout: '',
        stderr: 'Build error',
        exit_code: 1,
        duration_ms: 100,
        success: false,
        project_path: '/tmp/project',
      });
      mockBuildExecutor.detectFailures = vi
        .fn()
        .mockReturnValue([
          {
            type: 'compilation',
            message: 'Build error',
            file: 'src/index.ts',
            line: null,
            column: null,
            code: null,
            command: 'Build',
          },
        ]);

      const result = await agent.executeTask(
        makeTask({ input: { repository: makeRepository(), project_name: 'test-project' } }),
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.summary).toContain('FAILED');
    });

    it('returns FAILED when all commands fail', async () => {
      const failResult = {
        command: 'test',
        stdout: '',
        stderr: 'error',
        exit_code: 1,
        duration_ms: 100,
        success: false,
        project_path: '/tmp/project',
      };
      mockBuildExecutor.installDependencies = vi.fn().mockResolvedValue(failResult);
      mockBuildExecutor.runBuild = vi.fn().mockResolvedValue(failResult);
      mockBuildExecutor.runLint = vi.fn().mockResolvedValue(failResult);
      mockBuildExecutor.runTests = vi.fn().mockResolvedValue(failResult);
      mockDevServer.start = vi.fn().mockResolvedValue({
        pid: null,
        port: null,
        url: 'http://localhost:3000',
        ready: false,
        process_path: 'npm start',
        started_at: '2026-01-01T00:00:00.000Z',
        project_path: '/tmp/project',
      });

      const result = await agent.executeTask(
        makeTask({ input: { repository: makeRepository(), project_name: 'test-project' } }),
      );

      expect(result.status).toBe('FAILED');
    });

    it('returns COMPLETED with partial failures status', async () => {
      mockDevServer.start = vi.fn().mockResolvedValue({
        pid: null,
        port: null,
        url: 'http://localhost:3000',
        ready: false,
        process_path: 'npm start',
        started_at: '2026-01-01T00:00:00.000Z',
        project_path: '/tmp/project',
      });

      const result = await agent.executeTask(
        makeTask({ input: { repository: makeRepository(), project_name: 'test-project' } }),
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.exit_code).toBe('AGENT_OK');
    });

    it('publishes events for each phase', async () => {
      await agent.executeTask(makeTask({ input: { repository: makeRepository() } }));

      expect(mockEventBus.publish).toHaveBeenCalled();
      const calls = (mockEventBus.publish as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => (c[0] as { type: string }).type,
      );
      expect(calls).toContain('BUILD_VERIFICATION_STARTED');
      expect(calls).toContain('REPOSITORY_MATERIALIZED');
      expect(calls).toContain('DEPENDENCIES_INSTALLED');
      expect(calls).toContain('BUILD_SUCCEEDED');
      expect(calls).toContain('APPLICATION_STARTED');
      expect(calls).toContain('BUILD_VERIFICATION_COMPLETED');
    });

    it('publishes BUILD_FAILED event on build error', async () => {
      mockBuildExecutor.runBuild = vi.fn().mockResolvedValue({
        command: 'Build',
        stdout: '',
        stderr: 'error',
        exit_code: 1,
        duration_ms: 100,
        success: false,
        project_path: '/tmp/project',
      });
      mockBuildExecutor.detectFailures = vi
        .fn()
        .mockReturnValue([
          { type: 'compilation', message: 'error', file: null, line: null, column: null, code: null, command: 'Build' },
        ]);

      await agent.executeTask(makeTask({ input: { repository: makeRepository() } }));

      const calls = (mockEventBus.publish as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => (c[0] as { type: string }).type,
      );
      expect(calls).toContain('BUILD_FAILED');
    });

    it('files bugs for build failures', async () => {
      mockBuildExecutor.runBuild = vi.fn().mockResolvedValue({
        command: 'Build',
        stdout: '',
        stderr: 'error',
        exit_code: 1,
        duration_ms: 100,
        success: false,
        project_path: '/tmp/project',
      });
      mockBuildExecutor.detectFailures = vi
        .fn()
        .mockReturnValue([
          {
            type: 'compilation',
            message: 'SyntaxError',
            file: 'src/index.ts',
            line: 10,
            column: 5,
            code: null,
            command: 'Build',
          },
        ]);

      await agent.executeTask(makeTask({ input: { repository: makeRepository() } }));

      expect(mockMemory.appendBug).toHaveBeenCalled();
      const calls = (mockMemory.appendBug as ReturnType<typeof vi.fn>).mock.calls;
      const bugCall = calls[0]?.[0] ?? {};
      expect(bugCall.found_by).toBe('agent.build.verification.v1');
      expect(bugCall.phase).toBe('BUILDING');
      expect(bugCall.description).toContain('SyntaxError');
    });

    it('writes to AGENT_LOG.md', async () => {
      await agent.executeTask(makeTask({ input: { repository: makeRepository() } }));

      expect(mockMemory.appendLog).toHaveBeenCalled();
    });

    it('writes to DECISIONS.md', async () => {
      await agent.executeTask(makeTask({ input: { repository: makeRepository() } }));

      expect(mockMemory.appendDecision).toHaveBeenCalled();
    });

    it('handles materialization failure', async () => {
      mockMaterializer.materialize = vi.fn().mockRejectedValue(new Error('Disk full'));

      const result = await agent.executeTask(makeTask({ input: { repository: makeRepository() } }));

      expect(result.status).toBe('FAILED');
      expect(result.error?.message).toContain('Disk full');
    });

    it('uses custom agent ID when provided', () => {
      const customAgent = new BuildVerificationAgent({
        materializer: mockMaterializer,
        provisioner: mockProvisioner,
        buildExecutor: mockBuildExecutor,
        devServerExecutor: mockDevServer,
        agentId: 'custom.build.verifier',
      });
      expect(customAgent.manifest.agent_id).toBe('custom.build.verifier');
    });

    it('passes acceptance criteria', async () => {
      const task = makeTask({ input: { repository: makeRepository() } });
      const result = await agent.executeTask(task);

      expect(result.criteria_results).toHaveLength(task.acceptance_criteria.length);
      for (const cr of result.criteria_results ?? []) {
        expect(cr.passed).toBe(true);
      }
    });
  });

  describe('error handling edge cases', () => {
    it('emits BUILD_VERIFICATION_COMPLETED with error on exception', async () => {
      mockProvisioner.createWorkspace = vi.fn().mockRejectedValue(new Error('Creation failed'));

      await agent.executeTask(makeTask({ input: { repository: makeRepository() } }));

      const publishCalls = (mockEventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const completed = publishCalls.find(
        (c: unknown[]) => (c[0] as { type: string }).type === 'BUILD_VERIFICATION_COMPLETED',
      );
      expect(completed).toBeTruthy();
      expect(completed![0]!.payload.error).toBe('Creation failed');
    });

    it('handles null memory writer gracefully', async () => {
      const agentNoMemory = new BuildVerificationAgent({
        materializer: mockMaterializer,
        provisioner: mockProvisioner,
        buildExecutor: mockBuildExecutor,
        devServerExecutor: mockDevServer,
      });
      const result = await agentNoMemory.executeTask(makeTask({ input: { repository: makeRepository() } }));
      expect(result.status).toBe('COMPLETED');
    });

    it('handles null event bus gracefully', async () => {
      const agentNoEvents = new BuildVerificationAgent({
        materializer: mockMaterializer,
        provisioner: mockProvisioner,
        buildExecutor: mockBuildExecutor,
        devServerExecutor: mockDevServer,
      });
      const result = await agentNoEvents.executeTask(makeTask({ input: { repository: makeRepository() } }));
      expect(result.status).toBe('COMPLETED');
    });
  });
});
