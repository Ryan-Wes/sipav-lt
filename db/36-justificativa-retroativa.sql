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
