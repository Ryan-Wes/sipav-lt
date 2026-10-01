-- =============================================================================
-- Programado × executado que não se perde, e estágio só com a atividade completa — 01/10/2026
-- =============================================================================
-- Duas coisas que o apontamento deixava frouxas.
--
-- 1) O REGISTRO DO PROGRAMADO.
--
-- A view `aderencia` já comparava programado com executado, mas lia a data
-- programada AO VIVO, na linha da programação. Se a programação fosse editada
-- depois (adiar a semana por causa da chuva), a data programada mudava junto, e
-- um item que escorregou três dias aparecia "no prazo". Se fosse apagada, a
-- execução perdia o vínculo (programacao_id vira nulo) e passava a constar como
-- "executada sem programar".
--
-- É o contrário do que se quer de um controle de metas: o compromisso tem que
-- ficar gravado no momento em que a execução é apontada.
--
-- A execução passa a guardar duas fotos, tiradas pelo banco no momento do
-- apontamento — não pela tela, que poderia esquecer ou errar:
--
--   data_programada           a data da programação naquele momento
--   data_programada_original  a data de quando a programação nasceu, lida do
--                             histórico. É a que importa para meta: adiar a
--                             semana inteira não pode esconder o atraso.
--
-- 2) O ESTÁGIO.
--
-- O estágio da torre era a atividade mais avançada com QUALQUER execução. Com o
-- serviço repartido (20% de um estai, 25% de um pé), apontar a primeira parte
-- já fazia a torre constar como escavada por inteiro.
--
-- Agora a atividade só vira estágio quando a soma dos percentuais executados
-- chega a 100. A carga inicial da planilha grava 100, então não muda nada para
-- ela.
--
-- Idempotente.
-- =============================================================================

alter table execucao
  add column if not exists data_programada date,
  add column if not exists data_programada_original date;

comment on column execucao.data_programada is
  'A data da programação no momento em que a execução foi apontada. Foto, não vínculo: '
  'continua valendo se a programação for editada ou apagada depois.';

comment on column execucao.data_programada_original is
  'A data de quando a programação nasceu, lida do histórico. É a base de meta: '
  'adiar a semana não pode esconder o atraso.';

-- -----------------------------------------------------------------------------
-- Quem já foi apontado ganha as fotos
-- -----------------------------------------------------------------------------
-- Para o que já existe, a data de hoje da programação é a melhor foto possível;
-- a original sai do histórico, quando houver.
-- -----------------------------------------------------------------------------

update execucao e
set data_programada = p.data,
    data_programada_original = coalesce(
      (select h.data
         from programacao_historico h
        where h.programacao_id = p.id and h.acao = 'CRIOU'
        order by h.quando, h.id
        limit 1),
      p.data)
from programacao p
where e.programacao_id = p.id
  and not e.carga_inicial
  and e.data_programada is null;

-- -----------------------------------------------------------------------------
-- O banco tira a foto no apontamento
-- -----------------------------------------------------------------------------

create or replace function execucao_guarda_o_programado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Carga inicial não vem de programação, e execução sem programação não tem
  -- o que guardar.
  if new.carga_inicial or new.programacao_id is null then
    return new;
  end if;

  select p.data into new.data_programada
  from programacao p
  where p.id = new.programacao_id;

  select coalesce(
           (select h.data
              from programacao_historico h
             where h.programacao_id = new.programacao_id and h.acao = 'CRIOU'
             order by h.quando, h.id
             limit 1),
           new.data_programada)
  into new.data_programada_original;

  return new;
end;
$$;

drop trigger if exists execucao_guarda_programado on execucao;
create trigger execucao_guarda_programado
  before insert on execucao
  for each row execute function execucao_guarda_o_programado();

-- -----------------------------------------------------------------------------
-- Estágio: a atividade só conta quando chega a 100%
-- -----------------------------------------------------------------------------
-- Mesma view da db/14, mudando só o que escolhe a "última atividade". As colunas
-- ficam idênticas e na mesma ordem, como o create or replace exige.
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
  select a.id as atividade_id, a.nome, a.cor_fundo, a.icone,
         max(e.data_execucao) as data_execucao
  from execucao e
  join atividade a on a.id = e.atividade_id
  where e.torre_id = t.id
  group by a.id, a.nome, a.cor_fundo, a.icone, a.ordem_execucao
  having sum(e.percentual) >= 100
  order by a.ordem_execucao desc
  limit 1
) ua on true
left join lateral (
  select id, tipo, previsao_liberacao
  from restricao
  where torre_id = t.id and data_liberacao is null
  order by data_inicio
  limit 1
) r on true;

