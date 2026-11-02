-- รันใน Supabase SQL Editor ครั้งเดียว
create extension if not exists postgis;

create table if not exists features (
  id          bigint generated always as identity primary key,
  name        text not null,
  geom_type   text not null check (geom_type in ('Point', 'LineString', 'Polygon')),
  geom        geometry(Geometry, 4326) not null,
  properties  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists features_geom_idx on features using gist (geom);
create index if not exists features_geom_type_idx on features (geom_type);
