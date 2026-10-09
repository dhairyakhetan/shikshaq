-- The question bank behind the formatter, the HoD desk and Revise (Supabase project "dhairyakhetan's Project").
--
--   batches        one row per "Send for approval": who sent it and when
--   questions      every question ever sent, with its status: pending (waiting), approved, or rejected (sent back)
--   question_bank  the clean final table: approved questions only, kept in step with `questions` by a trigger
--
-- IDs say what they are:
--   question_id  CBSE10SCI01T02Q003 = CBSE, class 10, Science (SCI), chapter 01, topic 02, question 003 of that topic
--                (T00 when the question has no topic). Numbers are given in order and never reused.
--   batch_id     B20261009-03 = the 3rd batch sent on 9 October 2026 (India time)
--
-- Who can do what (sign-in is Supabase Auth with Google only; keep the Email provider off, so nobody can claim an
-- email without proving it). Nothing at all is readable without signing in.
--   member    anyone signed in (saved in public.roles the first time they open the site): reads question_bank;
--             submit_batch(questions) sends a batch as themselves
--   hod       also the HoD desk: hod_questions(), waiting_count(), and hod_set_status(ids, new_status, reason) to
--             approve, send back, or move back to waiting
--   admin     the same as an HoD in the database, plus admin_people(), admin_set_role(email, role), admin_remove(email);
--             the site also shows the admin Revise
-- my_role() saves a new person as a member and tells the site their role, every time the site opens.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- how two questions are compared: case and extra spaces don't matter
create function private.norm(t text) returns text language sql immutable set search_path = ''
as $$ select lower(regexp_replace(btrim(t), '\s+', ' ', 'g')) $$;

-- everyone who has signed in, and anyone the admin added, with their role
create table public.roles (
  email text primary key check (email = lower(email)),
  role text not null constraint roles_role_check check (role in ('admin', 'hod', 'member')),
  name text,
  added_at timestamptz not null default now(),
  last_seen_at timestamptz
);

-- the signed-in person's role: admin, hod or member; null when not signed in with Google
create function private.role() returns text language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null or not coalesce((auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false) then null
    else coalesce((select r.role from public.roles r where r.email = lower(auth.jwt() ->> 'email')), 'member')
  end
$$;

-- HoDs and the admin can approve
create function private.is_hod() returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.role() in ('hod', 'admin'), false) $$;

-- called every time the site opens: saves a new person as a member, notes their name and when they were last here,
-- and returns their role (so a change made by the admin shows on their next refresh)
create function public.my_role() returns text language plpgsql security definer set search_path = ''
as $$
declare
  mail text := lower(auth.jwt() ->> 'email');
  who text := coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''));
begin
  if private.role() is null then return null; end if;
  insert into public.roles (email, role, name, last_seen_at) values (mail, 'member', who, now())
  on conflict (email) do update set name = coalesce(excluded.name, public.roles.name), last_seen_at = now();
  return (select r.role from public.roles r where r.email = mail);
end $$;

-- the admin's list of people
create function public.admin_people() returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.role() is distinct from 'admin' then raise exception 'Only the admin can see this.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name, 'role', r.role, 'added_at', r.added_at, 'last_seen_at', r.last_seen_at)
                     order by case r.role when 'admin' then 0 when 'hod' then 1 else 2 end, coalesce(r.name, r.email))
    from public.roles r
  ), '[]');
end $$;

-- the admin adds someone, or changes their role (admin, hod or member)
create function public.admin_set_role(person text, new_role text) returns void language plpgsql security definer set search_path = ''
as $$
declare
  mail text := lower(btrim(coalesce(person, '')));
begin
  if private.role() is distinct from 'admin' then raise exception 'Only the admin can change roles.'; end if;
  if new_role not in ('admin', 'hod', 'member') then raise exception 'Unknown role.'; end if;
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'That doesn''t look like an email address.'; end if;
  if mail = lower(auth.jwt() ->> 'email') and new_role <> 'admin' then raise exception 'You can''t take away your own admin role.'; end if;
  insert into public.roles (email, role) values (mail, new_role) on conflict (email) do update set role = excluded.role;
