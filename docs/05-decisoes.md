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

## 09/10/2026

### Repetir o último traz a data; Enter confirma a janela — [WR]

Na torre, "Repetir o último" agora preenche a data do último lançamento junto
com o resto, como já fazia no lote. Quem lança uma sequência de torres quase
sempre está no mesmo dia, e a data continua no campo para mudar antes de
adicionar.

O Enter confirma a janela aberta, do mesmo jeito que o Esc fecha: na torre
adiciona a programação (só com o cursor num campo do formulário, e só se o
botão estiver habilitado), na confirmação aperta o botão de confirmar e nas
janelas com ação aperta a última ação. Janela que só tem "Fechar" não reage ao
Enter. Ficam de fora botões, listas de busca, a observação da torre e campos de
texto grande, que já têm o Enter deles.
## 08/10/2026

### Histórico: alteração em massa vira um cartão — [WR]

Importar mil programações enchia o painel de *Últimas alterações* com mil linhas. As alterações de mesma ação e mesma pessoa, cada uma até 3 minutos depois da anterior, e só quando passam de 3, viram um cartão: *Wesley programou 935 programações de uma vez*, com a origem (a importação da ISA e o arquivo), as datas, as torres e o trecho, e a lista inteira dentro, fechada. O banco continua gravando uma linha por alteração, e o painel passa a carregar as 2.000 últimas. Alteração feita direto no banco (SQL) aparece como *Direto no banco*, em vez de *desconhecido*.

### Painéis de todos os trechos, + por dia e quem falta — [WR]

Um encarregado pode passar uma semana num trecho e a outra em outro, e olhando só um trecho os dias dele pareciam vazios sem estarem. As visões **Por Data, Por Encarregado, Por Atividade e Dias sem atividade** passam a começar com **Todos os trechos**, com a opção **Só este trecho** ao lado dos filtros (a escolha fica guardada no navegador). Cada programação de outro trecho leva o nome do trecho. A grade geral e o planejamento salvo continuam sendo do trecho aberto. Limites: abrir ou editar uma torre de outro trecho pede para trocar de trecho antes, e o ✓ de feito só aparece para o trecho aberto.

No painel do encarregado, cada dia da semana ganhou um **+** embaixo da última atividade (ou sozinho, se o dia está vazio) que abre o lançamento já no encarregado e no dia; a data fica junto do dia da semana, com o **FERIADO** no canto; e o topo avisa **quais encarregados estão sem programação** no período. O aviso é uma linha só, cortada ("7 encarregados sem programação em 12/10 a 18/10: Alielton, Altieres…"), e a seta abre a lista inteira. Cada bloco de encarregado mostra sempre todas as semanas do período (o semanal e o quinzenal), mesmo as vazias, cada dia com o seu +. O + abre o lançamento já no encarregado e no dia, e **toda torre que entra na lista já nasce nesse dia**, sem precisar de "Mesma data em todas"; se o dia do campo mudar, as torres seguintes seguem o novo. Clicar num nome abre o espaço dele mais abaixo, na ordem alfabética, com as semanas do período em branco e um + em cada dia para lançar do jeito que quiser; o botão Fechar tira o espaço enquanto ele estiver vazio.

### Feriado marcado no calendário — [WR]

A planilha da ISA traz FERIADO nas células, e a obra precisa saber que naquele dia não se programa. Entrou como um quinto tipo de dia sem atividade (`db/47`), do trecho e sem encarregado, que se registra pela janela de **Dias sem atividade** (com *Até o dia*) ou vem da importação. Os painéis marcam o dia (**FERIADO** no título do dia em Por Data e na coluna do dia em Por Encarregado), a data de lançamento mostra  · FERIADO, e registrar feriado num dia com programação pergunta antes. Não bloqueia programar: avisa.

### Importação: anotações, torres digitadas errado e encarregado novo — [WR]

Regras em [04-relatorio-isa](04-relatorio-isa.md), DEC-25. Na prévia, o nome de encarregado que o SIPAV não conhece ganhou o botão **+ Novo**: abre o nome para editar e cadastra na hora, e a leitura continua com ele.

