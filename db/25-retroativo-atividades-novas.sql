-- =============================================================================
-- Carga inicial das atividades que nasceram depois dela — 25/09/2026
-- =============================================================================
-- Sintoma: torre com estágio LANÇAMENTO CONDUTOR 100% acusa bloqueio por
-- GIRO E PRUMO, INSTALAÇÃO DE BANDOLAS E ISOLADORES e LANÇAMENTO DO PILOTO DO
-- CONDUTOR — etapas que vêm ANTES do estágio em que ela está.
--
-- Causa: a importação marca como executada a atividade informada e todas as
-- obrigatórias anteriores da cadeia. Isso rodou quando a cadeia tinha 28
-- atividades. As migrações 21, 23 e 24 criaram atividades NOVAS no meio da
-- cadeia, e para elas não existe execução de carga inicial em torre nenhuma —
-- elas não existiam no dia da carga.
--
-- Como o bloqueio é transitivo, qualquer torre que já passou desses pontos
-- passou a acusar pendência de algo que ela obviamente já fez.
--
-- Correção: para cada atividade obrigatória criada depois da carga, gravar a
-- execução retroativa em toda torre que comprovadamente já passou dela — isto
-- é, que tem execução de alguma atividade de ordem maior.
--
-- A data copiada é a da última execução da própria torre, não a de hoje: assim
-- a linha do tempo dela continua coerente.
-- =============================================================================


-- =============================================================================
-- 0. PRÉ-VOO — quantas torres estão travadas por isso
-- =============================================================================
select
  nova.ordem_execucao as ordem,
  nova.nome           as atividade_sem_carga,
  count(*)            as torres_que_ja_passaram
from torre t
join trecho tr on tr.id = t.trecho_id
cross join atividade nova
where tr.obra_id = (select id from obra where codigo = 'SD')
  and nova.obra_id = tr.obra_id
  and nova.obrigatoria
  and nova.nome in (
    'GIRO E PRUMO',
    'ANCORAGEM OPGW / PARA-RAIO',
    'INSTALAÇÃO DE BANDOLAS E ISOLADORES',
    'LANÇAMENTO DO PILOTO DO CONDUTOR',
    'ANCORAGEM DOS CONDUTORES'
  )
  and exists (
    select 1 from execucao e
    join atividade a on a.id = e.atividade_id
    where e.torre_id = t.id and a.ordem_execucao > nova.ordem_execucao
  )
  and not exists (
    select 1 from execucao e2
    where e2.torre_id = t.id and e2.atividade_id = nova.id
  )
group by nova.ordem_execucao, nova.nome
order by nova.ordem_execucao;


-- =============================================================================
-- 1. Grava as execuções retroativas
-- =============================================================================
insert into execucao (torre_id, atividade_id, encarregado_id, data_execucao,
                      percentual, carga_inicial, observacao)
select
  t.id,
  nova.id,
  null,
  coalesce(ult.quando, current_date),
  100,
  true,
  'Retroativo 25/09/2026: atividade criada depois da carga inicial'
from torre t
join trecho tr on tr.id = t.trecho_id
cross join atividade nova
left join lateral (
  select max(e.data_execucao) as quando
  from execucao e
  where e.torre_id = t.id
) ult on true
where tr.obra_id = (select id from obra where codigo = 'SD')
  and nova.obra_id = tr.obra_id
  and nova.obrigatoria
  and nova.nome in (
    'GIRO E PRUMO',
    'ANCORAGEM OPGW / PARA-RAIO',
    'INSTALAÇÃO DE BANDOLAS E ISOLADORES',
    'LANÇAMENTO DO PILOTO DO CONDUTOR',
    'ANCORAGEM DOS CONDUTORES'
  )
  -- Só onde há prova de que a torre já passou: execução de ordem maior.
  -- Sem isto, marcaríamos como feito o que ainda não foi.
  and exists (
    select 1 from execucao e
    join atividade a on a.id = e.atividade_id
    where e.torre_id = t.id and a.ordem_execucao > nova.ordem_execucao
  )
  -- Idempotente
  and not exists (
    select 1 from execucao e2
    where e2.torre_id = t.id and e2.atividade_id = nova.id
  );


-- =============================================================================
-- Conferência — a torre do relato deve sair sem pendência indevida
-- =============================================================================
-- Troque a torre e o trecho para conferir outra.
with alvo as (
  select ts.torre_id, ts.identificador, ts.ultima_atividade as estagio
  from torre_situacao ts
  join trecho t on t.id = ts.trecho_id
  where t.nome = 'Buritirama - Barra'
    and ts.identificador = '2/1'
)
select
  alvo.identificador as torre,
  alvo.estagio,
  a.ordem_execucao   as ordem,
  a.nome             as atividade,
  coalesce(
    motivo_bloqueio_programacao(alvo.torre_id, a.id, current_date),
    '— liberada —'
  ) as situacao
from alvo
cross join atividade a
where a.obra_id = (select id from obra where codigo = 'SD')
  and a.ativa
order by a.ordem_execucao;
