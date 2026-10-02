-- =============================================================================
-- Folga de campo — 02/10/2026
-- =============================================================================
-- Um quarto tipo de movimentação: o dia em que a equipe está de folga de campo.
-- Entra no mesmo esquema dos outros (db/39): vale um dia só, tem encarregado
-- opcional (e um segundo, se for o caso) e observação opcional, e aparece nos
-- painéis para o dia não ficar vazio sem explicação.
--
--   FOLGA_CAMPO   dia de folga de campo, de um encarregado ou geral
--
-- Não precisa de regra nova: a folga não exige encarregado nem observação. Um
-- registro sem encarregado vale como folga geral e aparece em "Máquinas e outros".
--
-- Idempotente.
-- =============================================================================

alter type tipo_movimentacao add value if not exists 'FOLGA_CAMPO';

insert into migracao (numero, arquivo)
values (43, '43-folga-de-campo.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que listar os quatro tipos, com FOLGA_CAMPO no fim.
-- =============================================================================

select enumlabel as tipo
from pg_enum
where enumtypid = 'tipo_movimentacao'::regtype
order by enumsortorder;
