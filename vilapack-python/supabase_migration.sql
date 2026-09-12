-- VilaPack Python: additive migration for an existing Supabase project.
-- Run once in the project's SQL Editor after reviewing it and exporting a backup.
-- Re-running is safe. Existing rows, grants and RLS policies are preserved.
-- The Python application NEVER executes this migration automatically.
--
-- RPC contract: public.vila_mutate(operations jsonb) -> jsonb array, one result
-- per operation. Example: [{"op":"insert","table":"clientes","data":{"nome":"A"}}].
-- update/delete require "id". All operations execute within ONE PostgreSQL
-- transaction. An invalid operation or RLS rejection rolls back the whole batch.
-- SECURITY INVOKER uses the JWT of the signed-in user, never an admin bypass.

begin;

-- Definitions are only used when a table does not exist yet. Existing production
-- tables are untouched except for the explicitly additive columns below.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
  nome text not null, telefone text, email text, cpf text, representante text
);
create table if not exists public.materia_primas (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
  tipo text not null, valor numeric(14,2) not null, data text not null, observacao text
);
create table if not exists public.transacoes (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
  cliente text not null, valor numeric(14,2) not null, tipo text not null,
  categoria text, data text not null, produto text, custo_materia_prima numeric(14,2) default 0
);
create table if not exists public.contas_receber (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
  descricao text not null, cliente text, vencimento date not null, valor numeric(14,2) not null,
  status text default 'pendente', forma_pagamento text default 'dinheiro',
  parcelas integer default 1, parcela_atual integer default 1, grupo_parcela uuid
);
create table if not exists public.contas_pagar (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
  descricao text not null, fornecedor text, vencimento date not null, valor numeric(14,2) not null,
  status text default 'pendente', forma_pagamento text default 'dinheiro',
  parcelas integer default 1, parcela_atual integer default 1, grupo_parcela uuid
);
create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
  titulo text not null, valor numeric(14,2) not null, mes text
);
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(), nome text not null, email text not null,
  role text not null default 'funcionario', paginas_permitidas jsonb default '[]',
  acoes_restritas jsonb default '{}'
);

alter table public.transacoes add column if not exists source_table text;
alter table public.transacoes add column if not exists source_id uuid;
alter table public.transacoes add column if not exists produto text;
alter table public.transacoes add column if not exists custo_materia_prima numeric(14,2) default 0;
alter table public.contas_receber add column if not exists parcelas integer default 1;
alter table public.contas_receber add column if not exists parcela_atual integer default 1;
alter table public.contas_receber add column if not exists grupo_parcela uuid;
alter table public.contas_pagar add column if not exists parcelas integer default 1;
alter table public.contas_pagar add column if not exists parcela_atual integer default 1;
alter table public.contas_pagar add column if not exists grupo_parcela uuid;
alter table public.perfis add column if not exists acoes_restritas jsonb default '{}';

-- Reconcile legacy automatic records ONE TO ONE, without deleting or changing
-- amounts. Legacy records had no actual foreign key. Where several identical
-- rows exist, creation order and UUID produce a deterministic pairing. Review
-- such historical duplicates separately: their original identity is unknowable.
with sources as (
  select 'materia_primas'::text as source_table, id as source_id,
    'Matéria-prima: ' || tipo as cliente, 'saida'::text as tipo,
    'Matéria-prima'::text as categoria, left(data::text,7) as mes, valor, created_at
  from public.materia_primas
  union all
  select 'contas_receber', id, 'Conta a receber: ' || descricao, 'entrada',
    'Contas a Receber', left(vencimento::text,7), valor, created_at from public.contas_receber
  union all
  select 'contas_pagar', id, 'Conta a pagar: ' || descricao, 'saida',
    'Contas a Pagar', left(vencimento::text,7), valor, created_at from public.contas_pagar
), ranked_sources as (
  select s.*, row_number() over (
    partition by cliente,tipo,categoria,mes,valor order by created_at nulls last,source_id
  ) as occurrence from sources s
  where not exists (select 1 from public.transacoes t where t.source_table=s.source_table and t.source_id=s.source_id)
), ranked_transactions as (
  select t.*, row_number() over (
    partition by cliente,tipo,categoria,left(data::text,7),valor order by created_at nulls last,id
  ) as occurrence from public.transacoes t where source_id is null and source_table is null
)
update public.transacoes t set source_table=s.source_table, source_id=s.source_id
from ranked_sources s join ranked_transactions x on x.cliente=s.cliente and x.tipo=s.tipo
  and x.categoria=s.categoria and left(x.data::text,7)=s.mes and x.valor=s.valor and x.occurrence=s.occurrence
where t.id=x.id;

create unique index if not exists vila_transacoes_source_unique
  on public.transacoes(source_table, source_id) where source_id is not null;

