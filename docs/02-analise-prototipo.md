# Análise do protótipo do Alessandro

Arquivo: [`referencia/prototipo-alessandro-v1.html`](../referencia/prototipo-alessandro-v1.html) — 1775 linhas, HTML único, Tailwind CDN + Lucide + html2pdf.

## O que ele já faz bem (e devemos preservar)

- **Metáfora visual de grade de torres** — "igual escolher assento de avião". É o acerto central do protótipo e é a razão dele funcionar. Manter.
- **4 visões da mesma programação**: Grade Geral, por Data, por Encarregado, por Atividade.
- **Múltiplas atividades por torre**, com encarregado e data independentes por atividade.
- **Status configurável pelo usuário** — nome, cor e ícone (Lucide), sem precisar de dev.
- **Densidade de grade ajustável** (2 a 12 colunas) — resolve celular vs notebook vs monitor.
- **Totalização em torres e km** do que foi programado.
- **Entrada em bloco** por colar da planilha (torres/km e status atual).
- **Exportação PDF** com título e nome de arquivo editáveis, e compartilhamento por WhatsApp.
- **Migração de formato de dados** já embutida (`migrateSchedulesFormat`) — o Alessandro já esbarrou em versionar dados.

## Modelo de dados atual

Tudo em `localStorage`, 8 chaves independentes, sem integridade referencial:

```js
app_title              // string
app_towers             // ["0/1", "0/2", ...]                    lista plana de torres
app_tower_km           // { "118/2": 0.520, ... }                 km por torre
app_tower_status       // { "118/2": "ESCAVAÇÃO", ... }           ÚLTIMA atividade executada
app_status_definitions // { "ESCAVAÇÃO": {bg, text, icon}, ... }  catálogo de atividades
app_schedules          // { "118/2": [{id, date, supervisor, activity, note}] }
app_supervisors        // ["Antônio dos Santos", ...]
app_grid_columns       // "8"
```

## Problemas estruturais (por que não escala)

### 1. Persistência local — o bloqueador nº 1
`localStorage` morre por navegador e por máquina. Ninguém vê o que o outro programou. O botão **"Baixar App HTML"** tenta contornar isso reescrevendo o próprio código-fonte com os dados embutidos — foi corretamente identificado na reunião como fonte de corrupção e já está acordado que sai.

### 2. Não existe o conceito de Trecho
As torres são uma lista plana hardcoded. Cada trecho vive num **arquivo HTML separado**, e trocar de trecho hoje significa: abrir outra planilha → copiar torres/km → colar → ir na outra aba → copiar status → colar. O status do trecho anterior "vaza" se você esquecer de trocar.

Modelo necessário: **Obra → Trecho → Torre**. Com isso o dropdown de trecho que vocês combinaram na reunião sai de graça.

### 3. `status` está sobrecarregado com dois conceitos incompatíveis
O mesmo campo guarda **"última atividade executada"** (ESCAVAÇÃO) e **"impedimento"** (RESTRIÇÃO AMBIENTAL). Uma torre pode perfeitamente estar escavada *e* travada por questão fundiária — hoje é impossível representar isso.

Precisa virar: `ultima_atividade` + `restricoes[]` (tipo, data de início, previsão/data de liberação, observação).

### 4. Não existe histórico — só o "último estado"
`towerStatusMap` guarda um valor por torre. O Alessandro já notou isso na reunião: *"ele vai apontar só a última atividade... você não sabe quantas já tiveram supressão"*.

Sem tabela de execuções não existe: produtividade por encarregado, curva de avanço, comparativo programado × executado, nem histórico pra auditoria. **Esta é a mudança que destrava metade do backlog futuro.**

### 5. Não existe "executado" — só "programado"
O sistema inteiro planeja e nunca fecha o ciclo. Ninguém confirma o que de fato aconteceu. É o que impede medir avanço real e produtividade — que é exatamente o que a Hanna e o Alessandro querem.

### 6. Zero validação de precedência
`addNewScheduleToTower()` aceita qualquer atividade, em qualquer data, em qualquer torre. Dá pra programar lançamento de cabo OPGW numa torre que nem existe fisicamente, e com data retroativa. (Demonstrado ao vivo na reunião.)

### 7. Sem usuários, papéis ou rastro
Não dá pra saber quem programou o quê, nem implementar o fluxo de pré-programação do supervisor com aceite do planejamento (post-it 3).

### 8. Relatório em formato próprio
Gera PDF bonito, mas a fiscalização quer o layout oficial da planilha. Falta exportação Excel no padrão e quebra por semana (hoje despeja a quinzena inteira).

### 9. Detalhes de UX já mapeados
- Dropdown de atividades sem ordenação (pedido: ordem de execução, não alfabética)
- Sem detecção de conflito: mesmo encarregado em dois lugares no mesmo dia
- Formulário com muitos cliques — o Alessandro levantou que digitar direto no Excel pode ser mais rápido. **Sinal de alerta de UX: se não for mais rápido que a planilha, não é adotado.**

## Veredito

O protótipo é um **excelente documento de requisitos e uma boa referência visual**, e é assim que devemos tratá-lo. A lógica de negócio e o modelo de dados precisam ser refeitos; a linguagem visual e o fluxo de interação devem ser herdados quase inteiros.
