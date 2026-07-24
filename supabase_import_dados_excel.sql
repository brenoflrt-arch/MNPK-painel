-- Importa os 5 lotes e os pesos individuais dos bags que ja estavam na planilha
-- "Controle Armazem Cafe.xlsx" (abas Dados + Peso dos Bags) para o novo dashboard.
-- Rodar no SQL Editor do Supabase Studio, DEPOIS de ja ter rodado o
-- supabase_armazem_cafe.sql (que cria as tabelas).

insert into armazem_lotes (lote, nome, referencia, data, peso_balanca) values
  (1, 'Henrique', 'Entrada', '2026-07-13', 17920),
  (2, 'Henrique', 'Saida',   '2026-07-21', 6050),
  (3, 'Henrique', 'Entrada', '2026-07-22', null),
  (4, 'Henrique', 'Entrada', '2026-07-23', null),
  (5, 'Henrique', 'Saida',   '2026-07-23', null);

insert into armazem_bags (lote_id, peso)
select id, unnest(array[1238,1273,1456,1294,1410,1144,1374,1492,1431,1140,1122,1255,1110,1004])
  from armazem_lotes where lote = 1
union all
select id, unnest(array[1004,1110.5,1151.5,1281.5,1482.5])
  from armazem_lotes where lote = 2
union all
select id, unnest(array[832,848.5,895.5,497.5,547])
  from armazem_lotes where lote = 3
union all
select id, unnest(array[1038,810,1267.5,1133.5,1190,1181.5,1115,652,1075])
  from armazem_lotes where lote = 4
union all
select id, unnest(array[547,497.5,895.5,848.5,831,1038,810,1267.5,1133.5,1190,1181.5,1115,652,1075])
  from armazem_lotes where lote = 5;