---

## 07/10/2026

### Importar da ISA grava como está na planilha — [WR]

A planilha da ISA registra o que foi decidido em outro dia. Quando importo a da sexta, o status das
torres já andou, e a sequência de hoje não vale para ontem. Pedir motivo linha a linha seria
trabalho sem informação nova. A prévia ganhou uma caixa, marcada de partida: **gravar como está na
planilha, sem barrar por sequência**. O motivo *Importado do relatório da ISA (arquivo)* entra
sozinho em cada programação, e o Desfazer continua valendo. As travas do dia a dia
(lançar pela tela, em lote, copiar plano) não mudam. Desmarcar a caixa devolve o comportamento
anterior: o que a sequência barrar volta num relato, com *Programar mesmo assim*.

### Aba Dias sem atividade — [WR]

Mudança de trecho, deslocamento de máquina, folga de campo e dia sem atividade
apareciam só espalhados nos painéis, cada um no seu dia. Faltava ver o conjunto: por
exemplo, quantas folgas um encarregado teve no mês. A aba **Dias sem atividade** lista tudo
do trecho no período do filtro, com um resumo por encarregado (dupla conta para os dois)
e filtro por tipo e por encarregado. Clicar no nome do encarregado no resumo filtra a
lista; clicar numa linha abre a movimentação para editar ou apagar. Não obedece ao
filtro de atividade, canteiro nem à busca, porque movimentação não é nenhuma dessas
coisas. Não aparece na Grade Geral, que é por torre.

**O nome.** Folga não é movimentação, e mudança de trecho também não é um dia de atividade.
O que junta os quatro tipos (mudança de trecho, deslocamento de máquina, folga de campo e outro
motivo) é o dia sem atividade na torre. O botão, a aba e a janela passaram a se chamar **Dias sem
atividade**. É só o texto da tela: a tabela e o código continuam com o nome antigo, movimentacao,
para não mexer no banco por causa de um rótulo.

**Até o dia.** Uma folga de campo costuma durar vários dias seguidos. Ao registrar (não ao
alterar), o campo **Até o dia** cria um registro por dia, de uma vez só: entram todos ou nenhum.
Teto de 31 dias, para uma data digitada errada não criar centenas de registros. Se o encarregado
tiver programação em algum desses dias, a janela avisa antes de registrar.
### O plano da sexta é o compromisso; a programação viva pode mudar — [WR]

Planejo na sexta (02/10) o semanal (05 a 10/10) e o quinzenal (12 a 17/10). Na
sexta seguinte, o que eu tinha programado para 12/10 pode ter mudado: não deu para
bater a meta, houve reajuste no meio da semana, ou outro motivo. Mesmo assim preciso
saber o que foi prometido para aquela data, para ver se os encarregados estão
batendo a meta. Por isso o planejamento salvo em `db/46` é o compromisso, e a programação
viva continua livre para mudar. Nada de etiqueta em cada programação: o histórico é o
planejamento salvo, comparado depois com o que foi apontado.

**Vale a última salva da semana.** Nem sempre dá tempo de fechar na sexta: ajusto no
sábado, no domingo, na segunda ou, no limite, na terça, para entregar as programações.
Cada ajuste é um salvar novo. Na lista, o mais recente de cada semana leva o selo
**Oficial**, os anteriores ficam como **Versão anterior**, e o que foi salvo depois que
a semana já tinha começado leva o selo **Ajuste**, com o dia da semana. Não trava
salvar em data nenhuma. Para comparar com o plano original, uso a versão anterior.

Três peças saíram dessa regra, todas sobre a mesma tabela `planejamento_semanal`,
sem migração nova.

### Planejar do zero — [WR]

Em **Planejamentos → Planejar uma semana** escolho o semanal (o padrão é a segunda
que vem, a partir de quinta) e o quinzenal vem junto. A grade abre com todas as
torres e o estágio atualizado, e as programações que já existem nessas duas semanas
ficam escondidas, para eu montar o plano limpo sem apagar nada. Uma banda no topo
deixa mostrar as escondidas e tem o botão **Terminar o planejamento**: continuar,
sair sem salvar, ou salvar o planejamento e sair.

