# Relatório de Programação Semanal (RPSQ) — ISA

Especificação do relatório que a fiscalização recebe toda sexta e do que o SIPAV
precisa para gerá-lo. Base: os quatro arquivos de **21/09/2026** mais o modelo em
branco, analisados em 24/09/2026.

Nome dos arquivos: `FI.BRA.LT-SD.ENG-21.14 - RPSQ-LT-<TRECHO>-<DD-MM-AAAA>.xlsx`,
onde a data é a **segunda-feira da semana 1**.

---

## 1. Como a planilha é montada

Uma aba útil, **`PS`** (as outras duas, `Planilha1` e `Planilha2`, estão vazias).

### Cabeçalho — linhas 1 a 12, fixas

| Linha | Conteúdo |
|---|---|
| 2 | `RELATÓRIO DE PROGRAMAÇÃO SEMANAL` (em CAF e JZR, `… / QUINZENAL`) |
| 3 | Nome da LT — ex.: `LT 500kV  BARRA II - CORRENTINA C1` |
| 5 | `CONTRATANTE: ISA ENERGIA` · `Data:` = segunda da semana 1 |
| 6 | `CONTRATADA: ELECNOR DO BRASIL` |
| 7 | `CONTRATO Nº SERRA DOURADA - LOTE 1` · `Revisão: 0` |
| 9 | Cabeçalho da tabela |
| 10 | `EXECUTADO` + as 7 datas da semana que passou |
| 11 | `PROGRAMADO SEMANA 1` + as 7 datas da semana que vem |
| 12 | `PROGRAMADA SEMANA 2` + as 7 datas da semana seguinte |

As três linhas de data são o que define o período. No arquivo de 21/09/2026:
executado 14–20/09, semana 1 21–27/09, semana 2 28/09–04/10.

### Colunas

| Col | Campo |
|---|---|
| C | ITEM (`2.1.4`) |
| D | ATIVIDADE (mesclada até G) |
| H | UNID. — `TORRE`, `KM` ou `UND` |
| I | TAREFA — `EXEC.` / `PROG. 1` / `PROG. 2` |
| J | ENCARREGADO |
| K–Q | SEGUNDA … DOMINGO |
| R | TOTAL SEMANAL |
| S | TOTAL PREVISTO |
| T | ACUM. ATUAL |
| U | QUANT. FALTA |
| V | % EXEC. |

Da coluna X em diante há um bloco auxiliar de fórmulas de contagem, quase todo
quebrado (`#REF!`, `#VALUE!`) nos quatro arquivos.

> **Atenção:** o arquivo `VAZIA` tem as mesmas colunas **deslocadas duas casas à
> esquerda** (ITEM em A, atividade em B, dias em I–O). Alguém apagou duas colunas
> nele. O layout correto é o dos quatro preenchidos.

### Corpo — três linhas por item

Cada item ocupa exatamente três linhas: `EXEC.`, `PROG. 1`, `PROG. 2`. As linhas de
seção (`2.1`, `3.1`) ocupam uma linha só, com item e nome e mais nada.

### Como as células do dia são preenchidas

O conteúdo é a lista de torres, separada por vírgula:

```
J: JOSE SOARES | K: 46/2 | L: 47/1 | M: 47/2 | N: 48/1 | O: 48/2 | P: 49/1 | R: 6
```

Quando mais de um encarregado divide a mesma linha, os nomes ficam **empilhados
dentro da célula, um por linha** (quebra de linha, não barra), e **cada célula do dia
repete o empilhamento na mesma ordem**. As torres de cada um saem separadas por
vírgula:

| | ENCARREGADO | SEGUNDA | TERÇA |
|---|---|---|---|
| `PROG. 1` | ROMÁRIO<br>WEMERSON | 1/1, 2/1<br>5/1, 5/2, 6/1 | 2/2, 3/1<br>6/2, 8/1, 8/2 |

As células precisam de `wrapText`, senão o Excel mostra tudo grudado.

> **Correção de 24/09.** A primeira versão desta especificação dizia que o separador
> era ` / `. Estava errado, e o erro foi de leitura: o script que extraiu as
> planilhas trocava quebra de linha por ` / ` para caber numa linha de texto, e eu li
> a saída do script como se fosse a convenção do documento. Existem algumas células
> com ` / ` digitado à mão (`BENEDITO / MANOEL`), mas o padrão é o empilhamento.

Convenções observadas:

- Domingo (coluna Q) é sempre `DSR`.
- Dia sem serviço é `-`, nunca célula vazia.
- Encarregado sempre em CAIXA ALTA.
- A cada nova quinzena, a programação da anterior é **apagada**, não acumulada.
- Texto livre substitui a torre quando é o caso: `FERIADO`, `FOLGA DE CAMPO`,
  `MUDANÇA PARA IGARITÉ`, `APOIO REATERRO ESTAI`, `MUDANÇA DO GUINDASTE PARA WANDERLEY`.
- Complemento entre parênteses depois da torre: `74/2, 73/2 (RETIRADA DE FLAMBAGEM)`,
  `286/1 PÉ A, D`, `49/2 À 59/2 (4KM)`.
- `R` (total semanal) é **a soma dos percentuais, não a contagem de torres**. Era por
  isso que aparecia fracionário na planilha de vocês (`2,5` e `3,5` em montagem):
  um serviço que leva dois dias na mesma torre se reparte, e cada dia leva a sua
  parte. Torre repartida sai com o percentual na célula — `244/2 (50%)` —, senão a
  célula diria que a torre inteira foi feita nos dois dias.

### Semana e quinzena

O relatório cobre **duas semanas**, não uma. `PROG. 1` é a semana que começa na data
do cabeçalho; `PROG. 2` é a seguinte. No SIPAV isso já existe: o filtro de período
tem o preset *Esta e a próxima*.

Os títulos divergem — Barra–Correntina e Buritirama dizem só `SEMANAL`, Campo Formoso
e Juazeiro dizem `SEMANAL / QUINZENAL`. Padronizar para `SEMANAL / QUINZENAL`, que é
o que a planilha de fato é.

### Linhas ocultas

O que não vai ser executado na semana é **ocultado**, não apagado. Por isso a planilha
em branco parece maior que as preenchidas: ela está com tudo reexibido.

| Trecho | Linhas ocultas (de 13 até o rodapé) |
|---|---|
| Barra II – Correntina | 233 de 281 |
| Buritirama – Barra II | 218 de 312 |
| Campo Formoso II – Barra II | 115 de 202 |
| Juazeiro III – Campo Formoso II | 54 de 105 |

Campo Formoso e Juazeiro ocultam também as colunas X–AF (o bloco auxiliar quebrado);
a planilha em branco oculta U–AF.

Consequência para o exportador: **reexibir toda linha que for preencher**. Uma
programação escrita numa linha oculta não aparece para ninguém, nem para a
fiscalização. Vale ir além e deixar o SIPAV cuidar da visibilidade inteira — mostra os
itens com programação no período, oculta o resto —, o que elimina um passo manual
da sexta.

