-- =============================================================================
-- Percentual na programação — 25/09/2026
-- =============================================================================
-- Wesley: "às vezes leva mais de um dia para executar aquela atividade naquela
-- mesma torre. Dá para lançar duas datas com a mesma atividade na mesma torre,
-- porém pode parecer que foi lançado errado se não tiver um percentual — nesse
-- caso, 50% pro dia 28 e 20% pro dia 29".
--
-- A tabela `execucao` já nasceu com percentual; a `programacao` não. Sem ele,
-- duas linhas da mesma atividade na mesma torre parecem duplicata, e não é
-- possível dizer quanto da torre cabe em cada dia.
--
-- Isto também explica uma coisa que eu tinha estranhado na planilha da ISA: a
-- coluna TOTAL SEMANAL às vezes vem fracionária — `2,5` e `3,5` em montagem.
-- Não era erro de digitação, era meia torre. Com o percentual, o exportador
-- passa a somar percentuais em vez de contar torres, e o número bate sozinho.
--
-- O check aceita de 0,01 a 100: o percentual é de quanto daquela torre cabe
-- naquele dia, e a soma dos dias NÃO precisa fechar 100 — o planejamento pode
-- cobrir só parte da atividade na quinzena.
-- =============================================================================

alter table programacao
  add column if not exists percentual numeric(5,2) not null default 100.00;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'programacao_percentual_check'
  ) then
    alter table programacao
      add constraint programacao_percentual_check
      check (percentual > 0 and percentual <= 100);
  end if;
end $$;

comment on column programacao.percentual is
  'Quanto desta torre está previsto para este dia. Duas linhas da mesma atividade '
  'na mesma torre, em dias diferentes, repartem o serviço. A soma não precisa '
  'fechar 100.';


-- -----------------------------------------------------------------------------
-- O histórico também registra a mudança de percentual
-- -----------------------------------------------------------------------------
-- Sem isto, alterar de 50% para 80% não deixaria rastro — e percentual é
-- justamente o tipo de campo que gera discussão depois.
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
    atividade_nome, encarregado_nome, data, situacao, observacao, override_motivo, mudancas
  )
  select
    v_acao, v_quem, coalesce(v_nome, 'desconhecido'),
    v_reg.id, v_reg.torre_id, t.identificador, t.trecho_id,
    (select nome from atividade   where id = v_reg.atividade_id),
    (select nome from encarregado where id = v_reg.encarregado_id),
    v_reg.data, v_reg.situacao::text, v_reg.observacao, v_reg.override_motivo,
    case when tg_op = 'UPDATE' then v_mud else null end
  from torre t
  where t.id = v_reg.torre_id;

  return null;
end;
$$;


-- =============================================================================
-- Conferência — torres com a mesma atividade em mais de um dia
-- =============================================================================
-- É o caso que motivou o campo. A soma aparece para dar para bater o olho.
select
  tr.nome                     as trecho,
  t.identificador             as torre,
  a.nome                      as atividade,
  count(*)                    as dias,
  string_agg(
    to_char(p.data, 'DD/MM') || ' · ' ||
    trim(to_char(p.percentual, 'FM999D99')) || '%',
    '   ' order by p.data
  )                           as reparticao,
  trim(to_char(sum(p.percentual), 'FM999D99')) || '%' as soma
from programacao p
join torre t   on t.id = p.torre_id
join trecho tr on tr.id = t.trecho_id
join atividade a on a.id = p.atividade_id
where tr.obra_id = (select id from obra where codigo = 'SD')
group by tr.nome, t.identificador, a.nome
having count(*) > 1
order by tr.nome, t.identificador;
