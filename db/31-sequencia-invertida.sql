-- =============================================================================
-- Programar uma atividade DEPOIS de quem depende dela — 29/09/2026
-- =============================================================================
-- Achei isto olhando a grade: torre com ESCAVAÇÃO - ESTAI em 05/10 e ABERTURA DE
-- ACESSO em 12/10. Não existe. Sem acesso não se chega na torre para escavar.
--
-- A regra só olhava para trás: ao programar A, conferia se os pré-requisitos de
-- A estavam executados ou programados para antes. Nunca olhou para frente — se
-- alguém que DEPENDE de A já estava programado para antes de A, passava calado.
--
-- É o mesmo erro visto do outro lado, e acontece justamente na ordem em que se
-- programa de verdade: primeiro lança a escavação da semana, depois lembra do
-- acesso e lança para a semana seguinte, sem perceber que inverteu.
--
-- Mesmo dia continua liberado nos dois sentidos, como a db/30 deixou: o que se
-- barra aqui é sucessora programada ESTRITAMENTE antes.
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
  v_invertida record;
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

  -- 3. O outro lado: quem depende desta atividade já está programado para ANTES.
  --    Sobe a cadeia ao contrário, das sucessoras diretas até o fim.
  with recursive dependentes as (
    select ad.atividade_id as id
    from atividade_dependencia ad
    where ad.requer_atividade_id = p_atividade_id

    union

    select ad.atividade_id
    from atividade_dependencia ad
    join dependentes d on d.id = ad.requer_atividade_id
  )
  select a.nome, pr.data into v_invertida
  from dependentes d
  join atividade a on a.id = d.id
  join programacao pr
    on pr.torre_id = p_torre_id
   and pr.atividade_id = a.id
   and pr.situacao = 'APROVADA'
   and pr.data < p_data
  order by pr.data
  limit 1;

  if found then
    return format('%s já está programada para %s nesta torre e depende desta. '
                  || 'Programar para %s deixaria a sequência invertida.',
                  v_invertida.nome,
                  to_char(v_invertida.data, 'DD/MM'),
                  to_char(p_data, 'DD/MM'));
  end if;

  return null;
end;
$$;

-- =============================================================================
-- O que já está invertido no banco
-- =============================================================================
-- Só leitura. Lista os pares que existem hoje e que a regra nova recusaria, para
-- eu saber o tamanho do estrago antes de sair corrigindo. Nada é alterado.
-- =============================================================================

with recursive cadeia as (
  select ad.atividade_id, ad.requer_atividade_id
  from atividade_dependencia ad

  union

  select c.atividade_id, ad.requer_atividade_id
  from cadeia c
  join atividade_dependencia ad on ad.atividade_id = c.requer_atividade_id
)
select t.identificador                as torre,
       tr.nome                        as trecho,
       depois.nome                    as programada_depois,
       to_char(p_depois.data, 'DD/MM/YYYY') as data_depois,
       antes.nome                     as mas_depende_de,
       to_char(p_antes.data, 'DD/MM/YYYY')  as ja_programada_em
from cadeia c
join programacao p_antes  on p_antes.atividade_id  = c.requer_atividade_id
join programacao p_depois on p_depois.atividade_id = c.atividade_id
                         and p_depois.torre_id     = p_antes.torre_id
join atividade antes  on antes.id  = c.requer_atividade_id
join atividade depois on depois.id = c.atividade_id
join torre t   on t.id  = p_antes.torre_id
join trecho tr on tr.id = t.trecho_id
where p_depois.data < p_antes.data
  and p_antes.situacao  = 'APROVADA'
  and p_depois.situacao = 'APROVADA'
order by tr.nome, t.ordem, p_antes.data;