-- -----------------------------------------------------------------------------
-- Aderência: programado × executado, pelo vínculo e pela foto
-- -----------------------------------------------------------------------------
-- A versão da db/20 juntava por torre + atividade, sem olhar o vínculo: duas
-- programações da mesma atividade na mesma torre (50% num dia, 50% no outro)
-- viravam quatro linhas, cada execução casada com as duas programações.
--
-- Agora é uma linha por execução e uma por programação que ainda não saiu. As
-- colunas antigas ficam como estavam; as novas entram no fim.
-- -----------------------------------------------------------------------------

create or replace view aderencia with (security_invoker = true) as

-- O que foi executado em campo
select
  t.trecho_id,
  t.id                          as torre_id,
  t.identificador               as torre,
  t.km,
  a.nome                        as atividade,
  a.ordem_execucao,
  ex.programacao_id,
  coalesce(ex.data_programada, pr.data)  as data_programada,
  enc_pr.nome                   as encarregado_programado,
  ex.id                         as execucao_id,
  ex.data_execucao,
  enc_ex.nome                   as encarregado_executou,
  case
    when coalesce(ex.data_programada, pr.data) is null      then 'EXECUTADO SEM PROGRAMAR'
    when ex.data_execucao = coalesce(ex.data_programada, pr.data) then 'NO PRAZO'
    when ex.data_execucao < coalesce(ex.data_programada, pr.data) then 'ADIANTADO'
    else                                                         'ATRASADO'
  end                           as situacao,
  ex.data_execucao - coalesce(ex.data_programada, pr.data)  as dias_de_desvio,
  coalesce(ex.data_programada_original, ex.data_programada, pr.data)
                                as data_programada_original,
  ex.data_execucao - coalesce(ex.data_programada_original, ex.data_programada, pr.data)
                                as desvio_do_original,
  pr.percentual                 as percentual_programado,
  ex.percentual                 as percentual_executado
from execucao ex
join torre t     on t.id = ex.torre_id
join atividade a on a.id = ex.atividade_id
left join programacao pr     on pr.id = ex.programacao_id
left join encarregado enc_pr on enc_pr.id = pr.encarregado_id
left join encarregado enc_ex on enc_ex.id = ex.encarregado_id
where not ex.carga_inicial

union all

-- O que foi programado e ainda não saiu. Vencida é a que já devia ter saído:
-- é a pergunta de meta, "o que era para ter acontecido e não aconteceu".
select
  t.trecho_id,
  t.id,
  t.identificador,
  t.km,
  a.nome,
  a.ordem_execucao,
  pr.id,
  pr.data,
  enc_pr.nome,
  null::uuid,
  null::date,
  null::text,
  case when pr.data < current_date then 'NÃO EXECUTADA' else 'PENDENTE' end,
  null::integer,
  coalesce(
    (select h.data
       from programacao_historico h
      where h.programacao_id = pr.id and h.acao = 'CRIOU'
      order by h.quando, h.id
      limit 1),
    pr.data),
  null::integer,
  pr.percentual,
  null::numeric(5,2)
from programacao pr
join torre t     on t.id = pr.torre_id
join atividade a on a.id = pr.atividade_id
left join encarregado enc_pr on enc_pr.id = pr.encarregado_id
where not exists (select 1 from execucao ex where ex.programacao_id = pr.id);

comment on view aderencia is
  'Programado x executado. Uma linha por execução apontada e uma por programação que '
  'ainda não saiu. A data programada vem da foto guardada na execução, não da '
  'programação de hoje.';

insert into migracao (numero, arquivo)
values (38, '38-programado-e-executado.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Aponte uma programação com data real diferente da programada e rode isto.
-- "original" é quando nasceu, "programada" é a de hoje, "executada" é a real.
-- Se a programação foi adiada, as duas primeiras diferem — e o desvio do original
-- é o que conta para meta.
-- =============================================================================

select torre,
       atividade,
       to_char(data_programada_original, 'DD/MM') as original,
       to_char(data_programada, 'DD/MM')          as programada,
       to_char(data_execucao, 'DD/MM')            as executada,
       dias_de_desvio                             as desvio,
       desvio_do_original                         as desvio_do_original,
       situacao
from aderencia
where execucao_id is not null
order by data_execucao desc
limit 20;
