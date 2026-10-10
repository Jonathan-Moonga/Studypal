-- Reliable multi-material imports, subject exam dates, and editable calendar plans.

alter table public.subjects
  add column if not exists exam_date date,
  add column if not exists exam_time time,
  add column if not exists exam_paper text;

alter table public.content_sources
  add column if not exists batch_id uuid,
  add column if not exists processing_mode text not null default 'text'
    check (processing_mode in ('text', 'document'));

alter table public.import_jobs
  add column if not exists batch_id uuid,
  add column if not exists retry_count integer not null default 0;

alter table public.timetable_events
  add column if not exists recurrence_group_id uuid,
  add column if not exists template_key text;

create index if not exists subjects_exam_date_idx
  on public.subjects (user_id, exam_date);

create index if not exists content_sources_batch_idx
  on public.content_sources (user_id, batch_id, source_type);

create index if not exists timetable_events_recurrence_idx
  on public.timetable_events (user_id, recurrence_group_id, starts_at);
