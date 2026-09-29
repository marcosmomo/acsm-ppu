import { NextResponse } from 'next/server';
import { getPlayState, updatePlaySnapshot } from '../../../../lib/acsm/playStore.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getPlayState(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request) {
  try {
    const snapshot = await request.json();
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.cps)) {
      return NextResponse.json({ ok: false, error: 'cps must be an array.' }, { status: 400 });
    }
    const state = updatePlaySnapshot(snapshot);
    return NextResponse.json({ ok: true, updatedAt: state.timestamp }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid Play synchronization payload.' }, { status: 400 });
  }
}
