-- جدول المصاريف التشغيلية — الفواتير والمستحقات وعمولات المنصات
-- يُطبَّق مرة واحدة على مشروع Supabase (SQL Editor أو supabase db push)

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  property_id text not null default 'p1',
  category text not null,
  amount numeric not null default 0,
  date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'due',
  note text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.expenses is 'المصاريف التشغيلية — الفواتير والمستحقات وعمولات المنصات';

create index expenses_status_due_idx on public.expenses (status, due_date);

alter table public.expenses enable row level security;

-- المالك المسجّل دخوله فقط؛ لا سياسة لدور anon فبيانات المصاريف غير متاحة للزوار
create policy owner_read_expenses on public.expenses
  for select to authenticated using (true);

create policy owner_insert_expenses on public.expenses
  for insert to authenticated with check (true);

create policy owner_update_expenses on public.expenses
  for update to authenticated using (true) with check (true);

create policy owner_delete_expenses on public.expenses
  for delete to authenticated using (true);
