-- =============================================================================
-- Escavação em três sabores — 25/09/2026
-- =============================================================================
-- Wesley: "escavação precisamos de outros tipos — escavação de estai, escavação
-- de MC, e uma escavação que vai ser só escavação".
--
-- Mesma estrutura da instalação de pré-moldados (ver 21): há equipe que cava só
-- os estais, equipe que cava só o mastro central, e equipe que faz as duas.
--
-- A planilha da ISA já separa:
--
--   2.1.4  Escavação - Fundação Estai / Pé       [TORRE]
--   2.1.5  Escavação - Fundação Mastro Central   [TORRE]
--
-- Numa autoportante só existe o 2.1.4, que são os pés; o mastro central é coisa
-- de estaiada. A ESCAVAÇÃO genérica já sabe disso pelo tipo da torre.
--
-- A genérica MANTÉM o nome e o id: é ela que carrega as centenas de execuções de
-- carga inicial vindas da planilha de controle, e renomear jogaria fora essa
-- história. As duas específicas nascem ao lado, condicionais.
--
-- 35 atividades → 37.
-- =============================================================================


-- =============================================================================
-- 1. As duas específicas, herdando a identidade visual da genérica
-- =============================================================================
-- Ordem provisória alta; a seção 2 põe no lugar.
insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
select
  o.id,
  v.nome,
  v.ordem_tmp,
  coalesce(esc.cor_fundo, '#c98a5e'),
  coalesce(esc.cor_texto, '#ffffff'),
  coalesce(esc.icone, 'shovel'),
  false                                   -- condicional: a torre usa um caminho ou outro
from obra o
cross join (values
  ('ESCAVAÇÃO - ESTAI', 928),
  ('ESCAVAÇÃO - MC',    929)
) as v(nome, ordem_tmp)
left join atividade esc on esc.obra_id = o.id and esc.nome = 'ESCAVAÇÃO'
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;


-- =============================================================================
-- 2. Ordem definitiva
-- =============================================================================
-- 28 e 29 estavam livres, entre SUPRESSÃO DA FAIXA (25) e ESCAVAÇÃO (30). As
-- específicas vêm antes da genérica, como em 45/46/47 nos pré-moldados.
update atividade a set ordem_execucao = v.ordem
from (values
  ('ESCAVAÇÃO - ESTAI', 28),
  ('ESCAVAÇÃO - MC',    29)
) as v(nome, ordem)
where a.nome = v.nome
  and a.obra_id = (select id from obra where codigo = 'SD');


-- =============================================================================
-- 3. Dependências — as três pedem a área de torre liberada
-- =============================================================================
insert into atividade_dependencia (atividade_id, requer_atividade_id)
select a.id, r.id
from obra o
join atividade a on a.obra_id = o.id
join atividade r on r.obra_id = o.id
join (values
  ('ESCAVAÇÃO - ESTAI', 'SUPRESSÃO DE ÁREA DE TORRE'),
  ('ESCAVAÇÃO - MC',    'SUPRESSÃO DE ÁREA DE TORRE')
) as d(atividade, requer)
  on d.atividade = a.nome and d.requer = r.nome
where o.codigo = 'SD'
on conflict do nothing;

-- PENDENTE — o que libera REATERRO 100% e ATERRAMENTO / CONTRAPESO.
--
-- Hoje os dois dependem da ESCAVAÇÃO genérica, e continuam assim. Quem programar
-- só ESCAVAÇÃO - ESTAI e ESCAVAÇÃO - MC vai ver aviso de fora de sequência no
-- reaterro, porque a genérica não foi apontada.
--
-- A tabela de dependência é um E, não um OU: não dá para dizer "reaterro precisa
-- de qualquer uma das três". As saídas são escolher entre:
--   a) manter como está e usar "programar mesmo assim" quando for o caso;
--   b) apontar também a genérica quando as duas específicas terminarem;
--   c) trocar a dependência do reaterro para a específica que couber ao tipo da
--      torre, o que exige regra nova no bloqueio.
-- Decidir com o Wesley antes de mexer.


-- =============================================================================
-- Conferência — as três juntas, e o que depende da genérica
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
  and a.ordem_execucao between 20 and 90
group by a.id, a.ordem_execucao, a.nome, a.obrigatoria
order by a.ordem_execucao;
