import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
  try {
    return NextResponse.json({ data: { message: 'Logged out' } }, { status: 200 });
  } catch (err) {
    console.error('[API /auth/logout]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
