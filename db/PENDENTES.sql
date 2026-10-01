-- =============================================================================
-- PARA COLAR NO SQL EDITOR DO SUPABASE — atualizado em 01/10/2026
-- =============================================================================
-- A última aplicada foi a 35. Faltam estas duas, nesta ordem:
--
--   36-justificativa-retroativa.sql
--       Data no passado ganha justificativa própria, separada do "programar
--       mesmo assim". Resolve o lote que dizia "informe uma justificativa" sem
--       ter onde informar. A exigência só vale quando a data é escolhida: no
--       insert, ou quando muda no update.
--
--   37-reordenar-atividades.sql
--       A função que arrasta atividades para mudar a posição, e a correção da
--       regra de bloqueio para ignorar atividade removida.
--
-- Confere antes que a última é a 35:
--
--   select numero, arquivo from migracao order by numero;
--
-- Cola inteiro e roda. As duas são idempotentes. O SQL Editor só mostra o
-- resultado da ÚLTIMA consulta — aqui é a lista das atividades em ordem, que
-- tem que sair de 10 em 10 sem repetir número.
--
-- A ordem entre subir o site e rodar o SQL não derruba nada: a tela só manda a
-- justificativa quando a data é do passado, então programar para datas normais
-- segue funcionando antes da 36. O que não funciona antes dela é programar para o
-- passado (o banco não tem onde guardar o motivo). Antes da 37, arrastar atividade
-- dá erro de função inexistente.
-- =============================================================================



-- ###########################################################################
-- 36-justificativa-retroativa.sql
-- ###########################################################################

-- =============================================================================
-- Justificativa de data no passado, separada da de "fora da sequência" — 30/09/2026
-- =============================================================================
-- Programar para uma data que já passou é recusado pelo banco com a mensagem
-- "Informe uma justificativa para programar no passado". Só que nenhuma tela
-- tinha onde informar. O lote até avisava que data passada era "aviso, não
-- bloqueio" — e o banco bloqueava. Eu escrevi um aviso que prometia o que a
-- regra não deixava.
--
-- O campo de justificativa que existia era o do "programar mesmo assim", e só
-- aparecia dentro do aviso de fora da sequência. Data no passado não dispara
-- esse aviso, porque a consulta de precedência não conhece a regra de data.
--
-- Reaproveitar aquele campo tinha um custo pior que o incômodo: override_motivo
-- desliga TAMBÉM a conferência de precedência. Quem justificasse uma data no
-- passado ficaria, sem saber, com a sequência sem fiscal.
--
-- Por isso a justificativa de data ganha coluna própria. Ela libera a data e
-- nada mais; a precedência continua sendo conferida.
--
-- E a exigência só vale quando a data está sendo ESCOLHIDA: no insert, ou
-- quando ela muda no update. Corrigir o encarregado de uma programação de
-- semana passada não é escolher uma data no passado, e antes era recusado igual.
--
-- Idempotente.
-- =============================================================================

alter table programacao
  add column if not exists justificativa_retroativa text;

comment on column programacao.justificativa_retroativa is
  'Por que esta programação foi lançada para uma data que já tinha passado. '
  'Libera só a data: a precedência continua sendo conferida.';

alter table programacao_historico
  add column if not exists justificativa_retroativa text;

-- -----------------------------------------------------------------------------
-- A regra
-- -----------------------------------------------------------------------------

create or replace function valida_programacao() returns trigger
language plpgsql as $$
declare
  v_motivo    text;
  v_escolheu  boolean;
