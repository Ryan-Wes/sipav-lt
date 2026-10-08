-- =============================================================================
-- Feriado — 08/10/2026
-- =============================================================================
-- Um quinto tipo de dia sem atividade: o feriado. Serve para marcar no calendário o
-- dia em que não se programa. Entra no mesmo esquema dos outros (db/39 e db/43):
-- vale um dia só, é do trecho em que foi registrado, tem observação opcional e
-- não exige encarregado (é do dia, não de uma equipe).
--
--   FERIADO   dia em que ninguém trabalha; os painéis marcam o dia e a tela avisa
--             ao programar nele
--
-- Não precisa de regra nova no banco.
--
-- Idempotente.
-- =============================================================================

alter type tipo_movimentacao add value if not exists 'FERIADO';

insert into migracao (numero, arquivo)
values (47, '47-feriado.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que listar os cinco tipos, com FERIADO no fim.
-- =============================================================================

select enumlabel as tipo
from pg_enum
where enumtypid = 'tipo_movimentacao'::regtype
order by enumsortorder;