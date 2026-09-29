-- =============================================================================
-- PARA COLAR NO SQL EDITOR DO SUPABASE — atualizado em 29/09/2026
-- =============================================================================
-- Pendentes: a 33 e a 34. Confere antes com
--
--   select numero, arquivo from migracao order by numero;
--
-- Se a última linha for 32, é isto aqui que falta. Se já aparecer 33 ou 34,
-- pode rodar do mesmo jeito: as duas são idempotentes.
--
--   33-escavacao-cadeia-e-estrutura.sql   a escavação volta a exigir acesso e
--                                         as três supressões, e atividade de
--                                         estaiada para de caber em AUP
--   34-carga-inicial-sem-repeticao.sql    apaga a REVISÃO duplicada e impede
--                                         que a carga inicial repita de novo
--
-- Cola inteiro e roda. Sai bastante coisa no caminho, mas o SQL Editor só
-- mostra o resultado da ÚLTIMA consulta — que aqui é a conferência da 34, e
-- tem que vir vazia. As outras duas conferências ficam para rodar à parte,
-- copiando o bloco do fim de cada arquivo:
--
--   db/33...  lista o que já está no banco com atividade no tipo errado de torre
--   db/31...  lista o que já está com a sequência invertida
-- =============================================================================



-- ###########################################################################
-- 33-escavacao-cadeia-e-estrutura.sql
-- ###########################################################################

-- =============================================================================
-- A escavação e o tipo da torre — 29/09/2026
-- =============================================================================
-- Dois buracos que apareceram juntos na mesma tela: quatro torres AUP com
-- ESCAVAÇÃO - ESTAI programada, e a escavação caindo antes da abertura de
-- acesso sem ninguém reclamar.
--
-- BURACO 1 — a cadeia da escavação encolheu sem querer.
--
-- A db/04 tinha deixado claro: "ESCAVAÇÃO: precisa das 3 supressões e do
-- acesso". A db/21, que reescreveu a cadeia inteira para o formato da ISA,
-- apagou tudo antes de inserir e trouxe de volta só ESCAVAÇÃO → SUPRESSÃO DE
-- ÁREA DE TORRE. Acesso, corte seletivo e supressão da faixa ficaram para trás.
--
-- Por isso programar escavação antes da abertura de acesso passava: pela cadeia
-- cadastrada, uma coisa não tinha nada a ver com a outra. A regra de sequência
-- invertida da db/31 estava certa e não tinha o que barrar.
--
-- E as duas escavações novas da db/27 nasceram pedindo só a área de torre. Elas
-- são a mesma escavação repartida, então pedem o mesmo que a genérica.
--
-- BURACO 2 — atividade de estaiada em torre autoportante.
--
-- ESCAVAÇÃO - ESTAI e ESCAVAÇÃO - MC só existem em estaiada: autoportante não
-- tem estai nem mastro central, tem quatro pés. O sistema deixou lançar as duas
-- em torre AUP e não disse nada, porque não havia onde dizer que uma atividade
-- pertence a um tipo de torre.
--
-- Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A escavação volta a exigir o acesso e as três supressões
-- -----------------------------------------------------------------------------
-- Vale para as três: a genérica e as duas repartidas.
-- -----------------------------------------------------------------------------

insert into atividade_dependencia (atividade_id, requer_atividade_id)
select a.id, r.id
from obra o
join atividade a on a.obra_id = o.id
join atividade r on r.obra_id = o.id
join (values
  ('ESCAVAÇÃO',         'ABERTURA DE ACESSO'),
  ('ESCAVAÇÃO',         'CORTE SELETIVO'),
  ('ESCAVAÇÃO',         'SUPRESSÃO DA FAIXA'),

  ('ESCAVAÇÃO - ESTAI', 'ABERTURA DE ACESSO'),
  ('ESCAVAÇÃO - ESTAI', 'CORTE SELETIVO'),
  ('ESCAVAÇÃO - ESTAI', 'SUPRESSÃO DA FAIXA'),

  ('ESCAVAÇÃO - MC',    'ABERTURA DE ACESSO'),
  ('ESCAVAÇÃO - MC',    'CORTE SELETIVO'),
  ('ESCAVAÇÃO - MC',    'SUPRESSÃO DA FAIXA')
) as d(atividade, requer)
  on d.atividade = a.nome and d.requer = r.nome
where o.codigo = 'SD'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Atividade que só existe num tipo de torre
-- -----------------------------------------------------------------------------
-- null = serve para qualquer torre, que é o caso da grande maioria.
-- -----------------------------------------------------------------------------

alter table atividade
  add column if not exists so_para_estrutura tipo_estrutura;

comment on column atividade.so_para_estrutura is
  'Tipo de torre em que esta atividade existe. Nulo quando serve para as duas.';

update atividade a
set so_para_estrutura = 'ESTAIADA'
from obra o
where a.obra_id = o.id
  and o.codigo = 'SD'
  and a.nome in ('ESCAVAÇÃO - ESTAI', 'ESCAVAÇÃO - MC')
  and a.so_para_estrutura is distinct from 'ESTAIADA';

-- -----------------------------------------------------------------------------
-- 3. A regra de bloqueio passa a olhar o tipo da torre
-- -----------------------------------------------------------------------------

