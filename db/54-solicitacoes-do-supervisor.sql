-- =============================================================================
-- Solicitações do supervisor — 14/10/2026
-- =============================================================================
-- O supervisor monta a programação dos encarregados como PRÉ-PROGRAMAÇÃO e envia
-- para o planejamento analisar. Só entra como programação oficial quando for aprovada.
--
-- Como funciona:
--
--   solicitacao (o pacote)   RASCUNHO  → o supervisor está montando
--                            ENVIADA   → chegou para o planejamento
--                            DEVOLVIDA → o planejamento mandou de volta, com o motivo
--                            APROVADA  → virou programação oficial
--
--   programacao.situacao     SOLICITADA enquanto não aprovada; APROVADA depois.
--   programacao.solicitacao_id   a que pacote a linha pertence.
--
-- O que o supervisor pode fazer (o banco recusa o resto, não só a tela):
--   · criar, editar e apagar linhas SOLICITADA do próprio pacote, enquanto ele é
--     RASCUNHO ou DEVOLVIDA. Depois de enviado, não mexe mais.
--   · ver tudo o que está programado, inclusive o que os outros supervisores
--     solicitaram, para saber se o dia e a torre estão livres.
--   · NÃO altera a programação de outro supervisor, a oficial, o calendário, os
--     cadastros nem as atividades.
--
-- A precedência (a atividade que vem antes) não barra a pré-programação: ela é
-- conferida na aprovação, onde o planejamento vê o motivo e decide.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. O pacote
-- -----------------------------------------------------------------------------
create table if not exists solicitacao (
  id               uuid primary key default gen_random_uuid(),
  supervisor_id    uuid not null references perfil(id),
  trecho_id        uuid not null references trecho(id),
  status           text not null default 'RASCUNHO'
                     check (status in ('RASCUNHO', 'ENVIADA', 'DEVOLVIDA', 'APROVADA')),
  criada_em        timestamptz not null default now(),
  enviada_em       timestamptz,
  decidida_em      timestamptz,
  decidida_por     uuid references perfil(id),
  motivo_devolucao text
);

create index if not exists solicitacao_status_idx     on solicitacao (status, enviada_em);
create index if not exists solicitacao_supervisor_idx on solicitacao (supervisor_id, status);

alter table programacao
  add column if not exists solicitacao_id uuid references solicitacao(id) on delete set null;

create index if not exists programacao_solicitacao_idx
  on programacao (solicitacao_id) where solicitacao_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Quem enxerga e quem escreve
-- -----------------------------------------------------------------------------
alter table solicitacao enable row level security;

drop policy if exists solicitacao_leitura            on solicitacao;
drop policy if exists solicitacao_planejamento       on solicitacao;
drop policy if exists solicitacao_supervisor_insere  on solicitacao;

create policy solicitacao_leitura on solicitacao for select to authenticated
  using (papel_atual() in ('ADMIN', 'PLANEJAMENTO') or supervisor_id = auth.uid());

create policy solicitacao_planejamento on solicitacao for all to authenticated
  using (papel_atual() in ('ADMIN', 'PLANEJAMENTO'))
  with check (papel_atual() in ('ADMIN', 'PLANEJAMENTO'));

-- O supervisor só abre o próprio rascunho. Enviar é pela função enviar_solicitacao.
create policy solicitacao_supervisor_insere on solicitacao for insert to authenticated
  with check (papel_atual() = 'SUPERVISOR' and supervisor_id = auth.uid() and status = 'RASCUNHO');

-- Os supervisores precisam ler o nome uns dos outros ("Fulano já programou aqui")
drop policy if exists perfil_nomes_leitura on perfil;
create policy perfil_nomes_leitura on perfil for select to authenticated
  using (papel_atual() is not null);

-- O pacote é do supervisor e ainda está aberto para ele mexer?
create or replace function solicitacao_editavel(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from solicitacao s
    where s.id = p_id
      and s.supervisor_id = auth.uid()
      and s.status in ('RASCUNHO', 'DEVOLVIDA')
  );
$$;

drop policy if exists programacao_supervisor_insere on programacao;
drop policy if exists programacao_supervisor_edita  on programacao;
drop policy if exists programacao_supervisor_apaga  on programacao;

create policy programacao_supervisor_insere on programacao for insert to authenticated
  with check (
    papel_atual() = 'SUPERVISOR'
    and situacao = 'SOLICITADA'
    and criado_por = auth.uid()
    and solicitacao_id is not null
    and solicitacao_editavel(solicitacao_id)
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
  );

create policy programacao_supervisor_apaga on programacao for delete to authenticated
  using (
    papel_atual() = 'SUPERVISOR'
    and criado_por = auth.uid()
    and situacao = 'SOLICITADA'
    and solicitacao_id is not null
    and solicitacao_editavel(solicitacao_id)
  );

