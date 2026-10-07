import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudError, cloudConfig, isSetId, keyProblem, loadSet, MAX_SAVE_CHARS, MAX_TITLE, saveSet, type CloudConfig } from '../src/lib/cloud';
import { addSaved, MAX_SAVED, removeSaved, type SavedSet } from '../src/lib/saved';

const cfg: CloudConfig = { url: 'https://abc.supabase.co', key: 'sb_publishable_test' };
const ID = '3f2b8c1e-7a4d-4e0b-9c55-0a1b2c3d4e5f';
const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

/** A fake `fetch` that records the request and answers with `body`. */
function fake(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' && status !== 200 ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

afterEach(() => vi.restoreAllMocks());

describe('cloudConfig', () => {
  it('needs both the URL and a key', () => {
    expect(cloudConfig({})).toBeNull();
    expect(cloudConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toBeNull();
    expect(cloudConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
  });

  it('takes the publishable key or the older anon key, and tidies the URL (a trailing slash is fine)', () => {
    expect(cloudConfig({ VITE_SUPABASE_URL: ' https://abc.supabase.co/ ', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' });
    expect(cloudConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co//', VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon' }) })?.url).toBe('https://abc.supabase.co');
  });

  it('only talks to https, apart from a local test server', () => {
    expect(cloudConfig({ VITE_SUPABASE_URL: 'http://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull();
    expect(cloudConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull();
    expect(cloudConfig({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'k' })).not.toBeNull();
    expect(cloudConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'k' })).not.toBeNull();
  });

  it('switches itself off, loudly, if a secret key is configured: it would be published in the page', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cloudConfig({ VITE_SUPABASE_URL: cfg.url, VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' })).toBeNull();
    expect(cloudConfig({ VITE_SUPABASE_URL: cfg.url, VITE_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) })).toBeNull();
    expect(err).toHaveBeenCalledTimes(2);
    expect(String(err.mock.calls[0][0])).toContain('secret key');
    expect(String(err.mock.calls[1][0])).toContain('service_role');
  });

  it('recognises which keys are public', () => {
    expect(keyProblem('sb_publishable_abc')).toBeNull();
    expect(keyProblem(jwt({ role: 'anon' }))).toBeNull();
    expect(keyProblem('eyJnot.a.jwt')).toBeNull();
    expect(keyProblem(jwt({ role: 'service_role' }))).toBe('a service_role key');
  });
});

describe('saveSet', () => {
  it('calls the save function with the key in the apikey header and nothing as a Bearer token', async () => {
    const { f, calls } = fake(ID);
    expect(await saveSet(cfg, 'My Quiz', 'Q | A', f)).toBe(ID);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://abc.supabase.co/rest/v1/rpc/create_question_set');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ apikey: 'sb_publishable_test', 'Content-Type': 'application/json' });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_title: 'My Quiz', p_raw: 'Q | A' });
  });

  it('checks size and emptiness before sending anything', async () => {
    const { f, calls } = fake(ID);
    await expect(saveSet(cfg, 't', '  \n ', f)).rejects.toThrow('There are no questions to save.');
    await expect(saveSet(cfg, 't', 'x'.repeat(MAX_SAVE_CHARS + 1), f)).rejects.toThrow(/too many questions to save/);
    expect(calls).toHaveLength(0);
    await saveSet(cfg, 't', 'x'.repeat(MAX_SAVE_CHARS), f);
    expect(calls).toHaveLength(1);
  });

  it('does not trust an answer that is not an id', async () => {
    await expect(saveSet(cfg, 't', 'Q | A', fake('not-an-id').f)).rejects.toThrow('unexpected answer');
    await expect(saveSet(cfg, 't', 'Q | A', fake({ id: ID }).f)).rejects.toThrow('unexpected answer');
  });
});

describe('loadSet', () => {
  it('opens a set by id', async () => {
    const { f, calls } = fake([{ id: ID, title: 'My Quiz', raw: 'Q | A\nQ2 | A2', created_at: '2026-10-07T10:00:00Z' }]);
    expect(await loadSet(cfg, ID, f)).toEqual({ id: ID, title: 'My Quiz', raw: 'Q | A\nQ2 | A2', createdAt: '2026-10-07T10:00:00Z' });
    expect(calls[0].url).toBe('https://abc.supabase.co/rest/v1/rpc/get_question_set');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_id: ID });
  });

  it('answers null when there is no such set', async () => {
    expect(await loadSet(cfg, ID, fake([]).f)).toBeNull();
  });

  it('refuses anything that is not an id without asking the database', async () => {
    const { f, calls } = fake([]);
    for (const bad of ['', 'abc', `${ID}x`, `../${ID}`, "' or 1=1 --", '00000000-0000-0000-0000-00000000000g']) {
      await expect(loadSet(cfg, bad, f), bad).rejects.toThrow('not a valid link');
    }
    expect(calls).toHaveLength(0);
  });

  it('does not trust a row of the wrong shape', async () => {
    await expect(loadSet(cfg, ID, fake([{ id: ID, title: 5, raw: null }]).f)).rejects.toThrow('unexpected answer');
  });

  it('knows what an id looks like', () => {
    expect(isSetId(ID)).toBe(true);
    expect(isSetId(ID.toUpperCase())).toBe(true);
    expect(isSetId(null)).toBe(false);
    expect(isSetId(42)).toBe(false);
  });
});

describe('errors come back in plain language', () => {
  const msg = async (body: unknown, status: number) => (await saveSet(cfg, 't', 'Q | A', fake(body, status).f).catch((e: Error) => e)) as CloudError;

  it('database not set up yet', async () => {
    expect((await msg({ code: 'PGRST202', message: 'Could not find the function' }, 404)).message).toContain('Run supabase/schema.sql');
    expect((await msg('Not Found', 404)).message).toContain('Run supabase/schema.sql');
  });
  it('key refused', async () => {
    expect((await msg({ message: 'Invalid API key' }, 401)).message).toContain('did not accept the Supabase key');
    expect((await msg({}, 403)).message).toContain('did not accept the Supabase key');
  });
  it("shows the database's own checks, but nothing else it says", async () => {
    expect((await msg({ code: '22023', message: 'There are no questions to save.' }, 400)).message).toBe('There are no questions to save.');
    expect((await msg({ code: 'XX000', message: 'relation "secret_table" exploded at 10.0.0.5' }, 400)).message).toBe('The database returned an error. Try again in a moment.');
    expect((await msg('<html>bad gateway</html>', 502)).message).toBe('The database returned an error. Try again in a moment.');
  });
  it('no connection', async () => {
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const e = await saveSet(cfg, 't', 'Q | A', down).catch((x: Error) => x);
    expect(e).toBeInstanceOf(CloudError);
    expect((e as Error).message).toContain("Couldn't reach the database");
  });
});

describe('the list of sets saved from this browser', () => {
  const at = (n: number): SavedSet => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title: `Set ${n}`, at: n });

  it('puts the newest first and does not list a set twice', () => {
    let list: SavedSet[] = [];
    list = addSaved(list, at(1));
    list = addSaved(list, at(2));
    list = addSaved(list, { ...at(1), at: 3 });
    expect(list.map((s) => s.at)).toEqual([3, 2]);
  });
  it('keeps only the latest few', () => {
    let list: SavedSet[] = [];
    for (let i = 1; i <= MAX_SAVED + 5; i++) list = addSaved(list, at(i));
    expect(list).toHaveLength(MAX_SAVED);
    expect(list[0].at).toBe(MAX_SAVED + 5);
  });
  it('can forget one', () => {
    expect(removeSaved([at(1), at(2)], at(1).id).map((s) => s.at)).toEqual([2]);
  });
});

describe('the browser code and supabase/schema.sql agree', () => {
  const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  it('on the limits', () => {
    expect(sql).toContain(`char_length(raw) between 1 and ${MAX_SAVE_CHARS}`);
    expect(sql).toContain(`char_length(p_raw) > ${MAX_SAVE_CHARS}`);
    expect(sql).toContain(`char_length(title) between 1 and ${MAX_TITLE}`);
    expect(sql).toContain(`left(btrim(coalesce(p_title, ''), E' \\t\\r\\n'), ${MAX_TITLE})`);
  });
  it('on the function names and argument names the browser calls', () => {
    const src = readFileSync(new URL('../src/lib/cloud.ts', import.meta.url), 'utf8');
    expect(sql).toContain('function public.create_question_set(p_title text, p_raw text)');
    expect(sql).toContain('function public.get_question_set(p_id uuid)');
    expect(src).toContain("'create_question_set', { p_title: title, p_raw: raw }");
    expect(src).toContain("'get_question_set', { p_id: id }");
  });
  it('on the message shown when a paste is too long', () => {
    expect(sql).toContain(`There are too many questions to save (the limit is ${MAX_SAVE_CHARS} characters).`);
  });
});
