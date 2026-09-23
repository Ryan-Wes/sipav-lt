# SIPAV LT

**Sistema de Planejamento de Avanço — Linha de Transmissão**

Programação semanal de avanço de obra de LT. Substitui o fluxo manual em planilha
do setor de Planejamento e o protótipo em HTML com dados presos ao navegador.

Obra de referência: **LT Serra Dourada** (Elecnor).

## Status

**V1 em construção — meta: sexta, 25/09/2026.**

| | |
|---|---|
| ✅ | Contexto, análise do protótipo e backlog documentados |
| ✅ | Schema do banco: precedência, restrições, RLS, realtime |
| ✅ | Seed: trechos, atividades em ordem de execução, dependências, encarregados |
| ⏳ | Projeto Supabase (URL + anon key) |
| ⏳ | Validação da cadeia de atividades com Alessandro / Rominick |
| 🔜 | Interface: login, grade de torres, programação, 4 visões, importação, PDF/WhatsApp |

## Arquitetura

- **Banco e backend:** Postgres no Supabase — auth, RLS por papel, realtime, e as
  regras de precedência em funções/triggers no próprio banco (cliente nenhum burla)
- **Frontend:** HTML/JS estático, scripts clássicos, Tailwind e Supabase por CDN.
  Sem passo de build — a máquina de trabalho não tem Node, npm nem Git
- **Deploy:** estático na Vercel. Quem tem o link e usuário, acessa

Migração futura pra Next.js é barata: o backend não muda, só a camada de tela.

## Escopo da V1

**Entra:** login por usuário · Obra→Trecho→Torre com dropdown de trecho · grade
visual de torres · programação compartilhada em tempo real · múltiplas atividades
por torre · encarregados e atividades em ordem de execução · bloqueio por
precedência e por restrição · importação em bloco colando da planilha · visões por
grade, data, encarregado e atividade · exportação PDF e WhatsApp.

**Fica pra depois:** Excel no layout da fiscalização · painel do supervisor com
fluxo de aceite · offline · dashboards de produtividade · IA. A tabela de execuções
já nasce no schema, mas a tela de apontamento não entra na V1.

## Estrutura

```
db/         schema e seed do Postgres
app/        frontend estático
docs/       contexto, análise e backlog
referencia/ protótipo original, ata e post-its
```

## Documentação

| Doc | Conteúdo |
|---|---|
| [`docs/01-contexto.md`](docs/01-contexto.md) | Domínio, vocabulário, cadeia de atividades, dores, quem é quem |
| [`docs/02-analise-prototipo.md`](docs/02-analise-prototipo.md) | O que o protótipo faz, modelo de dados antigo, problemas estruturais |
| [`docs/03-backlog.md`](docs/03-backlog.md) | Backlog consolidado com rastreabilidade de origem |

## Referências

| Arquivo | Origem |
|---|---|
| `referencia/prototipo-alessandro-v1.html` | Protótipo do Alessandro (Gemini) |
| `referencia/reuniao-2026-09-22.docx` | Ata da reunião |
| `referencia/reuniao-2026-09-22-transcricao.txt` | Transcrição em texto puro |
| `referencia/postit-1-ia-sugestao.jpeg` | "Adicionar IA para analisar status da atividade por torre e também dar sugestão" |
| `referencia/postit-2-ordem-e-bloqueio.jpeg` | "Colocar atividades em ordem de execução" / "Aplicar regras de bloqueio de atividades que precisem de outra anterior" |
| `referencia/postit-3-painel-supervisor.jpeg` | "Fazer tipo um painel que cada supervisor vai fazer sua pré-programação e mandar solicitação pra gente aceitar" |

## Pendências

- [ ] Renomear a pasta do projeto para `sipav-lt`
- [ ] Validar cadeia de atividades e precedências (topo de `db/02-seed.sql`)
- [ ] Obter o modelo oficial de planilha da fiscalização (com Alisson)
- [ ] Avisar o Daniel que o dado da obra ficará em infra externa (Supabase)
