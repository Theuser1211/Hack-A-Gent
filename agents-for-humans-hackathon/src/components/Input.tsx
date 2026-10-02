"use client";

import { useState } from 'react';

interface InputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string | null;
  helperText?: string;
  ariaDescribedBy?: string;
  className?: string;
}

export function Input({
  label,
  placeholder,
  value,
  onChange,
  error,
  helperText,
  ariaDescribedBy,
  className = '',
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="space-y-2">
      <label
        htmlFor={
          label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
        }
        className="block text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={
            label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          }
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e);
            setIsFocused(e.target === document.activeElement);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={
            "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-0 placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 sm:text-sm" +
            (error ? " border-red-300" : "") +
            (isFocused ? " ring-2 ring-primary-500" : "") +
            (className ? ` ${className}` : "")
          }
          aria-describedby={ariaDescribedBy}
          aria-invalid={!!error}
        />
        {error && (
          <p className="text-sm text-red-600 mt-1" aria-live="polite">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-sm text-gray-500 mt-1">
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
}
