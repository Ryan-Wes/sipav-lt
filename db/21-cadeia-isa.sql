-- =============================================================================
-- Cadeia alinhada com o relatório da ISA — 24/09/2026
-- =============================================================================
-- Respostas do Alessandro (ver docs/04-relatorio-isa.md, seção 6):
--
--   A1 · "Perfuração de Tubulão" e "Perfuração em Rocha" são serviços
--        DIFERENTES. As duas já existem no SIPAV; o que falta é linha própria
--        para tubulão no catálogo da ISA — isso é planilha, não banco.
--
--   A2 · Correção da cadeia de montagem:
--        · revisão em solo vai JUNTO com a pré-montagem (só estaiada, serve
--          para decidir se dá para içar com guindaste)
--        · içamento vem depois
--        · a FLAMBAGEM é que vai junto com a REVISÃO — não é atividade própria
--        · GIRO E PRUMO vem depois das duas, sozinho
--        Ou seja, o 06-correcoes.sql inverteu: quem se junta à revisão é a
--        flambagem, e quem se separa é o giro e prumo.
--
--   A3 · Grampeação e ancoragem são apontadas SEPARADAS, e "acessórios" se
--        abre em espaçador, jumper e sinalização.
--
--   A4 · Fabricação de pré-moldado sai do planejamento. O que se programa é a
--        INSTALAÇÃO, em três sabores, porque há equipe que instala só o mastro
--        central, equipe que instala só a viga L e equipe que faz as duas.
--
--   A6 · Lançamento: o cabo-guarda pode ser OPGW ou para-raio 3/8 / Dotterel,
--        e os dois existem na obra. Vira um campo na programação, não
--        atividades duplicadas.
--
-- 28 atividades → 33.
--
-- COMO RODAR: a seção 0 não altera nada. Rode ela primeiro e confira os
-- números antes de seguir para a 1.
-- =============================================================================


-- =============================================================================
-- 0. PRÉ-VOO — não altera nada, só mostra o que está em risco
-- =============================================================================
select
  a.nome                                             as atividade_que_vai_mudar,
  count(distinct p.id)                               as programacoes,
  count(distinct e.id) filter (where not e.carga_inicial) as execucoes_de_campo,
  count(distinct e.id) filter (where e.carga_inicial)     as execucoes_da_planilha
from atividade a
left join programacao p on p.atividade_id = a.id
left join execucao    e on e.atividade_id = a.id
where a.obra_id = (select id from obra where codigo = 'SD')
  and a.nome in (
    'PREPARAÇÃO',
    'FLAMBAGEM',
    'INSTALAÇÃO DE PRÉ-MOLDADOS',
    'REVISÃO / GIRO E PRUMO',
    'GRAMPEAÇÃO E ANCORAGEM OPGW / PARA-RAIO',
    'GRAMPEAÇÃO E ANCORAGEM DOS CONDUTORES',
    'INSTALAÇÃO DE ACESSÓRIOS'
  )
group by a.nome
order by a.nome;


-- =============================================================================
-- 1. Renomeações — preservam o id, e com ele toda a programação e o histórico
-- =============================================================================
-- Renomear é de longe o caminho mais seguro: programacao.atividade_id e
-- execucao.atividade_id são "on delete restrict", e o histórico guarda o nome
-- denormalizado do jeito que estava na época. Nada disso se perde num rename.

update atividade set nome = 'REVISÃO'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'REVISÃO / GIRO E PRUMO';

update atividade set nome = 'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L',
                     ordem_execucao = 47
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'INSTALAÇÃO DE PRÉ-MOLDADOS';

update atividade set nome = 'GRAMPEAÇÃO OPGW / PARA-RAIO'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'GRAMPEAÇÃO E ANCORAGEM OPGW / PARA-RAIO';

update atividade set nome = 'GRAMPEAÇÃO DOS CONDUTORES'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'GRAMPEAÇÃO E ANCORAGEM DOS CONDUTORES';

update atividade set nome = 'INSTALAÇÃO DE ESPAÇADORES'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'INSTALAÇÃO DE ACESSÓRIOS';


