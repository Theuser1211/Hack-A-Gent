'use client';

import { Card, Badge, EmptyState } from '@/components/ui';

const stats = [
  { label: 'API Calls', value: '0', change: '+0%' },
  { label: 'Uptime', value: '99.9%', change: 'Stable' },
  { label: 'Response Time', value: '<100ms', change: 'Fast' },
];

export default function Dashboard() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-zinc-100 mb-2">Dashboard</h1>
        <p className="text-zinc-400">Monitor your application performance and usage.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">{stat.label}</span>
              <Badge variant="success">{stat.change}</Badge>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">Recent Activity</h2>
        <EmptyState
          title="No activity yet"
          description="Your API usage and application events will appear here once you start using the service."
        />
      </Card>
    </div>
  );
}
