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

Quando mais de um encarregado divide a mesma linha, o nome vem separado por ` / ` e
**cada célula do dia traz o mesmo número de pedaços, na mesma ordem**:

```
J: ALIELTON / EDUARDO / CELSO
K: 259/2  /  282/2  /  263/2, 264/1
L: 261/1  /  282/1  /  264/2, 265/1
```

Convenções observadas:

- Domingo (coluna Q) é sempre `DSR`.
- Dia sem serviço é `-`.
- Texto livre substitui a torre quando é o caso: `FERIADO`, `FOLGA DE CAMPO`,
  `MUDANÇA PARA IGARITÉ`, `APOIO REATERRO ESTAI`, `MUDANÇA DO GUINDASTE PARA WANDERLEY`.
- Complemento entre parênteses depois da torre: `74/2, 73/2 (RETIRADA DE FLAMBAGEM)`,
  `286/1 PÉ A, D`, `49/2 À 59/2 (4KM)`.
- `R` (total semanal) é digitado à mão e às vezes é fracionário (`2.5`, `3.5` em
  montagem — meia torre).

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

Ou seja, projetos de cabo-guarda diferentes — um trecho com para-raio convencional de
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

Barra II – Correntina detalha o mastro em três alturas (1,80 / 2,30 / 2,80) e os
outros não; Campo Formoso e Juazeiro agrupam as vigas em `Solo I & II` e
`Solo III & IV`. **Decidir qual granularidade vale para todos.**

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

Mesma estrutura de nove itens nas duas seções. `4.1` = para-raio, `4.2` = OPGW —
sujeito à confirmação de engenharia descrita acima.

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

| SIPAV | Item ISA | Observação |
|---|---|---|
| ABERTURA DE ACESSO | 1.2.3 | |
| CORTE SELETIVO | 1.3.3 | |
| SUPRESSÃO DE ÁREA DE TORRE | 1.3.1 | |
| SUPRESSÃO DA FAIXA | 1.3.2 | |
| ESCAVAÇÃO | 2.1.4 + 2.1.5 | 2.1.5 só para EST |
| PERFURAÇÃO EM ROCHA | 2.1.6 + 2.1.7 | 2.1.7 só para EST |
| INJEÇÃO DE NATA | 2.1.8 + 2.1.9 | 2.1.9 só para EST |
| INSTALAÇÃO DE PRÉ-MOLDADOS | 2.1.10 + 2.1.11 | 2.1.11 só para EST. Absorve `PREPARAÇÃO` — ver **DEC-2** |
| CONCRETAGEM / TUBULÃO | 2.1.12 + 2.1.13 | 2.1.13 só para EST |
| REATERRO 100% | 2.1.16 + 2.1.17 | 2.1.17 só para EST |
| TESTE DE ARRANCAMENTO | 2.1.18 | |
| ATERRAMENTO / CONTRAPESO | 2.2.1 | |
| MEDIÇÃO DE RESISTÊNCIA | 2.2.3 | |
| PRÉ-MONTAGEM | 3.1.1 (EST) · 3.2.1 (AUP) | |
| MONTAGEM | 3.1.3 (EST) · 3.2.2 (AUP) | |
| REVISÃO EM SOLO | 3.1.2 | nova — ver **DEC-3** |
| REVISÃO FINAL | 3.1.4 (EST) · 3.2.3 (AUP) | nova — ver **DEC-3** |
| GIRO E PRUMO | 3.1.5 | nova — ver **DEC-3** |
| INSTALAÇÃO DE BANDOLAS | 4.1.1 + 4.2.1 | |
| LANÇAMENTO DO PILOTO | 4.1.2 + 4.2.2 | |
| LANÇAMENTO DO CABO OPGW/PR | 4.1.3 + 4.2.3 | |
| NIVELAMENTO OPGW / PARA-RAIO | 4.1.4 + 4.2.4 | |
| GRAMPEAÇÃO E ANCORAGEM OPGW / PARA-RAIO | 4.1.5 + 4.1.6 + 4.2.5 + 4.2.6 | uma vira quatro |
| LANÇAMENTO CONDUTOR 100% | 4.3.3 | |
| NIVELAMENTO DOS CONDUTORES | 4.3.4 | |
| GRAMPEAÇÃO E ANCORAGEM DOS CONDUTORES | 4.3.5 + 4.3.6 | |
| INSTALAÇÃO DE ACESSÓRIOS | 4.3.7 + 4.3.8 + 4.4.1–4.4.3 | **ver Q5** |
| PERFURAÇÃO DE TUBULÃO | — | **não existe no ISA** — ver Q2 |
| FLAMBAGEM | — | hoje vira texto `(RETIRADA DE FLAMBAGEM)` dentro de 3.1.4 |

