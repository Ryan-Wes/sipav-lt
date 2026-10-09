-- =============================================================================
-- Desforma da fundação e seccionamento de cercas viram atividades — 09/10/2026
-- =============================================================================
-- A planilha da ISA de 12/10 trouxe programação em dois itens que o SIPAV não tinha:
--
--   2.1.12  DESFORMA FUNDAÇÃO                       [TORRE]
--   2.2.5   SECCIONAMENTO E ATERRAMENTO DE CERCAS   [KM]
--
-- Sem a atividade a importação não tinha onde gravar. Entram como condicionais (nem
-- toda torre passa por elas) e sem dependência: a cadeia delas eu confirmo com o campo
-- antes de travar qualquer coisa. A desforma fica entre a concretagem (60) e o reaterro
-- (70); as cercas, depois do contrapeso (80).
--
-- "Fundação 100% concluída" não vira atividade: só repete o reaterro.
--
-- Idempotente.
-- =============================================================================

-- A ordem é única por obra. Se a que eu quero já estiver ocupada, a atividade vai para o
-- fim da lista: é só exibição, a regra de bloqueio mora nas dependências.
do $$
declare
  v_obra  uuid := (select id from obra where codigo = 'SD');
  v       record;
  v_ordem integer;
begin
  for v in
    select * from (values
      ('DESFORMA FUNDAÇÃO',                      65, '#9c7f6d', 'hammer'),
      ('SECCIONAMENTO E ATERRAMENTO DE CERCAS',  86, '#7f9a5c', 'fence')
    ) as x(nome, ordem, cor, icone)
  loop
    continue when exists (select 1 from atividade where obra_id = v_obra and nome = v.nome);

    v_ordem := v.ordem;
    if exists (select 1 from atividade where obra_id = v_obra and ordem_execucao = v_ordem) then
      select max(ordem_execucao) + 1 into v_ordem from atividade where obra_id = v_obra;
    end if;

    insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
    values (v_obra, v.nome, v_ordem, v.cor, '#ffffff', v.icone, false);
  end loop;
end $$;
insert into migracao (numero, arquivo)
values (50, '50-desforma-e-cercas.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência: tem que sair as duas linhas novas, condicionais.
-- =============================================================================
select ordem_execucao, nome, obrigatoria
from atividade
where obra_id = (select id from obra where codigo = 'SD')
  and nome in ('CONCRETAGEM / TUBULÃO', 'DESFORMA FUNDAÇÃO', 'REATERRO 100%',
               'SECCIONAMENTO E ATERRAMENTO DE CERCAS')
order by ordem_execucao;