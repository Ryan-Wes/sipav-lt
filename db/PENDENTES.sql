-- =============================================================================
-- PARA COLAR NO SQL EDITOR DO SUPABASE — gerado em 29/09/2026
-- =============================================================================
-- As três que faltam neste banco, na ordem certa, num arquivo só:
--
--   30-mesmo-dia-libera.sql       pré-requisito no mesmo dia libera
--   31-sequencia-invertida.sql    barra programar antes de quem depende
--   32-controle-de-migracoes.sql  registra o que já foi aplicado
--
-- A ordem importa: a 31 reescreve a mesma função que a 30, então a 30 tem que
-- vir antes ou a regra do mesmo dia se perde. A 32 vem por último e registra
-- tudo de uma vez.
--
-- Cola inteiro e roda de uma vez. Todas são idempotentes: rodar duas vezes não
-- estraga nada. No fim sai a lista do que ficou aplicado.
--
-- DEPOIS DE RODAR, vale rodar uma consulta sozinha: a do fim da
-- 31-sequencia-invertida.sql, que lista as programações que já estão invertidas
-- neste banco — atividade lançada antes de quem ela depende. Ela está aqui no
-- meio do arquivo e roda junto, mas o SQL Editor só mostra o resultado da
-- última consulta, então o dela se perde. Ela é só leitura: abra o arquivo 31,
-- copie o bloco do fim e rode separado para ver o que já entrou torto.
--
-- Este arquivo é só a junção — quem manda são os numerados em db/. Não edite
-- aqui; se precisar mexer, mexe no arquivo numerado.
-- =============================================================================



-- ###########################################################################
-- 30-mesmo-dia-libera.sql
-- ###########################################################################

-- =============================================================================
-- Pré-requisito programado para o MESMO dia também libera — 29/09/2026
-- =============================================================================
-- Do Alessandro, 25/09: "Estou escavando e instalando o pré-moldado no mesmo
-- dia. Poderia até ter gente reaterrando na sequência. O que sugeria: colocar
-- sistema para ler se existe a atividade antecessora programada no mesmo dia ou
-- dia anterior."
--
-- A regra exigia data ESTRITAMENTE anterior (pr.data < p_data). Isso descrevia
-- uma obra que anda uma atividade por dia por torre, e não é a obra. A execução
-- já era tratada assim — e.data_execucao <= p_data — só a programação é que
-- ficou mais dura que a realidade.
--
-- Eu tinha contornado isso do lado errado: inventei um campo de "+N dias" na
-- tela para empurrar a segunda atividade para o dia seguinte, forçando a mão
-- para caber na regra. Era a regra que estava errada.
--
-- Efeito: escavar e instalar pré-moldado no mesmo dia passa a ser lançamento
-- normal, sem aviso de fora de sequência e sem justificativa de override.
--
-- Idempotente.
-- =============================================================================

create or replace function motivo_bloqueio_programacao(
  p_torre_id     uuid,
  p_atividade_id uuid,
  p_data         date
) returns text
language plpgsql stable as $$
declare
  v_restricao record;
  v_pendente  text;
