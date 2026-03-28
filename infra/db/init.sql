create table if not exists catalog_import (
  id bigserial primary key,
  import_month varchar(7) not null,
  csp varchar(32) not null,
  schema_name varchar(64) not null,
  source_file text,
  checksum text,
  row_count integer not null default 0,
  imported_at timestamptz not null default now()
);

create table if not exists pricing_item (
  id bigserial primary key,
  import_id bigint not null references catalog_import(id) on delete cascade,
  csp varchar(32) not null,
  catalogitemnumber text not null,
  title text,
  csoshortname text,
  description text,
  commercialunitprice numeric(18,6),
  commercialunitofissue text,
  customerunitprice numeric(18,6),
  customerunitofissue text,
  discountpremiumfee text
);

create index if not exists idx_pricing_item_csp_catalog on pricing_item(csp, catalogitemnumber);

create table if not exists parent_service (
  id bigserial primary key,
  import_id bigint not null references catalog_import(id) on delete cascade,
  csp varchar(32) not null,
  catalogitemnumber text,
  csoparentservice text,
  csoshortname text,
  category text,
  impactlevel text,
  newservice boolean
);

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

create table if not exists change_log (
  id bigserial primary key,
  csp varchar(32) not null,
  catalogitemnumber text not null,
  month_from varchar(7) not null,
  month_to varchar(7) not null,
  change_type varchar(16) not null,
  comm_delta numeric(18,6),
  comm_delta_pct numeric(10,4),
  cust_delta numeric(18,6),
  cust_delta_pct numeric(10,4),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
