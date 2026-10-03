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
  const [state, setState] = useState<ApiResponse<string>>({ status: 'idle' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('Invalid credentials');
      const data = await res.json();
      setState({ status: 'success', data: data.runId });
      onSuccess(data.runId);
    } catch (err: any) {
      setState({ status: 'error', error: err.message });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-live="polite">
      <Input
        id="email"
        label="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        error={state.status === 'error' ? state.error : undefined}
      />
      <Input
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        error={state.status === 'error' ? state.error : undefined}
      />
      <Button
        type="submit"
        variant="primary"
        loading={state.status === 'loading'}
        ariaLabel="Log in"
      >
        {state.status === 'loading' ? <Spinner size="sm" /> : 'Log in'}
      </Button>
    </form>
  );
};