end $$;

-- the admin removes someone from the list (if they sign in again, they come back as a member)
create function public.admin_remove(person text) returns void language plpgsql security definer set search_path = ''
as $$
declare
  mail text := lower(btrim(coalesce(person, '')));
begin
  if private.role() is distinct from 'admin' then raise exception 'Only the admin can remove people.'; end if;
  if mail = lower(auth.jwt() ->> 'email') then raise exception 'You can''t remove yourself.'; end if;
  delete from public.roles where email = mail;
end $$;

-- ---------------------------------------------------------------- tables

create table public.batches (
  batch_id text primary key check (batch_id ~ '^B[0-9]{8}-[0-9]{2,}$'),
  teacher text not null check (char_length(teacher) between 1 and 80),
  teacher_email text,
  sent_at timestamptz not null default now()
);

create table public.questions (
  question_id text primary key,
  batch_id text not null references public.batches on delete cascade,
  chapter_id text not null check (chapter_id ~ '^[A-Z]{2,5}(0[1-9]|1[0-2])[A-Z]{3}[0-9]{2}$'),
  topic_id text,
  board text not null check (char_length(board) between 1 and 60),
  class smallint not null check (class between 1 and 12),
  subject text not null check (char_length(subject) between 1 and 80),
  chapter_no smallint not null check (chapter_no between 1 and 99),
  chapter text not null check (char_length(chapter) between 1 and 200),
  topic_no smallint check (topic_no between 1 and 99),
  topic text not null default '' check (char_length(topic) <= 200),
  question_no smallint not null check (question_no between 1 and 999),
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 100),
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text not null default '' check (char_length(note) <= 500),
  reviewed_at timestamptz,
  reviewed_by text,
  -- the IDs always agree with the columns
  constraint ids_match check (
    chapter_id ~ ('^[A-Z]{2,5}' || lpad(class::text, 2, '0') || '[A-Z]{3}' || lpad(chapter_no::text, 2, '0') || '$')
    and topic_id is not distinct from (case when topic_no is null then null else chapter_id || 'T' || lpad(topic_no::text, 2, '0') end)
    and question_id = chapter_id || 'T' || lpad(coalesce(topic_no, 0)::text, 2, '0') || 'Q' || lpad(question_no::text, 3, '0')
  ),
  constraint sent_back_says_why check (status <> 'rejected' or note <> '')
);
-- a question can't wait or be approved twice in one chapter; one that was sent back can be sent again
create unique index questions_once_per_chapter on public.questions (chapter_id, private.norm(question)) where status <> 'rejected';
create index questions_batch on public.questions (batch_id);
create index questions_status on public.questions (status, class, subject, chapter_id);

create table public.question_bank (
  question_id text primary key references public.questions on delete cascade,
  board text not null,
  class smallint not null,
  subject text not null,
  chapter_no smallint not null,
  chapter text not null,
  topic_no smallint,
  topic text not null,
  question_no smallint not null,
  question text not null,
  answer text not null,
  difficulty text,
  chapter_id text not null,
  topic_id text,
  teacher text not null,
  approved_at timestamptz not null
);
create index question_bank_order on public.question_bank (class, subject, chapter_no, topic_no, question_no);

comment on table public.batches is 'One row per "Send for approval" from the question formatter.';
comment on table public.questions is 'Every question ever sent, waiting (pending), approved or sent back (rejected). Written only through the functions.';
comment on table public.question_bank is 'The final question bank: approved questions only, one row per question. Kept in step with questions automatically; read-only.';
comment on column public.question_bank.question_id is 'Chapter ID + topic + question number, e.g. CBSE10SCI01T02Q003 (T00 = no topic)';
comment on column public.question_bank.board is 'Board, e.g. CBSE';
comment on column public.question_bank.class is 'Class, 1 to 12';
comment on column public.question_bank.subject is 'Subject, e.g. Science';
comment on column public.question_bank.chapter_no is 'Chapter number';
comment on column public.question_bank.chapter is 'Chapter name';
comment on column public.question_bank.topic_no is 'Topic number within the chapter (empty when there is no topic)';
comment on column public.question_bank.topic is 'Topic name';
comment on column public.question_bank.question_no is 'Question number within its topic';
comment on column public.question_bank.question is 'The question, exactly as the teacher wrote it';
comment on column public.question_bank.answer is 'The answer, exactly as the teacher wrote it';
comment on column public.question_bank.difficulty is 'easy, medium or hard (empty when not given)';
comment on column public.question_bank.chapter_id is 'Board + class + subject code + chapter, e.g. CBSE10SCI01';
comment on column public.question_bank.topic_id is 'Chapter ID + topic, e.g. CBSE10SCI01T02';
comment on column public.question_bank.teacher is 'Teacher who sent the question';
comment on column public.question_bank.approved_at is 'When the HoD approved it';

