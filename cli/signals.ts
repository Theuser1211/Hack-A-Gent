import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';

/**
 * Global tracker for spawned child processes. All tracked processes are
 * automatically cleaned up on normal completion, errors, SIGINT, SIGTERM,
 * or timeout.
 */
const trackedProcesses: Set<ChildProcess> = new Set();

/** Register a child process for automatic cleanup. */
export function trackChildProcess(child: ChildProcess): void {
  trackedProcesses.add(child);
  
  const cleanup = () => {
    trackedProcesses.delete(child);
  };
  
  child.once('exit', cleanup);
}

/** Gracefully stop a tracked child process and wait briefly. */
async function stopTrackedProcess(child: ChildProcess, forceTimeout = 1000): Promise<void> {
  if (child.killed || !child.pid) return;
  
  try {
    child.kill('SIGTERM');
  } catch (err) {
    // Process may have already died
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
      return;
    }
    throw err;
  }
  
  const startTime = Date.now();
  await new Promise<void>((resolve) => {
    const checkTimer = setTimeout(() => {
      if (!child.killed && child.pid) {
        try {
          if (process.platform === 'win32') {
            const killer = spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], {
              stdio: 'ignore',
              windowsHide: true,
              timeout: 5000,
            });
            killer.unref();
          } else {
            process.kill(-child.pid, 'SIGKILL');
          }
        } catch {
          // If taskkill/kill fails, at least we tried
        }
      }
      clearTimeout(checkTimer);
      resolve();
    }, forceTimeout);
    
    child.once('exit', () => {
      clearTimeout(checkTimer);
      resolve();
    });
  });
}

/** Clean up all tracked child processes with graceful shutdown. */
export async function cleanupAllProcesses(forceTimeout = 2000): Promise<void> {
  const toStop = Array.from(trackedProcesses);
  trackedProcesses.clear();
  
  await Promise.all(
    toStop.map(async (child) => {
      try {
        await stopTrackedProcess(child, forceTimeout);
      } catch (err) {
        // Log error but continue cleanup
        console.error('Error cleaning up child process:', err);
      }
    })
  );
}

/**
 * Handles SIGINT / SIGTERM gracefully.
 *
 * Kills all tracked child processes, then sets `process.exitCode` so that
 * in-flight I/O can flush before the process terminates. The `exit` and
 * `log` parameters are injected for unit testing.
 */
export function handleTerminationSignal(
  signal: string,
  exit: (code?: number) => void = (code) => { process.exitCode = code ?? 0; },
  log: (...args: unknown[]) => void = console.log,
): void {
  const interrupted = signal === 'SIGINT';
  cleanupAllProcesses()
    .catch((err) => console.error('Error during cleanup:', err))
    .finally(() => {
      log(
        `\n  ${interrupted ? 'Interrupted' : 'Terminated'}. ` +
        'Use `hag resume` to continue where you left off.',
      );
      exit(interrupted ? 130 : 143);
    });
}