### Itens do ISA que o SIPAV não programa

Confirmado com o Wesley em 24/09: **topografia, sondagem, armação, canteiro e
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
   coluna J com os encarregados separados por ` / `, colunas K–P com as torres do dia
   na mesma ordem dos encarregados, coluna Q com `DSR`, coluna R com a contagem.
5. **Reexibe a linha que preencheu** e oculta as que ficaram sem programação no
   período — é o que hoje se faz à mão.
6. Não encosta na linha `EXEC.`, nem nas colunas S–V, nem no cabeçalho, nem no
   rodapé, nem no bloco auxiliar.
7. Devolve um arquivo novo para baixar — o original nunca é sobrescrito.

Fora de escopo por ora: a linha `EXEC.` (depende do apontamento de campo, item **F5**
do backlog) e os itens em KM, que precisam de quantidade e não de contagem de torre.

---

## 6. Decisões tomadas

| # | Decisão | Quem / quando |
|---|---|---|
| DEC-1 | Topografia, sondagem, armação, canteiro e comissionamento não são planejados. Permanecem manuais | Wesley, 24/09 |
| DEC-2 | `PREPARAÇÃO` é absorvida por `INSTALAÇÃO DE PRÉ-MOLDADOS` no SIPAV, que é o que a linha do ISA já junta. Migração é segura: nada depende de `PREPARAÇÃO` e as duas dependem de `ESCAVAÇÃO` | Wesley, 24/09 |
| DEC-3 | `REVISÃO / GIRO E PRUMO` é desmembrada em três, iguais ao ISA: `REVISÃO EM SOLO`, `REVISÃO FINAL`, `GIRO E PRUMO`. `FLAMBAGEM` continua separada e vai como texto dentro de `3.1.4` | Wesley, 24/09 — **confirmar com o Alessandro**, ver A2 |
| DEC-4 | Unidades: Corte Seletivo = `TORRE`, Seccionamento e Aterramento de Cercas = `KM`, Transporte de Estrutura = `TORRE` | Wesley, 24/09 |
| DEC-5 | O exportador gerencia a visibilidade das linhas | Wesley, 24/09 |

> **DEC-3 contraria o que o Alessandro disse antes.** No áudio da cadeia de
> atividades ele tratou "revisão, giro e prumo" como uma coisa só e a flambagem como
> outra — foi por isso que o SIPAV ficou com `REVISÃO / GIRO E PRUMO` numa atividade.
> A planilha da ISA separa em três. Confirmar antes de migrar.

## 7. Em aberto

### Com o Alessandro

| # | Pergunta |
|---|---|
| A1 | `PERFURAÇÃO DE TUBULÃO` é a mesma coisa que `2.1.6 Perfuração em Rocha / Cravação de Estacas`, ou é serviço diferente que precisa de linha própria? |
| A2 | Revisão em solo, revisão final e giro e prumo são três apontamentos separados em campo ou um só? (ver DEC-3) |
| A3 | `INSTALAÇÃO DE ACESSÓRIOS` cobre jumper (`4.3.7`), espaçadores (`4.3.8`) e sinalização (`4.4.1`–`4.4.3`). Vale separar ou o pessoal aponta tudo junto? |
| A4 | Fabricação de pré-moldado: detalhar mastro por altura e viga por solo (como Barra–Correntina) ou agrupar (como Campo Formoso e Juazeiro)? |
| A5 | Padronizar as quatro planilhas precisa de aval da fiscalização ou é decisão interna? |

### Parado por falta de informação

| # | Assunto |
|---|---|
| P1 | `4.1` é para-raio convencional e `4.2` OPGW (Barra–Correntina), ou `4.1` OPGW direito e `4.2` OPGW esquerdo (Buritirama)? Wesley levantou que **a configuração muda ao longo do trecho**, por faixa de torre — o catálogo pode precisar das duas seções convivendo, e o de-para pode ter que olhar o número da torre. Levantar com a engenharia |
