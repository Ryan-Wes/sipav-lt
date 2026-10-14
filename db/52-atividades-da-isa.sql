-- =============================================================================
-- Empacadura, praça de lançamento, OPGW (amortecimento, descida, caixa de emenda) e
-- comissionamento viram atividades — 14/10/2026
-- =============================================================================
-- A planilha da ISA tem programação nesses itens e o SIPAV não tinha onde gravar:
--
--   4.0.1  INSTALAÇÃO DE EMPACADURA                      [TORRE]
--   4.0.2  RETIRADA DE EMPACADURA                        [TORRE]
--   4.0.3  PRAÇA PARA LANÇAMENTO                         [TORRE]
--   4.2.7  SISTEMA DE AMORTECIMENTO OPGW                 [KM]    só OPGW
--   4.2.8  DESCIDA DO CABO OPGW                          [TORRE] só OPGW
--   4.2.9  INSTALAÇÃO DE CAIXA DE EMENDA OPGW            [TORRE] só OPGW
--   5.1.1  PRÉ COMISSIONAMENTO DE CABOS / ESTRUTURA      [TORRE]
--   5.1.2  COMISSIONAMENTO DE CABOS / ESTRUTURA          [TORRE]
--   5.1.3  REVISÃO DE SOLO                               [TORRE]
--   5.1.4  PRAD                                          [TORRE]
--
-- Todas condicionais e sem dependência: a cadeia delas eu confirmo com o campo antes
-- de travar qualquer coisa. As três do OPGW pedem o cabo, como o resto da seção 4.2.
--
-- A ordem é única por obra. Se a que eu quero já estiver ocupada, a atividade vai para
-- o fim da lista: é só exibição, a regra de bloqueio mora nas dependências.
--
-- Idempotente.
-- =============================================================================

do $$
declare
  v_obra  uuid := (select id from obra where codigo = 'SD');
  v       record;
  v_ordem integer;
begin
  for v in
    select * from (values
      ('PRAÇA PARA LANÇAMENTO',                      126, '#a1887f', 'map-pin'),
      ('INSTALAÇÃO DE EMPACADURA',                   128, '#8d6e63', 'package'),
      ('RETIRADA DE EMPACADURA',                     249, '#8d6e63', 'package-open'),
      ('SISTEMA DE AMORTECIMENTO OPGW',              250, '#4db6ac', 'waves'),
      ('DESCIDA DO CABO OPGW',                       251, '#4db6ac', 'arrow-down-to-line'),
      ('INSTALAÇÃO DE CAIXA DE EMENDA OPGW',         252, '#4db6ac', 'box'),
      ('PRÉ COMISSIONAMENTO DE CABOS / ESTRUTURA',   300, '#9575cd', 'clipboard-check'),
      ('COMISSIONAMENTO DE CABOS / ESTRUTURA',       310, '#7e57c2', 'badge-check'),
      ('REVISÃO DE SOLO',                            320, '#9575cd', 'search'),
      ('PRAD',                                       330, '#81c784', 'sprout')
    ) as x(nome, ordem, cor, icone)
  loop
    continue when exists (select 1 from atividade where obra_id = v_obra and nome = v.nome);

    v_ordem := v.ordem;
    if exists (select 1 from atividade where obra_id = v_obra and ordem_execucao = v_ordem) then
      select max(ordem_execucao) + 1 into v_ordem from atividade where obra_id = v_obra;
    end if;

    insert into atividade (obra_id, nome, ordem_execucao, cor_fundo, cor_texto, icone, obrigatoria)
    values (v_obra, v.nome, v_ordem, v.cor, '#ffffff', v.icone, false);
  end loop;
end $$;

insert into migracao (numero, arquivo)
values (52, '52-atividades-da-isa.sql')
on conflict (numero) do nothing;

-- Conferência: tem que sair as dez, todas condicionais.
select ordem_execucao, nome, obrigatoria
from atividade
where obra_id = (select id from obra where codigo = 'SD')
  and nome in ('PRAÇA PARA LANÇAMENTO', 'INSTALAÇÃO DE EMPACADURA', 'RETIRADA DE EMPACADURA',
               'SISTEMA DE AMORTECIMENTO OPGW', 'DESCIDA DO CABO OPGW',
               'INSTALAÇÃO DE CAIXA DE EMENDA OPGW', 'PRÉ COMISSIONAMENTO DE CABOS / ESTRUTURA',
               'COMISSIONAMENTO DE CABOS / ESTRUTURA', 'REVISÃO DE SOLO', 'PRAD')
order by ordem_execucao;