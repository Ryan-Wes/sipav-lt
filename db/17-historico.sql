-- =============================================================================
-- Histórico de alterações da programação — 23/09/2026
-- =============================================================================
-- Com várias pessoas programando a mesma obra ao mesmo tempo, "quem mudou
-- isso?" vira pergunta de rotina. Hoje só existe `criado_por`: alteração não
-- deixa rastro e remoção some sem deixar nada.
--
-- O registro é feito por trigger no banco, não pelo aplicativo. Assim vale
-- para qualquer caminho de escrita — inclusive SQL rodado na mão.
--
-- A tabela é DESNORMALIZADA de propósito: guarda o nome da torre, da atividade,
-- do encarregado e de quem mexeu, em texto. Um log de auditoria precisa
-- continuar legível mesmo que a atividade seja renomeada, o encarregado
-- desativado ou a programação apagada.
--
-- Idempotente.
-- =============================================================================

create table if not exists programacao_historico (
  id                  bigserial primary key,
  quando              timestamptz not null default now(),
  acao                text not null check (acao in ('CRIOU', 'ALTEROU', 'REMOVEU')),

  quem                uuid,
  quem_nome           text,

  programacao_id      uuid,          -- sem chave estrangeira: a linha pode ter sido apagada
  torre_id            uuid,
  torre_identificador text,
  trecho_id           uuid,

  atividade_nome      text,
  encarregado_nome    text,
  data                date,
  situacao            text,
  observacao          text,
  override_motivo     text,

  mudancas            jsonb          -- só em ALTEROU: { campo: { de, para } }
);

create index if not exists historico_torre_idx  on programacao_historico (torre_id, quando desc);
create index if not exists historico_trecho_idx on programacao_historico (trecho_id, quando desc);

-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------
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

drop trigger if exists programacao_historico_trg on programacao;
create trigger programacao_historico_trg
  after insert or update or delete on programacao
  for each row execute function registra_historico_programacao();

-- -----------------------------------------------------------------------------
-- RLS: todo mundo lê, ninguém escreve
-- -----------------------------------------------------------------------------
-- Não existe política de insert, update ou delete de propósito. Só o trigger
-- escreve, e ele é security definer — ou seja, o histórico não pode ser
-- adulterado nem apagado pela aplicação.
alter table programacao_historico enable row level security;

drop policy if exists historico_leitura on programacao_historico;
create policy historico_leitura on programacao_historico for select to authenticated
  using (papel_atual() is not null);

select count(*) as linhas_de_historico from programacao_historico;
