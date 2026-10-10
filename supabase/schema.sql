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
-- email without proving it).
--   anyone    reads question_bank (approved questions only), even without signing in; nothing else
--   member    anyone signed in (saved in public.roles the first time they open the site):
--             submit_batch(questions) sends a batch as themselves; my_sent_back() and mark_sent_back_seen() are their
--             notifications: their own questions that were sent back, and why
--   hod       also the HoD desk: hod_questions() (waiting and sent back), hod_approved() (approved, newest first, a page
--             at a time), waiting_count(), and hod_set_status(ids, new_status, reason) to approve, send back, or move
--             back to waiting
--   admin     the same as an HoD in the database, plus admin_people(), admin_set_role(email, role), admin_remove(email);
--             the site also shows the admin Revise. The owner (roles.owner, set by hand) can't be removed or demoted.
-- my_role() saves a new person as a member and tells the site their role, every time the site opens.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- how two questions are compared: case, extra spaces and punctuation at the end don't matter
create function private.norm(t text) returns text language sql immutable set search_path = ''
as $$ select lower(regexp_replace(regexp_replace(btrim(t), '[[:space:]?.!:;,।]+$', ''), '\s+', ' ', 'g')) $$;

-- everyone who has signed in, and anyone the admin added, with their role
create table public.roles (
  email text primary key check (email = lower(email)),
  role text not null constraint roles_role_check check (role in ('admin', 'hod', 'member')),
  name text,
  added_at timestamptz not null default now(),
  last_seen_at timestamptz,
  -- the person who runs the site: an admin nobody can remove or demote. Set once, by hand:
  --   update public.roles set owner = true where email = '<your email>';
  owner boolean not null default false check (not owner or role = 'admin')
);
create unique index roles_one_owner on public.roles (owner) where owner;

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
-- and returns their role (so a change made by the admin shows on their next refresh). A refresh within 10 minutes
-- with the same name writes nothing.
create function public.my_role() returns text language plpgsql security definer set search_path = ''
as $$
declare
  mail text := lower(auth.jwt() ->> 'email');
  who text := coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''));
  mine text := private.role();
begin
  if mine is null then return null; end if;
  insert into public.roles as r (email, role, name, last_seen_at) values (mail, 'member', who, now())
  on conflict (email) do update set name = coalesce(excluded.name, r.name), last_seen_at = now()
  where r.last_seen_at is null or r.last_seen_at < now() - interval '10 minutes' or r.name is distinct from coalesce(excluded.name, r.name);
  return mine; -- the role before saving is the role after: a new person is a member either way
end $$;

-- the admin's list of people: the owner, then admins, HoDs and members
create function public.admin_people() returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.role() is distinct from 'admin' then raise exception 'Only the admin can see this.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name, 'role', r.role, 'owner', r.owner, 'added_at', r.added_at, 'last_seen_at', r.last_seen_at)
                     order by r.owner desc, case r.role when 'admin' then 0 when 'hod' then 1 else 2 end, coalesce(r.name, r.email))
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
  if new_role <> 'admin' and exists (select 1 from public.roles r where r.email = mail and r.owner) then
    raise exception 'The owner stays an admin.';
  end if;
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
  if exists (select 1 from public.roles r where r.email = mail and r.owner) then raise exception 'The owner can''t be removed.'; end if;
  delete from public.roles where email = mail;
end $$;

-- ---------------------------------------------------------------- tables

create table public.batches (
  batch_id text primary key check (batch_id ~ '^B[0-9]{8}-[0-9]{2,}$'),
  teacher text not null check (char_length(teacher) between 1 and 80),
  teacher_email text,
  sent_at timestamptz not null default now()
);
create index batches_teacher on public.batches (teacher_email); -- a teacher's notifications

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
  seen_at timestamptz,  -- when the teacher saw that it was sent back (their notifications); empty until then
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
create index questions_batch on public.questions (batch_id, status); -- a batch's questions, and a teacher's sent-back ones
create index questions_status on public.questions (status, class, subject, chapter_id);
-- the next question number in a topic (T00, no topic, is 0), sent-back copies of a question, and the approved
-- questions newest first, each found without reading the whole table
create index questions_numbering on public.questions (chapter_id, (coalesce(topic_no, 0)), question_no);
create index questions_sent_back on public.questions (chapter_id, private.norm(question)) where status = 'rejected';
create index questions_approved on public.questions (reviewed_at, question_id) where status = 'approved';

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
-- the order Revise and the download read it in; the question ID makes it exact, so no page repeats or skips a row
create index question_bank_order on public.question_bank (class, subject, chapter_no, topic_no, question_no, question_id);

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

