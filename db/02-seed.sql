-- =============================================================================
-- Seed inicial — Obra Serra Dourada
-- =============================================================================
-- ATENÇÃO: a ordem de execução e as dependências abaixo são uma INFERÊNCIA
-- feita a partir do protótipo e da transcrição da reunião. PRECISA SER
-- VALIDADA com Alessandro / Hanna / Rominick antes da demo.
--
-- Pontos que eu chutei e preciso de confirmação:
--   - Onde entra CONCRETAGEM / TUBULÃO (citado pela Hanna, não existe no protótipo)
--   - TESTE DE ARRANCAMENTO vem antes ou depois da concretagem?
--   - LANÇAMENTO DO CABO OPGW depende de REVISÃO ou só de MONTAGEM?
--   - RECUPERAÇÃO DE ACESSO (citada pela Hanna) — é atividade própria? entra onde?
--   - ATERRAMENTO e PRÉ-MONTAGEM podem correr em paralelo depois do reaterro?
--
-- Para corrigir, basta mudar `ordem` na lista e as duplas em `dependencias`.
-- =============================================================================

insert into obra (nome, codigo)
values ('LT Serra Dourada', 'SD')
on conflict (codigo) do nothing;

-- -----------------------------------------------------------------------------
-- Trechos
-- -----------------------------------------------------------------------------
insert into trecho (obra_id, nome, ordem)
select o.id, t.nome, t.ordem
from obra o, (values
  ('Buritirama–Correntina',   1),
  ('Juazeiro–Campo Formoso',  2),
  ('Campo Formoso–Barra',     3),
  ('Laje dos Negros',         4)
) as t(nome, ordem)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;

-- -----------------------------------------------------------------------------
-- Catálogo de atividades, em ordem de execução  (post-it 2)
-- Cores e ícones herdados do protótipo do Alessandro.
-- -----------------------------------------------------------------------------
insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
select o.id, a.nome, a.ordem, a.bg, a.txt, a.icone, a.obrig
from obra o, (values
  ('ABERTURA DE ACESSO',           10, '#86af12', '#ffffff', 'route',          true),
  ('SUPRESSÃO DE ÁREA DE TORRE',   20, '#a7ee6d', '#ffffff', 'trees',          true),
  ('ESCAVAÇÃO',                    30, '#f2b636', '#ffffff', 'hard-hat',       true),
  ('ANCORAGEM EM ROCHA',           40, '#c2703c', '#ffffff', 'mountain-snow',  false),
  ('TESTE DE ARRANCAMENTO',        50, '#dcd974', '#ffffff', 'gauge',          false),
  ('CONCRETAGEM / TUBULÃO',        60, '#94a3b8', '#ffffff', 'layers-3',       true),
  ('REATERRO 100%',                70, '#909a60', '#ffffff', 'mountain',       true),
  ('ATERRAMENTO / CONTRAPESO',     80, '#a2a2be', '#ffffff', 'shield-check',   true),
  ('MEDIÇÃO DE RESISTÊNCIA',       90, '#06b6d4', '#ffffff', 'zap',            true),
  ('PRÉ-MONTAGEM',                100, '#65b1ec', '#ffffff', 'layers',         true),
  ('MONTAGEM',                    110, '#3b82f6', '#ffffff', 'wrench',         true),
  ('REVISÃO',                     120, '#5ff7d1', '#ffffff', 'rotate-ccw',     true),
  ('LANÇAMENTO CONDUTOR 100%',    130, '#8768a1', '#ffffff', 'activity',       true),
  ('LANÇAMENTO DO CABO OPGW/PR',  140, '#b989c2', '#ffffff', 'wifi',           true)
) as a(nome, ordem, bg, txt, icone, obrig)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;

-- -----------------------------------------------------------------------------
-- Dependências (a regra de bloqueio do post-it 2 e da Hanna)
-- Cada linha: "atividade" só pode ser programada se "requer" já foi executada
-- ou já está programada para data anterior.
-- -----------------------------------------------------------------------------
insert into atividade_dependencia (atividade_id, requer_atividade_id)
select a.id, r.id
from obra o
join atividade a on a.obra_id = o.id
join atividade r on r.obra_id = o.id
join (values
  ('SUPRESSÃO DE ÁREA DE TORRE',  'ABERTURA DE ACESSO'),
  ('ESCAVAÇÃO',                   'SUPRESSÃO DE ÁREA DE TORRE'),
  ('ANCORAGEM EM ROCHA',          'ESCAVAÇÃO'),
  ('TESTE DE ARRANCAMENTO',       'ESCAVAÇÃO'),
  ('CONCRETAGEM / TUBULÃO',       'ESCAVAÇÃO'),
  ('REATERRO 100%',               'CONCRETAGEM / TUBULÃO'),
  ('ATERRAMENTO / CONTRAPESO',    'REATERRO 100%'),
  ('MEDIÇÃO DE RESISTÊNCIA',      'ATERRAMENTO / CONTRAPESO'),
  ('PRÉ-MONTAGEM',                'REATERRO 100%'),
  ('MONTAGEM',                    'PRÉ-MONTAGEM'),
  ('REVISÃO',                     'MONTAGEM'),
  ('LANÇAMENTO CONDUTOR 100%',    'REVISÃO'),
  ('LANÇAMENTO DO CABO OPGW/PR',  'MONTAGEM')
) as d(atividade, requer)
  on a.nome = d.atividade and r.nome = d.requer
where o.codigo = 'SD'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Encarregados (os que já estavam no protótipo)
-- -----------------------------------------------------------------------------
insert into encarregado (obra_id, nome)
select o.id, e.nome
from obra o, (values
  ('Antônio dos Santos'),
  ('Darlos'),
  ('Diovane'),
  ('Lucas Vragem'),
  ('Wemerson'),
  ('Antônio Mendes'),
  ('Cláudio Santos'),
  ('Romário')
) as e(nome)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;