### Rodapé

`OBSERVAÇÕES:` e, mais abaixo, `ELABORADO: NOME: JOSE CARLOS GOMES JUNIOR` /
`GERENCIA DA OBRA: NOME: DANIEL OSVALDO CABARITI`.

---

## 2. As quatro planilhas divergiram

| Trecho | Itens | Última linha | Última seção |
|---|---|---|---|
| Buritirama – Barra II | 96 | 318 | 5.1 Comissionamento |
| Barra II – Correntina | 86 | 282 | 4.2 OPGW |
| Campo Formoso II – Barra II | 59 | 208 | 3.2 Autoportante |
| Juazeiro III – Campo Formoso II | 29 | 111 | 2.1 Fundação |

Parte é legítima — trecho em fase inicial não tem seção de lançamento. Mas os 138
grupos de item levantados mostram muita divergência que é erro de digitação e de
edição a várias mãos.

### Erros de numeração

| # | Onde | O quê |
|---|---|---|
| E1 | BRR-COR, BRT-BRR | O bloco `4.2.7` / `4.2.8` / `4.2.9` (Amortecimento, Descida OPGW, Caixa de Emenda) aparece **duas vezes**: uma dentro da seção 4.1 e outra dentro da 4.2 |
| E2 | BRR-COR | Revisão e Conclusão de **Autoportante** numeradas `3.1.3` e `3.1.4` — colidem com Içamento Estaiada e Revisão Final Estaiadas. Deveriam ser `3.2.3` / `3.2.4` |
| E3 | BRT-BRR | `2.1.17` usado duas vezes: Ensaio de Arrancamento Estai e Reaterro Mastro Central |
| E4 | BRT-BRR | `1.3.4` usado duas vezes: Supressão Área de Queimada e Alinhamento da Faixa |
| E5 | BRT-BRR | Dentro da seção 2.1 os códigos saem da ordem: `2.1.2`, `2.1.5`, `2.1.6`…`2.1.9`, `2.1.4`, `2.1.11`, `2.1.5`, `2.1.13`, `2.1.6`, `2.1.15`, `2.1.17`, `2.1.17`, `2.1.7`, `2.1.8` |
| E6 | CAF-BRR | `2.1.1` usado duas vezes (Armação Estai/Pé e Armação Fundação) |
| E7 | BRR-COR | `1.3.6` Alinhamento da Faixa, que nos outros três é `1.3.4` |

### Serviços duplicados

| # | Onde | O quê |
|---|---|---|
| D1 | BRT-BRR | `2.2.4 Transporte de estrutura` está dentro de ATERRAMENTO — já existe em `3.0.2` |
| D2 | BRT-BRR | `2.2.2 TESTE DE ARRANCAMENTO` duplica `2.1.7 / 2.1.17 Ensaio de Arrancamento` |
| D3 | CAF-BRR | Injeção de Nata Estai/Pé em `2.1.6` **e** `2.1.13` |
| D4 | CAF-BRR | Perfuração em Rocha Estai/Pé em `2.1.4` **e** `2.1.10` |

### Lixo nas células

| # | Onde | O quê |
|---|---|---|
| L1 | CAF-BRR | Número solto na coluna ITEM: `10.5` (L134), `0.5` (L143), `20.5` (L152 e L158), `7.5` (L161), `13.5` (L162), `24.29` (L173) |
| L2 | CAF-BRR | L112: nome da atividade repetido na coluna B, fora do lugar |
| L3 | Todas | Nomes de canteiro soltos nas colunas W, Y, AA, AE–AH, longe da tabela |
| L4 | Todas | Bloco auxiliar de fórmulas (X em diante) quase todo em `#REF!` / `#VALUE!` |

### Unidade diferente para o mesmo serviço

| Serviço | BRR-COR | BRT-BRR | CAF-BRR | JZR-CAF |
|---|---|---|---|---|
| Corte Seletivo | TORRE | TORRE | **KM** | **KM** |
| Seccionamento de Cercas | KM | — | **TORRE** | — |
| Transporte de Estrutura | TORRE | TORRE | **KM** | — |

Essa é a divergência mais grave: muda o número que vai pra fiscalização.

### Nome diferente para o mesmo serviço

| Canônico proposto | Variantes encontradas |
|---|---|
| Limpeza da Faixa | `LIMPEZA VÃO ENTRE ESTRUTURAS` (BRT) |
| Construção de Acesso | `CONSTRUÇÃO ESTRADA DE ACESSO` (BRT) |
| Supressão de Área de Queimada | `LIMPEZA ÁREA DE QUEIMADA` (CAF) |
| Limpeza de Área de Torre | `LIMPEZA ÁREA DE TORRE` (BRR, BRT) |
| Ensaio de Arrancamento | `TESTE DE ARRANCAMENTO` (BRT) |
| Montagem de Torres Autoportante (Guindaste) | `MONTAGEM MECANIZADA DE TORRE AUTOPORTANTE` (BRT) |
| Revisão de Torres Autoportante | `REVISÃO DE TORRE AUTOPORTANTE` (BRT) |
| Içamento de Torres Estaiada / Montagem Manual | `IÇAMENTO DE TORRES ESTAIADA` (BRT) |
| Instalação do Contrapeso - Complemento | `COMPLEMENTO DE CONTRAPESO` (BRT) |
| Canteiro Lajes dos Negros | `CANTEIRO LAJE DOS NEGROS` (JZR) |

### Erros de digitação a corrigir

`OBRS CIVIS` → `OBRAS CIVIS` (nas quatro) · `CONTRUÇÃO DE CANTEIRO` → `CONSTRUÇÃO`
(nas quatro) · `Fundação Estai / Pél` (BRR 2.1.10) · `MATRO CENTRAL` (BRT 2.1.11,
CAF 2.1.9) · `WAMDERLEY` (BRR L195) · `EMPACADURA` / `EMPANCADURA` usados juntos.

### Diferença que talvez não seja erro

- **BRR-COR**: seção 4.1 = `PARA-RAIO CONVENCIONAL 3/8 ou DOTTEREL`, 4.2 = `OPGW`
- **BRT-BRR**: 4.1 = `PARA-RAIO OPGW DIREITO`, 4.2 = `PARA-RAIO OPGW ESQUERDO`

Ou seja, projetos de para-raio/OPGW diferentes — um trecho com para-raio convencional de
um lado e OPGW do outro, o outro com OPGW dos dois lados. **Confirmar com a engenharia
antes de unificar**, porque se for real as duas seções têm que conviver no modelo.

---

## 3. Catálogo unificado proposto

Espinha dorsal: a numeração de **Barra II – Correntina**, que é a mais completa e a
mais consistente internamente. Correções aplicadas: E1–E7, D1–D4.

### 1.0 Serviços Preliminares — Topografia