create trigger questions_to_bank after insert or update of status on public.questions
  for each row execute function private.sync_question_bank();

-- ---------------------------------------------------------------- who can see what

alter table public.roles enable row level security;
alter table public.batches enable row level security;
alter table public.questions enable row level security;
alter table public.question_bank enable row level security;
revoke all on public.roles, public.batches, public.questions from anon, authenticated;
revoke all on public.question_bank from anon, authenticated;
grant select on public.question_bank to anon, authenticated;
create policy "Anyone can read the question bank" on public.question_bank for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- what the website calls

-- The boards and subjects the site knows (src/details.ts; tests/formatter.test.ts checks that these lists agree with
-- it). A question can only be sent with a board and a subject from these lists, and its chapter ID must use their codes,
-- so a question can't be filed under another board's or subject's chapters.
create table private.boards (name text primary key, code text not null unique check (code ~ '^[A-Z]{2,5}$'));
create table private.subjects (name text primary key, code text not null unique check (code ~ '^[A-Z]{3}$'));
-- only the database's own functions read them (the private schema is closed to the site anyway)
alter table private.boards enable row level security;
alter table private.subjects enable row level security;
insert into private.boards (name, code) values
  ('CBSE', 'CBSE'), ('ICSE', 'ICSE'), ('ISC', 'ISC'), ('NIOS', 'NIOS'), ('IB', 'IB'), ('IGCSE', 'IGCSE'),
  ('Cambridge', 'CAIE'), ('Edexcel', 'EDEX'), ('Aligarh Muslim University Board', 'AMU'),
  ('Jamia Millia Islamia', 'JMI'), ('Banasthali Vidyapith', 'BANV'), ('Dayalbagh Educational Institute', 'DEI'),
  ('Maharishi Patanjali Sanskrit Sansthan', 'MPSS'), ('Andhra Pradesh State Board', 'AP'),
  ('Assam State Board', 'AS'), ('Bihar State Board', 'BR'), ('Chhattisgarh State Board', 'CG'),
  ('Delhi State Board', 'DL'), ('Goa State Board', 'GA'), ('Gujarat State Board', 'GJ'),
  ('Haryana State Board', 'HR'), ('Himachal Pradesh State Board', 'HP'), ('Jammu and Kashmir State Board', 'JK'),
  ('Jharkhand State Board', 'JH'), ('Karnataka State Board', 'KA'), ('Kerala State Board', 'KL'),
  ('Madhya Pradesh State Board', 'MP'), ('Maharashtra State Board', 'MH'), ('Manipur State Board', 'MN'),
  ('Meghalaya State Board', 'ML'), ('Mizoram State Board', 'MZ'), ('Nagaland State Board', 'NL'),
  ('Odisha State Board', 'OD'), ('Punjab State Board', 'PB'), ('Rajasthan State Board', 'RJ'),
  ('Tamil Nadu State Board', 'TN'), ('Telangana State Board', 'TS'), ('Tripura State Board', 'TR'),
  ('Uttar Pradesh State Board', 'UP'), ('Uttarakhand State Board', 'UK'), ('West Bengal State Board', 'WB'),
  ('Andhra Pradesh Open School Society', 'APOSS'), ('Bihar Board of Open Schooling and Examination', 'BBOSE'),
  ('Chhattisgarh State Open School', 'CGSOS'), ('Madhya Pradesh State Open School', 'MPSOS'),
  ('Rajasthan State Open School', 'RSOS'), ('Telangana Open School Society', 'TOSS'),
  ('Bihar State Madrasa Education Board', 'BSMEB'), ('Chhattisgarh Madrasa Board', 'CGMB'),
  ('Uttar Pradesh Board of Madrasa Education', 'UPBME'), ('Uttarakhand Madrasa Education Board', 'UKMEB'),
  ('West Bengal Board of Madrasah Education', 'WBBME'), ('Bihar Sanskrit Shiksha Board', 'BSSB'),
  ('Chhattisgarh Sanskrit Board', 'CGSB'), ('Uttar Pradesh Madhyamik Sanskrit Shiksha Parishad', 'UPSSP'),
  ('Uttarakhand Sanskrit Shiksha Parishad', 'USSP')
