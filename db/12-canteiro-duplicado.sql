-- =============================================================================
-- Canteiro duplicado por acento — 23/09/2026
-- =============================================================================
-- A planilha traz "IGARITE" sem acento; o cadastro tem "Igarité". A comparação
-- do app ignorava caixa mas não acento, então nasceu um canteiro duplicado.
--
-- Este script funde os duplicados (mantendo o mais antigo, que é o do seed) e
-- cria uma trava no banco para não acontecer de novo — venha de onde vier, app
-- ou SQL na mão.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Função de comparação: minúsculas e sem acento
-- IMMUTABLE porque vai virar índice único.
-- -----------------------------------------------------------------------------
create or replace function sem_acento(txt text) returns text
language sql immutable strict as $$
  select lower(translate(txt,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;

-- -----------------------------------------------------------------------------
-- O que vai ser fundido
-- -----------------------------------------------------------------------------
select dup.nome as duplicado, can.nome as mantido
from canteiro dup
join canteiro can
  on can.obra_id = dup.obra_id
 and sem_acento(can.nome) = sem_acento(dup.nome)
 and can.criado_em < dup.criado_em
where dup.obra_id = (select id from obra where codigo = 'SD');

-- -----------------------------------------------------------------------------
-- 1. Torres do duplicado passam para o canteiro canônico
-- -----------------------------------------------------------------------------
update torre t
set canteiro_id = d.id_canonico
from (
  select distinct on (dup.id) dup.id as id_dup, can.id as id_canonico
  from canteiro dup
  join canteiro can
    on can.obra_id = dup.obra_id
   and sem_acento(can.nome) = sem_acento(dup.nome)
   and can.criado_em < dup.criado_em
  where dup.obra_id = (select id from obra where codigo = 'SD')
  order by dup.id, can.criado_em
) d
where t.canteiro_id = d.id_dup;

-- -----------------------------------------------------------------------------
-- 2. Vínculos de trecho do duplicado passam para o canônico
-- -----------------------------------------------------------------------------
insert into canteiro_trecho (canteiro_id, trecho_id)
select d.id_canonico, ct.trecho_id
from canteiro_trecho ct
join (
  select distinct on (dup.id) dup.id as id_dup, can.id as id_canonico
  from canteiro dup
  join canteiro can
    on can.obra_id = dup.obra_id
   and sem_acento(can.nome) = sem_acento(dup.nome)
   and can.criado_em < dup.criado_em
  where dup.obra_id = (select id from obra where codigo = 'SD')
  order by dup.id, can.criado_em
) d on d.id_dup = ct.canteiro_id
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 3. Apaga os duplicados
-- -----------------------------------------------------------------------------
delete from canteiro dup
where dup.obra_id = (select id from obra where codigo = 'SD')
  and exists (
    select 1 from canteiro can
    where can.obra_id = dup.obra_id
      and sem_acento(can.nome) = sem_acento(dup.nome)
      and can.criado_em < dup.criado_em
  );

-- -----------------------------------------------------------------------------
-- 4. Trava: nome de canteiro é único ignorando caixa e acento
-- -----------------------------------------------------------------------------
create unique index if not exists canteiro_nome_sem_acento_unico
  on canteiro (obra_id, sem_acento(nome));

-- -----------------------------------------------------------------------------
-- Conferência: 9 canteiros, com as torres de cada um
-- -----------------------------------------------------------------------------
select c.nome,
       count(t.id) as torres,
       coalesce(round(sum(t.km), 3), 0) as km
from canteiro c
left join torre t on t.canteiro_id = c.id
where c.obra_id = (select id from obra where codigo = 'SD')
group by c.nome
order by c.nome;
