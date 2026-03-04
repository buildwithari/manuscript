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

-- Novels: one per writing project, optionally linked to a research project
create table public.novels (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  project_id uuid references public.projects(id) on delete set null,
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chapters: belong to a novel, ordered by `order`
create table public.chapters (
  id         uuid primary key default gen_random_uuid(),
  novel_id   uuid not null references public.novels(id) on delete cascade,
  title      text not null default 'Untitled Chapter',
  content    text not null default '',
  "order"    integer not null default 0,
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index on public.novels(user_id);
create index on public.novels(project_id);
create index on public.chapters(novel_id);
create index on public.chapters(novel_id, "order");

-- Enable RLS
alter table public.novels enable row level security;
alter table public.chapters enable row level security;

-- Novels RLS
create policy "users can read own novels"
  on public.novels for select
  using (user_id = auth.uid()::text);

create policy "users can insert own novels"
  on public.novels for insert
  with check (user_id = auth.uid()::text);

create policy "users can update own novels"
  on public.novels for update
  using (user_id = auth.uid()::text);

create policy "users can delete own novels"
  on public.novels for delete
  using (user_id = auth.uid()::text);

-- Chapters RLS (access via novel ownership)
create policy "users can read own chapters"
  on public.chapters for select
  using (
    exists (
      select 1 from public.novels
      where novels.id = chapters.novel_id
        and novels.user_id = auth.uid()::text
    )
  );

create policy "users can insert own chapters"
  on public.chapters for insert
  with check (
    exists (
      select 1 from public.novels
      where novels.id = chapters.novel_id
        and novels.user_id = auth.uid()::text
    )
  );

create policy "users can update own chapters"
  on public.chapters for update
  using (
    exists (
      select 1 from public.novels
      where novels.id = chapters.novel_id
        and novels.user_id = auth.uid()::text
    )
  );

create policy "users can delete own chapters"
  on public.chapters for delete
  using (
    exists (
      select 1 from public.novels
      where novels.id = chapters.novel_id
        and novels.user_id = auth.uid()::text
    )
  );