- Escondidas são só as que existiam quando comecei. O que eu lançar depois aparece.
- O planejamento salvo no fim leva só o que lancei depois de começar: as escondidas ficam de fora dele, mas continuam na programação viva.
- Sair sem salvar não perde nada: a programação viva nunca foi mexida.

### Copiar de um plano salvo — [WR]

O que o plano previa e não saiu vai para a semana seguinte. **Copiar** leva o plano
para outra semana, com todas as datas andando o mesmo número de semanas: o que era
quarta continua quarta. O padrão é só a pendência (não feita ou parcial); dá para
copiar tudo e escolher entre semanal e quinzenal. O que já existe (mesma torre,
atividade, data e encarregado) aparece como "já existe" e não duplica. Datas que já
passaram pedem o motivo, igual a qualquer lançamento no passado. Passa pelo mesmo
caminho da importação da ISA: em ordem, com a sequência conferida, e com Desfazer e
"Programar mesmo assim" no relato final.

### Meta × realizado — [WR]

O botão **Meta** do plano salvo compara o que ele prometeu com o que foi apontado
desde a segunda-feira do plano e com o que está programado hoje, por encarregado e
por semana. Cada programação do plano cai em um estado:

| Estado | Quando |
|---|---|
| No prazo | feita até a data prometida |
| Feita atrasada | feita depois |
| Feita, sem data | conferida pelo status da planilha, sem data para comparar |
| Parcial | saiu parte do percentual |
| Reprogramada | não saiu e hoje está em outra data |
| Não feita | a data passou e não saiu |
| A vencer | a data ainda não chegou |
| Retirada | não saiu e já não está programada |

**% feito** = feitas ÷ vencidas. **% prazo** = feitas no prazo (e sem data) ÷ vencidas.
A vencer e retirada ficam fora da conta, mas aparecem nas colunas para o total fechar.

- Casa por torre e atividade, não pelo id da programação: reajustar o plano às vezes
  apaga e lança de novo.
- Dupla de encarregados conta para os dois.
- Só vale execução a partir da segunda do plano; o que foi feito antes não era meta.
- Retirada fica fora do percentual de propósito, mas a coluna existe: se alguém tira
  muita coisa do plano, isso precisa aparecer, não sumir da meta.

---
## 01/10/2026

### Escavação por parte: marcar quais pés, em qualquer ordem — [WR]

Os atalhos eram "pé A", "pés A B", "pés A B C", "pés A B C D": só dava para
programar em sequência. Na obra o pé A e o C saem antes do B. Troquei por botões
A, B, C e D que se marcam em qualquer combinação, e o percentual sai da conta
(cada parte vale a mesma fatia: 25% nos pés e nos estais, 20% na estaiada com o
mastro central).

- **As letras ficam gravadas** (`db/40`, coluna `programacao.partes`, ex.: `A,C`).
  Só o percentual não dizia quais partes eram, e nada impedia programar o pé A
  duas vezes e esquecer o D.
- **Parte já programada aparece riscada** com a data, e não se marca de novo.
  Para mudar, altera-se a programação que já a tem.
- **Percentual digitado à mão** vale, e a marcação sai: ela não pode mentir sobre
  o que o número cobre.
- **No cartão:** "50% · A C" quando se sabe quais são.
- **Sem a db/40** a tela funciona: grava só o percentual e avisa, no próprio
  seletor, que as letras não ficam gravadas.

**Não mudou:** a regra de bloqueio continua tratando escavação parcial como
cumprida (R18/D4). Saber quais pés foram feitos não a torna mais rigorosa.

**Fora do escopo:** editar em lote e programar vários pela seleção não carregam as
letras. O mastro central sozinho (`ESCAVAÇÃO - MC`) segue sem partes.
### O status importado confere o que estava programado — [WR]

A importação do status do Alessandro só trocava o estágio da torre. A 1/2 estava
programada para MONTAGEM em 30/09, a planilha dizia "montada", e a programação ficava
pendente como se nada tivesse acontecido. Agora a prévia da importação (`Importar
torres`) tem uma lista: **"Programações que o novo status cobre"**. Marcadas, viram
**executadas**.

