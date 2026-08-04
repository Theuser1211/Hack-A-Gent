import { NextResponse } from 'next/server';

interface AuthRequest {
  email: string;
  password: string;
  mode: 'signin' | 'signup';
}

export async function POST(req: Request) {
  try {
    const body: AuthRequest = await req.json();

    // Input validation
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: { message: 'Email and password are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json(
        { error: { message: 'Invalid email format', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    if (body.password.length < 8) {
      return NextResponse.json(
        { error: { message: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // In production, validate against database
    // For demo, return success with mock user
    return NextResponse.json({
      data: {
        user: { id: 1, email: body.email, name: body.email.split('@')[0] },
        token: 'demo-jwt-token-' + Date.now(),
      },
    });
  } catch {
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ data: { status: 'auth service running' } });
}
