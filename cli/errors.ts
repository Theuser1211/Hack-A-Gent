import { color } from './output.js';

export interface FixSuggestion {
  what: string;
  why: string;
  fix: string;
}

export function fixSuggestion(what: string, why: string, fix: string): FixSuggestion {
  return { what, why, fix };
}

export function formatError(err: unknown, context?: string): FixSuggestion {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('api key') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) {
    return fixSuggestion(
      context ? `${context}: authentication failed` : 'Authentication failed',
      'The API key is missing, invalid, or expired.',
      'Run `hag config --api-key <your-key>` with a valid API key, or run `hag setup` to reconfigure.',
    );
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout') || lower.includes('econnrefused')) {
    return fixSuggestion(
      context ? `${context}: connection failed` : 'Connection failed',
      'The provider endpoint is unreachable or not responding.',
      'Check your internet connection and verify the endpoint URL with `hag config --show`. For NVIDIA NIMs, use https://integrate.api.nvidia.com/v1.',
    );
  }

  if (lower.includes('dns') || lower.includes('enotfound') || lower.includes('name resolution') || lower.includes('fetch failed')) {
    return fixSuggestion(
      context ? `${context}: network error` : 'Network error',
      'Could not resolve the hostname or reach the server.',
      'Check your internet connection. If using a custom endpoint, verify the URL is correct.',
    );
  }

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return fixSuggestion(
      'Rate limited',
      'API request quota exceeded.',
      'Wait a moment and try again. Reduce concurrency with fewer parallel tasks.',
    );
  }

  if (lower.includes('500') || lower.includes('503') || lower.includes('502') || lower.includes('internal server') || lower.includes('service unavailable')) {
    return fixSuggestion(
      context ? `${context}: provider error` : 'Provider error',
      'The AI provider returned a server error.',
      'This is a temporary issue. Wait a moment and try again. If it persists, check the provider status page.',
    );
  }

  if (lower.includes('model') && (lower.includes('not found') || lower.includes('unavailable') || lower.includes('does not exist'))) {
    return fixSuggestion(
      'Model unavailable',
      'The requested model is not available from your provider.',
      'Run `hag models` to see available models. Use `hag config --model <name>` to change models.',
    );
  }

  if (lower.includes('enospc') || lower.includes('disk') || lower.includes('space')) {
    return fixSuggestion(
      'Disk space error',
      'Not enough disk space for the operation.',
      'Free up disk space and try again.',
    );
  }

  if (lower.includes('eacces') || lower.includes('permission') || lower.includes('access denied')) {
    return fixSuggestion(
      'Permission error',
      'The process does not have permission to write to this location.',
      'Check directory permissions. Try running from a different directory or as an administrator.',
    );
  }

  if (lower.includes('eexist') || lower.includes('already exists')) {
    return fixSuggestion(
      'Output conflict',
      'The output directory already exists.',
      'Remove the existing directory or specify a different output location.',
    );
  }

  if (lower.includes('enotdir') || lower.includes('no such file') || lower.includes('enoent')) {
    return fixSuggestion(
      'File not found',
      'The specified file or directory does not exist.',
      'Check the file path and try again.',
    );
  }

  if (lower.includes('api') && lower.includes('offline')) {
    return fixSuggestion(
      'Provider offline',
      'The AI provider API is currently offline.',
      'Wait a moment and try again. Run `hag doctor` to check provider status.',
    );
  }

  if (lower.includes('invalid url') || lower.includes('malformed') || lower.includes('unsupported protocol')) {
    return fixSuggestion(
      'Invalid URL',
      'The URL format is not supported.',
      'Provide a valid Devpost URL (https://devpost.com/software/...) or a file path.',
    );
  }

  return fixSuggestion(
    context ? `${context}: ${msg.slice(0, 100)}` : msg.slice(0, 100),
    'An unexpected error occurred.',
    'If the issue persists, run with `--debug` for more details and report the output.',
  );
}

export function printError(suggestion: FixSuggestion): void {
  console.log(`  ${color('✘', 'red')} ${color(suggestion.what, 'red')}`);
  console.log(`    ${color('Why:', 'yellow')} ${suggestion.why}`);
  console.log(`    ${color('Fix:', 'green')} ${suggestion.fix}`);
  console.log();
}
