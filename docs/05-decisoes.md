# Diário de decisões

O que foi decidido, quando, por quê, e o que mudou por causa disso.

As mensagens de commit contam a mesma história com mais detalhe técnico, mas
ninguém vai ler vinte commits para entender por que a escavação passou a exigir
o acesso. Aqui é o resumo que se lê de uma vez.

Uma entrada por decisão. A mais nova em cima. Toda decisão que muda regra,
fluxo ou cadastro entra aqui no mesmo commit que a implementa.

Legenda da origem: **[WR]** eu · **[AM]** Alessandro, do campo · **[REU]**
reunião de 22/09/2026 · **[PROT]** vinha do protótipo.

---

## 29/09/2026

### A escavação repartida estava sem dependência nenhuma — [WR]

`ESCAVAÇÃO - ESTAI` e `ESCAVAÇÃO - MC` não tinham um pré-requisito sequer no
banco. A `db/27` deveria ter criado o da área de torre; ou não criou, ou foi
apagado por um dos deletes que vieram depois — a `db/23` e a `db/24` também
limpam a tabela inteira antes de reinserir.

Era por isso que quatro torres de Juazeiro aceitaram escavação de estai sem nada
antes e sem justificativa: **não havia regra para violar**. O bloqueio nunca
falhou.

Junto com isso, a cadeia da escavação genérica tinha encolhido: a `db/04` dizia
"precisa das 3 supressões e do acesso", e a `db/21`, ao reescrever tudo no
formato da ISA, trouxe de volta só a área de torre.

**Agora:** as três escavações exigem acesso, corte seletivo, área de torre e
faixa. A `db/33` termina avisando por *notice* se alguma ficar com menos de
quatro pré-requisitos — nome que não bate aparece na hora, não semanas depois.

### Atividade pertence a um tipo de torre — [WR]

Autoportante tem quatro pés; estai e mastro central são de estaiada. Não existia
lugar no banco para dizer isso, então `ESCAVAÇÃO - ESTAI` cabia numa AUP.

**Agora:** `atividade.so_para_estrutura`. A regra usa nos dois sentidos — barra a
atividade que não existe naquele tipo, e para de cobrar pendência impossível
(escavação de estai numa autoportante). `db/33`.

### Carga inicial não repete execução — [WR]

`REVISÃO` aparecia duas vezes em quase toda torre de Buritirama, as duas da
carga inicial. Execução em dobro vira avanço em dobro no percentual da ISA, e é
do tipo que ninguém percebe olhando a grade.

Não reconstruí como aconteceu. **Agora:** índice único parcial em
`(torre_id, atividade_id) where carga_inicial`, e a importação deduplica antes
de gravar. Apontamento de campo continua podendo repetir — é o serviço repartido
em dois dias. `db/34`.

### Pré-requisito no mesmo dia libera — [AM] 25/09

Do Alessandro: *"Estou escavando e instalando o pré-moldado no mesmo dia.
Poderia até ter gente reaterrando na sequência."*

A regra exigia data **estritamente** anterior, o que descreve uma obra que anda
uma atividade por dia por torre — e não é a obra. A execução já era tratada com
`<=`; só a programação ficou mais dura que a realidade.

**E eu tinha contornado pelo lado errado:** inventei um campo de "+N dias" na
tela para empurrar a segunda atividade e caber na regra. Forcei a mão do usuário
para acomodar uma premissa minha. `db/30`.

### Não programar uma atividade depois de quem depende dela — [WR]

A regra só olhava para trás. Se alguém que depende de A já estava programado
para antes de A, passava calado — e é exatamente a ordem em que se programa de
verdade: lanço a escavação da semana, depois lembro do acesso e lanço para a
semana seguinte. `db/31`.

### Saber o que já foi aplicado no banco — [WR]

Até aqui, a única coisa que dizia quais migrações estavam aplicadas era a minha
memória. A `db/24` já precisou de um `raise exception` conferindo à mão se a
`db/23` tinha rodado.

**Agora:** tabela `migracao`. Cada arquivo novo se registra, e duas consultas
respondem o que falta. `db/32`.

### O "+N dias" saiu, e a data ficou visível — [WR]

O campo `+ 0` no chip não dizia nada — eu mesmo abri a janela e não entendi o
que era. Na janela de uma torre, cada atividade passou a ter a sua data, com o
dia da semana. No lote, cada torre e atividade viraram uma linha com data,
encarregado e percentual próprios: vinte torres e duas atividades são quarenta
linhas, porque são quarenta programações.

A conferência passou a travar a linha e não a torre inteira.

### Repetir uma sequência virou "copiar as datas" — [WR]

A primeira versão era um caminho separado, que começava pela atividade antiga
para chegar na nova. Ninguém entendia de onde saíam as torres, nem eu.

