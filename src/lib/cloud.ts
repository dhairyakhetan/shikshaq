/**
 * Saving question sets online (Supabase). The browser only holds the project's public key, so the database
 * exposes two functions and nothing else (see supabase/schema.sql). Plain fetch: no SDK needed.
 */
export const MAX_SAVE_CHARS = 200_000; // keep in step with supabase/schema.sql
export const MAX_TITLE = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isSetId = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

export interface CloudConfig { url: string; key: string }
export interface CloudSet { id: string; title: string; raw: string; createdAt: string }

export class CloudError extends Error {}

/** Names what is wrong when a key must never be in a web page; null when it looks like a public key. */
export function keyProblem(key: string): string | null {
  if (key.startsWith('sb_secret_')) return 'a secret key';
  if (key.startsWith('eyJ')) {
    try {
      const part = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const role = (JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as { role?: string }).role;
      if (role === 'service_role') return 'a service_role key';
    } catch { /* not a readable JWT: let the database judge it */ }
  }
  return null;
}

/** null (the feature stays hidden) unless both settings are present, sane, and the key is a public one. */
export function cloudConfig(env: Record<string, string | undefined> = import.meta.env): CloudConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) return null;
  } catch {
    return null;
  }
  const problem = keyProblem(key);
  if (problem) {
    console.error(`Online saving is switched off: the Supabase key in this build is ${problem}, which must never be put in a web page. Use the publishable (anon) key instead.`);
    return null;
  }
  return { url, key };
}

async function call<T>(cfg: CloudConfig, fn: string, body: object, f: typeof fetch): Promise<T> {
  let res: Response;
  try {
    res = await f(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      // Publishable keys go in `apikey` only; they are not JWTs, so they must not be sent as a Bearer token.
      headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CloudError("Couldn't reach the database. Check your connection and try again.");
  }
  if (res.ok) return (await res.json()) as T;

  const info = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (info.code === 'PGRST202' || res.status === 404) {
    throw new CloudError('The database is not set up yet. Run supabase/schema.sql in the Supabase SQL editor.');
  }
  if (res.status === 401 || res.status === 403) throw new CloudError('The database did not accept the Supabase key this site was built with.');
  if (info.code === '22023' && info.message) throw new CloudError(info.message); // the database's own plain-language checks
  throw new CloudError('The database returned an error. Try again in a moment.');
}

/** Saves a set and returns the id that opens it. */
export async function saveSet(cfg: CloudConfig, title: string, raw: string, f: typeof fetch = fetch): Promise<string> {
  if (!raw.trim()) throw new CloudError('There are no questions to save.');
  if (raw.length > MAX_SAVE_CHARS) throw new CloudError(`There are too many questions to save (the limit is ${MAX_SAVE_CHARS} characters).`);
  const id = await call<unknown>(cfg, 'create_question_set', { p_title: title, p_raw: raw }, f);
  if (!isSetId(id)) throw new CloudError('The database gave an unexpected answer.');
  return id;
}

/** The set with this id, or null when there is none. */
export async function loadSet(cfg: CloudConfig, id: string, f: typeof fetch = fetch): Promise<CloudSet | null> {
  if (!isSetId(id)) throw new CloudError('That is not a valid link to a saved set.');
  const rows = await call<unknown>(cfg, 'get_question_set', { p_id: id }, f);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  if (typeof r.title !== 'string' || typeof r.raw !== 'string') throw new CloudError('The database gave an unexpected answer.');
  return { id, title: r.title, raw: r.raw, createdAt: typeof r.created_at === 'string' ? r.created_at : '' };
}
