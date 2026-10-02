import { ApiResponse, AiRunResult, AiHistoryResult } from '@/lib/types';

export async function fetchAiRun(prompt: string): Promise<ApiResponse<AiRunResult>> {
  try {
    const res = await fetch('/api/ai/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    return { status: 'success', data };
  } catch (e: any) {
    return { status: 'error', message: e.message ?? 'Unknown error' };
  }
}

export async function fetchAiHistory(): Promise<ApiResponse<AiHistoryResult>> {
  try {
    const res = await fetch('/api/ai/history');
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    return { status: 'success', data };
  } catch (e: any) {
    return { status: 'error', message: e.message ?? 'Unknown error' };
  }
}