"use client";

import { useState } from 'react';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}: ButtonProps) {
  const [internalLoading, setInternalLoading] = useState(isLoading);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || internalLoading) return;
    onClick?.();
  };

  const baseClasses = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
  const variantClasses = {
    primary: "bg-primary-600 text-primary-foreground hover:bg-primary-700 focus-visible:ring-primary-500",
    secondary: "bg-secondary-600 text-secondary-foreground hover:bg-secondary-700 focus-visible:ring-secondary-500",
    ghost: "hover:bg-accent focus-visible:ring-accent",
    outline: "border border-input hover:bg-accent hover:text-accent-foreground focus-visible:ring-accent",
  }[variant];

  const sizeClasses = {
    sm: "h-9 px-3",
    md: "h-10 px-4",
    lg: "h-11 px-6",
  }[size];

  return (
    <button
      type={type}
      className={
        `${baseClasses} ${variantClasses} ${sizeClasses} ${className}`
      }
      disabled={disabled || internalLoading}
      onClick={handleClick}
      aria-label={
        internalLoading ?
          `Loading, please wait` :
          typeof children === 'string'
            ? children
            : undefined
      }
    >
      {internalLoading ? (
        <span className="sr-only">Loading...</span>
      ) : (
        <span className="flex items-center gap-2">
          {children}
        </span>
      )}
    </button>
  );
}