create or replace function motivo_bloqueio_programacao(
  p_torre_id     uuid,
  p_atividade_id uuid,
  p_data         date
) returns text
language plpgsql stable as $$
declare
  v_restricao  record;
  v_pendente   text;
  v_invertida  record;
  v_estrutura  tipo_estrutura;
  v_so_para    tipo_estrutura;
  v_nome       text;
begin
  -- 1. A atividade existe neste tipo de torre?
  select a.nome, a.so_para_estrutura into v_nome, v_so_para
  from atividade a where a.id = p_atividade_id;

  if v_so_para is not null then
    select t.estrutura into v_estrutura from torre t where t.id = p_torre_id;

    -- Torre sem tipo cadastrado não bloqueia: o que falta ali é o cadastro da
    -- torre, e travar a programação por isso seria castigar o lado errado.
    if v_estrutura is not null and v_estrutura <> v_so_para then
      return format('%s é de torre %s, e esta é %s.',
                    v_nome, lower(v_so_para::text), lower(v_estrutura::text));
    end if;
  end if;

  -- 2. Restrição ativa na torre
  select tipo, previsao_liberacao into v_restricao
  from restricao
  where torre_id = p_torre_id and data_liberacao is null
  order by data_inicio
  limit 1;

  if found then
    return format('Torre com restrição %s em aberto%s',
      lower(v_restricao.tipo::text),
      coalesce(' (previsão de liberação: ' ||
        to_char(v_restricao.previsao_liberacao, 'DD/MM/YYYY') || ')', ''));
  end if;

  -- 3. Toda a cadeia de pré-requisitos, não só o degrau anterior.
  with recursive necessarias as (
    select ad.requer_atividade_id as id
    from atividade_dependencia ad
    where ad.atividade_id = p_atividade_id

    union

    select ad.requer_atividade_id
    from atividade_dependencia ad
    join necessarias n on n.id = ad.atividade_id
  )
  select string_agg(a.nome, ', ' order by a.ordem_execucao)
  into v_pendente
  from necessarias n
  join atividade a on a.id = n.id
  -- A pendente que não existe neste tipo de torre não conta: cobrar escavação
  -- de estai numa autoportante seria pedir o impossível.
  where (a.so_para_estrutura is null
         or a.so_para_estrutura = (select t.estrutura from torre t where t.id = p_torre_id)
         or (select t.estrutura from torre t where t.id = p_torre_id) is null)
  and not exists (
    select 1 from execucao e
    where e.torre_id = p_torre_id
      and e.atividade_id = a.id
      and e.data_execucao <= p_data
  )
  and not exists (
    select 1 from programacao pr
    where pr.torre_id = p_torre_id
      and pr.atividade_id = a.id
      -- <= e não <: a mesma equipe escava e instala o pré-moldado no mesmo dia
      and pr.data <= p_data
      and pr.situacao = 'APROVADA'
  );

  if v_pendente is not null then
    return format('Depende de: %s — nem executada, nem programada para esta data ou antes',
                  v_pendente);
  end if;

  -- 4. O outro lado: quem depende desta atividade já está programado para ANTES.
  with recursive dependentes as (
    select ad.atividade_id as id
    from atividade_dependencia ad
    where ad.requer_atividade_id = p_atividade_id

    union

    select ad.atividade_id
    from atividade_dependencia ad
    join dependentes d on d.id = ad.requer_atividade_id
  )
  select a.nome, pr.data into v_invertida
  from dependentes d
  join atividade a on a.id = d.id
  join programacao pr
    on pr.torre_id = p_torre_id
   and pr.atividade_id = a.id
   and pr.situacao = 'APROVADA'
   and pr.data < p_data
  order by pr.data
  limit 1;

  if found then
    return format('%s já está programada para %s nesta torre e depende desta. '
                  || 'Programar para %s deixaria a sequência invertida.',
                  v_invertida.nome,
                  to_char(v_invertida.data, 'DD/MM'),
                  to_char(p_data, 'DD/MM'));
  end if;

  return null;
end;
$$;

insert into migracao (numero, arquivo)
values (33, '33-escavacao-cadeia-e-estrutura.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- O que já está no banco contrariando estas duas regras
-- =============================================================================
-- Só leitura. A regra nova vale para o que for lançado daqui pra frente; o que
-- já entrou continua onde está. Isto lista o que vai passar a reclamar.
-- =============================================================================

-- Atividade no tipo errado de torre
select 'tipo de torre'  as problema,
       tr.nome          as trecho,
       t.identificador  as torre,
       t.estrutura::text as torre_e,
       a.nome           as atividade,
       to_char(p.data, 'DD/MM/YYYY') as programada_para
from programacao p
join torre t     on t.id = p.torre_id
join trecho tr   on tr.id = t.trecho_id
join atividade a on a.id = p.atividade_id
where a.so_para_estrutura is not null
  and t.estrutura is not null
  and t.estrutura <> a.so_para_estrutura
order by tr.nome, t.ordem, p.data;

-- ###########################################################################
-- 34-carga-inicial-sem-repeticao.sql
-- ###########################################################################

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
