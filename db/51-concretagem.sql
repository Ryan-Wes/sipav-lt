-- =============================================================================
-- CONCRETAGEM / TUBULÃO vira CONCRETAGEM — 09/10/2026
-- =============================================================================
-- A planilha da ISA diz "concretagem" e a importação pega do que diz concretagem. O
-- "/ TUBULÃO" do nome só atrapalhava. É só o nome: as programações, o histórico e as
-- dependências seguem a atividade pelo id e não mudam.
--
-- Idempotente. Se já existir uma CONCRETAGEM na obra, não mexe (o nome é único).
-- =============================================================================

update atividade
set nome = 'CONCRETAGEM'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'CONCRETAGEM / TUBULÃO'
  and not exists (
    select 1 from atividade
    where obra_id = (select id from obra where codigo = 'SD') and nome = 'CONCRETAGEM'
  );

insert into migracao (numero, arquivo)
values (51, '51-concretagem.sql')
on conflict (numero) do nothing;

-- Conferência: tem que sair uma linha, CONCRETAGEM, e nenhuma "/ TUBULÃO".
select ordem_execucao, nome
from atividade
where obra_id = (select id from obra where codigo = 'SD')
  and nome like 'CONCRETAGEM%';