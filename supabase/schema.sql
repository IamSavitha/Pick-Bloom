-- Pick&Bloom: one row per signed-in account holding the whole family (every child's picks and settings).
create table if not exists public.pickbloom_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pickbloom_state enable row level security;

-- Newer Supabase projects don't auto-grant table access to API roles. Signed-in users only; RLS limits them to their own row.
grant select, insert, update on public.pickbloom_state to authenticated;

create policy "read own state" on public.pickbloom_state
  for select using (auth.uid() = user_id);
create policy "insert own state" on public.pickbloom_state
  for insert with check (auth.uid() = user_id);
create policy "update own state" on public.pickbloom_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
