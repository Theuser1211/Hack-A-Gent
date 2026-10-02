"use client";

import { useState } from 'react'
import Input from '@/components/Input'
import Button from '@/components/Button'
import Skeleton from '@/components/Skeleton'
import ErrorDisplay from '@/components/ErrorDisplay'

export default function InputStep({ onComplete }: { onComplete: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message ?? 'Failed to run')
      }
      onComplete()
    } catch (err: any) {
      setStatus('error')
      setError(err.message)
    }
  }

  if (status === 'loading') return <Skeleton variant="card" />

  return (
    <section aria-labelledby="input-title" className="max-w-md mx-auto">
      <h2 id="input-title" className="text-lg font-medium mb-4">
        Describe the memory
      </h2>
      {status === 'error' && error && (
        <ErrorDisplay message={error} onRetry={handleSubmit} />
      )}
      <form onSubmit={handleSubmit} className="space-y-4" aria-live="polite">
        <Input
          id="memory"
          label="Memory description"
          placeholder="e.g. a song from a summer trip"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" loading={status === 'loading'}>
          Search
        </Button>
      </form>
    </section>
  )
}
