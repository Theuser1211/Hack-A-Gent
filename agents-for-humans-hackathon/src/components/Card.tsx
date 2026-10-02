interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'hover';
  className?: string;
}

export function Card({
  children,
  variant = 'default',
  className = '',
}: CardProps) {
  const baseClasses = "rounded-lg border bg-background p-4"
  const variantClasses = {
    default: "",
    hover: "hover:bg-accent hover:text-accent-foreground transition-colors",
  }[variant];

  return (
    <div className={`${baseClasses} ${variantClasses} ${className}`}>
      {children}
    </div>
  );
}
