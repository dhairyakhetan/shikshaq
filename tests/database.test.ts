/**
 * The database rules (supabase/schema.sql), run on an empty in-memory Postgres with Supabase's sign-in stubbed: who can
 * read and call what, sending, numbering, duplicates, sending back, notifications, approving, paging, people and the
 * owner. Nothing here touches the real database. The tests run in order and build on each other.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

type Json = any;
type Result = { rows?: Json[]; error?: string };

const db = new PGlite();
const ids: Record<string, string> = {};

/** A signed-in person's pass, as Supabase gives it: Google unless `google` is false; their Google name unless `name` is null. */
function claims(email: string, { google = true, name }: { google?: boolean; name?: string | null } = {}) {
  ids[email] ??= `00000000-0000-0000-0000-${String(Object.keys(ids).length + 1).padStart(12, '0')}`;
  return { sub: ids[email], email, role: 'authenticated', app_metadata: { providers: [google ? 'google' : 'email'] }, user_metadata: name === null ? {} : { full_name: name ?? email.split('@')[0] } };
}
async function run(role: 'anon' | 'authenticated', pass: object | null, sql: string, params?: unknown[]): Promise<Result> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claims', '${pass ? JSON.stringify(pass).replace(/'/g, "''") : ''}', false);`);
  try {
    return { rows: (await db.query<Json>(sql, params)).rows };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    await db.exec('reset role');
  }
}
const anon = (sql: string) => run('anon', null, sql);
const as = (email: string, sql: string, params?: unknown[], opts?: Parameters<typeof claims>[1]) => run('authenticated', claims(email, opts), sql, params);
/** The value a call returns; fails the test if the call fails. */
async function value(email: string, sql: string, params?: unknown[], opts?: Parameters<typeof claims>[1]) {
  const r = await as(email, sql, params, opts);
  expect(r.error, sql).toBeUndefined();
  return Object.values(r.rows![0])[0] as Json;
}
const admin = async (sql: string, params?: unknown[]) => (await db.query<Json>(sql, params)).rows;
const refused = (r: Result, why: RegExp) => expect(r.error ?? 'it was allowed').toMatch(why);

const Q = (question: string, answer: string, x: object = {}) => ({
  chapter_id: 'CBSE10SCI01', topic_id: 'CBSE10SCI01T01', board: 'CBSE', class: 10, subject: 'Science', chapter_no: 1,
  chapter: 'Chemical Reactions', topic_no: 1, topic: 'Equations', question, answer, difficulty: null, ...x,
});
const send = (email: string, qs: unknown, opts?: Parameters<typeof claims>[1]) => as(email, 'select public.submit_batch($1::jsonb) r', [JSON.stringify(qs)], opts);
const sent = (email: string, qs: unknown, opts?: Parameters<typeof claims>[1]) => value(email, 'select public.submit_batch($1::jsonb)', [JSON.stringify(qs)], opts);
const decide = (email: string, list: string[], status: string, reason = '') => as(email, 'select public.hod_set_status($1::text[], $2, $3) r', [list, status, reason]);
const notes = (email: string) => value(email, 'select public.my_sent_back()');
const count = async (sql: string) => (await admin(`select count(*)::int n from ${sql}`))[0].n as number;

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;`);
  await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into public.roles (email, role, owner) values ('owner@x.in', 'admin', true), ('hod@x.in', 'hod', false)`);
}, 60_000);

describe('who can read and call what', () => {
  it('anyone, signed in or not, can read the question bank, and nothing else', async () => {
    expect((await anon('select count(*) from public.question_bank')).error).toBeUndefined();
    for (const t of ['questions', 'batches', 'roles']) refused(await anon(`select * from public.${t}`), /permission denied/);
    refused(await anon(`insert into public.question_bank (question_id) values ('x')`), /permission denied/);
    refused(await anon('select private.role()'), /permission denied/);
    for (const f of ['my_role()', 'waiting_count()', 'hod_questions()', 'hod_approved()', `submit_batch('[]')`, `hod_set_status('{}', 'approved', '')`,
      'my_sent_back()', 'mark_sent_back_seen()', 'admin_people()', `admin_set_role('a@b.in', 'hod')`, `admin_remove('a@b.in')`]) {
      refused(await anon(`select public.${f}`), /permission denied/);
    }
  });

  it('a sign-in that is not Google counts for nothing', async () => {
    const other = { google: false };
    expect(await value('mallory@x.in', 'select public.my_role()', [], other)).toBeNull();
    expect(await count(`public.roles where email = 'mallory@x.in'`)).toBe(0);
    refused(await send('mallory@x.in', [Q('Sneaky?', 'Yes')], other), /sign in/i);
    refused(await as('mallory@x.in', 'select public.my_sent_back()', [], other), /sign in/i);
    refused(await as('mallory@x.in', 'select public.hod_questions()', [], other), /Only HoDs/);
  });

  it('my_role saves a new person as a member, in lower case, with their Google name', async () => {
    expect(await value('owner@x.in', 'select public.my_role()')).toBe('admin');
    expect(await value('hod@x.in', 'select public.my_role()', [], { name: 'Mrs Hod' })).toBe('hod');
    expect(await value('Ann@X.in', 'select public.my_role()', [], { name: 'Ann Teacher' })).toBe('member');
    expect((await admin(`select * from public.roles where email = 'ann@x.in'`))[0]).toMatchObject({ role: 'member', name: 'Ann Teacher' });
    await value('ann@x.in', 'select public.my_role()', [], { name: null });
    expect((await admin(`select name from public.roles where email = 'ann@x.in'`))[0].name).toBe('Ann Teacher'); // no name: keeps the old one
    await value('ann@x.in', 'select public.my_role()', [], { name: 'Ann T' });
    expect((await admin(`select name from public.roles where email = 'ann@x.in'`))[0].name).toBe('Ann T');
  });

  it('my_role writes nothing on a refresh within 10 minutes, and notes the visit after that', async () => {
    const seen = async () => (await admin(`select last_seen_at from public.roles where email = 'ann@x.in'`))[0].last_seen_at as Date;
    await admin(`update public.roles set last_seen_at = now() - interval '5 minutes' where email = 'ann@x.in'`);
    const before = await seen();
    const xmin = async () => (await admin(`select xmin::text x from public.roles where email = 'ann@x.in'`))[0].x;
    const row = await xmin();
    expect(await value('ann@x.in', 'select public.my_role()', [], { name: 'Ann T' })).toBe('member');
    expect([await seen(), await xmin()]).toEqual([before, row]); // the same row version: nothing was written
    await admin(`update public.roles set last_seen_at = now() - interval '11 minutes' where email = 'ann@x.in'`);
    const old = await seen();
    await value('ann@x.in', 'select public.my_role()', [], { name: 'Ann T' });
    expect((await seen()).getTime()).toBeGreaterThan(old.getTime());
  });

  it('members can\'t read the tables, open the HoD desk or manage people', async () => {
    for (const t of ['questions', 'batches', 'roles']) refused(await as('ann@x.in', `select * from public.${t}`), /permission denied/);
    refused(await as('ann@x.in', `update public.question_bank set answer = 'x'`), /permission denied/);
    for (const f of ['waiting_count()', 'hod_questions()', 'hod_approved()', `hod_set_status('{}', 'approved', '')`]) refused(await as('ann@x.in', `select public.${f}`), /Only HoDs/);
    for (const f of ['admin_people()', `admin_set_role('b@x.in', 'hod')`, `admin_remove('hod@x.in')`]) refused(await as('ann@x.in', `select public.${f}`), /Only the admin/);
    refused(await as('hod@x.in', 'select public.admin_people()'), /Only the admin/);
  });
});

describe('people and roles', () => {
  it('the admin adds people and changes roles, and the change applies at once', async () => {
    refused(await as('owner@x.in', `select public.admin_set_role('not-an-email', 'hod')`), /doesn't look like an email/);
    refused(await as('owner@x.in', `select public.admin_set_role('x@y.in', 'boss')`), /Unknown role/);
    await value('owner@x.in', `select public.admin_set_role('  Ben@X.IN ', 'hod')`);
    expect(await value('ben@x.in', 'select public.my_role()', [], { name: 'Ben' })).toBe('hod');
    await value('owner@x.in', `select public.admin_set_role('ben@x.in', 'member')`);
    refused(await as('ben@x.in', 'select public.hod_questions()'), /Only HoDs/);
  });

  it('nobody can remove or demote themselves or the owner; the owner can demote other admins', async () => {
    refused(await as('owner@x.in', `select public.admin_set_role('owner@x.in', 'member')`), /own admin role/);
    refused(await as('owner@x.in', `select public.admin_remove('OWNER@x.in')`), /remove yourself/);
    await value('owner@x.in', `select public.admin_set_role('dee@x.in', 'admin')`);
    refused(await as('dee@x.in', `select public.admin_set_role('owner@x.in', 'hod')`), /owner stays an admin/);
    refused(await as('dee@x.in', `select public.admin_remove('owner@x.in')`), /owner can't be removed/);
    expect((await as('dee@x.in', `select public.admin_set_role('owner@x.in', 'admin')`)).error).toBeUndefined();
    await value('owner@x.in', `select public.admin_set_role('dee@x.in', 'hod')`);
    refused(await as('dee@x.in', 'select public.admin_people()'), /Only the admin/);
  });

  it('lists the owner, then admins, HoDs and members; removed people come back as members', async () => {
    await value('owner@x.in', `select public.admin_set_role('aaron@x.in', 'admin')`); // sorts before the owner by name
    const people = await value('owner@x.in', 'select public.admin_people()');
    expect(people[0]).toMatchObject({ email: 'owner@x.in', owner: true });
    expect(people[1]).toMatchObject({ email: 'aaron@x.in', role: 'admin', owner: false });
    expect(people.findIndex((p: Json) => p.role === 'member')).toBeGreaterThan(people.findIndex((p: Json) => p.role === 'hod'));
    await value('owner@x.in', `select public.admin_remove('ben@x.in')`);
    expect(await count(`public.roles where email = 'ben@x.in'`)).toBe(0);
    expect(await value('ben@x.in', 'select public.my_role()', [], { name: 'Ben' })).toBe('member');
  });

  it('there is one owner, and the owner is an admin', async () => {
    await expect(admin(`update public.roles set owner = true where email = 'ann@x.in'`)).rejects.toThrow(/check constraint/);
    await expect(admin(`update public.roles set role = 'admin', owner = true where email = 'hod@x.in'`)).rejects.toThrow(/duplicate key/);
  });
});

describe('sending questions', () => {
  it('refuses a batch that is empty, too big, or has a question with no chapter ID', async () => {
    refused(await send('ann@x.in', { not: 'a list' }), /between 1 and 500/);
    refused(await send('ann@x.in', []), /between 1 and 500/);
    refused(await send('ann@x.in', Array.from({ length: 501 }, (_, i) => Q(`Q${i}?`, 'A'))), /between 1 and 500/);
    refused(await send('ann@x.in', [Q('No chapter?', 'A', { chapter_id: null })]), /no chapter ID/);
  });

  it('checks the chapter ID\'s codes against the board and subject', async () => {
    for (const x of [{ subject: 'Mathematics' }, { subject: 'Scince' }, { board: 'ICSE' }, { chapter_id: 'cbse10sci01', topic_id: null, topic_no: null }]) {
      refused(await send('ann@x.in', [Q('Code check?', 'A', x)]), /doesn't match/);
    }
    expect((await send('ann@x.in', [Q('Made-up subject?', 'Fine', { subject: 'Robotix', chapter_id: 'CBSE10ROB01' })])).error).toBeUndefined();
    expect((await send('ann@x.in', [Q('Made-up board?', 'Fine', { board: 'Dps Board', chapter_id: 'DPSB10SCI01' })])).error).toBeUndefined();
  });

  it('works out each topic ID itself, and keeps to the limits', async () => {
    const r = await sent('ann@x.in', [Q('Topic ID that disagrees?', 'A', { topic_id: 'CBSE10SCI01T09' })]);
    expect((await admin('select topic_id from public.questions where question_id = $1', [r.question_ids[0]]))[0].topic_id).toBe('CBSE10SCI01T01');
    for (const x of [{ class: 13, chapter_id: 'CBSE13SCI01' }, { answer: 'a'.repeat(101) }, { question: 'q'.repeat(301) }, { answer: '  ' }, { difficulty: 'tough' }]) {
      expect((await send('ann@x.in', [Q('Limits?', 'Answer', x)])).error).toBeDefined();
    }
    expect((await send('ann@x.in', [Q('q'.repeat(300), 'b'.repeat(100))])).error).toBeUndefined();
  });

  it('numbers questions within their topic, skips repeats, and gives batch IDs that say the day', async () => {
    const day = (await admin(`select to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD') d`))[0].d;
    const b = await sent('ann@x.in', [Q('What is rust?', 'Iron oxide'), Q('What is rust?', 'Iron oxide'), Q('No topic?', 'Fine', { topic_id: null, topic_no: null, topic: '' })]);
    expect(b.batch_id).toMatch(new RegExp(`^B${day}-\\d{2}$`));
    expect([b.sent, b.already]).toEqual([2, 1]);
    expect(b.question_ids).toContain('CBSE10SCI01T00Q001');
    expect(b).not.toHaveProperty('questions'); // only the IDs come back, not every row
    const again = await sent('ann@x.in', [Q('WHAT IS  RUST', 'iron oxide'), Q('What is rust?!', 'Something else')]);
    expect(again).toMatchObject({ sent: 0, already: 2, batch_id: null }); // case, spaces and end punctuation don't count
    expect((await sent('ann@x.in', [Q('What is rust?', 'Iron oxide', { chapter_id: 'CBSE10SCI02', chapter_no: 2 })])).sent).toBe(1); // another chapter
    const days = (await admin(`select batch_id from public.batches where batch_id like 'B${day}-%' order by 1`)).map((x) => x.batch_id);
    expect(days).toEqual(days.map((_, i) => `B${day}-${String(i + 1).padStart(2, '0')}`)); // no gaps, empty batches leave nothing
  });

  it('names the batch after the Google name, never the email', async () => {
    await sent('noname@x.in', [Q('Nameless?', 'Ok')], { name: null });
    expect((await admin(`select teacher from public.batches where teacher_email = 'noname@x.in'`))[0].teacher).toBe('A teacher');
    await sent('long@x.in', [Q('Long name?', 'Ok')], { name: 'N'.repeat(120) });
    expect((await admin(`select char_length(teacher)::int n from public.batches where teacher_email = 'long@x.in'`))[0].n).toBe(80);
    expect(await count('public.question_bank')).toBe(0); // nothing is in the bank before approval
  });
});

