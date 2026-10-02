'use client';
import { useState } from 'react';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { ApiResponse } from '@/lib/types';

type InputFormProps = {
  onSuccess: (runId: string) => void;
};

export const InputForm = ({ onSuccess }: InputFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<ApiResponse<string>>({ status: 'pending' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: 'processing' });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('Invalid credentials');
      const data = await res.json();
      setState({ status: 'completed', data: data.runId });
      onSuccess(data.runId);
    } catch (err: any) {
      setState({ status: 'failed', error: err.message });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-live="polite">
      <Input
        label="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={state.status === 'failed' ? state.error?.message : undefined}
      />
      <Input
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={state.status === 'failed' ? state.error?.message : undefined}
      />
      <Button
        type="submit"
        variant="primary"
        isLoading={state.status === 'processing'}
      >
        {state.status === 'processing' ? <Spinner size="sm" /> : 'Log in'}
      </Button>
    </form>
  );
};
