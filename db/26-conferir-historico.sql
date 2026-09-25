-- =============================================================================
-- Conferência do histórico — 25/09/2026
-- =============================================================================
-- Wesley: "não estou vendo registro do que a Hanna ou o Alessandro alteraram,
-- só vejo minhas alterações, e quando vou para outro trecho somem os registros".
--
-- As duas frases descrevem a mesma causa. O botão Histórico do cabeçalho filtrava
-- pelo trecho aberto, e a equipe se divide por trecho — então cada um enxergava
-- só o próprio trabalho. Corrigido no front: agora o padrão é a obra inteira,
-- com filtro por pessoa e por trecho.
--
-- Este arquivo não altera nada. Serve para confirmar, direto no banco, que o
-- registro dos outros sempre existiu.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Quem mexeu, quanto, e em que trechos
-- -----------------------------------------------------------------------------
select
  h.quem_nome                        as pessoa,
  count(*)                           as alteracoes,
  count(*) filter (where h.acao = 'CRIOU')   as criou,
  count(*) filter (where h.acao = 'ALTEROU') as alterou,
  count(*) filter (where h.acao = 'REMOVEU') as removeu,
  count(*) filter (where h.acao = 'ESTAGIO') as corrigiu_estagio,
  string_agg(distinct t.nome, ', ' order by t.nome) as trechos,
  min(h.quando)                      as primeira,
  max(h.quando)                      as ultima
from programacao_historico h
left join trecho t on t.id = h.trecho_id
group by h.quem_nome
order by count(*) desc;


-- -----------------------------------------------------------------------------
-- 2. As 40 últimas, da obra inteira
-- -----------------------------------------------------------------------------
select
  to_char(h.quando at time zone 'America/Bahia', 'DD/MM HH24:MI') as quando,
  h.quem_nome      as quem,
  h.acao,
  t.nome           as trecho,
  h.torre_identificador as torre,
  h.atividade_nome as atividade,
  h.data           as programado_para,
  h.encarregado_nome as encarregado
from programacao_historico h
left join trecho t on t.id = h.trecho_id
order by h.quando desc
limit 40;


-- -----------------------------------------------------------------------------
-- 3. Sanidade: linha de histórico sem trecho não aparece em filtro nenhum
-- -----------------------------------------------------------------------------
-- Acontece se a torre tiver sido apagada antes do registro ser lido. Se vier
-- número aqui, há histórico invisível na visão por trecho — mais um motivo para
-- o padrão ser a obra inteira.
select count(*) as historico_sem_trecho
from programacao_historico
where trecho_id is null;
