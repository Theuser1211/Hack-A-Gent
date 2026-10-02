export async function fetchInputAnalysis(memory: string): Promise<any> {
  const res = await fetch(`/api/ai/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memory }),
  });
  if (!res.ok) throw new Error(`Failed to start search: ${res.status}`);
  return res.json();
}

export async function fetchProcessing(): Promise<any> {
  const res = await fetch(`/api/ai/run`, {
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Failed to get processing status: ${res.status}`);
  return res.json();
}

export async function fetchOutputResults(): Promise<any> {
  const res = await fetch(`/api/ai/history`, {
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Failed to fetch results: ${res.status}`);
  return res.json();
}

export async function submitFeedback(feedback: { adjustment: string }): Promise<void> {
  const res = await fetch(`/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback),
  });
  if (!res.ok) throw new Error(`Failed to submit feedback: ${res.status}`);
}
