/**
 * GET /api/questions
 * Proxies the Google Sheet as CSV so edits go live without a redeploy.
 *
 * Env var SHEET_CSV_URL – any of:
 *   • "Publish to web → CSV" link   (…/d/e/<id>/pub?output=csv)
 *   • a normal sheet link shared as "Anyone with the link can view" (…/d/<id>/edit#gid=0)
 *   • any other URL that returns CSV
 */
function toCsvUrl(raw: string): string {
  if (/\/d\/e\//.test(raw) || /[?&](output|format)=csv/.test(raw)) return raw;
  const id = raw.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return raw;
  const gid = raw.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

export async function GET() {
  const raw = process.env.SHEET_CSV_URL?.trim();
  if (!raw) return Response.json({ error: 'SHEET_CSV_URL is not set' }, { status: 503 });

  try {
    const upstream = await fetch(toCsvUrl(raw), { signal: AbortSignal.timeout(8000) });
    const body = await upstream.text();
    // A private sheet answers 200 with a login page, so check the body too.
    if (!upstream.ok || /^\s*<(!doctype|html)/i.test(body)) {
      throw new Error(`Sheet returned ${upstream.status} – is it shared as "Anyone with the link can view"?`);
    }
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        // Fresh for a minute at the edge, then served stale while it refreshes.
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Failed to load sheet' }, { status: 502 });
  }
}
