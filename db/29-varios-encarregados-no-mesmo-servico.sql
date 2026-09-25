-- =============================================================================
-- Vários encarregados na mesma atividade, torre e dia — 25/09/2026
-- =============================================================================
-- Wesley: "às vezes eles dividem a atividade naquele dia".
--
-- A tabela nasceu com `unique (torre_id, atividade_id, data)` e o comentário
-- "mesma atividade, mesma torre, mesmo dia, duas vezes: não faz sentido". Fazia
-- sentido para uma equipe por serviço; não faz para duas equipes dividindo a
-- mesma torre no mesmo dia, que é o que acontece em campo.
--
-- A trava não sai, muda de forma: o encarregado entra na chave. Continua
-- impossível lançar a MESMA pessoa duas vezes no mesmo serviço, no mesmo dia, na
-- mesma torre — que é o engano que a regra original queria pegar.
--
-- Programação sem encarregado é tratada como uma só: duas linhas "sem
-- encarregado" no mesmo serviço e dia continuam sendo duplicata. Por isso o
-- índice usa coalesce com um uuid sentinela, em vez de `nulls not distinct` —
-- funciona em qualquer versão do Postgres.
-- =============================================================================


-- =============================================================================
-- 0. PRÉ-VOO — nada aqui altera dado
-- =============================================================================
-- Se já existisse duplicata a criação do índice falharia. Não deve haver, já que
-- a trava antiga era mais rígida, mas conferir custa nada.
select
  t.identificador as torre,
  a.nome          as atividade,
  p.data,
  coalesce(e.nome, '— sem encarregado —') as encarregado,
  count(*)        as vezes
from programacao p
join torre t     on t.id = p.torre_id
join atividade a on a.id = p.atividade_id
left join encarregado e on e.id = p.encarregado_id
group by t.identificador, a.nome, p.data, e.nome
having count(*) > 1;


-- =============================================================================
-- 1. Troca a chave
-- =============================================================================
alter table programacao
  drop constraint if exists programacao_torre_id_atividade_id_data_key;

-- Sentinela para o encarregado nulo. Em índice único, dois NULL são valores
-- distintos por padrão — sem isto, "sem encarregado" poderia ser lançado
-- infinitas vezes no mesmo serviço.
create unique index if not exists programacao_sem_duplicata
  on programacao (
    torre_id,
    atividade_id,
    data,
    coalesce(encarregado_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

comment on index programacao_sem_duplicata is
  'Duas equipes podem dividir a mesma torre no mesmo dia; a mesma equipe não pode '
  'ser lançada duas vezes no mesmo serviço.';


-- =============================================================================
-- Conferência
-- =============================================================================
select
  i.indexname,
  i.indexdef
from pg_indexes i
where i.tablename = 'programacao'
  and i.indexname in ('programacao_sem_duplicata', 'programacao_torre_id_atividade_id_data_key');
