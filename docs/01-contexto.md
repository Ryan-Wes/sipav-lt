# Contexto e domínio

## O que é

Sistema de planejamento/programação de avanço de obra de **linha de transmissão** (LT).
Obra de referência: **Serra Dourada** (Elecnor). Setor de Planejamento.

## Vocabulário da obra

| Termo | Significado |
|---|---|
| **Trecho** | Segmento da linha entre dois pontos. São quatro: Barra - Correntina, Buritirama - Barra, Campo Formoso - Barra, Juazeiro - Campo Formoso. Barra é entroncamento: a linha vem de Juazeiro → Campo Formoso → Barra, e de lá saem os ramais para Correntina e Buritirama |
| **Canteiro** | Base de apoio da obra. **Não é trecho** — um canteiro pode atender mais de um trecho. São 9: Barra, Buritirama, Central, Igarité, Itajubaquara, Juazeiro, Laje dos Negros, Umburanas, Wanderley. *Laje dos Negros* e *Barra* atuam em dois trechos cada |
| **Torre** | Identificada por `numero/sufixo` — ex.: `118/2`, `145/1`. Cada torre tem um **km** associado (extensão do vão, ex.: 0,520 km) |
| **Vão** | Distância entre torres — usada para totalizar km programado |
| **Encarregado** | Responsável pela execução de uma atividade em campo (Antônio dos Santos, Darlos, Diovane, Lucas Vragem, Wemerson, Antônio Mendes, Cláudio Santos, Romário...) |
| **Supervisor** | Quem define/valida a programação em campo (Borges, e outros) |
| **Restrição** | Impedimento que trava a torre: **ambiental** (supressão/licença) ou **fundiária** (acesso à propriedade) |
| **Fiscalização** | Cliente/órgão que recebe a programação num **layout de planilha padrão obrigatório** |
| **Quinzenal / semanal** | Ciclos de programação. Hoje o relatório sai da quinzena inteira sem quebra por semana |

## Cadeia de atividades (sequência de execução)

Ordem inferida do protótipo + transcrição. **PRECISA SER VALIDADA COM ALESSANDRO/HANNA/ROMINICK.**

```
1.  ABERTURA DE ACESSO
2.  SUPRESSÃO DE ÁREA DE TORRE
3.  ESCAVAÇÃO
4.  ANCORAGEM EM ROCHA          (condicional — só em torre com rocha)
5.  TESTE DE ARRANCAMENTO
6.  CONCRETAGEM / TUBULÃO       (citado pela Hanna, NÃO existe no protótipo)
7.  REATERRO 100%
8.  ATERRAMENTO / CONTRAPESO
9.  MEDIÇÃO DE RESISTÊNCIA
10. PRÉ-MONTAGEM
11. MONTAGEM
12. REVISÃO
13. LANÇAMENTO CONDUTOR 100%
14. LANÇAMENTO DO CABO OPGW/PR
```

Pontos em aberto na cadeia:
- Onde exatamente entram concretagem/fundação/tubulão?
- Quais atividades são **condicionais** (só em algumas torres) vs **obrigatórias em todas**?
- Quais podem rodar **em paralelo** e quais são estritamente sequenciais?
- "RECUPERAÇÃO DE ACESSO" (citada pela Hanna) — onde entra?

## As dores reais (da reunião de 22/09/2026)

1. **Programação manual e repetitiva** — Hanna: *"apagou e fez, apagou e refez umas 10 vezes"*. Toda troca de encarregado obriga a refazer tudo à mão.
2. **Retrabalho de consolidação** — cada um preenche a sua parte e depois alguém tem que compilar e "adequar com a quantidade certa de tracinhos".
3. **Zero visibilidade do encadeamento** — hoje só dá pra saber se a escavação pode ser programada "caçando número" na planilha.
4. **Sem trabalho simultâneo** — não tem base compartilhada; ninguém vê o que o outro programou.
5. **Reuniões de programação exaustivas** — dia inteiro sentado com o supervisor montando a programação do zero. Wesley estima que com pré-programação em campo cairia pra 30min–1h.
6. **Planilhas engessadas com VBA** — descritas como obsoletas e geradoras de bug.
7. **Jornadas até tarde da noite** no time de planejamento por falta de suporte dos supervisores locais.

## Restrições conhecidas do ambiente

- **Fiscalização exige layout de planilha padrão** — o PDF visual do protótipo provavelmente não é aceito (Alisson já questionou). Exportar no formato oficial é requisito, não "nice to have".
- **Supervisor usa celular em campo**, às vezes sem sinal. Mobile-first e tolerância a offline importam.
- **Claude/ferramentas de IA não liberadas corporativamente** — contas pessoais em uso. Isso afeta qualquer feature que dependa de API de IA rodando na infra da empresa.
- **Nível técnico do time varia muito** — Alessandro construiu o protótipo sem saber programar, só prompando o Gemini. A ferramenta tem que ser operável por quem não é técnico.

## Quem é quem

| Pessoa | Papel neste projeto |
|---|---|
| **Alessandro Cordova Macedo** | Autor do protótipo. Dono do conhecimento de domínio da programação |
| **Hanna Hamoy Chocron** | Puxou os requisitos de bloqueio, produtividade individual e formato da fiscalização |
| **Wesley Ryan (eu)** | Responsável pelo backend / transformar em sistema de verdade / escalonar |
| **Rominick Gustavo** | Time de planejamento, domina o processo todo |
| **Daniel** | Já demonstrou interesse numa versão de **programação diária** (além da semanal) |
| **Alisson / Fiscalização** | Consumidor do relatório — define o formato aceito |
| **Gabriel / Eric** | Contatos para problemas dos sistemas legados |

## Compromissos assumidos na reunião

- Desativar a rotina de "salvar em HTML" (sobrescreve código, gera corrupção) — **alinhado**
- Wesley desenvolve o backend — **alinhado**
- Teste/demo da ferramenta **na sexta** (25/09) ou na semana seguinte
- Reunião semanal de alinhamento às **quintas-feiras**
