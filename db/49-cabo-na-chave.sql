-- =============================================================================
-- O cabo entra na chave da programação — 08/10/2026
-- =============================================================================
-- Nos trechos com para-raio e OPGW, a mesma torre recebe, no mesmo dia e com o mesmo
-- encarregado, a mesma atividade duas vezes: uma no para-raio e outra no OPGW (instalação
-- de bandolas, lançamento do pilotinho, ancoragem, nivelamento). São dois serviços. A
-- trava da db/29 (torre + atividade + data + encarregado) os tratava como duplicata e
-- recusava o segundo, e foi o que barrou 109 programações na importação da planilha
-- de 05/10.
--
-- Agora o cabo também faz parte da chave. Continua impossível lançar a MESMA pessoa duas
-- vezes no mesmo serviço, no mesmo dia, na mesma torre e no mesmo cabo.
--
-- Dois índices em vez de um porque o cabo é um enum, e converter enum para texto não
-- serve em índice (a função não é imutável). Um vale para programação sem cabo, o
-- outro para programação com cabo. O nome do primeiro é o de sempre, e é por ele que
-- a tela reconhece o erro de duplicata.
--
-- Só afrouxa a regra: nenhuma programação que existe deixa de valer.
--
-- Idempotente.
-- =============================================================================

drop index if exists programacao_sem_duplicata;
drop index if exists programacao_sem_duplicata_cabo;

-- Sem cabo (todas as atividades que não são de cabo)
create unique index programacao_sem_duplicata
  on programacao (
    torre_id,
    atividade_id,
    data,
    coalesce(encarregado_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where cabo is null;

-- Com cabo: o mesmo serviço em para-raio e em OPGW são linhas diferentes
create unique index programacao_sem_duplicata_cabo
  on programacao (
    torre_id,
    atividade_id,
    data,
    coalesce(encarregado_id, '00000000-0000-0000-0000-000000000000'::uuid),
    cabo
  )
  where cabo is not null;

insert into migracao (numero, arquivo)
values (49, '49-cabo-na-chave.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que listar os dois índices, cada um com o seu "where".
-- =============================================================================

select indexname, indexdef
from pg_indexes
where tablename = 'programacao'
  and indexname in ('programacao_sem_duplicata', 'programacao_sem_duplicata_cabo');