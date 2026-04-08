create table if not exists products (
  id text primary key,
  slug text not null unique,
  code text not null,
  name text not null,
  price numeric(10, 2) not null,
  currency text not null,
  file_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id bigserial primary key,
  provider text not null,
  provider_order_id text not null unique,
  product_id text not null references products(id),
  buyer_email text not null,
  amount numeric(10, 2) not null,
  currency text not null,
  status text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists licenses (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id text not null references products(id),
  serial_hash text not null unique,
  serial_last4 text not null,
  status text not null,
  activation_limit integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists license_activations (
  id bigserial primary key,
  license_id bigint not null references licenses(id) on delete cascade,
  device_fingerprint text not null,
  app_version text,
  activated_at timestamptz not null default now()
);

create table if not exists download_tokens (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  max_downloads integer not null,
  download_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id bigserial primary key,
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  unique (provider, event_id)
);

insert into products (id, slug, code, name, price, currency, file_name)
values ('surgeq-l5', 'surgeq-l5', 'SL5', 'SurgEQ-L5', 79.00, 'EUR', 'SurgEQ-L5-macOS.zip')
on conflict (id) do nothing;