begin
  -- 1. Restrição ativa na torre
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

  -- 2. Toda a cadeia de pré-requisitos, não só o degrau anterior.
  --    UNION (e não UNION ALL) já elimina repetição e protege de ciclo.
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
  where not exists (
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

  return null;
end;
$$;

-- =============================================================================
-- Conferência: o mesmo dia passou a liberar?
-- =============================================================================
-- Pega uma torre zerada, finge uma programação de hoje para a primeira
-- atividade da cadeia e pergunta se a seguinte estaria liberada para hoje.
-- Não grava nada — é tudo dentro de uma transação que termina em rollback.
-- =============================================================================

-- begin;
--
-- with alvo as (
--   select ts.torre_id
--   from torre_situacao ts
--   join trecho t on t.id = ts.trecho_id
--   where t.nome = 'Barra - Correntina'
--     and ts.ultima_atividade is null
--   limit 1
-- )
-- select motivo_bloqueio_programacao(
--          alvo.torre_id,
--          (select id from atividade where nome = 'ESCAVAÇÃO'
--             and obra_id = (select id from obra where codigo = 'SD')),
--          current_date
--        ) as antes_de_programar_a_anterior
-- from alvo;
--
-- rollback;

-- ###########################################################################
-- 31-sequencia-invertida.sql
-- ###########################################################################

-- =============================================================================
-- Programar uma atividade DEPOIS de quem depende dela — 29/09/2026
-- =============================================================================
-- Achei isto olhando a grade: torre com ESCAVAÇÃO - ESTAI em 05/10 e ABERTURA DE
-- ACESSO em 12/10. Não existe. Sem acesso não se chega na torre para escavar.
--
-- A regra só olhava para trás: ao programar A, conferia se os pré-requisitos de
-- A estavam executados ou programados para antes. Nunca olhou para frente — se
-- alguém que DEPENDE de A já estava programado para antes de A, passava calado.
--
-- É o mesmo erro visto do outro lado, e acontece justamente na ordem em que se
-- programa de verdade: primeiro lança a escavação da semana, depois lembra do
-- acesso e lança para a semana seguinte, sem perceber que inverteu.
--
-- Mesmo dia continua liberado nos dois sentidos, como a db/30 deixou: o que se
-- barra aqui é sucessora programada ESTRITAMENTE antes.
--
-- Idempotente.
-- =============================================================================

create or replace function motivo_bloqueio_programacao(
  p_torre_id     uuid,
  p_atividade_id uuid,
  p_data         date
) returns text
language plpgsql stable as $$
declare
  v_restricao record;
  v_pendente  text;
  v_invertida record;
begin
  -- 1. Restrição ativa na torre
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

  -- 2. Toda a cadeia de pré-requisitos, não só o degrau anterior.
  --    UNION (e não UNION ALL) já elimina repetição e protege de ciclo.
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
  where not exists (
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

  -- 3. O outro lado: quem depende desta atividade já está programado para ANTES.
  --    Sobe a cadeia ao contrário, das sucessoras diretas até o fim.
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

-- =============================================================================
-- O que já está invertido no banco
-- =============================================================================
-- Só leitura. Lista os pares que existem hoje e que a regra nova recusaria, para
-- eu saber o tamanho do estrago antes de sair corrigindo. Nada é alterado.
-- =============================================================================

with recursive cadeia as (
  select ad.atividade_id, ad.requer_atividade_id
  from atividade_dependencia ad

  union

  select c.atividade_id, ad.requer_atividade_id
  from cadeia c
  join atividade_dependencia ad on ad.atividade_id = c.requer_atividade_id
)
select t.identificador                as torre,
       tr.nome                        as trecho,
       depois.nome                    as programada_depois,
       to_char(p_depois.data, 'DD/MM/YYYY') as data_depois,
       antes.nome                     as mas_depende_de,
       to_char(p_antes.data, 'DD/MM/YYYY')  as ja_programada_em
from cadeia c
join programacao p_antes  on p_antes.atividade_id  = c.requer_atividade_id
join programacao p_depois on p_depois.atividade_id = c.atividade_id
                         and p_depois.torre_id     = p_antes.torre_id
join atividade antes  on antes.id  = c.requer_atividade_id
join atividade depois on depois.id = c.atividade_id
join torre t   on t.id  = p_antes.torre_id
join trecho tr on tr.id = t.trecho_id
where p_depois.data < p_antes.data
  and p_antes.situacao  = 'APROVADA'
  and p_depois.situacao = 'APROVADA'
order by tr.nome, t.ordem, p_antes.data;

-- ###########################################################################
-- 32-controle-de-migracoes.sql
-- ###########################################################################

-- =============================================================================
-- Saber o que já foi aplicado neste banco — 29/09/2026
-- =============================================================================
-- Até aqui, a única coisa que dizia quais migrações estavam aplicadas era a
-- minha memória. Funcionou enquanto eu era o único a colar no SQL Editor, mas é
-- frágil pelo motivo errado: quando falha, falha calado.
--
-- Já quase aconteceu. A db/24 precisou de um "raise exception" conferindo à mão
-- se a db/23 tinha rodado, porque não havia como o banco responder isso. Rodar
-- a 31 sem a 30 deixaria a regra do mesmo dia valendo pela metade, e o sistema
-- se comportaria de um jeito que ninguém consegue explicar olhando o código.
--
-- Esta tabela é só um registro: nenhuma migração deixa de funcionar por causa
-- dela, e ela não impede nada. Serve para eu perguntar ao banco, e não à minha
-- lembrança, o que falta.
--
-- Roda por último na leva de hoje: ela registra de uma vez tudo o que já está
-- aplicado, da 01 até a 31.
--
-- Idempotente.
-- =============================================================================

create table if not exists migracao (
  numero      int primary key,
  arquivo     text        not null,
  aplicada_em timestamptz not null default now(),
  aplicada_por text       not null default current_user
);

comment on table migracao is
  'Uma linha por arquivo de db/ aplicado neste banco. Preenchida pela própria migração, no fim dela.';

-- Leitura para quem está logado; escrever é só pelo SQL Editor, que roda como
-- dono do banco e passa por cima da RLS. Ninguém marca migração pela aplicação.
alter table migracao enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'migracao' and policyname = 'migracao_leitura'
  ) then
    create policy migracao_leitura on migracao for select to authenticated using (true);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- O que já está aplicado neste banco, até hoje
-- -----------------------------------------------------------------------------
-- Registro retroativo. Vale porque eu apliquei todas, uma a uma, no SQL Editor.
-- O "do nothing" deixa rodar de novo sem estragar nada.
-- -----------------------------------------------------------------------------

insert into migracao (numero, arquivo) values
  ( 1, '01-schema.sql'),
  ( 2, '02-seed.sql'),
  ( 3, '03-primeiro-acesso.sql'),
  ( 4, '04-ajuste-cadeia.sql'),
  ( 5, '05-cadeia-alessandro.sql'),
  ( 6, '06-correcoes.sql'),
  ( 7, '07-trechos.sql'),
  ( 8, '08-canteiro.sql'),
  ( 9, '09-canteiros-trechos.sql'),
  (10, '10-precisao-km.sql'),
  (11, '11-limpa-canteiros.sql'),
  (12, '12-canteiro-duplicado.sql'),
  (13, '13-carga-inicial.sql'),
  (14, '14-tipo-torre.sql'),
  (15, '15-usuarios-equipe.sql'),
  (16, '16-bloqueio-transitivo.sql'),
  (17, '17-historico.sql'),
  (18, '18-limpar-programacoes.sql'),
  (19, '19-historico-estagio.sql'),
  (20, '20-apontamento.sql'),
  (21, '21-cadeia-isa.sql'),
  (22, '22-lancamento-depende-do-prumo.sql'),
  (23, '23-piloto-e-pilotinho.sql'),
  (24, '24-bandolas-em-duas-etapas.sql'),
  (25, '25-retroativo-atividades-novas.sql'),
  (26, '26-conferir-historico.sql'),
  (27, '27-escavacao-em-tres.sql'),
  (28, '28-percentual-na-programacao.sql'),
  (29, '29-varios-encarregados-no-mesmo-servico.sql'),
  (30, '30-mesmo-dia-libera.sql'),
  (31, '31-sequencia-invertida.sql'),
  (32, '32-controle-de-migracoes.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Daqui para a frente
-- =============================================================================
-- Toda migração nova termina com o próprio registro, e eu ponho essa linha em
-- todas que escrever:
--
--   insert into migracao (numero, arquivo)
--   values (33, '33-nome-do-arquivo.sql')
--   on conflict (numero) do nothing;
--
-- Para saber o que falta, roda isto e compara com os arquivos de db/:
--
--   select numero, arquivo, to_char(aplicada_em, 'DD/MM/YYYY HH24:MI') as quando
--   from migracao order by numero;
--
-- E para achar buraco no meio, sem ter que conferir de olho:
--
--   select g as faltando
--   from generate_series(1, (select max(numero) from migracao)) g
--   where not exists (select 1 from migracao m where m.numero = g);
-- =============================================================================

select numero, arquivo, to_char(aplicada_em, 'DD/MM/YYYY HH24:MI') as quando
from migracao
order by numero;
