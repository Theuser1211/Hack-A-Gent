import { cn } from '@/lib/utils';
import { Spinner } from '@/components/Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  ariaLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  className,
  ariaLabel,
  ...rest
}: Props) {
  const base = 'inline-flex items-center justify-center font-medium rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
  const variants: Record<Variant, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus-visible:ring-gray-400',
    ghost: 'bg-transparent text-indigo-600 hover:bg-indigo-50 focus-visible:ring-indigo-200',
    outline: 'border border-indigo-600 text-indigo-600 hover:bg-indigo-50 focus-visible:ring-indigo-200',
  };
  const sizes: Record<Size, string> = {
    sm: 'px-2.5 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      type="button"
      className={cn(base, variants[variant], sizes[size], className, isLoading && 'opacity-70 cursor-not-allowed')}
      disabled={disabled || isLoading}
      aria-label={ariaLabel}
      {...rest}
    >
      {isLoading ? <Spinner className="w-5 h-5 mr-2" /> : null}
      {children}
    </button>
  );
}
