-- Execute once in the SQL Editor of the same Supabase project.
-- This table is a private backend token vault, NOT user-accessible financial data.
-- The application encrypts tokens before sending them; the signing/encryption
-- secret stays in Vercel. Anonymous and signed-in browser clients have no access.
begin;

create table if not exists public.vila_web_sessions (
  namespace text not null,
  session_hash text not null check (length(session_hash) = 64),
  payload text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  last_seen timestamptz not null default now(),
  refresh_owner text,
  refresh_until timestamptz,
  primary key (namespace, session_hash)
);
create index if not exists vila_web_sessions_expiry on public.vila_web_sessions(namespace, expires_at);
create index if not exists vila_web_sessions_activity on public.vila_web_sessions(namespace, last_seen);

alter table public.vila_web_sessions enable row level security;
revoke all on public.vila_web_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.vila_web_sessions to service_role;

-- Only one Vercel instance can rotate a given refresh token at a time.
create or replace function public.vila_session_claim_refresh(p_namespace text, p_session_hash text, p_owner text)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare affected integer;
begin
  update public.vila_web_sessions set refresh_owner=p_owner, refresh_until=now()+interval '60 seconds'
  where namespace=p_namespace and session_hash=p_session_hash and expires_at>now()
    and (refresh_until is null or refresh_until<now());
  get diagnostics affected = row_count;
  return affected=1;
end;
$$;

-- UPDATE only: a refresh that finishes after logout must not recreate a session.
create or replace function public.vila_session_finish_refresh(p_namespace text, p_session_hash text, p_owner text, p_payload text)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare affected integer;
begin
  update public.vila_web_sessions set payload=p_payload, refresh_owner=null, refresh_until=null
  where namespace=p_namespace and session_hash=p_session_hash and refresh_owner=p_owner
    and refresh_until>now() and expires_at>now();
  get diagnostics affected = row_count;
  return affected=1;
end;
$$;

revoke all on function public.vila_session_claim_refresh(text,text,text) from public, anon, authenticated;
revoke all on function public.vila_session_finish_refresh(text,text,text,text) from public, anon, authenticated;
grant execute on function public.vila_session_claim_refresh(text,text,text) to service_role;
grant execute on function public.vila_session_finish_refresh(text,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
