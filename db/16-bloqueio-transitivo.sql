-- =============================================================================
-- Bloqueio de precedência: passa a percorrer a cadeia inteira — 23/09/2026
-- =============================================================================
-- A versão anterior checava só o pré-requisito IMEDIATO. Numa torre sem nada
-- executado, pedir o lançamento do OPGW reclamava apenas do "lançamento do
-- piloto", escondendo as outras treze atividades que faltavam. Pior: dava a
-- impressão de que a regra ligava e desligava conforme a atividade escolhida.
--
-- Agora a função sobe toda a árvore de dependências e lista tudo que está
-- pendente, em ordem de execução.
--
-- Isso não cria travamento: nenhuma atividade obrigatória depende de atividade
-- condicional, então a cadeia de uma obrigatória só atravessa obrigatórias —
-- que são exatamente as que a carga inicial marca a partir do estágio da
-- planilha.
--
-- Idempotente.
-- =============================================================================

create or replace function motivo_bloqueio_programacao(
  p_torre_id     uuid,
  p_atividade_id uuid,
  p_data         date
) returns text
language plpgsql stable as $$
declare
  v_restricao record;
  v_pendente  text;
begin
  -- 1. Restrição ativa na torre
  select tipo, previsao_liberacao into v_restricao
  from restricao
  where torre_id = p_torre_id and data_liberacao is null
  order by data_inicio
  limit 1;

  if found then
    return format('Torre com restrição %s em aberto%s',
      lower(v_restricao.tipo::text),
      coalesce(' (previsão de liberação: ' ||
        to_char(v_restricao.previsao_liberacao, 'DD/MM/YYYY') || ')', ''));
  end if;

  -- 2. Toda a cadeia de pré-requisitos, não só o degrau anterior.
  --    UNION (e não UNION ALL) já elimina repetição e protege de ciclo.
  with recursive necessarias as (
    select ad.requer_atividade_id as id
    from atividade_dependencia ad
    where ad.atividade_id = p_atividade_id

    union

    select ad.requer_atividade_id
    from atividade_dependencia ad
    join necessarias n on n.id = ad.atividade_id
  )
  select string_agg(a.nome, ', ' order by a.ordem_execucao)
  into v_pendente
  from necessarias n
  join atividade a on a.id = n.id
  where not exists (
    select 1 from execucao e
    where e.torre_id = p_torre_id
      and e.atividade_id = a.id
      and e.data_execucao <= p_data
  )
  and not exists (
    select 1 from programacao pr
    where pr.torre_id = p_torre_id
      and pr.atividade_id = a.id
      and pr.data < p_data
      and pr.situacao = 'APROVADA'
  );

  if v_pendente is not null then
    return format('Depende de: %s — nem executada, nem programada para antes desta data',
                  v_pendente);
  end if;

  return null;
end;
$$;

-- =============================================================================
-- Conferência: o que está liberado e o que está barrado numa torre específica
-- =============================================================================
-- TROQUE o trecho e a torre nas duas linhas marcadas. O resultado mostra o
-- estágio atual dela, para o veredito de cada atividade fazer sentido — uma
-- torre em REVISÃO tem quase tudo liberado, e isso é o comportamento correto.
-- =============================================================================

with alvo as (
  select ts.torre_id,
         ts.identificador,
         coalesce(ts.ultima_atividade, '— nada executado —') as estagio
  from torre_situacao ts
  join trecho t on t.id = ts.trecho_id
  where t.nome  = 'Barra - Correntina'   -- <<< TROQUE O TRECHO
    and ts.identificador = '0/1'         -- <<< TROQUE A TORRE
)
select alvo.identificador as torre,
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
