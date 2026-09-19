import { NextResponse } from 'next/server';
import { endSession } from '@/lib/auth';

/** Sign-out is a POST so a stray link preview cannot end a session. */
export async function POST(request: Request) {
  await endSession();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
