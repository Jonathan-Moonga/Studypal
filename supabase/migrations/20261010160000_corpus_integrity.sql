-- Idempotent guards for trusted bulk corpus imports.

create unique index if not exists content_sources_corpus_key_unique
  on public.content_sources (user_id, ((metadata ->> 'corpus_key')))
  where metadata ? 'corpus_key';

create unique index if not exists import_jobs_source_unique
  on public.import_jobs (source_id);

create unique index if not exists question_occurrences_source_sequence_unique
  on public.question_occurrences (question_id, source_id, sequence_order)
  nulls not distinct;

create table if not exists public.corpus_import_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.content_sources(id) on delete cascade,
  corpus_key text not null,
  stage text not null check (stage in ('discovered', 'downloaded', 'registered', 'processed', 'approved', 'skipped', 'failed')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists corpus_import_events_lookup_idx
  on public.corpus_import_events (user_id, corpus_key, created_at desc);

alter table public.corpus_import_events enable row level security;

create policy "Users can view their own corpus import events"
  on public.corpus_import_events for select
  using (auth.uid() = user_id);