on conflict (name) do update set code = excluded.code;
insert into private.subjects (name, code) values
  ('Physics', 'PHY'), ('Chemistry', 'CHE'), ('Biology', 'BIO'), ('Mathematics', 'MAT'),
  ('Applied Mathematics', 'AMA'), ('Additional Mathematics', 'ADM'), ('Further Mathematics', 'FMA'),
  ('Statistics', 'STA'), ('Science', 'SCI'), ('Environmental Studies', 'EVS'), ('Environmental Science', 'ENV'),
  ('Environmental Management', 'EMG'), ('Biotechnology', 'BTE'), ('Computer Science', 'CSC'),
  ('Computer Applications', 'CAP'), ('Informatics Practices', 'INP'), ('Information Technology', 'ITE'),
  ('Artificial Intelligence', 'AIN'), ('Data Science', 'DSC'), ('Robotics', 'ROB'), ('Web Applications', 'WEB'),
  ('Data Entry Operations', 'DEO'), ('Engineering Graphics', 'EGR'), ('Engineering Science', 'ESC'),
  ('Electricity and Electronics', 'EEL'), ('Technical Drawing', 'TDR'),
  ('Geometrical and Mechanical Drawing', 'GMD'), ('Geometrical and Building Drawing', 'GBD'),
  ('Design and Technology', 'DTE'), ('Social Science', 'SST'), ('History', 'HIS'), ('Geography', 'GEO'),
  ('Civics', 'CIV'), ('History and Civics', 'HCV'), ('Political Science', 'POL'), ('Economics', 'ECO'),
  ('Sociology', 'SOC'), ('Psychology', 'PSY'), ('Philosophy', 'PHI'), ('Anthropology', 'ANT'),
  ('Religious Studies', 'REL'), ('Global Perspectives', 'GLP'), ('Theory of Knowledge', 'TOK'),
  ('Legal Studies', 'LGS'), ('Knowledge Traditions and Practices of India', 'KTP'),
  ('Indian Culture and Heritage', 'ICH'), ('General Knowledge', 'GKN'), ('Moral Science', 'MSC'),
  ('Accountancy', 'ACC'), ('Business Studies', 'BST'), ('Commerce', 'CMR'), ('Commercial Studies', 'COM'),
  ('Commercial Applications', 'CMA'), ('Economic Applications', 'ECA'), ('Entrepreneurship', 'ENT'),
  ('Business Administration', 'BAD'), ('Taxation', 'TAX'), ('Cost Accounting', 'CAC'), ('Financial Markets', 'FIN'),
  ('Banking', 'BNK'), ('Insurance', 'INS'), ('Marketing', 'MKT'), ('Salesmanship', 'SLS'),
  ('Office Procedures and Practices', 'OPP'), ('Shorthand', 'SHO'), ('Retail', 'RET'), ('Tourism', 'TOU'),
  ('Hospitality Management', 'HOS'), ('Front Office Operations', 'FOO'), ('Food Production', 'FPR'),
  ('Food Nutrition and Dietetics', 'FND'), ('Cookery', 'COO'), ('Home Science', 'HSC'),
  ('Beauty and Wellness', 'BWL'), ('Health Care', 'HCA'), ('Medical Diagnostics', 'MDG'),
  ('Early Childhood Care and Education', 'ECC'), ('Agriculture', 'AGR'), ('Horticulture', 'HOR'), ('Apparel', 'APP'),
  ('Textile Design', 'TXD'), ('Fashion Studies', 'FAS'), ('Design', 'DES'),
  ('Design Thinking and Innovation', 'DTI'), ('Multimedia', 'MMD'), ('Mass Media Studies', 'MMS'),
  ('Library and Information Science', 'LIS'), ('Typography and Computer Application', 'TCA'),
  ('Geospatial Technology', 'GST'), ('Electrical Technology', 'ETE'), ('Electronic Technology', 'ETN'),
  ('Electronics and Hardware', 'ELH'), ('Automotive', 'AUT'), ('Air Conditioning and Refrigeration', 'ACR'),
  ('Security', 'SEC'), ('Physical Activity Trainer', 'PAT'), ('Foundation Skills for Sciences', 'FSS'),
  ('Multi Skill Foundation Course', 'MSF'), ('Vocational Education', 'VOC'), ('Art', 'ART'), ('Painting', 'PNT'),
  ('Graphics', 'GRA'), ('Sculpture', 'SCU'), ('Applied Art', 'AAR'), ('Music', 'MUS'), ('Hindustani Music', 'HMU'),
  ('Carnatic Music', 'CMU'), ('Dance', 'DAN'), ('Drama', 'DRA'), ('Performing Arts', 'PFA'), ('Film', 'FLM'),
  ('Physical Education', 'PED'), ('Yoga', 'YOG'), ('National Cadet Corps', 'NCC'), ('English', 'ENG'),
  ('English Language', 'ENL'), ('English Literature', 'ELT'), ('Elective English', 'ELE'), ('Hindi', 'HIN'),
  ('Hindi Elective', 'HIE'), ('Sanskrit', 'SAN'), ('Urdu', 'URD'), ('Punjabi', 'PUN'), ('Bengali', 'BEN'),
  ('Tamil', 'TAM'), ('Telugu', 'TEL'), ('Kannada', 'KAN'), ('Malayalam', 'MAL'), ('Marathi', 'MAR'),
  ('Gujarati', 'GUJ'), ('Odia', 'ORI'), ('Assamese', 'ASM'), ('Manipuri', 'MNI'), ('Sindhi', 'SND'),
  ('Kashmiri', 'KAS'), ('Konkani', 'KOK'), ('Nepali', 'NEP'), ('Bodo', 'BOD'), ('Dogri', 'DOI'), ('Maithili', 'MAI'),
  ('Santali', 'SAT'), ('Mizo', 'MIZ'), ('Khasi', 'KHA'), ('Garo', 'GAR'), ('Kokborok', 'KBK'), ('Tangkhul', 'TNG'),
  ('Lepcha', 'LEP'), ('Limboo', 'LIM'), ('Bhutia', 'BHU'), ('Tibetan', 'TIB'), ('Rai', 'RAI'), ('Gurung', 'GRG'),
  ('Tamang', 'TMG'), ('Sherpa', 'SHP'), ('Thai', 'THA'), ('Arabic', 'ARA'), ('Persian', 'PER'), ('French', 'FRE'),
  ('German', 'GER'), ('Spanish', 'SPA'), ('Russian', 'RUS'), ('Japanese', 'JPN'), ('Chinese', 'CHI'),
  ('Korean', 'KOR'), ('Italian', 'ITA'), ('Portuguese', 'POR'), ('Latin', 'LAT'), ('Dzongkha', 'DZO')
