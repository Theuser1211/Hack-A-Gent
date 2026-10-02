
import { Button } from '@/components/Button';interface ErrorDisplayProps {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  dismissible?: boolean;
  className?: string;
}

export function ErrorDisplay({
  message,
  retryLabel = 'Try again',
  onRetry,
  dismissible = false,
  className = '',
}: ErrorDisplayProps) {
  return (
    <div className={`rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm flex items-center gap-3 ${className ? className : ''} role="alert"`}>
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-red-100 text-red-600">
        ⚠️
      </span>
      <div className="flex-1">
        <p className="font-medium text-red-800">
          Something went wrong
        </p>
        <p className="text-red-600" aria-live="polite">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      )}
      {dismissible && (
        <button
          onClick={() => {
            // In real app, this would trigger a dismiss action
          }}
          className="text-red-500 hover:text-red-700"
          aria-label="Dismiss error"
        >
          ×
        </button>
      )}
    </div>
  );
}