-- ---------------------------------------------------------------- question_bank follows questions

create function private.sync_question_bank() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approved' then
    insert into public.question_bank (question_id, board, class, subject, chapter_no, chapter, topic_no, topic, question_no,
                                      question, answer, difficulty, chapter_id, topic_id, teacher, approved_at)
    select new.question_id, new.board, new.class, new.subject, new.chapter_no, new.chapter, new.topic_no, new.topic, new.question_no,
           new.question, new.answer, new.difficulty, new.chapter_id, new.topic_id, b.teacher, coalesce(new.reviewed_at, now())
    from public.batches b where b.batch_id = new.batch_id
    on conflict (question_id) do update set
      board = excluded.board, class = excluded.class, subject = excluded.subject, chapter_no = excluded.chapter_no,
      chapter = excluded.chapter, topic_no = excluded.topic_no, topic = excluded.topic, question_no = excluded.question_no,
      question = excluded.question, answer = excluded.answer, difficulty = excluded.difficulty, chapter_id = excluded.chapter_id,
      topic_id = excluded.topic_id, teacher = excluded.teacher, approved_at = excluded.approved_at;
  else
    delete from public.question_bank where question_id = new.question_id;
  end if;
  return new;
end $$;

create trigger questions_to_bank after insert or update on public.questions
  for each row execute function private.sync_question_bank();

-- ---------------------------------------------------------------- who can see what

alter table public.roles enable row level security;
alter table public.batches enable row level security;
alter table public.questions enable row level security;
alter table public.question_bank enable row level security;
revoke all on public.roles, public.batches, public.questions from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.question_bank from anon, authenticated;
create policy "Signed-in people can read the question bank" on public.question_bank for select to authenticated using (true);

-- ---------------------------------------------------------------- what the website calls

-- The formatter sends the signed-in person's questions as one batch. Each needs a chapter ID (the formatter leaves out
-- the ones without). Questions already waiting or approved in the same chapter are skipped. Returns the batch ID, how many
-- were sent and skipped, and the new rows.
create function public.submit_batch(questions jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  who text := coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''), auth.jwt() ->> 'email');
  mail text := lower(auth.jwt() ->> 'email');
  day text := to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD');
  seq int;
  bid text;
  q jsonb;
  r public.questions;
  cid text;
  tno int;
  qtext text;
  n int;
  seen text[] := '{}';
  sent int := 0;
  already int := 0;
  added jsonb := '[]';
