"use client";

import { useEffect, useState } from 'react'
import Card from '@/components/Card'
import Skeleton from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import Button from '@/components/Button'
import ErrorDisplay from '@/components/ErrorDisplay'

export default function OutputStep({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('loading')
  const [results, setResults] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const res = await fetch('/api/ai/history')
        if (!res.ok) throw new Error('Failed to load')
        const data: { results: string[] } = await res.json()
        setResults(data.results)
        setStatus('success')
      } catch (e: any) {
        setStatus('error')
        setError(e.message)
      }
    }
    fetchResults()
  }, [])

  if (status === 'loading') return <Skeleton variant="card" count={3} />
  if (status === 'error') return <ErrorDisplay message={error ?? 'Error loading'} />
  if (results.length === 0)
    return (
      <EmptyState
        title="No results yet"
        description="Try describing a memory to find media"
        icon={<div className="text-5xl">🔍</div>}
        action={<Button onClick={onComplete}>Go Back</Button>}
      />
    )
  return (
    <section aria-labelledby="output-title" className="space-y-4">
      <h2 id="output-title" className="text-lg font-medium">Results</h2>
      {results.map((item, idx) => (
        <Card key={idx} className="p-4">
          <p>{item}</p>
        </Card>
      ))}
    </section>
  )
}
