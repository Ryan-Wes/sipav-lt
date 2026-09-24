-- =============================================================================
-- Lançamento só depois da montagem terminada — 24/09/2026
-- =============================================================================
-- Wesley: "não se faz lançamento sem terminar montagem".
--
-- A frase é mais larga que a pergunta que eu fiz. Eu tinha perguntado só do
-- condutor, mas o OPGW e o para-raio também são lançamento, e até agora
-- qualquer um deles liberava assim que a torre era içada.
--
-- Onde pendurar a dependência:
--
--   · Em INSTALAÇÃO DE BANDOLAS seria o mais abrangente, mas o Alessandro disse
--     no áudio da cadeia que "vem a instalação de bandolas após a montagem".
--     Bandola é acessório na torre, não é puxar cabo — travá-la no prumo
--     impediria trabalho que hoje é legítimo.
--
--   · Em LANÇAMENTO DO PILOTO, que é a primeira vez que se puxa cabo de fato.
--     É onde a regra entra sem contrariar o Alessandro.
--
-- Daqui para frente a regra se espalha sozinha, porque o bloqueio é transitivo
-- (ver 16-bloqueio-transitivo.sql):
--
--     GIRO E PRUMO
--       └─ LANÇAMENTO DO PILOTO
--            ├─ LANÇAMENTO DO CABO OPGW/PR
--            │    └─ NIVELAMENTO · GRAMPEAÇÃO · ANCORAGEM
--            └─ LANÇAMENTO CONDUTOR 100%
--                 └─ NIVELAMENTO · GRAMPEAÇÃO · ANCORAGEM · acessórios
--
-- Ou seja, não é preciso repetir a aresta em cada uma: basta a torre não estar
-- aprumada para o ramo inteiro acusar bloqueio, dizendo qual etapa falta.
-- =============================================================================

-- Aceita os dois nomes de propósito: o 23 renomeia esta atividade para
-- 'LANÇAMENTO DO PILOTINHO', e sem isto rodar o 23 primeiro faria este insert
-- não casar com nada e falhar calado.
insert into atividade_dependencia (atividade_id, requer_atividade_id)
select a.id, r.id
from atividade a
join atividade r on r.obra_id = a.obra_id
where a.obra_id = (select id from obra where codigo = 'SD')
  and a.nome in ('LANÇAMENTO DO PILOTO', 'LANÇAMENTO DO PILOTINHO')
  and r.nome = 'GIRO E PRUMO'
on conflict do nothing;


-- =============================================================================
-- Conferência — o caminho de bloqueio a partir do prumo
-- =============================================================================
-- Mostra, para cada atividade de lançamento, tudo que ela exige depois da
-- expansão transitiva. GIRO E PRUMO tem que aparecer em todas.
with recursive fecho(atividade_id, requer_id) as (
  select atividade_id, requer_atividade_id
  from atividade_dependencia
  union
  select f.atividade_id, d.requer_atividade_id
  from fecho f
  join atividade_dependencia d on d.atividade_id = f.requer_id
)
select
  a.ordem_execucao as ordem,
  a.nome           as atividade,
  string_agg(r.nome, '  ·  ' order by r.ordem_execucao) as exige_no_total
from fecho f
join atividade a on a.id = f.atividade_id
join atividade r on r.id = f.requer_id
where a.obra_id = (select id from obra where codigo = 'SD')
  and a.ordem_execucao >= 130          -- da instalação de bandolas para frente
group by a.id, a.ordem_execucao, a.nome
order by a.ordem_execucao;
