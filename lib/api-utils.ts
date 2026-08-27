import { NextResponse } from 'next/server';

export function handleApiError(e: any) {
  if (e?.message === 'UNAUTHORIZED') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('API error:', e);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
