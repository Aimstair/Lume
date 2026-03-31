begin;

alter table public.messages
  add column if not exists aura_color text;

alter table public.messages
  add column if not exists voice_spark text;

alter table public.encounters
  add column if not exists observed_aura_color text;

alter table public.encounters
  add column if not exists observed_voice_spark text;

commit;
