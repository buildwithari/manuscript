-- Manuscript schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Projects: one per book idea, owned by a user
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  title      text not null,
  created_at timestamptz not null default now()
);

-- Sessions: one per research run, belongs to a project
create table public.sessions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  concept    text not null,
  analysis   jsonb,
  confidence jsonb,
  books      jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index on public.sessions(project_id);
create index on public.projects(user_id);

-- Enable Row Level Security
alter table public.projects enable row level security;
alter table public.sessions enable row level security;

-- Projects: users can only see and modify their own
create policy "users can read own projects"
  on public.projects for select
  using (user_id = auth.uid()::text);

create policy "users can insert own projects"
  on public.projects for insert
  with check (user_id = auth.uid()::text);

create policy "users can delete own projects"
  on public.projects for delete
  using (user_id = auth.uid()::text);

-- Sessions: users can access sessions for projects they own
create policy "users can read own sessions"
  on public.sessions for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = sessions.project_id
        and projects.user_id = auth.uid()::text
    )
  );

create policy "users can insert own sessions"
  on public.sessions for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = sessions.project_id
        and projects.user_id = auth.uid()::text
    )
  );
