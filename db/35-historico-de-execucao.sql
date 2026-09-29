-- =============================================================================
-- Apontamento de execução no histórico — 29/09/2026
-- =============================================================================
-- O histórico cobria a programação, que é plano. A execução, que é fato, ficava
-- de fora: apontar, corrigir e principalmente DESFAZER não deixavam rastro.
--
-- É o buraco que mais incomoda, porque a execução é o número que sai daqui e
-- vai para o cliente. Desfazer um apontamento fazia a linha sumir como se nunca
-- tivesse existido, e a medição da semana mudava sem ninguém saber por quê.
--
-- Mesmo desenho do histórico de programação da db/17: trigger no banco, para
-- valer em qualquer caminho de escrita, inclusive SQL rodado na mão; e tabela
-- desnormalizada, guardando os nomes em texto, para continuar legível depois de
-- a atividade ser renomeada ou a torre apagada.
--
-- A carga inicial NÃO entra. Ela é retrato do que já estava feito quando o
-- sistema chegou, escrita em bloco na importação — cinquenta torres viram
-- setecentas linhas de log que não dizem nada. Quem apagou carga inicial
-- aparece no histórico de correção de estágio, que a db/19 já registra.
--
-- Idempotente.
-- =============================================================================

create table if not exists execucao_historico (
  id                  bigserial primary key,
  quando              timestamptz not null default now(),
  acao                text not null check (acao in ('APONTOU', 'ALTEROU', 'DESFEZ')),

  quem                uuid,
  quem_nome           text,

  execucao_id         uuid,          -- sem chave estrangeira: a linha pode ter sido apagada
  programacao_id      uuid,          -- nulo quando executou sem estar programado
  torre_id            uuid,
  torre_identificador text,
  trecho_id           uuid,

  atividade_nome      text,
  encarregado_nome    text,
  data_execucao       date,
  percentual          numeric(5,2),
  observacao          text,

  mudancas            jsonb          -- só em ALTEROU: { campo: { de, para } }
);

create index if not exists execucao_hist_torre_idx
  on execucao_historico (torre_id, quando desc);
create index if not exists execucao_hist_trecho_idx
  on execucao_historico (trecho_id, quando desc);

-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------

create or replace function registra_historico_execucao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reg  record;
  v_acao text;
  v_quem uuid := auth.uid();
  v_nome text;
  v_mud  jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    v_acao := 'DESFEZ';  v_reg := old;
  elsif tg_op = 'INSERT' then
    v_acao := 'APONTOU'; v_reg := new;
  else
    v_acao := 'ALTEROU'; v_reg := new;
  end if;

  -- Carga inicial fica de fora, nos três casos: é escrita e reescrita em bloco
  -- pela importação, e viraria ruído que esconde o apontamento de verdade.
  if v_reg.carga_inicial then
    return null;
  end if;

  select nome into v_nome from perfil where id = v_quem;

  if tg_op = 'UPDATE' then
    if new.data_execucao is distinct from old.data_execucao then
      v_mud := v_mud || jsonb_build_object('data',
        jsonb_build_object('de', old.data_execucao, 'para', new.data_execucao));
    end if;

    if new.percentual is distinct from old.percentual then
      v_mud := v_mud || jsonb_build_object('percentual',
        jsonb_build_object('de', old.percentual, 'para', new.percentual));
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

    if new.observacao is distinct from old.observacao then
      v_mud := v_mud || jsonb_build_object('observacao',
        jsonb_build_object('de', old.observacao, 'para', new.observacao));
    end if;

    if v_mud = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into execucao_historico (
    acao, quem, quem_nome, execucao_id, programacao_id,
    torre_id, torre_identificador, trecho_id,
    atividade_nome, encarregado_nome, data_execucao, percentual, observacao, mudancas
  )
  select
    v_acao, v_quem, coalesce(v_nome, 'desconhecido'),
    v_reg.id, v_reg.programacao_id,
    v_reg.torre_id, t.identificador, t.trecho_id,
    (select nome from atividade   where id = v_reg.atividade_id),
    (select nome from encarregado where id = v_reg.encarregado_id),
    v_reg.data_execucao, v_reg.percentual, v_reg.observacao,
    case when tg_op = 'UPDATE' then v_mud else null end
  from torre t
  where t.id = v_reg.torre_id;

  return null;
end;
$$;

drop trigger if exists execucao_historico_trg on execucao;
create trigger execucao_historico_trg
  after insert or update or delete on execucao
  for each row execute function registra_historico_execucao();

-- -----------------------------------------------------------------------------
-- Leitura para quem está logado; escrita, ninguém
-- -----------------------------------------------------------------------------
-- Sem política de escrita de propósito: o log é gravado pelo trigger, que roda
-- como dono do banco. A aplicação não consegue adulterar nem apagar.
-- -----------------------------------------------------------------------------

alter table execucao_historico enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'execucao_historico' and policyname = 'execucao_historico_leitura'
  ) then
    create policy execucao_historico_leitura
      on execucao_historico for select to authenticated
      using (papel_atual() is not null);
  end if;
end $$;

insert into migracao (numero, arquivo)
values (35, '35-historico-de-execucao.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Aponte uma execução pela tela, desfaça, e rode isto: têm que aparecer as duas
-- linhas, APONTOU e DESFEZ, com o seu nome.
-- =============================================================================

select to_char(quando, 'DD/MM HH24:MI') as quando,
       acao,
       quem_nome,
       torre_identificador as torre,
       atividade_nome      as atividade,
       to_char(data_execucao, 'DD/MM/YYYY') as executada_em,
       percentual,
       mudancas
from execucao_historico
order by quando desc
limit 20;
