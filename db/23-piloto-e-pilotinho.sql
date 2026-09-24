-- =============================================================================
-- Pilotinho e piloto são cabos diferentes — 24/09/2026
-- =============================================================================
-- Wesley: "piloto só é pro condutor e pilotinho que é pros para-raios, OPGW".
--
-- O SIPAV tinha uma atividade só, 'LANÇAMENTO DO PILOTO', servindo aos dois. A
-- planilha da ISA sempre separou:
--
--   4.1.2  LANÇAMENTO DO CABO PILOTINHO PARA LANÇAMENTO DO CABO PARA-RAIO  [KM]
--   4.2.2  LANÇAMENTO DO CABO PILOTINHO PARA LANÇAMENTO DO CABO OPGW       [KM]
--   4.3.2  Lançamento do cabo Piloto do condutor                           [KM]
--
-- A atividade que existe hoje é a do para-raio/OPGW: ela nasceu no 05 entre as
-- bandolas e o lançamento do OPGW/para-raio, e é ela que carrega o campo
-- 'cabo'. Então vira PILOTINHO por rename, preservando id, programação e
-- histórico. O piloto do condutor nasce novo.
--
-- 33 atividades → 34.
-- =============================================================================


-- =============================================================================
-- 1. O que existe era o pilotinho
-- =============================================================================
update atividade set nome = 'LANÇAMENTO DO PILOTINHO'
where obra_id = (select id from obra where codigo = 'SD')
  and nome = 'LANÇAMENTO DO PILOTO';


-- =============================================================================
-- 2. O piloto do condutor nasce
-- =============================================================================
-- Ordem 178: depois da ancoragem do para-raio/OPGW (175) e antes do lançamento do
-- condutor (180). Sem campo 'cabo' — o condutor tem seção própria no relatório,
-- não se divide em OPGW e para-raio.
insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
select o.id, 'LANÇAMENTO DO PILOTO DO CONDUTOR', 178, '#8e6fd8', '#ffffff', 'arrow-right', true
from obra o
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;


-- =============================================================================
-- 3. Dependências
-- =============================================================================
-- O que muda:
--
--   antes   BANDOLAS → PILOTO → OPGW/PR → …
--                        └──────────────→ CONDUTOR
--
--   agora   BANDOLAS → PILOTINHO → OPGW/PR → PILOTO DO CONDUTOR → CONDUTOR
--
-- O Alessandro já tinha dito no áudio que "só após você ter instalado o OPGW ou
-- o para-raio é que você vai poder trabalhar com o condutor". Agora isso passa
-- pelo piloto do condutor, que é o primeiro passo desse trabalho.

-- 3a. O condutor não depende mais direto do pilotinho, que é do para-raio/OPGW
delete from atividade_dependencia
where (atividade_id, requer_atividade_id) in (
  select a.id, r.id
  from atividade a
  join atividade r on r.obra_id = a.obra_id
  where a.obra_id = (select id from obra where codigo = 'SD')
    and a.nome = 'LANÇAMENTO CONDUTOR 100%'
    and r.nome in ('LANÇAMENTO DO PILOTINHO', 'LANÇAMENTO DO CABO OPGW/PR')
);

-- 3b. A corrente nova. O vínculo com o para-raio/OPGW continua existindo, só que
--     agora pelo piloto do condutor — e o bloqueio transitivo cobre o resto.
insert into atividade_dependencia (atividade_id, requer_atividade_id)
select a.id, r.id
from obra o
join atividade a on a.obra_id = o.id
join atividade r on r.obra_id = o.id
join (values
  ('LANÇAMENTO DO PILOTO DO CONDUTOR', 'LANÇAMENTO DO CABO OPGW/PR'),
  ('LANÇAMENTO CONDUTOR 100%',         'LANÇAMENTO DO PILOTO DO CONDUTOR')
) as d(atividade, requer)
  on d.atividade = a.nome and d.requer = r.nome
where o.codigo = 'SD'
on conflict do nothing;


-- =============================================================================
-- Conferência
-- =============================================================================
-- Devem sair 34 linhas. Confira que:
--   · 140 é LANÇAMENTO DO PILOTINHO
--   · 178 é LANÇAMENTO DO PILOTO DO CONDUTOR, exigindo o para-raio/OPGW lançado
--   · 180 LANÇAMENTO CONDUTOR 100% exige o piloto do condutor
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
