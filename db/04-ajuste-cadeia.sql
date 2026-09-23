-- =============================================================================
-- Ajuste da cadeia de atividades — rodada 1
-- =============================================================================
-- Origem: correções do Wesley em 23/09/2026, vindas do pessoal de campo.
--
-- Este script é idempotente: pode rodar quantas vezes quiser. Ele reescreve
-- por completo as dependências da obra SD.
--
-- MUDANÇAS DESTA RODADA
--   · SUPRESSÃO DE ÁREA DE TORRE não depende mais de ABERTURA DE ACESSO
--   · ESCAVAÇÃO passa a exigir as 3 supressões + acesso
--   · ANCORAGEM EM ROCHA é escavação especial: depende das supressões,
--     não da escavação comum
--   · ATERRAMENTO / CONTRAPESO depende de ESCAVAÇÃO (era REATERRO)
--   · CONCRETAGEM exige ESCAVAÇÃO + PREPARAÇÃO
--   · REATERRO exige CONCRETAGEM
--   · 4 atividades novas: CORTE SELETIVO, SUPRESSÃO DA FAIXA,
--     INJEÇÃO DE NATA, PREPARAÇÃO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Atividades novas
-- -----------------------------------------------------------------------------
insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
select o.id, a.nome, a.ordem, a.bg, '#ffffff', a.icone, a.obrig
from obra o, (values
  ('CORTE SELETIVO',      15, '#7bc043', 'scissors',  true),
  ('SUPRESSÃO DA FAIXA',  25, '#8fd14f', 'trees',     true),
  ('INJEÇÃO DE NATA',     45, '#d98c5f', 'droplets',  false),
  ('PREPARAÇÃO',          55, '#b0bec5', 'ruler',     true)
) as a(nome, ordem, bg, icone, obrig)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Reordenação e natureza (obrigatória × condicional)
-- -----------------------------------------------------------------------------
-- Condicional = não se aplica a toda torre. É o que impede o sistema de cobrar
-- concretagem numa torre estaiada ou injeção numa autoportante.
update atividade a set
  ordem_execucao = v.ordem,
  obrigatoria    = v.obrig
from (values
  ('ABERTURA DE ACESSO',           10, true),
  ('CORTE SELETIVO',               15, true),
  ('SUPRESSÃO DE ÁREA DE TORRE',   20, true),
  ('SUPRESSÃO DA FAIXA',           25, true),
  ('ESCAVAÇÃO',                    30, true),
  ('ANCORAGEM EM ROCHA',           40, false),   -- só torre com ancoragem
  ('INJEÇÃO DE NATA',              45, false),   -- só torre com ancoragem
  ('PREPARAÇÃO',                   55, true),
  ('CONCRETAGEM / TUBULÃO',        60, false),   -- só torre autoportante
  ('REATERRO 100%',                70, false),   -- só torre sem ancoragem
  ('ATERRAMENTO / CONTRAPESO',     80, true),
  ('MEDIÇÃO DE RESISTÊNCIA',       90, true),
  ('TESTE DE ARRANCAMENTO',        95, false),
  ('PRÉ-MONTAGEM',                100, true),
  ('MONTAGEM',                    110, true),
  ('REVISÃO',                     120, true),
  ('LANÇAMENTO CONDUTOR 100%',    130, true),
  ('LANÇAMENTO DO CABO OPGW/PR',  140, true)
) as v(nome, ordem, obrig)
where a.nome = v.nome
  and a.obra_id = (select id from obra where codigo = 'SD');

-- -----------------------------------------------------------------------------
-- 3. Dependências — reescreve tudo
-- -----------------------------------------------------------------------------
delete from atividade_dependencia
where atividade_id in (
  select id from atividade where obra_id = (select id from obra where codigo = 'SD')
);

insert into atividade_dependencia (atividade_id, requer_atividade_id)
select a.id, r.id
from obra o
join atividade a on a.obra_id = o.id
join atividade r on r.obra_id = o.id
join (values
  -- ESCAVAÇÃO: precisa das 3 supressões e do acesso
  ('ESCAVAÇÃO',                'ABERTURA DE ACESSO'),
  ('ESCAVAÇÃO',                'CORTE SELETIVO'),
  ('ESCAVAÇÃO',                'SUPRESSÃO DE ÁREA DE TORRE'),
  ('ESCAVAÇÃO',                'SUPRESSÃO DA FAIXA'),

  -- ANCORAGEM EM ROCHA: escavação especial, depende das supressões
  ('ANCORAGEM EM ROCHA',       'CORTE SELETIVO'),
  ('ANCORAGEM EM ROCHA',       'SUPRESSÃO DE ÁREA DE TORRE'),
  ('ANCORAGEM EM ROCHA',       'SUPRESSÃO DA FAIXA'),

  -- Caminho da ancoragem
  ('INJEÇÃO DE NATA',          'ANCORAGEM EM ROCHA'),

  -- Caminho da concretagem
  ('PREPARAÇÃO',               'ESCAVAÇÃO'),
  ('CONCRETAGEM / TUBULÃO',    'ESCAVAÇÃO'),
  ('CONCRETAGEM / TUBULÃO',    'PREPARAÇÃO'),
  ('REATERRO 100%',            'CONCRETAGEM / TUBULÃO'),

  -- Independe do tipo de fundação
  ('ATERRAMENTO / CONTRAPESO', 'ESCAVAÇÃO'),

  -- ↓↓↓ AINDA NÃO VALIDADO PELO PESSOAL DE CAMPO ↓↓↓
  ('MEDIÇÃO DE RESISTÊNCIA',   'ATERRAMENTO / CONTRAPESO'),
  ('MONTAGEM',                 'PRÉ-MONTAGEM'),
  ('REVISÃO',                  'MONTAGEM'),
  ('LANÇAMENTO CONDUTOR 100%', 'REVISÃO'),
  ('LANÇAMENTO DO CABO OPGW/PR','MONTAGEM')
) as d(atividade, requer)
  on a.nome = d.atividade and r.nome = d.requer
where o.codigo = 'SD';

-- =============================================================================
-- DELIBERADAMENTE SEM DEPENDÊNCIA, POR ENQUANTO
-- =============================================================================
-- TESTE DE ARRANCAMENTO
--   Depende de REATERRO na torre autoportante e de INJEÇÃO DE NATA na torre com
--   ancoragem. São caminhos que se excluem. Como o modelo atual só sabe fazer
--   "E", amarrar os dois travaria a atividade nos DOIS casos. Fica solta até o
--   sistema saber o tipo de cada torre.
--
-- PRÉ-MONTAGEM
--   Estava amarrada em REATERRO, que agora é condicional — travaria toda torre
--   com ancoragem. Solta até validarmos se ela depende mesmo da fundação.
--
-- CORTE SELETIVO / SUPRESSÃO DA FAIXA
--   Sem pré-requisito definido. Confirmar se dependem do acesso.
-- =============================================================================

-- Conferência
select
  a.ordem_execucao as ordem,
  a.nome           as atividade,
  case when a.obrigatoria then 'obrigatória' else 'condicional' end as tipo,
  coalesce(string_agg(d.nome, '  +  ' order by d.ordem_execucao), '— nenhuma —') as depende_de
from atividade a
left join atividade_dependencia ad on ad.atividade_id = a.id
left join atividade d on d.id = ad.requer_atividade_id
where a.obra_id = (select id from obra where codigo = 'SD')
group by a.id, a.ordem_execucao, a.nome, a.obrigatoria
order by a.ordem_execucao;
