/* =============================================================================
   SIPAV LT — Relatório de Programação Semanal da ISA (RPSQ)

   Preenche a planilha que a fiscalização recebe toda sexta, a partir da
   programação que já está no SIPAV. Ver docs/04-relatorio-isa.md.

   Princípio: o arquivo que o usuário sobe é a verdade. Este módulo escreve
   APENAS as células das linhas PROG. 1 e PROG. 2 dos itens que o SIPAV programa
   — cerca de 45 dos 86 itens continuam sendo preenchidos à mão, e as fórmulas
   de total, acumulado e % execução precisam sobreviver intactas.
   ========================================================================== */

window.SIPAV = window.SIPAV || {};

(function () {
  'use strict';

  var ui = SIPAV.ui;

  /* ------------------------------------------------------- Colunas da PS -- */

  var COL = {
    ITEM: 3,          // C
    ATIVIDADE: 4,     // D
    UNIDADE: 8,       // H
    TAREFA: 9,        // I — EXEC. / PROG. 1 / PROG. 2
    ENCARREGADO: 10,  // J
    SEGUNDA: 11,      // K … Q = domingo
    TOTAL: 18         // R
  };

  var LINHA_DATAS_S1 = 11;
  var LINHA_DATAS_S2 = 12;

  // A data do cabeçalho. É a única data digitada da planilha: todas as outras
  // saem dela por fórmula encadeada —
  //   K10 = Q5-7  (segunda da semana executada)  →  …  →  Q10 (domingo)
  //   K11 = Q10+1 (segunda da semana 1)          →  …  →  Q11
  //   K12 = Q11+1 (segunda da semana 2)
  // Mudar Q5 reposiciona o relatório inteiro.
  var LINHA_CABECALHO_DATA = 5;
  var COL_CABECALHO_DATA = 17;   // Q

  /* --------------------------------------------------------- De-para ------ */

  /**
   * Catálogo dos itens que o SIPAV programa. O `item` é o código do catálogo
   * unificado; os `nomes` são todas as grafias encontradas nas quatro planilhas
   * de 21/09, porque elas divergiram e a padronização ainda vai ser apresentada
   * à fiscalização. A localização é feita pelo NOME, não pelo código — os
   * códigos se repetem e saem de ordem em três dos quatro arquivos.
   */
  var CATALOGO = {
    // ---- Preliminares
    '1.2.3':  ['construcao de acesso', 'construcao estrada de acesso'],
    '1.3.1':  ['limpeza area de torre', 'limpeza de area de torre'],
    '1.3.2':  ['limpeza da faixa', 'limpeza vao entre estruturas'],
    '1.3.3':  ['corte seletivo'],

    // ---- Fundação
    '2.1.4':  ['escavacao fundacao estai pe', 'escavacao fundacao'],
    '2.1.5':  ['escavacao fundacao mastro central', 'escavacao fundacao mastro'],
    '2.1.6':  ['perfuracao em rocha cravacao de estacas fundacao estai pe',
               'perfuracao em rocha cravacao de estacas fundacao estai'],
    '2.1.7':  ['perfuracao em rocha cravacao de estacas fundacao mastro central'],
    '2.1.8':  ['injecao de nata de cimento fundacao estai pe'],
    '2.1.9':  ['injecao de nata de cimento fundacao mastro central'],
    '2.1.10': ['instalacao de pre moldados nivelamento preparacao fundacao estai pel',
               'instalacao de pre moldados nivelamento preparacao fundacao estai pe',
               'instalacao de pre moldados nivelamento preparacao fundacao estai',
               'instalacao de pre moldados nivelamento preparacao fundacao'],
    '2.1.11': ['instalacao de pre moldados nivelamento preparacao fundacao mastro central',
               'instalacao de pre moldados nivelamento preparacao fundacao matro central',
               'instalacao de pre moldados nivelamento preparacao fundacao mc'],
    '2.1.12': ['concretagem in loco', 'concretagem in loco fundacao',
               'concretagem in loco fundacao estai pe',
               'preparacao concretagem in loco fundacao'],
    '2.1.13': ['concretagem in loco fundacao mastro central'],
    '2.1.16': ['reaterro fundacao estai pe', 'reaterro fundacao estai', 'reaterro fundacao'],
    '2.1.17': ['reaterro fundacao mastro central'],
    '2.1.18': ['ensaio de arrancamento fundacao estai', 'ensaio de arrancamento fundacao',
               'teste de arrancamento'],
    // Itens que ainda não existem em planilha nenhuma (A1 do Alessandro)
    '2.1.20': ['perfuracao de tubulao fundacao estai pe', 'perfuracao de tubulao'],
    '2.1.21': ['perfuracao de tubulao fundacao mastro central'],

    // ---- Aterramento
    '2.2.1':  ['instalacao de contra peso', 'instalacao de contrapeso'],
    '2.2.3':  ['medicao de resistencia'],

    // ---- Montagem
    '3.1.1':  ['pre montagem de torre estaiada'],
    '3.1.2':  ['revisao em solo de torres estaiada'],
    '3.1.3':  ['icamento de torres estaiada montagem manual', 'icamento de torres estaiada'],
    '3.1.4':  ['revisao final estaiadas'],
    '3.1.5':  ['giro e prumo'],
    '3.2.1':  ['pre montagem de torre autoportante'],
    '3.2.2':  ['montagem de torres autoportante guindaste',
               'montagem mecanizada de torre autoportante'],
    '3.2.3':  ['revisao de torres autoportante', 'revisao de torre autoportante'],

    // ---- Para-raio (4.1) e OPGW (4.2)
    '4.1.1':  ['instalacao de bandolas para o cabo para raio'],
    '4.1.2':  ['lancamento do cabo pilotinho para lancamento do cabo para raio'],
    '4.1.3':  ['lancamento de cabo para raio'],
    '4.1.4':  ['nivelamento do para raio'],
    '4.1.5':  ['grampeacao do cabo para raio'],
    '4.1.6':  ['ancoragem do cabo para raio'],
    '4.2.1':  ['instalacao de bandolas para o cabo opgw'],
    '4.2.2':  ['lancamento do cabo pilotinho para lancamento do cabo opgw'],
    '4.2.3':  ['lancamento de cabo opgw'],
    '4.2.4':  ['nivelamento do opgw'],
    '4.2.5':  ['grampeacao do cabo opgw'],
    '4.2.6':  ['ancoragem do cabo opgw'],

    // ---- Condutor
    '4.3.1':  ['instalacao de bandolas e isoladores'],
    '4.3.2':  ['lancamento do cabo piloto do condutor'],
    '4.3.3':  ['lancamento do cabo condutor'],
    '4.3.4':  ['nivelamento do cabo condutor'],
    '4.3.5':  ['grampeacao do cabo condutor'],
    '4.3.6':  ['ancoragem do cabo condutor'],
    '4.3.7':  ['instalacao de jumper'],
    '4.3.8':  ['instalacao de espacadores'],

    // ---- Sinalização
    '4.4.1':  ['instalacao de sinalizadores de estais'],
    '4.4.2':  ['instalacao de dispositivo avifauna'],
    '4.4.3':  ['instalacao de placas de sinalizacao']
  };

  /**
   * Atividade do SIPAV → itens da ISA.
   *
   *   itens     — vale para qualquer torre
   *   est / aup — depende do tipo da estrutura. Estaiada tem mastro central e
   *               estais, então a fundação dela conta nas duas linhas;
   *               autoportante só nos pés.
   *   opgw / pr — depende do campo `cabo` da programação.
   */
  var DE_PARA = {
    'ABERTURA DE ACESSO':                       { itens: ['1.2.3'] },
    'SUPRESSÃO DE ÁREA DE TORRE':               { itens: ['1.3.1'] },
    'SUPRESSÃO DA FAIXA':                       { itens: ['1.3.2'] },
    'CORTE SELETIVO':                           { itens: ['1.3.3'] },

    'ESCAVAÇÃO':                                { est: ['2.1.4', '2.1.5'],   aup: ['2.1.4'] },
    'PERFURAÇÃO DE TUBULÃO':                    { est: ['2.1.20', '2.1.21'], aup: ['2.1.20'] },
    'PERFURAÇÃO EM ROCHA':                      { est: ['2.1.6', '2.1.7'],   aup: ['2.1.6'] },
    'INJEÇÃO DE NATA':                          { est: ['2.1.8', '2.1.9'],   aup: ['2.1.8'] },
    'INSTALAÇÃO DE PRÉ-MOLDADOS - VIGA L':      { itens: ['2.1.10'] },
    'INSTALAÇÃO DE PRÉ-MOLDADOS - MC':          { itens: ['2.1.11'] },
    'INSTALAÇÃO DE PRÉ-MOLDADOS - MC E VIGA L': { itens: ['2.1.10', '2.1.11'] },
    'CONCRETAGEM / TUBULÃO':                    { est: ['2.1.12', '2.1.13'], aup: ['2.1.12'] },
    'REATERRO 100%':                            { est: ['2.1.16', '2.1.17'], aup: ['2.1.16'] },
    'TESTE DE ARRANCAMENTO':                    { itens: ['2.1.18'] },

    'ATERRAMENTO / CONTRAPESO':                 { itens: ['2.2.1'] },
    'MEDIÇÃO DE RESISTÊNCIA':                   { itens: ['2.2.3'] },

    // Pré-montagem carrega a revisão em solo (DEC-7), que só existe em estaiada
    'PRÉ-MONTAGEM':                             { est: ['3.1.1', '3.1.2'], aup: ['3.2.1'] },
    'MONTAGEM':                                 { est: ['3.1.3'], aup: ['3.2.2'] },
    'REVISÃO':                                  { est: ['3.1.4'], aup: ['3.2.3'] },
    'GIRO E PRUMO':                             { itens: ['3.1.5'] },

    'INSTALAÇÃO DE BANDOLAS OPGW / PARA-RAIO':  { opgw: ['4.2.1'], pr: ['4.1.1'] },
    'LANÇAMENTO DO PILOTINHO':                  { opgw: ['4.2.2'], pr: ['4.1.2'] },
    'LANÇAMENTO DO CABO OPGW/PR':               { opgw: ['4.2.3'], pr: ['4.1.3'] },
    'NIVELAMENTO OPGW / PARA-RAIO':             { opgw: ['4.2.4'], pr: ['4.1.4'] },
    'GRAMPEAÇÃO OPGW / PARA-RAIO':              { opgw: ['4.2.5'], pr: ['4.1.5'] },
    'ANCORAGEM OPGW / PARA-RAIO':               { opgw: ['4.2.6'], pr: ['4.1.6'] },

    'INSTALAÇÃO DE BANDOLAS E ISOLADORES':      { itens: ['4.3.1'] },
    'LANÇAMENTO DO PILOTO DO CONDUTOR':         { itens: ['4.3.2'] },
    'LANÇAMENTO CONDUTOR 100%':                 { itens: ['4.3.3'] },
    'NIVELAMENTO DOS CONDUTORES':               { itens: ['4.3.4'] },
    'GRAMPEAÇÃO DOS CONDUTORES':                { itens: ['4.3.5'] },
    'ANCORAGEM DOS CONDUTORES':                 { itens: ['4.3.6'] },
    'INSTALAÇÃO DE JUMPER':                     { itens: ['4.3.7'] },
    'INSTALAÇÃO DE ESPAÇADORES':                { itens: ['4.3.8'] },

    // Único leque que sobrou: a ISA separa em três tipos de sinalização e o
    // campo aponta como um serviço só, então a mesma programação vai nas três
    'INSTALAÇÃO DE SINALIZAÇÃO':                { itens: ['4.4.1', '4.4.2', '4.4.3'] }
  };

  /**
   * O valor de uma célula, desembrulhado.
   *
   * O ExcelJS não devolve um escalar simples: célula com fórmula vem como
   * {formula, result}, célula com texto formatado vem como {richText:[…]} e
   * célula com link vem como {text, hyperlink}. As datas do cabeçalho, por
   * exemplo, são `Q10+1` — sem desembrulhar, a conferência de período não
   * enxergava nada.
   */
  function valor(celula) {
    var v = celula ? celula.value : null;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('result' in v) v = v.result;
      else if (v.richText) v = v.richText.map(function (p) { return p.text; }).join('');
      else if ('text' in v) v = v.text;
    }
    return v;
  }

  /** Minúscula, sem acento, sem pontuação, espaços colapsados. */
  function norm(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /** Qual item da ISA esta programação alimenta, dado o tipo da torre. */
  function itensDe(prog, estrutura) {
    var regra = DE_PARA[prog.atividade ? prog.atividade.nome : ''];
    if (!regra) return [];

    if (regra.itens) return regra.itens;
    if (regra.opgw || regra.pr) {
      if (prog.cabo === 'OPGW') return regra.opgw || [];
      if (prog.cabo === 'PARA_RAIO') return regra.pr || [];
      return [];                              // sem cabo escolhido: entra no relato
    }
    return estrutura === 'ESTAIADA' ? (regra.est || []) : (regra.aup || []);
  }

  /* ------------------------------------------------- Achar as linhas ------ */

  /**
   * Varre a coluna D procurando cada item do catálogo. Devolve
   * { item: {linhaItem, prog1, prog2} } mais a lista de duplicados.
   *
   * Casa pelo nome porque os códigos divergiram: em Buritirama o `2.1.17`
   * aparece duas vezes e o `3.1.3` serve para duas coisas diferentes.
   */
  function mapearLinhas(ws) {
    var porNome = {};
    Object.keys(CATALOGO).forEach(function (item) {
      CATALOGO[item].forEach(function (nome) { porNome[nome] = item; });
    });

    var achados = {};
    var duplicados = [];
    var tortos = [];
    var ultima = ws.rowCount;

    for (var r = 13; r <= ultima; r++) {
      var nome = norm(valor(ws.getCell(r, COL.ATIVIDADE)));
      if (!nome) continue;

      var item = porNome[nome];
      if (!item) continue;

      // Só a linha do EXEC. serve de âncora. Sem isto, a linha de SEÇÃO
      // "4.2  LANÇAMENTO DE CABO -  OPGW" casaria com o item
      // "4.2.3  LANÇAMENTO DE CABO OPGW" — os dois normalizam igual —, e a
      // programação do OPGW iria parar nas linhas das bandolas.
      // O nome se repete nas três linhas do bloco; o que as distingue é a
      // coluna TAREFA.
      if (norm(valor(ws.getCell(r, COL.TAREFA))) !== 'exec') continue;

      if (achados[item]) { duplicados.push({ item: item, linha: r }); continue; }

      // Confere que o bloco de três linhas está inteiro antes de confiar nele
      var t1 = norm(valor(ws.getCell(r + 1, COL.TAREFA)));
      var t2 = norm(valor(ws.getCell(r + 2, COL.TAREFA)));
      if (t1 !== 'prog 1' || t2 !== 'prog 2') {
        tortos.push({ item: item, linha: r, achou: t1 + ' / ' + t2 });
        continue;
      }

      achados[item] = { linhaItem: r, prog1: r + 1, prog2: r + 2 };
    }

    return { achados: achados, duplicados: duplicados, tortos: tortos };
  }

  /** Confere se a planilha é da quinzena escolhida. */
  function conferirDatas(ws, segundaS1) {
    // As datas são fórmulas encadeadas a partir do cabeçalho (`Q10+1`), então
    // vêm como {formula, result}. O `valor()` desembrulha; o resultado pode ser
    // Date, string ISO ou o serial do Excel, dependendo de como foi digitada.
    function dataDa(linha) {
      var v = valor(ws.getCell(linha, COL.SEGUNDA));
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) v = new Date(v);
      if (v instanceof Date) {
        // O ExcelJS devolve meia-noite UTC; ler em local viraria o dia anterior
        return ui.iso(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
      }
      if (typeof v === 'number') {                     // serial do Excel
        var d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
        return ui.iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      }
      return null;
    }
    return {
      s1: dataDa(LINHA_DATAS_S1),
      s2: dataDa(LINHA_DATAS_S2),
      esperadoS1: ui.iso(segundaS1),
      esperadoS2: ui.iso(ui.somarDias(segundaS1, 7))
    };
  }

  /* ---------------------------------------------- Montar o que escrever --- */

  /**
   * Agrupa a programação em { item: { semana: { encarregado: { dia: [torres] } } } }.
   * Encarregado vira chave porque a planilha empacota vários na mesma linha,
   * separados por ' / ', e cada célula do dia repete a mesma ordem.
   */
  function agrupar(progs, torresPorId, segundaS1) {
    var isoS1 = ui.iso(segundaS1);
    var isoS2 = ui.iso(ui.somarDias(segundaS1, 7));
    var isoFim = ui.iso(ui.somarDias(segundaS1, 13));

    var dados = {};
    var semCabo = [];
    var semDePara = {};
    var fora = 0;

    progs.forEach(function (p) {
      if (p.data < isoS1 || p.data > isoFim) { fora++; return; }

      var torre = torresPorId[p.torre ? p.torre.id : ''] || {};
      var nomeAtiv = p.atividade ? p.atividade.nome : '—';

      if (!DE_PARA[nomeAtiv]) { semDePara[nomeAtiv] = (semDePara[nomeAtiv] || 0) + 1; return; }

      var itens = itensDe(p, torre.estrutura);
      if (!itens.length) {
        semCabo.push((p.torre ? p.torre.identificador : '?') + ' · ' + nomeAtiv);
        return;
      }

      var semana = p.data < isoS2 ? 'prog1' : 'prog2';
      var dia = Math.round((ui.paraData(p.data) - ui.paraData(semana === 'prog1' ? isoS1 : isoS2)) / 86400000);
      var enc = p.encarregado ? p.encarregado.nome : '—';

      itens.forEach(function (item) {
        dados[item] = dados[item] || {};
        dados[item][semana] = dados[item][semana] || {};
        dados[item][semana][enc] = dados[item][semana][enc] || {};
        var caixa = dados[item][semana][enc];
        caixa[dia] = caixa[dia] || [];
        caixa[dia].push(p.torre ? p.torre.identificador : '?');
      });
    });

    return { dados: dados, semCabo: semCabo, semDePara: semDePara, fora: fora };
  }

  /* ------------------------------------------------------- Escrever ------- */

  /**
   * Esvazia uma linha de PROG.
   *
   * Sem isto a programação da semana passada sobrevive: a planilha é reusada de
   * uma semana para a outra, e um item que tinha serviço antes e não tem agora
   * ficaria com o conteúdo velho — inclusive em linha oculta, invisível para
   * quem confere e visível para a fiscalização que reexibir.
   *
   * Só vale para os itens do catálogo, que são os que o SIPAV programa. Os
   * cerca de 45 preenchidos à mão não são tocados.
   */
  function limparLinha(ws, linha) {
    // A planilha marca "nada aqui" com hífen, não com célula vazia. Zerar para
    // vazio deixava buraco onde o resto do documento mostra '-'.
    var tinha = false;

    function vazia(col) {
      var t = String(valor(ws.getCell(linha, col)) || '').trim();
      if (t && t !== '-') tinha = true;
      ws.getCell(linha, col).value = '-';
    }

    vazia(COL.ENCARREGADO);
    for (var d = 0; d < 6; d++) vazia(COL.SEGUNDA + d);
    ws.getCell(linha, COL.SEGUNDA + 6).value = 'DSR';
    vazia(COL.TOTAL);

    return tinha;
  }

  function escreverLinha(ws, linha, porEncarregado) {
    var encs = Object.keys(porEncarregado).sort();
    if (!encs.length) return 0;

    // O documento inteiro escreve encarregado em caixa alta
    ws.getCell(linha, COL.ENCARREGADO).value =
      encs.map(function (e) { return e.toUpperCase(); }).join(' / ');

    var total = 0;
    for (var dia = 0; dia < 6; dia++) {           // segunda a sábado
      var pedacos = encs.map(function (e) {
        var torres = porEncarregado[e][dia];
        if (!torres || !torres.length) return '-';
        total += torres.length;
        return torres.join(', ');
      });
      ws.getCell(linha, COL.SEGUNDA + dia).value = pedacos.join(' / ');
    }
    ws.getCell(linha, COL.SEGUNDA + 6).value = 'DSR';    // domingo
    ws.getCell(linha, COL.TOTAL).value = total || '-';

    ws.getRow(linha).hidden = false;             // senão ninguém vê o que foi escrito
    return total;
  }

  /* --------------------------------------------------------- Exportar ----- */

  /**
   * @param {File}   arquivo   .xlsx do trecho, baixado do drive da obra
   * @param {Date}   segundaS1 segunda-feira da semana 1
   * @param {Array}  progs     programações do trecho
   * @param {Array}  torres    torres do trecho (para saber estaiada/autoportante)
   * @returns {Promise<{blob, relato}>}
   */
  function gerar(arquivo, segundaS1, progs, torres) {
    if (!window.ExcelJS) {
      return Promise.reject(new Error('A biblioteca de planilha não carregou. Recarregue a página.'));
    }

    var torresPorId = {};
    torres.forEach(function (t) { torresPorId[t.torre_id || t.id] = t; });

    var wb = new ExcelJS.Workbook();

    return arquivo.arrayBuffer()
      .then(function (buf) { return wb.xlsx.load(buf); })
      .then(function () {
        var ws = wb.getWorksheet('PS');
        if (!ws) throw new Error('Não achei a aba "PS" neste arquivo. É a planilha certa?');

        // Guarda contra o arquivo com as colunas deslocadas (existe um por aí,
        // com duas colunas apagadas). Escrever nele acertaria tudo errado.
        if (norm(valor(ws.getCell(9, COL.ITEM))) !== 'item') {
          throw new Error(
            'As colunas desta planilha não estão onde deveriam: a linha 9 deveria ' +
            'começar com ITEM na coluna C. Use o arquivo que vocês preenchem toda semana.'
          );
        }

        // Lido antes de reposicionar, para poder dizer de que semana era
        var datas = conferirDatas(ws, segundaS1);

        // Reposiciona o relatório na quinzena escolhida. Uma célula só; o resto
        // das datas é fórmula e o Excel refaz na abertura por causa do
        // fullCalcOnLoad lá embaixo.
        ws.getCell(LINHA_CABECALHO_DATA, COL_CABECALHO_DATA).value = new Date(Date.UTC(
          segundaS1.getFullYear(), segundaS1.getMonth(), segundaS1.getDate()
        ));
        var mapa = mapearLinhas(ws);
        var g = agrupar(progs, torresPorId, segundaS1);

        var escritas = 0, torresEscritas = 0, limpas = 0;
        var naoAchados = [];
        var tinhamConteudo = {};

        // Passo 1 — zera a programação de TODOS os itens do catálogo, esteja ou
        // não com serviço nesta quinzena. É o que impede a semana passada de
        // sobreviver na planilha reusada.
        //
        // Guarda quem tinha conteúdo: se o SIPAV não escrever nada por cima,
        // aquilo era planejamento que só existia na planilha e acabou de sumir.
        // Quem confere precisa saber disso — é a diferença entre "o SIPAV é a
        // fonte da verdade" e "o SIPAV apagou meu trabalho".
        Object.keys(mapa.achados).forEach(function (item) {
          var alvo = mapa.achados[item];
          var t1 = limparLinha(ws, alvo.prog1);
          var t2 = limparLinha(ws, alvo.prog2);
          limpas += 2;
          if (t1 || t2) {
            tinhamConteudo[item] = String(valor(ws.getCell(alvo.linhaItem, COL.ATIVIDADE)) || item);
          }
        });

        // Passo 2 — escreve o que há
        Object.keys(g.dados).forEach(function (item) {
          var alvo = mapa.achados[item];
          if (!alvo) { naoAchados.push(item); return; }

          ['prog1', 'prog2'].forEach(function (semana) {
            var porEnc = g.dados[item][semana];
            if (!porEnc) return;
            var n = escreverLinha(ws, semana === 'prog1' ? alvo.prog1 : alvo.prog2, porEnc);
            if (n) { escritas++; torresEscritas += n; }
          });

          ws.getRow(alvo.linhaItem).hidden = false;   // o cabeçalho do item também
        });

        // O ExcelJS não tem motor de cálculo: as datas derivadas continuam com o
        // resultado antigo em cache até alguém recalcular. Isto manda o Excel
        // refazer tudo assim que o arquivo abre.
        wb.calcProperties = wb.calcProperties || {};
        wb.calcProperties.fullCalcOnLoad = true;

        // O que tinha programação na planilha e não tinha no SIPAV
        var apagados = Object.keys(tinhamConteudo)
          .filter(function (item) { return !g.dados[item]; })
          .map(function (item) { return { item: item, nome: tinhamConteudo[item] }; });

        return wb.xlsx.writeBuffer().then(function (out) {
          return {
            blob: new Blob([out], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }),
            relato: {
              datas: datas,
              linhasEscritas: escritas,
              torresEscritas: torresEscritas,
              linhasLimpas: limpas,
              apagados: apagados,
              itensNaoAchados: naoAchados,
              duplicados: mapa.duplicados,
              tortos: mapa.tortos,
              semCabo: g.semCabo,
              semDePara: g.semDePara,
              foraDoPeriodo: g.fora
            }
          };
        });
      });
  }

  window.SIPAV.isa = {
    gerar: gerar,
    DE_PARA: DE_PARA,
    CATALOGO: CATALOGO
  };
})();