| Item | Atividade | Unid. |
|---|---|---|
| 1.0.1 | Locação de Piquete Central | TORRE |
| 1.0.2 | Seção Diagonal (PLDV) | TORRE |
| 1.0.3 | Conferência de Perfil | KM |
| 1.0.4 | Conferência de Ponto Crítico | KM |
| 1.0.5 | Locação de Cavas | TORRE |

### 1.1 Serviços Preliminares — Estudos de Solo

| Item | Atividade | Unid. |
|---|---|---|
| 1.1.1 | Sondagem | TORRE |
| 1.1.2 | Medição de Resistividade do Solo | TORRE |

### 1.2 Serviços Preliminares — Estrada de Acesso

| Item | Atividade | Unid. |
|---|---|---|
| 1.2.1 | Croqui de Acesso | TORRE |
| 1.2.2 | Instalação de Placa de Acesso | TORRE |
| 1.2.3 | Construção de Acesso | KM |
| 1.2.4 | Execução de Colchetes / Porteiras | TORRE |
| 1.2.5 | Recuperação de Acesso | KM |

### 1.3 Serviços Preliminares — Supressão Vegetal

| Item | Atividade | Unid. |
|---|---|---|
| 1.3.1 | Limpeza de Área de Torre | TORRE |
| 1.3.2 | Limpeza da Faixa | KM |
| 1.3.3 | Corte Seletivo | TORRE |
| 1.3.4 | Supressão de Área de Queimada | KM |
| 1.3.5 | Supressão de Praça de Lançamento | KM |
| 1.3.6 | Alinhamento da Faixa para Supressão | KM |

### 1.4 Serviços Preliminares — Construção de Canteiro

Um item por canteiro do trecho, unidade `UND`. Os nove canteiros da obra:
Barra, Buritirama, Igarité, Wanderley, Juazeiro, Lajes dos Negros, Umburanas,
Central, Itajubaquara. Buritirama tem ainda `Pátio de Materiais`.

### 2.0 Obras Civis — Fabricação de Pré-Moldado

| Item | Atividade | Unid. |
|---|---|---|
| 2.0.1 | Fabricação Pré-Moldado - Mastro Central | UND |
| 2.0.2 | Fabricação Pré-Moldado - Placa Pré-Moldada II | UND |
| 2.0.3 | Fabricação Pré-Moldado - Placa Pré-Moldada III | UND |
| 2.0.4 | Fabricação Pré-Moldado - Placa Pré-Moldada IV | UND |
| 2.0.5 | Fabricação Pré-Moldado - Viga L - Solo III | UND |
| 2.0.6 | Fabricação Pré-Moldado - Viga L - Solo IV | UND |
| 2.0.7 | Transporte de Pré-Moldados | UND |

**Fora do planejamento** (A4). A seção continua na planilha e continua sendo
preenchida à mão, mas o SIPAV não programa fabricação — programa a *instalação*,
em `2.1.10` e `2.1.11`. Por isso a divergência de granularidade entre as quatro
(mastro por altura em Barra–Correntina, vigas agrupadas em Campo Formoso e
Juazeiro) deixa de importar para o exportador.

### 2.1 Obras Civis — Fundação

| Item | Atividade | Unid. |
|---|---|---|
| 2.1.1 | Armação - Fundação Estai / Pé | TORRE |
| 2.1.2 | Armação - Fundação Placa | TORRE |
| 2.1.3 | Armação - Fundação Mastro | TORRE |
| 2.1.4 | Escavação - Fundação Estai / Pé | TORRE |
| 2.1.5 | Escavação - Fundação Mastro Central | TORRE |
| 2.1.6 | Perfuração em Rocha / Cravação de Estacas - Fundação Estai / Pé | TORRE |
| 2.1.7 | Perfuração em Rocha / Cravação de Estacas - Fundação Mastro Central | TORRE |
| 2.1.8 | Injeção de Nata de Cimento - Fundação Estai / Pé | TORRE |
| 2.1.9 | Injeção de Nata de Cimento - Fundação Mastro Central | TORRE |
| 2.1.10 | Instalação de Pré-Moldados / Nivelamento / Preparação - Fundação Estai / Pé | TORRE |
| 2.1.11 | Instalação de Pré-Moldados / Nivelamento / Preparação - Fundação Mastro Central | TORRE |
| 2.1.12 | Concretagem In-Loco - Fundação Estai / Pé | TORRE |
| 2.1.13 | Concretagem In-Loco - Fundação Mastro Central | TORRE |
| 2.1.14 | Desforma - Fundação Estai / Pé | TORRE |
| 2.1.15 | Desforma - Fundação Mastro Central | TORRE |
| 2.1.16 | Reaterro - Fundação Estai / Pé | TORRE |
| 2.1.17 | Reaterro - Fundação Mastro Central | TORRE |
| 2.1.18 | Ensaio de Arrancamento - Fundação Estai | TORRE |
| 2.1.19 | Fundação 100% Concluída - Completa | TORRE |
| **2.1.20** | **Perfuração de Tubulão - Fundação Estai / Pé** | TORRE |
| **2.1.21** | **Perfuração de Tubulão - Fundação Mastro Central** | TORRE |

`2.1.20` e `2.1.21` **não existem em nenhuma das quatro planilhas** e precisam ser
criados: pelo A1, perfuração de tubulão é serviço diferente de perfuração em rocha,
e hoje não tem onde ser apontado.

### 2.2 Obras Civis — Instalação de Aterramento

| Item | Atividade | Unid. |
|---|---|---|
| 2.2.1 | Instalação de Contrapeso | TORRE |
| 2.2.2 | Instalação do Contrapeso - Complemento | TORRE |
| 2.2.3 | Medição de Resistência | TORRE |
| 2.2.4 | Complemento de Cabo Contrapeso | TORRE |
| 2.2.5 | Seccionamento e Aterramento de Cercas | KM |

### 3.0 Montagem de Estrutura — Pátio

| Item | Atividade | Unid. |
|---|---|---|
| 3.0.1 | Corte de Estais | TORRE |
| 3.0.2 | Transporte de Estrutura | TORRE |

### 3.1 Montagem de Estrutura — Estaiada

| Item | Atividade | Unid. |
|---|---|---|
| 3.1.1 | Pré-Montagem de Torre Estaiada | TORRE |
| 3.1.2 | Revisão em Solo de Torres Estaiada | TORRE |
| 3.1.3 | Içamento de Torres Estaiada / Montagem Manual | TORRE |
| 3.1.4 | Revisão Final Estaiadas | TORRE |
| 3.1.5 | Giro e Prumo | TORRE |
| 3.1.6 | Conclusão de Montagem de Torre Estaiada | TORRE |

### 3.2 Montagem de Estrutura — Autoportante

