-- =============================================================================
-- Cadeia de atividades — rodada 2, validada pelo Alessandro
-- =============================================================================
-- Origem: áudio do Alessandro Cordova em 23/09/2026, percorrendo a obra inteira
-- do acesso até a instalação de acessórios.
--
-- Idempotente: pode rodar de novo à vontade.
--
-- DECISÃO IMPORTANTE DO ALESSANDRO
--   O reaterro deveria depender de pré-moldado OU tubulão OU injeção em rocha,
--   caminhos que se excluem conforme a fundação da torre. Ele optou por amarrar
--   só na ESCAVAÇÃO por ora: "se a gente for entrar em detalhes, daí a gente vai
--   ter que abrir por pé de torre e aí vai ficar complicado. Depois a gente pode
--   evoluir." Isso mantém a regra simples e evita travar torre.
--
-- CONSEQUÊNCIA TÉCNICA
--   Nenhuma atividade obrigatória depende de atividade condicional. Logo as
--   dependências "E" bastam, e o sistema NÃO precisa saber o tipo da torre
--   para aplicar bloqueio. Quando quisermos precisão por pé de torre, aí sim.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. "Ancoragem em rocha" é, no vocabulário dele, PERFURAÇÃO EM ROCHA
--    (é dela que a injeção de nata depende)
-- -----------------------------------------------------------------------------
update atividade set nome = 'PERFURAÇÃO EM ROCHA'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'ANCORAGEM EM ROCHA';

-- -----------------------------------------------------------------------------
-- 2. Atividades novas (ordem provisória alta; o passo 3 põe no lugar)
-- -----------------------------------------------------------------------------
insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
select o.id, a.nome, a.ordem_tmp, a.bg, '#ffffff', a.icone, a.obrig
from obra o, (values
  ('PERFURAÇÃO DE TUBULÃO',                  901, '#e0995e', 'circle-dot', false),
  ('INSTALAÇÃO DE PRÉ-MOLDADOS',             902, '#a1887f', 'box',        false),
  ('INSTALAÇÃO DE BANDOLAS',                 903, '#7986cb', 'link',       true),
  ('LANÇAMENTO DO PILOTO',                   904, '#9575cd', 'arrow-right',true),
  ('NIVELAMENTO OPGW / PARA-RAIO',           905, '#ba68c8', 'ruler',      true),
  ('GRAMPEAÇÃO E ANCORAGEM OPGW / PARA-RAIO',906, '#ab47bc', 'anchor',     true),
  ('NIVELAMENTO DOS CONDUTORES',             907, '#7e57c2', 'ruler',      true),
  ('GRAMPEAÇÃO E ANCORAGEM DOS CONDUTORES',  908, '#673ab7', 'anchor',     true),
  ('INSTALAÇÃO DE ACESSÓRIOS',               909, '#5e35b1', 'package',    false),
  -- repetidas do 04-ajuste-cadeia.sql, para este script rodar sozinho
  ('CORTE SELETIVO',                         910, '#7bc043', 'scissors',   true),
  ('SUPRESSÃO DA FAIXA',                     911, '#8fd14f', 'trees',      true),
  ('INJEÇÃO DE NATA',                        912, '#d98c5f', 'droplets',   false),
  ('PREPARAÇÃO',                             913, '#b0bec5', 'ruler',      false)
) as a(nome, ordem_tmp, bg, icone, obrig)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Ordem de execução definitiva e natureza
-- -----------------------------------------------------------------------------
update atividade a set
  ordem_execucao = v.ordem,
  obrigatoria    = v.obrig
