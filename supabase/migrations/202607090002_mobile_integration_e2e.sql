create table if not exists public.schedule_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_id uuid references public.trigger_definitions(id) on delete cascade,
  schedule_key text not null,
  cron_expression text,
  interval_minutes integer,
  status text not null default 'active' check (status in ('active', 'paused', 'disabled', 'failed')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, schedule_key)
);

create table if not exists public.location_event_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  place_id text,
  place_label text,
  coarse_location jsonb not null default '{}'::jsonb,
  suggestion jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create table if not exists public.code_execution_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_run_id uuid references public.trigger_runs(id) on delete set null,
  provider text not null default 'daytona' check (provider in ('daytona')),
  status text not null default 'approval_required' check (
    status in (
      'approval_required',
      'denied',
      'queued',
      'running',
      'succeeded',
      'failed'
    )
  ),
  language text not null check (language in ('javascript', 'python', 'shell', 'typescript')),
  command text,
  working_directory text not null default 'workspace',
  timeout_seconds integer not null default 10,
  environment jsonb not null default '{}'::jsonb,
  request_payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule_jobs enable row level security;
alter table public.location_event_suggestions enable row level security;
alter table public.code_execution_requests enable row level security;

create policy "schedule jobs are user owned" on public.schedule_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "location suggestions are user owned" on public.location_event_suggestions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "code execution requests are user owned" on public.code_execution_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists schedule_jobs_user_next_idx
  on public.schedule_jobs (user_id, next_run_at asc);

create index if not exists location_event_suggestions_user_created_idx
  on public.location_event_suggestions (user_id, created_at desc);

create index if not exists code_execution_requests_user_created_idx
  on public.code_execution_requests (user_id, created_at desc);
