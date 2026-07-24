-- Tabelas da aba Estoque do dashboard de Controle de Armazem de Cafe.
-- Rodar no SQL Editor do Supabase Studio, depois de ja ter rodado
-- supabase_armazem_cafe.sql.

create table if not exists estoque_itens (
  id bigint generated always as identity primary key,
  ap_percentual numeric not null,
  custo numeric not null,
  criado_em timestamptz not null default now()
);

create table if not exists estoque_bags (
  id bigint generated always as identity primary key,
  item_id bigint not null references estoque_itens(id) on delete cascade,
  peso numeric not null,
  criado_em timestamptz not null default now()
);

alter table estoque_itens enable row level security;
alter table estoque_bags enable row level security;

create policy "estoque_itens_select_logado" on estoque_itens
  for select using (auth.role() = 'authenticated');
create policy "estoque_itens_insert_logado" on estoque_itens
  for insert with check (auth.role() = 'authenticated');
create policy "estoque_itens_update_logado" on estoque_itens
  for update using (auth.role() = 'authenticated');
create policy "estoque_itens_delete_logado" on estoque_itens
  for delete using (auth.role() = 'authenticated');

create policy "estoque_bags_select_logado" on estoque_bags
  for select using (auth.role() = 'authenticated');
create policy "estoque_bags_insert_logado" on estoque_bags
  for insert with check (auth.role() = 'authenticated');
create policy "estoque_bags_update_logado" on estoque_bags
  for update using (auth.role() = 'authenticated');
create policy "estoque_bags_delete_logado" on estoque_bags
  for delete using (auth.role() = 'authenticated');
