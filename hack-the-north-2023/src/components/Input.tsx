import { cn } from '@/lib/utils';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  error?: string;
  helperText?: string;
  id: string;
};

export function Input({ label, error, helperText, id, className, ...rest }: InputProps) {
  const inputClass = cn(
    'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm',
    error && 'border-red-500 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500',
    className,
  );

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input id={id} className={inputClass} aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined} aria-invalid={!!error} {...rest} />
      {helperText && !error && (
        <p id={`${id}-helper`} className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
