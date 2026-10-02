import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center animate-fade-in">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="w-20 h-20 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl font-bold text-zinc-400">404</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 mb-3">Page not found</h1>
        <p className="text-zinc-400 mb-8 leading-relaxed">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 font-semibold transition-all duration-200 active:scale-[0.98]"
          >
            Go home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50 text-zinc-200 px-6 py-3 font-semibold transition-all duration-200 active:scale-[0.98]"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
