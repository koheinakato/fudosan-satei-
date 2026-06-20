-- 案件テーブル
create table cases (
  id uuid default gen_random_uuid() primary key,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- 顧客情報
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,

  -- 物件情報（顧客入力）
  property_address text not null,
  property_type text not null check (property_type in ('house', 'mansion', 'land')),
  assessment_purpose text not null check (assessment_purpose in ('sell', 'inherit', 'other')),

  -- 登記・地番情報（弊社・顧客入力）
  parcel_count integer,
  lot_numbers jsonb,

  -- 料金
  base_price integer,
  additional_price integer,
  total_price integer,

  -- Stripe
  stripe_customer_id text,
  stripe_setup_intent_id text,
  stripe_payment_intent_id text,

  -- 完了
  report_url text,
  admin_notes text
);

-- updated_at 自動更新
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cases_updated_at
  before update on cases
  for each row execute function update_updated_at();

-- RLS: 管理者のみ全件アクセス（顧客はAPIルート経由）
alter table cases enable row level security;

create policy "Service role full access" on cases
  using (true)
  with check (true);