| Item | Atividade | Unid. |
|---|---|---|
| 3.2.1 | Pré-Montagem de Torre Autoportante | TORRE |
| 3.2.2 | Montagem de Torres Autoportante (Guindaste) | TORRE |
| 3.2.3 | Revisão de Torres Autoportante | TORRE |
| 3.2.4 | Conclusão de Montagem de Torre Autoportante | TORRE |

### 4.0 Lançamento de Cabo — Empancadura / Praça

| Item | Atividade | Unid. |
|---|---|---|
| 4.0.1 | Instalação de Empancadura | TORRE |
| 4.0.2 | Retirada de Empancadura | TORRE |
| 4.0.3 | Praça para Lançamento | UND |

### 4.1 e 4.2 Lançamento de Cabo — Para-Raio e OPGW

Mesma estrutura de nove itens nas duas seções. **`4.1` = para-raio 3/8 / Dotterel,
`4.2` = OPGW** — resolvido pelo A6.

As duas condições existem de verdade na obra: Buritirama leva OPGW dos dois lados,
Barra–Correntina leva para-raio convencional de um lado e OPGW do outro. OPGW dos
dois lados é a tendência das LTs novas, porque a fibra permite leitura de vento e
chuva além da proteção contra descarga. O 3/8 e o Dotterel são o mesmo cabo emendado
e trocam só perto das subestações, por condição mecânica — **não viram opções
separadas no SIPAV**.

Os itens `4.x.8` (descida do cabo) e `4.x.9` (caixa de emenda) só fazem sentido no
OPGW, que é o que tem fibra.

| Item | Atividade | Unid. |
|---|---|---|
| 4.x.1 | Instalação de Bandolas | TORRE |
| 4.x.2 | Lançamento do Cabo Pilotinho | KM |
| 4.x.3 | Lançamento do Cabo | KM |
| 4.x.4 | Nivelamento | KM |
| 4.x.5 | Grampeação | TORRE |
| 4.x.6 | Ancoragem | TORRE |
| 4.x.7 | Sistema de Amortecimento | KM |
| 4.x.8 | Descida do Cabo | TORRE |
| 4.x.9 | Instalação de Caixa de Emenda | TORRE |

### 4.3 Lançamento de Cabo — Condutor

| Item | Atividade | Unid. |
|---|---|---|
| 4.3.1 | Instalação de Bandolas e Isoladores | TORRE |
| 4.3.2 | Lançamento do Cabo Piloto do Condutor | KM |
| 4.3.3 | Lançamento do Cabo Condutor | KM |
| 4.3.4 | Nivelamento do Cabo Condutor | KM |
| 4.3.5 | Grampeação do Cabo Condutor | TORRE |
| 4.3.6 | Ancoragem do Cabo Condutor | TORRE |
| 4.3.7 | Instalação de Jumper | TORRE |
| 4.3.8 | Instalação de Espaçadores | KM |

### 4.4 Lançamento de Cabo — Sinalização

| Item | Atividade | Unid. |
|---|---|---|
| 4.4.1 | Instalação de Sinalizadores de Estais | TORRE |
| 4.4.2 | Instalação de Dispositivo Avifauna | TORRE |
| 4.4.3 | Instalação de Placas de Sinalização | TORRE |

### 5.1 Comissionamento

| Item | Atividade | Unid. |
|---|---|---|
| 5.1.1 | Pré-Comissionamento de Cabos / Estrutura | TORRE |
| 5.1.2 | Comissionamento de Cabos / Estrutura | TORRE |
| 5.1.3 | Revisão de Solo | TORRE |

---

## 4. De-para: as 28 atividades do SIPAV

`EST` = torre estaiada, `AUP` = autoportante. O SIPAV sabe o tipo de cada torre
(`torre.estrutura`), então consegue escolher a linha sozinho.

Depois das respostas do Alessandro a lista do SIPAV vai de 28 para **33
atividades** (migração em [`db/21-cadeia-isa.sql`](../db/21-cadeia-isa.sql)) e o
de-para fica quase todo 1 para 1.

| SIPAV | Item ISA | Observação |
|---|---|---|
| ABERTURA DE ACESSO | 1.2.3 | |
| CORTE SELETIVO | 1.3.3 | |
| SUPRESSÃO DE ÁREA DE TORRE | 1.3.1 | |
| SUPRESSÃO DA FAIXA | 1.3.2 | |
| ESCAVAÇÃO | 2.1.4 + 2.1.5 | 2.1.5 só para EST |
| ESCAVAÇÃO - ESTAI | 2.1.4 | nova — ver DEC-15 |
| ESCAVAÇÃO - MC | 2.1.5 | nova — ver DEC-15 |
| PERFURAÇÃO DE TUBULÃO | **2.1.20 + 2.1.21** | itens novos — ver DEC-6 |
| PERFURAÇÃO EM ROCHA | 2.1.6 + 2.1.7 | 2.1.7 só para EST |
| INSTALAÇÃO DE PRÉ-MOLDADOS - VIGA L | 2.1.10 | |
| INSTALAÇÃO DE PRÉ-MOLDADOS - MC | 2.1.11 | |
| INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L | 2.1.10 + 2.1.11 | |
| INJEÇÃO DE NATA | 2.1.8 + 2.1.9 | 2.1.9 só para EST |
| CONCRETAGEM / TUBULÃO | 2.1.12 + 2.1.13 | 2.1.13 só para EST |
| REATERRO 100% | 2.1.16 + 2.1.17 | 2.1.17 só para EST |
| TESTE DE ARRANCAMENTO | 2.1.18 | |
| ATERRAMENTO / CONTRAPESO | 2.2.1 | |
| MEDIÇÃO DE RESISTÊNCIA | 2.2.3 | |
| PRÉ-MONTAGEM | 3.1.1 + 3.1.2 (EST) · 3.2.1 (AUP) | 3.1.2 é a revisão em solo, que vai junto |
| MONTAGEM | 3.1.3 (EST) · 3.2.2 (AUP) | içamento |
| REVISÃO | 3.1.4 (EST) · 3.2.3 (AUP) | inclui a flambagem, como texto na célula |
| GIRO E PRUMO | 3.1.5 | |
| INSTALAÇÃO DE BANDOLAS OPGW / PARA-RAIO | 4.1.1 **ou** 4.2.1 | pelo campo `cabo` — ver DEC-14 |
| LANÇAMENTO DO PILOTINHO | 4.1.2 **ou** 4.2.2 | pelo campo `cabo` — ver DEC-12 |
| LANÇAMENTO DO CABO OPGW/PR | 4.1.3 **ou** 4.2.3 | pelo campo `cabo` |
| NIVELAMENTO OPGW / PARA-RAIO | 4.1.4 **ou** 4.2.4 | pelo campo `cabo` |
| GRAMPEAÇÃO OPGW / PARA-RAIO | 4.1.5 **ou** 4.2.5 | pelo campo `cabo` |
| ANCORAGEM OPGW / PARA-RAIO | 4.1.6 **ou** 4.2.6 | pelo campo `cabo` |
| INSTALAÇÃO DE BANDOLAS E ISOLADORES | 4.3.1 | nova — ver DEC-14 |
| LANÇAMENTO DO PILOTO DO CONDUTOR | 4.3.2 | nova — ver DEC-12 |
| LANÇAMENTO CONDUTOR 100% | 4.3.3 | |
| NIVELAMENTO DOS CONDUTORES | 4.3.4 | |
| GRAMPEAÇÃO DOS CONDUTORES | 4.3.5 | |
| ANCORAGEM DOS CONDUTORES | 4.3.6 | |
| INSTALAÇÃO DE JUMPER | 4.3.7 | |
| INSTALAÇÃO DE ESPAÇADORES | 4.3.8 | |
| INSTALAÇÃO DE SINALIZAÇÃO | 4.4.1 + 4.4.2 + 4.4.3 | única que ainda abre em três |