from (values
  -- Liberação da área — todas livres, sem precedente
  ('ABERTURA DE ACESSO',                      10, true),
  ('CORTE SELETIVO',                          15, true),
  ('SUPRESSÃO DE ÁREA DE TORRE',              20, true),
  ('SUPRESSÃO DA FAIXA',                      25, true),

  -- Fundação
  ('ESCAVAÇÃO',                               30, true),
  ('PERFURAÇÃO DE TUBULÃO',                   35, false),
  ('PERFURAÇÃO EM ROCHA',                     40, false),
  ('INSTALAÇÃO DE PRÉ-MOLDADOS',              45, false),
  ('INJEÇÃO DE NATA',                         50, false),
  ('PREPARAÇÃO',                              55, false),
  ('CONCRETAGEM / TUBULÃO',                   60, false),
  ('REATERRO 100%',                           70, true),
  ('ATERRAMENTO / CONTRAPESO',                80, true),
  ('MEDIÇÃO DE RESISTÊNCIA',                  90, true),
  ('TESTE DE ARRANCAMENTO',                   95, false),

  -- Estrutura
  ('PRÉ-MONTAGEM',                           100, true),
  ('MONTAGEM',                               110, true),
  ('REVISÃO',                                120, true),

  -- Cabos
  ('INSTALAÇÃO DE BANDOLAS',                 130, true),
  ('LANÇAMENTO DO PILOTO',                   140, true),
  ('LANÇAMENTO DO CABO OPGW/PR',             150, true),
  ('NIVELAMENTO OPGW / PARA-RAIO',           160, true),
  ('GRAMPEAÇÃO E ANCORAGEM OPGW / PARA-RAIO',170, true),
  ('LANÇAMENTO CONDUTOR 100%',               180, true),
  ('NIVELAMENTO DOS CONDUTORES',             190, true),
  ('GRAMPEAÇÃO E ANCORAGEM DOS CONDUTORES',  200, true),
  ('INSTALAÇÃO DE ACESSÓRIOS',               210, false)
) as v(nome, ordem, obrig)
where a.nome = v.nome
  and a.obra_id = (select id from obra where codigo = 'SD');

-- -----------------------------------------------------------------------------
-- 4. Dependências — reescreve tudo
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
  -- "Escavação vai precisar ter a área de torre aberta"
  ('ESCAVAÇÃO',                               'SUPRESSÃO DE ÁREA DE TORRE'),

  -- "Perfuração de tubulão e perfuração em rocha também precisam
  --  ter a área de torre livre"
  ('PERFURAÇÃO DE TUBULÃO',                   'SUPRESSÃO DE ÁREA DE TORRE'),
  ('PERFURAÇÃO EM ROCHA',                     'SUPRESSÃO DE ÁREA DE TORRE'),

  -- "Instalação de pré-moldados, preciso ter a escavação"
  ('INSTALAÇÃO DE PRÉ-MOLDADOS',              'ESCAVAÇÃO'),
  ('PREPARAÇÃO',                              'ESCAVAÇÃO'),
  ('CONCRETAGEM / TUBULÃO',                   'PERFURAÇÃO DE TUBULÃO'),

  -- "A injeção de nata precisa ter a perfuração em rocha"
  ('INJEÇÃO DE NATA',                         'PERFURAÇÃO EM ROCHA'),

  -- "Para o reaterro, a gente pode colocar limitador apenas a escavação"
  ('REATERRO 100%',                           'ESCAVAÇÃO'),

  -- "O contrapeso é possível executar tendo a área de torre e diante da
  --  fundação... precisa ter a escavação"
  ('ATERRAMENTO / CONTRAPESO',                'ESCAVAÇÃO'),

  -- "A medição de contrapeso, depois de ter instalado o contrapeso"
  ('MEDIÇÃO DE RESISTÊNCIA',                  'ATERRAMENTO / CONTRAPESO'),

  -- "O teste de fundação após o reaterro"
  ('TESTE DE ARRANCAMENTO',                   'REATERRO 100%'),

  -- "É interessante que para pré-montagem e montagem tenha o contrapeso
  --  executado, o aterramento"
  ('PRÉ-MONTAGEM',                            'ATERRAMENTO / CONTRAPESO'),
  ('MONTAGEM',                                'PRÉ-MONTAGEM'),
  ('MONTAGEM',                                'ATERRAMENTO / CONTRAPESO'),

  -- "Após a montagem vem a revisão, o giro e prumo, lambagem"
  ('REVISÃO',                                 'MONTAGEM'),

  -- "Vem a instalação de bandolas após a montagem"
  ('INSTALAÇÃO DE BANDOLAS',                  'MONTAGEM'),

  -- "Após a instalação de bandolas vem o lançamento do pilotinho"
  ('LANÇAMENTO DO PILOTO',                    'INSTALAÇÃO DE BANDOLAS'),

  -- "Lançamento de OPGW e para-raio depende de ter esse pilotinho"
  ('LANÇAMENTO DO CABO OPGW/PR',              'LANÇAMENTO DO PILOTO'),

  -- "Após ter feito a instalação do OPGW vem o nivelamento"
  ('NIVELAMENTO OPGW / PARA-RAIO',            'LANÇAMENTO DO CABO OPGW/PR'),
  ('GRAMPEAÇÃO E ANCORAGEM OPGW / PARA-RAIO', 'LANÇAMENTO DO CABO OPGW/PR'),

  -- "Só após você ter instalado o OPGW ou o para-raio é que você vai poder
  --  trabalhar com o condutor"
  ('LANÇAMENTO CONDUTOR 100%',                'LANÇAMENTO DO CABO OPGW/PR'),
  ('LANÇAMENTO CONDUTOR 100%',                'LANÇAMENTO DO PILOTO'),

  -- "Depois que o condutor está nivelado, grampeado e ancorado, daí vem a
  --  instalação de acessórios"
  ('NIVELAMENTO DOS CONDUTORES',              'LANÇAMENTO CONDUTOR 100%'),
  ('GRAMPEAÇÃO E ANCORAGEM DOS CONDUTORES',   'LANÇAMENTO CONDUTOR 100%'),
  ('INSTALAÇÃO DE ACESSÓRIOS',                'NIVELAMENTO DOS CONDUTORES'),
  ('INSTALAÇÃO DE ACESSÓRIOS',                'GRAMPEAÇÃO E ANCORAGEM DOS CONDUTORES')
) as d(atividade, requer)
  on a.nome = d.atividade and r.nome = d.requer