describe('the HoD desk, notifications and the question bank', () => {
  let rust = '';
  let copy = '';

  it('lists what is waiting, with the teacher, email and time, oldest first', async () => {
    const waiting = await value('hod@x.in', 'select public.waiting_count()');
    const desk = await value('hod@x.in', 'select public.hod_questions()');
    expect(desk).toHaveLength(waiting);
    expect(desk.every((x: Json) => x.teacher && x.teacher_email && x.sent_at)).toBe(true);
    expect(desk.every((x: Json, i: number) => i === 0 || desk[i - 1].sent_at <= x.sent_at)).toBe(true);
    rust = desk.find((x: Json) => x.question === 'What is rust?' && x.chapter_id === 'CBSE10SCI01').question_id;
  });

  it('sending back needs a reason, and saves who and when', async () => {
    refused(await decide('hod@x.in', [rust], 'rejected', '   '), /Say why/);
    refused(await decide('hod@x.in', [rust], 'done'), /Unknown status/);
    expect((await decide('hod@x.in', ['NOPE'], 'approved')).rows![0].r.changed).toEqual([]);
    await decide('hod@x.in', [rust], 'rejected', '  Write the formula too.  ');
    expect((await admin('select * from public.questions where question_id = $1', [rust]))[0]).toMatchObject({ status: 'rejected', note: 'Write the formula too.', reviewed_by: 'hod@x.in', seen_at: null });
  });

  it('the teacher, and only the teacher, gets a notification', async () => {
    const [n] = await notes('ann@x.in');
    expect(n).toMatchObject({ note: 'Write the formula too.', reviewer: 'Mrs Hod', seen: false, now: null });
    expect(n).not.toHaveProperty('reviewed_by');
    expect(await notes('ben@x.in')).toEqual([]);
    await value('ben@x.in', 'select public.mark_sent_back_seen()');
    expect((await notes('ann@x.in'))[0].seen).toBe(false);
    await value('ann@x.in', 'select public.mark_sent_back_seen()');
    expect((await notes('ann@x.in'))[0].seen).toBe(true);
  });

  it('sent back to you, unchanged: not sent again; sent back to someone else: sent as new', async () => {
    const mine = await sent('ann@x.in', [Q('what is rust', 'Iron Oxide.')]);
    expect(mine).toMatchObject({ sent: 0, sent_back: 1, sent_back_ids: [rust] });
    const theirs = await sent('ben@x.in', [Q('What is rust?', 'Iron oxide')]);
    expect(theirs.sent).toBe(1);
    copy = theirs.question_ids[0];
    expect(Number(copy.slice(-3))).toBeGreaterThan(Number(rust.slice(-3))); // numbers are never reused
    expect((await notes('ann@x.in'))[0].now).toBe('pending');
  });

  it('a sent-back question stays sent back while its copy waits or is approved', async () => {
    for (const status of ['pending', 'approved']) expect((await decide('hod@x.in', [rust], status)).rows![0].r).toMatchObject({ changed: [], skipped: [rust] });
    await decide('hod@x.in', [copy], 'approved');
    expect((await notes('ann@x.in'))[0].now).toBe('approved');
    const [d1] = (await sent('dan@x.in', [Q('What is an alloy?', 'Mixture of metals')])).question_ids;
    await decide('hod@x.in', [d1], 'rejected', 'Too easy.');
    const [d2] = (await sent('eve@x.in', [Q('What is an alloy?', 'Mixture of metals')])).question_ids;
    await decide('hod@x.in', [d2], 'rejected', 'Too easy.');
    const both = (await decide('hod@x.in', [d1, d2], 'pending')).rows![0].r;
    expect([both.changed.length, both.skipped.length]).toEqual([1, 1]);
  });

  it('a new reason is a new notification; the same one again changes nothing', async () => {
    await decide('hod@x.in', [rust], 'rejected', 'Duplicate of an approved one.');
    expect((await notes('ann@x.in'))[0].seen).toBe(false);
    await value('ann@x.in', 'select public.mark_sent_back_seen()');
    expect((await decide('hod@x.in', [rust], 'rejected', 'Duplicate of an approved one.')).rows![0].r.changed).toEqual([]);
    expect((await notes('ann@x.in'))[0].seen).toBe(true);
  });

  it('an HoD with no name on record shows as "Your HoD"', async () => {
    await value('owner@x.in', `select public.admin_set_role('quiet@x.in', 'hod')`);
    const [z] = (await sent('zed@x.in', [Q('What is an ore?', 'Mineral with metal')])).question_ids;
    await as('quiet@x.in', 'select public.hod_set_status($1::text[], $2, $3)', [[z], 'rejected', 'Name the metal.'], { name: null });
    expect((await notes('zed@x.in'))[0].reviewer).toBe('Your HoD');
  });

  it('approving 500 at once fills the question bank with every column; approving again changes nothing', async () => {
    const qs = Array.from({ length: 500 }, (_, i) => Q(`Bulk question ${i}?`, `Answer ${i}`, { topic_no: (i % 5) + 1, topic: `Topic ${(i % 5) + 1}` }));
    const ids: string[] = (await sent('bulk@x.in', qs)).question_ids;
    const done = (await decide('hod@x.in', ids, 'approved')).rows![0].r;
    expect(done.changed).toHaveLength(500);
    // the counts the page shows come back with the change, so it needs no more calls
    expect(done).toMatchObject({ waiting: await count(`public.questions where status = 'pending'`), approved: await count('public.question_bank') });
    expect(done.approved).toBeGreaterThanOrEqual(500);
    const [bank] = await admin('select * from public.question_bank where question_id = $1', [ids[0]]);
    const [row] = await admin('select * from public.questions where question_id = $1', [ids[0]]);
    for (const k of ['board', 'class', 'subject', 'chapter_no', 'chapter', 'topic_no', 'topic', 'question_no', 'question', 'answer', 'difficulty', 'chapter_id', 'topic_id']) expect(bank[k], k).toEqual(row[k]);
    expect(bank.teacher).toBe('bulk');
    expect((await decide('hod@x.in', [ids[0]], 'approved')).rows![0].r.changed).toEqual([]);
    expect((await admin('select approved_at from public.question_bank where question_id = $1', [ids[0]]))[0].approved_at).toEqual(bank.approved_at);
    await decide('hod@x.in', [ids[1]], 'pending');
    expect((await admin('select reviewed_by, reviewed_at from public.questions where question_id = $1', [ids[1]]))[0]).toEqual({ reviewed_by: null, reviewed_at: null });
    await decide('hod@x.in', [ids[2]], 'rejected', 'No.');
    expect(await count(`public.question_bank where question_id in ('${ids[1]}', '${ids[2]}')`)).toBe(0);
    expect((await as('ann@x.in', 'select count(*)::int n from public.question_bank')).rows![0].n).toBe(await count(`public.questions where status = 'approved'`));
  });

  it('pages through the approved questions newest first, each exactly once, even when approved at the same moment', async () => {
    const take = 37;
    let page = await value('hod@x.in', 'select public.hod_approved(null, null, $1)', [take]);
    const all = [...page];
    while (page.length === take) {
      const last = page[page.length - 1];
      page = await value('hod@x.in', 'select public.hod_approved($1::timestamptz, $2, $3)', [last.reviewed_at, last.question_id, take]);
      all.push(...page);
    }
    const approved = await count(`public.questions where status = 'approved'`);
    expect(new Set(all.map((x) => x.question_id)).size).toBe(approved);
    expect(all).toHaveLength(approved);
    expect(all.every((x, i) => i === 0 || all[i - 1].reviewed_at >= x.reviewed_at)).toBe(true);
    expect(await value('hod@x.in', 'select public.hod_approved(null, null, 0)')).toHaveLength(1);
    expect((await value('hod@x.in', 'select public.hod_questions()')).every((x: Json) => x.status !== 'approved')).toBe(true);
  });
});
