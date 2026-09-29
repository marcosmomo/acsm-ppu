import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { level } = await params;
  if (!['level1', 'level2'].includes(level)) return NextResponse.json({ error: 'Invalid history level' }, { status: 400 });
  const source = String(process.env.ACSM_PERSISTENCE_URL || 'http://localhost:3010').replace(/\/$/, '');
  const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get('limit') || 25)));
  try {
    const response = await fetch(`${source}/api/history/${level}?limit=${limit}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json({ ok: false, level, records: [], error: 'Persistence history unavailable', details: error.message }, { status: 503 });
  }
}
