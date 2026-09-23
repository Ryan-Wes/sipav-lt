-- =============================================================================
-- Liberar acesso para a equipe
-- =============================================================================
-- Criar o usuário no Authentication → Users NÃO basta: sem perfil, o SIPAV
-- recusa a entrada. É de propósito — impede que alguém que se cadastre sozinho
-- caia dentro da programação da obra.
--
-- Para cada pessoa:
--   1. Authentication → Users → Add user → Create new user
--      (marcar "Auto Confirm User")
--   2. Rodar o bloco correspondente aqui, trocando e-mail e nome
--
-- PAPÉIS
--   ADMIN        configura tudo, gerencia usuários
--   PLANEJAMENTO programa, aprova solicitações, importa torres
--   SUPERVISOR   faz pré-programação (nasce SOLICITADA, aguarda aceite)
--                e aponta execução — é o papel do pessoal de campo
--   LEITURA      só visualiza — fiscalização, diretoria
-- =============================================================================

-- ---------------------------------------------------------------- Alessandro --
insert into perfil (id, nome, papel, obra_id, ativo)
select u.id, 'Alessandro Cordova', 'PLANEJAMENTO'::papel_usuario,
       (select id from obra where codigo = 'SD'), true
from auth.users u
where u.email = 'TROCAR@exemplo.com'
on conflict (id) do update
  set nome = excluded.nome, papel = excluded.papel,
      obra_id = excluded.obra_id, ativo = true;

-- --------------------------------------------------------------------- Hanna --
insert into perfil (id, nome, papel, obra_id, ativo)
select u.id, 'Hanna Hamoy Chocron', 'PLANEJAMENTO'::papel_usuario,
       (select id from obra where codigo = 'SD'), true
from auth.users u
where u.email = 'TROCAR@exemplo.com'
on conflict (id) do update
  set nome = excluded.nome, papel = excluded.papel,
      obra_id = excluded.obra_id, ativo = true;

-- ------------------------------------------------------------------ Rominick --
insert into perfil (id, nome, papel, obra_id, ativo)
select u.id, 'Rominick Gustavo', 'PLANEJAMENTO'::papel_usuario,
       (select id from obra where codigo = 'SD'), true
from auth.users u
where u.email = 'TROCAR@exemplo.com'
on conflict (id) do update
  set nome = excluded.nome, papel = excluded.papel,
      obra_id = excluded.obra_id, ativo = true;


-- =============================================================================
-- Conferência: quem tem acesso e com que papel
-- =============================================================================
select p.nome, p.papel, u.email,
       case when p.ativo then 'ativo' else 'desativado' end as situacao
from perfil p
join auth.users u on u.id = p.id
order by p.papel, p.nome;


-- =============================================================================
-- Tirar o acesso de alguém (sem apagar histórico)
-- =============================================================================
-- update perfil set ativo = false
-- where id = (select id from auth.users where email = 'fulano@exemplo.com');
