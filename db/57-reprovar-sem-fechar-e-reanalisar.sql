-- =============================================================================
-- Reprovar sem fechar a análise, e reanalisar — 15/10/2026
-- =============================================================================
-- 1. A decisão deixa de ser "aprova o que marquei e reprova o resto". Agora quem chama diz
--    exatamente o que aprovar (p_aprovar) e o que reprovar, cada uma com a sua justificativa
--    (p_reprovar, um objeto { id_da_linha: "motivo" }). O que não vier em nenhum dos dois
--    continua esperando análise, e o pacote só fecha quando não sobra nenhuma.
--
-- 2. reabrir_solicitacao desfaz decisões: as aprovadas voltam a ser pré-programação (saem da grade
--    oficial), as reprovadas voltam a esperar, uma alteração aprovada devolve à oficial o que ela
--    tinha antes, e um pedido de apagar aprovado traz a oficial de volta. Serve para o pacote
--    inteiro ou para linhas escolhidas, e só vale para a última solicitação daquele supervisor
--    naquele trecho (se ele já começou outra, não dá para reabrir a anterior).
--
--    Para isso o pedido de alteração ou de apagar guarda a oficial como ela era
--    (programacao.valores_anteriores) na hora em que é aprovado.
--
-- Idempotente. Depende da 54, da 55 e da 56.
-- =============================================================================

alter table programacao add column if not exists valores_anteriores jsonb;

alter table programacao_historico drop constraint if exists programacao_historico_acao_check;
alter table programacao_historico add constraint programacao_historico_acao_check
  check (acao in ('CRIOU', 'ALTEROU', 'REMOVEU', 'ESTAGIO', 'APROVOU', 'REPROVOU', 'PEDIU', 'REABRIU'));

-- A assinatura mudou: a antiga sai, para o banco não ficar com duas funções de mesmo nome
drop function if exists decidir_solicitacao(uuid, uuid[], text, boolean);

