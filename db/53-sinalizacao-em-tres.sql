-- =============================================================================
-- Sinalização em três atividades — 14/10/2026
-- =============================================================================
-- A planilha da ISA tem três itens, e o SIPAV tinha uma atividade só para os três:
--
--   4.4.1  INSTALAÇÃO DE SINALIZADORES DE ESTAIS
--   4.4.2  INSTALAÇÃO DE DISPOSITIVO AVIFAUNA
--   4.4.3  INSTALAÇÃO DE PLACAS DE SINALIZAÇÃO
--
-- Cada uma é um serviço, e a planilha preenche só o que foi feito. A "INSTALAÇÃO DE
-- SINALIZAÇÃO" que existe passa a ser a dos sinalizadores de estais (mantém a ordem, a cor,
-- o ícone, as dependências e as programações que já tem); as outras duas nascem copiando
-- tudo dela, inclusive o que ela exige antes.
--
-- Atenção: o que já estava programado em "INSTALAÇÃO DE SINALIZAÇÃO" fica como estais. Se
-- eram de avifauna ou de placas, é só refazer essas programações.
--
-- Idempotente.
-- =============================================================================

do $$
declare
  v_obra  uuid := (select id from obra where codigo = 'SD');
  v_velha uuid;
  v_base  atividade%rowtype;
  v       record;
  v_ordem integer;
  v_novo  uuid;
begin
  -- 1. A que existe vira a dos estais
  select id into v_velha from atividade
  where obra_id = v_obra and nome = 'INSTALAÇÃO DE SINALIZAÇÃO';

  if v_velha is not null
     and not exists (select 1 from atividade where obra_id = v_obra and nome = 'INSTALAÇÃO DE SINALIZADORES DE ESTAIS') then
    update atividade set nome = 'INSTALAÇÃO DE SINALIZADORES DE ESTAIS' where id = v_velha;
  end if;

  select * into v_base from atividade
  where obra_id = v_obra and nome = 'INSTALAÇÃO DE SINALIZADORES DE ESTAIS';

  -- 2. As outras duas nascem a partir dela
  for v in
    select * from (values
      ('INSTALAÇÃO DE DISPOSITIVO AVIFAUNA',    1, '#607d8b'),
      ('INSTALAÇÃO DE PLACAS DE SINALIZAÇÃO',   2, '#78909c')
    ) as x(nome, passo, cor)
  loop
    continue when exists (select 1 from atividade where obra_id = v_obra and nome = v.nome);

    v_ordem := coalesce(v_base.ordem_execucao, 220) + v.passo;
    if exists (select 1 from atividade where obra_id = v_obra and ordem_execucao = v_ordem) then
      select max(ordem_execucao) + 1 into v_ordem from atividade where obra_id = v_obra;
    end if;

    insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria, so_para_estrutura)
    values (v_obra, v.nome, v_ordem, v.cor, coalesce(v_base.cor_texto, '#ffffff'),
            coalesce(v_base.icone, 'triangle-alert'), coalesce(v_base.obrigatoria, false), v_base.so_para_estrutura)
    returning id into v_novo;

    -- o que a base exigia antes, as novas também exigem
    if v_base.id is not null then
      insert into atividade_dependencia (atividade_id, requer_atividade_id)
      select v_novo, requer_atividade_id from atividade_dependencia where atividade_id = v_base.id
      on conflict do nothing;
    end if;
  end loop;
end $$;

insert into migracao (numero, arquivo)
values (53, '53-sinalizacao-em-tres.sql')
on conflict (numero) do nothing;

-- Conferência: tem que sair as três, com a mesma cor de família, e a depender da grampeação.
select a.ordem_execucao, a.nome, a.obrigatoria,
       coalesce(string_agg(d.nome, ' + '), '— livre —') as depende_de
from atividade a
left join atividade_dependencia ad on ad.atividade_id = a.id
left join atividade d on d.id = ad.requer_atividade_id
where a.obra_id = (select id from obra where codigo = 'SD')
  and a.nome in ('INSTALAÇÃO DE SINALIZADORES DE ESTAIS', 'INSTALAÇÃO DE DISPOSITIVO AVIFAUNA',
                 'INSTALAÇÃO DE PLACAS DE SINALIZAÇÃO')
group by a.id, a.ordem_execucao, a.nome, a.obrigatoria
order by a.ordem_execucao;