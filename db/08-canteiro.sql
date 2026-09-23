-- =============================================================================
-- Canteiro — 23/09/2026
-- =============================================================================
-- Canteiro é a base de apoio da obra e NÃO se confunde com trecho: um mesmo
-- canteiro atende torres de trechos diferentes. A Hanna descreveu exatamente
-- isso na reunião de 22/09, falando de Laje dos Negros pegando dois trechos.
--
-- Por isso canteiro é dimensão própria pendurada na torre, e não uma
-- subdivisão de trecho.
--
-- Idempotente.
-- =============================================================================

create table if not exists canteiro (
  id        uuid primary key default gen_random_uuid(),
  obra_id   uuid not null references obra(id) on delete cascade,
  nome      text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (obra_id, nome)
);

-- Vínculo opcional: torre pode não ter canteiro definido ainda
alter table torre add column if not exists canteiro_id uuid references canteiro(id) on delete set null;

create index if not exists torre_canteiro_idx on torre (canteiro_id);

-- -----------------------------------------------------------------------------
-- RLS — obrigatória. Sem isso a tabela nasce aberta, porque o projeto está com
-- "Automatically expose new tables" ligado.
-- -----------------------------------------------------------------------------
alter table canteiro enable row level security;

drop policy if exists canteiro_leitura on canteiro;
create policy canteiro_leitura on canteiro for select to authenticated
  using (papel_atual() is not null);

drop policy if exists canteiro_escrita on canteiro;
create policy canteiro_escrita on canteiro for all to authenticated
  using (papel_atual() in ('ADMIN','PLANEJAMENTO'))
  with check (papel_atual() in ('ADMIN','PLANEJAMENTO'));

-- -----------------------------------------------------------------------------
-- Canteiros conhecidos
-- -----------------------------------------------------------------------------
-- PENDENTE: só sei de Laje dos Negros. Faltam os demais canteiros da obra.
insert into canteiro (obra_id, nome)
select o.id, c.nome
from obra o, (values ('Laje dos Negros')) as c(nome)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;

-- -----------------------------------------------------------------------------
-- A view de situação passa a expor o canteiro
-- (colunas novas vão no fim: create or replace exige manter a ordem existente)
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
  c.nome                      as canteiro
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

select nome from canteiro
where obra_id = (select id from obra where codigo = 'SD')
order by nome;
