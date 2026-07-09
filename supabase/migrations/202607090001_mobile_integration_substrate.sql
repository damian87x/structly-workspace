create extension if not exists pgcrypto;

create table if not exists public.receipt_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_uri text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  receipt_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  source_type text not null check (source_type in ('database', 'schedule', 'webhook', 'mcp', 'composio')),
  display_name text not null,
  capabilities jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, source_key)
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  event_key text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source, event_key)
);

create table if not exists public.trigger_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source text not null,
  trigger_type text not null,
  status text not null default 'paused' check (status in ('active', 'paused', 'deleted')),
  config jsonb not null default '{}'::jsonb,
  approval_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trigger_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_id uuid not null references public.trigger_definitions(id) on delete cascade,
  integration_event_id uuid references public.integration_events(id) on delete set null,
  idempotency_key text not null,
  status text not null default 'queued' check (
    status in (
      'queued',
      'approval_required',
      'denied',
      'running',
      'retrying',
      'succeeded',
      'failed',
      'dead_lettered'
    )
  ),
  attempt_count integer not null default 0,
  last_error text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trigger_id, idempotency_key)
);

create table if not exists public.device_heartbeats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  platform text,
  app_state text not null default 'active',
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists public.worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null unique,
  worker_type text not null default 'backend',
  status text not null default 'fresh' check (status in ('fresh', 'stale', 'failed', 'unknown')),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_id uuid references public.integration_events(id) on delete set null,
  trigger_run_id uuid references public.trigger_runs(id) on delete set null,
  action text not null,
  status text not null,
  diagnostic_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dead_letter_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_run_id uuid references public.trigger_runs(id) on delete set null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  retryable boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.receipt_jobs enable row level security;
alter table public.integration_sources enable row level security;
alter table public.integration_events enable row level security;
alter table public.trigger_definitions enable row level security;
alter table public.trigger_runs enable row level security;
alter table public.device_heartbeats enable row level security;
alter table public.worker_heartbeats enable row level security;
alter table public.integration_audit_logs enable row level security;
alter table public.dead_letter_events enable row level security;

create policy "receipt jobs are user owned" on public.receipt_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "integration sources are user owned" on public.integration_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "integration events are user owned" on public.integration_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "trigger definitions are user owned" on public.trigger_definitions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "trigger runs are user owned" on public.trigger_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "device heartbeats are user owned" on public.device_heartbeats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "worker heartbeat read is authenticated" on public.worker_heartbeats
  for select using (auth.role() = 'authenticated');

create policy "audit logs are user visible" on public.integration_audit_logs
  for select using (auth.uid() = user_id);

create policy "dead letters are user owned" on public.dead_letter_events
  for select using (auth.uid() = user_id);

create or replace function public.classify_heartbeat(
  last_seen_at timestamptz,
  stale_after interval default interval '90 seconds',
  fail_after interval default interval '5 minutes'
)
returns text
language sql
stable
as $$
  select case
    when last_seen_at is null then 'unknown'
    when now() - last_seen_at >= fail_after then 'failed'
    when now() - last_seen_at >= stale_after then 'stale'
    else 'fresh'
  end;
$$;

create index if not exists integration_events_user_received_idx
  on public.integration_events (user_id, received_at desc);

create index if not exists trigger_runs_user_updated_idx
  on public.trigger_runs (user_id, updated_at desc);

create index if not exists device_heartbeats_user_seen_idx
  on public.device_heartbeats (user_id, last_seen_at desc);
