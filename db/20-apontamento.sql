-- =============================================================================
-- Apontamento do executado — 24/09/2026
-- =============================================================================
-- Até aqui o sistema só planejava. O estágio das torres veio da importação da
-- planilha: uma foto do dia em que foi colada, não um registro que anda junto
-- com a obra.
--
-- A tabela `execucao` já existia desde o primeiro schema, mas só a importação
-- escrevia nela, sempre com carga_inicial = true. Agora o apontamento de campo
-- passa a escrever também, com carga_inicial = false — é a distinção que separa
-- o que foi inferido do que aconteceu de verdade.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Uma execução por programação
-- -----------------------------------------------------------------------------
-- Sem isso, dois cliques seguidos no botão de apontar gerariam duas execuções
-- para a mesma atividade, e a produtividade sairia dobrada.
create unique index if not exists execucao_programacao_unica
  on execucao (programacao_id) where programacao_id is not null;

-- -----------------------------------------------------------------------------
-- Visão de aderência: programado × executado
-- -----------------------------------------------------------------------------
-- É a pergunta que a coordenação faz toda semana: do que foi programado, quanto
-- saiu? E o que foi executado sem estar programado?
create or replace view aderencia with (security_invoker = true) as
select
  t.trecho_id,
  t.id                as torre_id,
  t.identificador     as torre,
  t.km,
  a.nome              as atividade,
  a.ordem_execucao,
  pr.id               as programacao_id,
  pr.data             as data_programada,
  enc_pr.nome         as encarregado_programado,
  ex.id               as execucao_id,
  ex.data_execucao,
  enc_ex.nome         as encarregado_executou,
  case
    when pr.id is null                       then 'EXECUTADO SEM PROGRAMAR'
    when ex.id is null                       then 'PENDENTE'
    when ex.data_execucao = pr.data          then 'NO PRAZO'
    when ex.data_execucao < pr.data          then 'ADIANTADO'
    else                                          'ATRASADO'
  end                 as situacao,
  case when ex.id is not null and pr.id is not null
       then ex.data_execucao - pr.data end   as dias_de_desvio
from torre t
join atividade a on true
left join programacao pr
       on pr.torre_id = t.id and pr.atividade_id = a.id
left join execucao ex
       on ex.torre_id = t.id and ex.atividade_id = a.id and not ex.carga_inicial
left join encarregado enc_pr on enc_pr.id = pr.encarregado_id
left join encarregado enc_ex on enc_ex.id = ex.encarregado_id
where pr.id is not null or ex.id is not null;

comment on view aderencia is
  'Programado x executado por torre e atividade. Ignora a carga inicial da '
  'planilha, que não é apontamento de campo.';

-- -----------------------------------------------------------------------------
-- Produtividade por encarregado
-- -----------------------------------------------------------------------------
create or replace view produtividade with (security_invoker = true) as
select
  t.trecho_id,
  e.id            as encarregado_id,
  e.nome          as encarregado,
  a.nome          as atividade,
  ex.data_execucao,
  count(*)        as torres,
  sum(t.km)       as km
from execucao ex
join torre t       on t.id = ex.torre_id
join atividade a   on a.id = ex.atividade_id
join encarregado e on e.id = ex.encarregado_id
where not ex.carga_inicial
group by t.trecho_id, e.id, e.nome, a.nome, ex.data_execucao;

comment on view produtividade is
  'O que cada encarregado executou, por atividade e por dia. Só apontamento '
  'de campo — a carga inicial da planilha fica de fora.';

select
  count(*) filter (where carga_inicial)     as inferidas_da_planilha,
  count(*) filter (where not carga_inicial) as apontadas_em_campo
from execucao;
