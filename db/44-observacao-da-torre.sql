-- =============================================================================
-- Observação da torre — 02/10/2026
-- =============================================================================
-- Uma anotação que fica NA TORRE, não na programação: "serra", "acesso difícil",
-- "solo rochoso". Serve para ver de relance, no cartão, onde a obra tem dificuldade
-- — em Barra–Correntina, por exemplo, há trechos de serra.
--
-- É diferente de:
--   programacao.observacao   vale para um dia de serviço
--   restricao                impede ou condiciona a programação (tem tipo e liberação)
--
-- Esta é só informação. Não bloqueia nada, e a importação das torres não mexe
-- nela: o upsert só grava as colunas que a importação conhece.
--
-- Quem escreve é quem já escreve na torre (administração e planejamento, pela
-- política `torre_escrita` da 01); todo mundo logado lê.
--
-- Idempotente.
-- =============================================================================

alter table torre add column if not exists observacao text;

comment on column torre.observacao is
  'Anotação permanente da torre (ex.: serra, acesso difícil). Informativa: não bloqueia programação.';

insert into migracao (numero, arquivo)
values (44, '44-observacao-da-torre.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que sair vazio na primeira vez. Anote uma observação pela tela e rode de
-- novo: a torre tem que aparecer, com o trecho.
-- =============================================================================

select tr.nome        as trecho,
       t.identificador as torre,
       t.observacao
from torre t
join trecho tr on tr.id = t.trecho_id
where t.observacao is not null
order by tr.ordem, t.ordem;
