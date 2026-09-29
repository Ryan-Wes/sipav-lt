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
