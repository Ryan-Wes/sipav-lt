-- =============================================================================
-- Supervisor altera o que já foi aprovado, e o histórico diz quem decidiu — 14/10/2026
-- =============================================================================
-- 1. O supervisor pode pedir para ALTERAR ou APAGAR uma programação dele que já foi aprovada.
--    Não mexe na oficial: o pedido é uma linha SOLICITADA no pacote dele, ligada à oficial por
--    `substitui_id`. Só quando o planejamento aprova é que a oficial muda (ou sai).
--
--      substitui_id   a programação oficial a que o pedido se refere
--      exclusao       true = o pedido é para apagar (os valores são os da oficial)
--
--    Aprovado, o pedido vira CANCELADA (consumido: a alteração já foi para a oficial) e fica no
--    pacote como registro. Reprovado, vira RECUSADA com a justificativa, e a oficial continua
--    como estava.
--
-- 2. Quem aprovou e quem reprovou fica no histórico, com o nome de quem pediu:
--      APROVOU   "Hanna aprovou a programação de testesupcryan"
--      REPROVOU  "Rominick reprovou a alteração de testesupcryan", com a justificativa
--      PEDIU     "testesupcryan pediu para apagar / alterar uma programação aprovada"
--    O pedido do supervisor não gera linha de ALTEROU/REMOVEU a cada toque: só o PEDIU, e depois
--    a decisão.
--
-- Idempotente. Depende da 54 e da 55.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas e trava de duplicata
-- -----------------------------------------------------------------------------
alter table programacao
  add column if not exists substitui_id uuid references programacao(id) on delete cascade;
alter table programacao
  add column if not exists exclusao boolean not null default false;

-- Um pedido de cada vez por programação oficial
create unique index if not exists programacao_um_pedido_por_linha
  on programacao (substitui_id)
  where substitui_id is not null and situacao = 'SOLICITADA';

-- O pedido (e o que já foi reprovado ou consumido) não conta como duplicata da oficial
drop index if exists programacao_sem_duplicata;
drop index if exists programacao_sem_duplicata_cabo;