-- =============================================================================
-- 2. Absorções — PREPARAÇÃO e FLAMBAGEM deixam de existir
-- =============================================================================
-- A linha da ISA já se chama "Instalação de Pré-Moldados / Nivelamento /
-- Preparação": preparação nunca foi apontada separado lá. E a flambagem, pelo
-- A2, é parte da revisão.
--
-- O trigger programacao_valida roda no update e pode recusar a linha movida se
-- a atividade de destino estiver bloqueada pela precedência. Como isto é
-- migração e não programação nova, ele sai do caminho e volta no fim.

alter table programacao disable trigger programacao_valida;

-- 2a. Colisões primeiro: (torre, atividade, data) é único. Se a mesma torre já
--     tem as duas atividades no mesmo dia, a de origem é descartada.
delete from programacao p
using atividade orig, atividade dest
where orig.obra_id = (select id from obra where codigo = 'SD')
  and dest.obra_id = orig.obra_id
  and p.atividade_id = orig.id
  and (orig.nome, dest.nome) in (
    ('PREPARAÇÃO', 'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L'),
    ('FLAMBAGEM',  'REVISÃO')
  )
  and exists (
    select 1 from programacao q
    where q.torre_id = p.torre_id
      and q.data = p.data
      and q.atividade_id = dest.id
  );

update programacao p set atividade_id = dest.id
from atividade orig, atividade dest
where orig.obra_id = (select id from obra where codigo = 'SD')
  and dest.obra_id = orig.obra_id
  and p.atividade_id = orig.id
  and (orig.nome, dest.nome) in (
    ('PREPARAÇÃO', 'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L'),
    ('FLAMBAGEM',  'REVISÃO')
  );

update execucao e set atividade_id = dest.id
from atividade orig, atividade dest
where orig.obra_id = (select id from obra where codigo = 'SD')
  and dest.obra_id = orig.obra_id
  and e.atividade_id = orig.id
  and (orig.nome, dest.nome) in (
    ('PREPARAÇÃO', 'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L'),
    ('FLAMBAGEM',  'REVISÃO')
  );

alter table programacao enable trigger programacao_valida;

-- Agora sim dá para apagar: não sobrou nenhuma linha apontando para elas
delete from atividade
where obra_id = (select id from obra where codigo = 'SD')
  and nome in ('PREPARAÇÃO', 'FLAMBAGEM');


-- =============================================================================
-- 3. Atividades novas
-- =============================================================================
-- Ordem provisória alta, como no 05: a seção 4 põe cada uma no lugar sem
-- esbarrar no unique (obra_id, ordem_execucao).

insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
select o.id, a.nome, a.ordem_tmp, a.bg, a.fg, a.icone, a.obrig
from obra o, (values
  -- A4 — instalação de pré-moldados nos três sabores
  ('INSTALAÇÃO DE PRÉ-MOLDADOS - VIGA L',  921, '#8d6e63', '#ffffff', 'box',            false),
  ('INSTALAÇÃO DE PRÉ-MOLDADOS - MC',      922, '#a1887f', '#ffffff', 'box',            false),

  -- A2 — giro e prumo se separa da revisão
  ('GIRO E PRUMO',                         923, '#26a69a', '#ffffff', 'compass',        true),

  -- A3 — ancoragem se separa da grampeação
  ('ANCORAGEM OPGW / PARA-RAIO',           924, '#9c27b0', '#ffffff', 'anchor',         true),
  ('ANCORAGEM DOS CONDUTORES',             925, '#673ab7', '#ffffff', 'anchor',         true),

  -- A3 — acessórios se abre em três
  ('INSTALAÇÃO DE JUMPER',                 926, '#7e57c2', '#ffffff', 'cable',          false),
  ('INSTALAÇÃO DE SINALIZAÇÃO',            927, '#546e7a', '#ffffff', 'triangle-alert', false)
) as a(nome, ordem_tmp, bg, fg, icone, obrig)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;


-- =============================================================================
-- 4. Ordem de execução definitiva
-- =============================================================================
update atividade a set
  ordem_execucao = v.ordem,
  obrigatoria    = v.obrig
