-- ============================================================
-- FreelancerOS — Supabase / PostgreSQL schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Requires the pgcrypto extension for gen_random_uuid().
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  business_name text,
  email         text,
  currency      text not null default 'USD',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- clients
-- ------------------------------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  company    text,
  email      text,
  phone      text,
  address    text,
  notes      text,
  status     text not null default 'Active'
             check (status in ('Active', 'Lead', 'Past')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_user_id_idx on public.clients (user_id);

-- ------------------------------------------------------------
-- projects
-- ------------------------------------------------------------
create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  client_id      uuid references public.clients(id) on delete set null,
  name           text not null,
  budget         numeric(12,2) not null default 0,
  start_date     date,
  deadline       date,
  status         text not null default 'Planning'
                 check (status in ('Planning', 'In Progress', 'Review', 'Completed')),
  progress       int not null default 0 check (progress between 0 and 100),
  payment_status text not null default 'Pending'
                 check (payment_status in ('Pending', 'Partial', 'Paid')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index projects_user_id_idx on public.projects (user_id);
create index projects_client_id_idx on public.projects (client_id);

-- ------------------------------------------------------------
-- tasks
-- ------------------------------------------------------------
create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title      text not null,
  priority   text not null default 'Medium'
             check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status     text not null default 'To Do'
             check (status in ('To Do', 'In Progress', 'Completed')),
  deadline   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_project_id_idx on public.tasks (project_id);

-- ------------------------------------------------------------
-- invoices + invoice_items
-- ------------------------------------------------------------
create table public.invoices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid references public.clients(id) on delete set null,
  number     text not null,
  date       date not null default current_date,
  due_date   date,
  tax        numeric(12,2) not null default 0,
  discount   numeric(12,2) not null default 0,
  status     text not null default 'Pending'
             check (status in ('Paid', 'Pending', 'Overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, number)
);
create index invoices_user_id_idx on public.invoices (user_id);
create index invoices_client_id_idx on public.invoices (client_id);

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  rate        numeric(12,2) not null default 0
);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

-- Convenience view: invoice totals (sum of items + tax - discount)
-- Uses security_invoker = true so querying user's RLS policies apply
create or replace view public.invoice_totals with (security_invoker = true) as
select
  i.id as invoice_id,
  i.user_id,
  coalesce(sum(ii.quantity * ii.rate), 0) + i.tax - i.discount as total
from public.invoices i
left join public.invoice_items ii on ii.invoice_id = i.id
group by i.id, i.user_id, i.tax, i.discount;

-- ------------------------------------------------------------
-- payments
-- ------------------------------------------------------------
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  invoice_id  uuid references public.invoices(id) on delete set null,
  client_id   uuid references public.clients(id) on delete set null,
  amount      numeric(12,2) not null,
  date        date not null default current_date,
  method      text,
  reference   text,
  created_at  timestamptz not null default now()
);
create index payments_user_id_idx on public.payments (user_id);
create index payments_invoice_id_idx on public.payments (invoice_id);

-- ------------------------------------------------------------
-- expenses
-- ------------------------------------------------------------
create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null default current_date,
  category   text not null default 'Other'
             check (category in ('Software', 'Contractor', 'Travel', 'Office', 'Other')),
  amount     numeric(12,2) not null,
  note       text,
  created_at timestamptz not null default now()
);
create index expenses_user_id_idx on public.expenses (user_id);

-- ============================================================
-- Row Level Security — every table is scoped to its owner
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.projects      enable row level security;
alter table public.tasks         enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments      enable row level security;
alter table public.expenses      enable row level security;

-- profiles: a user can only read/update their own row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- generic owner-scoped policies for user_id-keyed tables
create policy "clients_all_own" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "projects_all_own" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks_all_own" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invoices_all_own" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "payments_all_own" on public.payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "expenses_all_own" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- invoice_items: scoped via parent invoice's user_id
create policy "invoice_items_all_own" on public.invoice_items
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
    )
  );

-- ============================================================
-- attachments (contracts, receipts, and other files attached to
-- a client, project, invoice, or expense)
-- ============================================================
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  entity_type   text not null check (entity_type in ('client', 'project', 'invoice', 'expense')),
  entity_id     uuid not null,
  file_name     text not null,
  storage_path  text not null unique,
  file_size     bigint,
  mime_type     text,
  created_at    timestamptz not null default now()
);
create index attachments_user_id_idx on public.attachments (user_id);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);

alter table public.attachments enable row level security;

create policy "attachments_all_own" on public.attachments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- storage bucket for the actual files (private — accessed only
-- via signed URLs generated for the owning user)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Files are stored under a path like: {user_id}/{entity_type}/{entity_id}/{filename}
-- so a simple "first folder segment = your uid" check scopes access per user.
create policy "attachments_storage_select_own" on storage.objects
  for select using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "attachments_storage_insert_own" on storage.objects
  for insert with check (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "attachments_storage_delete_own" on storage.objects
  for delete using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- updated_at auto-touch trigger, applied to mutable tables
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger touch_clients  before update on public.clients  for each row execute procedure public.touch_updated_at();
create trigger touch_projects before update on public.projects for each row execute procedure public.touch_updated_at();
create trigger touch_tasks    before update on public.tasks    for each row execute procedure public.touch_updated_at();
create trigger touch_invoices before update on public.invoices for each row execute procedure public.touch_updated_at();
create trigger touch_profiles before update on public.profiles for each row execute procedure public.touch_updated_at();
