type Props = {
  type?: 'text' | 'card' | 'avatar';
  className?: string;
};

export function Skeleton({ type = 'text', className }: Props) {
  const base = 'bg-gray-200 animate-pulse rounded';
  const variants: Record<string, string> = {
    text: 'h-4 w-full',
    card: 'h-48 w-full',
    avatar: 'h-10 w-10 rounded-full',
  };
  return <div className={`${base} ${variants[type]} ${className ?? ''}`}></div>;
}
