-- =============================================================================
-- Partes da escavação: quais pés (ou estais) foram programados — 01/10/2026
-- =============================================================================
-- A escavação é feita por parte, e nem sempre na ordem: pode sair o pé A e o C
-- antes do B. O percentual sozinho ("50%") não diz quais são, e sem isso nada
-- impede programar o pé A duas vezes e esquecer o D.
--
-- Esta coluna guarda as partes marcadas, separadas por vírgula, na ordem em que
-- aparecem na tela:
--
--   autoportante      A, B, C, D           (os quatro pés)
--   estaiada, estais  A, B, C, D           (os quatro estais)
--   estaiada, inteira A, B, C, D e MC      (quatro estais e o mastro central)
--
-- Exemplos: 'A,C'   'A,B,C,D'   'B,D,MC'
--
-- O percentual continua sendo o que vale para a meta e para o estágio da torre.
-- A tela calcula o percentual a partir das partes marcadas; a coluna só registra
-- quais foram. Programação antiga, e programação de outra atividade, fica nula.
--
-- Não entra no histórico de alterações: o percentual, que muda junto, já entra.
--
-- Idempotente.
-- =============================================================================

alter table programacao add column if not exists partes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programacao_partes_ok') then
    alter table programacao
      add constraint programacao_partes_ok
      check (partes is null or partes ~ '^(A|B|C|D|MC)(,(A|B|C|D|MC))*$');
  end if;
end $$;

comment on column programacao.partes is
  'Partes da escavação programadas (pés ou estais A,B,C,D e MC), separadas por vírgula. Nulo quando a atividade não é dividida por parte.';

insert into migracao (numero, arquivo)
values (40, '40-partes-da-escavacao.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que sair vazio na primeira vez. Programe uma escavação marcando os pés
-- pela tela e rode de novo: a coluna "partes" tem que mostrar as letras.
-- =============================================================================

select t.identificador as torre,
       a.nome          as atividade,
       to_char(p.data, 'DD/MM/YYYY') as data,
       p.percentual,
       p.partes
from programacao p
join torre t     on t.id = p.torre_id
join atividade a on a.id = p.atividade_id
where p.partes is not null
order by p.data desc
limit 20;
