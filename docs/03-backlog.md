# Backlog consolidado

Fontes: `[REU]` reunião 22/09/2026 · `[PI]` post-it · `[WR]` análise técnica · `[PROT]` existia no protótipo do Alessandro

Situação conferida em **23/09/2026**, item por item, contra o que está publicado.

✅ feito · ⚠️ parcial · ❌ não existe

---

## Fundação

| # | Item | Fonte | |
|---|---|---|---|
| F1 | Backend com dados compartilhados | [REU] | ✅ |
| F2 | Modelo Obra → Trecho → Torre | [REU] [WR] | ✅ |
| F3 | Dropdown de trecho | [REU] | ✅ |
| F4 | Desativar "Baixar App HTML" | [REU] | ✅ |
| F5 | Tabela de execuções (histórico) | [WR] | ⚠️ existe no banco, mas só a importação escreve nela |
| F6 | Restrição como entidade própria | [WR] | ✅ |
| F7 | Usuários e papéis | [WR] | ✅ |
| **F8** | **Corrigir o estágio de uma torre pela tela** | [WR] 23/09 | ✅ |
| **F9** | **Canteiro como dimensão própria** | [REU] | ✅ |
| **F10** | **Estrutura e modelo da torre** | [WR] 23/09 | ✅ |
| **F11** | **Histórico de quem criou, alterou e removeu programação** | [WR] 24/09 | ✅ trigger no banco, não adulterável pela aplicação |

## Regras de negócio

| # | Item | Fonte | |
|---|---|---|---|
| R1 | Bloqueio por precedência | [REU] [PI-2] | ✅ percorre a cadeia inteira |
| R2 | Bloqueio por data retroativa | [REU] | ✅ |
| R3 | Bloqueio por restrição ativa | [WR] | ✅ |
| R4 | Atividades em ordem de execução | [REU] [PI-2] | ✅ |
| R5 | Alerta de conflito de encarregado | [WR] | ✅ |
| R6 | Override com justificativa registrada | [WR] | ✅ |
| R7 | Editor de atividades no front | [WR] 23/09 | ✅ inclusive as dependências da regra de bloqueio |
| **R8** | **Cor e ícone da atividade pela tela** | [PROT] | ✅ |
| **R9** | **Editar uma programação** | [WR] 23/09 | ✅ |
| **R10** | **Limpar programações da torre / do trecho** | [PROT] | ✅ sempre limitado ao trecho e ao período |
| **R11** | **Editar nome de encarregado** | [PROT] | ❌ só adicionar e remover |

## Relatórios e saídas

| # | Item | Fonte | |
|---|---|---|---|
| S1 | Exportar no layout oficial da fiscalização | [REU] | ⚠️ modelos recebidos 24/09 e analisados em [04-relatorio-isa.md](04-relatorio-isa.md). Falta fechar o catálogo unificado (Q1–Q8) antes de codar |
| S2 | Quebra do relatório por semana | [REU] | ❌ |
| S3 | PDF visual + WhatsApp | [REU] | ✅ |
| S4 | Filtros por encarregado / atividade / torre | [REU] | ✅ |
| **S5** | **Filtro por período (semana / quinzena)** | [WR] 23/09 | ✅ presets de semana, quinzena e mês, mais personalizado |
| **S6** | **Total de km e torres por encarregado no relatório** | [REU] | ✅ tabela consolidada no topo da visão |
| **S7** | **Filtro do histórico por pessoa e por data** | [WR] 24/09 | ❌ com pouco movimento não incomoda; em duas semanas vai |

## Fluxo de pré-programação do supervisor

| # | Item | Fonte | |
|---|---|---|---|
| P1 | Painel do supervisor | [PI-3] [REU] | ❌ |
| P2 | Fluxo de solicitação → aceite | [PI-3] | ⚠️ RLS pronta e a programação já nasce `SOLICITADA`, mas não há tela de aprovação — o que o supervisor lançar fica invisível |
| P3 | Mobile-first | [REU] | ✅ testado no celular |
| P4 | Funcionar offline | [WR] | ❌ |
| **P5** | **Responsividade em telas intermediárias** | [WR] 24/09 | ✅ o cabeçalho se enxuga por etapas (rótulos → nome da obra → nome do usuário) e só quebra no celular; filtros em duas colunas no celular; grade nunca respeita mais colunas do que cabem |

> Enquanto P2 não existir, **ninguém pode receber o papel SUPERVISOR** — a
> programação dele entraria e sumiria da vista.

## Base de dados e indicadores

| # | Item | Fonte | |
|---|---|---|---|
| B1 | Produtividade individual por encarregado | [REU] | ❌ |
| B2 | Programado × Executado | [WR] | ❌ |
| B3 | Curva de avanço por trecho e atividade | [WR] | ❌ |
| B4 | Dashboard de gargalos | [WR] | ❌ |

> Todos dependem de **F5**: sem tela de apontar o executado, não há o que medir.
> O schema já está pronto, com a marca `carga_inicial` separando o que foi
> inferido da planilha do que foi apontado de verdade.

## IA

| # | Item | Fonte | |
|---|---|---|---|
| A1 | IA analisa status de atividade por torre | [PI-1] | ❌ |
| A2 | IA sugere programação | [PI-1] | ❌ |

> Depende de B1–B3 e de liberação corporativa de ferramenta de IA.

## Dívida técnica

| # | Item | |
|---|---|---|
| D1 | **SQL aplicado à mão** — o repositório guarda os scripts, mas nada os executa. A CLI do Supabase transformaria `db/` em migrations versionadas, com um comando só. Adiar até depois da demonstração | ❌ |
| D2 | **Correção de estágio não tem trilha de auditoria própria** — fica só `registrado_por` e a observação na linha de execução. O histórico com trigger cobre programação, não execução | ⚠️ |
| D3 | **Tailwind e demais bibliotecas vêm de CDN** — sem build, e com aviso do próprio Tailwind de que não é para produção. Some na migração para Next.js | ⚠️ |

## Levantado na reunião, ainda fora do escopo

- **Programação diária** do supervisor — interesse do Daniel
- **Buritirama tem OPGW dos dois lados** (lado A e lado B) em vez de OPGW + para-raio
- **Faixa de torres por canteiro** — permitiria atribuir canteiro sozinho na importação
- Expandir para "diagrama produtivo completo" da obra
- Aposentar as planilhas com VBA do setor