begin
  if auth.uid() is null or mail is null then raise exception 'Please sign in first.'; end if;
  who := left(who, 80);
  if jsonb_typeof(questions) is distinct from 'array' or jsonb_array_length(questions) not between 1 and 500 then
    raise exception 'Send between 1 and 500 questions at a time.';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.submit_batch'));

  select coalesce(max(substring(b.batch_id from 11)::int), 0) + 1 into seq from public.batches b where b.batch_id like 'B' || day || '-%';
  bid := 'B' || day || '-' || lpad(seq::text, greatest(2, char_length(seq::text)), '0');
  insert into public.batches (batch_id, teacher, teacher_email) values (bid, who, mail);

  for q in select * from jsonb_array_elements(questions) loop
    cid := q->>'chapter_id';
    qtext := btrim(q->>'question');
    tno := (q->>'topic_no')::int;
    if cid is null then raise exception 'A question has no chapter ID.'; end if;
    if cid || '|' || private.norm(qtext) = any(seen)
       or exists (select 1 from public.questions x where x.chapter_id = cid and private.norm(x.question) = private.norm(qtext) and x.status <> 'rejected') then
      already := already + 1;
      continue;
    end if;
    seen := seen || (cid || '|' || private.norm(qtext));
    select coalesce(max(x.question_no), 0) + 1 into n from public.questions x where x.chapter_id = cid and x.topic_no is not distinct from tno;
    insert into public.questions (question_id, batch_id, chapter_id, topic_id, board, class, subject, chapter_no, chapter,
                                  topic_no, topic, question_no, question, answer, difficulty)
    values (cid || 'T' || lpad(coalesce(tno, 0)::text, 2, '0') || 'Q' || lpad(n::text, 3, '0'), bid, cid, q->>'topic_id',
            q->>'board', (q->>'class')::int, q->>'subject', (q->>'chapter_no')::int, q->>'chapter', tno, coalesce(q->>'topic', ''),
            n, qtext, btrim(q->>'answer'), q->>'difficulty')
    returning * into r;
    added := added || jsonb_build_array(to_jsonb(r) || jsonb_build_object('teacher', who, 'sent_at', now()));
    sent := sent + 1;
  end loop;

  if sent = 0 then
    delete from public.batches b where b.batch_id = bid;
    bid := null;
  end if;
  return jsonb_build_object('batch_id', bid, 'sent', sent, 'already', already, 'questions', added);
end $$;

-- The number waiting, next to the HoD desk link. HoDs and the admin only.
create function public.waiting_count() returns int language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_hod() then raise exception 'Only HoDs can see the HoD desk.'; end if;
  return (select count(*)::int from public.questions where status = 'pending');
end $$;

-- The HoD desk: every question, with who sent it and when. HoDs and the admin only.
create function public.hod_questions() returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_hod() then raise exception 'Only HoDs can see the HoD desk.'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('teacher', b.teacher, 'sent_at', b.sent_at) order by b.sent_at, q.question_id), '[]')
    from public.questions q join public.batches b on b.batch_id = q.batch_id
  );
end $$;

-- The HoD approves (approved), sends back with a reason (rejected) or moves back to waiting (pending).
create function public.hod_set_status(ids text[], new_status text, reason text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  why text := btrim(coalesce(reason, ''));
  done jsonb;
begin
  if not private.is_hod() then raise exception 'Only HoDs can approve or send back questions.'; end if;
  if new_status not in ('pending', 'approved', 'rejected') then raise exception 'Unknown status.'; end if;
  if new_status = 'rejected' and why = '' then raise exception 'Say why the question is going back.'; end if;
  with changed as (
    update public.questions q
    set status = new_status,
        note = case when new_status = 'rejected' then why else '' end,
        reviewed_at = case when new_status = 'pending' then null else now() end,
        reviewed_by = case when new_status = 'pending' then null else lower(auth.jwt() ->> 'email') end
    where q.question_id = any(ids)
    returning q.question_id, q.status, q.note, q.reviewed_at
  )
  select coalesce(jsonb_agg(to_jsonb(changed)), '[]') into done from changed;
  return done;
end $$;

revoke execute on function public.submit_batch(text, jsonb), public.waiting_count(), public.hod_questions(),
  public.hod_set_status(text[], text, text) from public;
-- everything needs a sign-in; the HoD desk also needs an HoD or admin, people and roles need the admin (checked inside)
revoke execute on function public.waiting_count(), public.hod_questions(), public.my_role(), public.submit_batch(jsonb),
  public.hod_set_status(text[], text, text), public.admin_people(), public.admin_set_role(text, text), public.admin_remove(text) from public, anon;
grant execute on function public.waiting_count(), public.hod_questions(), public.my_role(), public.submit_batch(jsonb),
  public.hod_set_status(text[], text, text), public.admin_people(), public.admin_set_role(text, text), public.admin_remove(text) to authenticated;