on conflict (name) do update set code = excluded.code;

-- What is wrong with a question's board, subject and chapter ID, in words; null when nothing is.
create function private.codes_problem(board text, subject text, chapter_id text) returns text language sql stable set search_path = ''
as $$
  select case
    when not exists (select 1 from private.boards b where lower(b.name) = lower(board))
      then format('The board "%s" isn''t on the site''s list.', board)
    when not exists (select 1 from private.subjects s where lower(s.name) = lower(subject))
      then format('The subject "%s" isn''t on the site''s list.', subject)
    when m is null
      or (select b.code from private.boards b where lower(b.name) = lower(board)) is distinct from m[1]
      or (select s.code from private.subjects s where lower(s.name) = lower(subject)) is distinct from m[2]
      then format('The chapter ID %s doesn''t match the board "%s" and subject "%s".', chapter_id, board, subject)
  end
  from (select regexp_match(chapter_id, '^([A-Z]{2,5})[0-9]{2}([A-Z]{3})[0-9]{2}$') m) id
$$;

-- The formatter sends the signed-in person's questions as one batch. Each needs a chapter ID (the formatter leaves out
-- the ones without). Questions already waiting or approved in the same chapter are skipped. So is a question that was
-- sent back to this same person and hasn't changed (same question and answer): it would only be sent back again, so the
-- site points them to the reason instead. Sent back to someone else, it goes in as new. Returns the batch ID, how many
-- were sent and skipped, the IDs of the sent-back ones, and the IDs of the new questions.
create function public.submit_batch(questions jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  -- the name on their Google account; never their email, which would show in the public question bank
  who text := coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''), 'A teacher');
  mail text := lower(auth.jwt() ->> 'email');
  day text := to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD');
  seq int;
  bid text;
  q jsonb;
  qid text;
  cid text;
  tno int;
  qtext text;
  nq text;
  why text;
  n int;
  back text[];
  seen text[] := '{}';
  sent int := 0;
  already int := 0;
  sent_back int := 0;
  back_ids text[] := '{}';
  added text[] := '{}';
