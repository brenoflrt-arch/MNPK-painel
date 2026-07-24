-- Adiciona campo de observacao aos itens de estoque.
-- Rodar no SQL Editor do Supabase Studio, depois de ja ter rodado supabase_estoque.sql.

alter table estoque_itens add column if not exists observacao text;
