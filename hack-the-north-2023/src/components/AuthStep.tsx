"use client";

import { useState } from 'react'
import Input from '@/components/Input'
import Button from '@/components/Button'
import ErrorDisplay from '@/components/ErrorDisplay'
import Skeleton from '@/components/Skeleton'
import { cn } from '@/lib/utils'

interface AuthStepProps {
  onComplete: () => void
}

export default function AuthStep({ onComplete }: AuthStepProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data: { success: boolean; message?: string } = await res.json()
      if (data.success) {
        setStatus('idle')
        onComplete()
      } else {
        setStatus('error')
        setError(data.message ?? 'Login failed')
      }
    } catch {
      setStatus('error')
      setError('Network error')
    }
  }

  if (status === 'loading') return <Skeleton variant="card" />

  return (
    <section aria-labelledby="auth-title" className="max-w-md mx-auto">
      <h2 id="auth-title" className="text-lg font-medium mb-4">Login to Ember</h2>
      {status === 'error' && error && (
        <ErrorDisplay message={error} onRetry={handleSubmit} />
      )}
      <form onSubmit={handleSubmit} className={cn('space-y-4')}
            aria-live="polite">
        <Input
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" loading={status === 'loading'}>
          Sign in
        </Button>
      </form>
    </section>
  )
}
