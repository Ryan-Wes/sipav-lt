-- =============================================================================
-- Dois encarregados na mesma atividade — 01/10/2026
-- =============================================================================
-- Tem atividade que dois encarregados fazem juntos. Até aqui o único jeito era
-- lançar duas programações, uma para cada um, e as duas valiam 100%: a soma da
-- torre dava 200%, o total do relatório da ISA dobrava e a meta contava duas
-- vezes um serviço só.
--
-- Agora a programação pode ter um SEGUNDO encarregado. É uma programação só, com
-- um percentual só, e os dois aparecem nela:
--
--   encarregado_id     o primeiro (o que já existia)
--   encarregado_2_id   o segundo, opcional
--
-- Regras, no banco para não depender da tela:
--   - não há segundo sem primeiro;
--   - os dois não podem ser a mesma pessoa.
--
-- Fica de fora do histórico de alterações, como as partes da escavação: o
-- histórico mostra o primeiro encarregado, e o segundo só aparece na programação.
--
-- Idempotente.
-- =============================================================================

alter table programacao
  add column if not exists encarregado_2_id uuid references encarregado(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'programacao_encarregado_2_ok') then
    alter table programacao
      add constraint programacao_encarregado_2_ok
      check (
        encarregado_2_id is null
        or (encarregado_id is not null and encarregado_2_id <> encarregado_id)
      );
  end if;
end $$;

comment on column programacao.encarregado_2_id is
  'Segundo encarregado, quando dois fazem a atividade juntos. Opcional; exige o primeiro e não pode ser a mesma pessoa.';

insert into migracao (numero, arquivo)
values (42, '42-segundo-encarregado.sql')
on conflict (numero) do nothing;

-- =============================================================================
-- Conferência
-- =============================================================================
-- Tem que sair vazio na primeira vez. Programe uma atividade com dois
-- encarregados pela tela e rode de novo: os dois nomes têm que aparecer.
-- =============================================================================

select t.identificador as torre,
       a.nome          as atividade,
       to_char(p.data, 'DD/MM/YYYY') as data,
       e1.nome         as encarregado,
       e2.nome         as segundo_encarregado
from programacao p
join torre t       on t.id = p.torre_id
join atividade a   on a.id = p.atividade_id
left join encarregado e1 on e1.id = p.encarregado_id
left join encarregado e2 on e2.id = p.encarregado_2_id
where p.encarregado_2_id is not null
order by p.data desc
limit 20;
