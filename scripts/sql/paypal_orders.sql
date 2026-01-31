create table if not exists public.paypal_orders (
  id uuid primary key default gen_random_uuid(),
  paypal_order_id text not null unique,
  chat_id bigint not null,
  item_key text not null,
  amount text not null,
  currency text not null,
  status text not null default 'created',
  approval_url text null,
  capture_id text null,
  created_at timestamptz not null default now(),
  approved_at timestamptz null,
  paid_at timestamptz null,
  fulfilled_at timestamptz null,
  updated_at timestamptz not null default now()
);
