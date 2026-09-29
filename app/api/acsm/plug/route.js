import { NextResponse } from 'next/server';
import { getPlugState, updatePlugSnapshot } from '../../../../lib/acsm/plugStore.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getPlugState(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request) {
  try {
    const snapshot = await request.json();
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.assets)) {
      return NextResponse.json({ ok: false, error: 'assets must be an array.' }, { status: 400 });
    }
    const state = updatePlugSnapshot(snapshot);
    return NextResponse.json({ ok: true, updatedAt: state.timestamp }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid Plug synchronization payload.' }, { status: 400 });
  }
}
