import { NextResponse } from 'next/server';

type Item = { id: number; title: string; completed: boolean };
const items: Item[] = [];

export async function GET() {
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();
  const item: Item = { id: items.length + 1, title: body.title ?? '', completed: false };
  items.push(item);
  return NextResponse.json(item, { status: 201 });
}