Sobrou um caso de leque de verdade: **sinalização**, que no ISA são sinalizador de
estais, dispositivo avifauna e placa. O Alessandro pediu "Sinalização" como um item
só, então o exportador escreve a mesma programação nas três linhas até alguém pedir
para separar.

### Itens do ISA que o SIPAV não programa

Confirmado em 24/09: **topografia, sondagem, armação, canteiro e
comissionamento não entram no planejamento**. Continuam manuais e o exportador não
encosta neles.


Topografia (1.0.1–1.0.5), estudos de solo (1.1.1–1.1.2), croqui e placa de acesso
(1.2.1, 1.2.2), colchetes (1.2.4), recuperação de acesso (1.2.5), queimada, praça e
alinhamento (1.3.4–1.3.6), canteiros (1.4.x), pré-moldados (2.0.x), armação
(2.1.1–2.1.3), desforma (2.1.14, 2.1.15), fundação 100% (2.1.19), complemento e
cercas (2.2.2, 2.2.4, 2.2.5), pátio (3.0.1, 3.0.2), revisão em solo (3.1.2),
conclusões (3.1.6, 3.2.4), empancadura e praça (4.0.x), amortecimento, descida e
caixa de emenda (4.x.7–4.x.9), comissionamento (5.1.x).

São cerca de 45 itens. **Continuam sendo preenchidos à mão**, e é por isso que o
exportador tem que escrever dentro do arquivo existente em vez de gerar um novo.

---

## 5. Como o exportador vai funcionar

1. Você escolhe o trecho e a quinzena, e sobe o `.xlsx` daquela semana.
2. O SIPAV abre a aba `PS`, lê a coluna C e localiza a linha de cada item pelo código.
3. Confere que as datas das linhas 11 e 12 batem com o período escolhido; se não
   baterem, avisa antes de escrever.
4. Para cada item mapeado, escreve **só** `PROG. 1` e `PROG. 2`:
   coluna J com os encarregados empilhados, um por linha dentro da célula (quebra de
   linha — não " / ", que era saída do meu script de extração e não da planilha),
   colunas K–P com as torres do dia na mesma ordem dos encarregados, coluna Q com
   `DSR`, coluna R com a soma dos percentuais.
5. **Reexibe a linha que preencheu** e oculta as que ficaram sem programação no
   período — é o que hoje se faz à mão.
6. Não encosta na linha `EXEC.`, nem nas colunas S–V, nem no cabeçalho, nem no
   rodapé, nem no bloco auxiliar.
7. Devolve um arquivo novo para baixar — o original nunca é sobrescrito.

Fora de escopo: a linha `EXEC.` — **decisão de 01/10/2026: não será preenchida pelo
SIPAV por enquanto**, talvez no futuro. Continua em branco e à mão. O apontamento de
execução existe e tem histórico, então o impedimento técnico caiu; o que ficou foi a
decisão de não fazer. Também fora: os itens em KM, que precisam de quantidade e não de
contagem de torre.

---

## 6. Decisões tomadas

