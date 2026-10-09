/**
 * The only way to write to the database. Runs on Vercel (not in the browser) with the Supabase secret key, which is
 * kept in Vercel's environment variables as SUPABASE_SECRET_KEY and is never in this repo or the page. The public key
 * can read but not write, so every Send and every Approve / Send back goes through here.
 *
 * POST /api/write  { "fn": "submit_batch", "args": { "teacher": "...", "questions": [...] } }
 *                  { "fn": "hod_set_status", "args": { "ids": [...], "new_status": "approved", "reason": "" } }
 * Answers with what the database answered.
 */
const DATABASE = 'https://dfytzracuyiitlqeqszm.supabase.co/rest/v1';
const ALLOWED = ['submit_batch', 'hod_set_status'];

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return answer(500, { message: 'The server has no database key yet (SUPABASE_SECRET_KEY on Vercel).' });

  const body = await request.json().catch(() => null);
  if (!body || !ALLOWED.includes(body.fn) || typeof body.args !== 'object' || body.args === null) {
    return answer(400, { message: 'That is not something the site can write.' });
  }

  // new secret keys (sb_secret_...) go in the apikey header only; an older service_role key is a JWT and goes in both
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetch(`${DATABASE}/rpc/${body.fn}`, { method: 'POST', headers, body: JSON.stringify(body.args) });
    return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return answer(502, { message: "The server couldn't reach the database. Try again." });
  }
}
