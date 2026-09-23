-- =============================================================================
-- Estrutura e modelo da torre — 23/09/2026
-- =============================================================================
-- A planilha traz duas colunas novas:
--   · estrutura — "a" (autoportante) ou "e" (estaiada)
--   · modelo    — C61CR, C61CRB, C61CRE, C61SL, C61AT, C61A1, C61SM, C61TR, C61SP
--
-- Nos dados de Barra–Correntina os dois campos são coerentes: todo C61CR* é
-- estaiada e todo o resto é autoportante.
--
-- Além de aparecer no card, a estrutura é a peça que faltava para tratar as
-- atividades condicionais com precisão. Hoje o Alessandro simplificou o
-- reaterro para depender só da escavação justamente porque o sistema não sabia
-- o tipo de fundação de cada torre. Com este campo, dá para evoluir depois —
-- ver o comentário no fim de 05-cadeia-alessandro.sql.
--
-- Idempotente.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_estrutura') then
    create type tipo_estrutura as enum ('AUTOPORTANTE', 'ESTAIADA');
  end if;
end $$;

alter table torre add column if not exists estrutura tipo_estrutura;
alter table torre add column if not exists modelo text;

create index if not exists torre_estrutura_idx on torre (estrutura);

-- -----------------------------------------------------------------------------
-- A view expõe os dois campos (colunas novas no fim, como o replace exige)
-- -----------------------------------------------------------------------------
create or replace view torre_situacao with (security_invoker = true) as
select
  t.id                        as torre_id,
  t.trecho_id,
  t.identificador,
  t.ordem,
  t.km,
  ua.atividade_id             as ultima_atividade_id,
  ua.nome                     as ultima_atividade,
  ua.cor_fundo                as ultima_atividade_cor,
  ua.icone                    as ultima_atividade_icone,
  ua.data_execucao            as ultima_execucao_em,
  r.tipo                      as restricao_tipo,
  r.previsao_liberacao        as restricao_previsao,
  (r.id is not null)          as tem_restricao,
  t.canteiro_id,
  c.nome                      as canteiro,
  t.estrutura,
  t.modelo
from torre t
left join canteiro c on c.id = t.canteiro_id
left join lateral (
  select a.id as atividade_id, a.nome, a.cor_fundo, a.icone, e.data_execucao
  from execucao e
  join atividade a on a.id = e.atividade_id
  where e.torre_id = t.id
  order by a.ordem_execucao desc, e.data_execucao desc
  limit 1
) ua on true
left join lateral (
  select id, tipo, previsao_liberacao
  from restricao
  where torre_id = t.id and data_liberacao is null
  order by data_inicio
  limit 1
) r on true;

select coalesce(estrutura::text, 'sem estrutura') as estrutura,
       count(*) as torres
from torre
group by 1
order by 1;
