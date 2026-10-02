import { cn } from '@/lib/utils';

type Variant = 'default' | 'hover' | 'bordered';

interface Props {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
}

export function Card({ children, className, variant = 'default' }: Props) {
  const base = 'bg-white rounded-lg shadow-sm';
  const variants: Record<Variant, string> = {
    default: '',
    hover: 'hover:shadow-md transition-shadow',
    bordered: 'border border-gray-200',
  };
  return <div className={cn(base, variants[variant], className)}>{children}</div>;
}
