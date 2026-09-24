-- =============================================================================
-- Bandola do cabo-guarda e bandola do condutor são etapas diferentes — 24/09/2026
-- =============================================================================
-- Wesley: "são dois serviços, eles primeiro colocam bandola de para-raio, lançam
-- o cabo e só depois é que vai colocar bandola de condutor e lançar condutor".
--
-- Mesmo padrão do pilotinho (ver 23). A planilha da ISA já separava:
--
--   4.1.1  INSTALAÇÃO DE BANDOLAS PARA O CABO PARA-RAIO  [TORRE]
--   4.2.1  INSTALAÇÃO DE BANDOLAS PARA O CABO OPGW       [TORRE]
--   4.3.1  Instalação de Bandolas e Isoladores           [TORRE]  ← condutor
--
-- A atividade que existe é a do cabo-guarda: é ela que carrega o campo 'cabo'.
-- Ganha nome explícito e o condutor ganha a sua, que leva isolador junto.
--
-- A frase do Wesley também corrige a 23: eu tinha pendurado o piloto do condutor
-- direto no lançamento do cabo-guarda, porque na época não existia a bandola do
-- condutor para ficar no meio. Agora fica.
--
-- 34 atividades → 35.
--
-- PRÉ-REQUISITO: rodar o 23 antes. O bloco abaixo recusa o script se faltar.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from atividade
    where obra_id = (select id from obra where codigo = 'SD')
      and nome = 'LANÇAMENTO DO PILOTO DO CONDUTOR'
  ) then
    raise exception
      'Rode o 23-piloto-e-pilotinho.sql antes deste. Sem ele não existe a atividade do piloto do condutor e as dependências sairiam pela metade, sem erro nenhum.';
  end if;
end $$;


-- =============================================================================
-- 1. A bandola que existe é a do cabo-guarda
-- =============================================================================
update atividade set nome = 'INSTALAÇÃO DE BANDOLAS DO CABO-GUARDA'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'INSTALAÇÃO DE BANDOLAS';


-- =============================================================================
-- 2. A bandola do condutor nasce
-- =============================================================================
-- Ordem 177: depois da ancoragem do cabo-guarda (175) e antes do piloto do
-- condutor (178). Sem campo 'cabo' — condutor não se divide em OPGW e para-raio.
insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
select o.id, 'INSTALAÇÃO DE BANDOLAS E ISOLADORES', 177, '#7986cb', '#ffffff', 'link', true
from obra o
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;


-- =============================================================================
-- 3. Dependências
-- =============================================================================
--   antes   … → CABO OPGW/PR → PILOTO DO CONDUTOR → CONDUTOR
--   agora   … → CABO OPGW/PR → BANDOLAS E ISOLADORES → PILOTO DO CONDUTOR → CONDUTOR

-- 3a. O piloto do condutor não pendura mais direto no lançamento do cabo-guarda
delete from atividade_dependencia
where (atividade_id, requer_atividade_id) in (
  select a.id, r.id
  from atividade a
  join atividade r on r.obra_id = a.obra_id
  where a.obra_id = (select id from obra where codigo = 'SD')
    and a.nome = 'LANÇAMENTO DO PILOTO DO CONDUTOR'
    and r.nome = 'LANÇAMENTO DO CABO OPGW/PR'
);

-- 3b. A bandola do condutor entra no meio
insert into atividade_dependencia (atividade_id, requer_atividade_id)
select a.id, r.id
from obra o
join atividade a on a.obra_id = o.id
join atividade r on r.obra_id = o.id
join (values
  ('INSTALAÇÃO DE BANDOLAS E ISOLADORES', 'LANÇAMENTO DO CABO OPGW/PR'),
  ('LANÇAMENTO DO PILOTO DO CONDUTOR',    'INSTALAÇÃO DE BANDOLAS E ISOLADORES')
) as d(atividade, requer)
  on d.atividade = a.nome and d.requer = r.nome
where o.codigo = 'SD'
on conflict do nothing;


-- =============================================================================
-- Conferência
-- =============================================================================
-- Devem sair 35 linhas. A fase de cabo fica assim, de 130 a 180:
--
--   130  INSTALAÇÃO DE BANDOLAS DO CABO-GUARDA   ← pede o cabo (OPGW / para-raio)
--   140  LANÇAMENTO DO PILOTINHO                 ← pede o cabo · exige GIRO E PRUMO
--   150  LANÇAMENTO DO CABO OPGW/PR              ← pede o cabo
--   160  NIVELAMENTO OPGW / PARA-RAIO            ← pede o cabo
--   170  GRAMPEAÇÃO OPGW / PARA-RAIO             ← pede o cabo
--   175  ANCORAGEM OPGW / PARA-RAIO              ← pede o cabo
--   177  INSTALAÇÃO DE BANDOLAS E ISOLADORES     ← condutor
--   178  LANÇAMENTO DO PILOTO DO CONDUTOR        ← condutor
--   180  LANÇAMENTO CONDUTOR 100%                ← condutor
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
