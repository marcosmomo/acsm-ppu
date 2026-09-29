import { NextResponse } from 'next/server';
import { readPlugLog, writePlugLogEvent } from '../../../services/persistence/plugLogRepository';

export async function GET() {
  try {
    return NextResponse.json(await readPlugLog());
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read plug log from MongoDB.', details: String(error?.message || error) }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    return NextResponse.json(await writePlugLogEvent(await request.json()));
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to persist plug log event.',
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}
