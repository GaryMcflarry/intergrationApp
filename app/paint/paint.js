/* -------------------------------------------------------------------------- */
/*                 Paint UI: the brushes behind paint.css                      */
/* -------------------------------------------------------------------------- */
/* Paint.init() adds the SVG filters the kit's rough, painted edges use, paints every [data-pt-scene] card, and wires
   the splash, toggles, sliders and [data-pt-reveal] reveals. Each part is also callable on its own (see the API at the
   end). No network, no images: scenes are drawn from shapes, roughed up by the filters. In Node (the tests) only the
   data parts are exported. */
(function (root) {
  'use strict';

  /* -------------------------------------------------------------------------- */
  /*                                   Filters                                  */
  /* -------------------------------------------------------------------------- */
  // pt-rough: a hand-cut edge (noise nudges every pixel a little); pt-bleed: wetter, softer, for splashes;
  // pt-gouache: for scenes, a big warp for loose shapes plus streaky gaps where a dry brush skipped
  var FILTERS =
    '<filter id="pt-rough" x="-6%" y="-12%" width="112%" height="124%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="7" result="n"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>' +
    '<filter id="pt-bleed" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="2" result="n"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
      '<feGaussianBlur in="d" stdDeviation="0.6"/>' +
    '</filter>' +
    '<filter id="pt-gouache" x="-6%" y="-6%" width="112%" height="112%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="4" seed="3" result="warp"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="warp" scale="20" xChannelSelector="R" yChannelSelector="G" result="shape"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.5 0.04" numOctaves="2" seed="9" result="bristle"/>' +
      '<feColorMatrix in="bristle" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.35 1.05" result="dry"/>' +
      '<feComposite in="shape" in2="dry" operator="in"/>' +
    '</filter>';

  /* -------------------------------------------------------------------------- */
  /*                                   Scenes                                   */
  /* -------------------------------------------------------------------------- */
  // Each scene: gradients (id -> stops, vertical unless x2 given) and shapes drawn back to front on a 400 x 250 canvas.
  // A shape is [tag, attributes, classes]; 'fill' values starting with '#g:' name one of the scene's gradients.
  var SCENES = {
    valley: {
      gradients: {
        sky: [['0', '#8fbde8'], ['.6', '#d9e6f0'], ['1', '#eef1ee']],
        slope: [['0', '#a6cf55'], ['1', '#4f8a2c']]
      },
      shapes: [
        ['rect', { x: -20, y: -20, width: 440, height: 290, fill: '#g:sky' }],
        ['ellipse', { cx: 150, cy: 70, rx: 90, ry: 26, fill: '#ffffff', opacity: '.75' }, 'pt-drift'],
        ['ellipse', { cx: 300, cy: 48, rx: 70, ry: 18, fill: '#ffffff', opacity: '.6' }, 'pt-drift pt-slow'],
        ['polygon', { points: '40,170 120,80 170,120 230,60 300,130 380,90 440,170', fill: '#a3adc6' }],
        ['polygon', { points: '210,190 270,40 300,70 330,30 360,110 420,150 420,260 210,260', fill: '#4f6b4c' }],
        ['polygon', { points: '330,260 350,60 390,20 420,40 420,260', fill: '#33432f' }],
        ['path', { d: 'M-10 230 C80 200 160 170 260 150 C320 140 380 150 420 160 L420 270 L-10 270 Z', fill: '#g:slope' }],
        ['path', { d: 'M150 240 C190 215 230 200 250 186 C262 178 276 172 300 168', fill: 'none', stroke: '#ece6d3', 'stroke-width': '5', 'stroke-linecap': 'round' }],
        ['rect', { x: -20, y: -20, width: 90, height: 290, fill: '#2a292f' }],
        ['circle', { cx: 92, cy: 214, r: 6, fill: '#e0402f' }],
        ['circle', { cx: 118, cy: 226, r: 5, fill: '#e65a3a' }],
        ['circle', { cx: 140, cy: 208, r: 4, fill: '#d7352a' }],
        ['circle', { cx: 78, cy: 236, r: 5, fill: '#e0402f' }]
      ]
    },
    coast: {
      gradients: {
        sky: [['0', '#2c6fb3'], ['.7', '#86c2e6'], ['1', '#bfe3f0']],
        sea: [['0', '#22a0a3'], ['1', '#0c4f6b']],
        glow: [['0', '#ffb04a'], ['1', '#e2452c']]
      },
      shapes: [
        ['rect', { x: -20, y: -20, width: 440, height: 290, fill: '#g:sky' }],
        ['ellipse', { cx: 110, cy: 60, rx: 80, ry: 22, fill: '#e8f4fb', opacity: '.7' }, 'pt-drift'],
        ['ellipse', { cx: 270, cy: 40, rx: 95, ry: 20, fill: '#d6ecf7', opacity: '.55' }, 'pt-drift pt-slow'],
        ['polygon', { points: '230,150 300,100 330,92 350,104 420,140 420,160 230,160', fill: '#3d5f8e' }],
        ['path', { d: 'M312 96 C320 112 334 120 352 128', fill: 'none', stroke: '#g:glow', 'stroke-width': '4', 'stroke-linecap': 'round' }],
        ['ellipse', { cx: 330, cy: 92, rx: 26, ry: 9, fill: '#ff7a3a', opacity: '.55' }, 'pt-drift pt-slow'],
        ['rect', { x: -20, y: 150, width: 440, height: 120, fill: '#g:sea' }],
        ['path', { d: 'M-10 170 C40 160 80 178 130 166 S220 160 270 172 S360 162 420 170', fill: 'none', stroke: '#ffffff', 'stroke-width': '4', opacity: '.75' }, 'pt-swell'],
        ['path', { d: 'M-10 200 C50 190 100 208 160 196 S260 190 320 204 S390 194 420 198', fill: 'none', stroke: '#e9fbff', 'stroke-width': '3', opacity: '.6' }, 'pt-swell'],
        ['polygon', { points: '-10,260 20,190 70,176 110,200 150,260', fill: '#2a3443' }],
        ['polygon', { points: '20,192 70,176 98,188 60,190', fill: '#6f9d3c' }],
        ['polygon', { points: '260,260 300,214 350,204 400,226 420,260', fill: '#232c38' }],
        ['polygon', { points: '300,214 350,204 372,214 330,214', fill: '#79a640' }]
      ]
    },
    dusk: {
      gradients: {
        sky: [['0', '#2b1f52'], ['.55', '#d96a4c'], ['1', '#f4c27e']]
      },
      shapes: [
        ['rect', { x: -20, y: -20, width: 440, height: 290, fill: '#g:sky' }],
        ['circle', { cx: 286, cy: 150, r: 34, fill: '#ffd98a', opacity: '.95' }],
        ['circle', { cx: 60, cy: 40, r: 1.6, fill: '#ffffff', opacity: '.8' }],
        ['circle', { cx: 140, cy: 26, r: 1.2, fill: '#ffffff', opacity: '.7' }],
        ['circle', { cx: 350, cy: 34, r: 1.4, fill: '#ffffff', opacity: '.75' }],
        ['polygon', { points: '-10,190 60,140 130,170 200,120 270,160 340,130 420,170 420,270 -10,270', fill: '#5a3f7e' }],
        ['rect', { x: -20, y: 160, width: 440, height: 30, fill: '#ffffff', opacity: '.14' }, 'pt-drift'],
        ['polygon', { points: '-10,220 80,180 160,210 240,176 320,206 420,186 420,270 -10,270', fill: '#33275e' }],
        ['polygon', { points: '-10,250 100,224 210,244 300,226 420,240 420,270 -10,270', fill: '#1c1838' }]
      ]
    }
  };

  var api = { FILTERS: FILTERS, SCENES: SCENES, scenes: Object.keys(SCENES) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;   // Node: the data only

  /* -------------------------------------------------------------------------- */
  /*                                   Browser                                  */
  /* -------------------------------------------------------------------------- */
  var doc = root.document, NS = 'http://www.w3.org/2000/svg';
  var still = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var sceneCount = 0, wetCount = 0;

  function svgEl(tag, attrs) {
    var e = doc.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
    return e;
  }

  // the filters, once per page, in a hidden SVG (they are referenced from CSS as url(#pt-rough) and so on)
  function addFilters() {
    if (doc.getElementById('pt-filters')) return;
    var svg = svgEl('svg', { id: 'pt-filters', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<defs>' + FILTERS + '</defs>';   // a fixed string from this file, never data
    doc.body.appendChild(svg);
  }

  // a painted scene inside el (the card's art box): the kind's gradients and shapes, all through the gouache filter
  function scene(el, kind) {
    var def = SCENES[kind] || SCENES.valley, n = ++sceneCount;
    var svg = svgEl('svg', { viewBox: '0 0 400 250', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', class: 'pt-scene' });
    var defs = svgEl('defs');
    Object.keys(def.gradients).forEach(function (name) {
      var g = svgEl('linearGradient', { id: 'ptg' + n + '-' + name, x1: 0, y1: 0, x2: 0, y2: 1 });
      def.gradients[name].forEach(function (s) { g.appendChild(svgEl('stop', { offset: s[0], 'stop-color': s[1] })); });
      defs.appendChild(g);
    });
    svg.appendChild(defs);
    var layer = svgEl('g', { filter: 'url(#pt-gouache)' });
    def.shapes.forEach(function (s) {
      var attrs = Object.assign({}, s[1]);
      ['fill', 'stroke'].forEach(function (k) { if (typeof attrs[k] === 'string' && attrs[k].indexOf('#g:') === 0) attrs[k] = 'url(#ptg' + n + '-' + attrs[k].slice(3) + ')'; });
      var shape = svgEl(s[0], attrs);
      if (s[2]) shape.setAttribute('class', s[2]);
      layer.appendChild(shape);
    });
    svg.appendChild(layer);
    el.textContent = '';
    el.appendChild(svg);
    return svg;
  }

  // a splash of paint where a button, tab or chip is pressed
  function splash(el, x, y) {
    if (still.matches) return;
    var r = el.getBoundingClientRect(), s = doc.createElement('span');
    s.className = 'pt-splash';
    s.style.left = (x - r.left) + 'px'; s.style.top = (y - r.top) + 'px';
    el.appendChild(s);
    s.addEventListener('animationend', function () { s.remove(); });
  }

  // wet paint: the element's edge keeps moving, as if the paint had not dried (its own copy of the rough filter, whose
  // noise changes eight times a second); wet(el, false) dries it
  function wet(el, on) {
    if (on === false || still.matches) {
      if (el._ptWet) { clearInterval(el._ptWet.timer); el._ptWet.filter.remove(); el.style.filter = ''; el._ptWet = null; }
      return;
    }
    if (el._ptWet) return;
    addFilters();
    var id = 'pt-wet-' + (++wetCount), f = svgEl('filter', { id: id, x: '-6%', y: '-12%', width: '112%', height: '124%' });
    var t = svgEl('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.05', numOctaves: 2, seed: 1, result: 'n' });
    f.appendChild(t);
    f.appendChild(svgEl('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 6, xChannelSelector: 'R', yChannelSelector: 'G' }));
    doc.querySelector('#pt-filters defs').appendChild(f);
    el.style.filter = 'url(#' + id + ')';
    var seed = 1;
    el._ptWet = { filter: f, timer: setInterval(function () { seed = seed % 8 + 1; t.setAttribute('seed', seed); }, 125) };
  }

  // an ink line drawn round el
  function ink(el, color) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var old = el.querySelector(':scope > .pt-ink-line'); if (old) old.remove();
    var r = el.getBoundingClientRect(), radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8;
    var svg = svgEl('svg', { class: 'pt-ink-line', 'aria-hidden': 'true' });
    var rect = svgEl('rect', { x: 2, y: 2, width: Math.max(0, r.width + 4), height: Math.max(0, r.height + 4), rx: radius + 2 });
    svg.appendChild(rect);
    if (color) svg.style.setProperty('--pt-ink-color', color);
    el.appendChild(svg);
    var len = rect.getTotalLength ? Math.ceil(rect.getTotalLength()) : 1000;
    svg.style.setProperty('--pt-len', len);
    return svg;
  }

  // reveals: [data-pt-reveal] elements are painted in as they come into view, a little after each other
  function reveal(scope) {
    var els = Array.prototype.slice.call((scope || doc).querySelectorAll('[data-pt-reveal]:not(.pt-reveal)'));
    if (!els.length) return;
    function show(el, i) { el.style.setProperty('--pt-delay', (i * 0.08).toFixed(2) + 's'); el.classList.add('pt-reveal'); }
    if (!('IntersectionObserver' in root)) { els.forEach(show); return; }
    var i = 0, io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { show(e.target, i++); io.unobserve(e.target); } });
      i = 0;
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  }

  // a slider's filled part follows its value
  function slider(input) {
    function paint() { var min = +input.min || 0, max = input.max === '' ? 100 : +input.max; input.style.setProperty('--v', ((+input.value - min) / ((max - min) || 1) * 100).toFixed(1)); }
    input.addEventListener('input', paint); paint();
  }

  // a toast on painted paper, for a few seconds
  function toast(text, opts) {
    opts = opts || {};
    var box = doc.querySelector('.pt-toasts');
    if (!box) { box = doc.createElement('div'); box.className = 'pt pt-toasts'; box.setAttribute('aria-live', 'polite'); doc.body.appendChild(box); }
    var t = doc.createElement('div');
    t.className = 'pt-toast pt-wash' + (opts.color ? ' pt-' + opts.color : '');
    t.textContent = String(text);   // text only, never markup
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, opts.ms || 3200);
    return t;
  }

  // the whole kit on a page (safe to call again: it only adds what is missing)
  function init(scope) {
    addFilters();
    scope = scope || doc;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-pt-scene]'), function (el) { if (!el.querySelector('.pt-scene')) scene(el, el.getAttribute('data-pt-scene')); });
    Array.prototype.forEach.call(scope.querySelectorAll('.pt-slider'), function (el) { if (!el._ptSlider) { el._ptSlider = true; slider(el); } });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-pt-wet]'), function (el) { wet(el, true); });
    reveal(scope);
    if (!doc._ptWired) {
      doc._ptWired = true;
      doc.addEventListener('pointerdown', function (e) {
        var el = e.target.closest && e.target.closest('.pt-btn, .pt-action, .pt-chip');
        if (el && !el.disabled) splash(el, e.clientX, e.clientY);
      });
      doc.addEventListener('click', function (e) {
        var tg = e.target.closest && e.target.closest('.pt-toggle');
        if (!tg || tg.disabled) return;
        var on = tg.getAttribute('aria-checked') !== 'true';
        tg.setAttribute('aria-checked', String(on));
        tg.dispatchEvent(new CustomEvent('pt-change', { bubbles: true, detail: { checked: on } }));
      });
    }
  }

  api.init = init; api.scene = scene; api.splash = splash; api.wet = wet; api.ink = ink; api.reveal = reveal; api.slider = slider; api.toast = toast;
  root.Paint = api;
})(typeof window !== 'undefined' ? window : null);
