-- =============================================================================
-- Movimentação: o dia em que não há atividade na torre — 01/10/2026
-- =============================================================================
-- Tem dia em que um encarregado não está em torre nenhuma porque mudou de trecho,
-- e dia em que uma máquina é levada para outro trecho. Nos painéis esse dia
-- aparecia vazio, e vazio não diz nada: pode ser mudança, chuva, falta de
-- material, ou programação que ninguém lançou.
--
-- Esta tabela guarda a explicação. Não é programação: não tem torre nem
-- atividade, não entra em precedência, em aderência nem no relatório da ISA. É
-- só o registro de que "naquele dia, foi isso".
--
-- Três tipos, porque são os que existem:
--
--   MUDANCA_TRECHO   um encarregado vai de um trecho para outro
--   MUDANCA_MAQUINA  uma máquina vai de um trecho para outro
--   OUTRO            dia sem atividade por outro motivo, escrito na observação
--
-- A máquina é texto livre. Não existe cadastro de máquinas no SIPAV, e criar um
-- agora seria decidir o modelo antes de saber como vocês as identificam (placa,
-- prefixo, modelo). A tela sugere os nomes já usados, para a grafia não divergir.
--
-- Um registro aparece nos dois trechos: no de origem como "vai para", no de
-- destino como "vem de".
--
-- Idempotente.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_movimentacao') then
    create type tipo_movimentacao as enum ('MUDANCA_TRECHO', 'MUDANCA_MAQUINA', 'OUTRO');
  end if;
end $$;

create table if not exists movimentacao (
  id                uuid primary key default gen_random_uuid(),
  obra_id           uuid not null references obra(id) on delete cascade,
  tipo              tipo_movimentacao not null,

  data              date not null,
  data_fim          date,                    -- nulo = só o dia de "data"

  encarregado_id    uuid references encarregado(id),
  maquina           text,

  -- Sempre preenchido: é por ele que o registro é carregado no trecho. Em
  -- OUTRO é o trecho onde o dia ficou sem atividade.
  trecho_origem_id  uuid not null references trecho(id),
  trecho_destino_id uuid references trecho(id),

  observacao        text,

  criado_por        uuid references perfil(id),
  criado_em         timestamptz not null default now(),

  constraint movimentacao_periodo_ok check (data_fim is null or data_fim >= data),

  constraint movimentacao_destino_diferente
    check (trecho_destino_id is null or trecho_destino_id <> trecho_origem_id),

  -- Mudança de trecho é de alguém: sem encarregado não há quem mudou. Na de
  -- máquina o encarregado é opcional (quem opera ou responde por ela).
  constraint movimentacao_encarregado_exige
    check (tipo <> 'MUDANCA_TRECHO' or encarregado_id is not null),

  constraint movimentacao_destino_exige
    check (tipo = 'OUTRO' or trecho_destino_id is not null),

  constraint movimentacao_maquina_exige
    check (tipo <> 'MUDANCA_MAQUINA' or nullif(btrim(coalesce(maquina, '')), '') is not null),

  -- Dia sem atividade sem motivo escrito é exatamente o vazio que isto resolve
  constraint movimentacao_outro_exige
    check (tipo <> 'OUTRO' or nullif(btrim(coalesce(observacao, '')), '') is not null)
);

comment on table movimentacao is
  'Dia sem atividade na torre: encarregado ou máquina mudando de trecho, ou outro motivo. '
  'Não é programação e não entra em precedência nem em aderência.';

create index if not exists movimentacao_data_idx    on movimentacao (data);
create index if not exists movimentacao_origem_idx  on movimentacao (trecho_origem_id, data);
create index if not exists movimentacao_destino_idx on movimentacao (trecho_destino_id, data);

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
-- de novo: ela tem que aparecer, com o nome do trecho de origem e o de destino.
-- =============================================================================

select m.tipo,
       to_char(m.data, 'DD/MM/YYYY')                      as data,
       to_char(m.data_fim, 'DD/MM/YYYY')                  as ate,
       e.nome                                             as encarregado,
       m.maquina,
       tro.nome                                           as de,
       trd.nome                                           as para,
       m.observacao
from movimentacao m
left join encarregado e on e.id = m.encarregado_id
join trecho tro on tro.id = m.trecho_origem_id
left join trecho trd on trd.id = m.trecho_destino_id
order by m.data desc
limit 20;
