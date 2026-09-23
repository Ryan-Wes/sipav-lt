-- =============================================================================
-- Planejamento de Avanço de Obra — Schema V1
-- Postgres / Supabase
-- =============================================================================
-- Princípios que guiaram este modelo:
--  1. Obra → Trecho → Torre (o protótipo tinha lista plana, um HTML por trecho)
--  2. "Última atividade executada" é DERIVADA do histórico, não um campo editável
--  3. Restrição é entidade própria, não um valor de status (uma torre pode estar
--     escavada E travada por questão fundiária ao mesmo tempo)
--  4. Programado e Executado são coisas separadas — é isso que destrava
--     produtividade, aderência e curva de avanço
--  5. Regras de precedência vivem no banco, não no cliente. Não dá pra burlar.
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

create type papel_usuario as enum (
  'ADMIN',         -- configura tudo
  'PLANEJAMENTO',  -- programa, aprova solicitações, importa dados
  'SUPERVISOR',    -- faz pré-programação, solicita aprovação, aponta execução
  'LEITURA'        -- só visualiza (fiscalização, diretoria)
);

create type tipo_restricao as enum (
  'AMBIENTAL',
  'FUNDIARIA',
  'OUTRA'
);

create type situacao_programacao as enum (
  'SOLICITADA',   -- supervisor pré-programou, aguarda aceite do planejamento
  'APROVADA',     -- vale, entra nos relatórios
  'RECUSADA',
  'CANCELADA'
);

-- =============================================================================
-- OBRA / TRECHO / TORRE
-- =============================================================================

