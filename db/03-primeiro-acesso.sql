-- =============================================================================
-- Primeiro acesso
-- =============================================================================
-- Rode DEPOIS de 01-schema.sql e 02-seed.sql.
--
-- Antes disso, crie o usuário no painel do Supabase:
--   Authentication → Users → Add user
--   ( marque "Auto Confirm User" para não precisar confirmar e-mail )
--
-- O usuário nasce no Auth sem perfil na aplicação, e sem perfil o login é
-- recusado de propósito — assim ninguém que se cadastre sozinho entra na
-- programação da obra. Este script dá o perfil de administrador.
-- =============================================================================

-- TROQUE o e-mail abaixo pelo que você cadastrou no Auth.
-- (O SQL Editor do Supabase não é o psql, então nada de \set aqui.)

insert into perfil (id, nome, papel, obra_id, ativo)
select
  u.id,
  'Wesley Ryan',                                   -- nome exibido no cabeçalho
  'ADMIN'::papel_usuario,
  (select id from obra where codigo = 'SD'),
  true
from auth.users u
where u.email = 'wesley.ryan03@gmail.com'          -- <<< TROQUE AQUI
on conflict (id) do update
  set papel = excluded.papel,
      obra_id = excluded.obra_id,
      ativo = true;

-- Confere se deu certo (tem que voltar 1 linha):
select p.nome, p.papel, o.nome as obra, u.email
from perfil p
join auth.users u on u.id = p.id
left join obra o on o.id = p.obra_id;


-- =============================================================================
-- Liberando o resto do time depois
-- =============================================================================
-- Para cada pessoa: cria no Authentication → Users e roda o insert abaixo,
-- trocando e-mail, nome e papel.
--
-- Papéis:
--   ADMIN        — configura tudo
--   PLANEJAMENTO — programa, aprova solicitações, importa torres
--   SUPERVISOR   — faz pré-programação (nasce como SOLICITADA) e aponta execução
--   LEITURA      — só visualiza (fiscalização, diretoria)
--
-- insert into perfil (id, nome, papel, obra_id, ativo)
-- select u.id, 'Alessandro Cordova', 'PLANEJAMENTO'::papel_usuario,
--        (select id from obra where codigo = 'SD'), true
-- from auth.users u where u.email = 'alessandro@exemplo.com'
-- on conflict (id) do update set papel = excluded.papel, ativo = true;