from (values
  ('ABERTURA DE ACESSO',                       10, true),
  ('CORTE SELETIVO',                           15, true),
  ('SUPRESSÃO DE ÁREA DE TORRE',               20, true),
  ('SUPRESSÃO DA FAIXA',                       25, true),

  ('ESCAVAÇÃO',                                30, true),
  ('PERFURAÇÃO DE TUBULÃO',                    35, false),
  ('PERFURAÇÃO EM ROCHA',                      40, false),
  ('INSTALAÇÃO DE PRÉ-MOLDADOS - VIGA L',      45, false),
  ('INSTALAÇÃO DE PRÉ-MOLDADOS - MC',          46, false),
  ('INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L', 47, false),
  ('INJEÇÃO DE NATA',                          50, false),
  ('CONCRETAGEM / TUBULÃO',                    60, false),
  ('REATERRO 100%',                            70, true),

  ('ATERRAMENTO / CONTRAPESO',                 80, true),
  ('MEDIÇÃO DE RESISTÊNCIA',                   90, true),
  ('TESTE DE ARRANCAMENTO',                    95, false),

  ('PRÉ-MONTAGEM',                            100, true),   -- inclui revisão em solo
  ('MONTAGEM',                                110, true),   -- içamento
  ('REVISÃO',                                 120, true),   -- inclui flambagem
  ('GIRO E PRUMO',                            125, true),

  ('INSTALAÇÃO DE BANDOLAS',                  130, true),
  ('LANÇAMENTO DO PILOTO',                    140, true),
  ('LANÇAMENTO DO CABO OPGW/PR',              150, true),
  ('NIVELAMENTO OPGW / PARA-RAIO',            160, true),
  ('GRAMPEAÇÃO OPGW / PARA-RAIO',             170, true),
  ('ANCORAGEM OPGW / PARA-RAIO',              175, true),

  ('LANÇAMENTO CONDUTOR 100%',                180, true),
  ('NIVELAMENTO DOS CONDUTORES',              190, true),
  ('GRAMPEAÇÃO DOS CONDUTORES',               200, true),
  ('ANCORAGEM DOS CONDUTORES',                205, true),

  ('INSTALAÇÃO DE ESPAÇADORES',               210, false),
  ('INSTALAÇÃO DE JUMPER',                    215, false),
  ('INSTALAÇÃO DE SINALIZAÇÃO',               220, false)
) as v(nome, ordem, obrig)
where a.nome = v.nome
  and a.obra_id = (select id from obra where codigo = 'SD');


