'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center animate-fade-in">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 mb-3">Something went wrong</h1>
        <p className="text-zinc-400 mb-4 leading-relaxed">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <p className="text-zinc-500 text-xs mb-8 font-mono">
          {error.digest ? `Error ID: ${error.digest}` : ''}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 font-semibold transition-all duration-200 active:scale-[0.98]"
          >
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50 text-zinc-200 px-6 py-3 font-semibold transition-all duration-200 active:scale-[0.98]"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