where o.codigo = 'SD';

-- =============================================================================
-- PONTOS QUE AINDA PRECISAM DE RESPOSTA
-- =============================================================================
-- 1. CORTE SELETIVO — o Alessandro citou só acesso, supressão de área de torre
--    e supressão da faixa como livres. Deixei o corte seletivo livre também,
--    por ser atividade de supressão. Confirmar.
--
-- 2. CONFLITO ENTRE AS DUAS RODADAS — na primeira você disse que a escavação
--    precisa das 3 supressões + acesso. O Alessandro disse que precisa só da
--    supressão de área de torre. Fiquei com a versão dele. Confirmar quem está
--    certo, porque isso muda quando a escavação libera.
--
-- 3. PREPARAÇÃO e CONCRETAGEM / TUBULÃO — vieram da sua primeira lista e o
--    Alessandro não citou nenhuma das duas; ele fala em PERFURAÇÃO DE TUBULÃO e
--    INSTALAÇÃO DE PRÉ-MOLDADOS. Pode ser o mesmo serviço com nomes diferentes,
--    ou etapas distintas (perfurar e depois concretar). Mantive as quatro e
--    amarrei CONCRETAGEM em PERFURAÇÃO DE TUBULÃO. Precisa ser resolvido, senão
--    fica atividade duplicada no cadastro.
--
-- 4. TESTE DE ARRANCAMENTO × "teste de fundação" — assumi que é a mesma coisa.
--
-- 5. REVISÃO — ele cita "revisão e o giro e prumo, lambagem" na mesma frase.
--    É uma atividade só ou três?
--
-- 6. Há DOIS lançamentos de piloto (um do OPGW/para-raio e um do condutor),
--    ambos após as bandolas. Modelei como um só. Se forem programados em
--    separado, viram duas atividades.
--
-- 7. BURITIRAMA tem OPGW dos dois lados (lado A e lado B) em vez de
--    OPGW + para-raio. Variação por trecho — não modelada ainda.
--
-- 8. INSTALAÇÃO DE ACESSÓRIOS (separadores, sinalizadores) — ele disse que
--    "praticamente a gente não faz a programação destes". Cadastrada como
--    condicional; se não for programada nunca, dá pra desativar.
-- =============================================================================

-- Conferência
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
