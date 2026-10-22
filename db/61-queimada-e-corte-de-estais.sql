-- =============================================================================
-- Supressão de área de queimada e corte de estais viram atividades — 22/10/2026
-- =============================================================================
-- As planilhas da ISA têm programação nesses dois itens e o SIPAV não tinha onde gravar:
--
--   1.3.4  SUPRESSÃO / LIMPEZA DE ÁREA DE QUEIMADA   [KM]
--   3.0.1  CORTE DE ESTAIS                           [TORRE]  só estaiada
--
-- As duas são condicionais e sem dependência: a cadeia delas eu confirmo com o campo antes de travar
-- qualquer coisa. O alinhamento da faixa para supressão fica de fora, porque ninguém lançou até hoje.
--
-- A ordem é única por obra. Se a que eu quero já estiver ocupada, a atividade vai para o fim da lista:
-- é só exibição, a regra de bloqueio mora nas dependências.
--
-- Idempotente.
-- =============================================================================

do $$
declare
  v_obra  uuid := (select id from obra where codigo = 'SD');
  v       record;
  v_ordem integer;
begin
  for v in
    select * from (values
      ('SUPRESSÃO DE ÁREA DE QUEIMADA', 55,  '#ff8a65', 'flame',    null::text),
      ('CORTE DE ESTAIS',               255, '#90a4ae', 'scissors', 'ESTAIADA')
    ) as x(nome, ordem, cor, icone, estrutura)
  loop
    continue when exists (select 1 from atividade where obra_id = v_obra and nome = v.nome);

    v_ordem := v.ordem;
    if exists (select 1 from atividade where obra_id = v_obra and ordem_execucao = v_ordem) then
      select max(ordem_execucao) + 1 into v_ordem from atividade where obra_id = v_obra;
    end if;

    insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria, so_para_estrutura)
    values (v_obra, v.nome, v_ordem, v.cor, '#ffffff', v.icone, false, v.estrutura::tipo_estrutura);
  end loop;
end $$;

insert into migracao (numero, arquivo)
values (61, '61-queimada-e-corte-de-estais.sql')
on conflict (numero) do nothing;

-- Conferência: tem que sair as duas, condicionais
select ordem_execucao, nome, obrigatoria, so_para_estrutura
from atividade
where obra_id = (select id from obra where codigo = 'SD')
  and nome in ('SUPRESSÃO DE ÁREA DE QUEIMADA', 'CORTE DE ESTAIS')
order by ordem_execucao;