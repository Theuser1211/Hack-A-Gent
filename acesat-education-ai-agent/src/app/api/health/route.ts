import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '0.1.0',
    },
  });
}
