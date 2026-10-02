-- =============================================================================
-- Planejamento semanal salvo — 02/10/2026
-- =============================================================================
-- Toda sexta a obra planeja o semanal (a semana que começa) e o quinzenal (a
-- seguinte). A programação viva muda ao longo dos dias — data adiada, torre
-- trocada, atividade apagada —, e o que foi planejado numa sexta se perde.
--
-- Esta tabela guarda a FOTO do planejamento: quando se termina de planejar, salva-se
-- o status de cada torre e as programações daquele momento, só para consulta.
-- Revisitar "o que lancei como semanal e quinzenal no dia 25/07" é abrir a foto
-- daquela semana. A programação viva continua editável e não conflita com as fotos,
-- porque as fotos não são programações: são uma cópia congelada.
--
--   semana_base   a segunda-feira do semanal. O quinzenal é a seguinte.
--   dados         a foto (torres com estágio, programações, apontamentos e
--                 movimentações das duas semanas), em JSON, como a tela as lê
--   n_torres, n_programacoes   para listar sem carregar a foto inteira
--
-- Pode haver mais de uma foto da mesma semana (versões): cada uma tem a hora em que
-- foi salva.
--
-- Lê quem está logado e ativo; salva e apaga só administração e planejamento.
--
-- Idempotente.
-- =============================================================================

create table if not exists planejamento_semanal (
  id               uuid primary key default gen_random_uuid(),
  obra_id          uuid not null references obra(id) on delete cascade,
  trecho_id        uuid not null references trecho(id) on delete cascade,

  semana_base      date not null,
  titulo           text,

  n_torres         integer not null default 0,
  n_programacoes   integer not null default 0,
  dados            jsonb not null,

  criado_por       uuid references perfil(id),
  criado_em        timestamptz not null default now(),

  -- A semana base é sempre segunda-feira (extract dow: 1)
  constraint planejamento_semanal_segunda check (extract(dow from semana_base) = 1)
);

comment on table planejamento_semanal is
  'Foto do planejamento semanal (semanal + quinzenal) salva pelo planejamento: estágio das torres e programações naquele momento. Só consulta.';

create index if not exists planejamento_semanal_trecho_idx
  on planejamento_semanal (trecho_id, semana_base desc, criado_em desc);

alter table planejamento_semanal enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'planejamento_semanal' and policyname = 'planejamento_semanal_leitura') then
    create policy planejamento_semanal_leitura on planejamento_semanal
      for select to authenticated
      using (papel_atual() is not null);
  end if;

  if not exists (select 1 from pg_policies
                 where tablename = 'planejamento_semanal' and policyname = 'planejamento_semanal_escrita') then
    create policy planejamento_semanal_escrita on planejamento_semanal
      for all to authenticated
      using      (papel_atual() in ('ADMIN', 'PLANEJAMENTO'))
      with check (papel_atual() in ('ADMIN', 'PLANEJAMENTO'));
  end if;
end $$;

insert into migracao (numero, arquivo)
values (46, '46-planejamento-semanal.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que sair vazio na primeira vez. Salve um planejamento pela tela e rode de
-- novo: ele tem que aparecer, com o trecho e quantas torres e programações guardou.
-- =============================================================================

select tr.nome as trecho,
       to_char(p.semana_base, 'DD/MM/YYYY') as semana_base,
       to_char(p.criado_em, 'DD/MM/YYYY HH24:MI') as salvo_em,
       p.n_torres,
       p.n_programacoes
from planejamento_semanal p
join trecho tr on tr.id = p.trecho_id
order by p.criado_em desc
limit 20;
