# Holiday Tracker

A minimal team holiday tracking app backed by Supabase (Postgres).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run locally:
   ```bash
   npm start
   ```

## Supabase Schema

Run this in your Supabase SQL editor:

```sql
create table employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color_idx integer not null default 0,
  created_at timestamptz default now()
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days integer not null,
  note text,
  created_at timestamptz default now()
);

-- Disable RLS for simplicity (or configure policies as needed)
alter table employees disable row level security;
alter table holidays disable row level security;
```

## Stack
- React 18
- Supabase REST API (no SDK)
