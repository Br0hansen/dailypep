-- Run in the DailyPep project's Supabase SQL editor, or apply with Supabase CLI.
-- Snapshot backups are explicit. They do not silently replace another device's work.
create table if not exists public.dailypep_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (payload->>'version' = '1' and jsonb_typeof(payload) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint backup_size check (octet_length(payload::text) <= 30000000)
);

alter table public.dailypep_backups enable row level security;
revoke all on public.dailypep_backups from anon;
grant select, insert, update, delete on public.dailypep_backups to authenticated;

create policy "Read own DailyPep backup" on public.dailypep_backups
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own DailyPep backup" on public.dailypep_backups
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own DailyPep backup" on public.dailypep_backups
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own DailyPep backup" on public.dailypep_backups
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.save_dailypep_backup(p_payload jsonb, p_expected_revision integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_expected_revision < 0 or p_expected_revision is null then raise exception 'INVALID_REVISION'; end if;
  if p_expected_revision = 0 then
    insert into public.dailypep_backups(user_id, payload, revision, updated_at)
      values (v_user_id, p_payload, 1, now())
      on conflict (user_id) do nothing
      returning revision into v_revision;
  else
    update public.dailypep_backups set payload = p_payload, revision = revision + 1, updated_at = now()
      where user_id = v_user_id and revision = p_expected_revision
      returning revision into v_revision;
  end if;
  if v_revision is null then raise exception 'BACKUP_CONFLICT'; end if;
  return v_revision;
end;
$$;

revoke all on function public.save_dailypep_backup(jsonb, integer) from public, anon;
grant execute on function public.save_dailypep_backup(jsonb, integer) to authenticated;
