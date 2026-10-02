'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/Card';
import { ApiResponse } from '@/lib/types';

type OutputViewProps = {
  runId: string;
};

export const OutputView = ({ runId }: OutputViewProps) => {
  const [state, setState] = useState<ApiResponse<{ title: string; url: string }>>({ status: 'processing' });

  useEffect(() => {
    // Simulate fetching result
    const timer = setTimeout(() => {
      setState({
        status: 'completed',
        data: { title: 'Found Song: "Imagine"', url: 'https://example.com/imagine' },
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [runId]);

  if (state.status === 'processing') {
    return (
      <div className="space-y-2">
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  if (state.status === 'failed') {
    return <p className="text-red-600">{state.error?.message}</p>;
  }

  return (
    <Card>
      <h3 className="text-lg font-medium mb-2">{state.data?.title}</h3>
      <a href={state.data?.url} className="text-primary underline" target="_blank" rel="noopener noreferrer">
        Open result
      </a>
    </Card>
  );
};