-- -----------------------------------------------------------------------------
-- 3. A precedência fica para a aprovação
-- -----------------------------------------------------------------------------
-- Mesma função da db/36, com uma diferença: linha SOLICITADA não é barrada pela
-- sequência. O supervisor pode pré-programar a atividade seguinte no mesmo pacote
-- da anterior, e quem decide é o planejamento, na aprovação (que roda esta função
-- de novo, já com situacao = APROVADA).
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

  if new.override_motivo is null and new.situacao <> 'SOLICITADA' then
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
-- 4. Limpar programação não leva as solicitações dos supervisores
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
      and pr.situacao <> 'SOLICITADA'
      and (p_de  is null or pr.data >= p_de)
      and (p_ate is null or pr.data <= p_ate)
    returning pr.id
  )
  select count(*) into v_apagadas from alvo;

  return v_apagadas;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. As três decisões, como função: o banco confere quem é quem
-- -----------------------------------------------------------------------------

-- O supervisor envia o pacote para análise
create or replace function enviar_solicitacao(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v solicitacao%rowtype;
begin
  select * into v from solicitacao where id = p_id;

  if not found or v.supervisor_id <> auth.uid() or papel_atual() <> 'SUPERVISOR' then
    raise exception 'Solicitação não encontrada.' using errcode = 'insufficient_privilege';
  end if;
  if v.status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'Esta solicitação já foi enviada.';
  end if;
  if not exists (select 1 from programacao where solicitacao_id = p_id and situacao = 'SOLICITADA') then
    raise exception 'Não há programação para enviar.';
  end if;

  update solicitacao
  set status = 'ENVIADA', enviada_em = now(),
      motivo_devolucao = null, decidida_em = null, decidida_por = null
  where id = p_id;
end;
$$;

-- O planejamento devolve para o supervisor corrigir, com o motivo
create or replace function devolver_solicitacao(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v solicitacao%rowtype;
begin
  if papel_atual() not in ('ADMIN', 'PLANEJAMENTO') then
    raise exception 'Só o planejamento devolve solicitações.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Diga o que está errado, para o supervisor saber o que corrigir.';
  end if;

  select * into v from solicitacao where id = p_id for update;
  if not found or v.status <> 'ENVIADA' then
    raise exception 'Esta solicitação não está aguardando análise.';
  end if;

  update solicitacao
  set status = 'DEVOLVIDA', motivo_devolucao = btrim(p_motivo),
      decidida_em = now(), decidida_por = auth.uid()
  where id = p_id;
end;
$$;

-- O planejamento aprova: cada linha vira APROVADA, uma a uma, em ordem de data e de execução.
-- A que a sequência barrar fica de fora, com o motivo, e o pacote continua ENVIADA com ela
-- (a menos que p_liberar mande aprovar mesmo assim, registrando isso na linha).
create or replace function aprovar_solicitacao(p_id uuid, p_liberar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v        solicitacao%rowtype;
  r        record;
  v_ok     integer := 0;
  v_falhas jsonb := '[]'::jsonb;
begin
  if papel_atual() not in ('ADMIN', 'PLANEJAMENTO') then
    raise exception 'Só o planejamento aprova solicitações.' using errcode = 'insufficient_privilege';
  end if;

  select * into v from solicitacao where id = p_id for update;
  if not found or v.status <> 'ENVIADA' then
    raise exception 'Esta solicitação não está aguardando análise.';
  end if;

  for r in
    select pr.id, t.identificador as torre, a.nome as atividade, pr.data
    from programacao pr
    join torre t     on t.id = pr.torre_id
    join atividade a on a.id = pr.atividade_id
    where pr.solicitacao_id = p_id and pr.situacao = 'SOLICITADA'
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

  if jsonb_array_length(v_falhas) = 0 then
    update solicitacao
    set status = 'APROVADA', decidida_em = now(), decidida_por = auth.uid()
    where id = p_id;
  end if;

  return jsonb_build_object('aprovadas', v_ok, 'falhas', v_falhas);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Tempo real: o planejamento vê o pacote chegar
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitacao'
  ) then
    alter publication supabase_realtime add table solicitacao;
  end if;
end $$;

insert into migracao (numero, arquivo)
values (54, '54-solicitacoes-do-supervisor.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que sair as três funções, a tabela e as políticas do supervisor.
select 'tabela' as tipo, 'solicitacao' as nome
union all
select 'funcao', proname from pg_proc
 where proname in ('enviar_solicitacao', 'devolver_solicitacao', 'aprovar_solicitacao', 'solicitacao_editavel')
union all
select 'politica', policyname from pg_policies
 where tablename in ('solicitacao', 'programacao') and policyname like '%supervisor%'
order by 1, 2;
