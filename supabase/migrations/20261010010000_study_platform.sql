-- StudyPal's real learning model. No demo rows are inserted.

alter table public.profiles
  add column if not exists grade_level text,
  add column if not exists exam_name text,
  add column if not exists exam_date date,
  add column if not exists onboarding_complete boolean not null default false;

create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  source_type text not null check (source_type in ('syllabus', 'past_paper', 'textbook')),
  title text not null check (char_length(title) between 1 and 180),
  raw_text text not null,
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  description text,
  position integer not null default 0 check (position >= 0),
  topics text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  section_id uuid references public.curriculum_sections(id) on delete set null,
  source_id uuid references public.content_sources(id) on delete set null,
  question_type text not null check (question_type in ('multiple_choice', 'fill_blank', 'free_response')),
  prompt text not null,
  choices jsonb not null default '[]'::jsonb,
  answer jsonb not null,
  explanation text,
  points integer not null default 1 check (points > 0),
  year integer,
  topic text,
  difficulty text check (difficulty in ('introductory', 'standard', 'challenging')),
  sequence_order integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  section_id uuid references public.curriculum_sections(id) on delete set null,
  source_id uuid references public.content_sources(id) on delete set null,
  quiz_type text not null check (quiz_type in ('topic', 'section', 'full_paper')),
  title text not null,
  question_ids jsonb not null default '[]'::jsonb,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  score numeric(5,2),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quiz_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  response jsonb,
  is_correct boolean not null default false,
  points_earned numeric(7,2) not null default 0,
  answered_at timestamptz not null default now(),
  unique (quiz_id, question_id)
);

create table if not exists public.timetable_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 180),
  event_type text not null default 'study' check (event_type in ('study', 'review', 'exam', 'break')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists content_sources_subject_idx on public.content_sources (subject_id, created_at desc);
create index if not exists curriculum_sections_subject_idx on public.curriculum_sections (subject_id, position);
create index if not exists questions_subject_section_idx on public.questions (subject_id, section_id, sequence_order);
create index if not exists questions_source_order_idx on public.questions (source_id, sequence_order);
create index if not exists quiz_sessions_user_idx on public.quiz_sessions (user_id, started_at desc);
create index if not exists timetable_events_user_idx on public.timetable_events (user_id, starts_at);

alter table public.content_sources enable row level security;
alter table public.curriculum_sections enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.timetable_events enable row level security;

create policy "Users can manage their own content sources" on public.content_sources for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own curriculum sections" on public.curriculum_sections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own questions" on public.questions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own quiz sessions" on public.quiz_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own quiz answers" on public.quiz_answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own timetable" on public.timetable_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
