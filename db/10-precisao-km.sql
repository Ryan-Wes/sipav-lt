-- =============================================================================
-- Precisão do km — 23/09/2026
-- =============================================================================
-- A planilha de controle traz km com até 5 casas (0,42059 · 0,54921 · 0,5115).
-- A coluna nasceu numeric(10,3) e arredondaria para 0,421 — erro pequeno por
-- torre, mas que se acumula no total de km programado do trecho.
--
-- A view torre_situacao lê essa coluna, e o Postgres não deixa alterar o tipo
-- de coluna usada por view. Então: derruba a view, altera, recria.
--
-- Idempotente.
-- =============================================================================

drop view if exists torre_situacao;

alter table torre alter column km type numeric(12,5);
alter table torre alter column km set default 0.40000;

-- -----------------------------------------------------------------------------
-- Recria a view (mesma definição do 08-canteiro.sql)
-- -----------------------------------------------------------------------------
create view torre_situacao with (security_invoker = true) as
select
  t.id                        as torre_id,
  t.trecho_id,
  t.identificador,
  t.ordem,
  t.km,
  ua.atividade_id             as ultima_atividade_id,
  ua.nome                     as ultima_atividade,
  ua.cor_fundo                as ultima_atividade_cor,
  ua.icone                    as ultima_atividade_icone,
  ua.data_execucao            as ultima_execucao_em,
  r.tipo                      as restricao_tipo,
  r.previsao_liberacao        as restricao_previsao,
  (r.id is not null)          as tem_restricao,
  t.canteiro_id,
  c.nome                      as canteiro
from torre t
left join canteiro c on c.id = t.canteiro_id
left join lateral (
  select a.id as atividade_id, a.nome, a.cor_fundo, a.icone, e.data_execucao
  from execucao e
  join atividade a on a.id = e.atividade_id
  where e.torre_id = t.id
  order by a.ordem_execucao desc, e.data_execucao desc
  limit 1
) ua on true
left join lateral (
  select id, tipo, previsao_liberacao
  from restricao
  where torre_id = t.id and data_liberacao is null
  order by data_inicio
  limit 1
) r on true;

-- Conferência
select numeric_precision, numeric_scale
from information_schema.columns
where table_name = 'torre' and column_name = 'km';