-- -----------------------------------------------------------------------------
-- 1. A decisão
-- -----------------------------------------------------------------------------
create or replace function decidir_solicitacao(
  p_id        uuid,
  p_aprovar   uuid[],
  p_reprovar  jsonb   default '{}'::jsonb,
  p_liberar   boolean default false
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
  v_rep    jsonb := coalesce(p_reprovar, '{}'::jsonb);
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

  if exists (select 1 from jsonb_each_text(v_rep) e where nullif(btrim(coalesce(e.value, '')), '') is null) then
    raise exception 'Escreva a justificativa da reprovação, para o supervisor saber o que corrigir.';
  end if;

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
        update programacao
        set situacao = 'APROVADA', aprovado_por = v_quem, aprovado_em = now(),
            override_motivo = case
              when p_liberar then coalesce(override_motivo, 'Aprovado da solicitação do supervisor')
              else override_motivo end
        where id = r.id;
        select * into c from programacao where id = r.id;
        perform registra_decisao_programacao('APROVOU', c, 'NOVA', null, null);

      elsif c.exclusao then
        if c.substitui_id is not null then
          select * into o from programacao where id = c.substitui_id;
          perform registra_decisao_programacao('APROVOU', o, 'EXCLUSAO', null, null);
          update programacao
          set situacao = 'CANCELADA', substitui_id = null, aprovado_por = v_quem, aprovado_em = now(),
              valores_anteriores = to_jsonb(o)
          where id = c.id;
          delete from programacao where id = o.id;
        else
          update programacao
          set situacao = 'CANCELADA', aprovado_por = v_quem, aprovado_em = now()
          where id = c.id;
        end if;

      else
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
        set situacao = 'CANCELADA', aprovado_por = v_quem, aprovado_em = now(),
            valores_anteriores = to_jsonb(o)
        where id = c.id;
      end if;

      v_ok := v_ok + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object(
        'id', r.id, 'torre', r.torre, 'atividade', r.atividade, 'data', r.data, 'motivo', sqlerrm);
    end;
  end loop;

  -- Reprova só o que foi pedido, cada uma com a sua justificativa
  for r in
    select pr.id, v_rep ->> (pr.id::text) as motivo
    from programacao pr
    where pr.solicitacao_id = p_id and pr.situacao = 'SOLICITADA'
      and not (pr.id = any (v_aprov))
      and (v_rep ->> (pr.id::text)) is not null
  loop
    select * into c from programacao where id = r.id;
    update programacao
    set situacao = 'RECUSADA', motivo_recusa = btrim(r.motivo),
        aprovado_por = v_quem, aprovado_em = now()
    where id = r.id;
    perform registra_decisao_programacao(
      'REPROVOU', c,
      case when c.exclusao then 'EXCLUSAO' when c.substitui_id is not null then 'EDICAO' else 'NOVA' end,
      r.motivo,
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

  return jsonb_build_object('aprovadas', v_ok, 'reprovadas', v_rec, 'falhas', v_falhas, 'fechada', v_pend = 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Reanalisar: desfaz decisões
-- -----------------------------------------------------------------------------
create or replace function reabrir_solicitacao(
  p_id      uuid,
  p_linhas  uuid[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v        solicitacao%rowtype;
  r        record;
  c        programacao%rowtype;
  o        programacao%rowtype;
  v_n      integer := 0;
  v_falhas jsonb := '[]'::jsonb;
begin
  if papel_atual() not in ('ADMIN', 'PLANEJAMENTO') then
    raise exception 'Só o planejamento reanalisa solicitações.' using errcode = 'insufficient_privilege';
  end if;

  select * into v from solicitacao where id = p_id for update;
  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;
  if v.status = 'RASCUNHO' then
    raise exception 'Esta solicitação ainda não foi enviada.';
  end if;

  -- Só a última do supervisor naquele trecho: com outra já aberta, reabrir esta bagunçaria as duas
  if exists (
       select 1 from solicitacao s
       where s.supervisor_id = v.supervisor_id and s.trecho_id = v.trecho_id and s.criada_em > v.criada_em
     )
  then
    raise exception 'O supervisor já começou outra solicitação neste trecho. Só a última pode ser reanalisada.';
  end if;

  perform set_config('sipav.sem_historico', '1', true);

  for r in
    select pr.id from programacao pr
    where pr.solicitacao_id = p_id
      and pr.situacao in ('APROVADA', 'CANCELADA', 'RECUSADA')
      and (p_linhas is null or pr.id = any (p_linhas))
  loop
    begin
      select * into c from programacao where id = r.id;

      if c.situacao = 'RECUSADA' then
        update programacao
        set situacao = 'SOLICITADA', motivo_recusa = null, aprovado_por = null, aprovado_em = null
        where id = c.id;

      elsif c.situacao = 'APROVADA' then
        -- Linha nova que tinha virado oficial: volta a ser pré-programação
        update programacao
        set situacao = 'SOLICITADA', aprovado_por = null, aprovado_em = null,
            override_motivo = case
              when override_motivo = 'Aprovado da solicitação do supervisor' then null
              else override_motivo end
        where id = c.id;

      elsif c.exclusao then
        -- Pedido de apagar que foi aprovado: a oficial volta como era
        if c.valores_anteriores is null then
          raise exception 'Esta aprovação é anterior ao registro do que havia antes, e não dá para restaurar.';
        end if;
        insert into programacao
          select * from jsonb_populate_record(null::programacao, c.valores_anteriores);
        update programacao
        set situacao = 'SOLICITADA', substitui_id = (c.valores_anteriores ->> 'id')::uuid,
            aprovado_por = null, aprovado_em = null, valores_anteriores = null
        where id = c.id;

      else
        -- Alteração que foi aprovada: a oficial volta ao que tinha
        if c.valores_anteriores is null then
          raise exception 'Esta aprovação é anterior ao registro do que havia antes, e não dá para restaurar.';
        end if;
        select * into o from jsonb_populate_record(null::programacao, c.valores_anteriores);
        update programacao
        set atividade_id    = o.atividade_id,
            encarregado_id  = o.encarregado_id,
            data            = o.data,
            percentual      = o.percentual,
            observacao      = o.observacao,
            cabo            = o.cabo,
            override_motivo = o.override_motivo
        where id = c.substitui_id;
        if not found then
          raise exception 'A programação oficial já não existe.';
        end if;
        update programacao
        set situacao = 'SOLICITADA', aprovado_por = null, aprovado_em = null, valores_anteriores = null
        where id = c.id;
      end if;

      perform registra_decisao_programacao(
        'REABRIU', c,
        case when c.exclusao then 'EXCLUSAO' when c.substitui_id is not null then 'EDICAO' else 'NOVA' end,
        null, null);
      v_n := v_n + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object('id', r.id, 'motivo', sqlerrm);
    end;
  end loop;

  perform set_config('sipav.sem_historico', '', true);

  -- O pacote volta a esperar análise (a devolvida também, mesmo sem linhas decididas)
  if v_n > 0 or v.status = 'DEVOLVIDA' then
    update solicitacao
    set status = 'ENVIADA', decidida_em = null, decidida_por = null, motivo_devolucao = null
    where id = p_id;
  end if;

  return jsonb_build_object('reabertas', v_n, 'falhas', v_falhas);
end;
$$;

insert into migracao (numero, arquivo)
values (57, '57-reprovar-sem-fechar-e-reanalisar.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência: a coluna e as duas funções (decidir_solicitacao tem que aparecer uma vez só)
-- =============================================================================
select 'coluna' as tipo, column_name as nome from information_schema.columns
 where table_name = 'programacao' and column_name = 'valores_anteriores'
union all
select 'funcao', proname || ' (' || pronargs || ' parametros)' from pg_proc
 where proname in ('decidir_solicitacao', 'reabrir_solicitacao')
order by 1, 2;
