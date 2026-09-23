/* =============================================================================
   SIPAV LT — Utilidades de interface
   ========================================================================== */

window.SIPAV = window.SIPAV || {};

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function mostrar(id) { var e = $(id); if (e) e.classList.remove('hidden'); }
  function esconder(id) { var e = $(id); if (e) e.classList.add('hidden'); }

  function abrirModal(id) {
    mostrar(id);
    document.body.style.overflow = 'hidden';
    icones();
  }

  function fecharModal(id) {
    esconder(id);
    // Só libera o scroll se nenhum outro modal continuar aberto
    var aberto = document.querySelector('.modal:not(.hidden)');
    if (!aberto) document.body.style.overflow = '';
  }

  /** Recria os ícones Lucide após alterar o DOM. */
  function icones() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  /* ---------------------------------------------------------------- Aviso -- */

  var timerAviso = null;
  var ESTILOS_AVISO = {
    sucesso: { classe: 'bg-emerald-600 text-white', icone: 'check-circle' },
    erro:    { classe: 'bg-rose-600 text-white',    icone: 'alert-circle' },
    alerta:  { classe: 'bg-amber-500 text-white',   icone: 'alert-triangle' },
    info:    { classe: 'bg-slate-800 text-white',   icone: 'info' }
  };

  function avisar(texto, tipo, duracao) {
    var estilo = ESTILOS_AVISO[tipo || 'sucesso'] || ESTILOS_AVISO.sucesso;
    var interno = $('avisoInterno');

    interno.className = 'flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ' + estilo.classe;
    $('avisoIcone').setAttribute('data-lucide', estilo.icone);
    $('avisoTexto').textContent = texto;

    mostrar('aviso');
    icones();

    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { esconder('aviso'); }, duracao || 3800);
  }

  /* --------------------------------------------------------- Confirmação -- */

  function confirmar(titulo, mensagem, rotuloBotao) {
    return new Promise(function (resolve) {
      $('confirmacaoTitulo').textContent = titulo;
      $('confirmacaoMensagem').textContent = mensagem;

      var btn = $('btnConfirmar');
      btn.textContent = rotuloBotao || 'Confirmar';

      // Troca o nó pra descartar listeners de chamadas anteriores
      var novo = btn.cloneNode(true);
      btn.parentNode.replaceChild(novo, btn);

      novo.onclick = function () { fecharModal('modalConfirmacao'); resolve(true); };
      abrirModal('modalConfirmacao');

      var cancelar = novo.parentNode.querySelector('.btn-secundario');
      if (cancelar) cancelar.onclick = function () { fecharModal('modalConfirmacao'); resolve(false); };
    });
  }

  /* ------------------------------------------------------- Processamento -- */

  function processando(texto) {
    $('processandoTexto').textContent = texto || 'Processando…';
    mostrar('processando');
  }
  function pronto() { esconder('processando'); }

  /* -------------------------------------------------------------- Modais -- */

  /**
   * Monta o modal genérico.
   * @param {object} opcoes {titulo, corpoHtml, botoes:[{rotulo, classe, acao}]}
   */
  function modalGenerico(opcoes) {
    $('genericoTitulo').textContent = opcoes.titulo || '';
    $('genericoCorpo').innerHTML = opcoes.corpoHtml || '';

    var rodape = $('genericoRodape');
    rodape.innerHTML = '';
    (opcoes.botoes || [{ rotulo: 'Fechar', classe: 'btn-secundario' }]).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = b.classe || 'btn-secundario';
      btn.textContent = b.rotulo;
      btn.onclick = b.acao || function () { fecharModal('modalGenerico'); };
      rodape.appendChild(btn);
    });

    abrirModal('modalGenerico');
  }

  /* ----------------------------------------------------------- Formatação -- */

  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  /** '2026-09-25' → Date local (evita o deslocamento de fuso do construtor ISO). */
  function paraData(iso) {
    if (!iso) return null;
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function dataCurta(iso) {
    var d = paraData(iso);
    if (!d) return '—';
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  function dataLonga(iso) {
    var d = paraData(iso);
    if (!d) return '—';
    return ('0' + d.getDate()).slice(-2) + '/' + MESES[d.getMonth()] + ' · ' + DIAS[d.getDay()];
  }

  function hoje() { return new Date().toISOString().slice(0, 10); }

  function km(n) {
    var v = typeof n === 'number' ? n : parseFloat(n);
    if (isNaN(v)) v = 0;
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  }

  /** Escapa texto vindo do banco antes de injetar como HTML. */
  function esc(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** '#F7801E' + 0.16 → 'rgba(247,128,30,0.16)'. Para véus sobre o tema. */
  function rgba(hex, alfa) {
    if (!hex || hex[0] !== '#') return 'transparent';
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' +
                     parseInt(h.slice(2, 4), 16) + ',' +
                     parseInt(h.slice(4, 6), 16) + ',' + alfa + ')';
  }

  /** Preto ou branco, conforme a luminância do fundo. */
  function corDoTexto(hexFundo) {
    if (!hexFundo || hexFundo[0] !== '#') return '#ffffff';
    var h = hexFundo.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) / 255;
    var g = parseInt(h.slice(2, 4), 16) / 255;
    var b = parseInt(h.slice(4, 6), 16) / 255;
    function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.45 ? '#1e293b' : '#ffffff';
  }

  window.SIPAV.ui = {
    $: $, mostrar: mostrar, esconder: esconder,
    abrirModal: abrirModal, fecharModal: fecharModal, modalGenerico: modalGenerico,
    icones: icones, avisar: avisar, confirmar: confirmar,
    processando: processando, pronto: pronto,
    paraData: paraData, dataCurta: dataCurta, dataLonga: dataLonga, hoje: hoje,
    km: km, esc: esc, corDoTexto: corDoTexto, rgba: rgba
  };
})();
