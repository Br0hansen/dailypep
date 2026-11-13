-- Private Web Push subscriptions and timing-only reminder schedules.
-- No peptide names, doses, notes or container data are stored here.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.dailypep_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 4096),
  p256dh text not null check (length(p256dh) between 40 and 255),
  auth text not null check (length(auth) between 8 and 255),
  time_zone text not null check (length(time_zone) between 1 and 100),
  locale text not null default 'en' check (locale in ('nb', 'en')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dailypep_push_subscriptions_user_idx
  on public.dailypep_push_subscriptions(user_id) where enabled;

create table if not exists public.dailypep_reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  protocol_id text not null check (length(protocol_id) between 1 and 160),
  start_day date not null,
  end_day date,
  rule jsonb not null,
  minute_of_day integer not null check (minute_of_day between 0 and 1439),
  time_zone text not null check (length(time_zone) between 1 and 100),
  is_active boolean not null default true,
  next_fire_at timestamptz,
  locked_until timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error text,
  updated_at timestamptz not null default now(),
  unique(user_id, protocol_id),
  check (end_day is null or end_day >= start_day)
);

create index if not exists dailypep_reminder_due_idx
  on public.dailypep_reminder_schedules(next_fire_at)
  where is_active and next_fire_at is not null;

alter table public.dailypep_push_subscriptions enable row level security;
alter table public.dailypep_reminder_schedules enable row level security;
revoke all on public.dailypep_push_subscriptions from public, anon, authenticated;
revoke all on public.dailypep_reminder_schedules from public, anon, authenticated;
grant select, insert, update, delete on public.dailypep_push_subscriptions to service_role;
grant select, insert, update, delete on public.dailypep_reminder_schedules to service_role;

create or replace function public.dailypep_rule_valid(p_rule jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kind text;
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then return false; end if;
  v_kind := p_rule->>'kind';
  if v_kind = 'interval' then
    return coalesce((p_rule->>'days') ~ '^[0-9]+$' and (p_rule->>'days')::integer between 1 and 3650, false);
  elsif v_kind = 'weekdays' then
    return coalesce(jsonb_typeof(p_rule->'days') = 'array'
      and jsonb_array_length(p_rule->'days') between 1 and 7
      and not exists (
        select 1 from jsonb_array_elements_text(p_rule->'days') as value
        where value !~ '^[0-6]$'
      ), false);
  elsif v_kind = 'cycle' then
    return coalesce((p_rule->>'daysOn') ~ '^[0-9]+$'
      and (p_rule->>'daysOff') ~ '^[0-9]+$'
      and (p_rule->>'daysOn')::integer between 1 and 3650
      and (p_rule->>'daysOff')::integer between 0 and 3650, false);
  end if;
  return false;
exception when others then
  return false;
end;
$$;

create or replace function public.dailypep_rule_matches(p_day date, p_start_day date, p_rule jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kind text := p_rule->>'kind';
  v_index integer := p_day - p_start_day;
  v_on integer;
  v_off integer;
begin
  if v_index < 0 or not public.dailypep_rule_valid(p_rule) then return false; end if;
  if v_kind = 'interval' then
    return mod(v_index, (p_rule->>'days')::integer) = 0;
  elsif v_kind = 'weekdays' then
    return exists (
      select 1 from jsonb_array_elements_text(p_rule->'days') as value
      where value::integer = extract(dow from p_day)::integer
    );
  end if;
  v_on := (p_rule->>'daysOn')::integer;
  v_off := (p_rule->>'daysOff')::integer;
  return mod(v_index, v_on + v_off) < v_on;
end;
$$;

create or replace function public.dailypep_next_occurrence(
  p_start_day date,
  p_end_day date,
  p_rule jsonb,
  p_minute_of_day integer,
  p_time_zone text,
  p_after timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day date;
  v_at timestamptz;
  v_step integer;
begin
  if p_start_day is null or p_after is null or p_minute_of_day not between 0 and 1439
    or not public.dailypep_rule_valid(p_rule)
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone)
  then return null; end if;
  v_day := greatest(p_start_day, (p_after at time zone p_time_zone)::date);
  for v_step in 0..3661 loop
    if p_end_day is not null and v_day > p_end_day then return null; end if;
    if public.dailypep_rule_matches(v_day, p_start_day, p_rule) then
      v_at := (v_day::timestamp + pg_catalog.make_interval(mins => p_minute_of_day)) at time zone p_time_zone;
      if v_at > p_after then return v_at; end if;
    end if;
    v_day := v_day + 1;
  end loop;
  return null;
end;
$$;

create or replace function public.register_dailypep_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_time_zone text,
  p_locale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) not between 20 and 4096
    or length(p_p256dh) not between 40 and 255 or length(p_auth) not between 8 and 255
    or p_locale not in ('nb', 'en')
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone)
  then raise exception 'INVALID_PUSH_SUBSCRIPTION'; end if;

  insert into public.dailypep_push_subscriptions(user_id, endpoint, p256dh, auth, time_zone, locale, enabled, updated_at)
    values (v_user_id, p_endpoint, p_p256dh, p_auth, p_time_zone, p_locale, true, now())
    on conflict (endpoint) do update set
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      time_zone = excluded.time_zone,
      locale = excluded.locale,
      enabled = true,
      updated_at = now()
    where dailypep_push_subscriptions.user_id = v_user_id
    returning id into v_id;
  if v_id is null then raise exception 'SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT'; end if;
  return v_id;
