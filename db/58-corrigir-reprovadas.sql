-- =============================================================================
-- O supervisor corrige as programações reprovadas e reapresenta — 15/10/2026
-- =============================================================================
-- A programação reprovada fica no pacote antigo, já decidido, e o supervisor não pode mexer nela
-- direto (a política de edição só vale para SOLICITADA de pacote aberto). Esta função é o caminho:
-- ele escolhe uma ou várias reprovadas dele, diz o que muda (em p_campos, só as chaves que mudam)
-- e elas voltam a ser pré-programação, no pacote aberto que ele indicar, prontas para enviar de novo.
--
--   p_campos  { "encarregado_id": "...", "atividade_id": "...", "data": "2026-10-20",
--               "percentual": 100, "observacao": "...", "cabo": "..." }
--             Chave ausente = não mexe. Chave com null = limpa o campo.
--
-- O que o banco confere (não só a tela): é supervisor, a linha é dele e está reprovada, não é pedido
-- de apagar, e o pacote de destino é dele e está aberto (RASCUNHO ou DEVOLVIDA). A linha que não passar
-- (por exemplo, já existe a mesma torre, atividade, dia e encarregado) volta na lista de falhas, e as
-- outras seguem.
--
-- Idempotente. Depende da 54, da 55 e da 56.
-- =============================================================================

create or replace function reapresentar_reprovadas(
  p_ids         uuid[],
  p_solicitacao uuid,
  p_campos      jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r        record;
  n        programacao%rowtype;
  v_ok     integer := 0;
  v_falhas jsonb := '[]'::jsonb;
  v_campos jsonb := coalesce(p_campos, '{}'::jsonb);
begin
  if papel_atual() <> 'SUPERVISOR' then
    raise exception 'Só o supervisor corrige as programações reprovadas.' using errcode = 'insufficient_privilege';
  end if;
  if not solicitacao_editavel(p_solicitacao) then
    raise exception 'A solicitação para onde elas vão não está aberta para edição.';
  end if;

  -- Os valores novos, já com o tipo certo de cada coluna
  select * into n from jsonb_populate_record(null::programacao, v_campos);

  for r in
    select pr.id, t.identificador as torre, a.nome as atividade, pr.data
    from programacao pr
    join torre t     on t.id = pr.torre_id
    join atividade a on a.id = pr.atividade_id
    where pr.id = any (coalesce(p_ids, '{}'::uuid[]))
      and pr.situacao = 'RECUSADA'
      and pr.criado_por = auth.uid()
      and not pr.exclusao
  loop
    begin
      update programacao
      set situacao       = 'SOLICITADA',
          solicitacao_id = p_solicitacao,
          motivo_recusa  = null,
          aprovado_por   = null,
          aprovado_em    = null,
          atividade_id   = case when (v_campos -> 'atividade_id')   is not null then n.atividade_id   else atividade_id   end,
          encarregado_id = case when (v_campos -> 'encarregado_id') is not null then n.encarregado_id else encarregado_id end,
          data           = case when (v_campos -> 'data')           is not null then n.data           else data           end,
          percentual     = case when (v_campos -> 'percentual')     is not null then n.percentual     else percentual     end,
          observacao     = case when (v_campos -> 'observacao')     is not null then n.observacao     else observacao     end,
          cabo           = case when (v_campos -> 'cabo')           is not null then n.cabo           else cabo           end
      where id = r.id;
      v_ok := v_ok + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object(
        'id', r.id, 'torre', r.torre, 'atividade', r.atividade, 'data', r.data, 'motivo', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('corrigidas', v_ok, 'falhas', v_falhas);
end;
$$;

insert into migracao (numero, arquivo)
values (58, '58-corrigir-reprovadas.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência: a função
-- =============================================================================
select 'funcao' as tipo, proname as nome from pg_proc where proname = 'reapresentar_reprovadas';
