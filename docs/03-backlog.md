# Backlog consolidado

Fontes: `[REU]` reunião 22/09/2026 · `[PI]` post-it · `[WR]` análise técnica (Wesley/Claude)

---

## Fundação — sem isso nada mais existe

| # | Item | Fonte |
|---|---|---|
| F1 | **Backend com dados compartilhados** — substituir localStorage. Todos veem e editam a mesma programação, simultaneamente | [REU] |
| F2 | **Modelo Obra → Trecho → Torre** com km e ordenação de torres | [REU] [WR] |
| F3 | **Dropdown de trecho** — trocar de trecho recarrega torres e status automaticamente | [REU] |
| F4 | **Desativar "Baixar App HTML"** — reescreve o próprio código, corrompe | [REU] alinhado |
| F5 | **Tabela de execuções** (histórico), separada de "última atividade" | [WR] |
| F6 | **Separar restrição de status** — restrição vira flag própria com tipo, data e previsão de liberação | [WR] |
| F7 | **Usuários e papéis** (planejamento / supervisor / leitura) | [WR] |

## Regras de negócio

| # | Item | Fonte |
|---|---|---|
| R1 | **Bloqueio por precedência** — não programar escavação sem acesso/supressão concluídos | [REU] [PI-2] |
| R2 | **Bloqueio por data retroativa / incoerente** | [REU] |
| R3 | **Bloqueio por restrição ativa** — torre com restrição ambiental/fundiária não entra na programação | [WR] |
| R4 | **Atividades em ordem de execução** nos dropdowns e listas, não alfabética | [REU] [PI-2] |
| R5 | **Alerta de conflito de encarregado** — mesma pessoa em dois lugares no mesmo dia | [WR] |
| R6 | Bloqueios devem ser **avisos com justificativa**, não paredes — permitir override registrado pelo planejamento | [WR] |
| R7 | **Editor de atividades no front**: criar, editar, remover atividades e definir de quais outras cada uma depende, sem passar por SQL. Hoje a tela de Atividades é só leitura e qualquer mudança da cadeia exige o Wesley | [WR] 23/09 |

## Relatórios e saídas

| # | Item | Fonte |
|---|---|---|
| S1 | **Exportar no layout oficial da fiscalização** (Excel) — Wesley assumiu | [REU] |
| S2 | Quebra do relatório **por semana**, não quinzena inteira | [REU] |
| S3 | Manter PDF visual + WhatsApp (já funcionam e agradam) | [REU] |
| S4 | Filtro de relatório por encarregado / atividade / data / torre (já existe, manter) | [REU] |

## Fluxo de pré-programação do supervisor

| # | Item | Fonte |
|---|---|---|
| P1 | **Painel do supervisor** — ele monta a própria pré-programação | [PI-3] [REU] |
| P2 | **Fluxo de solicitação → aceite** pelo planejamento | [PI-3] |
| P3 | **Mobile-first de verdade** — usável no celular, no carro, em campo | [REU] |
| P4 | **Funcionar offline** com sincronização depois (campo sem sinal) | [WR] |

> Impacto esperado (estimativa do Wesley na reunião): reunião de programação de **1 dia inteiro → 30min–1h**.

## Base de dados e indicadores

| # | Item | Fonte |
|---|---|---|
| B1 | **Produtividade individual por encarregado** — o que executou, quantas torres, quantos km | [REU] |
| B2 | **Programado × Executado** — aderência da programação | [WR] |
| B3 | **Curva de avanço** da obra por trecho e por atividade | [WR] |
| B4 | Dashboard de gargalos (insumo pras reuniões de quinta) | [WR] |

## IA

| # | Item | Fonte |
|---|---|---|
| A1 | **IA analisa status de atividade por torre** | [PI-1] |
| A2 | **IA sugere programação** — próximas torres/atividades com base em precedência, restrições e produtividade histórica | [PI-1] |

> Depende de B1–B3 (não tem o que analisar sem histórico) e de liberação corporativa de ferramenta de IA. **Fase final.**

## Backlog futuro (mencionado, fora do escopo inicial)

- **Programação diária** do supervisor — interesse manifestado pelo Daniel
- Expandir para "diagrama produtivo completo" da obra
- Aposentar as planilhas com VBA do setor
