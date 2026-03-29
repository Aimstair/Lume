-- Lume Supabase schema
-- Run in Supabase SQL editor in order.

create extension if not exists pgcrypto;

-- ---- ENUMS ----
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reaction_type') then
    create type public.reaction_type as enum ('heart');
  end if;
end $$;

-- ---- PROFILES ----
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  lume_id text not null unique,
  display_name text,
  avatar_url text,
  radiance_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---- DAILY MESSAGES ----
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  body varchar(280) not null,
  message_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_body_not_empty check (char_length(trim(body)) > 0),
  constraint uq_messages_profile_per_day unique (profile_id, message_date)
);

drop trigger if exists trg_messages_updated_at on public.messages;
create trigger trg_messages_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

-- ---- ENCOUNTERS (who passed whom in proximity) ----
create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  observer_profile_id uuid not null references public.profiles(id) on delete cascade,
  observed_profile_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  observed_message_body varchar(280),
  observed_radiance_score integer not null,
  rssi integer,
  happened_at timestamptz not null,
  created_at timestamptz not null default now(),
  sync_source text not null default 'ble',
  constraint chk_no_self_encounter check (observer_profile_id <> observed_profile_id)
);

create index if not exists idx_encounters_observer_profile on public.encounters(observer_profile_id, happened_at desc);
create index if not exists idx_encounters_observed_profile on public.encounters(observed_profile_id, happened_at desc);

-- ---- REACTIONS ----
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reactor_profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction public.reaction_type not null,
  created_at timestamptz not null default now(),
  constraint uq_reaction_per_message_per_reactor unique (message_id, reactor_profile_id)
);

-- ---- RADIANCE LOGIC TRIGGERS ----
create or replace function public.apply_radiance_delta_for_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile_id uuid;
  delta integer := 0;
begin
  if tg_op = 'INSERT' then
    if new.reaction = 'heart' then
      delta := 5;
      select m.profile_id into target_profile_id from public.messages m where m.id = new.message_id;
    end if;

  elsif tg_op = 'DELETE' then
    if old.reaction = 'heart' then
      delta := -5;
      select m.profile_id into target_profile_id from public.messages m where m.id = old.message_id;
    end if;

  elsif tg_op = 'UPDATE' then
    -- Handle reaction changes safely even if more enum values are introduced later.
    if old.reaction = 'heart' then
      delta := delta - 5;
    end if;
    if new.reaction = 'heart' then
      delta := delta + 5;
    end if;
    select m.profile_id into target_profile_id from public.messages m where m.id = new.message_id;
  end if;

  if target_profile_id is not null and delta <> 0 then
    update public.profiles
    set radiance_score = greatest(0, radiance_score + delta)
    where id = target_profile_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_message_reactions_radiance_ins on public.message_reactions;
create trigger trg_message_reactions_radiance_ins
after insert on public.message_reactions
for each row execute function public.apply_radiance_delta_for_reaction();

drop trigger if exists trg_message_reactions_radiance_upd on public.message_reactions;
create trigger trg_message_reactions_radiance_upd
after update of reaction on public.message_reactions
for each row execute function public.apply_radiance_delta_for_reaction();

drop trigger if exists trg_message_reactions_radiance_del on public.message_reactions;
create trigger trg_message_reactions_radiance_del
after delete on public.message_reactions
for each row execute function public.apply_radiance_delta_for_reaction();

-- ---- RLS ----
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.encounters enable row level security;
alter table public.message_reactions enable row level security;

-- Profiles are readable by authenticated users; writable by owner.
drop policy if exists profiles_select_auth on public.profiles;
create policy profiles_select_auth on public.profiles
for select to authenticated
using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert to authenticated
with check (auth.uid() = id);

-- Messages: owner can write; all authenticated users can read.
drop policy if exists messages_select_auth on public.messages;
create policy messages_select_auth on public.messages
for select to authenticated
using (true);

drop policy if exists messages_owner_insert on public.messages;
create policy messages_owner_insert on public.messages
for insert to authenticated
with check (auth.uid() = profile_id);

drop policy if exists messages_owner_update on public.messages;
create policy messages_owner_update on public.messages
for update to authenticated
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

-- Encounters: owner (observer) owns the row.
drop policy if exists encounters_observer_select on public.encounters;
create policy encounters_observer_select on public.encounters
for select to authenticated
using (auth.uid() = observer_profile_id);

drop policy if exists encounters_observer_insert on public.encounters;
create policy encounters_observer_insert on public.encounters
for insert to authenticated
with check (auth.uid() = observer_profile_id);

-- Reactions: readers can see all; reactor can create/delete own.
drop policy if exists reactions_select_auth on public.message_reactions;
create policy reactions_select_auth on public.message_reactions
for select to authenticated
using (true);

drop policy if exists reactions_insert_self on public.message_reactions;
create policy reactions_insert_self on public.message_reactions
for insert to authenticated
with check (auth.uid() = reactor_profile_id);

drop policy if exists reactions_delete_self on public.message_reactions;
create policy reactions_delete_self on public.message_reactions
for delete to authenticated
using (auth.uid() = reactor_profile_id);
