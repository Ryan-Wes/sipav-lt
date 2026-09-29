-- =============================================================================
-- Carga inicial repetida — 29/09/2026
-- =============================================================================
-- Achei conferindo execução repetida: REVISÃO aparece duas vezes em quase toda
-- torre de Buritirama - Barra, e uma vez a mais na 1/1 de Barra - Correntina.
-- As duas são carga inicial (2 e 0 apontadas), então não é o caso legítimo de
-- carga inicial mais apontamento de campo em cima.
--
-- Execução contada em dobro vira avanço em dobro, e é do tipo que ninguém
-- percebe olhando a grade — aparece lá na frente, no percentual do relatório
-- da ISA, quando já não dá para saber de onde veio.
--
-- Carga inicial é, por definição, uma linha por atividade por torre: é o
-- retrato do que já estava feito quando o sistema entrou. Duas linhas iguais
-- nunca são certas, venham de onde vierem.
--
-- Esta migração apaga a repetição e fecha a porta para não voltar. Não toca em
-- apontamento de campo (carga_inicial = false), onde a mesma atividade pode
-- legitimamente ter mais de uma linha — serviço repartido em dois dias.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Antes: quantas sobram
-- -----------------------------------------------------------------------------

do $$
declare
  v_repetidas int;
begin
  select count(*) into v_repetidas
  from (
    select torre_id, atividade_id
    from execucao
    where carga_inicial
    group by torre_id, atividade_id
    having count(*) > 1
  ) x;

  raise notice 'Pares torre+atividade com carga inicial repetida: %', v_repetidas;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Apaga a repetição, guardando a mais antiga
-- -----------------------------------------------------------------------------
-- A mais antiga é a que foi criada na primeira importação. Guardar a primeira
-- e não a última é de propósito: o id dela pode estar referenciado em histórico.
-- -----------------------------------------------------------------------------

with ordenadas as (
  select id,
         row_number() over (
           partition by torre_id, atividade_id
           order by criado_em, id
         ) as posicao
  from execucao
  where carga_inicial
)
delete from execucao e
using ordenadas o
where e.id = o.id
  and o.posicao > 1;

-- -----------------------------------------------------------------------------
-- 3. Fecha a porta
-- -----------------------------------------------------------------------------
-- O índice parcial vale só para a carga inicial. Apontamento de campo continua
-- podendo repetir a atividade na torre, que é o serviço repartido em dois dias.
-- -----------------------------------------------------------------------------

create unique index if not exists execucao_carga_inicial_unica
  on execucao (torre_id, atividade_id)
  where carga_inicial;

insert into migracao (numero, arquivo)
values (34, '34-carga-inicial-sem-repeticao.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Depois: tem que vir vazio
-- =============================================================================

select tr.nome as trecho,
       t.identificador,
       a.nome  as atividade,
       count(*) as vezes
from execucao e
join torre t     on t.id = e.torre_id
join trecho tr   on tr.id = t.trecho_id
join atividade a on a.id = e.atividade_id
where e.carga_inicial
group by tr.nome, t.identificador, a.nome, t.ordem
having count(*) > 1
order by tr.nome, t.ordem;
