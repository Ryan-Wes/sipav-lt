-- =============================================================================
-- Correção de estágio no histórico — 24/09/2026
-- =============================================================================
-- O trigger de histórico observa `programacao`. A correção de estágio mexe em
-- `execucao`, que ficava de fora — a torre mudava de cor na grade e ninguém
-- sabia quem tinha mexido.
--
-- Não dá para resolver com trigger por linha: uma correção apaga e regrava dez
-- ou quinze execuções, o que viraria quinze linhas de log para uma única ação.
-- Em vez disso, uma função grava UMA linha dizendo o que aconteceu.
--
-- A função é security definer porque a tabela de histórico não tem política de
-- escrita — de propósito, para que a aplicação não consiga adulterar o log.
-- A checagem de papel é feita aqui dentro, na mão.
--
-- Idempotente.
-- =============================================================================

-- 'ESTAGIO' passa a ser uma ação válida
alter table programacao_historico drop constraint if exists programacao_historico_acao_check;
alter table programacao_historico add constraint programacao_historico_acao_check
  check (acao in ('CRIOU', 'ALTEROU', 'REMOVEU', 'ESTAGIO'));

create or replace function registrar_correcao_estagio(
  p_torre_id uuid,
  p_estagio  text,
  p_anterior text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_quem uuid := auth.uid();
  v_nome text;
begin
  if papel_atual() not in ('ADMIN', 'PLANEJAMENTO', 'SUPERVISOR') then
    raise exception 'Sem permissão para corrigir estágio' using errcode = '42501';
  end if;

  select nome into v_nome from perfil where id = v_quem;

  insert into programacao_historico (
    acao, quem, quem_nome,
    torre_id, torre_identificador, trecho_id,
    atividade_nome, mudancas
  )
  select
    'ESTAGIO', v_quem, coalesce(v_nome, 'desconhecido'),
    t.id, t.identificador, t.trecho_id,
    p_estagio,
    case when p_anterior is distinct from p_estagio
         then jsonb_build_object('estagio', jsonb_build_object(
                'de',   coalesce(p_anterior, 'nada executado'),
                'para', coalesce(p_estagio,  'nada executado')))
         else null end
  from torre t
  where t.id = p_torre_id;
end;
$$;

comment on function registrar_correcao_estagio is
  'Grava uma linha de histórico para a correção manual do estágio de uma torre. '
  'Uma ação, uma linha, ainda que reescreva dezenas de execuções.';
