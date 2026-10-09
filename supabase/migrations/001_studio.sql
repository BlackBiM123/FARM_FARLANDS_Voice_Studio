begin;
create table if not exists public.studio_projects (
 id text primary key check (id = 'main'),
 payload jsonb not null default '{"version":1,"npcs":[],"gameCharacter":true}'::jsonb,
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.studio_projects(id) values ('main') on conflict(id) do nothing;
create table if not exists public.studio_takes (
 id uuid primary key,
 npc_id text not null,
 metadata jsonb not null,
 audio_path text not null unique,
 bytes bigint not null check (bytes > 0 and bytes <= 4000000),
 deleted_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.studio_projects enable row level security;
alter table public.studio_takes enable row level security;
revoke all on public.studio_projects, public.studio_takes from anon, authenticated;
grant all on public.studio_projects, public.studio_takes to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('studio-audio','studio-audio',false,4000000,array['audio/wav'])
 on conflict(id) do nothing;
commit;
