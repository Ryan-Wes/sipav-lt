-- =============================================================================
-- Aprovar e reprovar por linha, com justificativa — 14/10/2026
-- =============================================================================
-- Na análise de uma solicitação o planejamento decide linha a linha: aprova as que
-- estão certas e reprova as outras, com a justificativa. As aprovadas viram
-- programação oficial na hora (e aparecem na grade para todo mundo). As reprovadas
-- ficam no pacote do supervisor, marcadas como RECUSADA e com o motivo, e não entram
-- em nenhuma visão oficial.
--
-- O pacote termina como:
--   APROVADA    tudo foi aprovado
--   PARCIAL     parte aprovada, parte reprovada
--   REPROVADA   tudo foi reprovado
-- (DEVOLVIDA continua existindo: devolver o pacote inteiro para o supervisor corrigir.)
--
-- Linha reprovada não pode travar uma nova tentativa: a trava de duplicata (db/49) passa
-- a ignorar o que está RECUSADA, para o supervisor poder programar de novo a mesma torre
-- no mesmo dia depois de corrigir.
--
-- Idempotente.
-- =============================================================================

alter table programacao add column if not exists motivo_recusa text;

alter table solicitacao drop constraint if exists solicitacao_status_check;
alter table solicitacao add constraint solicitacao_status_check
  check (status in ('RASCUNHO', 'ENVIADA', 'DEVOLVIDA', 'APROVADA', 'PARCIAL', 'REPROVADA'));

-- -----------------------------------------------------------------------------
-- 1. Duplicata: a linha reprovada não conta
-- -----------------------------------------------------------------------------
drop index if exists programacao_sem_duplicata;
drop index if exists programacao_sem_duplicata_cabo;

create unique index programacao_sem_duplicata
  on programacao (
    torre_id,
    atividade_id,
    data,
    coalesce(encarregado_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where cabo is null and situacao <> 'RECUSADA';

create unique index programacao_sem_duplicata_cabo
  on programacao (
    torre_id,
    atividade_id,
    data,
    coalesce(encarregado_id, '00000000-0000-0000-0000-000000000000'::uuid),
    cabo
  )
  where cabo is not null and situacao <> 'RECUSADA';

-- -----------------------------------------------------------------------------
-- 2. A sequência só barra quem vira APROVADA (reprovar nunca é barrado por ela)
-- -----------------------------------------------------------------------------
create or replace function valida_programacao() returns trigger
language plpgsql as $$
declare
  v_motivo    text;
  v_escolheu  boolean;
begin
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

  if new.override_motivo is null and new.situacao = 'APROVADA' then
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
-- 3. A decisão: o que vem em p_aprovar é aprovado; o resto do pacote é reprovado
-- -----------------------------------------------------------------------------
-- A linha que a sequência barrar fica SOLICITADA, com o pacote ENVIADA, e volta na lista
-- de falhas: dá para aprovar de novo com p_liberar (registrado na linha). Reprovar exige a
-- justificativa.
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

  -- Aprova uma a uma, em ordem de data e de execução
  for r in
    select pr.id, t.identificador as torre, a.nome as atividade, pr.data
    from programacao pr
    join torre t     on t.id = pr.torre_id
    join atividade a on a.id = pr.atividade_id
    where pr.solicitacao_id = p_id and pr.situacao = 'SOLICITADA' and pr.id = any (v_aprov)
    order by pr.data, a.ordem_execucao, t.ordem
  loop
    begin
      update programacao
      set situacao = 'APROVADA',
          aprovado_por = auth.uid(),
          aprovado_em = now(),
          override_motivo = case
            when p_liberar then coalesce(override_motivo, 'Aprovado da solicitação do supervisor')
            else override_motivo
          end
      where id = r.id;
      v_ok := v_ok + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object(
        'id', r.id, 'torre', r.torre, 'atividade', r.atividade, 'data', r.data, 'motivo', sqlerrm);
    end;
  end loop;

  -- Reprova o que não foi pedido para aprovar, com a justificativa
  update programacao
  set situacao = 'RECUSADA',
      motivo_recusa = btrim(p_motivo),
      aprovado_por = auth.uid(),
      aprovado_em = now()
  where solicitacao_id = p_id and situacao = 'SOLICITADA' and not (id = any (v_aprov));
  get diagnostics v_rec = row_count;

  -- O pacote fecha quando não sobra nada esperando
  select count(*) into v_pend from programacao where solicitacao_id = p_id and situacao = 'SOLICITADA';
  if v_pend = 0 then
    select count(*) filter (where situacao = 'APROVADA'), count(*) filter (where situacao = 'RECUSADA')
    into v_total_ok, v_total_rec
    from programacao where solicitacao_id = p_id;

    update solicitacao
    set status = case when v_total_rec = 0 then 'APROVADA'
                      when v_total_ok = 0 then 'REPROVADA'
                      else 'PARCIAL' end,
        decidida_em = now(), decidida_por = auth.uid()
    where id = p_id;
  end if;

  return jsonb_build_object('aprovadas', v_ok, 'reprovadas', v_rec, 'falhas', v_falhas);
end;
$$;

insert into migracao (numero, arquivo)
values (55, '55-aprovacao-por-linha.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência: a função, a coluna e os dois índices
-- =============================================================================
select 'funcao' as tipo, proname as nome from pg_proc where proname = 'decidir_solicitacao'
union all
select 'coluna', column_name from information_schema.columns
 where table_name = 'programacao' and column_name = 'motivo_recusa'
union all
select 'indice', indexname from pg_indexes
 where tablename = 'programacao' and indexname like 'programacao_sem_duplicata%'
order by 1, 2;