-- =============================================================================
-- 5. Dependências — reescreve tudo
-- =============================================================================
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
  -- Liberação da área
  ('ESCAVAÇÃO',                               'SUPRESSÃO DE ÁREA DE TORRE'),
  ('PERFURAÇÃO DE TUBULÃO',                   'SUPRESSÃO DE ÁREA DE TORRE'),
  ('PERFURAÇÃO EM ROCHA',                     'SUPRESSÃO DE ÁREA DE TORRE'),

  -- Fundação — os três sabores de pré-moldado pedem a mesma escavação
  ('INSTALAÇÃO DE PRÉ-MOLDADOS - VIGA L',     'ESCAVAÇÃO'),
  ('INSTALAÇÃO DE PRÉ-MOLDADOS - MC',         'ESCAVAÇÃO'),
  ('INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L','ESCAVAÇÃO'),
  ('CONCRETAGEM / TUBULÃO',                   'PERFURAÇÃO DE TUBULÃO'),
  ('INJEÇÃO DE NATA',                         'PERFURAÇÃO EM ROCHA'),
  ('REATERRO 100%',                           'ESCAVAÇÃO'),

  -- Aterramento
  ('ATERRAMENTO / CONTRAPESO',                'ESCAVAÇÃO'),
  ('MEDIÇÃO DE RESISTÊNCIA',                  'ATERRAMENTO / CONTRAPESO'),
  ('TESTE DE ARRANCAMENTO',                   'REATERRO 100%'),

  -- Montagem — A2. Pré-montagem já carrega a revisão em solo, então o
  -- içamento depender da pré-montagem cobre "içamento é após esta etapa".
  ('PRÉ-MONTAGEM',                            'ATERRAMENTO / CONTRAPESO'),
  ('MONTAGEM',                                'PRÉ-MONTAGEM'),
  ('MONTAGEM',                                'ATERRAMENTO / CONTRAPESO'),
  ('REVISÃO',                                 'MONTAGEM'),
  ('GIRO E PRUMO',                            'REVISÃO'),

  -- Lançamento OPGW / para-raio
  ('INSTALAÇÃO DE BANDOLAS',                  'MONTAGEM'),
  ('LANÇAMENTO DO PILOTO',                    'INSTALAÇÃO DE BANDOLAS'),
  ('LANÇAMENTO DO CABO OPGW/PR',              'LANÇAMENTO DO PILOTO'),
  ('NIVELAMENTO OPGW / PARA-RAIO',            'LANÇAMENTO DO CABO OPGW/PR'),
  ('GRAMPEAÇÃO OPGW / PARA-RAIO',             'LANÇAMENTO DO CABO OPGW/PR'),
  ('ANCORAGEM OPGW / PARA-RAIO',              'LANÇAMENTO DO CABO OPGW/PR'),

  -- Condutor
  ('LANÇAMENTO CONDUTOR 100%',                'LANÇAMENTO DO CABO OPGW/PR'),
  ('LANÇAMENTO CONDUTOR 100%',                'LANÇAMENTO DO PILOTO'),
  ('NIVELAMENTO DOS CONDUTORES',              'LANÇAMENTO CONDUTOR 100%'),
  ('GRAMPEAÇÃO DOS CONDUTORES',               'LANÇAMENTO CONDUTOR 100%'),
  ('ANCORAGEM DOS CONDUTORES',                'LANÇAMENTO CONDUTOR 100%'),

  -- Acessórios — A3 dá a ordem: ancoragem, grampeação, espaçador, jumper,
  -- sinalização.
  ('INSTALAÇÃO DE ESPAÇADORES',               'NIVELAMENTO DOS CONDUTORES'),
  ('INSTALAÇÃO DE ESPAÇADORES',               'GRAMPEAÇÃO DOS CONDUTORES'),
  ('INSTALAÇÃO DE ESPAÇADORES',               'ANCORAGEM DOS CONDUTORES'),
  ('INSTALAÇÃO DE JUMPER',                    'GRAMPEAÇÃO DOS CONDUTORES'),
  ('INSTALAÇÃO DE JUMPER',                    'ANCORAGEM DOS CONDUTORES'),
  -- PENDENTE: o sinalizador de estai é na torre e poderia sair bem antes do
  -- condutor. O Alessandro listou sinalização por último, então fica assim
  -- até alguém dizer o contrário.
  ('INSTALAÇÃO DE SINALIZAÇÃO',               'GRAMPEAÇÃO DOS CONDUTORES')
) as d(atividade, requer)
  on d.atividade = a.nome and d.requer = r.nome
where o.codigo = 'SD'
on conflict do nothing;


-- =============================================================================
-- 6. Qual cabo — A6
-- =============================================================================
-- Na obra existem os dois: OPGW dos dois lados (Buritirama) e para-raio
-- convencional de um lado com OPGW do outro (Barra–Correntina). O 3/8 e o
-- Dotterel são o mesmo cabo emendado, mudam só perto da subestação, então não
-- viram opções separadas.
--
-- É o que decide se a programação vai para a seção 4.1 ou 4.2 do relatório.
-- Só faz sentido nas seis atividades de lançamento de cabo-guarda; fica nulo
-- no resto.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cabo_guarda') then
    create type cabo_guarda as enum ('OPGW', 'PARA_RAIO');
  end if;
end $$;

alter table programacao add column if not exists cabo cabo_guarda;
alter table execucao    add column if not exists cabo cabo_guarda;

comment on column programacao.cabo is
  'OPGW ou PARA_RAIO (3/8 / Dotterel). Só nas atividades de lançamento de cabo-guarda.';


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