end;
$$;

create or replace function public.unregister_dailypep_push(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.dailypep_push_subscriptions where user_id = v_user_id and endpoint = p_endpoint;
  if not exists (select 1 from public.dailypep_push_subscriptions where user_id = v_user_id and enabled) then
    delete from public.dailypep_reminder_schedules where user_id = v_user_id;
  end if;
end;
$$;

create or replace function public.sync_dailypep_reminders(p_schedules jsonb, p_time_zone text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_protocol_id text;
  v_start_day date;
  v_end_day date;
  v_minute integer;
  v_active boolean;
  v_count integer := 0;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_schedules is null or jsonb_typeof(p_schedules) is distinct from 'array' or jsonb_array_length(p_schedules) > 500 then raise exception 'INVALID_SCHEDULES'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then raise exception 'INVALID_TIME_ZONE'; end if;
  if not exists (select 1 from public.dailypep_push_subscriptions where user_id = v_user_id and enabled) then raise exception 'PUSH_NOT_REGISTERED'; end if;
  if (select count(*) from jsonb_array_elements(p_schedules)) <>
     (select count(distinct value->>'protocolId') from jsonb_array_elements(p_schedules) as value)
  then raise exception 'DUPLICATE_PROTOCOL_ID'; end if;

  for v_item in select value from jsonb_array_elements(p_schedules) loop
    if jsonb_typeof(v_item) is distinct from 'object' or exists (
      select 1 from jsonb_object_keys(v_item) as key
      where key not in ('protocolId', 'startDay', 'endDay', 'rule', 'minuteOfDay', 'isActive')
    ) then raise exception 'INVALID_SCHEDULE'; end if;
    v_protocol_id := v_item->>'protocolId';
    if v_protocol_id is null or length(v_protocol_id) not between 1 and 160
      or (v_item->>'startDay') is null or (v_item->>'startDay') !~ '^\d{4}-\d{2}-\d{2}$'
      or (v_item->>'minuteOfDay') is null or (v_item->>'minuteOfDay') !~ '^\d{1,4}$'
      or jsonb_typeof(v_item->'isActive') is distinct from 'boolean'
      or not public.dailypep_rule_valid(v_item->'rule')
    then raise exception 'INVALID_SCHEDULE'; end if;
    v_start_day := (v_item->>'startDay')::date;
    v_end_day := case when v_item->'endDay' is null or jsonb_typeof(v_item->'endDay') = 'null' then null else (v_item->>'endDay')::date end;
    v_minute := (v_item->>'minuteOfDay')::integer;
    v_active := (v_item->>'isActive')::boolean;
    if v_minute not between 0 and 1439 or (v_end_day is not null and v_end_day < v_start_day) then raise exception 'INVALID_SCHEDULE'; end if;

    insert into public.dailypep_reminder_schedules(
      user_id, protocol_id, start_day, end_day, rule, minute_of_day, time_zone, is_active, next_fire_at, locked_until, failure_count, last_error, updated_at
    ) values (
      v_user_id, v_protocol_id, v_start_day, v_end_day, v_item->'rule', v_minute, p_time_zone, v_active,
      case when v_active then public.dailypep_next_occurrence(v_start_day, v_end_day, v_item->'rule', v_minute, p_time_zone, now()) else null end,
      null, 0, null, now()
    ) on conflict (user_id, protocol_id) do update set
      start_day = excluded.start_day,
      end_day = excluded.end_day,
      rule = excluded.rule,
      minute_of_day = excluded.minute_of_day,
      time_zone = excluded.time_zone,
      is_active = excluded.is_active,
      next_fire_at = excluded.next_fire_at,
      locked_until = null,
      failure_count = 0,
      last_error = null,
      updated_at = now();
    v_count := v_count + 1;
  end loop;

  delete from public.dailypep_reminder_schedules schedule
    where schedule.user_id = v_user_id
      and not exists (
        select 1 from jsonb_array_elements(p_schedules) as item
        where item->>'protocolId' = schedule.protocol_id
      );
  return v_count;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'INVALID_SCHEDULE_DATE';
end;
$$;

create or replace function public.claim_due_dailypep_reminders(p_limit integer default 100)
returns table(schedule_id uuid, user_id uuid, protocol_id text, occurrence timestamptz)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select id from public.dailypep_reminder_schedules
    where is_active and next_fire_at is not null and next_fire_at <= now()
      and (locked_until is null or locked_until < now())
    order by next_fire_at
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  )
  update public.dailypep_reminder_schedules schedule
    set locked_until = now() + interval '2 minutes'
    from due where schedule.id = due.id
    returning schedule.id, schedule.user_id, schedule.protocol_id, schedule.next_fire_at;
$$;

create or replace function public.advance_dailypep_reminder(p_schedule_id uuid, p_occurrence timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.dailypep_reminder_schedules schedule set
    next_fire_at = public.dailypep_next_occurrence(
      schedule.start_day, schedule.end_day, schedule.rule, schedule.minute_of_day,
      schedule.time_zone, greatest(p_occurrence, now())
    ),
    locked_until = null,
    failure_count = 0,
    last_error = null,
    updated_at = now()
  where schedule.id = p_schedule_id and schedule.next_fire_at = p_occurrence;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.release_dailypep_reminder(p_schedule_id uuid, p_occurrence timestamptz, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.dailypep_reminder_schedules set
    locked_until = null,
    failure_count = failure_count + 1,
    last_error = left(coalesce(p_error, 'delivery_failed'), 300),
    updated_at = now()
  where id = p_schedule_id and next_fire_at = p_occurrence;
$$;

revoke all on function public.dailypep_rule_valid(jsonb) from public, anon, authenticated;
revoke all on function public.dailypep_rule_matches(date, date, jsonb) from public, anon, authenticated;
revoke all on function public.dailypep_next_occurrence(date, date, jsonb, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public.register_dailypep_push(text, text, text, text, text) from public, anon;
revoke all on function public.unregister_dailypep_push(text) from public, anon;
revoke all on function public.sync_dailypep_reminders(jsonb, text) from public, anon;
grant execute on function public.register_dailypep_push(text, text, text, text, text) to authenticated;
grant execute on function public.unregister_dailypep_push(text) to authenticated;
grant execute on function public.sync_dailypep_reminders(jsonb, text) to authenticated;
revoke all on function public.claim_due_dailypep_reminders(integer) from public, anon, authenticated;
revoke all on function public.advance_dailypep_reminder(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.release_dailypep_reminder(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.claim_due_dailypep_reminders(integer) to service_role;
grant execute on function public.advance_dailypep_reminder(uuid, timestamptz) to service_role;
grant execute on function public.release_dailypep_reminder(uuid, timestamptz, text) to service_role;
