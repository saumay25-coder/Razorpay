-- Apply in the Supabase SQL editor before using connected mode.
create table if not exists public.tarang_workspaces (
  id uuid primary key,
  schema_version integer not null default 2 check (schema_version = 2),
  revision bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.tarang_members (
  workspace_id uuid not null references public.tarang_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id text not null,
  app_role text not null check (app_role in ('manager','assignee')),
  primary key (workspace_id,user_id),
  unique(workspace_id,employee_id)
);
alter table public.tarang_workspaces enable row level security;
alter table public.tarang_members enable row level security;
revoke all on public.tarang_workspaces, public.tarang_members from anon, authenticated;
grant all on public.tarang_workspaces, public.tarang_members to service_role;
-- No public RLS policy: access is through authenticated Vercel handlers.
-- The service-role credential is server-only; every handler verifies membership.
create or replace function public.tarang_commit_workspace(p_id uuid,p_expected_revision bigint,p_state jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if (p_state->>'schemaVersion')::integer <> 2
     or (p_state->>'revision')::bigint <> p_expected_revision+1 then
    raise exception 'Invalid state version';
  end if;
  update public.tarang_workspaces set state=p_state,revision=p_expected_revision+1,updated_at=now()
  where id=p_id and revision=p_expected_revision;
  return found;
end;
$$;
revoke all on function public.tarang_commit_workspace(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.tarang_commit_workspace(uuid,bigint,jsonb) to service_role;
