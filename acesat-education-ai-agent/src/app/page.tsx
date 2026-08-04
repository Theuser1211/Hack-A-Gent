'use client';

import { useState } from 'react';

export default function Home() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/20" />
        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="flex items-center gap-2 mb-6">
            <span className="px-3 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">Hackathon Project</span>
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white via-purple-100 to-blue-100 bg-clip-text text-transparent">
            Quarry
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mb-8">
            Quarry — a reverse search engine that turns a vague memory into the exact video, article, or song you cannot name.
          </p>
          <div className="flex gap-4">
            <button className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-semibold transition-colors">
              Try Demo
            </button>
            <button className="px-6 py-3 border border-slate-700 hover:border-slate-500 rounded-lg font-semibold transition-colors">
              View Code
            </button>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex gap-4 mb-8 border-b border-slate-800 pb-4">
          {['overview', 'features', 'architecture'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[{
              title: 'Core Innovation',
              desc: 'Novel approach to solving the problem using cutting-edge technology',
              icon: '💡'
            }, {
              title: 'Technical Depth',
              desc: 'Real API integration, complex state management, and data processing',
              icon: '⚡'
            }, {
              title: 'User Experience',
              desc: 'Intuitive interface designed for the target audience',
              icon: '🎯'
            }].map((item) => (
              <div key={item.title} className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-4">
            {[{
              name: 'Feature 1',
              status: 'Implemented',
              desc: 'Core functionality that solves the main problem'
            }, {
              name: 'Feature 2',
              status: 'Implemented',
              desc: 'Advanced integration with sponsor APIs'
            }, {
              name: 'Feature 3',
              status: 'In Progress',
              desc: 'Real-time data processing and visualization'
            }].map((feature) => (
              <div key={feature.name} className="flex items-center justify-between p-4 rounded-lg bg-slate-900/50 border border-slate-800">
                <div>
                  <h4 className="font-medium">{feature.name}</h4>
                  <p className="text-sm text-slate-400">{feature.desc}</p>
                </div>
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                  feature.status === 'Implemented'
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-yellow-500/20 text-yellow-300'
                }`}>
                  {feature.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800">
            <h3 className="text-lg font-semibold mb-4">System Architecture</h3>
            <pre className="text-sm text-slate-400 overflow-x-auto">{`
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend   │────▶│    API Layer  │────▶│  Database   │
│  (Next.js)   │     │  (Routes)     │     │  (SQLite)   │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   UI State   │     │  Business    │     │   Data      │
│  Management  │     │  Logic       │     │   Access    │
└─────────────┘     └──────────────┘     └─────────────┘`}</pre>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>Built for the hackathon. Open source.</p>
        </div>
      </footer>
    </main>
  );
}