| # | Decisão | Quem / quando |
|---|---|---|
| DEC-1 | Topografia, sondagem, armação, canteiro e comissionamento não são planejados. Permanecem manuais | eu, 24/09 |
| DEC-2 | `PREPARAÇÃO` é absorvida por `INSTALAÇÃO DE PRÉ-MOLDADOS` no SIPAV, que é o que a linha do ISA já junta. Migração é segura: nada depende de `PREPARAÇÃO` e as duas dependem de `ESCAVAÇÃO` | eu, 24/09 |
| DEC-3 | ~~`REVISÃO / GIRO E PRUMO` vira três~~ — **revogada pelo A2**, ver DEC-7 | eu, 24/09 |
| DEC-4 | Unidades: Corte Seletivo = `TORRE`, Seccionamento e Aterramento de Cercas = `KM`, Transporte de Estrutura = `TORRE` | eu, 24/09 |
| DEC-5 | O exportador gerencia a visibilidade das linhas | eu, 24/09 |
| DEC-6 | Perfuração de tubulão e perfuração em rocha são serviços diferentes. As duas já existem no SIPAV; faltam os itens `2.1.20` e `2.1.21` no catálogo da ISA | Alessandro, 24/09 (A1) |
| DEC-7 | Cadeia de montagem corrigida: **revisão em solo vai junto com a pré-montagem** (só estaiada, decide se dá para içar com guindaste), içamento depois, **flambagem vai junto com a revisão**, e **giro e prumo sai sozinho depois**. No SIPAV: `FLAMBAGEM` é absorvida por `REVISÃO` e `GIRO E PRUMO` vira atividade própria | Alessandro, 24/09 (A2) |
| DEC-8 | Grampeação e ancoragem são apontadas separadas, e `INSTALAÇÃO DE ACESSÓRIOS` se abre em espaçador, jumper e sinalização | Alessandro, 24/09 (A3) |
| DEC-9 | Fabricação de pré-moldado sai do planejamento. O que se programa é a **instalação**, em três sabores — só mastro central, só viga L, ou os dois — porque as equipes se dividem assim | Alessandro, 24/09 (A4) |
| DEC-10 | O para-raio/OPGW vira um campo na programação, `OPGW` ou `PARA_RAIO`, em vez de atividades duplicadas. É ele que decide se a linha vai para `4.1` ou `4.2` | Alessandro, 24/09 (A6) |
| DEC-11 | A padronização das quatro planilhas será apresentada à fiscalização antes de valer | Alessandro, 24/09 (A5) |
| DEC-12 | **Pilotinho e piloto são cabos diferentes.** O pilotinho puxa o para-raio/OPGW (`4.1.2` / `4.2.2`), o piloto puxa o condutor (`4.3.2`). O SIPAV tinha uma atividade só para os dois: ela vira `LANÇAMENTO DO PILOTINHO` e nasce `LANÇAMENTO DO PILOTO DO CONDUTOR`. 33 → 34 atividades. [`db/23`](../db/23-piloto-e-pilotinho.sql) | eu, 24/09 |
| DEC-13 | `LANÇAMENTO DO PILOTINHO` exige `GIRO E PRUMO`. Não se lança cabo em torre não aprumada, e como é a primeira etapa em que se puxa cabo, o bloqueio transitivo cobre todo o resto da fase. Bandolas fica de fora porque é acessório na torre, não lançamento. [`db/22`](../db/22-lancamento-depende-do-prumo.sql) | eu, 24/09 |
| DEC-15 | **Escavação em três sabores**, como os pré-moldados: `ESCAVAÇÃO - ESTAI`, `ESCAVAÇÃO - MC` e a genérica `ESCAVAÇÃO`, que faz as duas. A genérica mantém nome e id porque carrega a carga inicial inteira. 35 → 37 atividades. [`db/27`](../db/27-escavacao-em-tres.sql) | eu, 25/09 |
| DEC-14 | **Bandola do para-raio/OPGW e bandola do condutor são dois serviços.** "Primeiro colocam bandola de para-raio, lançam o cabo, e só depois é que vai colocar bandola de condutor e lançar condutor." A que existe vira `INSTALAÇÃO DE BANDOLAS OPGW / PARA-RAIO` e nasce `INSTALAÇÃO DE BANDOLAS E ISOLADORES`. 34 → 35 atividades. [`db/24`](../db/24-bandolas-em-duas-etapas.sql) | eu, 24/09 |
| DEC-16 | **As quatro planilhas de 28/09 são as oficiais** (`RPSQ-LT-BRRII-COR`, `BRT-BRRII`, `CAFII-BRRII`, `JZRIII-CAFII`), revisadas e adotadas daqui para a frente. O exportador foi conferido contra as quatro. A numeração dos códigos ainda difere entre elas (`3.1.x`, `5.0`/`5.1`), então a busca continua sendo pelo nome | eu, 01/10 |
| DEC-17 | **OPGW direito e esquerdo.** Buritirama–Barra e Juazeiro–Campo Formoso não têm para-raio: têm duas seções de OPGW (`DIREITO` na 4.1 e `ESQUERDO` na 4.2, com as mesmas linhas e a mesma numeração `4.2.x`). Barra–Correntina e Campo Formoso–Barra seguem com para-raio + OPGW. O campo `cabo` ganhou `OPGW_DIREITO` e `OPGW_ESQUERDO`, e o trecho guarda a configuração (`trecho.cabo_modelo`) para a tela oferecer só o que vale para ele. O exportador acha o lado pelo título da seção. [`db/41`](../db/41-opgw-direito-esquerdo.sql) | eu, 01/10 |
| DEC-18 | `RECUPERAÇÃO DE ACESSO` (1.2.5) e `SUPRESSÃO DE PRAÇA DE LANÇAMENTO` (1.3.5) entram no de-para: existem nas quatro planilhas oficiais. A SUPRESSÃO DE PRAÇA DE LANÇAMENTO já é atividade do SIPAV; a **RECUPERAÇÃO DE ACESSO não é de série**: o seed deixou como pergunta, e ela só existe se alguém a criar em *Atividades e dependências*. Sem ela, a importação avisa *a atividade não existe no SIPAV* (descoberto em 07/10 ao importar a planilha de 05/10). O nome da atividade passa a ser comparado sem caixa e sem acento | eu, 01/10 |
| DEC-19 | **Corte Seletivo e Transporte de Estrutura são por torre**, como a DEC-4 já dizia. As planilhas oficiais trazem `KM` na coluna UNID. dessas duas linhas, e isso é erro delas: o exportador escreve torres, e a unidade do arquivo não é tocada. A correção é na planilha, com a engenharia de Planejamento | eu, 01/10 |
| DEC-20 | **A revisão leva a observação para o relatório.** Na REVISÃO aparecem dois botões, `Retirada de flambagem` e `Retirada de pendências`, que escrevem a frase na observação. Escolher um tira o outro; sem nenhum é revisão apenas. O exportador lê a observação e escreve **entre parênteses depois da torre**: `61/1 (RETIRADA DE FLAMBAGEM)`, ou `61/1 (50% · RETIRADA DE PENDÊNCIAS)` quando a torre foi repartida. Só a REVISÃO é lida; observação livre de outra atividade não vai ao relatório, e texto livre numa revisão também não, a não ser que seja uma das duas frases. Não precisa de SQL: usa a coluna `observacao` | eu, 01/10 |
| DEC-21 | **Dois encarregados na mesma atividade.** A torre sai na linha dos dois encarregados, mas a cópia do segundo não entra no total do item: o serviço é um só. [`db/42`](../db/42-segundo-encarregado.sql) | eu, 01/10 |
| DEC-22 | **O caminho inverso: importar a programação da planilha da ISA.** Lê as linhas PROG. 1 (semanal) e PROG. 2 (quinzenal) dos itens do catálogo e cria as programações, depois de uma prévia. As datas vêm da própria planilha (cabeçalho); o campo de data só vale quando ela não as traz. A torre que está nas linhas de dois encarregados vira **uma** programação com os dois. Os itens que são partes de uma atividade do SIPAV (escavação do estai e do mastro, perfuração em rocha, pré-montagem com revisão em solo) voltam a ser a atividade inteira; empate vai para o nome mais curto, então numa autoportante vale `ESCAVAÇÃO` e não `ESCAVAÇÃO - ESTAI`. O percentual e a retirada de flambagem/pendências lidos dos parênteses voltam como percentual e observação. Torre ou encarregado que o SIPAV não conhece ficam de fora, com aviso. O que já está no SIPAV (mesma torre, atividade, data e encarregado) não é duplicado | eu, 02/10 |
| DEC-23 | **A importação entende o jeito que a obra escreve a planilha.** (1) **Intervalo de torres**: "0/2 A 5/1", "49/2 à 59/2" (com A, à, até ou ao) viram todas as torres da linha entre as duas, inclusive as duas, na ordem do trecho — é como o lançamento de cabo é escrito, e a planilha de 05/10 tem umas 70 células assim. (2) **Dupla na coluna do encarregado**: "PAULO / RAIMUNDO" são dois encarregados na mesma programação; a aspa que sobra no começo é desprezada. (3) **Anotações que não são torre** (FERIADO, FOLGA DE CAMPO, MUDANÇA PARA…, PÓRTICO, FASE A/B/C) saem num aviso só, em vez de uma linha por texto como "torre que não existe". **FOLGA DE CAMPO**, **MUDANÇA DE MÁQUINA** e **MUDANÇA PARA <lugar>** viram dia sem atividade: a folga como folga de campo, a máquina como deslocamento, e a mudança para um lugar como *outro motivo* com o texto "Mudança para Igarité" (a planilha diz só para onde, e a mudança de trecho do SIPAV pede também de onde). Um registro por tipo, dia, motivo e equipe, mesmo que a anotação se repita em vários itens. Entram junto com as programações, e o Desfazer apaga os dois. Só vale para anotações que estejam nas linhas dos itens que o SIPAV programa; as de itens manuais não são lidas. **FERIADO** continua só como aviso | eu, 07/10 |
| DEC-24 | **Nome de encarregado que a importação não reconhece se escolhe na prévia.** A planilha usa só o primeiro nome ("BENEDITO", "PAULO"), e o SIPAV pode ter mais de um. Em vez de "cadastre e importe de novo", a prévia lista cada nome não reconhecido com uma lista dos encarregados (os parecidos marcados) e lê a planilha de novo com a escolha. Vale só para aquela leitura: a planilha seguinte pergunta de novo. Sem escolha, os lançamentos do nome ficam de fora. Para ajudar a escolher, cada nome mostra o que a planilha diz dele (atividades com a contagem, com quem trabalha, dias e algumas torres), e cada encarregado parecido na lista mostra o que já apontou neste trecho (`já fez: LANÇAMENTO DO CABO (12), REVISÃO (3)`), lido dos apontamentos de campo. **Quando o mesmo nome aparece em mais de uma atividade, a escolha é por atividade**: o Benedito do piloto do condutor pode não ser o do OPGW. Cada atividade ganha a sua lista; **escolher não lê nem programa nada**: a escolha só fica guardada, e o botão **Aplicar escolhas** é que lê a planilha de novo. Os nomes continuam na tela depois de aplicados, com a escolha marcada (✓), e dá para trocar e aplicar de novo. **Programar** fica barrado enquanto houver escolha sem aplicar, para o que se vê na lista ser o que vai ser gravado | eu, 07/10 |
| DEC-25 | **Anotações na célula da planilha.** (1) Texto sem torre ("PORTICO", "FASE B - PORTICO") **junto de torres na mesma linha** vira comentário nas programações dessas torres ("Pórtico · Fase B"); "IÇAMENTO DE CADEIA - 0/2" é a torre 0/2 com o comentário, e "0/2 A 8/1 FASE A" é o intervalo com "Fase A". (2) Texto sem torre **sozinho na linha** ("PREPARAÇÃO DE MATERIAIS PARA RETIRADA DE FLAMBAGEM", "FASE A - PORTICO") vira dia sem atividade da equipe, como *outro motivo*, com o nome da atividade do item no fim: explica o dia, já que não há torre para programar. (3) **FERIADO** vira dia sem atividade do tipo feriado (db/47), do trecho e sem encarregado, um por data; as telas marcam o dia e avisam ao programar nele. (4) **Torre inexistente com uma vizinha só** (16/2 sem existir, 16/1 existe): se a vizinha **não** está programada na mesma atividade, assume-se erro de digitação e vale a vizinha, com aviso; se já está, quem lançou achou que havia a 16/2 e programou outra coisa, e **não entra**. Com mais de uma vizinha, não se adivinha. (5) Duas duplas na mesma torre, dia e item são duas equipes e não se fundem; a torre em linhas de dois encarregados avulsos continua sendo um serviço só. O comentário só chega ao relatório da ISA na REVISÃO (DEC-20); nas outras atividades fica no SIPAV | eu, 08/10 |
| DEC-26 | **Comentário vai ao relatório em qualquer atividade; pórtico é card; mudança para um canteiro é mudança de trecho.** (1) A observação da programação sai na planilha entre parênteses depois da torre, em caixa alta, com o percentual antes: "0/2 (PÓRTICO · FASE A), 1/1 (50% · FASE A)". Isso **substitui a restrição da DEC-20** (só a revisão): tudo o que estiver na observação aparece para a fiscalização, então a observação é para o que deve ser visto. (2) O **pórtico** pode ser cadastrado como torre do trecho (PÓRTICO, km 0, no começo da linha) a partir da prévia da importação; com ele cadastrado, PORTICO e FASE A - PORTICO viram programação nele, com a fase de comentário. Sem ele, continua comentário nas torres do lado. (3) MUDANÇA PARA <canteiro> vira **mudança de trecho do encarregado** quando há canteiro com esse nome e um só outro canteiro atende o trecho (a origem); a prévia deixa escolher a origem quando há dúvida. Sem canteiro com esse nome ou sem origem, entra como outro motivo, com o texto. (4) PREPARAÇÃO DE MATERIAIS… sem torre continua dia sem atividade da equipe, com o item no fim | eu, 08/10 |
| DEC-27 | **Intervalo de torres na exportação, e mudança de trecho sem origem.** (1) Torres que vêm uma depois da outra na linha, com o mesmo percentual, os mesmos comentários e a mesma situação de cópia, saem como "2/1 À 5/2 (FASE A)", em qualquer atividade: de uma torre a outra, em lote. O mínimo é de **3 torres seguidas** (MINIMO_PARA_INTERVALO em isa.js); duas ficam como estão. O total do item continua somando cada torre. A importação lê o intervalo de volta (conferido em ida e volta). (2) A mudança de trecho do encarregado deixa de pedir o canteiro de **origem**: a planilha diz só MUDANÇA PARA <canteiro>. Passa a exigir o encarregado e o canteiro de destino; a origem é opcional. [db/48](../db/48-mudanca-sem-origem.sql). Com o canteiro cadastrado, a importação registra a mudança de trecho; sem ele, outro motivo com o texto | eu, 08/10 |
| DEC-28 | **Pórtico é opcional, um de cada ponta.** A primeira e a última torre de uma linha são pórticos, mas há trechos que pegam uma parte que começa no pórtico e não termina em outro. Por isso o trecho pode ter o **pórtico do começo** (PÓRTICO INICIAL), o **do fim** (PÓRTICO FINAL), os dois ou nenhum, cadastrados como torres de km 0 em *Cadastros → Pórtico do trecho* ou pela prévia da importação. Qual é qual vem da posição: antes da metade das torres é o do começo. Na importação, o PORTICO de uma linha da planilha vai para o pórtico da ponta de onde ficam as torres da linha; sozinho na linha, decide-se pelas outras torres da mesma equipe no mesmo dia. Se o trecho não tem o pórtico daquela ponta, o texto fica como comentário nas torres, e a prévia oferece cadastrar só a ponta que a planilha usa. Só se remove um pórtico sem programação nem apontamento (o banco apagaria junto). Na grade, o pórtico tem cartão próprio: contorno tracejado na cor de destaque, um raio no lugar do estágio e a ponta da linha (início ou fim), sem estágio nem estrutura, porque já está pronto e ninguém o monta; não entra na contagem de torres | eu, 08/10 |
| DEC-29 | **O cabo entra na chave da programação.** Nos trechos com para-raio e OPGW, a mesma torre recebe, no mesmo dia e com o mesmo encarregado, a mesma atividade duas vezes (bandolas, pilotinho, ancoragem, nivelamento): uma no para-raio e outra no OPGW. São dois serviços. A trava da db/29 os tratava como duplicata, e foi o que barrou 109 programações na primeira importação da planilha de 05/10 (a mensagem dizia *este encarregado já está nesta atividade, nesta torre e nesta data*). A chave passa a ser torre, atividade, data, encarregado **e cabo**, em dois índices (sem cabo e com cabo), porque enum não entra em índice como texto. [db/49](../db/49-cabo-na-chave.sql). A importação e a cópia de plano passam a conferir o cabo ao ver o que já existe. Não é caso de dividir em percentual: cada cabo é 100% do seu serviço | eu, 08/10 |
| DEC-30 | **Reimportar não pede as escolhas de novo.** Quem é o "BENEDITO" da planilha se descobre no que já está programado: a mesma torre, data, atividade e cabo já tem um encarregado, e é ele quem falta na linha (tirando os da linha que já se reconhecem). Vale por nome e atividade quando 80% ou mais dos casos apontam a mesma pessoa, e só quando há um nome a descobrir na linha. Aparece na prévia como escolha marcada com `↺ do que já existe`, e dá para trocar ou mandar deixar de fora. A escolha explícita da prévia sempre vale mais. Não há memória entre semanas: uma planilha nova, sem nada programado, volta a pedir as escolhas | eu, 08/10 |
| DEC-31 | **Lançamento do pórtico à torre passa pelas do meio; e o cabo aparece no nome.** (1) Na planilha, "PORTICO, 0/2" no lançamento do cabo (x.x.3) é do pórtico até a 0/2: o cabo passa pela 0/1, e não se lança do pórtico à 0/2 pulando uma. A importação inclui todas as torres entre o pórtico e a última torre da linha, com a fase como comentário. Vale também para o **nivelamento** (x.x.4), que a obra confirmou ser do pórtico até a torre, passando pela 0/1 (08/10). Não vale para a **ancoragem**, que é só nas pontas. A fase escrita na torre ("0/2 (FASE A, B, C)") passa a valer para o trecho todo, pórtico e torres do meio. (2) Para-raio e OPGW seguem uma atividade só, com o campo cabo (DEC-10), mas a tela mostra o cabo no nome: LANÇAMENTO DO CABO PARA-RAIO e LANÇAMENTO DO CABO OPGW, e a visão Por Atividade separa as duas. É só o texto; separar em duas atividades de verdade seria migração de dados e voltaria à duplicação que a DEC-10 evitou | eu, 08/10 |
| DEC-32 | **A mesma atividade na mesma torre se divide em porcentagem.** Uma atividade que aparece na mesma torre em dois dias, ou com dois encarregados diferentes, não é feita inteira em cada um: 100% no dia 1 e 100% no dia 2 não existe. Na importação, a torre é dividida em partes iguais: 2 vezes, 50% e 50%; 3 vezes, 33,33, 33,33 e 33,34 (a última leva o resto, para a soma fechar 100). Se a planilha já traz o percentual ("61/1 (50%)"), vale o dela, e as outras dividem o que sobrou. Cabo diferente é serviço diferente, então para-raio e OPGW não se dividem entre si. Um encarregado em dupla (A / B) é uma programação só, não duas. **Exceção: a REVISÃO**, que volta à torre para a retirada de flambagem e a de pendências, e cada visita é uma etapa, não uma fatia. Vale para a importação; o lançamento à mão não divide sozinho | eu, 08/10 |
| DEC-33 | **As escolhas de encarregado ficam guardadas e o banco devolve tudo.** (1) O que a pessoa escolhe na prévia, e o que o sistema descobre pelo que já está programado, fica guardado por trecho **neste navegador** e volta na próxima importação, marcado com ✓, para trocar se quiser. A primeira importação depois de uma limpeza geral ainda pede as escolhas uma vez: não há de onde tirar. (2) O Supabase devolve no máximo **1000 linhas por consulta, sem avisar**; com 1.050 programações a tela mostrava 1.000. As consultas de programação, apontamento e histórico agora vêm em páginas de 1000 até acabar. (3) O histórico carrega página a página até ter cartões suficientes (ou 8.000 linhas), e as linhas de cada cartão só são desenhadas quando ele é aberto | eu, 08/10 |

