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

-- Os três de uma vez. Os usuários já precisam existir no Authentication.
insert into perfil (id, nome, papel, obra_id, ativo)
select u.id, v.nome, v.papel::papel_usuario,
       (select id from obra where codigo = 'SD'), true
from (values
  ('alessandro.macedo@elecnor.com', 'Alessandro Cordova',  'PLANEJAMENTO'),
  ('hanna.chocron@elecnor.com',     'Hanna Hamoy Chocron', 'PLANEJAMENTO'),
  ('rominick.veiga@elecnor.es',     'Rominick Gustavo',    'PLANEJAMENTO')
) as v(email, nome, papel)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (id) do update
  set nome = excluded.nome, papel = excluded.papel,
      obra_id = excluded.obra_id, ativo = true;

-- Avisa se algum e-mail não bateu com o que foi cadastrado no Authentication
select v.email as nao_encontrado
from (values
  ('alessandro.macedo@elecnor.com'),
  ('hanna.chocron@elecnor.com'),
  ('rominick.veiga@elecnor.es')
) as v(email)
where not exists (
  select 1 from auth.users u where lower(u.email) = lower(v.email)
);


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
