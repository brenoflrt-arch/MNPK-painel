-- Tabelas do dashboard de Controle de Armazem de Cafe.
-- Rodar no SQL Editor do Supabase Studio (projeto wmtqhzgznpbumggowpnq).
-- Substitui o uso deste banco pelo antigo painel de trading (tabelas antigas
-- tentativas_2/operacoes_reais/etc. podem continuar existindo, so nao sao mais lidas pelo site).

create table if not exists armazem_lotes (
  id bigint generated always as identity primary key,
  lote integer not null,
  nome text not null,
  referencia text not null check (referencia in ('Entrada', 'Saida')),
  data date not null,
  peso_balanca numeric,
  criado_em timestamptz not null default now()
);

create table if not exists armazem_bags (
  id bigint generated always as identity primary key,
  lote_id bigint not null references armazem_lotes(id) on delete cascade,
  peso numeric not null,
  criado_em timestamptz not null default now()
);

alter table armazem_lotes enable row level security;
alter table armazem_bags enable row level security;

-- So usuarios logados (mesmo login ja usado na "Area restrita" do site) podem
-- ler ou escrever. Sem login, a tabela fica invisivel/inacessivel via anon key.
create policy "armazem_lotes_select_logado" on armazem_lotes
  for select using (auth.role() = 'authenticated');
create policy "armazem_lotes_insert_logado" on armazem_lotes
  for insert with check (auth.role() = 'authenticated');
create policy "armazem_lotes_update_logado" on armazem_lotes
  for update using (auth.role() = 'authenticated');
create policy "armazem_lotes_delete_logado" on armazem_lotes
  for delete using (auth.role() = 'authenticated');

create policy "armazem_bags_select_logado" on armazem_bags
  for select using (auth.role() = 'authenticated');
create policy "armazem_bags_insert_logado" on armazem_bags
  for insert with check (auth.role() = 'authenticated');
create policy "armazem_bags_update_logado" on armazem_bags
  for update using (auth.role() = 'authenticated');
create policy "armazem_bags_delete_logado" on armazem_bags
  for delete using (auth.role() = 'authenticated');
