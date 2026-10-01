-- =============================================================================
-- OPGW direito e esquerdo — 01/10/2026
-- =============================================================================
-- As quatro planilhas oficiais do RPSQ (28/09) mostram que os trechos não têm a
-- mesma configuração de cabo-guarda:
--
--   Barra – Correntina        para-raio convencional (4.1) + OPGW (4.2)
--   Campo Formoso – Barra     para-raio convencional (4.1) + OPGW (4.2)
--   Buritirama – Barra        OPGW DIREITO (4.1) + OPGW ESQUERDO (4.2)
--   Juazeiro – Campo Formoso  OPGW DIREITO (4.1) + OPGW ESQUERDO (4.2)
--
-- Nos dois últimos não há para-raio: são dois OPGW, um de cada lado. O campo
-- `cabo` só tinha OPGW e PARA_RAIO, e nesses trechos "OPGW" não diz de qual lado.
--
-- Esta migração faz duas coisas:
--
--   1. Acrescenta OPGW_DIREITO e OPGW_ESQUERDO ao tipo `cabo_guarda`.
--   2. Guarda no trecho qual é a configuração (`cabo_modelo`), para a tela
--      oferecer só as opções que valem para ele. Quem programa Buritirama não vê
--      "para-raio", e quem programa Barra – Correntina não vê "direito".
--
--      PARA_RAIO_E_OPGW   para-raio convencional e OPGW (o padrão)
--      OPGW_DOIS_LADOS    OPGW direito e OPGW esquerdo
--
-- O que já foi programado com "OPGW" nos trechos de dois lados NÃO é convertido:
-- ninguém sabe de que lado era. A conferência no fim lista essas programações
-- para serem corrigidas na tela. Enquanto isso o relatório da ISA as aponta no
-- relato em vez de escrevê-las no lado errado.
--
-- Idempotente.
-- =============================================================================

alter type cabo_guarda add value if not exists 'OPGW_DIREITO';
alter type cabo_guarda add value if not exists 'OPGW_ESQUERDO';

alter table trecho add column if not exists cabo_modelo text not null default 'PARA_RAIO_E_OPGW';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trecho_cabo_modelo_ok') then
    alter table trecho
      add constraint trecho_cabo_modelo_ok
      check (cabo_modelo in ('PARA_RAIO_E_OPGW', 'OPGW_DOIS_LADOS'));
  end if;
end $$;

comment on column trecho.cabo_modelo is
  'Configuração do cabo-guarda: PARA_RAIO_E_OPGW (convencional + OPGW) ou OPGW_DOIS_LADOS (direito + esquerdo).';

update trecho
   set cabo_modelo = 'OPGW_DOIS_LADOS'
 where nome in ('Buritirama - Barra', 'Juazeiro - Campo Formoso');

insert into migracao (numero, arquivo)
values (41, '41-opgw-direito-esquerdo.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- 1) A configuração de cada trecho. Tem que ser dois lados em Buritirama – Barra
--    e em Juazeiro – Campo Formoso, e para-raio + OPGW nos outros dois.
-- =============================================================================

select nome, cabo_modelo from trecho order by ordem;

-- =============================================================================
-- 2) Programações antigas nos trechos de dois lados que ficaram com "OPGW" ou
--    "para-raio" e precisam de um lado. Rode DEPOIS da migração, em outra
--    execução: a tela as mostra sem lado e pede para escolher ao editar.
-- =============================================================================
--
-- select tr.nome as trecho, t.identificador as torre, a.nome as atividade,
--        to_char(p.data, 'DD/MM/YYYY') as data, p.cabo
-- from programacao p
-- join torre t     on t.id = p.torre_id
-- join trecho tr   on tr.id = t.trecho_id
-- join atividade a on a.id = p.atividade_id
-- where tr.cabo_modelo = 'OPGW_DOIS_LADOS'
--   and p.cabo in ('OPGW', 'PARA_RAIO')
-- order by p.data;
