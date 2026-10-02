-- Cig Diary: Loose cigarette purchases
-- Run this once in Supabase -> SQL Editor.
-- The existing app uses the public/publishable client key and does not use Supabase Auth,
-- so this table follows the same simple public-storage model as the existing tables.

create table if not exists public.loose_purchases (
  id text primary key,
  brand_id text not null,
  quantity integer not null check (quantity > 0),
  price_per_cigarette numeric(12,2) not null check (price_per_cigarette > 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  date text not null,
  time text,
  notes text,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists loose_purchases_brand_id_idx
  on public.loose_purchases (brand_id);

create index if not exists loose_purchases_date_idx
  on public.loose_purchases (date);

-- The app is currently unauthenticated, so allow the browser client to use this table.
-- If you later add Supabase Auth, replace these policies with per-user policies.
alter table public.loose_purchases disable row level security;
