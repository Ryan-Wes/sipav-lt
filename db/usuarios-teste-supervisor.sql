-- =============================================================================
-- Usuários de teste do supervisor — 14/10/2026
-- =============================================================================
-- Para testar o fluxo de pré-programação sem mexer nos acessos de verdade.
--
-- 1. No Supabase: Authentication → Users → Add user → Create new user, uma vez para cada:
--      testesupcryan@sipav.test         (defina a senha; marque "Auto Confirm User")
--      testesupalessandro@sipav.test    (idem)
-- 2. Rode este arquivo. Ele cria o perfil de SUPERVISOR dos dois.
--
-- Sem perfil o SIPAV recusa a entrada, então só criar o usuário no Authentication não basta.
-- Para tirar o acesso depois: update perfil set ativo = false where nome like 'testesup%';
-- =============================================================================

insert into perfil (id, nome, papel, obra_id, ativo)
select u.id, v.nome, 'SUPERVISOR'::papel_usuario, (select id from obra where codigo = 'SD'), true
from (values
  ('testesupcryan@sipav.test',      'testesupcryan'),
  ('testesupalessandro@sipav.test', 'testesupalessandro')
) as v(email, nome)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (id) do update
  set nome = excluded.nome, papel = excluded.papel,
      obra_id = excluded.obra_id, ativo = true;

-- Avisa se algum e-mail não bateu com o que foi cadastrado no Authentication
select v.email as nao_encontrado
from (values ('testesupcryan@sipav.test'), ('testesupalessandro@sipav.test')) as v(email)
where not exists (select 1 from auth.users u where lower(u.email) = lower(v.email));

-- Conferência: os dois como SUPERVISOR, ativos
select p.nome, p.papel, u.email, case when p.ativo then 'ativo' else 'desativado' end as situacao
from perfil p join auth.users u on u.id = p.id
where p.nome like 'testesup%'
order by p.nome;