-- Enable RLS without creating permissive policies. Existing project policies
-- remain authoritative. A fresh project needs deliberately configured policies
-- for its own team before users can access these tables.
alter table public.clientes enable row level security;
alter table public.materia_primas enable row level security;
alter table public.transacoes enable row level security;
alter table public.contas_receber enable row level security;
alter table public.contas_pagar enable row level security;
alter table public.metas enable row level security;
alter table public.perfis enable row level security;

create or replace function public.vila_mutate(operations jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  operation jsonb;
  record_data jsonb;
  table_name text;
  action_name text;
  row_id uuid;
  allowed text[];
  field_name text;
  columns_sql text;
  values_sql text;
  set_sql text;
  result_row jsonb;
  results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sessão de usuário obrigatória' using errcode = '42501';
  end if;
  if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 20000 then
    raise exception 'Lote inválido ou acima de 20000 operações';
  end if;
  -- Serialize compound operations. PostgreSQL still applies RLS to every row.
  perform pg_advisory_xact_lock(hashtext('vilapack_compound_mutation'));
  for operation in select value from jsonb_array_elements(operations) loop
    table_name := operation->>'table';
    action_name := operation->>'op';
    allowed := case table_name
      when 'clientes' then array['nome','telefone','email','cpf','representante']
      when 'materia_primas' then array['tipo','valor','data','observacao']
      when 'transacoes' then array['cliente','valor','tipo','categoria','data','produto','custo_materia_prima','source_table','source_id']
      when 'contas_receber' then array['descricao','cliente','vencimento','valor','status','forma_pagamento','parcelas','parcela_atual','grupo_parcela']
      when 'contas_pagar' then array['descricao','fornecedor','vencimento','valor','status','forma_pagamento','parcelas','parcela_atual','grupo_parcela']
      when 'metas' then array['titulo','valor','mes']
      else null end;
    if allowed is null or action_name is null or action_name not in ('insert','update','delete') then
      raise exception 'Tabela ou operação não permitida';
    end if;
    result_row := null;
    if action_name = 'delete' then
      row_id := (operation->>'id')::uuid;
      execute format('delete from public.%I as target where id=$1 returning to_jsonb(target.*)', table_name)
        into result_row using row_id;
      if result_row is null then
        raise exception 'Registro não encontrado ou sem permissão' using errcode='42501';
      end if;
      results := results || jsonb_build_array(null);
      continue;
    end if;
    record_data := operation->'data';
    if record_data is null or jsonb_typeof(record_data) <> 'object' then
      raise exception 'Dados inválidos';
    end if;
    -- Only insert accepts a caller-generated UUID. Updates cannot change IDs.
    if action_name = 'insert' then
      allowed := allowed || array['id'];
      record_data := record_data || jsonb_build_object('id', coalesce((record_data->>'id')::uuid, gen_random_uuid()));
    else
      row_id := (operation->>'id')::uuid;
      record_data := record_data - 'id' - 'created_at';
    end if;
    for field_name in select jsonb_object_keys(record_data) loop
      if not (field_name = any(allowed)) then
        raise exception 'Campo não permitido: %', field_name;
      end if;
    end loop;
    if table_name = 'transacoes' and record_data->>'source_id' is not null then
      if record_data->>'source_table' is null or record_data->>'source_table' not in ('materia_primas','contas_receber','contas_pagar') then
        raise exception 'Origem de transação inválida';
      end if;
      execute format('select to_jsonb(s.*) from public.%I s where id=$1', record_data->>'source_table')
        into result_row using (record_data->>'source_id')::uuid;
      if result_row is null then
        raise exception 'Origem não encontrada ou sem permissão' using errcode='42501';
      end if;
      result_row := null;
    end if;
    select string_agg(format('%I', k), ',' order by k),
           string_agg(format('typed.%I', k), ',' order by k),
           string_agg(format('%I=typed.%I', k, k), ',' order by k)
      into columns_sql, values_sql, set_sql from jsonb_object_keys(record_data) k;
    if columns_sql is null then
      raise exception 'Registro vazio';
    end if;
    if action_name = 'insert' then
      execute format('insert into public.%I as target (%s) select %s from jsonb_populate_record(null::public.%I,$1) typed returning to_jsonb(target.*)',
        table_name, columns_sql, values_sql, table_name)
        into result_row using record_data;
    else
      execute format('update public.%I as target set %s from jsonb_populate_record(null::public.%I,$1) typed where target.id=$2 returning to_jsonb(target.*)',
        table_name, set_sql, table_name)
        into result_row using record_data, row_id;
    end if;
    if result_row is null then
      raise exception 'Registro não encontrado ou sem permissão' using errcode='42501';
    end if;
    results := results || jsonb_build_array(result_row);
  end loop;
  return results;
end;
$function$;

revoke all on function public.vila_mutate(jsonb) from public;
revoke all on function public.vila_mutate(jsonb) from anon;
grant execute on function public.vila_mutate(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
