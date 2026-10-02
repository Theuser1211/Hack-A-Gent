interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  className?: string;
}

export function Skeleton({
  height = 16,
  width = '100%',
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={
        "animate-pulse bg-gray-200 rounded" +
        (typeof height === 'number' ? ` h-${height}` : ` h-${height}`) +
        (typeof width === 'number' ? ` w-${width}` : ` w-${width}`) +
        (className ? ` ${className}` : "")
      }
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <rect width="100" height="100" fill="url(#gradient)" />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="50%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
