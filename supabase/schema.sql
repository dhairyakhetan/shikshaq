-- Game Maker: saving question sets online.
--
-- Run this once: Supabase dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
--
-- How it is protected: the browser only ever holds the public (publishable / anon) key, which anyone can read in
-- the page source. So the table itself is locked: row level security is on, there are no policies and no grants,
-- which means that key can NOT list, read, edit or delete rows. The site can only call the two functions below:
--   create_question_set(title, raw)  -> saves a set, returns its random id
--   get_question_set(id)             -> returns that one set (you need its unguessable id; there is no way to list sets)
-- Anyone who has a set's link can open it, so do not save anything private.

create table if not exists public.question_sets (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  raw        text not null check (char_length(raw) between 1 and 200000),
  created_at timestamptz not null default now()
);

alter table public.question_sets enable row level security;
revoke all on table public.question_sets from anon, authenticated;
-- No policies on purpose: with row level security on and no policy, nothing is allowed.

create or replace function public.create_question_set(p_title text, p_raw text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  clean_title text := left(btrim(coalesce(p_title, ''), E' \t\r\n'), 120);
begin
  if p_raw is null or btrim(p_raw, E' \t\r\n') = '' then
    raise exception 'There are no questions to save.' using errcode = '22023';
  end if;
  if char_length(p_raw) > 200000 then
    raise exception 'There are too many questions to save (the limit is 200000 characters).' using errcode = '22023';
  end if;
  if clean_title = '' then
    clean_title := 'Untitled';
  end if;
  insert into public.question_sets (title, raw) values (clean_title, p_raw) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.get_question_set(p_id uuid)
returns table (id uuid, title text, raw text, created_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select s.id, s.title, s.raw, s.created_at from public.question_sets s where s.id = p_id;
$$;

-- Functions are callable by everyone by default; allow exactly these two for the site's key.
revoke all on function public.create_question_set(text, text) from public;
revoke all on function public.get_question_set(uuid) from public;
grant execute on function public.create_question_set(text, text) to anon, authenticated;
grant execute on function public.get_question_set(uuid) to anon, authenticated;

-- Optional housekeeping: delete sets older than 180 days every night.
-- Enable the pg_cron extension first (Database > Extensions), then run:
-- select cron.schedule('delete-old-question-sets', '0 3 * * *',
--   $$ delete from public.question_sets where created_at < now() - interval '180 days' $$);
