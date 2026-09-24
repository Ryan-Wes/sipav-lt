-- =============================================================================
-- Limpar programações de um trecho e período — 24/09/2026
-- =============================================================================
-- A Hanna descreveu na reunião o hábito de apagar tudo e refazer quando a
-- programação muda. O protótipo tinha um "Limpar Programações" que zerava
-- geral; aqui a limpeza é sempre limitada a UM TRECHO e a UM PERÍODO, para
-- ninguém apagar por engano o que outra pessoa está montando em outro trecho.
--
-- Precisa ser função no banco: apagar pelo navegador exigiria enviar a lista
-- de todas as torres do trecho na URL, o que estoura o limite de tamanho.
--
-- SECURITY INVOKER (o padrão): a RLS do usuário continua valendo, então
-- supervisor só consegue apagar o que ele mesmo criou e que ainda está como
-- SOLICITADA. E o trigger de histórico dispara linha a linha, registrando
-- cada remoção com autor e horário.
--
-- Idempotente.
-- =============================================================================

create or replace function limpar_programacoes(
  p_trecho_id uuid,
  p_de        date default null,
  p_ate       date default null
) returns integer
language plpgsql as $$
declare
  v_apagadas integer;
begin
  with alvo as (
    delete from programacao pr
    using torre t
    where t.id = pr.torre_id
      and t.trecho_id = p_trecho_id
      and (p_de  is null or pr.data >= p_de)
      and (p_ate is null or pr.data <= p_ate)
    returning pr.id
  )
  select count(*) into v_apagadas from alvo;

  return v_apagadas;
end;
$$;

comment on function limpar_programacoes is
  'Apaga as programações de um trecho dentro de um período. Respeita a RLS do '
  'usuário e deixa rastro no histórico. Retorna quantas linhas saíram.';
