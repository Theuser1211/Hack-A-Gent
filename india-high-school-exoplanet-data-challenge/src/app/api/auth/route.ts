import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  // In production, validate credentials against your database
  return NextResponse.json({ token: 'demo-token', user: { email: body.email } });
}

export async function GET() {
  return NextResponse.json({ status: 'auth service running' });
}
