import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
let db: PGlite;

/** Runs `fn` the way the website's public key does: as the `anon` role. */
async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec('set role anon');
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const save = (title: string | null, raw: string | null) =>
  asAnon(async () => (await db.query<{ id: string }>('select public.create_question_set($1, $2) as id', [title, raw])).rows[0].id);
const open = (id: string | null) =>
  asAnon(async () => (await db.query<{ id: string; title: string; raw: string; created_at: Date }>('select * from public.get_question_set($1)', [id])).rows);

beforeAll(async () => {
  db = new PGlite();
  // Supabase already has these roles; a bare Postgres does not.
  await db.exec('create role anon nologin; create role authenticated nologin;');
  // ...and Supabase hands these roles access to every new table by default, so the schema has to take it away again.
  await db.exec('grant usage on schema public to anon, authenticated');
  await db.exec('alter default privileges in schema public grant all on tables to anon, authenticated');
  await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated');
  await db.exec(SCHEMA);
}, 60_000);
afterAll(async () => { await db.close(); });

describe('supabase/schema.sql, as the public key sees it', () => {
  it('can be run twice without error', async () => {
    await db.exec(SCHEMA);
  });

  it('keeps the table locked: no listing, reading, inserting, editing or deleting', async () => {
    const id = await save('Locked', 'Q | A');
    for (const sql of [
      'select * from public.question_sets',
      'select count(*) from public.question_sets',
      "insert into public.question_sets (title, raw) values ('x', 'y')",
      "update public.question_sets set title = 'hacked'",
      'delete from public.question_sets',
      `select raw from public.question_sets where id = '${id}'`,
    ]) {
      await expect(asAnon(() => db.query(sql)), sql).rejects.toThrow(/permission denied/);
    }
    // ...and the same through "authenticated" (a signed-in user gets nothing extra)
    await db.exec('set role authenticated');
    await expect(db.query('select * from public.question_sets')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });

  it('would still hold if the grants were ever put back: row level security is the second wall', async () => {
    const id = await save('Walled', 'Q | A');
    await db.exec('grant all on public.question_sets to anon');
    try {
      expect((await asAnon(() => db.query('select * from public.question_sets'))).rows).toEqual([]); // sees no rows
      await expect(asAnon(() => db.query("insert into public.question_sets (title, raw) values ('x', 'y')"))).rejects.toThrow(/row-level security/);
      expect((await asAnon(() => db.query("update public.question_sets set title = 'hacked' returning id"))).rows).toEqual([]);
      expect((await asAnon(() => db.query('delete from public.question_sets returning id'))).rows).toEqual([]);
    } finally {
      await db.exec('revoke all on public.question_sets from anon');
    }
    expect((await open(id))[0].title).toBe('Walled'); // nothing was touched
  });

  it('says in the catalog what it says in the comments', async () => {
    const priv = async (q: string) => (await db.query<{ ok: boolean }>(q)).rows[0].ok;
    expect(await priv("select has_table_privilege('anon', 'public.question_sets', 'select') as ok")).toBe(false);
    expect(await priv("select has_table_privilege('anon', 'public.question_sets', 'insert') as ok")).toBe(false);
    expect(await priv("select has_function_privilege('anon', 'public.create_question_set(text, text)', 'execute') as ok")).toBe(true);
    expect(await priv("select has_function_privilege('anon', 'public.get_question_set(uuid)', 'execute') as ok")).toBe(true);
    expect(await priv("select relrowsecurity as ok from pg_class where oid = 'public.question_sets'::regclass")).toBe(true);
    expect((await db.query("select count(*)::int as n from pg_policies where tablename = 'question_sets'")).rows[0]).toEqual({ n: 0 });
    // both functions run with their owner's rights, so they must pin their own search_path
    const fns = (await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      "select proname, prosecdef, proconfig from pg_proc where proname in ('create_question_set', 'get_question_set') order by proname")).rows;
    expect(fns.map((f) => f.proname)).toEqual(['create_question_set', 'get_question_set']);
    for (const f of fns) {
      expect(f.prosecdef, f.proname).toBe(true);
      expect(f.proconfig, f.proname).toContain('search_path=""');
    }
  });

  it('saves a set and opens it by id, exactly as it was written', async () => {
    const raw = 'Capital of France | Paris\nभारत की राजधानी | नई दिल्ली\nSay "hi", it\'s <b>fine</b> | ok\n\n';
    const id = await save('  My Quiz  ', raw);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); // random v4
    const rows = await open(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, title: 'My Quiz', raw });
    expect(rows[0].created_at).toBeInstanceOf(Date);
  });

  it('gives every save its own id', async () => {
    const ids = await Promise.all([1, 2, 3, 4, 5].map((i) => save('Same', `Q${i} | A`)));
    expect(new Set(ids).size).toBe(5);
  });

  it('opens nothing for an unknown id, and a null id cannot be used to list everything', async () => {
    await save('Exists', 'Q | A');
    expect(await open('00000000-0000-4000-8000-000000000000')).toEqual([]);
    expect(await open(null)).toEqual([]);
  });

  it('cleans the title: trims, shortens to 120, never empty', async () => {
    expect((await open(await save('\n  Padded \t', 'Q | A')))[0].title).toBe('Padded');
    expect((await open(await save('x'.repeat(300), 'Q | A')))[0].title).toBe('x'.repeat(120));
    expect((await open(await save(null, 'Q | A')))[0].title).toBe('Untitled');
    expect((await open(await save(' \n\t ', 'Q | A')))[0].title).toBe('Untitled');
  });

  it('refuses nothing to save, with a message the website can show', async () => {
    for (const raw of [null, '', '   ', '\n\t\r\n']) {
      await expect(save('T', raw), JSON.stringify(raw)).rejects.toThrow('There are no questions to save.');
    }
  });

  it('refuses a huge paste, but takes exactly the limit', async () => {
    await expect(save('T', 'x'.repeat(200_001))).rejects.toThrow(/too many questions to save/);
    const id = await save('Big', 'x'.repeat(200_000));
    expect((await open(id))[0].raw).toHaveLength(200_000);
  });

  it('has the same limits in the table itself (a second wall behind the function)', async () => {
    await expect(db.query("insert into public.question_sets (title, raw) values ('', 'x')")).rejects.toThrow(/check constraint/);
    await expect(db.query("insert into public.question_sets (title, raw) values ('t', '')")).rejects.toThrow(/check constraint/);
    await expect(db.query("insert into public.question_sets (title, raw) values ($1, 'x')", ['t'.repeat(121)])).rejects.toThrow(/check constraint/);
  });

  it('is not affected by whatever search_path the caller sets', async () => {
    await db.exec("set search_path = pg_temp");
    const id = await save('Path', 'Q | A');
    expect((await open(id))[0].title).toBe('Path');
    await db.exec('reset search_path');
  });

  it('does not let one function be used to reach the table through a fake schema object', async () => {
    // a caller-made look-alike in the caller's own schema must not shadow the real table
    await db.exec("create schema evil; create table evil.question_sets (id uuid, title text, raw text, created_at timestamptz)");
    await db.exec("set search_path = evil, public");
    const id = await save('Real', 'Q | A');
    await db.exec('reset search_path');
    expect((await db.query('select count(*)::int as n from evil.question_sets')).rows[0]).toEqual({ n: 0 });
    expect((await open(id))[0].title).toBe('Real');
  });
});