create unique index programacao_sem_duplicata
  on programacao (
    torre_id,
    atividade_id,
    data,
    coalesce(encarregado_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where cabo is null and situacao not in ('RECUSADA', 'CANCELADA') and substitui_id is null;

create unique index programacao_sem_duplicata_cabo
  on programacao (
    torre_id,
    atividade_id,
    data,
    coalesce(encarregado_id, '00000000-0000-0000-0000-000000000000'::uuid),
    cabo
  )
  where cabo is not null and situacao not in ('RECUSADA', 'CANCELADA') and substitui_id is null;

-- -----------------------------------------------------------------------------
-- 2. O supervisor só pede alteração do que é dele e já está aprovado
-- -----------------------------------------------------------------------------
create or replace function programacao_aprovada_dele(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from programacao
    where id = p_id and situacao = 'APROVADA' and criado_por = auth.uid()
  );
$$;

drop policy if exists programacao_supervisor_insere on programacao;
drop policy if exists programacao_supervisor_edita  on programacao;

create policy programacao_supervisor_insere on programacao for insert to authenticated
  with check (
    papel_atual() = 'SUPERVISOR'
    and situacao = 'SOLICITADA'
    and criado_por = auth.uid()
    and solicitacao_id is not null
    and solicitacao_editavel(solicitacao_id)
    and (substitui_id is null or programacao_aprovada_dele(substitui_id))
  );

create policy programacao_supervisor_edita on programacao for update to authenticated
  using (
    papel_atual() = 'SUPERVISOR'
    and criado_por = auth.uid()
    and situacao = 'SOLICITADA'
    and solicitacao_id is not null
    and solicitacao_editavel(solicitacao_id)
  )
  with check (
    situacao = 'SOLICITADA'
    and solicitacao_id is not null
    and solicitacao_editavel(solicitacao_id)
    and (substitui_id is null or programacao_aprovada_dele(substitui_id))
  );

-- -----------------------------------------------------------------------------
-- 3. Limpar programação leva só a oficial: os pedidos e as decisões ficam no pacote
-- -----------------------------------------------------------------------------
create or replace function limpar_programacoes(
  p_trecho_id uuid,
  p_de        date default null,
  p_ate       date default null
) returns integer
language plpgsql as $$
declare
  v_apagadas integer;
begin
  with alvo as (
    delete from programacao pr
    using torre t
    where t.id = pr.torre_id
      and t.trecho_id = p_trecho_id
      and pr.situacao = 'APROVADA'
      and (p_de  is null or pr.data >= p_de)
      and (p_ate is null or pr.data <= p_ate)
    returning pr.id
  )
  select count(*) into v_apagadas from alvo;

  return v_apagadas;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Histórico: quem decidiu, de quem era e por quê
-- -----------------------------------------------------------------------------
alter table programacao_historico add column if not exists de_quem      uuid;
alter table programacao_historico add column if not exists de_quem_nome text;
alter table programacao_historico add column if not exists motivo       text;
alter table programacao_historico add column if not exists tipo_pedido  text;  -- NOVA, EDICAO, EXCLUSAO

alter table programacao_historico drop constraint if exists programacao_historico_acao_check;
alter table programacao_historico add constraint programacao_historico_acao_check
  check (acao in ('CRIOU', 'ALTEROU', 'REMOVEU', 'ESTAGIO', 'APROVOU', 'REPROVOU', 'PEDIU', 'REABRIU'));

-- O trigger de sempre (db/36), com duas diferenças:
--   · quando a função de decisão está trabalhando, ele se cala (ela grava a linha de APROVOU
--     ou REPROVOU, com quem pediu);
--   · o pedido do supervisor (substitui_id) grava só o PEDIU, na criação.
create or replace function registra_historico_programacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reg    record;
  v_acao   text;
  v_quem   uuid := auth.uid();
  v_nome   text;
  v_mud    jsonb := '{}'::jsonb;
  v_pedido text;
begin
  if coalesce(current_setting('sipav.sem_historico', true), '') = '1' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_acao := 'REMOVEU'; v_reg := old;
  elsif tg_op = 'INSERT' then
    v_acao := 'CRIOU';   v_reg := new;
  else
    v_acao := 'ALTEROU'; v_reg := new;
  end if;

  if v_reg.substitui_id is not null then
    if tg_op <> 'INSERT' then
      return null;
    end if;
    v_acao := 'PEDIU';
    v_pedido := case when v_reg.exclusao then 'EXCLUSAO' else 'EDICAO' end;
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
    justificativa_retroativa, mudancas, tipo_pedido
  )
  select
    v_acao, v_quem, coalesce(v_nome, 'desconhecido'),
    coalesce(v_reg.substitui_id, v_reg.id), v_reg.torre_id, t.identificador, t.trecho_id,
    (select nome from atividade   where id = v_reg.atividade_id),
    (select nome from encarregado where id = v_reg.encarregado_id),
    v_reg.data, v_reg.situacao::text, v_reg.observacao, v_reg.override_motivo,
    v_reg.justificativa_retroativa,
    case when tg_op = 'UPDATE' then v_mud else null end,
    v_pedido
  from torre t
  where t.id = v_reg.torre_id;

  return null;
end;
$$;

-- Uma linha de APROVOU ou REPROVOU: quem decidiu, de quem era, e o que mudou (no pedido de alteração)
create or replace function registra_decisao_programacao(
  p_acao   text,
  p_linha  programacao,
  p_pedido text,
  p_motivo text,
  p_mud    jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_quem uuid := auth.uid();
begin
  insert into programacao_historico (
    acao, quem, quem_nome, de_quem, de_quem_nome, motivo, tipo_pedido,
    programacao_id, torre_id, torre_identificador, trecho_id,
    atividade_nome, encarregado_nome, data, situacao, observacao, mudancas
  )
  select
    p_acao, v_quem, coalesce((select nome from perfil where id = v_quem), 'desconhecido'),
    p_linha.criado_por, (select nome from perfil where id = p_linha.criado_por),
    nullif(btrim(coalesce(p_motivo, '')), ''), p_pedido,
    coalesce(p_linha.substitui_id, p_linha.id), p_linha.torre_id, t.identificador, t.trecho_id,
    (select nome from atividade   where id = p_linha.atividade_id),
    (select nome from encarregado where id = p_linha.encarregado_id),
    p_linha.data, p_linha.situacao::text, p_linha.observacao, p_mud
  from torre t
  where t.id = p_linha.torre_id;
end;
$$;

-- O que muda da oficial para o pedido de alteração, no mesmo formato do histórico
create or replace function mudancas_do_pedido(o programacao, c programacao) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v jsonb := '{}'::jsonb;
begin
  if c.data is distinct from o.data then
    v := v || jsonb_build_object('data', jsonb_build_object('de', o.data, 'para', c.data));
  end if;
  if c.atividade_id is distinct from o.atividade_id then
    v := v || jsonb_build_object('atividade', jsonb_build_object(
      'de',   (select nome from atividade where id = o.atividade_id),
      'para', (select nome from atividade where id = c.atividade_id)));
  end if;
  if c.encarregado_id is distinct from o.encarregado_id then
    v := v || jsonb_build_object('encarregado', jsonb_build_object(
      'de',   coalesce((select nome from encarregado where id = o.encarregado_id), 'sem encarregado'),
      'para', coalesce((select nome from encarregado where id = c.encarregado_id), 'sem encarregado')));
  end if;
  if c.percentual is distinct from o.percentual then
    v := v || jsonb_build_object('percentual', jsonb_build_object(
      'de', trim(to_char(o.percentual, 'FM999D99')) || '%',
      'para', trim(to_char(c.percentual, 'FM999D99')) || '%'));
  end if;
  if c.cabo is distinct from o.cabo then
    v := v || jsonb_build_object('cabo', jsonb_build_object(
      'de', coalesce(o.cabo::text, 'sem cabo'), 'para', coalesce(c.cabo::text, 'sem cabo')));
  end if;
  if c.observacao is distinct from o.observacao then
    v := v || jsonb_build_object('observacao', jsonb_build_object('de', o.observacao, 'para', c.observacao));
  end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. A decisão, agora com o pedido de alteração e de exclusão
-- -----------------------------------------------------------------------------
-- O que vem em p_aprovar é aprovado; o resto do pacote é reprovado, com a justificativa.
--   linha nova          vira APROVADA (programação oficial)
--   pedido de alteração a oficial recebe os valores do pedido; o pedido vira CANCELADA
--   pedido de apagar    a oficial é apagada; o pedido vira CANCELADA (fica como registro)
-- A linha que a sequência barrar fica como estava e volta na lista de falhas.
create or replace function decidir_solicitacao(
  p_id       uuid,
  p_aprovar  uuid[],
  p_motivo   text default null,
  p_liberar  boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v        solicitacao%rowtype;
  r        record;
  c        programacao%rowtype;
  o        programacao%rowtype;
  v_quem   uuid := auth.uid();
  v_ok     integer := 0;
  v_rec    integer := 0;
  v_falhas jsonb := '[]'::jsonb;
  v_aprov  uuid[] := coalesce(p_aprovar, '{}'::uuid[]);
  v_pend   integer;
  v_total_ok  integer;
  v_total_rec integer;
begin
  if papel_atual() not in ('ADMIN', 'PLANEJAMENTO') then
    raise exception 'Só o planejamento decide solicitações.' using errcode = 'insufficient_privilege';
  end if;

  select * into v from solicitacao where id = p_id for update;
  if not found or v.status <> 'ENVIADA' then
    raise exception 'Esta solicitação não está aguardando análise.';
  end if;

  if exists (
       select 1 from programacao
       where solicitacao_id = p_id and situacao = 'SOLICITADA' and not (id = any (v_aprov))
     )
     and nullif(btrim(coalesce(p_motivo, '')), '') is null
  then
    raise exception 'Escreva a justificativa da reprovação, para o supervisor saber o que corrigir.';
  end if;

  -- O trigger se cala: as linhas de histórico desta decisão são gravadas daqui, com quem pediu
  perform set_config('sipav.sem_historico', '1', true);

  for r in
    select pr.id, t.identificador as torre, a.nome as atividade, pr.data
    from programacao pr
    join torre t     on t.id = pr.torre_id
    join atividade a on a.id = pr.atividade_id
    where pr.solicitacao_id = p_id and pr.situacao = 'SOLICITADA' and pr.id = any (v_aprov)
    order by pr.data, a.ordem_execucao, t.ordem
  loop
    begin
      select * into c from programacao where id = r.id;

      if c.substitui_id is null and not c.exclusao then
        -- Linha nova
        update programacao
        set situacao = 'APROVADA', aprovado_por = v_quem, aprovado_em = now(),
            override_motivo = case
              when p_liberar then coalesce(override_motivo, 'Aprovado da solicitação do supervisor')
              else override_motivo end
        where id = r.id;
        select * into c from programacao where id = r.id;
        perform registra_decisao_programacao('APROVOU', c, 'NOVA', null, null);

      elsif c.exclusao then
        -- Pedido para apagar: a oficial sai, o pedido fica como registro
        if c.substitui_id is not null then
          select * into o from programacao where id = c.substitui_id;
          perform registra_decisao_programacao('APROVOU', o, 'EXCLUSAO', null, null);
          update programacao
          set situacao = 'CANCELADA', substitui_id = null, aprovado_por = v_quem, aprovado_em = now()
          where id = c.id;
          delete from programacao where id = o.id;
        else
          update programacao
          set situacao = 'CANCELADA', aprovado_por = v_quem, aprovado_em = now()
          where id = c.id;
        end if;

      else
        -- Pedido de alteração: a oficial recebe os valores novos
        select * into o from programacao where id = c.substitui_id;
        update programacao
        set atividade_id   = c.atividade_id,
            encarregado_id = c.encarregado_id,
            data           = c.data,
            percentual     = c.percentual,
            observacao     = c.observacao,
            cabo           = c.cabo,
            override_motivo = case
              when p_liberar then coalesce(override_motivo, 'Alteração aprovada da solicitação do supervisor')
              else override_motivo end
        where id = o.id;
        perform registra_decisao_programacao('APROVOU', c, 'EDICAO', null, mudancas_do_pedido(o, c));
        update programacao
        set situacao = 'CANCELADA', aprovado_por = v_quem, aprovado_em = now()
        where id = c.id;
      end if;

      v_ok := v_ok + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object(
        'id', r.id, 'torre', r.torre, 'atividade', r.atividade, 'data', r.data, 'motivo', sqlerrm);
    end;
  end loop;

  -- Reprova o que não foi pedido para aprovar, com a justificativa
  for r in
    select pr.id from programacao pr
    where pr.solicitacao_id = p_id and pr.situacao = 'SOLICITADA' and not (pr.id = any (v_aprov))
  loop
    select * into c from programacao where id = r.id;
    update programacao
    set situacao = 'RECUSADA', motivo_recusa = btrim(p_motivo),
        aprovado_por = v_quem, aprovado_em = now()
    where id = r.id;
    perform registra_decisao_programacao(
      'REPROVOU', c,
      case when c.exclusao then 'EXCLUSAO' when c.substitui_id is not null then 'EDICAO' else 'NOVA' end,
      p_motivo,
      case when c.substitui_id is not null and not c.exclusao
           then mudancas_do_pedido((select p from programacao p where p.id = c.substitui_id), c) end);
    v_rec := v_rec + 1;
  end loop;

  perform set_config('sipav.sem_historico', '', true);

  -- O pacote fecha quando não sobra nada esperando
  select count(*) into v_pend from programacao where solicitacao_id = p_id and situacao = 'SOLICITADA';
  if v_pend = 0 then
    select count(*) filter (where situacao in ('APROVADA', 'CANCELADA')),
           count(*) filter (where situacao = 'RECUSADA')
    into v_total_ok, v_total_rec
    from programacao where solicitacao_id = p_id;

    update solicitacao
    set status = case when v_total_rec = 0 then 'APROVADA'
                      when v_total_ok = 0 then 'REPROVADA'
                      else 'PARCIAL' end,
        decidida_em = now(), decidida_por = v_quem
    where id = p_id;
  end if;

  return jsonb_build_object('aprovadas', v_ok, 'reprovadas', v_rec, 'falhas', v_falhas);
end;
$$;

insert into migracao (numero, arquivo)
values (56, '56-alteracao-do-supervisor-e-quem-decidiu.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência: as colunas, a função de decisão e os índices
-- =============================================================================
select 'coluna' as tipo, column_name as nome from information_schema.columns
 where table_name = 'programacao' and column_name in ('substitui_id', 'exclusao')
union all
select 'coluna do historico', column_name from information_schema.columns
 where table_name = 'programacao_historico' and column_name in ('de_quem_nome', 'motivo', 'tipo_pedido')
union all
select 'funcao', proname from pg_proc
 where proname in ('decidir_solicitacao', 'registra_decisao_programacao', 'mudancas_do_pedido', 'programacao_aprovada_dele')
union all
select 'indice', indexname from pg_indexes
 where tablename = 'programacao' and (indexname like 'programacao_sem_duplicata%' or indexname = 'programacao_um_pedido_por_linha')
order by 1, 2;
