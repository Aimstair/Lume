begin;

-- Add message pin types for 3D board rendering.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_pin_type') then
    create type public.message_pin_type as enum ('classic', 'star', 'crystal');
  end if;
end $$;

alter table public.messages
  add column if not exists pin_type public.message_pin_type not null default 'classic';

alter table public.messages
  add column if not exists ripple_count integer not null default 0;

alter table public.messages
  add column if not exists original_sender_id uuid references public.profiles(id) on delete set null;

alter table public.messages
  drop constraint if exists messages_ripple_count_non_negative;

alter table public.messages
  add constraint messages_ripple_count_non_negative check (ripple_count >= 0);

create index if not exists idx_messages_original_sender_id
  on public.messages(original_sender_id);

-- Security-definer function allows ripple count increments while preserving strict owner update policies.
create or replace function public.increment_message_ripple_count(
  target_profile_id uuid,
  target_message_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
  set ripple_count = ripple_count + 1
  where profile_id = target_profile_id
    and message_date = target_message_date;
end;
$$;

grant execute on function public.increment_message_ripple_count(uuid, date) to authenticated;

commit;
