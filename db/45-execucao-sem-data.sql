-- =============================================================================
-- Execução sem data, conferida pelo status da planilha — 02/10/2026
-- =============================================================================
-- A importação do status do Alessandro diz que a torre está montada. Se existe uma
-- programação de MONTAGEM para ela, essa programação aconteceu — mas quando, a
-- planilha não diz. Em vez de inventar uma data, a execução é gravada SEM data.
--
-- O que muda:
--
--   1. execucao.data_execucao deixa de ser obrigatória.
--   2. execucao.por_status marca a execução que veio desse cruzamento, para a tela
--      dizer "conferida pelo status" em vez de uma data.
--   3. A regra de precedência passa a contar a execução sem data como cumprida:
--      antes ela exigia `data_execucao <= data`, e uma data nula nunca é menor que
--      nada, então a atividade ficaria "pendente" para sempre.
--   4. A aderência chama essas de EXECUTADO SEM DATA. Sem data não há prazo: nem
--      NO PRAZO, nem ATRASADO.
--
-- Nada do que já está gravado muda.
--
-- Idempotente.
-- =============================================================================

alter table execucao alter column data_execucao drop not null;

alter table execucao add column if not exists por_status boolean not null default false;

comment on column execucao.por_status is
  'Execução conferida pela importação do status da planilha de controle. Não tem data: a planilha só diz que a atividade está feita.';

-- -----------------------------------------------------------------------------
-- Precedência: a execução sem data conta
-- -----------------------------------------------------------------------------
-- Mesma função da db/37, mudando só a condição da execução.

create or replace function motivo_bloqueio_programacao(
  p_torre_id     uuid,
  p_atividade_id uuid,
  p_data         date
) returns text
language plpgsql stable as $$
declare
  v_restricao  record;
  v_pendente   text;
  v_invertida  record;
  v_estrutura  tipo_estrutura;
  v_so_para    tipo_estrutura;
  v_nome       text;
begin
  -- 1. A atividade existe neste tipo de torre?
  select a.nome, a.so_para_estrutura into v_nome, v_so_para
  from atividade a where a.id = p_atividade_id;

  if v_so_para is not null then
    select t.estrutura into v_estrutura from torre t where t.id = p_torre_id;

    if v_estrutura is not null and v_estrutura <> v_so_para then
      return format('%s é de torre %s, e esta é %s.',
                    v_nome, lower(v_so_para::text), lower(v_estrutura::text));
    end if;
  end if;

  -- 2. Restrição ativa na torre
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

  -- 3. Toda a cadeia de pré-requisitos, não só o degrau anterior.
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
  where a.ativa
  and (a.so_para_estrutura is null
       or a.so_para_estrutura = (select t.estrutura from torre t where t.id = p_torre_id)
       or (select t.estrutura from torre t where t.id = p_torre_id) is null)
  and not exists (
    select 1 from execucao e
    where e.torre_id = p_torre_id
      and e.atividade_id = a.id
      -- Execução sem data (conferida pelo status) já aconteceu: vale para qualquer dia
      and (e.data_execucao is null or e.data_execucao <= p_data)
  )
  and not exists (
    select 1 from programacao pr
    where pr.torre_id = p_torre_id
      and pr.atividade_id = a.id
      and pr.data <= p_data
      and pr.situacao = 'APROVADA'
  );

  if v_pendente is not null then
    return format('Depende de: %s — nem executada, nem programada para esta data ou antes',
                  v_pendente);
  end if;

  -- 4. O outro lado: quem depende desta atividade já está programado para ANTES.
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
  join atividade a on a.id = d.id and a.ativa
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

-- -----------------------------------------------------------------------------
-- Aderência: EXECUTADO SEM DATA
-- -----------------------------------------------------------------------------
-- Mesma view da db/38. Só o CASE da situação ganha o caso novo, no começo; as
-- colunas ficam idênticas e na mesma ordem, como o create or replace exige.

create or replace view aderencia with (security_invoker = true) as

-- O que foi executado em campo
select
  t.trecho_id,
  t.id                          as torre_id,
  t.identificador               as torre,
  t.km,
  a.nome                        as atividade,
  a.ordem_execucao,
  ex.programacao_id,
  coalesce(ex.data_programada, pr.data)  as data_programada,
  enc_pr.nome                   as encarregado_programado,
  ex.id                         as execucao_id,
  ex.data_execucao,
  enc_ex.nome                   as encarregado_executou,
  case
    when ex.data_execucao is null                           then 'EXECUTADO SEM DATA'
    when coalesce(ex.data_programada, pr.data) is null      then 'EXECUTADO SEM PROGRAMAR'
    when ex.data_execucao = coalesce(ex.data_programada, pr.data) then 'NO PRAZO'
    when ex.data_execucao < coalesce(ex.data_programada, pr.data) then 'ADIANTADO'
    else                                                         'ATRASADO'
  end                           as situacao,
  ex.data_execucao - coalesce(ex.data_programada, pr.data)  as dias_de_desvio,
  coalesce(ex.data_programada_original, ex.data_programada, pr.data)
                                as data_programada_original,
  ex.data_execucao - coalesce(ex.data_programada_original, ex.data_programada, pr.data)
                                as desvio_do_original,
  pr.percentual                 as percentual_programado,
  ex.percentual                 as percentual_executado
from execucao ex
join torre t     on t.id = ex.torre_id
join atividade a on a.id = ex.atividade_id
left join programacao pr     on pr.id = ex.programacao_id
left join encarregado enc_pr on enc_pr.id = pr.encarregado_id
left join encarregado enc_ex on enc_ex.id = ex.encarregado_id
where not ex.carga_inicial

union all

-- O que foi programado e ainda não saiu. Vencida é a que já devia ter saído:
-- é a pergunta de meta, "o que era para ter acontecido e não aconteceu".
select
  t.trecho_id,
  t.id,
  t.identificador,
  t.km,
  a.nome,
  a.ordem_execucao,
  pr.id,
  pr.data,
  enc_pr.nome,
  null::uuid,
  null::date,
  null::text,
  case when pr.data < current_date then 'NÃO EXECUTADA' else 'PENDENTE' end,
  null::integer,
  coalesce(
    (select h.data
       from programacao_historico h
      where h.programacao_id = pr.id and h.acao = 'CRIOU'
      order by h.quando, h.id
      limit 1),
    pr.data),
  null::integer,
  pr.percentual,
  null::numeric(5,2)
from programacao pr
join torre t     on t.id = pr.torre_id
join atividade a on a.id = pr.atividade_id
left join encarregado enc_pr on enc_pr.id = pr.encarregado_id
where not exists (select 1 from execucao ex where ex.programacao_id = pr.id);

comment on view aderencia is
  'Programado x executado. Uma linha por execução apontada e uma por programação que '
  'ainda não saiu. A data programada vem da foto guardada na execução, não da '
  'programação de hoje. EXECUTADO SEM DATA: conferida pelo status da planilha.';

insert into migracao (numero, arquivo)
values (45, '45-execucao-sem-data.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que dizer que a coluna aceita nulo e que a marca existe:
--   data_execucao  YES      por_status  NO (não nula, padrão false)
-- =============================================================================

select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'execucao'
  and column_name in ('data_execucao', 'por_status')
order by column_name;
