-- =============================================================
-- CloudPrism Database Schema
-- NOTE: raw CSV column 'customerunitprice'/'customerunitofissue'
--       are stored as 'jwccunitprice'/'jwccunitofissue'
-- =============================================================

-- Import audit log
create table if not exists catalog_import (
  id bigserial primary key,
  import_month varchar(7) not null,
  csp varchar(32) not null,
  schema_name varchar(64) not null,
  source_file text,
  checksum text,
  row_count integer not null default 0,
  status varchar(16) not null default 'pending', -- pending|processing|done|error
  error_message text,
  imported_by text,
  imported_at timestamptz not null default now()
);

-- Pricing items (maps commercialUnitPrice→list_unit_price, customerunitprice→jwccunitprice)
create table if not exists pricing_item (
  id bigserial primary key,
  import_id bigint not null references catalog_import(id) on delete cascade,
  csp varchar(32) not null,
  catalogitemnumber text not null,
  title text,
  csoshortname text,
  description text,
  -- Commercial pricing (FinOps FOCUS: ListUnitPrice / PricingUnit)
  list_unit_price numeric(18,6),          -- was commercialunitprice
  pricing_unit text,                       -- was commercialunitofissue
  -- JWCC pricing (FinOps FOCUS: ContractedUnitPrice)
  jwccunitprice numeric(18,6),          -- was customerunitprice
  jwccunitofissue text,                -- was customerunitofissue
  -- Legacy columns retained for raw ingest compatibility
  commercialunitprice numeric(18,6),
  commercialunitofissue text,
  customerunitprice numeric(18,6),
  customerunitofissue text,
  discountpremiumfee text,
  -- FinOps FOCUS 1.3 categorization
  service_category text,
  focus_category text
);

create index if not exists idx_pricing_item_csp_catalog on pricing_item(csp, catalogitemnumber);
create index if not exists idx_pricing_item_csp on pricing_item(csp);

-- Parent service (source-of-truth for title lookup and category)
create table if not exists parent_service (
  id bigserial primary key,
  import_id bigint not null references catalog_import(id) on delete cascade,
  csp varchar(32) not null,
  catalogitemnumber text,
  csoparentservice text,
  csoshortname text,
  category text,
  focus_category text,   -- normalized FinOps FOCUS 1.3 category
  impactlevel text,
  newservice boolean
);

create index if not exists idx_parent_service_shortname on parent_service(csp, csoshortname);

-- Exception items
create table if not exists exception_item (
  id bigserial primary key,
  import_id bigint not null references catalog_import(id) on delete cascade,
  csp varchar(32) not null,
  exceptionuniqueid text,
  csoshortname text,
  impactlevel text,
  exceptionstatus text,
  exceptionpwsrequirement text,
  exceptionbasisforrequest text,
  exceptionsecurity text
);

create index if not exists idx_exception_item_csp on exception_item(csp);
create index if not exists idx_exception_item_status on exception_item(exceptionstatus);

-- Exception field-level change log (diff between imports)
create table if not exists exception_change_log (
  id bigserial primary key,
  import_id bigint not null references catalog_import(id),
  csp varchar(32) not null,
  exceptionuniqueid text not null,
  field_name text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

-- Pricing change log (delta between import months)
create table if not exists change_log (
  id bigserial primary key,
  csp varchar(32) not null,
  catalogitemnumber text not null,
  month_from varchar(7) not null,
  month_to varchar(7) not null,
  change_type varchar(16) not null,  -- new|price_change|removed
  comm_delta numeric(18,6),
  comm_delta_pct numeric(10,4),
  jwcc_delta numeric(18,6),          -- was cust_delta
  jwcc_delta_pct numeric(10,4),      -- was cust_delta_pct
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Users (auth) -- designed to be CAC/PIV-swappable later
create table if not exists users (
  id serial primary key,
  username text unique not null,
  password_hash text not null,
  role text not null default 'viewer',  -- 'admin' | 'viewer'
  display_name text,
  created_at timestamptz not null default now(),
  last_login timestamptz
);

-- Seed default admin user (password: CloudPrism_Admin1!)
-- Hash generated with bcrypt cost=12; change immediately after first deploy
insert into users (username, password_hash, role, display_name)
values (
  'admin',
  '$2b$12$placeholder_replace_with_bcrypt_hash',
  'admin',
  'CloudPrism Administrator'
) on conflict (username) do nothing;
