-- =============================================================================
-- Movimentação: o dia em que não há atividade na torre — 01/10/2026
-- =============================================================================
-- Tem dia em que um encarregado não está em torre nenhuma porque mudou de
-- canteiro, e dia em que uma máquina é deslocada. Nos painéis esse dia aparecia
-- vazio, e vazio não diz nada: pode ser mudança, chuva, falta de material, ou
-- programação que ninguém lançou.
--
-- Esta tabela guarda a explicação. Não é programação: não entra em precedência,
-- em aderência nem no relatório da ISA. É só o registro de que "naquele dia, foi
-- isso". Vale um dia só; se se repete no dia seguinte, registra-se de novo.
--
-- Três tipos, porque são os que existem:
--
--   MUDANCA_TRECHO   (encarregado) vai de um canteiro para outro
--   MUDANCA_MAQUINA  deslocamento de máquina. É só o registro no dia: na planilha
--                    de programação escrevia-se "mudança de máquina" e mais nada,
--                    então não há qual máquina, de onde nem para onde. A
--                    observação, opcional, diz o que quiserem
--   OUTRO            dia sem atividade por outro motivo, escrito na observação
--
-- O nome MUDANCA_TRECHO ficou porque é como a obra chama ("mudança de trecho
-- (encarregado)"), embora o que mude seja o canteiro. O MUDANCA_MAQUINA aparece na
-- tela como "Deslocamento de máquina".
--
-- trecho_id é o trecho em que o registro foi feito. Como o canteiro atende mais
-- de um trecho, a tela também mostra a mudança de encarregado no trecho dos
-- canteiros envolvidos.
--
-- Esta versão substitui as anteriores. A primeira usava trecho de origem e
-- destino e tinha data final; a segunda guardava máquina, canteiro e torre no
-- deslocamento. Se a primeira existir, a tabela é refeita quando estiver VAZIA; se
-- tiver registro a execução para, para nada ser perdido sem você ver. A segunda
-- é ajustada no lugar: sai a regra que exigia máquina e destino.
--
-- Idempotente.
-- =============================================================================

do $$
declare
  v_antiga boolean;
  v_linhas bigint;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'movimentacao'
      and column_name = 'trecho_origem_id'
  ) into v_antiga;

  if v_antiga then
    execute 'select count(*) from movimentacao' into v_linhas;
    if v_linhas > 0 then
      raise exception 'A tabela movimentacao antiga tem % registro(s). Nao foi alterada: me avise antes de seguir.', v_linhas;
    end if;
    drop table movimentacao;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_movimentacao') then
    create type tipo_movimentacao as enum ('MUDANCA_TRECHO', 'MUDANCA_MAQUINA', 'OUTRO');
  end if;
end $$;

create table if not exists movimentacao (
  id                  uuid primary key default gen_random_uuid(),
  obra_id             uuid not null references obra(id) on delete cascade,
  tipo                tipo_movimentacao not null,

  data                date not null,

  -- Trecho em que foi registrada
  trecho_id           uuid not null references trecho(id) on delete cascade,

  encarregado_id      uuid references encarregado(id),

  canteiro_origem_id  uuid references canteiro(id) on delete cascade,
  canteiro_destino_id uuid references canteiro(id) on delete cascade,

  observacao          text,

  criado_por          uuid references perfil(id),
  criado_em           timestamptz not null default now(),

  -- Mudança de trecho do encarregado: de um canteiro para outro, e de alguém.
  -- Sem encarregado não há quem mudou.
  constraint movimentacao_encarregado_ok check (
    tipo <> 'MUDANCA_TRECHO' or (
      encarregado_id is not null
      and canteiro_origem_id is not null
      and canteiro_destino_id is not null
      and canteiro_origem_id <> canteiro_destino_id
    )
  ),

  -- Dia sem atividade sem motivo escrito é exatamente o vazio que isto resolve
  constraint movimentacao_outro_ok check (
    tipo <> 'OUTRO' or (
      nullif(btrim(coalesce(observacao, '')), '') is not null
      and canteiro_origem_id is null and canteiro_destino_id is null
    )
  )
);

-- Se a tabela veio da segunda versão, tira a regra que exigia máquina e
-- canteiro ou torre no deslocamento. Num banco novo isto não faz nada.
alter table movimentacao drop constraint if exists movimentacao_maquina_ok;

comment on table movimentacao is
  'Dia sem atividade na torre: encarregado mudando de canteiro, deslocamento de máquina, ou outro motivo. '
  'Vale um dia só. Não é programação e não entra em precedência nem em aderência.';

create index if not exists movimentacao_data_idx   on movimentacao (data);
create index if not exists movimentacao_trecho_idx on movimentacao (trecho_id, data);

-- -----------------------------------------------------------------------------
-- Quem lê e quem escreve
-- -----------------------------------------------------------------------------
-- Lê qualquer um que esteja logado e ativo. Escreve só administração e
-- planejamento: é decisão de planejar o dia de gente e de máquina, e o supervisor
-- já tem o próprio caminho (programação solicitada, que o planejamento aprova).
-- -----------------------------------------------------------------------------

alter table movimentacao enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'movimentacao' and policyname = 'movimentacao_leitura') then
    create policy movimentacao_leitura on movimentacao
      for select to authenticated
      using (papel_atual() is not null);
  end if;

  if not exists (select 1 from pg_policies
                 where tablename = 'movimentacao' and policyname = 'movimentacao_escrita') then
    create policy movimentacao_escrita on movimentacao
      for all to authenticated
      using      (papel_atual() in ('ADMIN', 'PLANEJAMENTO'))
      with check (papel_atual() in ('ADMIN', 'PLANEJAMENTO'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Tempo real: quem está com a tela aberta vê a movimentação de outro planejador
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'movimentacao') then
    alter publication supabase_realtime add table movimentacao;
  end if;
end $$;

insert into migracao (numero, arquivo)
values (39, '39-movimentacao.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que sair vazio na primeira vez. Registre uma movimentação pela tela e rode
-- de novo: ela tem que aparecer, com os canteiros no caso da mudança de trecho.
-- =============================================================================

select m.tipo,
       to_char(m.data, 'DD/MM/YYYY') as data,
       e.nome                        as encarregado,
       co.nome                       as do_canteiro,
       cd.nome                       as para_canteiro,
       m.observacao
from movimentacao m
left join encarregado e on e.id = m.encarregado_id
left join canteiro co  on co.id  = m.canteiro_origem_id
left join canteiro cd  on cd.id  = m.canteiro_destino_id
order by m.data desc
limit 20;
