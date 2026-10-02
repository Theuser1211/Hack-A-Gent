"use client";

import { useEffect, useState } from 'react'
import Skeleton from '@/components/Skeleton'
import ErrorDisplay from '@/components/ErrorDisplay'

export default function ProcessingStep({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus('idle')
      onComplete()
    }, 3000)
    return () => clearTimeout(timer)
  }, [onComplete])

  if (status === 'loading') return <Skeleton variant="card" count={2} />
  if (status === 'error') return <ErrorDisplay message={error ?? 'Processing error'} />
  return null
}