create table obra (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  codigo      text unique,
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table trecho (
  id          uuid primary key default gen_random_uuid(),
  obra_id     uuid not null references obra(id) on delete cascade,
  nome        text not null,               -- 'Buritirama–Correntina'
  ordem       integer not null default 0,  -- ordem de exibição no dropdown
  criado_em   timestamptz not null default now(),
  unique (obra_id, nome)
);

create table torre (
  id            uuid primary key default gen_random_uuid(),
  trecho_id     uuid not null references trecho(id) on delete cascade,
  identificador text not null,                       -- '118/2'
  ordem         integer not null default 0,          -- posição na linha; define a grade
  km            numeric(10,3) not null default 0.400,-- extensão do vão
  destaque      boolean not null default false,      -- HIGHLIGHT_TOWERS do protótipo
  criado_em     timestamptz not null default now(),
  unique (trecho_id, identificador)
);

create index torre_trecho_ordem_idx on torre (trecho_id, ordem);

-- =============================================================================
-- CATÁLOGO DE ATIVIDADES + PRECEDÊNCIA
-- =============================================================================

create table atividade (
  id             uuid primary key default gen_random_uuid(),
  obra_id        uuid not null references obra(id) on delete cascade,
  nome           text not null,
  ordem_execucao integer not null,                 -- ordena dropdowns e listas (post-it 2)
  cor_fundo      text not null default '#c1d3ec',
  cor_texto      text not null default '#ffffff',
  icone          text not null default 'circle-dashed',  -- nome do ícone Lucide
  obrigatoria    boolean not null default true,    -- false = condicional (ex.: ancoragem em rocha)
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  unique (obra_id, nome),
  unique (obra_id, ordem_execucao) deferrable initially deferred
);

-- Precedência explícita. Tabela separada de ordem_execucao de propósito:
-- ordem_execucao é só exibição; a regra de bloqueio real mora aqui, e permite
-- casos que uma ordem linear não representa (duas atividades paralelas que
-- ambas travam uma terceira).
create table atividade_dependencia (
  atividade_id        uuid not null references atividade(id) on delete cascade,
  requer_atividade_id uuid not null references atividade(id) on delete cascade,
  primary key (atividade_id, requer_atividade_id),
  check (atividade_id <> requer_atividade_id)
);

-- =============================================================================
-- PESSOAS
-- =============================================================================

-- Espelha auth.users do Supabase com o papel na aplicação.
create table perfil (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  papel      papel_usuario not null default 'LEITURA',
  obra_id    uuid references obra(id) on delete set null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table encarregado (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references obra(id) on delete cascade,
  nome       text not null,
  ativo      boolean not null default true,
  -- Vínculo opcional com um login. Preenchido quando o encarregado também
  -- acessa o sistema pra fazer a própria pré-programação.
  perfil_id  uuid references perfil(id) on delete set null,
  criado_em  timestamptz not null default now(),
  unique (obra_id, nome)
);

-- =============================================================================
-- RESTRIÇÕES
-- =============================================================================

create table restricao (
  id                 uuid primary key default gen_random_uuid(),
  torre_id           uuid not null references torre(id) on delete cascade,
  tipo               tipo_restricao not null,
  descricao          text,
  data_inicio        date not null default current_date,
  previsao_liberacao date,
  data_liberacao     date,          -- null = ainda travada
  criado_por         uuid references perfil(id),
  criado_em          timestamptz not null default now()
);

create index restricao_torre_ativa_idx
  on restricao (torre_id) where data_liberacao is null;

-- =============================================================================
-- PROGRAMAÇÃO (o que se pretende fazer)
-- =============================================================================

create table programacao (
  id              uuid primary key default gen_random_uuid(),
  torre_id        uuid not null references torre(id) on delete cascade,
  atividade_id    uuid not null references atividade(id) on delete restrict,
  encarregado_id  uuid references encarregado(id) on delete set null,
  data            date not null,
  situacao        situacao_programacao not null default 'APROVADA',
  observacao      text,

  -- Quando o planejamento decide programar mesmo com bloqueio, precisa dizer
  -- por quê. O sistema avisa e registra; não impede. (regra R6)
  override_motivo text,

  criado_por      uuid references perfil(id),
  aprovado_por    uuid references perfil(id),
  aprovado_em     timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- Mesma atividade, mesma torre, mesmo dia, duas vezes: não faz sentido
  unique (torre_id, atividade_id, data)
);

create index programacao_data_idx on programacao (data);
create index programacao_torre_idx on programacao (torre_id);
create index programacao_encarregado_data_idx on programacao (encarregado_id, data);

-- =============================================================================
-- EXECUÇÃO (o que de fato aconteceu)
-- =============================================================================
-- Não entra na UI da V1, mas o modelo já nasce certo. É desta tabela que saem
-- produtividade por encarregado, programado × executado e curva de avanço.

create table execucao (
  id              uuid primary key default gen_random_uuid(),
  torre_id        uuid not null references torre(id) on delete cascade,
  atividade_id    uuid not null references atividade(id) on delete restrict,
  encarregado_id  uuid references encarregado(id) on delete set null,
  programacao_id  uuid references programacao(id) on delete set null,  -- null = executou sem estar programado
  data_execucao   date not null,
  percentual      numeric(5,2) not null default 100.00 check (percentual > 0 and percentual <= 100),
  observacao      text,
  registrado_por  uuid references perfil(id),
  criado_em       timestamptz not null default now()
);

create index execucao_torre_idx on execucao (torre_id);
create index execucao_data_idx on execucao (data_execucao);
create index execucao_encarregado_idx on execucao (encarregado_id, data_execucao);

-- =============================================================================
-- VIEWS DE APOIO
-- =============================================================================

-- Substitui o app_tower_status do protótipo: agora é derivado, não digitado.
-- security_invoker = true é obrigatório: sem isso a view roda com a permissão do
-- dono e atravessa a RLS das tabelas de baixo.
create or replace view torre_situacao with (security_invoker = true) as
select
  t.id                        as torre_id,
  t.trecho_id,
  t.identificador,
  t.ordem,
  t.km,
  ua.atividade_id             as ultima_atividade_id,
  ua.nome                     as ultima_atividade,
  ua.cor_fundo                as ultima_atividade_cor,
  ua.icone                    as ultima_atividade_icone,
  ua.data_execucao            as ultima_execucao_em,
  r.tipo                      as restricao_tipo,
  r.previsao_liberacao        as restricao_previsao,
  (r.id is not null)          as tem_restricao
from torre t
left join lateral (
  select a.id as atividade_id, a.nome, a.cor_fundo, a.icone, e.data_execucao
  from execucao e
  join atividade a on a.id = e.atividade_id
  where e.torre_id = t.id
  order by a.ordem_execucao desc, e.data_execucao desc
  limit 1
) ua on true
left join lateral (
  select id, tipo, previsao_liberacao
  from restricao
  where torre_id = t.id and data_liberacao is null
  order by data_inicio
  limit 1
) r on true;

-- =============================================================================
-- REGRA DE PRECEDÊNCIA — a validação vive aqui, não no cliente
-- =============================================================================

-- Retorna null se pode programar, ou o motivo do bloqueio.
create or replace function motivo_bloqueio_programacao(
  p_torre_id     uuid,
  p_atividade_id uuid,
  p_data         date
) returns text
language plpgsql stable as $$
declare
  v_restricao   record;
  v_pendente    text;
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

  -- 2. Pré-requisitos não executados e nem programados para data anterior
  select string_agg(dep.nome, ', ' order by dep.ordem_execucao)
  into v_pendente
  from atividade_dependencia ad
  join atividade dep on dep.id = ad.requer_atividade_id
  where ad.atividade_id = p_atividade_id
    and not exists (
      select 1 from execucao e
      where e.torre_id = p_torre_id
        and e.atividade_id = dep.id
        and e.data_execucao <= p_data
    )
    and not exists (
      select 1 from programacao pr
      where pr.torre_id = p_torre_id
        and pr.atividade_id = dep.id
        and pr.data < p_data
        and pr.situacao = 'APROVADA'
    );

  if v_pendente is not null then
    return format('Depende de: %s — não executada nem programada para antes desta data', v_pendente);
  end if;

  return null;
end;
$$;

-- Aplica a regra na escrita. Bloqueia, a não ser que o planejamento
-- justifique o override.
create or replace function valida_programacao() returns trigger
language plpgsql as $$
declare
  v_motivo text;
begin
  if new.data < current_date and new.override_motivo is null then
    raise exception 'Data retroativa (%). Informe uma justificativa para programar no passado.',
      to_char(new.data, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

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

create trigger programacao_valida
  before insert or update on programacao
  for each row execute function valida_programacao();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table obra                  enable row level security;
alter table trecho                enable row level security;
alter table torre                 enable row level security;
alter table atividade             enable row level security;
alter table atividade_dependencia enable row level security;
alter table perfil                enable row level security;
alter table encarregado           enable row level security;
alter table restricao             enable row level security;
alter table programacao           enable row level security;
alter table execucao              enable row level security;

create or replace function papel_atual() returns papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from perfil where id = auth.uid() and ativo;
$$;

-- Qualquer usuário autenticado e ativo enxerga os dados da obra.
-- (V1: obra única. Quando houver mais de uma, filtrar por perfil.obra_id.)
do $$
declare t text;
begin
  foreach t in array array['obra','trecho','torre','atividade','atividade_dependencia',
                           'encarregado','restricao','programacao','execucao']
  loop
    execute format(
      'create policy %I_leitura on %I for select to authenticated using (papel_atual() is not null)',
      t, t);
  end loop;
end $$;

-- Escrita de configuração: só ADMIN e PLANEJAMENTO
do $$
declare t text;
begin
  foreach t in array array['obra','trecho','torre','atividade','atividade_dependencia',
                           'encarregado','restricao']
  loop
    execute format(
      'create policy %I_escrita on %I for all to authenticated
         using (papel_atual() in (''ADMIN'',''PLANEJAMENTO''))
         with check (papel_atual() in (''ADMIN'',''PLANEJAMENTO''))',
      t, t);
  end loop;
end $$;

-- Programação: planejamento faz tudo; supervisor só cria SOLICITADA e só mexe na própria
create policy programacao_planejamento on programacao for all to authenticated
  using (papel_atual() in ('ADMIN','PLANEJAMENTO'))
  with check (papel_atual() in ('ADMIN','PLANEJAMENTO'));

create policy programacao_supervisor_insere on programacao for insert to authenticated
  with check (papel_atual() = 'SUPERVISOR' and situacao = 'SOLICITADA' and criado_por = auth.uid());

create policy programacao_supervisor_edita on programacao for update to authenticated
  using (papel_atual() = 'SUPERVISOR' and criado_por = auth.uid() and situacao = 'SOLICITADA')
  with check (situacao = 'SOLICITADA');

create policy programacao_supervisor_apaga on programacao for delete to authenticated
  using (papel_atual() = 'SUPERVISOR' and criado_por = auth.uid() and situacao = 'SOLICITADA');

-- Execução: planejamento e supervisor apontam
create policy execucao_escrita on execucao for all to authenticated
  using (papel_atual() in ('ADMIN','PLANEJAMENTO','SUPERVISOR'))
  with check (papel_atual() in ('ADMIN','PLANEJAMENTO','SUPERVISOR'));

-- Perfil: cada um lê o próprio; admin gerencia todos
create policy perfil_proprio on perfil for select to authenticated using (id = auth.uid());
create policy perfil_admin   on perfil for all    to authenticated
  using (papel_atual() = 'ADMIN') with check (papel_atual() = 'ADMIN');

-- =============================================================================
-- REALTIME — é o que entrega o trabalho simultâneo
-- =============================================================================

alter publication supabase_realtime add table programacao;
alter publication supabase_realtime add table execucao;
alter publication supabase_realtime add table restricao;
