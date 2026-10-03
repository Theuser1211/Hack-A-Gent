'use client';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/Spinner';
import { ApiResponse } from '@/lib/types';

type ProcessingViewProps = {
  runId: string;
  onComplete: () => void;
};

export const ProcessingView = ({ runId, onComplete }: ProcessingViewProps) => {
  const [state, setState] = useState<ApiResponse<null>>({ status: 'loading' });

  useEffect(() => {
    const timer = setTimeout(() => {
      setState({ status: 'success' });
      onComplete();
    }, 2000);
    return () => clearTimeout(timer);
  }, [runId, onComplete]);

  return (
    <div className="flex flex-col items-center py-8" aria-live="polite">
      <Spinner size="lg" />
      <p className="mt-4 text-gray-700">Thinking about your memory…</p>
    </div>
  );
};
