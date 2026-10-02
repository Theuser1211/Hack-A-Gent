interface Props {
  title: string;
  message: string;
  onRetry: () => void;
}

export function ErrorDisplay({ title, message, onRetry }: Props) {
  return (
    <section className="max-w-md mx-auto p-6 bg-white rounded shadow-sm text-center">
      <svg className="mx-auto w-12 h-12 text-red-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">{title}</h2>
      <p className="text-gray-600 mb-4">{message}</p>
      <button onClick={onRetry} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        Try again
      </button>
    </section>
  );
}
