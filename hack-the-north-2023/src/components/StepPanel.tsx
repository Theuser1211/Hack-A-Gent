import { cn } from '@/lib/utils';

type State = 'idle' | 'loading' | 'error' | 'empty' | 'result';

interface Props {
  children?: React.ReactNode;
  state?: State;
  errorMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
}

export function StepPanel({ children, state = 'idle', errorMessage, emptyTitle, emptyDescription, onRetry }: Props) {
  if (state === 'loading') {
    return <div className={cn('animate-pulse')}>Loading…</div>;
  }
  if (state === 'error') {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-800 font-medium">{errorMessage ?? 'An error occurred.'}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-2 text-sm text-indigo-600 hover:underline">
            Retry
          </button>
        )}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="p-4 text-center text-gray-500">
        <p className="font-medium">{emptyTitle ?? 'No data'}</p>
        <p className="text-sm">{emptyDescription}</p>
      </div>
    );
  }
  return <>{children}</>;
}
