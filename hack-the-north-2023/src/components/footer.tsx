import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/50 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-sm font-bold text-white">
                E
              </span>
              <span className="font-bold text-zinc-100">Ember</span>
            </div>
            <p className="text-sm text-zinc-400 max-w-xs leading-relaxed">Ember — a reverse search engine that turns a vague memory into the exact video, article, or song you cannot name.</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-200 mb-3">Product</h4>
            <div className="space-y-2">
              <Link href="/" className="block text-sm text-zinc-400 hover:text-white transition-colors">Home</Link>
              <Link href="/dashboard" className="block text-sm text-zinc-400 hover:text-white transition-colors">Dashboard</Link>
              <Link href="#features" className="block text-sm text-zinc-400 hover:text-white transition-colors">Features</Link>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-200 mb-3">Resources</h4>
            <div className="space-y-2">
              <Link href="/api/health" className="block text-sm text-zinc-400 hover:text-white transition-colors">API Status</Link>
              <Link href="/api/analyze" className="block text-sm text-zinc-400 hover:text-white transition-colors">API Docs</Link>
            </div>
          </div>
        </div>
        <div className="pt-8 border-t border-zinc-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-zinc-500">&copy; 2026 Ember. Built for the hackathon.</p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-600">MIT License</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
