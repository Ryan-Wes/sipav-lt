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

## 30/09/2026

### Data no passado pede justificativa, e a justificativa tem campo — [WR]

O banco recusava programar para uma data que já passou, com a mensagem "Informe
uma justificativa". Nenhuma tela tinha onde informar. O lote até avisava que data
passada era "aviso, não bloqueio" — e o banco bloqueava. Eu tinha escrito um aviso
que prometia o que a regra não deixava.

A janela individual tinha a mesma armadilha: o campo de justificativa só aparecia
dentro do aviso de "fora da sequência", e data no passado não dispara esse aviso,
porque a consulta de precedência não conhece a regra de data.

**Por que coluna própria e não o campo que já existia:** o `override_motivo` desliga
a conferência de precedência junto. Quem justificasse uma data no passado ficaria,
sem saber, com a sequência sem fiscal. `justificativa_retroativa` libera só a data.

A exigência só vale quando a data está sendo **escolhida**: no insert, ou quando
muda no update. Corrigir o encarregado de uma programação da semana passada não é
escolher data no passado, e antes era recusado igual.

**Agora:** o campo aparece assim que a data é escolhida, nos quatro caminhos — janela
da torre (adicionar e editar), lote e editar em lote. Fica no histórico. `db/36`.

### O desfazer do editar em lote parou de mentir — [WR]

Engolia qualquer erro e dizia "N programação(ões) devolvida(s)" mesmo quando nenhuma
tinha voltado. Agora conta e diz: "2 de 3 voltaram. 1 não pôde: …". Quando a volta é
para uma data do passado, a justificativa registrada é o próprio desfazer.

### Arrastar para reordenar as atividades — [WR]

Atividade nova entrava no fim da lista, e a lista é a ordem em que elas aparecem ao
lançar. Uma "recuperação de acesso" que devia ficar junto das supressões ficava lá
embaixo e atrapalhava cada lançamento.

O campo "ordem de execução" saiu do formulário: digitar o número era o que gerava
"essa ordem já é de outra atividade". A posição agora só muda arrastando, e a
atividade nova entra no fim.

O `reordenarAtividades` que já existia no código nunca foi chamado, e não
funcionaria: fazia um update por requisição, cada um numa transação, e a unique de
ordem não ajuda entre transações. Virou uma função no banco, tudo ou nada.

O banco confere que a lista está completa (se alguém mexeu enquanto eu arrastava,
recusa) e que nenhuma dependência virou: não deixa uma atividade ficar **antes** de
algo de que ela depende. Só recusa o que a troca nova estraga — dependência torta
que já existia não trava toda reordenação. `db/37`.

**Ordem de deploy:** a tela só manda `justificativa_retroativa` quando a data é do
passado. Mandar a coluna sempre, mesmo vazia, derrubaria toda gravação enquanto a
`db/36` não estivesse aplicada — e foi o que a primeira versão fazia.

**Efeito que vale saber:** a posição decide o que é "anterior" na importação de
estágio. Uma atividade obrigatória movida para o começo passa a ser marcada como
executada em toda torre importada com estágio depois dela. Se ela não acontece em
toda torre, marcar como condicional.

### Recriar atividade removida — [WR]

Remover só desativa, e o nome continua ocupado no banco. Criar de novo aparecia como
"já existe" sem nenhuma atividade à vista, e a saída era inventar um nome parecido.
Agora pergunto se quero a de volta, com o nome original e o histórico. A ordem
também falhava por outro lado: era calculada só com as ativas, e uma removida podia
ocupar o número.

O mesmo buraco do outro lado: quem inventou um nome parecido para escapar quer,
depois, o nome certo de volta, e a removida ainda o ocupa. Renomear a ativa para esse
nome pergunta se pode renomear a removida para "NOME (removida data)" — ela continua
existindo, a programação antiga continua apontando para ela.

### Atividade removida não bloqueia mais — [WR]

A tela de remover prometia "dependentes deixarão de exigi-la". Não era verdade: a
regra de bloqueio continuava cobrando a atividade removida, e torre nenhuma
conseguiria cumprir algo que nem aparece na lista. Achei lendo a remoção, não
vindo de ninguém. A regra passa a ignorar a removida, mas continua atravessando ela
para chegar nos pré-requisitos dela. `db/37`.

### Editar a cor funcionava — [WR]

Testei de ponta a ponta e a cor vai ao banco e aparece em tudo. O que existia era
um quadradinho de 34px que parecia enfeite. Ficou maior, com texto explicando, e com
as cores que a obra já usa para escolher num clique.

---

## 29/09/2026

### Avisar ao escolher, não ao gravar — [WR]

No lote, eu só descobria o que não ia entrar depois de clicar em Programar e
ler o relatório do que falhou — perdia o lançamento inteiro e voltava para o
começo. Agora a linha fica vermelha com o motivo enquanto eu ainda estou
montando, meio segundo depois de mexer. O botão "Conferir sequência" continua,
para forçar na hora.

### Atividade que não existe na torre não aparece na lista — [WR]

Autoportante não tem estai nem mastro central. A `db/33` barra na gravação, mas
oferecer o serviço e recusar depois é desperdiçar o tempo de quem lança. Agora a
lista de atividades da torre esconde o que não cabe naquele tipo.

### A lista de busca fecha — [WR]

Abrir a lista de atividades e desistir obrigava a escolher uma qualquer só para
poder fechar, e depois tirá-la. Agora fecha no X, no Esc e clicando fora dela —
inclusive dentro da própria janela.

### Clicar na linha do editar em lote abre aquela programação — [WR]

Vinte linhas na régua e uma fora dela: para ajustar essa uma, fechar o lote e ir
caçar a torre na grade era caminho longo demais. O clique na linha abre a janela
de sempre, com a programação já em edição.

### Apontamento de execução entra no histórico — [WR]

O histórico cobria a programação, que é plano; a execução, que é fato, ficava de
fora. Desfazer um apontamento fazia a linha sumir como se nunca tivesse
existido, e a medição da semana mudava sem ninguém saber por quê.

A carga inicial não entra: é escrita em bloco na importação, e cinquenta torres
virariam setecentas linhas de log que não dizem nada. `db/35`.


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
