interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={
      "text-center px-6 py-12" +
      (className ? ` ${className}` : "")
    }>
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent text-accent-foreground mx-auto mb-4">
        <span className="text-xl">🔍</span>
      </div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">
        {title}
      </h2>
      <p className="text-gray-600 mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          variant="outline"
          onClick={onAction}
          className="mx-auto"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
