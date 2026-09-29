import { readPlugLog } from '../../../../services/persistence/plugLogRepository';

export async function GET() {
  try {
    const parsed = await readPlugLog();
    const fileName = `plug-phase-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    return new Response(JSON.stringify(parsed, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ error: 'Failed to export plug log from MongoDB.', details: String(error?.message || error) }, { status: 503 });
  }
}
