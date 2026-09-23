-- =============================================================================
-- Canteiros da obra e em que trechos atuam — 23/09/2026
-- =============================================================================
-- Fonte: Wesley, 23/09.
--
--   Barra - Correntina        → Igarité, Wanderley
--   Buritirama - Barra        → Buritirama, Barra
--   Campo Formoso - Barra     → Barra, Itajubaquara, Central, Umburanas,
--                               Laje dos Negros
--   Juazeiro - Campo Formoso  → Juazeiro, Laje dos Negros
--
-- Repare que LAJE DOS NEGROS e BARRA atuam em dois trechos cada. É por isso
-- que canteiro é dimensão própria e não subdivisão de trecho: se fosse
-- subdivisão, existiriam dois "Laje dos Negros" distintos no banco.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Os 8 canteiros
-- -----------------------------------------------------------------------------
insert into canteiro (obra_id, nome)
select o.id, c.nome
from obra o, (values
  ('Barra'),
  ('Buritirama'),
  ('Central'),
  ('Igarité'),
  ('Itajubaquara'),
  ('Juazeiro'),
  ('Laje dos Negros'),
  ('Umburanas'),
  ('Wanderley')
) as c(nome)
where o.codigo = 'SD'
on conflict (obra_id, nome) do nothing;

-- -----------------------------------------------------------------------------
-- Em que trechos cada canteiro atua (N:N)
-- -----------------------------------------------------------------------------
create table if not exists canteiro_trecho (
  canteiro_id uuid not null references canteiro(id) on delete cascade,
  trecho_id   uuid not null references trecho(id)   on delete cascade,
  primary key (canteiro_id, trecho_id)
);

alter table canteiro_trecho enable row level security;

drop policy if exists canteiro_trecho_leitura on canteiro_trecho;
create policy canteiro_trecho_leitura on canteiro_trecho for select to authenticated
  using (papel_atual() is not null);

drop policy if exists canteiro_trecho_escrita on canteiro_trecho;
create policy canteiro_trecho_escrita on canteiro_trecho for all to authenticated
  using (papel_atual() in ('ADMIN','PLANEJAMENTO'))
  with check (papel_atual() in ('ADMIN','PLANEJAMENTO'));

insert into canteiro_trecho (canteiro_id, trecho_id)
select c.id, t.id
from obra o
join canteiro c on c.obra_id = o.id
join trecho   t on t.obra_id = o.id
join (values
  ('Barra - Correntina',       'Igarité'),
  ('Barra - Correntina',       'Wanderley'),

  ('Buritirama - Barra',       'Buritirama'),
  ('Buritirama - Barra',       'Barra'),

  ('Campo Formoso - Barra',    'Barra'),
  ('Campo Formoso - Barra',    'Itajubaquara'),
  ('Campo Formoso - Barra',    'Central'),
  ('Campo Formoso - Barra',    'Umburanas'),
  ('Campo Formoso - Barra',    'Laje dos Negros'),

  ('Juazeiro - Campo Formoso', 'Juazeiro'),
  ('Juazeiro - Campo Formoso', 'Laje dos Negros')
) as v(trecho, canteiro)
  on t.nome = v.trecho and c.nome = v.canteiro
where o.codigo = 'SD'
on conflict do nothing;

-- =============================================================================
-- PENDENTE
-- =============================================================================
-- Faixa de torres que cada canteiro atende dentro do trecho. O Wesley ainda vai
-- descobrir. Quando vier, dá para atribuir canteiro automaticamente na
-- importação em vez de digitar na terceira coluna.
-- =============================================================================

select t.nome as trecho, string_agg(c.nome, ', ' order by c.nome) as canteiros
from trecho t
join canteiro_trecho ct on ct.trecho_id = t.id
join canteiro c on c.id = ct.canteiro_id
where t.obra_id = (select id from obra where codigo = 'SD')
group by t.nome, t.ordem
order by t.ordem;
