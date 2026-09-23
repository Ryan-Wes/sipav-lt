-- =============================================================================
-- Correções pontuais da cadeia
-- =============================================================================
-- Arquivo acumulativo: cada correção que o pessoal de campo devolver entra
-- aqui como um bloco novo, datado. Idempotente.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 23/09/2026 — "revisão giro e prumo é uma só e flambagem é outra"  (Wesley)
-- -----------------------------------------------------------------------------

-- REVISÃO passa a se chamar pelo nome completo que o campo usa
update atividade set nome = 'REVISÃO / GIRO E PRUMO'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'REVISÃO';

-- FLAMBAGEM vira atividade própria
insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
select o.id, 'FLAMBAGEM', 125, '#4db6ac', '#ffffff', 'git-commit-horizontal', true
from obra o
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;

update atividade set ordem_execucao = 120
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'REVISÃO / GIRO E PRUMO';

update atividade set ordem_execucao = 125
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'FLAMBAGEM';

-- FLAMBAGEM depende da montagem, como a revisão.
-- PENDENTE: confirmar se a flambagem vem ANTES ou DEPOIS da revisão/giro e
-- prumo, e se as bandolas dependem dela.
insert into atividade_dependencia (atividade_id, requer_atividade_id)
select a.id, r.id
from atividade a, atividade r
where a.obra_id = (select id from obra where codigo = 'SD')
  and r.obra_id = a.obra_id
  and a.nome = 'FLAMBAGEM'
  and r.nome = 'MONTAGEM'
on conflict do nothing;


-- =============================================================================
-- Conferência
-- =============================================================================
select
  a.ordem_execucao as ordem,
  a.nome           as atividade,
  case when a.obrigatoria then 'obrigatória' else 'condicional' end as tipo,
  coalesce(string_agg(d.nome, '  +  ' order by d.ordem_execucao), '— livre —') as depende_de
from atividade a
left join atividade_dependencia ad on ad.atividade_id = a.id
left join atividade d on d.id = ad.requer_atividade_id
where a.obra_id = (select id from obra where codigo = 'SD')
group by a.id, a.ordem_execucao, a.nome, a.obrigatoria
order by a.ordem_execucao;
