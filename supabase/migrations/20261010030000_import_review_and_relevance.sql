alter table public.content_sources
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists storage_path text,
  add column if not exists exam_key text,
  add column if not exists content_hash text;

alter table public.questions
  add column if not exists question_fingerprint text,
  add column if not exists appearance_count integer not null default 1,
  add column if not exists relevance_score numeric(8,3) not null default 1,
  add column if not exists rubric jsonb,
  add column if not exists last_seen_at timestamptz;

alter table public.questions drop constraint if exists questions_question_type_check;
alter table public.questions add constraint questions_question_type_check check (question_type in ('multiple_choice', 'fill_blank', 'free_response', 'essay'));

create table if not exists public.question_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  source_id uuid not null references public.content_sources(id) on delete cascade,
  sequence_order integer,
  year integer,
  points integer,
  source_label text,
  created_at timestamptz not null default now()
);

create index if not exists questions_fingerprint_idx on public.questions (user_id, subject_id, question_fingerprint);
create index if not exists question_occurrences_source_order_idx on public.question_occurrences (source_id, sequence_order);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  source_id uuid not null references public.content_sources(id) on delete cascade,
  exam_key text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'review', 'approved', 'failed')),
  total_chunks integer not null default 0,
  completed_chunks integer not null default 0,
  draft jsonb not null default '{"title":"","sections":[],"questions":[]}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.import_chunks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  chunk_index integer not null,
  content text not null default '',
  mime_type text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  created_at timestamptz not null default now(),
  unique (job_id, chunk_index)
);

create table if not exists public.grading_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  exam_key text,
  name text not null,
  criteria jsonb not null default '[]'::jsonb,
  instructions text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.essay_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  quiz_id uuid references public.quiz_sessions(id) on delete set null,
  grading_policy_id uuid references public.grading_policies(id) on delete set null,
  response text not null,
  status text not null default 'submitted' check (status in ('submitted', 'grading', 'graded', 'failed')),
  grade numeric(6,2),
  feedback jsonb,
  created_at timestamptz not null default now(),
  graded_at timestamptz
);

alter table public.question_occurrences enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_chunks enable row level security;
alter table public.grading_policies enable row level security;
alter table public.essay_submissions enable row level security;

create policy "Users can manage their own question occurrences" on public.question_occurrences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own import jobs" on public.import_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage chunks in their own import jobs" on public.import_chunks for all using (exists (select 1 from public.import_jobs where import_jobs.id = import_chunks.job_id and import_jobs.user_id = auth.uid())) with check (exists (select 1 from public.import_jobs where import_jobs.id = import_chunks.job_id and import_jobs.user_id = auth.uid()));
create policy "Users can manage their own grading policies" on public.grading_policies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own essay submissions" on public.essay_submissions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('study-materials', 'study-materials', false)
on conflict (id) do nothing;

create policy "Users can upload their own study materials" on storage.objects for insert with check (bucket_id = 'study-materials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can read their own study materials" on storage.objects for select using (bucket_id = 'study-materials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete their own study materials" on storage.objects for delete using (bucket_id = 'study-materials' and (storage.foldername(name))[1] = auth.uid()::text);
