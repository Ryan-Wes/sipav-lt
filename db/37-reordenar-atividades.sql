-- =============================================================================
-- Reordenar atividades arrastando, e atividade removida que não bloqueia — 30/09/2026
-- =============================================================================
-- Toda atividade nova entra no fim da lista, e a lista é a ordem de execução:
-- é a ordem em que elas aparecem ao lançar, na grade, nos painéis. Uma
-- "recuperação de acesso" que devia ficar junto das supressões ficava lá embaixo,
-- e atrapalhava cada lançamento.
--
-- Já existe um reordenarAtividades no db.js, e nunca foi chamado por ninguém.
-- Ele faz um update por atividade, cada um numa requisição, e portanto numa
-- transação. O comentário dele diz que a unique de ordem é deferrable e por
-- isso passa — mas deferrable só ajuda dentro de UMA transação. Cada update
-- vira o seu próprio commit e bate na unique.
--
-- Aqui é uma função só, então tudo acontece numa transação, ou não acontece.
--
-- Idempotente.
-- =============================================================================

create or replace function reordenar_atividades(p_ids uuid[]) returns void
language plpgsql as $$
declare
  v_obra    uuid;
  v_ativas  int;
  v_desvio  bigint;
  v_antes   text[];
  v_novo    record;
begin
  if papel_atual() is null or papel_atual() not in ('ADMIN', 'PLANEJAMENTO') then
    raise exception 'Só administração e planejamento reordenam atividades.'
      using errcode = '42501';
  end if;

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'Lista de atividades vazia.';
  end if;

  select obra_id into v_obra from atividade where id = p_ids[1];
  if v_obra is null then
    raise exception 'Atividade não encontrada.';
  end if;

  -- A lista tem que ser exatamente as ativas da obra, sem repetir e sem faltar.
  -- Se alguém criou ou removeu uma atividade enquanto eu arrastava, a lista que
  -- eu tenho está velha, e renumerar em cima dela apagaria a mudança do outro.
  select count(*) into v_ativas from atividade where obra_id = v_obra and ativa;

  if v_ativas <> array_length(p_ids, 1)
     or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1)
     or exists (
       select 1 from unnest(p_ids) x
       where not exists (
         select 1 from atividade a where a.id = x and a.obra_id = v_obra and a.ativa
       )
     )
  then
    raise exception
      'A lista de atividades mudou enquanto você arrastava. Reabra a lista e tente de novo.';
  end if;

  -- O que já estava fora de ordem ANTES não é culpa desta troca. Guardo os pares
  -- para só recusar o que esta troca estragar; do contrário uma dependência
  -- antiga e torta travaria toda reordenação, apontando um par que ninguém tocou.
  select coalesce(array_agg(d.atividade_id::text || '>' || d.requer_atividade_id::text), '{}')
  into v_antes
  from atividade_dependencia d
  join atividade a on a.id = d.atividade_id       and a.ativa
  join atividade r on r.id = d.requer_atividade_id and r.ativa
  where a.obra_id = v_obra
    and r.ordem_execucao >= a.ordem_execucao;

  -- Fase 1: tira todo mundo do caminho, para nenhum número novo esbarrar num
  -- antigo. Inclui as removidas: a unique (obra_id, ordem_execucao) vale para
  -- elas também, e uma removida ocupando o 130 barraria a ativa que ganhasse 130.
  select greatest(coalesce(max(ordem_execucao), 0), 10 * count(*)) + 1000
  into v_desvio
  from atividade where obra_id = v_obra;

  update atividade set ordem_execucao = ordem_execucao + v_desvio where obra_id = v_obra;

  -- Fase 2: as ativas, na ordem que veio, de 10 em 10.
  update atividade a
  set ordem_execucao = t.pos * 10
  from unnest(p_ids) with ordinality as t(id, pos)
  where a.id = t.id;

  -- As removidas ficam depois, na ordem relativa que tinham.
  update atividade a
  set ordem_execucao = (v_ativas + r.pos) * 10
  from (
    select id, row_number() over (order by ordem_execucao) as pos
    from atividade
    where obra_id = v_obra and not ativa
  ) r
  where a.id = r.id;

  -- Dependência nova virada de cabeça para baixo: a atividade passou a vir ANTES
  -- de algo de que ela depende. Lançar seguindo essa lista seria impossível.
  -- Levanta a exceção e a transação inteira volta atrás.
  select a.nome as atividade, r.nome as requer into v_novo
  from atividade_dependencia d
  join atividade a on a.id = d.atividade_id       and a.ativa
  join atividade r on r.id = d.requer_atividade_id and r.ativa
  where a.obra_id = v_obra
    and r.ordem_execucao >= a.ordem_execucao
    and (d.atividade_id::text || '>' || d.requer_atividade_id::text) <> all (v_antes)
  order by a.ordem_execucao
  limit 1;

  if found then
    raise exception
      '% depende de %, e ficaria antes dela. Tire essa dependência no lápis ou solte em outro lugar.',
      v_novo.atividade, v_novo.requer;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Atividade removida não bloqueia
-- -----------------------------------------------------------------------------
-- A tela de remover promete: "dependentes deixarão de exigi-la". Não era
-- verdade. Remover só marca a atividade como inativa, e a regra de bloqueio
-- continuava cobrando ela — torre nenhuma conseguiria cumprir uma atividade que
-- nem aparece mais na lista.
--
-- A regra passa a ignorar atividade removida, nos dois sentidos. Continua
-- atravessando ela para chegar nos pré-requisitos DELA: sumir com uma atividade
-- do meio não pode soltar a cadeia inteira que vinha antes.
--
-- Mesma função da db/33, com a condição nova.
-- -----------------------------------------------------------------------------

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
  -- Removida não se cobra. Ela ainda é atravessada acima, para chegar nos
  -- pré-requisitos dela; só não entra na lista do que está faltando.
  where a.ativa
  and (a.so_para_estrutura is null
       or a.so_para_estrutura = (select t.estrutura from torre t where t.id = p_torre_id)
       or (select t.estrutura from torre t where t.id = p_torre_id) is null)
  and not exists (
    select 1 from execucao e
    where e.torre_id = p_torre_id
      and e.atividade_id = a.id
      and e.data_execucao <= p_data
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

insert into migracao (numero, arquivo)
values (37, '37-reordenar-atividades.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- A ordem tem que sair de 10 em 10, sem buraco e sem repetição. Se alguma linha
-- vier repetida, a unique teria reclamado; se vier com salto, sobrou removida
-- no meio, o que é esperado.
-- =============================================================================

select a.ordem_execucao as ordem,
       a.nome,
       case when a.ativa then '' else 'removida' end as situacao
from atividade a
join obra o on o.id = a.obra_id
where o.codigo = 'SD'
order by a.ordem_execucao;