begin
  if private.role() is null or mail is null then raise exception 'Please sign in first.'; end if;
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
    nq := private.norm(qtext);
    if cid is null then raise exception 'A question has no chapter ID.'; end if;
    why := private.codes_problem(q->>'board', q->>'subject', cid);
    if why is not null then raise exception '%', why; end if;
    if cid || '|' || nq = any(seen)
       or exists (select 1 from public.questions x where x.chapter_id = cid and private.norm(x.question) = nq and x.status <> 'rejected') then
      already := already + 1;
      continue;
    end if;
    seen := seen || (cid || '|' || nq);
    select array_agg(x.question_id) into back from public.questions x join public.batches b on b.batch_id = x.batch_id
    where x.chapter_id = cid and x.status = 'rejected' and private.norm(x.question) = nq
      and private.norm(x.answer) = private.norm(q->>'answer') and b.teacher_email = mail;
    if back is not null then
      sent_back := sent_back + 1;
      back_ids := back_ids || back;
      continue;
    end if;
    select coalesce(max(x.question_no), 0) + 1 into n from public.questions x where x.chapter_id = cid and coalesce(x.topic_no, 0) = coalesce(tno, 0);
    insert into public.questions (question_id, batch_id, chapter_id, topic_id, board, class, subject, chapter_no, chapter,
                                  topic_no, topic, question_no, question, answer, difficulty)
    values (cid || 'T' || lpad(coalesce(tno, 0)::text, 2, '0') || 'Q' || lpad(n::text, 3, '0'), bid, cid,
            case when tno is null then null else cid || 'T' || lpad(tno::text, 2, '0') end,
            q->>'board', (q->>'class')::int, q->>'subject', (q->>'chapter_no')::int, q->>'chapter', tno, coalesce(q->>'topic', ''),
            n, qtext, btrim(q->>'answer'), q->>'difficulty')
    returning question_id into qid;
    added := added || qid;
    sent := sent + 1;
  end loop;

  if sent = 0 then
    delete from public.batches b where b.batch_id = bid;
    bid := null;
  end if;
  return jsonb_build_object('batch_id', bid, 'sent', sent, 'already', already, 'sent_back', sent_back, 'sent_back_ids', to_jsonb(back_ids), 'question_ids', to_jsonb(added));
end $$;

-- The number waiting, next to the HoD desk link. HoDs and the admin only.
create function public.waiting_count() returns int language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_hod() then raise exception 'Only HoDs can see the HoD desk.'; end if;
  return (select count(*)::int from public.questions where status = 'pending');
end $$;

-- The HoD desk: every question waiting or sent back, with who sent it and when. HoDs and the admin only.
create function public.hod_questions() returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_hod() then raise exception 'Only HoDs can see the HoD desk.'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('teacher', b.teacher, 'teacher_email', b.teacher_email, 'sent_at', b.sent_at)
                              order by b.sent_at, q.question_id), '[]')
    from public.questions q join public.batches b on b.batch_id = q.batch_id
    where q.status in ('pending', 'rejected')
  );
end $$;

-- The HoD desk's approved questions, newest first, a page at a time: the page after (before_at, before_id), the
-- approval time and ID of the last one already shown (none for the first page). Each page reads only its own rows from
-- questions_approved. HoDs and the admin only.
create function public.hod_approved(before_at timestamptz default null, before_id text default null, take int default 200) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_hod() then raise exception 'Only HoDs can see the HoD desk.'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('teacher', b.teacher, 'teacher_email', b.teacher_email, 'sent_at', b.sent_at)
                              order by q.reviewed_at desc, q.question_id desc), '[]')
    from (
      select * from public.questions x
      where x.status = 'approved' and (x.reviewed_at, x.question_id) < (coalesce(before_at, 'infinity'), coalesce(before_id, ''))
      order by x.reviewed_at desc, x.question_id desc
      limit least(greatest(take, 1), 1000)
    ) q join public.batches b on b.batch_id = q.batch_id
  );
end $$;

