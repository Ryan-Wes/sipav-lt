-- =============================================================================
-- Carga inicial de execuções — 23/09/2026
-- =============================================================================
-- A planilha de controle traz o estágio atual de cada torre (a última atividade
-- executada). Sem isso o sistema acha que a obra está no zero e bloqueia
-- praticamente toda programação.
--
-- Importar esse estágio significa criar registros em `execucao`. Só que esses
-- registros são uma INFERÊNCIA, não um apontamento:
--
--   · a data real de execução é desconhecida — entra a data da importação
--   · o encarregado é desconhecido — entra nulo
--   · as atividades anteriores da cadeia são deduzidas: se a torre está em
--     MONTAGEM, então escavação, reaterro e contrapeso já aconteceram
--
-- Por isso ganham a marca `carga_inicial`. Qualquer relatório de produtividade,
-- aderência ou curva de avanço tem que filtrar `where not carga_inicial`,
-- senão vai parecer que a obra inteira foi executada no dia da importação.
-- =============================================================================

alter table execucao add column if not exists carga_inicial boolean not null default false;

create index if not exists execucao_carga_inicial_idx
  on execucao (torre_id) where carga_inicial;

comment on column execucao.carga_inicial is
  'Execução inferida do estágio da planilha de controle, não apontada em campo. '
  'Data e encarregado não são reais. Excluir de métricas de produtividade.';

-- -----------------------------------------------------------------------------
-- Visão só do que foi apontado de verdade, para os relatórios futuros
-- -----------------------------------------------------------------------------
create or replace view execucao_real with (security_invoker = true) as
select * from execucao where not carga_inicial;

select count(*) filter (where carga_inicial)     as carga_inicial,
       count(*) filter (where not carga_inicial) as apontadas
from execucao;
