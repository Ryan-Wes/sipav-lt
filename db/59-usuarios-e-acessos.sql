-- =============================================================================
-- Usuários e acessos pela tela — 20/10/2026
-- =============================================================================
-- Hoje, para dar acesso a alguém, eu crio o login no Authentication e rodo um SQL que escreve o
-- perfil. Estas duas funções tiram o SQL do caminho: a tela de Cadastros > Usuários e acessos lista
-- quem tem login (com ou sem perfil) e deixa escolher o papel, o nome e se está ativo.
--
--   usuarios_do_sistema()                      quem tem login, o e-mail, o papel e o último acesso
--   definir_acesso(p_id, p_nome, p_papel, p_ativo)   cria o perfil ou muda o que já existe
--
-- O que o banco confere (não só a tela): quem chama é administrador ativo, o nome não vem vazio, e
-- o administrador não rebaixa nem desativa o próprio acesso (senão a obra podia ficar sem ninguém
-- que consiga entrar aqui). O login em si (e-mail e senha) continua sendo criado no Authentication.
--
-- Idempotente. Não depende de outra migração.
-- =============================================================================

create or replace function usuarios_do_sistema()
returns table (
  id            uuid,
  email         text,
  nome          text,
  papel         papel_usuario,
  ativo         boolean,
  tem_perfil    boolean,
  ultimo_acesso timestamptz,
  criado_em     timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if papel_atual() is distinct from 'ADMIN' then
    raise exception 'Só a administração vê os usuários.';
  end if;

  return query
    select u.id,
           u.email::text,
           p.nome,
           p.papel,
           coalesce(p.ativo, false),
           (p.id is not null),
           u.last_sign_in_at,
           u.created_at
    from auth.users u
    left join perfil p on p.id = u.id
    order by (p.id is null) desc, lower(coalesce(p.nome, u.email::text));
end;
$$;

create or replace function definir_acesso(
  p_id    uuid,
  p_nome  text,
  p_papel papel_usuario,
  p_ativo boolean default true
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
begin
  if papel_atual() is distinct from 'ADMIN' then
    raise exception 'Só a administração define acessos.';
  end if;

  if v_nome = '' then
    raise exception 'O nome não pode ficar vazio.';
  end if;

  if not exists (select 1 from auth.users where id = p_id) then
    raise exception 'Esse login não existe. Crie primeiro em Authentication.';
  end if;

  if p_id = auth.uid() and (p_papel is distinct from 'ADMIN' or not coalesce(p_ativo, true)) then
    raise exception 'Você não pode tirar a administração nem desativar o seu próprio acesso.';
  end if;

  insert into perfil (id, nome, papel, obra_id, ativo)
  values (p_id, v_nome, p_papel, (select id from obra where codigo = 'SD'), coalesce(p_ativo, true))
  on conflict (id) do update
    set nome  = excluded.nome,
        papel = excluded.papel,
        ativo = excluded.ativo;
end;
$$;

revoke all on function usuarios_do_sistema() from public;
revoke all on function definir_acesso(uuid, text, papel_usuario, boolean) from public;
grant execute on function usuarios_do_sistema() to authenticated;
grant execute on function definir_acesso(uuid, text, papel_usuario, boolean) to authenticated;

insert into migracao (numero, arquivo)
values (59, '59-usuarios-e-acessos.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência: as duas funções
-- =============================================================================
select 'funcao' as tipo, proname as nome
from pg_proc
where proname in ('usuarios_do_sistema', 'definir_acesso')
order by proname;
