import { NextResponse } from 'next/server';

interface DataPoint {
  id: string;
  label: string;
  value: number;
  category: string;
}

// Realistic mock data for demo
const mockData: DataPoint[] = [
  { id: '1', label: 'Metric A', value: 85, category: 'performance' },
  { id: '2', label: 'Metric B', value: 72, category: 'engagement' },
  { id: '3', label: 'Metric C', value: 91, category: 'quality' },
  { id: '4', label: 'Metric D', value: 68, category: 'performance' },
  { id: '5', label: 'Metric E', value: 94, category: 'engagement' },
];

export async function GET() {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 50));

  return NextResponse.json({
    data: mockData,
    meta: {
      total: mockData.length,
      lastUpdated: new Date().toISOString(),
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.label || body.value === undefined) {
      return NextResponse.json(
        { error: { message: 'Label and value are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const newData: DataPoint = {
      id: String(mockData.length + 1),
      label: body.label,
      value: Number(body.value),
      category: body.category || 'uncategorized',
    };

    mockData.push(newData);

    return NextResponse.json({ data: newData }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid request body', code: 'PARSE_ERROR' } },
      { status: 400 }
    );
  }
}