- **O que "cobre".** O estágio da torre é a atividade informada mais todas as
  obrigatórias anteriores da cadeia. Uma programação dessa torre, de uma atividade
  nesse conjunto, aconteceu. Ficam de fora: a já apontada, a solicitada que ainda não
  foi aprovada, e as condicionais (perfuração, tubulão), que a planilha não diz se a
  torre levou.
- **Sem data de execução** (decisão do Wesley, 02/10). A planilha diz que está feita, não
  quando; inventar uma data faria a meta parecer cumprida ou atrasada sem ninguém
  saber. A execução entra ligada à programação e ao percentual dela, com a marca
  `por_status` (`db/45`). O cartão mostra o ✓ ("data não informada, conferida pelo
  status da planilha"), e a aderência a chama de `EXECUTADO SEM DATA`: sem data não
  há prazo.
- **Programação para depois de hoje** vem **desmarcada**. Se a planilha já diz que está
  feita e estava marcada para a semana que vem, quase sempre é plano desatualizado
  ou status errado, e vale olhar antes de conferir.
- **Busca no trecho inteiro**, não na tela: o filtro de período deixaria de fora
  justamente as programações das semanas anteriores.
- A precedência passou a contar a execução sem data como cumprida (`db/45`); antes a
  condição `data_execucao <= data` nunca era verdadeira para uma data nula.

### Planejamento semanal salvo — [WR]

A obra planeja toda sexta o **semanal** (a semana que começa) e o **quinzenal** (a
seguinte). A programação viva muda ao longo dos dias, e o que foi planejado numa sexta
se perdia. O botão **Planejamentos** (`db/46`) guarda uma **foto**: o estágio de cada
torre e as programações do semanal e do quinzenal naquele momento.

- **Foto, não programação.** Não conflita com a programação viva nem com as outras
  fotos (a mesma torre pode ter a mesma atividade na mesma data em duas fotos), e a
  viva continua editável. Decisão do Wesley: foto salva por um botão, em vez de
  etiqueta automática em cada programação.
- **Semana.** Escolhe-se um dia; vale a segunda-feira dele (semanal) e a seguinte
  (quinzenal). Pode haver mais de uma foto da mesma semana (versões), cada uma com a
  hora e quem salvou.
- **Revisitar.** `Ver` abre a foto: a tela inteira (grade, por data, por encarregado,
  por atividade) mostra as torres com o **estágio de então**, inclusive as sem
  programação, e as programações como estavam. Uma banda no topo diz que é só
  consulta; tudo o que altera programação fica bloqueado, e o que chega do banco não
  sobrescreve a foto. `Voltar ao planejamento atual` recarrega a viva.
- **Quem.** Salvam e apagam administração e planejamento; todo mundo vê.
- **Semanal e quinzenal de…** é uma opção nova no filtro de período, sobre a programação
  viva: escolhe um dia e mostra a semana dele e a seguinte, inteiras, com todas as
  torres na grade.
### Importar a programação da planilha da ISA — [WR]

A programação da sexta nasce na planilha, e lançá-la de novo no SIPAV, torre por torre,
levava horas. Menu Exportar > `Importar programação da ISA`: sobe a planilha do
trecho, o SIPAV lê a semanal e a quinzenal, mostra uma **prévia** do que vai lançar e só
cria depois de confirmar. Detalhes em DEC-22 (`docs/04-relatorio-isa.md`).

- **Dias que já passaram** pedem o motivo (o banco exige): vem preenchido com `Importado
  do relatório da ISA (arquivo)`, editável.
- **Sequência.** Cria em ordem de data e de execução, como o lote, para o que a própria
  planilha traz entrar na ordem certa. O que a precedência ainda recusar volta num
  relato, com o motivo; escrevendo um motivo, `Programar mesmo assim` lança essas.
- **Desfazer** apaga tudo o que a importação criou.
- **Idempotente.** Rodar de novo com a mesma planilha não duplica: a chave é torre,
  atividade, data e encarregado.

**Limites.** Só os itens do catálogo (os preenchidos à mão, em KM, não são lidos). Se
uma programação já lançada à mão tem o mesmo serviço mas outro encarregado, a
importação cria a da planilha ao lado: a conferência é por chave exata. O nome do
encarregado na planilha tem que bater com o cadastro (ou ser uma abreviação
única).

### Por Encarregado: a semana em colunas de dia — [WR]

O bloco de cada encarregado mostrava os cartões em sequência, e achar o dia era ler a
data de cada um. Agora cada semana (Semanal, Quinzenal…) tem uma faixa fixa de dias,
**SEG | TER | QUA | QUI | SEX | SÁB**, e **DOM** só quando há algo no domingo (DSR
na planilha). Cada cartão fica embaixo do dia dele, como na planilha da ISA; a
movimentação vai no dia dela, antes das torres. Dentro do dia, as torres seguem a
ordem da linha.

- **Por data, não por torre.** Cheguei a ordenar o bloco por torre, e não era o que se
  queria: o planejamento é por dia. A ordem por data é a das colunas.
- **Dias sem nada** ficam na faixa, apagados: o dia vazio também é informação.
- **Tela estreita** (abaixo de 1100 px): os dias empilham, um embaixo do outro, e os
  vazios somem.

### Por Data: o dia separado por atividade — [WR]

Num dia com 30 torres os cartões saíam misturados (supressão, pré-montagem, revisão
tudo junto) e era preciso ler um a um. Agora, dentro de cada dia, as atividades ficam
em grupos, na **ordem em que se executam**: primeiro todas as supressões, depois todas
as pré-montagens, e assim por diante. Cada grupo tem o nome da atividade na cor dela
e quantas torres tem; os cartões dentro seguem por encarregado e, no mesmo
encarregado, pela ordem das torres na linha. A movimentação fica no topo, antes dos
grupos. O nome da atividade sai do cartão (já está no grupo), e sobra o ponto colorido.

### Observação da torre — [WR]

Barra–Correntina tem trechos de serra, e ninguém via isso no cartão. A torre ganhou uma
**observação permanente** (`db/44`, `torre.observacao`): "serra", "acesso difícil".
Não é a observação da programação (vale um dia) nem a restrição (bloqueia e tem
liberação): é só informação.

- **Serra tem símbolo próprio.** Observação com a palavra "serra" (em qualquer caixa,
  com ou sem acento, no meio de outro texto) troca o bloco de notas por uma **montanha**,
  em tom de terra. É pelo texto: sem cadastro de tipo e sem coluna nova.
- **No cartão**, um ícone de bloco de notas no canto de cima à esquerda, com o texto na
  dica. **Nos chips** dos painéis, o mesmo ícone ao lado do número da torre.
- **Pela janela da torre**, um campo editável. **Em várias torres**, o menu Cadastros >
  `Observação nas torres`: as torres se escolhem como no lote (`49/2 a 52/1, 60/1 a
  61/2`), ou já abre com as marcadas na grade. Embaixo, a lista do que já está anotado
  no trecho; clicar numa traz para os campos, para corrigir. Observação vazia tira, e
  pede confirmação quando há algo a perder.
- **Quem escreve:** administração e planejamento, como em qualquer escrita na torre.
  Supervisor vê, mas não altera.
- **A importação das torres não apaga as observações**: o upsert só grava as colunas
  que ela conhece.
- **Carrega à parte** (`db.observacoesDasTorres`), e não pela view `torre_situacao`:
  mexer na view que alimenta a tela inteira por uma coluna de texto não valia o risco.
  Sem a `db/44` a tela segue sem as anotações.
### Lançar pelo encarregado — [WR]

Até aqui só se programava partindo da torre (cartão) ou de torres marcadas na grade
(lote). Na aba Por Encarregado o caminho é o inverso: parte-se de quem faz, e diz-se
o que ele faz.

- **O botão.** Cada bloco de encarregado tem `+ Lançar`, e a aba tem
  `Lançar por encarregado` no topo (escolhe o encarregado na própria janela).
  Quem só consulta não vê os botões.
- **É o lote, não uma tela nova.** Abre a janela do lote já com o encarregado
  escolhido e **sem torres marcadas**. Percentual, observação, segundo encarregado,
  "repetir o último", conferência da sequência e o motivo para o que estiver fora
  dela são os mesmos.
- **Torres digitadas.** O lote ganhou o campo `Torres`: `120/1`, várias separadas
  por vírgula ou espaço, ou um intervalo na ordem da linha, `131/1 a 125/2`. O
  intervalo dado de trás para a frente sai de trás para a frente, que é a ordem em
  que a equipe caminha. O que não existe no trecho é avisado, e o texto fica no
  campo para corrigir. O campo vale também para o lote aberto pela grade.
- **As datas continuam sendo escolhidas.** "Uma torre por dia" a partir de uma
  data (pulando domingo), ou "mesma data em todas". Não preenche sozinho: lançar
  para hoje sem querer seria pior que um clique a mais.

- **O que ele já tem.** A janela mostra, antes da lista do lote, as programações, as
  movimentações e as folgas do encarregado escolhido, em ordem de data. Os dias em
  que as linhas do lote caem em cima de algo que ele já tem ficam marcados, com a
  contagem no topo. Vem do que a tela tem carregado, ou seja, do período do filtro;
  acompanha a troca do encarregado e das datas.
### Lote: programar fora da sequência, com o motivo — [WR]

O lote só mostrava a linha em vermelho e mandava tirá-la ou programar "um a um, pelo
cartão". Agora, com linha fora da sequência, aparece uma caixa para o motivo, e
programar libera **só essas linhas**: elas gravam com o motivo (é o mesmo
`override_motivo` do "programar mesmo assim" do cartão, e aparece como
"programada fora da sequência"). As outras seguem a regra.

- **Sem o motivo não grava.** Ele é o que explica a exceção no histórico.
- **Confere na hora.** Ao clicar em Programar a sequência é conferida de novo, em vez de
  confiar na conferência ao vivo, que espera meio segundo e pode estar velha.
- **A data no passado continua sendo outra coisa.** Tem a própria justificativa, e as
  duas podem valer na mesma linha.

### Dois encarregados na mesma atividade — [WR]

Tem atividade que dois encarregados fazem juntos. O único jeito era lançar duas
programações, uma para cada, e as duas valiam 100%: a torre somava 200%, o total
do relatório da ISA dobrava e a meta contava duas vezes um serviço só.

A programação agora pode ter um **segundo encarregado** (`db/42`,
`programacao.encarregado_2_id`). É uma programação só, com um percentual só.

- **Na tela.** Embaixo do encarregado, "+ Dois encarregados juntos" abre o
  segundo, um seletor simples. Ele exige o primeiro e não pode ser a mesma pessoa
  (a tela avisa e o banco também recusa).
- **Nos painéis.** A programação aparece no bloco dos dois. Dentro do bloco de um,
  o cartão diz "com Jorge Luis". Por Data mostra "Mario + Jorge".
- **Planilha da ISA.** A torre sai na linha dos dois encarregados, como a planilha
  sempre mostrou, mas conta **uma vez só** no total do item.
- **Aviso de conflito.** Vale para os dois: quem é segundo numa programação também
  está ocupado nela.
- **Sem a db/42** a tela funciona como antes e não pede a coluna.

**Fora do escopo:** o histórico de alterações mostra só o primeiro encarregado, e
o editar em lote não mexe no segundo.

### Lote: repetir o último — [WR]

O lote ganhou "Repetir o último", que traz o que o último lançamento tinha:
atividades, encarregado (e o segundo), percentual, cabo, observação e a **data**.
Diferente do cartão da torre, onde a data fica de fora de propósito: no lote a mesma
data costuma valer para a quinzena inteira, e refazê-la era o trabalho. A data é
espalhada do mesmo jeito que da última vez ("mesma data em todas" ou "uma torre por
dia"). Preenche, não grava.

Para isso o lote ganhou dois campos, que valem para todas as linhas: **segundo
encarregado** e **observação** (antes não havia observação no lote). Tanto o lote
quanto o cartão da torre guardam o último lançamento; o "repetir" do cartão
continua sem trazer a data nem a observação.


### Movimentação: o dia sem atividade ganha um motivo — [WR]

Tem dia em que não há atividade na torre porque o encarregado mudou de canteiro
ou a máquina foi levada para outro canteiro ou para outra torre. Nos painéis
esse dia ficava vazio, e vazio não diz o que houve: mudança, chuva, falta de
material ou programação que ninguém lançou.

Criei a tabela `movimentacao` (`db/39`), com três tipos, que a obra chama assim:

- **Mudança de trecho (encarregado):** vai de um canteiro para outro. É o canteiro
  que muda, não o trecho. O nome ficou porque é como a obra fala.
- **Deslocamento de máquina:** só o registro no dia. Na planilha de programação
  escrevia-se "mudança de máquina" e mais nada, e é esse o nível de detalhe: sem
  qual máquina, sem de onde nem para onde. Tem observação opcional, para quem
  quiser dizer, e encarregado opcional: com ele, o registro fica ligado a ele
  naquela semana e aparece no bloco dele. Não gera aviso de choque com a
  programação, porque máquina mudando de lugar não impede ninguém de trabalhar.
- **Outro motivo:** dia sem atividade com o motivo escrito.

Decisões:

- **Não é programação.** Não tem atividade de execução, e não entra em
  precedência, aderência nem no relatório da ISA.
- **Um dia só.** Primeiro aceitei "até"; tirei. A mudança fica registrada naquele
  dia, e se se repete no outro, registra-se de novo.
- **Aparece onde o canteiro atende.** O canteiro serve mais de um trecho, então a
  linha aparece no trecho onde foi registrada e no dos canteiros envolvidos. Em
  quem sai, "vai para X"; em quem recebe, "vem de X".
- **Folga de campo** (`db/43`). Quarto tipo, no mesmo esquema: um dia, encarregado
  opcional (e um segundo), observação opcional. Sem encarregado vale como folga geral
  e aparece em "Máquinas e outros". Ao programar um encarregado em um dia em que
  ele está de folga, ou mudando de canteiro, o formulário avisa — antes só avisava
  quem registrava a movimentação, e o contrário passava calado.
- **"Outro" exige o motivo.** Dia sem atividade sem motivo é o vazio que isto
  existe para tirar. O banco também recusa.
- **Quem registra.** Só administração e planejamento. O supervisor já tem o
  caminho da programação solicitada.
- **Choque com programação.** Se o encarregado tem torre programada no dia, a
  tela pergunta antes. Não bloqueia: ele pode sair depois do serviço.
- **Filtro some com ela.** Filtrar por atividade, canteiro ou torre é pedir "só
  isto", e a movimentação viraria ruído.
- **Dois encarregados.** Qualquer tipo de movimentação aceita um segundo
  encarregado (mudam de canteiro juntos, ou acompanham o mesmo deslocamento). O
  registro aparece no bloco dos dois, e o outro vem como "com Fulano". A coluna
  encarregado_2_id está no próprio `db/39`, porque a tabela ainda é nova.
- **Aparece como cartão, na ordem de data.** Primeiro era uma faixa embaixo do
  encarregado. Virou cartão no mesmo molde da torre, com as setinhas no lugar do
  número, dentro da semana e no dia em que aconteceu; no mesmo dia vem antes das
  torres. Vale para o Por Encarregado e para o Por Data. Borda tracejada, para não
  se confundir com serviço.
**Em aberto.** Programar um encarregado num dia em que ele está em movimentação
não é impedido, só avisado na hora de registrar a movimentação. O contrário
(programar depois) ainda passa calado.

**Sem tabela.** Antes de colar a 39 a tela abre normal, sem movimentação, e o
registro avisa que falta aplicar a migração em vez de mostrar erro cru.

### Voltar o estágio para "nada executado" de verdade — [WR]

A opção existia no seletor, mas só apagava a carga da planilha. Numa torre com
apontamento de campo, escolher "nada executado" **não fazia o estágio voltar**, o
histórico gravava "corrigiu o estágio para nada executado" e a tela dizia "Estágio
atualizado". Quem corrigia achava que tinha funcionado, e o registro dizia a mesma
coisa. Era uma mentira dupla.

**Agora:** a janela lista o que foi apontado em campo e ficaria acima do estágio
escolhido, e só desfaz com confirmação explícita. Sem confirmar, recusa e diz por
quê. Depois de salvar, confere o estágio que ficou e avisa se não é o pedido. O que
foi desfeito entra no histórico de execução (`db/35`), com quem e quando.

Só impede voltar o apontamento **completo** (soma de 100%): é ele que segura o
estágio. Execução parcial acima do escolhido não impede e fica como está — a janela
avisa que ela continua lá.

### Programado × feito fica gravado, e não se perde — [WR]

Ao apontar, o banco guarda duas fotos na execução: a data programada naquele
momento e a **original**, lida do histórico. A view `aderencia` já comparava
programado com executado, mas lia a programação ao vivo — adiar a semana por causa
da chuva reescrevia o compromisso, e um item que escorregou três dias aparecia
"no prazo". Apagar a programação fazia a execução constar como "sem programar".

A original é a que conta para meta: adiar a semana inteira não pode esconder o
atraso. A tela mostra os dois: "Executado em 07/10 · programado para 05/10 (2 dias
de atraso) · originalmente 03/10". `db/38`.

A foto é tirada pelo banco, não pela tela — se viesse da tela, dependeria de a tela
lembrar de mandar. O que ainda **não existe** é um painel de metas; os dados estão
todos na view, falta decidir como mostrar.

### A programação já feita sai do cartão e vira o estágio — [WR]

Apontar uma programação completa a tira da lista do cartão: o estágio no topo já diz
a mesma coisa, e a informação aparecia duas vezes. O selo e o destaque do cartão
passam a contar só o que ainda é plano.

Nos painéis (por data, encarregado, atividade) ela **continua**, com um ✓: são a lista
de acompanhamento da semana, e sumir com ela apagaria o que foi planejado.

### O estágio só avança com a atividade completa — [WR]

Efeito colateral do item anterior que eu não quis deixar passar: o estágio era a
atividade mais avançada com *qualquer* execução, e o apontamento gravava sempre 100%.
Com o serviço repartido, apontar a primeira parte de uma escavação (20%, um estai)
faria a torre constar como escavada inteira — e, escondendo a linha do cartão, o
engano ficaria invisível.

**Agora:** o estágio só avança quando a soma dos apontamentos chega a 100%; o apontamento
grava o percentual que saiu (padrão: o programado, editável). A programação **parcial**
apontada continua no cartão, com ✓, para o progresso não ficar sem lugar.

**Limite que fica, para decidir:** a regra de bloqueio (`motivo_bloqueio_programacao`)
ainda trata qualquer execução ou programação como pré-requisito cumprido, mesmo
parcial. Ou seja, 20% de escavação já libera o reaterro. Não mexi: é regra de obra, e
é o D4 de volta. Está no backlog.

### A linha EXEC. do relatório da ISA não é do SIPAV, por enquanto — [WR]

O exportador preenche só PROG. 1 e PROG. 2, e a linha `EXEC.` ficava de fora porque
dependia do apontamento de campo. O apontamento existe agora, com histórico, então o
impedimento técnico caiu. Mesmo assim, a decisão é **não preencher pelo SIPAV**: a
linha segue em branco e à mão, e talvez entre no futuro. Nada muda no código — ele já
não encosta nela.

### Padronizar as atividades do relatório com a seção técnica — [WR]

Concordo e é o que a DEC-11 já pedia. Chegou uma lista preliminar do analista da seção
técnica, que a engenheira de Planejamento vai conferir antes de eu trazê-la. **Não
mudo catálogo, de-para nem atividade em cima de uma lista que ainda não foi conferida**
— a planilha da ISA já me enganou sete vezes. Os pontos a levar à conferência estão
em [04-relatorio-isa](04-relatorio-isa.md), item P7.

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
