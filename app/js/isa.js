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
   * de 21/09 e as oficiais de 28/09, porque elas divergiram e a padronização ainda vai ser apresentada
   * à fiscalização. A localização é feita pelo NOME, não pelo código — os
   * códigos se repetem e saem de ordem em três dos quatro arquivos.
   */
  var CATALOGO = {
    // ---- Preliminares
    '1.2.3':  ['construcao de acesso', 'construcao estrada de acesso'],
    '1.2.5':  ['recuperacao de acesso'],
    '1.3.1':  ['limpeza area de torre', 'limpeza de area de torre'],
    '1.3.2':  ['limpeza da faixa', 'limpeza vao entre estruturas'],
    '1.3.3':  ['corte seletivo'],
    '1.3.5':  ['supressao de praca de lancamento', 'supressao praca de lancamento'],

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
    '3.2.2':  ['montagem de torres autoportante guindaste ou manual',
               'montagem de torres autoportante guindaste',
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
   * As seis linhas de lançamento do cabo-guarda, nas quatro formas em que a
   * planilha as tem:
   *
   *   pr    — para-raio convencional, seção 4.1
   *   opgw  — OPGW único, seção 4.2
   *   opgwD / opgwE — OPGW direito e esquerdo. Buritirama–Barra e
   *           Juazeiro–Campo Formoso têm os dois e nenhum para-raio: duas seções
   *           com as mesmas linhas, que só se distinguem pelo título.
   *
   * Os códigos com D e E são só chaves internas. Nas planilhas as duas seções
   * repetem a numeração 4.2.x, então o código não identifica o lado.
   */
  function cabo(n) {
    return { pr: ['4.1.' + n], opgw: ['4.2.' + n],
             opgwD: ['4.2D.' + n], opgwE: ['4.2E.' + n] };
  }

  /**
   * Atividade do SIPAV → itens da ISA.
   *
   *   itens     — vale para qualquer torre
   *   est / aup — depende do tipo da estrutura. Estaiada tem mastro central e
   *               estais, então a fundação dela conta nas duas linhas;
   *               autoportante só nos pés.
   *   pr / opgw / opgwD / opgwE — depende do campo `cabo` da programação.
   */
  var DE_PARA = {
    'ABERTURA DE ACESSO':                       { itens: ['1.2.3'] },
    'RECUPERAÇÃO DE ACESSO':                    { itens: ['1.2.5'] },
    'SUPRESSÃO DE ÁREA DE TORRE':               { itens: ['1.3.1'] },
    'SUPRESSÃO DA FAIXA':                       { itens: ['1.3.2'] },
    'CORTE SELETIVO':                           { itens: ['1.3.3'] },
    'SUPRESSÃO DE PRAÇA DE LANÇAMENTO':         { itens: ['1.3.5'] },

    // Numa autoportante o mastro central não existe, então a escavação completa
    // dela é só a dos pés
    'ESCAVAÇÃO':                                { est: ['2.1.4', '2.1.5'],   aup: ['2.1.4'] },
    'ESCAVAÇÃO - ESTAI':                        { itens: ['2.1.4'] },
    'ESCAVAÇÃO - MC':                           { itens: ['2.1.5'] },
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

    'INSTALAÇÃO DE BANDOLAS OPGW / PARA-RAIO':  cabo(1),
    'LANÇAMENTO DO PILOTINHO':                  cabo(2),
    'LANÇAMENTO DO CABO OPGW/PR':               cabo(3),
    'NIVELAMENTO OPGW / PARA-RAIO':             cabo(4),
    'GRAMPEAÇÃO OPGW / PARA-RAIO':              cabo(5),
    'ANCORAGEM OPGW / PARA-RAIO':               cabo(6),

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

  /** 50 → "50%", 12.5 → "12,5%" */
  function pct(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('pt-BR') + '%';
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

  /**
   * A regra de uma atividade, pelo nome sem caixa e sem acento. O nome vem do
   * cadastro, onde qualquer um pode digitar "Recuperação de acesso" ou
   * "RECUPERACAO DE ACESSO"; exigir a grafia exata mandaria para o relato
   * "atividade que não vai para o relatório" uma que vai.
   */
  var DE_PARA_NORM = {};
  Object.keys(DE_PARA).forEach(function (nome) { DE_PARA_NORM[norm(nome)] = DE_PARA[nome]; });

  /** "4.2D.3" → "4.2.3 OPGW direito": o código interno não diz nada a quem lê o relato. */
  function rotuloDoItem(item) {
    var m = /^4\.2([DE])\.(\d+)$/.exec(item);
    return m ? '4.2.' + m[2] + (m[1] === 'D' ? ' OPGW direito' : ' OPGW esquerdo') : item;
  }

  /** Atividades do SIPAV que alimentam um item da ISA. */
  function atividadesDoItem(item) {
    return Object.keys(DE_PARA).filter(function (nome) {
      var r = DE_PARA[nome];
      return ['itens', 'est', 'aup', 'opgw', 'pr', 'opgwD', 'opgwE'].some(function (k) {
        return (r[k] || []).indexOf(item) !== -1;
      });
    });
  }
  /**
   * O que a revisão tem de especial para a ISA: retirada de flambagem ou de
   * pendências, escrita na observação. Sem nenhuma das duas é revisão apenas e não
   * leva nada. Só a REVISÃO é lida: observação livre de outra atividade não é
   * serviço para ir ao lado da torre.
   */
  function notasDaRevisao(prog) {
    // A observação da programação vai para a planilha, entre parênteses depois da
    // torre, em caixa alta como o resto dela: "Retirada de flambagem" na revisão,
    // "Fase A" no lançamento do condutor, o que tiver sido escrito. Cada parte
    // separada por " · " é uma nota.
    var notas = [];
    String(prog.observacao || '').split('·').forEach(function (n) {
      n = n.trim().toUpperCase();
      if (n && notas.indexOf(n) === -1) notas.push(n);
    });
    return notas;
  }

  function regraDe(nome) {
    return DE_PARA_NORM[norm(nome)] || null;
  }

  /**
   * Qual item da ISA esta programação alimenta, dado o tipo da torre.
   *
   * `doisLados` diz que a planilha tem OPGW direito e esquerdo em vez de
   * para-raio e OPGW. Nela um "OPGW" sem lado não tem onde cair: devolve vazio
   * e a programação vai para o relato, em vez de ir calada para o lado errado.
   */
  function itensDe(prog, estrutura, doisLados) {
    var regra = regraDe(prog.atividade ? prog.atividade.nome : '');
    if (!regra) return [];

    if (regra.itens) return regra.itens;
    if (regra.opgw || regra.pr) {
      if (prog.cabo === 'OPGW_DIREITO') return doisLados ? (regra.opgwD || []) : [];
      if (prog.cabo === 'OPGW_ESQUERDO') return doisLados ? (regra.opgwE || []) : [];
      if (doisLados) return [];
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

    // Título da seção em que a linha está ("4.2  LANÇAMENTO DE CABO - PARA-RAIO
    // OPGW ESQUERDO"). Só importa para o OPGW: em Buritirama–Barra e Juazeiro–
    // Campo Formoso as duas seções têm as mesmas linhas, com os mesmos nomes e a
    // mesma numeração, e o título é a única coisa que as separa.
    var secao = '';

    for (var r = 13; r <= ultima; r++) {
      var nome = norm(valor(ws.getCell(r, COL.ATIVIDADE)));
      if (!nome) continue;

      var tarefa = norm(valor(ws.getCell(r, COL.TAREFA)));
      var codigo = String(valor(ws.getCell(r, COL.ITEM)) || '').trim();
      if (!tarefa && /^\d+\.\d+$/.test(codigo)) { secao = nome; continue; }

      var item = porNome[nome];
      if (!item) continue;

      // OPGW com lado: a seção diz qual. 4.2.3 vira 4.2D.3 ou 4.2E.3.
      if (/^4\.2\.\d+$/.test(item)) {
        if (secao.indexOf('direito') !== -1)  item = item.replace('4.2.', '4.2D.');
        else if (secao.indexOf('esquerdo') !== -1) item = item.replace('4.2.', '4.2E.');
      }

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

    // Planilha com OPGW dos dois lados, sem para-raio convencional
    var doisLados = Object.keys(achados).some(function (i) { return /^4\.2[DE]\./.test(i); });

    return { achados: achados, duplicados: duplicados, tortos: tortos, doisLados: doisLados };
  }

  /**
   * A segunda-feira de uma semana da planilha, como "AAAA-MM-DD", ou nulo.
   *
   * As datas são fórmulas encadeadas a partir do cabeçalho (`Q10+1`), então vêm
   * como {formula, result}. O `valor()` desembrulha; o resultado pode ser Date,
   * string ISO ou o serial do Excel, dependendo de como foi digitada.
   */
  function dataDaLinha(ws, linha) {
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

  /** Confere se a planilha é da quinzena escolhida. */
  function conferirDatas(ws, segundaS1) {
    return {
      s1: dataDaLinha(ws, LINHA_DATAS_S1),
      s2: dataDaLinha(ws, LINHA_DATAS_S2),
      esperadoS1: ui.iso(segundaS1),
      esperadoS2: ui.iso(ui.somarDias(segundaS1, 7))
    };
  }

  /* ---------------------------------------------- Montar o que escrever --- */

  /**
   * Agrupa a programação em { item: { semana: { encarregado: { dia: [torres] } } } }.
   * Encarregado vira chave porque a planilha empilha vários dentro da mesma
   * célula, um por linha, e cada célula do dia repete o empilhamento na mesma
   * ordem.
   */
  function agrupar(progs, torresPorId, segundaS1, doisLados) {
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

      if (!regraDe(nomeAtiv)) { semDePara[nomeAtiv] = (semDePara[nomeAtiv] || 0) + 1; return; }

      var itens = itensDe(p, torre.estrutura, doisLados);
      if (!itens.length) {
        // Planilha de OPGW direito/esquerdo e programação com "OPGW" ou
        // "para-raio" sem lado: diz o que falta, em vez de "sem cabo"
        var motivo = '';
        if (doisLados && (p.cabo === 'OPGW' || p.cabo === 'PARA_RAIO')) {
          motivo = ' (falta escolher OPGW direito ou esquerdo)';
        } else if (!doisLados && (p.cabo === 'OPGW_DIREITO' || p.cabo === 'OPGW_ESQUERDO')) {
          motivo = ' (esta planilha não tem OPGW direito e esquerdo)';
        }
        semCabo.push((p.torre ? p.torre.identificador : '?') + ' · ' + nomeAtiv + motivo);
        return;
      }

      var semana = p.data < isoS2 ? 'prog1' : 'prog2';
      var dia = Math.round((ui.paraData(p.data) - ui.paraData(semana === 'prog1' ? isoS1 : isoS2)) / 86400000);
      // Dois encarregados na mesma atividade: a torre aparece na linha dos dois,
      // como a planilha sempre mostrou, mas é UM serviço — a cópia do segundo
      // fica marcada e não entra no total, senão o item dobraria.
      var encs = [p.encarregado, p.encarregado2].filter(function (e) { return !!e; })
        .map(function (e) { return e.nome; });
      if (!encs.length) encs = ['—'];

      itens.forEach(function (item) {
        dados[item] = dados[item] || {};
        dados[item][semana] = dados[item][semana] || {};
        encs.forEach(function (enc, i) {
          dados[item][semana][enc] = dados[item][semana][enc] || {};
          var caixa = dados[item][semana][enc];
          caixa[dia] = caixa[dia] || [];
          caixa[dia].push({
            torre: p.torre ? p.torre.identificador : '?',
            percentual: Number(p.percentual) || 100,
            notas: notasDaRevisao(p),
            copia: i > 0
          });
        });
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

  // Quantas torres seguidas, no mínimo, viram "A À B". Duas ficam como estão.
  var MINIMO_PARA_INTERVALO = 3;

  /**
   * As torres de uma célula, em ordem de torre, com as que vêm uma depois da outra na
   * linha escritas como intervalo: "2/1 À 5/2 (FASE A)" em vez de cada uma. É como a
   * obra escreve o lançamento de cabo e a supressão, e vale para qualquer atividade:
   * de uma torre a outra, em lote.
   *
   * Só junta torres vizinhas na linha, com o mesmo percentual, os mesmos comentários e
   * a mesma situação de cópia; qualquer diferença quebra o intervalo.
   */
  function escreverTorres(itens, posicao) {
    var lista = itens.map(function (x, i) { return { x: x, i: i, pos: posicao[x.torre] }; })
      .sort(function (a, b) {
        var pa = a.pos === undefined ? 1e9 : a.pos, pb = b.pos === undefined ? 1e9 : b.pos;
        return pa - pb || a.i - b.i;
      });

    function entreDe(x) {
      var entre = [];
      if (x.percentual < 100) entre.push(pct(x.percentual));
      (x.notas || []).forEach(function (n) { entre.push(n); });
      return entre.length ? ' (' + entre.join(' · ') + ')' : '';
    }
    function igual(a, b) {
      return a.percentual === b.percentual && !!a.copia === !!b.copia &&
             (a.notas || []).join('|') === (b.notas || []).join('|');
    }

    var saida = [], i = 0;
    while (i < lista.length) {
      var j = i;
      while (j + 1 < lista.length && lista[i].pos !== undefined &&
             lista[j + 1].pos === lista[j].pos + 1 && igual(lista[i].x, lista[j + 1].x)) j++;

      if (j - i + 1 >= MINIMO_PARA_INTERVALO) {
        saida.push(lista[i].x.torre + ' À ' + lista[j].x.torre + entreDe(lista[i].x));
        i = j + 1;
      } else {
        saida.push(lista[i].x.torre + entreDe(lista[i].x));
        i++;
      }
    }
    return saida.join(', ');
  }

  function escreverLinha(ws, linha, porEncarregado, posicao) {
    var encs = Object.keys(porEncarregado).sort();
    if (!encs.length) return 0;

    /**
     * Um encarregado por linha DENTRO da célula, empilhado por quebra de linha —
     * não lado a lado com barra. A célula do dia repete o empilhamento na mesma
     * ordem, e as torres de cada um saem separadas por vírgula:
     *
     *      ENCARREGADO          SEGUNDA            TERÇA
     *      ROMÁRIO              1/1, 2/1           2/2, 3/1
     *      WEMERSON             5/1, 5/2, 6/1      6/2, 8/1, 8/2
     *
     * Precisa de wrapText, senão o Excel mostra tudo grudado numa linha só.
     */
    function empilhar(celula, partes) {
      celula.value = partes.join('\n');
      celula.alignment = Object.assign({}, celula.alignment, { wrapText: true });
    }

    empilhar(ws.getCell(linha, COL.ENCARREGADO),
      encs.map(function (e) { return e.toUpperCase(); }));   // a planilha é toda em caixa alta

    // O total soma PERCENTUAIS, não torres. É o que explica os valores
    // fracionários que já existiam na planilha — `2,5` e `3,5` em montagem não
    // eram erro de digitação, eram meia torre.
    var total = 0;
    for (var dia = 0; dia < 6; dia++) {           // segunda a sábado
      empilhar(ws.getCell(linha, COL.SEGUNDA + dia), encs.map(function (e) {
        var itens = porEncarregado[e][dia];
        if (!itens || !itens.length) return '-';
        // O total soma cada torre, mesmo as que saem juntas num intervalo
        itens.forEach(function (x) { if (!x.copia) total += x.percentual / 100; });

        // Entre parênteses, depois da torre ou do intervalo: o percentual, se a torre
        // foi repartida (senão a célula diz que a torre inteira foi feita naquele
        // dia), e os comentários da programação.
        return escreverTorres(itens, posicao || {});
      }));
    }
    ws.getCell(linha, COL.SEGUNDA + 6).value = 'DSR';    // domingo
    ws.getCell(linha, COL.TOTAL).value =
      total ? Math.round(total * 100) / 100 : '-';

    ws.getRow(linha).hidden = false;             // senão ninguém vê o que foi escrito
    return total;
  }

  /* ------------------------------------------------- Importar da planilha --- */

  /**
   * O caminho inverso do exportador: lê o que está nas linhas PROG. 1 e PROG. 2 e
   * devolve as programações que isso representa.
   *
   * Existe porque a programação da sexta já nasce na planilha, e lançá-la de novo
   * no SIPAV, torre por torre, é horas de trabalho repetido. Aqui a planilha é só
   * lida: nada é gravado, e quem chama mostra uma prévia antes de criar qualquer
   * coisa.
   *
   * O que ela faz:
   *   - acha as linhas pelo nome do item, como o exportador;
   *   - cada dia tem as torres de cada encarregado, uma linha por encarregado na
   *     mesma ordem da coluna de encarregados: "1/1, 2/1 (50%)";
   *   - o percentual e a retirada de flambagem/pendências vêm entre parênteses;
   *   - a torre que aparece nas linhas de dois encarregados é UMA programação com
   *     os dois (o segundo encarregado), e não duas;
   *   - os itens que são partes de uma atividade do SIPAV (escavação do estai e do
   *     mastro central, por exemplo) voltam a ser a atividade inteira.
   *
   * Só os itens do catálogo, que são os que o SIPAV programa. Os preenchidos à
   * mão na planilha (topografia, canteiro, quilometragem) não são lidos.
   *
   * @param {File}   arquivo  .xlsx do trecho
   * @param {object} ctx      {torres:[{torre_id, identificador, estrutura}],
   *                           encarregados:[{id, nome}], atividades:[{id, nome}],
   *                           segundaS1?: 'AAAA-MM-DD' (vale sobre a da planilha)}
   * @returns {Promise<{datas, registros, problemas, resumo}>}
   */
  function interpretar(arquivo, ctx) {
    if (!window.ExcelJS) {
      return Promise.reject(new Error('A biblioteca de planilha não carregou. Recarregue a página.'));
    }
    var wb = new ExcelJS.Workbook();

    return arquivo.arrayBuffer()
      .then(function (buf) { return wb.xlsx.load(buf); })
      .then(function () {
        var ws = wb.getWorksheet('PS');
        if (!ws) throw new Error('Não achei a aba "PS" neste arquivo. É a planilha certa?');
        if (norm(valor(ws.getCell(9, COL.ITEM))) !== 'item') {
          throw new Error('As colunas desta planilha não estão onde deveriam: a linha 9 deveria ' +
                          'começar com ITEM na coluna C.');
        }
        return interpretarAba(ws, ctx || {});
      });
  }

  /** Os itens que aparecem nas linhas de cabo, e o cabo de cada um. */
  function caboDoItem(item) {
    if (/^4\.1\./.test(item)) return 'PARA_RAIO';
    if (/^4\.2D\./.test(item)) return 'OPGW_DIREITO';
    if (/^4\.2E\./.test(item)) return 'OPGW_ESQUERDO';
    if (/^4\.2\./.test(item)) return 'OPGW';
    return null;
  }

  /** Divide por vírgula, mas não a que está dentro de parênteses. */
  function dividirNaVirgula(texto) {
    var partes = [], atual = '', fundo = 0;
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charAt(i);
      if (c === '(') fundo++;
      if (c === ')') fundo = Math.max(0, fundo - 1);
      if (c === ',' && fundo === 0) { partes.push(atual); atual = ''; continue; }
      atual += c;
    }
    partes.push(atual);
    return partes.map(function (p) { return p.trim(); }).filter(Boolean);
  }

  /**
   * Texto de anotação da planilha como frase: "IÇAMENTO DE CADEIA" → "Içamento de
   * cadeia", "FASE B - PORTICO" → "Fase B - pórtico".
   */
  function frase(texto) {
    var s = String(texto).trim().replace(/\s+/g, ' ').toLowerCase().replace(/\bportico\b/g, 'pórtico');
    // "FASE B - PORTICO" é o pórtico, na fase B: o que é vem primeiro, a fase depois
    var fase = /^fase ([a-c](?:\s*,\s*[a-c])*)\s+-\s+(.+)$/.exec(s);
    if (fase) s = fase[2] + ' · Fase ' + fase[1].toUpperCase();
    else s = s.replace(/\bfase ([a-c](?:\s*,\s*[a-c])*)\b/g, function (m, l) { return 'fase ' + l.toUpperCase(); });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** "61/1 (50% · RETIRADA DE FLAMBAGEM)" → {torre, percentual, notas} */
  function interpretarToken(token) {
    var m = /^([^(]*?)\s*(?:\(([^)]*)\))?\s*$/.exec(token);
    var torre = (m ? m[1] : token).trim();
    var dentro = m && m[2] ? m[2] : '';

    var percentual = null, notas = [];
    if (/^fase\s+[a-c](\s*,\s*[a-c])*$/i.test(dentro.trim())) {
      return { torre: torre, percentual: null, notas: [frase(dentro.trim())] };
    }
    dentro.split(/[·+;]|,\s*/).forEach(function (parte) {
      parte = parte.trim();
      if (!parte) return;
      var p = /^(\d+(?:[.,]\d+)?)\s*%$/.exec(parte);
      if (p) percentual = Number(p[1].replace(',', '.'));
      else notas.push(parte);
    });

    return { torre: torre, percentual: percentual, notas: notas };
  }

  /** O texto de uma célula, com as quebras de linha da planilha. */
  function textoDaCelula(ws, linha, col) {
    var v = valor(ws.getCell(linha, col));
    return v == null ? '' : String(v).replace(/\r/g, '').trim();
  }

  function semTexto(t) { return !t || t === '-' || /^dsr$/i.test(t); }

  function interpretarAba(ws, ctx) {
    var problemas = [];
    function problema(tipo, texto) { problemas.push({ tipo: tipo, texto: texto }); }

    var mapa = mapearLinhas(ws);
    var lidas = lerDatasDaPlanilha(ws, ctx);

    // Índices
    var torres = {};
    (ctx.torres || []).forEach(function (t) {
      var k = norm(t.identificador);
      if (!(k in torres)) torres[k] = t;
    });
    var atividades = {};
    (ctx.atividades || []).forEach(function (a) { atividades[norm(a.nome)] = a; });

    // A ordem em que as torres vêm é a da linha (o banco devolve por `ordem`):
    // é por ela que "0/2 A 5/1" vira a lista de torres do meio
    var posicaoDaTorre = {};
    (ctx.torres || []).forEach(function (t, i) {
      var k = norm(t.identificador);
      if (!(k in posicaoDaTorre)) posicaoDaTorre[k] = i;
    });

    // O pórtico é um card como as torres, se o trecho o tiver cadastrado. Pode ter os
    // dois (um na ponta de cada lado da linha), um só, ou nenhum: há trechos que pegam
    // uma parte da linha que começa no pórtico e não termina em outro. Qual é qual vem
    // da posição: antes da metade das torres é o do começo, depois é o do fim.
    function ehPortico(nome) { return /^portico/.test(norm(nome)); }
    var porticos = [], posReais = [];
    (ctx.torres || []).forEach(function (t, i) {
      if (ehPortico(t.identificador)) porticos.push({ torre: t, pos: i }); else posReais.push(i);
    });
    var meioDaLinha = posReais.length ? (Math.min.apply(null, posReais) + Math.max.apply(null, posReais)) / 2 : 0;
    porticos.forEach(function (p) { p.lado = p.pos < meioDaLinha ? 'inicio' : 'fim'; });
    var porticoFaltando = { inicio: 0, fim: 0, indefinido: 0 };
    var pendentesPortico = [];

    /** De que ponta da linha são essas torres: a média da posição, antes ou depois da metade. */
    function ladoDasTorres(nomes) {
      var pos = nomes.filter(function (n) { return !ehPortico(n); })
        .map(function (n) { return posicaoDaTorre[norm(n)]; })
        .filter(function (p) { return p !== undefined; });
      if (!pos.length) return null;
      var media = pos.reduce(function (s, p) { return s + p; }, 0) / pos.length;
      return media < meioDaLinha ? 'inicio' : 'fim';
    }

    /**
     * "49/2 à 59/2", "0/2 A 5/1": de uma torre a outra, as duas incluídas. É como a
     * obra escreve o lançamento de cabo, que corre vários vãos. Devolve os nomes das
     * torres do intervalo, ou nulo se não for um intervalo conhecido.
     */
    function faixaDeTorres(texto) {
      var m = /^(\S+)\s+(?:a|à|ate|até|ao)\s+(\S+)$/i.exec(texto.trim());
      if (!m) return null;
      var de = posicaoDaTorre[norm(m[1])], ate = posicaoDaTorre[norm(m[2])];
      if (de === undefined || ate === undefined) return null;
      var nomes = [], passo = de <= ate ? 1 : -1;
      for (var i = de; passo > 0 ? i <= ate : i >= ate; i += passo) nomes.push(ctx.torres[i].identificador);
      return nomes;
    }

    /**
     * Um pedaço de célula com cara de torre (tem "n/n"): as torres que ele nomeia e os
     * rótulos que carrega. "0/2 A 8/1 FASE B" são as torres entre as duas pontas, com
     * "Fase B" de comentário; "IÇAMENTO DE CADEIA - 0/2" é a torre 0/2, com o comentário.
     * Sem "n/n" não é torre: devolve nulo.
     */
    function lerTorreDoToken(t) {
      var texto = t.torre, rotulos = [];

      // "FASE B - PORTICO", "PORTICO": o próprio pórtico, se ele é uma torre do trecho
      var fasePortico = /^fase\s+([a-c])\s+-\s+(.+)$/i.exec(texto);
      var restoPortico = fasePortico ? fasePortico[2] : texto;
      if (norm(restoPortico) === 'portico') {
        return { portico: true, texto: texto,
                 rotulos: fasePortico ? ['Fase ' + fasePortico[1].toUpperCase()] : [] };
      }

      if (!/\d+\/\d+/.test(texto)) return null;

      var fase = /^(.*\S)\s+(fase\s+[a-c])$/i.exec(texto);
      if (fase) { texto = fase[1]; rotulos.push(frase(fase[2])); }

      var rot = /^(.+?)\s+-\s+(\S+)$/.exec(texto);
      if (rot && !/\d+\/\d+/.test(rot[1]) && /^\d+\/\d+$/.test(rot[2])) {
        texto = rot[2]; rotulos.push(frase(rot[1]));
      }
      return { nomes: faixaDeTorres(texto) || [texto], rotulos: rotulos };
    }

    /** "PAULO / RAIMUNDO" são dois; a aspa que sobra no começo é de digitação. */
    function nomesDaEquipe(texto) {
      return String(texto).replace(/^['"’`´]+/, '').split('/')
        .map(function (n) { return n.trim(); }).filter(function (n) { return n && !semTexto(n); });
    }

    // Anotações que a obra escreve onde iria a torre. Não são torres e não dá para
    // programá-las: ficam de fora, mas num aviso só, e não como "torre que não existe".
    var ehAnotacao = /feriado|folga|mudan[cç]a|portico|p[oó]rtico|fase [abc]|prepara[cç][aã]o|i[cç]amento/i;
    var anotacoes = {};

    /**
     * Algumas anotações são dias sem atividade de verdade e viram registro no SIPAV:
     * FOLGA DE CAMPO, MUDANÇA DE MÁQUINA e MUDANÇA PARA <lugar>. A mudança para um
     * lugar entra como "outro motivo", com o texto: a planilha diz só para onde, e a
     * mudança de trecho do SIPAV pede também de onde.
     */
    function movimentoDaAnotacao(texto) {
      var n = norm(texto);
      if (/^folga( de campo)?$/.test(n)) return { tipo: 'FOLGA_CAMPO', obs: '' };
      if (/^feriado$/.test(n)) return { tipo: 'FERIADO', obs: '' };
      if (/^mudanca de maquina$/.test(n)) return { tipo: 'MUDANCA_MAQUINA', obs: '' };
      var m = /^mudan[cç]a para\s+(.+)$/i.exec(texto.trim());
      if (m) {
        var lugar = m[1].toLowerCase().replace(/(^|\s)(\S)/g, function (x, a, b) { return a + b.toUpperCase(); });
        return { tipo: 'MUDANCA_TRECHO', destino: lugar, obs: '' };
      }
      return null;
    }
    var movimentosBrutos = [];    // O que a pessoa escolheu na prévia para um nome que o SIPAV não reconheceu
    var apelidos = ctx.apelidos || {};
    var candidatosDe = {};

    // O mesmo nome da planilha pode ser pessoas diferentes em atividades diferentes (o
    // Benedito do piloto do condutor e o do OPGW): a escolha vale para o nome em todas as
    // atividades, ou só para o nome numa atividade ("benedito|lancamento do piloto...").
    // Escolhas que o sistema tirou sozinho do que já está programado (ver
    // inferirDoQueJaExiste). Vêm depois das explícitas e do nome que bate sozinho.
    var apelidosAuto = {};
    var viaAuto = false;           // a última busca terminou numa escolha automática
    var autoUsado = {}, autoQtd = {}, nomesAuto = {};

    function acharEncarregado(nome, atividade, semAuto) {
      var k = norm(nome);
      var lista = ctx.encarregados || [];
      var ka = atividade ? k + '|' + norm(atividade) : null;
      viaAuto = false;

      function achar(id) { return lista.filter(function (e) { return e.id === id; })[0] || null; }

      // "Deixar de fora", escolhido na prévia, vale mais que qualquer inferência
      var fora = (ka && apelidos[ka] === '__fora__') || apelidos[k] === '__fora__';

      // As escolhas feitas na prévia (ou guardadas da última importação) também voltam como
      // linhas, para a pessoa ver e poder trocar
      if (!fora && ka && ka in apelidos) { var ea = achar(apelidos[ka]); if (ea) viaAuto = true; return ea; }
      if (!fora && k in apelidos) { var eb = achar(apelidos[k]); if (eb) viaAuto = true; return eb; }

      var exato = lista.filter(function (e) { return norm(e.nome) === k; });
      if (!fora && exato.length === 1) return exato[0];

      // O nome da planilha pode vir encurtado ("FRANCISCO"). Só vale se for único
      var partes = k.split(' ').filter(Boolean);
      var contem = lista.filter(function (e) {
        var n = ' ' + norm(e.nome) + ' ';
        return partes.length && partes.every(function (p) { return n.indexOf(' ' + p + ' ') !== -1; });
      });
      if (!fora && contem.length === 1) return contem[0];

      if (!fora && !semAuto && ka && ka in apelidosAuto) {
        var e = achar(apelidosAuto[ka]);
        if (e) { viaAuto = true; return e; }
      }

      // Mais de um cabe ("BENEDITO" com dois Beneditos): quem decide é a pessoa
      candidatosDe[k] = (exato.length > 1 ? exato : contem).map(function (e) { return { id: e.id, nome: e.nome }; });
      return null;
    }
    // ---- 1. As linhas cruas: item, dia, encarregado, torre ----
    var brutas = [];
    var encDesconhecidos = {}, torresDesconhecidas = {};

    // O que a planilha diz de cada nome que não foi reconhecido: em que atividades
    // aparece, com quem, em que dias e em que torres. É o que ajuda a decidir qual
    // dos encarregados do SIPAV ele é.
    var contextoDe = {};
    function anotarContexto(nome, b, atividade) {
      var k = norm(nome);
      var c = contextoDe[k] = contextoDe[k] || { atividades: {}, parceiros: {}, dias: [], torres: [] };
      c.atividades[atividade] = (c.atividades[atividade] || 0) + 1;
      b.encNomes.forEach(function (n) { if (norm(n) !== k) c.parceiros[n] = (c.parceiros[n] || 0) + 1; });
      if (c.dias.indexOf(b.data) === -1) c.dias.push(b.data);
      if (b.torreTexto && !ehPortico(b.torreTexto) && c.torres.length < 5 && c.torres.indexOf(b.torreTexto) === -1) {
        c.torres.push(b.torreTexto);
      }
    }
    Object.keys(mapa.achados).forEach(function (item) {
      ['prog1', 'prog2'].forEach(function (semana) {
        var linha = mapa.achados[item][semana];
        var segunda = semana === 'prog1' ? lidas.s1 : lidas.s2;
        if (!segunda) return;

        var textoEnc = textoDaCelula(ws, linha, COL.ENCARREGADO);
        var nomes = semTexto(textoEnc) ? [] : textoEnc.split('\n').map(function (n) { return n.trim(); });

        for (var dia = 0; dia < 7; dia++) {
          var texto = textoDaCelula(ws, linha, COL.SEGUNDA + dia);
          if (semTexto(texto)) continue;

          var linhas = texto.split('\n').map(function (l) { return l.trim(); });
          linhas.forEach(function (l, i) {
            if (semTexto(l)) return;

            var nomeEnc = nomes.length ? nomes[i] : null;
            if (nomes.length && nomeEnc === undefined) {
              problema('celula', 'Item ' + item + ', dia ' + ui.dataCurta(ui.iso(ui.somarDias(ui.paraData(segunda), dia))) +
                ': tem mais linhas de torre do que encarregados. "' + l + '" ficou de fora.');
              return;
            }

            // Uma linha da célula é uma equipe. Dentro dela há torres e, às vezes,
            // anotações ("PORTICO", "FASE B - PORTICO"). A anotação junto de torres vira
            // comentário nelas; sozinha, é um dia sem atividade da equipe.
            var dataDoDia = ui.iso(ui.somarDias(ui.paraData(segunda), dia));
            var equipeDaLinha = nomeEnc && !semTexto(nomeEnc) ? nomesDaEquipe(nomeEnc) : [];
            var daLinha = [], soltas = [], porticosDaLinha = [];

            dividirNaVirgula(l).forEach(function (token) {
              var t = interpretarToken(token);
              var lida = lerTorreDoToken(t);

              if (lida && lida.portico) { porticosDaLinha.push(lida); return; }

              if (!lida) {
                var mov = movimentoDaAnotacao(t.torre);
                if (mov) {
                  movimentosBrutos.push({ tipo: mov.tipo, obs: mov.obs, destino: mov.destino, data: dataDoDia,
                                          encNomes: mov.tipo === 'FERIADO' ? [] : equipeDaLinha });
                } else {
                  soltas.push(frase(t.torre));
                }
                return;
              }

              lida.nomes.forEach(function (nomeTorre) {
                daLinha.push({
                  item: item, semana: semana, dia: dia, data: dataDoDia,
                  encNomes: equipeDaLinha,
                  torreTexto: nomeTorre, percentual: t.percentual,
                  notas: t.notas.concat(lida.rotulos)
                });
              });
            });

            // O pórtico da ponta de onde ficam as torres da linha. Sem torres na linha,
            // decide-se depois, pelas outras torres da mesma equipe no mesmo dia.
            var ladoDaLinha = daLinha.length ? ladoDasTorres(daLinha.map(function (b) { return b.torreTexto; })) : null;
            porticosDaLinha.forEach(function (pt) {
              var cand = ladoDaLinha ? porticos.filter(function (p) { return p.lado === ladoDaLinha; })[0] : null;
              if (cand) {
                // A fase vale para o trecho todo, pórtico e torres da linha
                daLinha.forEach(function (b) {
                  if (b.ehPortico) return;
                  pt.rotulos.forEach(function (r) { if (b.notas.indexOf(r) === -1) b.notas.push(r); });
                });
                // "PORTICO, 0/2" no lançamento do cabo (x.x.3) e no nivelamento (x.x.4) é do pórtico até a
                // torre: o cabo passa pelas do meio (a 0/1), e não dá para lançar nem nivelar do pórtico à
                // 0/2 pulando uma. A ancoragem fica de fora: é só nas pontas.
                var noSpan = /^4\.(?:1|2|2D|2E|3)\.[34]$/.test(item);
                // O que a torre diz de si (Fase A, B, C) vale para o trecho todo, pórtico incluído
                var notasDoSpan = pt.rotulos.slice();
                if (noSpan) {
                  daLinha.forEach(function (b) {
                    if (b.ehPortico) return;
                    b.notas.forEach(function (n) { if (/^fase\b/i.test(n) && notasDoSpan.indexOf(n) === -1) notasDoSpan.push(n); });
                  });
                }
                if (noSpan) {
                  var posDaLinha = daLinha.filter(function (b) { return !ehPortico(b.torreTexto); })
                    .map(function (b) { return posicaoDaTorre[norm(b.torreTexto)]; })
                    .filter(function (q) { return q !== undefined; });
                  if (posDaLinha.length) {
                    var deP = cand.lado === 'inicio' ? cand.pos + 1 : Math.min.apply(null, posDaLinha);
                    var ateP = cand.lado === 'inicio' ? Math.max.apply(null, posDaLinha) : cand.pos - 1;
                    for (var q = deP; q <= ateP; q++) {
                      var meio = ctx.torres[q];
                      if (!meio || ehPortico(meio.identificador)) continue;
                      if (daLinha.some(function (b) { return norm(b.torreTexto) === norm(meio.identificador); })) continue;
                      daLinha.push({ item: item, semana: semana, dia: dia, data: dataDoDia, encNomes: equipeDaLinha,
                                     torreTexto: meio.identificador, percentual: null, notas: notasDoSpan.slice() });
                    }
                  }
                }
                daLinha.push({ item: item, semana: semana, dia: dia, data: dataDoDia, encNomes: equipeDaLinha,
                               torreTexto: cand.torre.identificador, percentual: null, notas: notasDoSpan.slice(), ehPortico: true });
              } else if (ladoDaLinha) {
                porticoFaltando[ladoDaLinha]++;
                soltas.push(frase(pt.texto));
              } else {
                pendentesPortico.push({ item: item, semana: semana, dia: dia, data: dataDoDia, encNomes: equipeDaLinha, pt: pt });
              }
            });

            if (soltas.length && daLinha.length) {
              daLinha.filter(function (b) { return !b.ehPortico; }).forEach(function (b) {
                soltas.forEach(function (s) { if (b.notas.indexOf(s) === -1) b.notas.push(s); });
              });
            } else if (soltas.length) {
              var atividadeDoItem = atividadesDoItem(item)[0] || rotuloDoItem(item);
              soltas.forEach(function (s) {
                movimentosBrutos.push({ tipo: 'OUTRO', obs: s + ' · ' + frase(atividadeDoItem),
                                        data: dataDoDia, encNomes: equipeDaLinha });
              });
            }
            daLinha.forEach(function (b) { brutas.push(b); });
          });
        }
      });
    });

    // Pórtico sozinho na linha: o lado vem das outras torres da mesma equipe no mesmo dia
    pendentesPortico.forEach(function (pp) {
      // A mesma equipe, ou alguém dela, no mesmo dia
      var mesmas = brutas.filter(function (b) {
        return b.data === pp.data && !ehPortico(b.torreTexto) &&
               b.encNomes.some(function (n) { return pp.encNomes.indexOf(n) !== -1; });
      });
      var lado = ladoDasTorres(mesmas.map(function (b) { return b.torreTexto; }));
      var cand = lado ? porticos.filter(function (p) { return p.lado === lado; })[0] : null;

      if (cand) {
        brutas.push({ item: pp.item, semana: pp.semana, dia: pp.dia, data: pp.data, encNomes: pp.encNomes,
                      torreTexto: cand.torre.identificador, percentual: null, notas: pp.pt.rotulos.slice(), ehPortico: true });
      } else {
        porticoFaltando[lado || 'indefinido']++;
        var atividadeDoPortico = atividadesDoItem(pp.item)[0] || rotuloDoItem(pp.item);
        movimentosBrutos.push({ tipo: 'OUTRO', obs: frase(pp.pt.texto) + ' · ' + frase(atividadeDoPortico),
                                data: pp.data, encNomes: pp.encNomes });
      }
    });

    /**
     * Quem é o "BENEDITO" da planilha, descoberto no que já está programado: a mesma torre,
     * na mesma data, na mesma atividade (e cabo) já tem um encarregado, e ele é o nome que
     * falta. Vale por nome e atividade quando a maioria (80%) dos casos aponta a mesma
     * pessoa. Serve para importar de novo a mesma planilha sem refazer as escolhas.
     */
    (function inferirDoQueJaExiste() {
      var existentes = ctx.existentes || [];
      if (!existentes.length) return;

      var porTorreDia = {};
      existentes.forEach(function (p) { (porTorreDia[p.torreId + '|' + p.data] = porTorreDia[p.torreId + '|' + p.data] || []).push(p); });

      var votos = {};
      brutas.forEach(function (b) {
        var tor = torres[norm(b.torreTexto)];
        if (!tor) return;
        var nomesAtv = atividadesDoItem(b.item);
        var atv = nomesAtv[0] || rotuloDoItem(b.item);
        var cabo = caboDoItem(b.item);

        var conhecidos = [], desconhecidos = [];
        b.encNomes.forEach(function (n) {
          var e = acharEncarregado(n, atv, true);
          if (e) conhecidos.push(e.id); else desconhecidos.push(n);
        });
        if (desconhecidos.length !== 1) return;   // com dois a descobrir na mesma linha, não dá para saber qual é qual

        var ids = [];
        (porTorreDia[tor.torre_id + '|' + b.data] || []).forEach(function (p) {
          if (nomesAtv.map(norm).indexOf(norm(p.atividadeNome)) === -1) return;
          if (cabo && p.cabo !== cabo) return;
          p.encIds.forEach(function (id) { if (conhecidos.indexOf(id) === -1 && ids.indexOf(id) === -1) ids.push(id); });
        });
        if (ids.length !== 1) return;

        var ka = norm(desconhecidos[0]) + '|' + norm(atv);
        votos[ka] = votos[ka] || {};
        votos[ka][ids[0]] = (votos[ka][ids[0]] || 0) + 1;
      });

      Object.keys(votos).forEach(function (ka) {
        var ids = Object.keys(votos[ka]);
        var total = ids.reduce(function (s, id) { return s + votos[ka][id]; }, 0);
        var melhor = ids.sort(function (a, b) { return votos[ka][b] - votos[ka][a]; })[0];
        if (votos[ka][melhor] / total >= 0.8) apelidosAuto[ka] = melhor;
      });
    })();

    function registrarAuto(nome, b, atividade, e) {
      var k = norm(nome);
      (autoUsado[k] = autoUsado[k] || {})[k + '|' + norm(atividade)] = e.id;
      autoQtd[k] = (autoQtd[k] || 0) + 1;
      nomesAuto[k] = nomesAuto[k] || nome;
      anotarContexto(nome, b, atividade);
    }

    // ---- 2. Resolve torre e encarregado ----
    var porItem = {};      // torre|data|item → {torre, data, item, encs:[], pct, notas}

    // Torre que o trecho não tem ("16/2") mas existe com outro sufixo ("16/1"): se a
    // vizinha não está programada na mesma atividade, foi erro de digitação e vale a
    // vizinha. Se já está, quem lançou achou que havia uma 16/2 e programou outra coisa:
    // não entra. Só vale com uma vizinha só; com duas, não se adivinha.
    var usadas = {};
    brutas.forEach(function (b) {
      var t = torres[norm(b.torreTexto)];
      if (t) (usadas[b.item] = usadas[b.item] || {})[t.torre_id] = true;
    });
    var assumidas = {}, recusadas = {};

    function vizinhaDaTorre(b) {
      var m = /^(\d+)\/\d+$/.exec(b.torreTexto.trim());
      if (!m) return null;
      var vizinhas = (ctx.torres || []).filter(function (t) { return t.identificador.indexOf(m[1] + '/') === 0; });
      if (vizinhas.length !== 1) return null;

      var v = vizinhas[0];
      var chave = b.torreTexto.trim() + '|' + v.identificador + '|' + b.item;
      var info = { de: b.torreTexto.trim(), para: v.identificador, item: (atividadesDoItem(b.item)[0] || rotuloDoItem(b.item)) + ' (' + b.item + ')', n: 0 };
      if (usadas[b.item] && usadas[b.item][v.torre_id]) {
        recusadas[chave] = recusadas[chave] || info;
        recusadas[chave].n++;
        return 'recusada';
      }
      assumidas[chave] = assumidas[chave] || info;
      assumidas[chave].n++;
      (usadas[b.item] = usadas[b.item] || {})[v.torre_id] = true;
      return v;
    }

    brutas.forEach(function (b) {
      var torre = torres[norm(b.torreTexto)];
      if (!torre) {
        var viz = vizinhaDaTorre(b);
        if (viz === 'recusada') return;
        if (viz) torre = viz;
      }
      if (!torre) {
        var mov = movimentoDaAnotacao(b.torreTexto);
        if (mov) {
          movimentosBrutos.push({ tipo: mov.tipo, obs: mov.obs, destino: mov.destino, data: b.data, encNomes: b.encNomes });
          return;
        }
        if (ehAnotacao.test(b.torreTexto)) {
          var nota = b.torreTexto.trim().toUpperCase();
          anotacoes[nota] = (anotacoes[nota] || 0) + 1;
        } else {
          torresDesconhecidas[b.torreTexto] = (torresDesconhecidas[b.torreTexto] || 0) + 1;
        }
        return;
      }

      // A equipe da célula: um nome, ou dois ("A / B") que fazem juntos
      var equipe = [], faltou = false;
      b.encNomes.forEach(function (nome) {
        var atividadeDoNome = atividadesDoItem(b.item)[0] || rotuloDoItem(b.item);
        var e = acharEncarregado(nome, atividadeDoNome);
        if (e && viaAuto) registrarAuto(nome, b, atividadeDoNome, e);
        if (!e) {
          encDesconhecidos[nome] = (encDesconhecidos[nome] || 0) + 1; faltou = true;
          anotarContexto(nome, b, atividadeDoNome);
        }
        else if (!equipe.some(function (x) { return x.id === e.id; })) equipe.push(e);
      });
      if (faltou) return;
      // Uma torre nas linhas de dois encarregados avulsos é um serviço com os dois (DEC-22);
      // duas duplas na mesma torre são duas equipes, e não se fundem
      var chave = torre.torre_id + '|' + b.data + '|' + b.item +
        (equipe.length > 1 ? '|' + equipe.map(function (e) { return e.id; }).sort().join('+') : '');
      var x = porItem[chave] = porItem[chave] || {
        torre: torre, data: b.data, item: b.item, encs: [], percentual: null, notas: []
      };
      equipe.forEach(function (enc) {
        if (!x.encs.some(function (e) { return e.id === enc.id; })) x.encs.push(enc);
      });
      if (b.percentual != null && x.percentual == null) x.percentual = b.percentual;
      b.notas.forEach(function (n) { if (x.notas.indexOf(n) === -1) x.notas.push(n); });
    });

    // Os dias sem atividade: um por tipo, dia, motivo e equipe, mesmo que a anotação
    // se repita em vários itens da planilha
    var movimentos = {};
    movimentosBrutos.forEach(function (b) {
      var equipe = [], faltou = false;
      b.encNomes.forEach(function (nome) {
        var e = acharEncarregado(nome, 'Dia sem atividade');
        if (e && viaAuto) registrarAuto(nome, b, 'Dia sem atividade', e);
        if (!e) {
          encDesconhecidos[nome] = (encDesconhecidos[nome] || 0) + 1; faltou = true;
          anotarContexto(nome, b, 'Dia sem atividade');
        }
        else if (!equipe.some(function (x) { return x.id === e.id; })) equipe.push(e);
      });
      if (faltou) return;
      // Mudança de trecho sem encarregado não tem quem mudou: fica como o texto da planilha
      var tipo = b.tipo, obs = b.obs;
      if (tipo === 'MUDANCA_TRECHO' && !equipe.length) { tipo = 'OUTRO'; obs = 'Mudança para ' + b.destino; }
      var chave = [tipo, b.data, obs, b.destino || '', equipe.map(function (e) { return e.id; }).sort().join('+')].join('|');
      if (movimentos[chave]) return;
      movimentos[chave] = {
        tipo: tipo, data: b.data, observacao: obs, destinoTexto: tipo === 'MUDANCA_TRECHO' ? b.destino : null,
        encarregados: equipe.map(function (e) { return e.nome; }),
        encarregadoId: equipe[0] ? equipe[0].id : null,
        encarregado2Id: equipe[1] ? equipe[1].id : null
      };
    });

    Object.keys(assumidas).sort().forEach(function (k) {
      var a = assumidas[k];
      problema('assumida', 'Torre ' + a.de + ' não existe: assumi ' + a.para + ' como erro de digitação, em "' +
               a.item + '" (' + a.n + ' lançamento(s)). Confira.');
    });
    Object.keys(recusadas).sort().forEach(function (k) {
      var a = recusadas[k];
      problema('torre', 'Torre ' + a.de + ' não existe, e a ' + a.para + ' já está programada em "' + a.item +
               '": quem lançou deve ter achado que havia uma ' + a.de + '. Não entrou (' + a.n + ').');
    });
    var avulsas = Object.keys(anotacoes);
    if (avulsas.length) {
      problema('texto', 'Anotações da planilha que não são torre, ficaram de fora: ' +
        avulsas.sort().map(function (n) { return n + ' (' + anotacoes[n] + ')'; }).join(' · ') + '.');
    }

    Object.keys(torresDesconhecidas).sort().forEach(function (t) {
      problema('torre', 'Torre "' + t + '" não existe neste trecho (' + torresDesconhecidas[t] + ' ocorrência(s)).');
    });
    // Os nomes que não foram reconhecidos, juntando as grafias que dão no mesmo
    // ("ANTONIO JOSE" e "ANTONIO JOSÉ"), para a prévia deixar escolher quem é
    function montarContexto(k) {
      var c = contextoDe[k];
      if (!c) return undefined;
      return {
        atividades: Object.keys(c.atividades).map(function (a) { return { nome: a, qtd: c.atividades[a], chave: k + '|' + norm(a) }; })
          .sort(function (a, b) { return b.qtd - a.qtd; }),
        parceiros: Object.keys(c.parceiros),
        primeiro: c.dias.slice().sort()[0], ultimo: c.dias.slice().sort().slice(-1)[0],
        torres: c.torres
      };
    }

    var naoReconhecidos = {};
    Object.keys(encDesconhecidos).forEach(function (nome) {
      var k = norm(nome);
      var x = naoReconhecidos[k] = naoReconhecidos[k] || { chave: k, nome: nome, qtd: 0, candidatos: candidatosDe[k] || [] };
      x.qtd += encDesconhecidos[nome];
      x.contexto = montarContexto(k);
    });

    Object.keys(naoReconhecidos).sort().forEach(function (k) {
      var x = naoReconhecidos[k];
      problema('encarregado', x.candidatos.length > 1
        ? 'Encarregado "' + x.nome + '": há mais de um no SIPAV (' +
          x.candidatos.map(function (c) { return c.nome; }).join(', ') + '). Escolha qual, logo abaixo (' +
          x.qtd + ' lançamento(s) de fora).'
        : 'Encarregado "' + x.nome + '" não está cadastrado (' + x.qtd +
          ' lançamento(s) de fora). Escolha quem é, logo abaixo, ou cadastre e leia de novo.');
    });

    // Os nomes que se resolveram sozinhos, pelo que já está programado, continuam na
    // prévia com a escolha marcada: a pessoa confere e troca, se quiser
    Object.keys(autoUsado).forEach(function (k) {
      var x = naoReconhecidos[k] = naoReconhecidos[k] || { chave: k, nome: nomesAuto[k], qtd: 0, candidatos: candidatosDe[k] || [] };
      x.qtd += autoQtd[k];
      x.auto = autoUsado[k];
      x.contexto = montarContexto(k);
    });

    // ---- 3. Os itens viram atividades ----
    // Agrupa por torre, dia e equipe: os itens de uma mesma equipe, na mesma torre e
    // no mesmo dia, podem ser uma atividade só (escavação do estai + do mastro).
    var grupos = {};
    Object.keys(porItem).forEach(function (k) {
      var x = porItem[k];
      var equipe = x.encs.map(function (e) { return e.id; }).sort().join('+');
      var g = x.torre.torre_id + '|' + x.data + '|' + equipe;
      grupos[g] = grupos[g] || { torre: x.torre, data: x.data, encs: x.encs, itens: [] };
      grupos[g].itens.push(x);
    });

    var registros = {};
    Object.keys(grupos).forEach(function (g) {
      var grupo = grupos[g];
      var estrutura = grupo.torre.estrutura;
      var presentes = grupo.itens.map(function (x) { return x.item; });
      var infoDe = {};
      grupo.itens.forEach(function (x) { infoDe[x.item] = x; });

      function guardar(nomeAtiv, itensUsados, cabo) {
        var atv = atividades[norm(nomeAtiv)];
        if (!atv) {
          problema('atividade', 'A atividade "' + nomeAtiv + '" não existe no SIPAV (torre ' +
                   grupo.torre.identificador + ', ' + ui.dataCurta(grupo.data) + ').');
          return;
        }

        var primeiro = infoDe[itensUsados[0]];
        var notas = [];
        itensUsados.forEach(function (i) {
          infoDe[i].notas.forEach(function (n) { if (notas.indexOf(n) === -1) notas.push(n); });
        });

        var chave = [grupo.torre.torre_id, atv.id, grupo.data,
                     grupo.encs.map(function (e) { return e.id; }).join('+'), cabo || ''].join('|');
        if (registros[chave]) return;

        registros[chave] = {
          torreId: grupo.torre.torre_id, torre: grupo.torre.identificador,
          estrutura: estrutura || null,
          atividadeId: atv.id, atividade: atv.nome,
          data: grupo.data,
          encarregadoId: grupo.encs[0] ? grupo.encs[0].id : null,
          encarregado2Id: grupo.encs[1] ? grupo.encs[1].id : null,
          encarregados: grupo.encs.map(function (e) { return e.nome; }),
          percentual: primeiro.percentual != null ? primeiro.percentual : 100,
          explicito: primeiro.percentual != null,
          cabo: cabo || null,
          observacao: observacaoDasNotas(atv.nome, notas),
          itens: itensUsados.slice()
        };
      }

      // Cabo: um item por atividade, o cabo vem da seção da planilha
      var restantes = [];
      presentes.forEach(function (item) {
        var cabo = caboDoItem(item);
        if (!cabo) { restantes.push(item); return; }
        var nomes = atividadesDoItem(item);
        if (!nomes.length) { problema('atividade', 'O item ' + item + ' não corresponde a nenhuma atividade do SIPAV.'); return; }
        guardar(nomes[0], [item], cabo);
      });

      // O resto: cobre o conjunto com as atividades que o explicam por inteiro,
      // as maiores primeiro. Empate vai para a de nome mais curto: numa torre
      // autoportante, "ESCAVAÇÃO" e "ESCAVAÇÃO - ESTAI" têm o mesmo item, e é a
      // genérica que vale para ela.
      var faltam = restantes.slice();
      var candidatas = {};
      restantes.forEach(function (i) { atividadesDoItem(i).forEach(function (n) { candidatas[n] = true; }); });

      var infos = Object.keys(candidatas).map(function (nome) {
        return { nome: nome, itens: itensDe({ atividade: { nome: nome }, cabo: null }, estrutura, false) };
      }).filter(function (c) { return c.itens.length; })
        .sort(function (a, b) { return (b.itens.length - a.itens.length) || (a.nome.length - b.nome.length); });

      infos.forEach(function (c) {
        var inteira = c.itens.every(function (i) { return faltam.indexOf(i) !== -1; });
        if (!inteira) return;
        guardar(c.nome, c.itens, null);
        faltam = faltam.filter(function (i) { return c.itens.indexOf(i) === -1; });
      });

      // O que sobrou é parte de uma atividade (só uma das duas linhas preenchida)
      faltam.forEach(function (item) {
        var dona = infos.filter(function (c) { return c.itens.indexOf(item) !== -1; })[0];
        if (!dona) {
          var qualquer = atividadesDoItem(item)[0];
          if (!qualquer) { problema('atividade', 'O item ' + item + ' não corresponde a nenhuma atividade do SIPAV.'); return; }
          guardar(qualquer, [item], null);
          return;
        }
        guardar(dona.nome, [item], null);

        // Só vale avisar se a outra parte existe na planilha e está vazia
        var outras = dona.itens.filter(function (i) { return i !== item && mapa.achados[i]; });
        if (outras.length) {
          problema('parcial', 'Torre ' + grupo.torre.identificador + ', ' + ui.dataCurta(grupo.data) +
                   ': só o item ' + item + ' de "' + dona.nome + '" está preenchido; entrou como a atividade inteira.');
        }
      });
    });

    var lista = Object.keys(registros).map(function (k) { return registros[k]; })
      .sort(function (a, b) {
        if (a.data !== b.data) return a.data < b.data ? -1 : 1;
        return a.torre.localeCompare(b.torre, 'pt-BR', { numeric: true });
      });

    dividirPercentuais(lista);

    return {
      datas: { s1: lidas.s1, s2: lidas.s2, origem: lidas.origem },
      registros: lista,
      naoReconhecidos: Object.keys(naoReconhecidos).sort().map(function (k) { return naoReconhecidos[k]; }),
      movimentos: Object.keys(movimentos).map(function (k) { return movimentos[k]; })
        .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; }),
      problemas: problemas,
      resumo: {
        porticoFaltando: porticoFaltando,
        itensLidos: Object.keys(mapa.achados).length,
        celulas: brutas.length,
        tortos: mapa.tortos.length
      }
    };
  }

  /**
   * Uma atividade numa torre que aparece em mais de um dia, ou com mais de um encarregado,
   * não é feita inteira em cada um: 100% no dia 1 e 100% no dia 2 não existe. A torre é
   * dividida em partes iguais (dois dias, 50% e 50%; três, 33,33, 33,33 e 33,34, para a
   * soma fechar 100). Se a planilha já traz um percentual, vale o dela, e as outras
   * dividem o que sobrou.
   *
   * Fora da regra só a REVISÃO: ela volta à torre para a retirada de flambagem e a de
   * pendências, e cada visita é uma etapa, não uma fatia.
   * Cabo diferente é serviço diferente: o para-raio e o OPGW não se dividem entre si.
   */
  var SEM_DIVISAO = /^revisao/;

  function dividirPercentuais(lista) {
    var grupos = {};
    lista.forEach(function (r) {
      if (SEM_DIVISAO.test(norm(r.atividade))) return;
      var k = r.torreId + '|' + r.atividadeId + '|' + (r.cabo || '');
      (grupos[k] = grupos[k] || []).push(r);
    });

    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k];
      if (g.length < 2) return;

      var livres = g.filter(function (r) { return !r.explicito; });
      if (!livres.length) return;

      var fixo = g.filter(function (r) { return r.explicito; })
        .reduce(function (s, r) { return s + r.percentual; }, 0);
      var sobra = Math.round((100 - fixo) * 100) / 100;
      if (sobra <= 0) return;

      livres.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
      var parte = Math.floor(sobra * 100 / livres.length) / 100;
      livres.forEach(function (r, i) {
        r.percentual = i < livres.length - 1 ? parte : Math.round((sobra - parte * (livres.length - 1)) * 100) / 100;
      });
    });
  }

  /**
   * As segundas-feiras das duas semanas. A planilha manda; só quando ela não traz
   * as datas (arquivo que nunca foi aberto no Excel, sem o valor das fórmulas) é
   * que vale a que foi informada na tela.
   */
  function lerDatasDaPlanilha(ws, ctx) {
    var s1 = dataDaLinha(ws, LINHA_DATAS_S1);
    var s2 = dataDaLinha(ws, LINHA_DATAS_S2);

    if (ctx.segundaS1) {
      return { s1: ctx.segundaS1, s2: ui.iso(ui.somarDias(ui.paraData(ctx.segundaS1), 7)), origem: 'informada' };
    }
    if (s1 && !s2) s2 = ui.iso(ui.somarDias(ui.paraData(s1), 7));
    return { s1: s1, s2: s2, origem: 'planilha' };
  }

  /**
   * "RETIRADA DE FLAMBAGEM" → "Retirada de flambagem", a frase que a tela grava na
   * observação da revisão. Nas outras atividades, o que estava entre parênteses é
   * mantido como veio.
   */
  function observacaoDasNotas(nomeAtividade, notas) {
    if (!notas.length) return null;

    if (norm(nomeAtividade) === 'revisao') {
      var padrao = [];
      notas.forEach(function (n) {
        var k = norm(n);
        if (k.indexOf('retirada de flambagem') !== -1) padrao.push('Retirada de flambagem');
        else if (k.indexOf('retirada de pendencia') !== -1) padrao.push('Retirada de pendências');
        else padrao.push(n);
      });
      return padrao.join(' · ');
    }
    return notas.join(' · ');
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

    // A ordem das torres na linha, para saber quais são vizinhas
    var posicaoDasTorres = {};
    torres.forEach(function (t, i) {
      if (!(t.identificador in posicaoDasTorres)) posicaoDasTorres[t.identificador] = i;
    });

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
        var g = agrupar(progs, torresPorId, segundaS1, mapa.doisLados);

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
            var n = escreverLinha(ws, semana === 'prog1' ? alvo.prog1 : alvo.prog2, porEnc, posicaoDasTorres);
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
              // O mesmo, para ler: cada item com o nome da atividade do SIPAV
              // que o alimenta
              naoExistem: naoAchados.map(function (item) {
                return { item: item, rotulo: rotuloDoItem(item), atividades: atividadesDoItem(item) };
              }),
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
    interpretar: interpretar,
    DE_PARA: DE_PARA,
    CATALOGO: CATALOGO
  };
})();
