-- =============================================================================
-- Movimentação: o dia em que não há atividade na torre — 01/10/2026
-- =============================================================================
-- Tem dia em que um encarregado não está em torre nenhuma porque mudou de
-- canteiro, e dia em que uma máquina é levada para outro canteiro ou para outra
-- torre. Nos painéis esse dia aparecia vazio, e vazio não diz nada: pode ser
-- mudança, chuva, falta de material, ou programação que ninguém lançou.
--
-- Esta tabela guarda a explicação. Não é programação: não entra em precedência,
-- em aderência nem no relatório da ISA. É só o registro de que "naquele dia, foi
-- isso". Vale um dia só; se se repete no dia seguinte, registra-se de novo.
--
-- Três tipos, porque são os que existem:
--
--   MUDANCA_TRECHO   (encarregado) vai de um canteiro para outro
--   MUDANCA_MAQUINA  máquina vai de um canteiro para outro, OU de uma torre
--                    para outra dentro do mesmo canteiro
--   OUTRO            dia sem atividade por outro motivo, escrito na observação
--
-- O nome MUDANCA_TRECHO ficou porque é como a obra chama ("mudança de trecho
-- (encarregado)"), embora o que muda seja o canteiro.
--
-- A máquina é texto livre. Não existe cadastro de máquinas no SIPAV, e criar um
-- agora seria decidir o modelo antes de saber como vocês as identificam (placa,
-- prefixo, modelo). A tela sugere os nomes já usados, para a grafia não divergir.
--
-- trecho_id é o trecho em que o registro foi feito. Como o canteiro atende mais
-- de um trecho, a tela também mostra a movimentação no trecho dos canteiros e
-- das torres envolvidas.
--
-- Esta versão substitui a primeira, que usava trecho de origem e destino e tinha
-- data final. Se a tabela antiga existir VAZIA ela é refeita; se tiver registro
-- a execução para, para nada ser perdido sem você ver.
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
  maquina             text,

  canteiro_origem_id  uuid references canteiro(id) on delete cascade,
  canteiro_destino_id uuid references canteiro(id) on delete cascade,
  torre_origem_id     uuid references torre(id)    on delete cascade,
  torre_destino_id    uuid references torre(id)    on delete cascade,

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
      and torre_origem_id is null
      and torre_destino_id is null
    )
  ),

  -- Mudança de trecho da máquina: ou muda de canteiro, ou muda de torre. Nunca
  -- os dois ao mesmo tempo, e sempre com origem e destino diferentes.
  constraint movimentacao_maquina_ok check (
    tipo <> 'MUDANCA_MAQUINA' or (
      nullif(btrim(coalesce(maquina, '')), '') is not null
      and (
        (canteiro_origem_id is not null and canteiro_destino_id is not null
          and canteiro_origem_id <> canteiro_destino_id
          and torre_origem_id is null and torre_destino_id is null)
        or
        (torre_origem_id is not null and torre_destino_id is not null
          and torre_origem_id <> torre_destino_id
          and canteiro_origem_id is null and canteiro_destino_id is null)
      )
    )
  ),

  -- Dia sem atividade sem motivo escrito é exatamente o vazio que isto resolve
  constraint movimentacao_outro_ok check (
    tipo <> 'OUTRO' or (
      nullif(btrim(coalesce(observacao, '')), '') is not null
      and canteiro_origem_id is null and canteiro_destino_id is null
      and torre_origem_id is null and torre_destino_id is null
    )
  )
);

comment on table movimentacao is
  'Dia sem atividade na torre: encarregado mudando de canteiro, máquina mudando de canteiro ou de torre, '
  'ou outro motivo. Vale um dia só. Não é programação e não entra em precedência nem em aderência.';

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
-- de novo: ela tem que aparecer, com canteiros ou torres conforme o tipo.
-- =============================================================================

select m.tipo,
       to_char(m.data, 'DD/MM/YYYY') as data,
       e.nome                        as encarregado,
       m.maquina,
       co.nome                       as do_canteiro,
       cd.nome                       as para_canteiro,
       tor.identificador             as da_torre,
       tde.identificador             as para_torre,
       m.observacao
from movimentacao m
left join encarregado e on e.id = m.encarregado_id
left join canteiro co  on co.id  = m.canteiro_origem_id
left join canteiro cd  on cd.id  = m.canteiro_destino_id
left join torre    tor on tor.id = m.torre_origem_id
left join torre    tde on tde.id = m.torre_destino_id
order by m.data desc
limit 20;