> **DEC-7 revoga a DEC-3 e corrige o `06-correcoes.sql`.** O que se junta à revisão é
> a flambagem, não o giro e prumo. Saldo: a lista do SIPAV vai de 28 para 33
> atividades. Migração em [`db/21-cadeia-isa.sql`](../db/21-cadeia-isa.sql).

## 7. Em aberto

| # | Assunto | Trava o quê |
|---|---|---|
| P2 | Apresentar o catálogo unificado à fiscalização (DEC-11). Enquanto isso não acontece, o exportador localiza a linha pelo código **e** pelo nome, para funcionar também nas planilhas atuais | Nada. É transição, não bloqueio |
| P3 | `INSTALAÇÃO DE SINALIZAÇÃO` é um item no SIPAV e três no ISA (sinalizador de estais, avifauna, placas). Por ora o exportador escreve nos três | Nada |
| P4 | O sinalizador de estais é instalado na torre e poderia sair bem antes do condutor, mas o Alessandro listou sinalização por último. A dependência ficou em `GRAMPEAÇÃO DOS CONDUTORES` até alguém corrigir | Nada. Só a regra de bloqueio |
| P5 | ~~`LANÇAMENTO CONDUTOR 100%` deveria depender de `GIRO E PRUMO`?~~ — resolvido pela DEC-13 | — |
| P6 | ~~Bandolas do para-raio/OPGW e do condutor são duas etapas?~~ — resolvido pela DEC-14 | — |
| P7 | ~~Lista preliminar da seção técnica~~ — **superada pelas planilhas oficiais de 28/09 (DEC-16).** Resolveu: 4.1/4.2 como OPGW direito/esquerdo (DEC-17), `RECUPERAÇÃO DE ACESSO` e `SUPRESSÃO DE PRAÇA DE LANÇAMENTO` (DEC-18) | — |
| P8 | `PERFURAÇÃO DE TUBULÃO` não tem linha em nenhuma das quatro planilhas oficiais (`2.1.20` e `2.1.21` não existem). A atividade continua no SIPAV, mas não vai para o relatório. O relato do exportador mostra "não existem nesta planilha" toda vez | Incluir as linhas na planilha, ou decidir que tubulão se escreve em outro item |
| P9 | `4.4.2` (avifauna) e `4.4.3` (placas) estão sem as linhas EXEC./PROG. nas quatro planilhas, com a nota "NÃO TEM APENAS EM BARRA CORRENTINA". A `INSTALAÇÃO DE SINALIZAÇÃO` só chega ao `4.4.1` | Nada. Quando as linhas existirem, o exportador passa a escrevê-las sem mudança |
| P10 | Programações antigas com `OPGW` ou `para-raio` nos trechos de dois lados não têm lado. Não foram convertidas, porque ninguém sabe de que lado eram. A tela pede o lado ao editar e o relatório aponta cada uma | Corrigir na tela, programação por programação |
