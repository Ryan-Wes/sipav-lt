-- =============================================================================
-- Correção dos trechos — 23/09/2026
-- =============================================================================
-- O seed inicial foi montado a partir do que apareceu na transcrição da reunião
-- e saiu errado. Correção do Wesley:
--
--   ERRADO                      CERTO
--   Buritirama–Correntina  →    Barra - Correntina  +  Buritirama - Barra
--   Juazeiro–Campo Formoso →    Juazeiro - Campo Formoso   (só o traço)
--   Campo Formoso–Barra    →    Campo Formoso - Barra      (só o traço)
--   Laje dos Negros        →    NÃO É TRECHO, é canteiro
--
-- Barra é um entroncamento: a linha vem de Juazeiro, passa por Campo Formoso e
-- chega em Barra, de onde saem os ramais para Correntina e Buritirama.
--
-- SEM DELETE: os quatro registros existentes são reaproveitados por renomeação,
-- então nenhum id muda e nada corre risco de cascade. Idempotente.
-- =============================================================================

-- Renomeia os dois que só tinham o traço errado
update trecho set nome = 'Juazeiro - Campo Formoso', ordem = 4
where obra_id = (select id from obra where codigo = 'SD')
  and nome in ('Juazeiro–Campo Formoso', 'Juazeiro - Campo Formoso');

update trecho set nome = 'Campo Formoso - Barra', ordem = 3
where obra_id = (select id from obra where codigo = 'SD')
  and nome in ('Campo Formoso–Barra', 'Campo Formoso - Barra');

-- Reaproveita o trecho inventado como Barra - Correntina
update trecho set nome = 'Barra - Correntina', ordem = 1
where obra_id = (select id from obra where codigo = 'SD')
  and nome in ('Buritirama–Correntina', 'Barra - Correntina');

-- Reaproveita "Laje dos Negros" (que é canteiro, não trecho) como Buritirama - Barra
update trecho set nome = 'Buritirama - Barra', ordem = 2
where obra_id = (select id from obra where codigo = 'SD')
  and nome in ('Laje dos Negros', 'Buritirama - Barra');

-- Rede de segurança: se algum dos quatro não existir, cria
insert into trecho (obra_id, nome, ordem)
select o.id, t.nome, t.ordem
from obra o, (values
  ('Barra - Correntina',       1),
  ('Buritirama - Barra',       2),
  ('Campo Formoso - Barra',    3),
  ('Juazeiro - Campo Formoso', 4)
) as t(nome, ordem)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;

-- =============================================================================
-- PENDENTE — CANTEIRO
-- =============================================================================
-- "Laje dos Negros" é canteiro, e um canteiro pode atravessar mais de um
-- trecho (a Hanna citou exatamente isso na reunião de 22/09: a mesma torre
-- aparecendo em Juazeiro–Campo Formoso e em Campo Formoso–Barra).
--
-- Se vocês programam ou medem produtividade por canteiro, ele precisa virar
-- dimensão própria: tabela `canteiro` e uma coluna em `torre` apontando pra
-- ela — independente do trecho. Confirmar com o Wesley antes de modelar.
-- =============================================================================

select nome, ordem from trecho
where obra_id = (select id from obra where codigo = 'SD')
order by ordem;
