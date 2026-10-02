interface SponsorBadgeProps {
  className?: string;
}

export function SponsorBadge({
  className = '',
}: SponsorBadgeProps) {
  return (
    <div className={
      "flex items-center gap-2 text-xs text-gray-500" +
      (className ? ` ${className}` : "")
    }>
      <span>Powered by</span>
      <a
        href="https://vercel.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-gray-900"
      >
        Vercel
      </a>
    </div>
  );
}