-- The HoD approves (approved), sends back with a reason (rejected) or moves back to waiting (pending). Returns what
-- changed, what was skipped, and how many questions are now waiting and approved (for the page's counts).
create function public.hod_set_status(ids text[], new_status text, reason text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  why text := btrim(coalesce(reason, ''));
  skipped text[] := '{}';
  done jsonb;
begin
  if not private.is_hod() then raise exception 'Only HoDs can approve or send back questions.'; end if;
  if new_status not in ('pending', 'approved', 'rejected') then raise exception 'Unknown status.'; end if;
  if new_status = 'rejected' and why = '' then raise exception 'Say why the question is going back.'; end if;
  -- a sent-back question stays sent back while the same question (sent again) is waiting or approved
  if new_status <> 'rejected' then
    select coalesce(array_agg(t.question_id), '{}') into skipped
    from public.questions t
    where t.question_id = any(ids) and t.status = 'rejected' and (
      exists (select 1 from public.questions x
              where x.chapter_id = t.chapter_id and private.norm(x.question) = private.norm(t.question) and x.status <> 'rejected')
      or exists (select 1 from public.questions u
                 where u.question_id = any(ids) and u.status = 'rejected' and u.question_id < t.question_id
                   and u.chapter_id = t.chapter_id and private.norm(u.question) = private.norm(t.question)));
  end if;
  with changed as (
    update public.questions q
    set status = new_status,
        note = case when new_status = 'rejected' then why else '' end,
        reviewed_at = case when new_status = 'pending' then null else now() end,
        reviewed_by = case when new_status = 'pending' then null else lower(auth.jwt() ->> 'email') end,
        seen_at = null
    where q.question_id = any(ids) and q.question_id <> all(skipped)
      -- nothing to do when it already has this status (and this reason): its time and "seen" stay as they are
      and (q.status is distinct from new_status or (new_status = 'rejected' and q.note is distinct from why))
    returning q.question_id
  )
  select coalesce(jsonb_agg(changed.question_id), '[]') into done from changed;
  return jsonb_build_object('changed', done, 'skipped', to_jsonb(skipped),
    'waiting', (select count(*) from public.questions where status = 'pending'),
    'approved', (select count(*) from public.question_bank));
end $$;

-- Notifications: the signed-in person's questions that were sent back, newest first, with the reason, who sent them
-- back, whether they have seen it, and whether the same question has since been sent again (waiting or approved).
create function public.my_sent_back() returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.role() is null then raise exception 'Please sign in first.'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(q) - 'reviewed_by' - 'seen_at' || jsonb_build_object(
        'sent_at', b.sent_at,
        'reviewer', coalesce(r.name, 'Your HoD'),
        'seen', q.seen_at is not null,
        'now', (select x.status from public.questions x
                where x.chapter_id = q.chapter_id and private.norm(x.question) = private.norm(q.question) and x.status <> 'rejected'
                order by x.status = 'approved' desc limit 1))
      order by q.reviewed_at desc, q.question_id), '[]')
    from public.questions q
    join public.batches b on b.batch_id = q.batch_id
    left join public.roles r on r.email = q.reviewed_by
    where q.status = 'rejected' and b.teacher_email = lower(auth.jwt() ->> 'email')
  );
end $$;

-- The person has seen these notifications (the ones the bell showed them; all of them when no list is given), so one
-- sent back while the bell was open still shows as new.
create function public.mark_sent_back_seen(ids text[] default null) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if private.role() is null then raise exception 'Please sign in first.'; end if;
  update public.questions q set seen_at = now()
  from public.batches b
  where b.batch_id = q.batch_id and b.teacher_email = lower(auth.jwt() ->> 'email') and q.status = 'rejected' and q.seen_at is null
    and (ids is null or q.question_id = any(ids));
end $$;

-- everything needs a sign-in; the HoD desk also needs an HoD or admin, people and roles need the admin (checked inside)
revoke execute on function public.waiting_count(), public.hod_questions(), public.hod_approved(timestamptz, text, int), public.my_role(),
  public.submit_batch(jsonb), public.hod_set_status(text[], text, text), public.my_sent_back(), public.mark_sent_back_seen(text[]),
  public.admin_people(), public.admin_set_role(text, text), public.admin_remove(text) from public, anon;
grant execute on function public.waiting_count(), public.hod_questions(), public.hod_approved(timestamptz, text, int), public.my_role(),
  public.submit_batch(jsonb), public.hod_set_status(text[], text, text), public.my_sent_back(), public.mark_sent_back_seen(text[]),
  public.admin_people(), public.admin_set_role(text, text), public.admin_remove(text) to authenticated;