**Agora:** marco as torres, escolho a atividade, e "Copiar de outra atividade"
preenche as datas — ao lado de "Mesma data em todas" e "Uma torre por dia". É só
mais um jeito de preencher a data.

### Apagar saiu de dentro do "Editar" — [WR]

Existia como "remover marcadas" dentro da janela de edição. Quem quer apagar não
abre uma janela chamada Editar para procurar. Virou botão próprio na barra, com
a lista do que vai sumir e caixinha para desmarcar antes de confirmar.

Nos painéis por data, encarregado e atividade, cada programação ganhou lixeira,
e a seleção em massa só liga no "Selecionar vários".

### Conferir antes de importar — [WR]

A importação mexe em torre, km, canteiro e estágio de uma vez, e o estágio
reescreve a carga inicial. Já mordeu: entraram dezenas de canteiros com nome de
número por causa de uma vírgula usada como separador.

**Agora:** o botão é "Conferir". A prévia lê tudo, compara com o que existe e
não escreve nada. Estágio desconhecido e separador errado nem chegam a ter botão
de importar.

### D4 — escavação em partes e o reaterro: fica como está — [WR]

Retomado depois de adiado em 25/09. A saída certa é a regra por tipo de torre,
mas ela depende de saber se autoportante tem mastro central, e ninguém do campo
confirmou. Segue com o override. Detalhe em [03-backlog](03-backlog.md#d4).

### Clicar fora não fecha mais janela — [WR]

Com formulário grande, um clique que escapa do campo jogava fora tudo o que
estava preenchido. Fecha no X e no Esc. De quebra, o Esc passou a agir na janela
de cima: com a confirmação aberta sobre a torre, ele fechava a de trás e deixava
a pergunta pendurada para sempre.

### Dia da semana em todo lugar que mostra data — [WR]

A obra se guia por dia da semana. "01/10" sozinho manda olhar o calendário.

### Semanal e quinzenal no Por Encarregado — [WR]

Dentro de cada encarregado, separado por semana, com o nome que a gente usa: a
semana de hoje é **SEMANAL**, a seguinte é **QUINZENAL**. O que cai fora das duas
leva a data, sem apelido inventado.

### Percentual da escavação por parte, sem ordem — [WR] [AM]

Autoportante: pé A, pés A B, pés A B C, pés A B C D — os pés têm nome em campo.
Estaiada, escavação inteira: 1 a 5 partes, com a nota de que as partes são os
quatro estais e o centro, **em qualquer ordem**. A primeira versão dizia
"+ centro" no fim, como se o centro fosse sempre o último, e não é.

### Selecionar torres arrastando — [WR]

Uma torre por clique são trinta cliques para uma frente inteira, e dá para pular
uma sem perceber. Clico num cartão, seguro e arrasto pelos outros. Com Alt,
desmarca.

---

## 25/09/2026

### A planilha da ISA é sintoma, não especificação — [AM]

Sete premissas tiradas da leitura das planilhas caíram, uma a uma, quando o
Alessandro olhou: flambagem vai com a revisão; pilotinho é do para-raio e piloto
é do condutor; bandola do condutor é serviço separado; fabricação de pré-moldado
não se programa, instalação sim; grampeação e ancoragem são apontadas separadas.

**Regra que ficou:** antes de escrever migração que mexa em dependência, ordem ou
nome de atividade, a pergunta vai para quem está na obra — em linguagem de obra,
sem citar o sistema. Detalhe em [04-relatorio-isa](04-relatorio-isa.md).

### Escavação em três: estai, mastro central e a genérica — [AM]

`db/27`. A decisão sobre o que libera o reaterro ficou pendente (D4).

### Vários encarregados no mesmo serviço — [WR]

Dividir a atividade entre equipes no mesmo dia é rotina. O banco passou a
aceitar, com aviso e confirmação explícita: lançar em cima sem perceber também
acontece. `db/29`.

### Percentual por torre na programação — [WR]

Uma atividade pode levar mais de um dia na mesma torre. A soma dos percentuais
vira a coluna TOTAL do relatório da ISA, e por isso passar de 100% é recusa, não
aviso. `db/28`.

### Restrição com início e prazo indefinido — [WR]

Restrição sem previsão de liberação é o caso comum: fundiária que não se sabe
quando sai.

---

## Antes de 25/09

As decisões da fundação — modelo de dados, cadeia de atividades, RLS por papel,
bloqueio por precedência — estão em [01-contexto](01-contexto.md) e
[02-analise-prototipo](02-analise-prototipo.md). As do relatório da ISA, com as
quinze decisões numeradas, em [04-relatorio-isa](04-relatorio-isa.md).
