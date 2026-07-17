-- WARUNG BU DEDI - SETUP DATABASE SUPABASE
-- Jalankan seluruh kode ini melalui Supabase -> SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  price bigint not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  total bigint not null check (total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id uuid,
  product_name text not null,
  price bigint not null check (price >= 0),
  quantity integer not null check (quantity > 0),
  subtotal bigint not null check (subtotal >= 0)
);

alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;

drop policy if exists "Authenticated users manage products" on public.products;
create policy "Authenticated users manage products"
on public.products
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users read transactions" on public.transactions;
create policy "Authenticated users read transactions"
on public.transactions
for select
to authenticated
using (true);

drop policy if exists "Authenticated users read transaction items" on public.transaction_items;
create policy "Authenticated users read transaction items"
on public.transaction_items
for select
to authenticated
using (true);

create or replace function public.process_sale(sale_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_transaction_id uuid := gen_random_uuid();
  new_code text;
  sale_total bigint := 0;
  item jsonb;
  product_record public.products%rowtype;
  requested_quantity integer;
begin
  if auth.uid() is null then
    raise exception 'Pengguna belum login';
  end if;

  if sale_items is null
     or jsonb_typeof(sale_items) <> 'array'
     or jsonb_array_length(sale_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;

  -- Kunci produk selama transaksi agar stok tidak bentrok.
  for item in select * from jsonb_array_elements(sale_items)
  loop
    requested_quantity := (item->>'quantity')::integer;

    if requested_quantity <= 0 then
      raise exception 'Jumlah barang tidak valid';
    end if;

    select *
    into product_record
    from public.products
    where id = (item->>'product_id')::uuid
    for update;

    if not found then
      raise exception 'Barang tidak ditemukan';
    end if;

    if product_record.stock < requested_quantity then
      raise exception 'Stok % tidak mencukupi', product_record.name;
    end if;

    sale_total := sale_total + (product_record.price * requested_quantity);
  end loop;

  new_code :=
    'TRX-' ||
    to_char(now(), 'YYYYMMDD-HH24MISS-MS') ||
    '-' ||
    upper(substr(replace(new_transaction_id::text, '-', ''), 1, 4));

  insert into public.transactions (id, code, total)
  values (new_transaction_id, new_code, sale_total);

  for item in select * from jsonb_array_elements(sale_items)
  loop
    requested_quantity := (item->>'quantity')::integer;

    select *
    into product_record
    from public.products
    where id = (item->>'product_id')::uuid
    for update;

    update public.products
    set stock = stock - requested_quantity
    where id = product_record.id;

    insert into public.transaction_items (
      transaction_id,
      product_id,
      product_name,
      price,
      quantity,
      subtotal
    )
    values (
      new_transaction_id,
      product_record.id,
      product_record.name,
      product_record.price,
      requested_quantity,
      product_record.price * requested_quantity
    );
  end loop;

  return new_transaction_id;
end;
$$;

revoke all on function public.process_sale(jsonb) from public;
grant execute on function public.process_sale(jsonb) to authenticated;

-- Data contoh. Hapus bagian ini kalau tidak dibutuhkan.
insert into public.products (name, price, stock)
select *
from (values
  ('Indomie Goreng', 3500::bigint, 20),
  ('Air Mineral', 3000::bigint, 15),
  ('Kopi Sachet', 2500::bigint, 25)
) as sample(name, price, stock)
where not exists (select 1 from public.products);
