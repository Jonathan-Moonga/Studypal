-- StudyPal's initial data model.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  weekly_goal_minutes integer not null default 300 check (weekly_goal_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default 'indigo',
  created_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  notes text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.study_sessions enable row level security;
alter table public.tasks enable row level security;

create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can create their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can manage their own subjects" on public.subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own study sessions" on public.study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage their own tasks" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
