# Supabase Setup Guide for Labour Connect (Shramik Setu)

Copy and execute the following SQL script in your **Supabase Dashboard -> SQL Editor**:

```sql
-- ============================================================
-- LABOUR CONNECT (SHRAMIK SETU) - SUPABASE POSTGRES SCHEMA
-- ============================================================

-- 1. Create USERS table
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  username text,
  full_name text not null,
  phone text,
  role text not null check (role in ('worker', 'customer', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Create WORKER PROFILES table
create table public.worker_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade unique not null,
  skill text not null,
  location text not null,
  daily_wage numeric default 800,
  experience text,
  hours text default '9:00 AM - 6:00 PM',
  aadhaar_number text,
  verification_status text default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  photo text,
  rating numeric default 5.0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Create CUSTOMER PROFILES table
create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade unique not null,
  address text,
  city text,
  phone text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Create JOBS table
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.users(id) on delete cascade not null,
  worker_id uuid references public.users(id) on delete set null,
  title text not null,
  skill_required text not null,
  location text not null,
  daily_wage numeric default 0,
  description text,
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected', 'completed', 'cancelled')),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Create BOOKINGS table
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.users(id) on delete cascade not null,
  worker_id uuid references public.users(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected', 'completed')),
  daily_wage numeric default 0,
  booking_date text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 6. Create REVIEWS table
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  customer_id uuid references public.users(id) on delete cascade not null,
  worker_id uuid references public.users(id) on delete cascade not null,
  rating integer check (rating >= 1 and rating <= 5) not null,
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 7. Create NOTIFICATIONS table
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 8. Create SAVED WORKERS table
create table public.saved_workers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.users(id) on delete cascade not null,
  worker_id uuid references public.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(customer_id, worker_id)
);

-- 9. Enable Row Level Security (RLS) & Public Policies
alter table public.users enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.saved_workers enable row level security;

create policy "Public Access users" on public.users for all using (true) with check (true);
create policy "Public Access worker_profiles" on public.worker_profiles for all using (true) with check (true);
create policy "Public Access customer_profiles" on public.customer_profiles for all using (true) with check (true);
create policy "Public Access jobs" on public.jobs for all using (true) with check (true);
create policy "Public Access bookings" on public.bookings for all using (true) with check (true);
create policy "Public Access reviews" on public.reviews for all using (true) with check (true);
create policy "Public Access notifications" on public.notifications for all using (true) with check (true);
create policy "Public Access saved_workers" on public.saved_workers for all using (true) with check (true);

-- Insert Default Admin Account (Optional)
insert into public.users (email, full_name, phone, role) 
values ('admin@shramiksetu.com', 'System Admin', '+91 9999999999', 'admin')
on conflict (email) do nothing;
```
