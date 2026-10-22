-- =============================================================================
-- Modelo da planilha da ISA, guardado no SIPAV — 22/10/2026
-- =============================================================================
-- Até aqui, todo relatório da ISA pedia a planilha do trecho de novo. Agora o trecho guarda a planilha em
-- branco (o modelo): na hora de exportar o SIPAV usa o modelo, acerta a data do cabeçalho e preenche a
-- programação e o executado da semana, e devolve um arquivo novo. O modelo nunca é alterado pela exportação.
--
-- O arquivo vai em base64, como texto: as planilhas têm de 200 a 450 KB, e assim não precisa de bucket
-- nem de política de storage. Um modelo por trecho; guardar outro substitui o anterior.
--
-- Quem lê: todo mundo logado (a exportação é aberta). Quem grava: administração e planejamento.
--
-- Idempotente.
-- =============================================================================

create table if not exists modelo_isa (
  trecho_id      uuid primary key references trecho(id) on delete cascade,
  nome           text not null,
  conteudo       text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references perfil(id)
);

alter table modelo_isa enable row level security;

drop policy if exists modelo_isa_leitura on modelo_isa;
create policy modelo_isa_leitura on modelo_isa for select to authenticated
  using (papel_atual() is not null);

drop policy if exists modelo_isa_escrita on modelo_isa;
create policy modelo_isa_escrita on modelo_isa for all to authenticated
  using (papel_atual() in ('ADMIN', 'PLANEJAMENTO'))
  with check (papel_atual() in ('ADMIN', 'PLANEJAMENTO'));

insert into migracao (numero, arquivo)
values (62, '62-modelo-da-planilha-isa.sql')
on conflict (numero) do nothing;

-- Conferência: a tabela existe e as duas políticas também
select 'tabela' as tipo, tablename as nome from pg_tables where tablename = 'modelo_isa'
union all
select 'politica', policyname from pg_policies where tablename = 'modelo_isa';