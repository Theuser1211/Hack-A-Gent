/**
 * Handles SIGINT / SIGTERM gracefully.
 *
 * Sets `process.exitCode` instead of calling `process.exit()` so that
 * in-flight I/O (file writes, spawned processes) can flush before the
 * process terminates.  The `exit` and `log` parameters are injected so
 * the function is unit-testable without mocking Node globals.
 */
export function handleTerminationSignal(
  signal: string,
  exit: (code?: number) => void = (code) => { process.exitCode = code ?? 0; },
  log: (...args: unknown[]) => void = console.log,
): void {
  const interrupted = signal === 'SIGINT';
  log(
    `\n  ${interrupted ? 'Interrupted' : 'Terminated'}. ` +
    'Use `hag resume` to continue where you left off.',
  );
  exit(interrupted ? 130 : 143);
}
