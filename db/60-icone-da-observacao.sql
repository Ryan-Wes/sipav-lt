-- =============================================================================
-- Ícone da observação da torre — 20/10/2026
-- =============================================================================
-- Até aqui o cartão só distinguia a montanha (texto com a palavra "serra") do bloco de notas. Tem torre
-- queimada, torre de travessia, torre no alagado... Ao anotar, agora se escolhe o ícone, e ele fica
-- guardado na torre, ao lado do texto.
--
-- É só o nome do ícone (mountain, flame, waves, route…); a lista de opções mora na tela. Vazio quer dizer
-- "sem escolha": vale a regra antiga, montanha se o texto tiver "serra", bloco de notas no resto. Assim
-- as observações que já existem continuam como estão.
--
-- A tela busca esta coluna à parte, junto com a observação, e sem a migração segue funcionando como antes
-- (só não deixa escolher o ícone). Não mexe na view torre_situacao.
--
-- Idempotente.
-- =============================================================================
alter table torre add column if not exists observacao_icone text;
comment on column torre.observacao_icone is
  'Nome do ícone da observação da torre (ex.: mountain, flame, waves). Vazio = regra antiga pelo texto.';

insert into migracao (numero, arquivo)
values (60, '60-icone-da-observacao.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência: a coluna existe
-- =============================================================================
select column_name
from information_schema.columns
where table_name = 'torre' and column_name = 'observacao_icone';