-- =============================================================================
-- Mudança de trecho sem canteiro de origem — 08/10/2026
-- =============================================================================
-- A planilha da ISA diz só "MUDANÇA PARA IGARITÉ", sem dizer de onde. A mudança de
-- trecho do encarregado passa a exigir só o encarregado e o canteiro de destino; o de
-- origem é opcional. Se vier, continua não podendo ser igual ao de destino.
--
-- Só afrouxa a regra: nenhum registro que já existe deixa de valer.
--
-- Idempotente.
-- =============================================================================

alter table movimentacao drop constraint if exists movimentacao_encarregado_ok;

alter table movimentacao
  add constraint movimentacao_encarregado_ok check (
    tipo <> 'MUDANCA_TRECHO' or (
      encarregado_id is not null
      and canteiro_destino_id is not null
      and (canteiro_origem_id is null or canteiro_origem_id <> canteiro_destino_id)
    )
  );

insert into migracao (numero, arquivo)
values (48, '48-mudanca-sem-origem.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que mostrar a regra nova, sem "canteiro_origem_id is not null".
-- =============================================================================

select pg_get_constraintdef(oid) as regra
from pg_constraint
where conname = 'movimentacao_encarregado_ok';