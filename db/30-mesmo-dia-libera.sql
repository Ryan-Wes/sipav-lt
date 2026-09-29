-- =============================================================================
-- Pré-requisito programado para o MESMO dia também libera — 29/09/2026
-- =============================================================================
-- Do Alessandro, 25/09: "Estou escavando e instalando o pré-moldado no mesmo
-- dia. Poderia até ter gente reaterrando na sequência. O que sugeria: colocar
-- sistema para ler se existe a atividade antecessora programada no mesmo dia ou
-- dia anterior."
--
-- A regra exigia data ESTRITAMENTE anterior (pr.data < p_data). Isso descrevia
-- uma obra que anda uma atividade por dia por torre, e não é a obra. A execução
-- já era tratada assim — e.data_execucao <= p_data — só a programação é que
-- ficou mais dura que a realidade.
--
-- Eu tinha contornado isso do lado errado: inventei um campo de "+N dias" na
-- tela para empurrar a segunda atividade para o dia seguinte, forçando a mão
-- para caber na regra. Era a regra que estava errada.
--
-- Efeito: escavar e instalar pré-moldado no mesmo dia passa a ser lançamento
-- normal, sem aviso de fora de sequência e sem justificativa de override.
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
      -- <= e não <: a mesma equipe escava e instala o pré-moldado no mesmo dia
      and pr.data <= p_data
      and pr.situacao = 'APROVADA'
  );

  if v_pendente is not null then
    return format('Depende de: %s — nem executada, nem programada para esta data ou antes',
                  v_pendente);
  end if;

  return null;
end;
$$;

-- =============================================================================
-- Conferência: o mesmo dia passou a liberar?
-- =============================================================================
-- Pega uma torre zerada, finge uma programação de hoje para a primeira
-- atividade da cadeia e pergunta se a seguinte estaria liberada para hoje.
-- Não grava nada — é tudo dentro de uma transação que termina em rollback.
-- =============================================================================

-- begin;
--
-- with alvo as (
--   select ts.torre_id
--   from torre_situacao ts
--   join trecho t on t.id = ts.trecho_id
--   where t.nome = 'Barra - Correntina'
--     and ts.ultima_atividade is null
--   limit 1
-- )
-- select motivo_bloqueio_programacao(
--          alvo.torre_id,
--          (select id from atividade where nome = 'ESCAVAÇÃO'
--             and obra_id = (select id from obra where codigo = 'SD')),
--          current_date
--        ) as antes_de_programar_a_anterior
-- from alvo;
--
-- rollback;