begin
  -- A data foi escolhida agora? No insert, sempre; no update, só se mudou.
  v_escolheu := tg_op = 'INSERT' or new.data is distinct from old.data;

  if v_escolheu
     and new.data < current_date
     and nullif(btrim(coalesce(new.override_motivo, '')), '') is null
     and nullif(btrim(coalesce(new.justificativa_retroativa, '')), '') is null
  then
    raise exception
      'Data no passado (%). Informe por que esta programação vai para uma data que já passou.',
      to_char(new.data, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  -- Só o "programar mesmo assim" desliga a precedência. A justificativa de data
  -- no passado, não.
  if new.override_motivo is null then
    v_motivo := motivo_bloqueio_programacao(new.torre_id, new.atividade_id, new.data);
    if v_motivo is not null then
      raise exception '%', v_motivo using errcode = 'check_violation';
    end if;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- O histórico guarda a justificativa
-- -----------------------------------------------------------------------------
-- É a primeira coisa que a fiscalização pergunta de uma programação para o
-- passado: por quê. Mesma função da db/28, com a coluna nova.
-- -----------------------------------------------------------------------------

create or replace function registra_historico_programacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reg  record;
  v_acao text;
  v_quem uuid := auth.uid();
  v_nome text;
  v_mud  jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    v_acao := 'REMOVEU'; v_reg := old;
  elsif tg_op = 'INSERT' then
    v_acao := 'CRIOU';   v_reg := new;
  else
    v_acao := 'ALTEROU'; v_reg := new;
  end if;

  select nome into v_nome from perfil where id = v_quem;

  if tg_op = 'UPDATE' then
    if new.data is distinct from old.data then
      v_mud := v_mud || jsonb_build_object('data',
        jsonb_build_object('de', old.data, 'para', new.data));
    end if;

    if new.atividade_id is distinct from old.atividade_id then
      v_mud := v_mud || jsonb_build_object('atividade', jsonb_build_object(
        'de',   (select nome from atividade where id = old.atividade_id),
        'para', (select nome from atividade where id = new.atividade_id)));
    end if;

    if new.encarregado_id is distinct from old.encarregado_id then
      v_mud := v_mud || jsonb_build_object('encarregado', jsonb_build_object(
        'de',   coalesce((select nome from encarregado where id = old.encarregado_id), 'sem encarregado'),
        'para', coalesce((select nome from encarregado where id = new.encarregado_id), 'sem encarregado')));
    end if;

    if new.percentual is distinct from old.percentual then
      v_mud := v_mud || jsonb_build_object('percentual', jsonb_build_object(
        'de', trim(to_char(old.percentual, 'FM999D99')) || '%',
        'para', trim(to_char(new.percentual, 'FM999D99')) || '%'));
    end if;

    if new.cabo is distinct from old.cabo then
      v_mud := v_mud || jsonb_build_object('cabo', jsonb_build_object(
        'de', coalesce(old.cabo::text, 'sem cabo'),
        'para', coalesce(new.cabo::text, 'sem cabo')));
    end if;

    if new.situacao is distinct from old.situacao then
      v_mud := v_mud || jsonb_build_object('situacao',
        jsonb_build_object('de', old.situacao::text, 'para', new.situacao::text));
    end if;

    if new.observacao is distinct from old.observacao then
      v_mud := v_mud || jsonb_build_object('observacao',
        jsonb_build_object('de', old.observacao, 'para', new.observacao));
    end if;

    -- Só mudou coisa interna, como atualizado_em: não vira linha de histórico
    if v_mud = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into programacao_historico (
    acao, quem, quem_nome, programacao_id, torre_id, torre_identificador, trecho_id,
    atividade_nome, encarregado_nome, data, situacao, observacao, override_motivo,
    justificativa_retroativa, mudancas
  )
  select
    v_acao, v_quem, coalesce(v_nome, 'desconhecido'),
    v_reg.id, v_reg.torre_id, t.identificador, t.trecho_id,
    (select nome from atividade   where id = v_reg.atividade_id),
    (select nome from encarregado where id = v_reg.encarregado_id),
    v_reg.data, v_reg.situacao::text, v_reg.observacao, v_reg.override_motivo,
    v_reg.justificativa_retroativa,
    case when tg_op = 'UPDATE' then v_mud else null end
  from torre t
  where t.id = v_reg.torre_id;

  return null;
end;
$$;

insert into migracao (numero, arquivo)
values (36, '36-justificativa-retroativa.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Programe uma atividade para uma data que já passou, com justificativa, e rode
-- isto: a justificativa tem que aparecer, e override_motivo tem que ficar vazio.
-- =============================================================================

select to_char(quando, 'DD/MM HH24:MI') as quando,
       acao,
       quem_nome,
       torre_identificador as torre,
       atividade_nome      as atividade,
       to_char(data, 'DD/MM/YYYY') as data,
       justificativa_retroativa,
       override_motivo
from programacao_historico
where justificativa_retroativa is not null
order by quando desc
limit 20;

-- ###########################################################################
-- 37-reordenar-atividades.sql
-- ###########################################################################

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
