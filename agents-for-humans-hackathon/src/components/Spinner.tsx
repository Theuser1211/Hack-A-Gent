import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner = ({ size = 'md', className = '' }: SpinnerProps) => {
  const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div
      className={
        'animate-spin rounded-full border-2 border-primary-600 border-t-transparent' +
        ` ${sizeMap[size]} ${className}`
      }
      aria-label="Loading"
      role="status"
    >
    </div>
  );
};
