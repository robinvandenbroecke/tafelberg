/*
 * Tafelberg: maaltafels oefenen voor het tweede leerjaar.
 *
 * Bewust geschreven in ES5, zonder bibliotheken: oudere Android-WebViews
 * (Boox-toestellen, Galaxy Tab S3 met Android 7 tot 9) moeten het kunnen draaien.
 *
 * Didactische lijn
 *  1. Begrijpen: elke som is een aantal groepjes (vermenigvuldigen als herhaald optellen),
 *     getoond als stippen in bakjes met vijfstructuur.
 *  2. Afleiden: hints vertrekken van de steunpunttafels 1, 2, 5 en 10 en de wisseleigenschap.
 *  3. Automatiseren: elke som heeft een eigen niveau (Leitner). Juist en vlot gaat een niveau
 *     omhoog, maar enkel wanneer de som "aan de beurt" is (gespreide herhaling over dagen).
 *     Fouten zakken, krijgen meteen uitleg en komen in dezelfde ronde nog eens terug.
 *  Nieuwe sommen komen in kleine porties binnen, gemengd met sommen die al goed gaan.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- constanten
  var STORE_KEY = 'tafelberg.v1';
  var HOUR = 3600000;
  var DAY = 24 * HOUR;
  var INTERVALS = [0, 0, 20 * HOUR, 2 * DAY, 4 * DAY, 9 * DAY];
  var MASTER = 4;
  var ANCHORS = [1, 2, 5, 10];
  var INTRO_ORDER = [1, 2, 10, 5, 3, 4, 6, 9, 8, 7];
  var PEAK_H = { 1: 0.5, 2: 0.6, 3: 0.76, 4: 0.72, 5: 0.66, 6: 0.84, 7: 0.96, 8: 0.9, 9: 0.8, 10: 0.62 };
  var PRAISE = ['Juist!', 'Knap!', 'Goed zo!', 'Straf!', 'Super!', 'Prima!'];
  var TIMES = '×';
  var SVGNS = 'http://www.w3.org/2000/svg';

  var root = document.getElementById('app');
  var S = null;
  var current = null;
  var keyHandler = null;
  var timers = [];
  var deviceEink = /[?&]eink=1/.test(window.location.search);

  // ---------------------------------------------------------------- opslag
  function defaultState() {
    return {
      v: 1,
      settings: { name: 'Hector', tables: [2, 5, 10], len: 12, div: false, eink: null, sound: true },
      facts: {},
      stats: { stars: 0, rounds: 0, days: 0, lastDay: '' }
    };
  }

  function bridge() {
    var b = window.AndroidStore;
    return b && typeof b.get === 'function' ? b : null;
  }

  function normalise(st) {
    var d = defaultState(), k;
    if (!st || typeof st !== 'object') return d;
    if (!st.settings || typeof st.settings !== 'object') st.settings = {};
    for (k in d.settings) if (d.settings.hasOwnProperty(k) && !(k in st.settings)) st.settings[k] = d.settings[k];
    if (!st.facts || typeof st.facts !== 'object') st.facts = {};
    if (!st.stats || typeof st.stats !== 'object') st.stats = {};
    for (k in d.stats) if (d.stats.hasOwnProperty(k) && !(k in st.stats)) st.stats[k] = d.stats[k];
    if (!st.settings.tables || !st.settings.tables.length) st.settings.tables = [2];
    return st;
  }

  function loadState() {
    var raw = null, b = bridge(), st = null;
    try { raw = b ? b.get() : null; } catch (e) { raw = null; }
    if (!raw) { try { raw = window.localStorage.getItem(STORE_KEY); } catch (e2) { raw = null; } }
    if (raw) { try { st = JSON.parse(raw); } catch (e3) { st = null; } }
    return normalise(st);
  }

  function saveState() {
    var raw = JSON.stringify(S), b = bridge();
    try { if (b) b.set(raw); } catch (e) { /* niets */ }
    try { window.localStorage.setItem(STORE_KEY, raw); } catch (e2) { /* niets */ }
  }

  // ---------------------------------------------------------------- DOM-hulp
  function add(e, kids) {
    if (kids === null || kids === undefined) return;
    if (Object.prototype.toString.call(kids) !== '[object Array]') kids = [kids];
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c === null || c === undefined || c === false) continue;
      if (typeof c === 'string' || typeof c === 'number') c = document.createTextNode(String(c));
      e.appendChild(c);
    }
  }

  function setAttrs(e, attrs, isSvg) {
    if (!attrs) return;
    for (var k in attrs) {
      if (!attrs.hasOwnProperty(k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') {
        if (isSvg) e.setAttribute('class', v); else e.className = v;
      } else if (k === 'text') {
        e.appendChild(document.createTextNode(String(v)));
      } else if (k.length > 2 && k.substring(0, 2) === 'on' && typeof v === 'function') {
        e.addEventListener(k.substring(2), v, false);
      } else {
        e.setAttribute(k, v);
      }
    }
  }

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    setAttrs(e, attrs, false);
    add(e, kids);
    return e;
  }

  function s(tag, attrs, kids) {
    var e = document.createElementNS(SVGNS, tag);
    setAttrs(e, attrs, true);
    add(e, kids);
    return e;
  }

  function later(fn, ms) { timers.push(window.setTimeout(fn, ms)); }
  function clearTimers() { for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]); timers = []; }

  function pts(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(list[i][0].toFixed(1) + ',' + list[i][1].toFixed(1));
    return out.join(' ');
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function listNl(nums) {
    if (nums.length === 1) return String(nums[0]);
    return nums.slice(0, -1).join(', ') + ' en ' + nums[nums.length - 1];
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // ---------------------------------------------------------------- thema en maat
  function einkOn() { return S.settings.eink === null ? deviceEink : !!S.settings.eink; }

  function setHtmlClass(name, on) {
    var cl = document.documentElement.classList;
    if (on) cl.add(name); else cl.remove(name);
  }

  function applyTheme() { setHtmlClass('eink', einkOn()); }

  var lastPort = null;
  function isPort() { return (window.innerHeight || 0) >= (window.innerWidth || 0); }

  function fitRoot() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var hh = window.innerHeight || document.documentElement.clientHeight;
    var base = Math.min(w, hh) / 38;
    if (w > hh && w / hh > 1.45) base = Math.min(base, w / 58);
    if (hh >= w && hh / w > 1.45) base = Math.min(base, hh / 58);
    base = Math.max(11, Math.min(30, base));
    document.documentElement.style.fontSize = base.toFixed(2) + 'px';
    setHtmlClass('land', w > hh);
    setHtmlClass('port', w <= hh);
    var port = w <= hh;
    if (lastPort !== null && port !== lastPort && current && current.name === 'home') go('home');
    lastPort = port;
  }

  // ---------------------------------------------------------------- geluid
  var audioCtx = null;
  function play(notes, step) {
    if (!S.settings.sound) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      var t0 = audioCtx.currentTime + 0.01;
      for (var i = 0; i < notes.length; i++) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + i * step;
        o.type = 'sine';
        o.frequency.value = notes[i];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step + 0.12);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + step + 0.15);
      }
    } catch (e) { /* geen geluid, geen probleem */ }
  }
  var SND = {
    ok: function () { play([659, 880], 0.09); },
    fast: function () { play([659, 880, 1175], 0.08); },
    oops: function () { play([392, 349], 0.14); },
    done: function () { play([523, 659, 784, 1047], 0.12); }
  };

  // ---------------------------------------------------------------- iconen
  function icon(name) {
    var svg = s('svg', { viewBox: '0 0 24 24', class: 'icon icon-' + name, 'aria-hidden': 'true' });
    if (name === 'star') {
      svg.appendChild(s('path', { d: 'M12 2.6l2.85 5.95 6.55.8-4.83 4.5 1.25 6.5L12 17.15 6.18 20.35l1.25-6.5L2.6 9.35l6.55-.8z', class: 'fill' }));
    } else if (name === 'bolt') {
      svg.appendChild(s('path', { d: 'M13.5 2L4.5 13.5h6L9.5 22l9-11.5h-6z', class: 'fill' }));
    } else if (name === 'back') {
      svg.appendChild(s('path', { d: 'M15 4.5L7.5 12l7.5 7.5', class: 'line' }));
    } else if (name === 'close') {
      svg.appendChild(s('path', { d: 'M6 6l12 12M18 6L6 18', class: 'line' }));
    } else if (name === 'gear') {
      var g = s('g', { class: 'fill' });
      for (var i = 0; i < 8; i++) g.appendChild(s('rect', { x: 10.4, y: 1.6, width: 3.2, height: 5, rx: 1, transform: 'rotate(' + (i * 45) + ' 12 12)' }));
      svg.appendChild(g);
      svg.appendChild(s('circle', { cx: 12, cy: 12, r: 7, class: 'fill' }));
      svg.appendChild(s('circle', { cx: 12, cy: 12, r: 3, class: 'hole' }));
    } else if (name === 'grid') {
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
        svg.appendChild(s('rect', { x: 3 + c * 6.5, y: 3 + r * 6.5, width: 5, height: 5, rx: 1.2, class: (r + c) % 2 ? 'fill soft' : 'fill' }));
      }
    } else if (name === 'flag') {
      svg.appendChild(s('path', { d: 'M6 21V3.5', class: 'line' }));
      svg.appendChild(s('path', { d: 'M6.5 4h11l-3 4 3 4h-11z', class: 'fill' }));
    } else if (name === 'stairs') {
      svg.appendChild(s('path', { d: 'M3 20h5v-5h5v-5h5V5h3', class: 'line' }));
    } else if (name === 'erase') {
      svg.appendChild(s('path', { d: 'M8.5 5h11.5v14H8.5L2.5 12z', class: 'line' }));
      svg.appendChild(s('path', { d: 'M11 9.5l5 5M16 9.5l-5 5', class: 'line' }));
    } else if (name === 'mountain') {
      svg.appendChild(s('path', { d: 'M1.5 20.5L9 7l3.6 6.2L15.4 9l7.1 11.5z', class: 'fill' }));
    }
    return svg;
  }

  function starBadge(n) {
    return h('div', { class: 'stars', 'aria-label': n + ' sterren' }, [icon('star'), h('span', { class: 'stars-n' }, String(n))]);
  }

  function iconButton(name, label, fn, extra) {
    return h('button', { class: 'icon-btn' + (extra ? ' ' + extra : ''), 'aria-label': label, title: label, onclick: fn }, icon(name));
  }

  // ---------------------------------------------------------------- sommen en niveaus
  function fkey(a, t) { return a + 'x' + t; }
  function getFact(a, t) { return S.facts[fkey(a, t)] || null; }
  function box(a, t) { var f = getFact(a, t); return f ? f.b : -1; }

  // 0 = nog niet geoefend, 1 = aan het leren, 2 = bijna, 3 = zit erin
  function level(a, t) {
    var b = box(a, t);
    if (b < 0) return 0;
    if (b < 2) return 1;
    if (b < MASTER) return 2;
    return 3;
  }

  function tableProgress(t) {
    var sum = 0;
    for (var a = 1; a <= 10; a++) { var b = box(a, t); sum += b < 0 ? 0 : Math.min(b, MASTER); }
    return sum / (10 * MASTER);
  }

  function tableDone(t) {
    for (var a = 1; a <= 10; a++) if (box(a, t) < MASTER) return false;
    return true;
  }

  function masteredTotal() {
    var n = 0;
    for (var t = 1; t <= 10; t++) for (var a = 1; a <= 10; a++) if (box(a, t) >= MASTER) n++;
    return n;
  }

  // ---------------------------------------------------------------- uitleg
  function chain(x, y) {
    var parts = [];
    for (var i = 0; i < x; i++) parts.push(y);
    return parts.join(' + ') + ' = ' + (x * y);
  }

  function groupsText(x, y) {
    if (x === 1) return '1 groepje van ' + y;
    return x + ' groepjes van ' + y;
  }

  // Slim rekenen vanuit de steunpunttafels. Met hide=true blijft de uitkomst open (hulp).
  function strategy(x, y, hide) {
    var txt = strategyText(x, y, hide);
    return hide ? txt.replace(/\?\.$/, '?') : txt;
  }

  function strategyText(x, y, hide) {
    var p = x * y, R = hide ? '?' : String(p);
    if (x === 1) return 'Eén groepje van ' + y + ' is gewoon ' + R + '.';
    if (y === 1) return x + ' groepjes van 1 zijn samen ' + R + '.';
    if (x === 10) return '10 groepjes van ' + y + ' zijn ' + y + ' tientallen. Dat is ' + R + '.';
    if (x === 2) return 'Dubbel ' + y + ': ' + y + ' + ' + y + ' = ' + R + '.';
    if (x === 5) return 'Eerst 10 ' + TIMES + ' ' + y + ' = ' + (10 * y) + '. De helft daarvan is ' + R + '.';
    if (ANCHORS.indexOf(y) >= 0) return 'Wissel om: ' + y + ' ' + TIMES + ' ' + x + ' is evenveel. ' + strategy(y, x, hide);
    if (x === 3) return '2 ' + TIMES + ' ' + y + ' = ' + (2 * y) + '. Nog één keer ' + y + ' erbij: ' + R + '.';
    if (x === 4) return '2 ' + TIMES + ' ' + y + ' = ' + (2 * y) + '. Het dubbel daarvan is ' + R + '.';
    if (x === 6) return '5 ' + TIMES + ' ' + y + ' = ' + (5 * y) + '. Nog één keer ' + y + ' erbij: ' + R + '.';
    if (x === 7) return '5 ' + TIMES + ' ' + y + ' = ' + (5 * y) + ' en 2 ' + TIMES + ' ' + y + ' = ' + (2 * y) + '. Samen ' + R + '.';
    if (x === 8) return '10 ' + TIMES + ' ' + y + ' = ' + (10 * y) + '. Daar 2 ' + TIMES + ' ' + y + ' = ' + (2 * y) + ' af: ' + R + '.';
    if (x === 9) return '10 ' + TIMES + ' ' + y + ' = ' + (10 * y) + '. Daar één keer ' + y + ' af: ' + R + '.';
    return groupsText(x, y) + ' zijn samen ' + R + '.';
  }

  function tableTip(t) {
    var tips = {
      1: 'Keer 1 verandert niets: 7 ' + TIMES + ' 1 = 7.',
      2: 'De tafel van 2 is altijd het dubbel: 6 ' + TIMES + ' 2 = 6 + 6.',
      3: 'Tel telkens 3 verder. Ken je 5 ' + TIMES + ' 3 = 15? Dan is 6 ' + TIMES + ' 3 er 3 meer.',
      4: 'De tafel van 4 is het dubbel van de tafel van 2: 3 ' + TIMES + ' 2 = 6, dus 3 ' + TIMES + ' 4 = 12.',
      5: 'Alle uitkomsten eindigen op 0 of 5. 5 ' + TIMES + ' 5 is de helft van 10 ' + TIMES + ' 5.',
      6: 'De tafel van 6 is het dubbel van de tafel van 3. Of: 5 ' + TIMES + ' 6 = 30 en dan nog één keer 6.',
      7: 'Vertrek van 5 ' + TIMES + ' 7 = 35. Dan is 6 ' + TIMES + ' 7 er 7 meer: 42.',
      8: 'Dubbel, dubbel, dubbel: 3 ' + TIMES + ' 2 = 6, 3 ' + TIMES + ' 4 = 12, 3 ' + TIMES + ' 8 = 24.',
      9: 'Neem 10 keer en haal er één keer 9 af. Bij 3 ' + TIMES + ' 9 = 27 is 2 + 7 samen 9.',
      10: 'Alle uitkomsten eindigen op 0. 4 ' + TIMES + ' 10 = 40: vier tientallen.'
    };
    return tips[t];
  }

  function errorNote(q, ans) {
    var right = String(q.answer), given = String(ans);
    if (q.kind === 'mul' || q.kind === 'swap') {
      if (ans === q.x + q.y && q.x + q.y !== q.answer) {
        return 'Opgelet: jij telde ' + q.x + ' + ' + q.y + '. Bij maal neem je ' + groupsText(q.x, q.y) + '.';
      }
      if (ans === (q.x - 1) * q.y || ans === (q.x + 1) * q.y) {
        return 'Je zat er net één groepje van ' + q.y + ' naast.';
      }
    } else if (ans === q.answer - 1 || ans === q.answer + 1) {
      return 'Je zat er net één naast. Tel de groepjes nog eens.';
    }
    if (given.length === 2 && given === right.charAt(1) + right.charAt(0)) {
      return 'Bijna: kijk goed naar de volgorde van de cijfers.';
    }
    return '';
  }

  function eqText(q) {
    if (q.kind === 'div') return q.product + ' : ' + q.t + ' = ' + q.a;
    if (q.kind === 'swap') return q.t + ' ' + TIMES + ' ' + q.a + ' = ' + q.product;
    return q.a + ' ' + TIMES + ' ' + q.t + ' = ' + q.product;
  }

  // ---------------------------------------------------------------- stippenmodel
  // x groepjes (rijen in een bakje) van y stippen, met vijfstructuur.
  function dotModel(x, y, opts) {
    opts = opts || {};
    var D = 10, pin = 4, gap = 4, five = 5;
    var rowW = pin * 2 + y * D + (y > 5 ? five : 0);
    var rowH = D + pin * 2 - 2;
    var realH = x * rowH + (x - 1) * gap + (x > 5 ? five : 0);
    var minW = pin * 2 + 10 * D + five, minH = 3 * rowH + 2 * gap;
    var W = Math.max(rowW, minW) + 2, H = Math.max(realH, minH) + 2;
    var ox = (W - 2 - rowW) / 2, oy = (H - 2 - realH) / 2;
    var svg = s('svg', { viewBox: (-1 - ox) + ' ' + (-1 - oy) + ' ' + W + ' ' + H, class: 'dots', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': groupsText(x, y) });
    for (var i = 0; i < x; i++) {
      var top = i * (rowH + gap) + (i >= 5 ? five : 0);
      svg.appendChild(s('rect', { x: 0, y: top, width: rowW, height: rowH, rx: rowH / 2, class: 'tray' + (opts.mark === i ? ' tray-mark' : '') }));
      for (var j = 0; j < y; j++) {
        var cx = pin + D / 2 + j * D + (j >= 5 ? five : 0);
        svg.appendChild(s('circle', { cx: cx, cy: top + rowH / 2, r: 3.4, class: 'dot' }));
      }
    }
    return svg;
  }

  // ---------------------------------------------------------------- toetsenbord
  function keypad(onKey) {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
    var pad = h('div', { class: 'keypad' });
    for (var i = 0; i < keys.length; i++) {
      (function (k) {
        var label = k === 'del' ? 'Wissen' : (k === 'ok' ? 'Klaar' : k);
        var content = k === 'del' ? icon('erase') : (k === 'ok' ? h('span', { class: 'key-ok-mark' }, 'OK') : k);
        var b = h('button', { class: 'key' + (k === 'ok' ? ' key-ok' : '') + (k === 'del' ? ' key-del' : ''), 'aria-label': label }, content);
        b.addEventListener('click', function () { onKey(k); }, false);
        pad.appendChild(b);
      })(keys[i]);
    }
    return pad;
  }

  function keyFromEvent(e) {
    var c = e.keyCode || e.which;
    if (c >= 48 && c <= 57) return String(c - 48);
    if (c >= 96 && c <= 105) return String(c - 96);
    if (c === 8 || c === 46) return 'del';
    if (c === 13) return 'ok';
    if (c === 27) return 'esc';
    return null;
  }

  document.addEventListener('keydown', function (e) {
    var k = keyFromEvent(e);
    if (!k) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (k === 'esc') { if (current && current.back) current.back(); return; }
    if (keyHandler) { e.preventDefault(); keyHandler(k); }
  }, false);

  // ---------------------------------------------------------------- schermen
  var screens = {};

  function go(name, params) {
    clearTimers();
    keyHandler = null;
    current = { name: name, params: params || {}, back: null };
    root.innerHTML = '';
    screens[name](current.params);
    window.scrollTo(0, 0);
  }

  // Androids terugknop vraagt eerst aan het spel of het zelf kan teruggaan.
  window.tbBack = function () {
    if (current && current.back) { current.back(); return true; }
    return false;
  };

  function topBar(left, title, right) {
    return h('header', { class: 'bar' }, [
      h('div', { class: 'bar-side' }, left),
      h('div', { class: 'bar-title' }, title || null),
      h('div', { class: 'bar-side bar-right' }, right)
    ]);
  }

  // ---------- bergen op het startscherm
  // Elke tafel is een berg. De bergen overlappen, zodat ze samen één bergketen vormen.
  function peakGeom(t, port) {
    var vbH = port ? 210 : 380, base = vbH - 34, maxH = base - 26;
    var H = PEAK_H[t] * maxH;
    return { vbH: vbH, base: base, maxH: maxH, H: H, B: 0.48 * H + 16 };
  }

  function ridgeFor(g) {
    var F = [[-1, 0], [-0.72, 0.36], [-0.52, 0.5], [-0.27, 0.78], [0, 1], [0.2, 0.86], [0.42, 0.63], [0.64, 0.5], [1, 0]];
    var out = [];
    for (var i = 0; i < F.length; i++) out.push([50 + F[i][0] * g.B, g.base - F[i][1] * g.H]);
    return out;
  }

  function snowCap(ridge, ys) {
    var out = [], L = null, R = null, i;
    for (i = 0; i < ridge.length - 1; i++) {
      var a = ridge[i], b = ridge[i + 1];
      if ((a[1] - ys) * (b[1] - ys) < 0) {
        var f = (ys - a[1]) / (b[1] - a[1]);
        var p = [a[0] + f * (b[0] - a[0]), ys];
        if (!L) L = p; else R = p;
      }
    }
    if (!L || !R) return [];
    out.push(L);
    for (i = 0; i < ridge.length; i++) if (ridge[i][1] < ys) out.push(ridge[i]);
    out.push(R);
    var w = R[0] - L[0], d = Math.max(3, w * 0.12);
    out.push([R[0] - w * 0.2, ys + d]);
    out.push([R[0] - w * 0.4, ys - d * 0.2]);
    out.push([R[0] - w * 0.6, ys + d * 1.2]);
    out.push([R[0] - w * 0.8, ys + d * 0.3]);
    return out;
  }

  // Het pad blijft op de linkerflank en in het midden: de rechterflank zit deels achter de buurberg.
  function trailFor(g) {
    var fs = [0.16, 0.36, 0.56, 0.76], out = [[50, g.base - 1]];
    for (var k = 0; k < fs.length; k++) {
      var x = k % 2 === 0 ? 50 - (1 - fs[k]) * 0.4 * g.B : 50 + (1 - fs[k]) * 0.08 * g.B;
      out.push([x, g.base - fs[k] * g.H]);
    }
    out.push([50, g.base - g.H + 2]);
    return out;
  }

  function lengths(list) {
    var ls = [], tot = 0;
    for (var i = 1; i < list.length; i++) {
      var dx = list[i][0] - list[i - 1][0], dy = list[i][1] - list[i - 1][1];
      var l = Math.sqrt(dx * dx + dy * dy);
      ls.push(l); tot += l;
    }
    return { segs: ls, total: tot };
  }

  function partialPath(list, frac) {
    var L = lengths(list), want = L.total * Math.max(0, Math.min(1, frac)), out = [list[0]];
    for (var i = 0; i < L.segs.length; i++) {
      if (want >= L.segs[i]) { out.push(list[i + 1]); want -= L.segs[i]; }
      else {
        var f = L.segs[i] ? want / L.segs[i] : 0;
        out.push([list[i][0] + f * (list[i + 1][0] - list[i][0]), list[i][1] + f * (list[i + 1][1] - list[i][1])]);
        break;
      }
    }
    return out;
  }

  // Eén tekening voor een rij bergen: verre rug, dan de bergen van links naar rechts, dan de weide.
  function rangeSvg(tables, port) {
    var n = tables.length, g0 = peakGeom(1, port), W = n * 100, i;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + g0.vbH, class: 'range-svg', preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true' });
    var far = [[0, g0.base + 2], [0, g0.base - 0.34 * g0.maxH]];
    for (i = 0; i <= n * 4; i++) {
      var wob = Math.sin(i * 2.3 + n) * 0.09 + Math.sin(i * 0.9) * 0.05;
      far.push([i * 25, g0.base - (0.46 + wob) * g0.maxH]);
    }
    far.push([W, g0.base - 0.34 * g0.maxH]);
    far.push([W, g0.base + 2]);
    svg.appendChild(s('polygon', { points: pts(far), class: 'far' }));

    for (i = 0; i < n; i++) {
      var t = tables[i], g = peakGeom(t, port), base = g.base, H = g.H;
      var prog = tableProgress(t), done = tableDone(t);
      var ridge = ridgeFor(g), trail = trailFor(g);
      var grp = s('g', { transform: 'translate(' + (i * 100) + ' 0)' });
      grp.appendChild(s('polygon', { points: pts(ridge), class: 'mtn mtn' + (t % 3) }));
      var cap = snowCap(ridge, base - 0.72 * H);
      if (cap.length) grp.appendChild(s('polygon', { points: pts(cap), class: 'snow' }));
      grp.appendChild(s('polyline', { points: pts(trail), class: 'trail' }));
      if (prog > 0) grp.appendChild(s('polyline', { points: pts(partialPath(trail, prog)), class: 'trail-done' }));
      if (done) {
        var top = base - H;
        grp.appendChild(s('line', { x1: 50, y1: top + 1, x2: 50, y2: top - 17, class: 'pole' }));
        grp.appendChild(s('polygon', { points: pts([[50.5, top - 17], [64, top - 12.5], [50.5, top - 8]]), class: 'pennant' }));
      }
      svg.appendChild(grp);
    }

    svg.appendChild(s('rect', { x: 0, y: g0.base, width: W, height: g0.vbH - g0.base + 2, class: 'meadow' }));
    svg.appendChild(s('line', { x1: 0, y1: g0.base, x2: W, y2: g0.base, class: 'ground' }));
    for (i = 0; i < n; i++) {
      var tt = tables[i], gg = peakGeom(tt, port), cx = i * 100 + 50;
      if (!tableDone(tt)) {
        var tr = trailFor(gg), at = partialPath(tr, tableProgress(tt));
        at = at[at.length - 1];
        svg.appendChild(s('circle', { cx: at[0] + i * 100, cy: at[1], r: 4.6, class: 'climber' }));
      }
      svg.appendChild(s('circle', { cx: cx, cy: g0.base + 17, r: 13, class: 'badge' }));
      svg.appendChild(s('text', { x: cx, y: g0.base + 23, 'text-anchor': 'middle', class: 'badge-num' }, String(tt)));
    }
    return svg;
  }

  function rangeRow(tables, port) {
    var hits = h('div', { class: 'peak-hits' });
    for (var i = 0; i < tables.length; i++) {
      (function (tt) {
        hits.appendChild(h('button', { class: 'peak', 'aria-label': 'De tafel van ' + tt, onclick: function () { go('table', { t: tt }); } }));
      })(tables[i]);
    }
    return h('div', { class: 'range-row' }, [rangeSvg(tables, port), hits]);
  }

  screens.home = function () {
    current.back = null;
    var st = S.settings;
    var port = isPort();
    var peaks = h('div', { class: 'peaks' }, port
      ? [rangeRow([1, 2, 3, 4, 5], true), rangeRow([6, 7, 8, 9, 10], true)]
      : rangeRow([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false));
    var sun = s('svg', { viewBox: '0 0 40 40', class: 'sun', 'aria-hidden': 'true' }, s('circle', { cx: 20, cy: 20, r: 14 }));
    var label = st.tables.length === 1 ? 'de tafel van ' + st.tables[0] : 'tafels van ' + listNl(st.tables);

    root.appendChild(h('div', { class: 'screen home' }, [
      h('header', { class: 'bar home-bar' }, [
        h('div', { class: 'brand' }, [icon('mountain'), h('span', { class: 'brand-name' }, 'Tafelberg')]),
        h('div', { class: 'bar-side bar-right' }, [starBadge(S.stats.stars), iconButton('gear', 'Instellingen', function () { go('settings'); })])
      ]),
      h('div', { class: 'range' }, [
        sun,
        h('div', { class: 'hello' }, [
          h('h1', null, st.name ? 'Dag ' + st.name + '!' : 'Dag!'),
          h('p', null, 'Tik op een berg om een tafel te bekijken.')
        ]),
        peaks
      ]),
      h('div', { class: 'home-actions' }, [
        h('button', { class: 'btn btn-sun btn-big', onclick: function () { go('practice', { tables: st.tables.slice(), from: 'home' }); } }, [
          h('span', { class: 'btn-title' }, 'Oefenen'),
          h('span', { class: 'btn-sub' }, label)
        ]),
        h('button', { class: 'btn btn-ice btn-big', onclick: function () { go('chart'); } }, [
          icon('grid'),
          h('span', { class: 'btn-title' }, 'Mijn tafelkaart')
        ])
      ])
    ]));
  };

  // ---------- één tafel bekijken
  screens.table = function (p) {
    var t = p.t, sel = p.sel || 1;
    current.back = function () { go('home'); };

    var list = h('div', { class: 'facts' });
    var panel = h('div', { class: 'fact-panel' });

    function pips(a) {
      var b = Math.max(0, Math.min(MASTER, box(a, t)));
      var wrap = h('span', { class: 'pips', 'aria-hidden': 'true' });
      for (var i = 0; i < MASTER; i++) wrap.appendChild(h('span', { class: 'pip' + (i < b ? ' on' : '') }));
      return wrap;
    }

    function drawPanel() {
      panel.innerHTML = '';
      var x = sel, y = t;
      add(panel, [
        h('div', { class: 'panel-eq' }, x + ' ' + TIMES + ' ' + y + ' = ' + (x * y)),
        h('div', { class: 'panel-model' }, dotModel(x, y)),
        h('p', { class: 'panel-groups' }, groupsText(x, y) + (x <= 6 && x > 1 ? ':  ' + chain(x, y) : '')),
        h('div', { class: 'tip' }, [h('span', { class: 'tip-head' }, 'Slim rekenen'), h('span', { class: 'tip-body' }, strategy(x, y, false))])
      ]);
    }

    function drawList() {
      list.innerHTML = '';
      var order = isPort() ? [1, 6, 2, 7, 3, 8, 4, 9, 5, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      for (var oi = 0; oi < order.length; oi++) {
        var a = order[oi];
        (function (aa) {
          list.appendChild(h('button', {
            class: 'fact-row' + (aa === sel ? ' sel' : '') + (level(aa, t) === 3 ? ' known' : ''),
            onclick: function () { sel = aa; current.params.sel = aa; drawList(); drawPanel(); }
          }, [h('span', { class: 'fact-eq' }, aa + ' ' + TIMES + ' ' + t + ' = ' + (aa * t)), pips(aa)]));
        })(a);
      }
    }

    drawList();
    drawPanel();

    root.appendChild(h('div', { class: 'screen table' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'De tafel van ' + t), starBadge(S.stats.stars)),
      h('p', { class: 'table-tip' }, tableTip(t)),
      h('div', { class: 'table-main' }, [list, panel]),
      h('div', { class: 'table-actions' }, [
        h('button', { class: 'btn btn-ice', onclick: function () { go('ladder', { t: t, dir: 1 }); } }, [icon('stairs'), h('span', { class: 'btn-title' }, 'Klim de tafelrij')]),
        h('button', { class: 'btn btn-sun', onclick: function () { go('practice', { tables: [t], from: 'table' }); } }, [h('span', { class: 'btn-title' }, 'Oefen de tafel van ' + t)])
      ])
    ]));
  };

  // ---------- tafelrij: de rij opzeggen als een trap naar de top
  screens.ladder = function (p) {
    var t = p.t, dir = p.dir || 1;
    var vals = [];
    for (var i = 0; i <= 10; i++) vals.push(i * t);
    if (dir < 0) vals.reverse();
    var pos = 1, typed = '', misses = 0, firstTry = true, finished = false;
    current.back = function () { go('table', { t: t }); };

    var svg = s('svg', { viewBox: '0 -95 620 515', class: 'ladder-svg', preserveAspectRatio: 'xMidYMid meet' });
    var display = h('div', { class: 'ladder-display' });
    var msg = h('p', { class: 'ladder-msg' });
    var stoneXY = [];
    // Een zigzagpad met haarspeldbochten; de stenen liggen op gelijke afstand.
    var route = [[90, 375], [520, 345], [130, 225], [470, 118], [300, 18]];
    for (var k = 0; k <= 10; k++) {
      var idx = dir > 0 ? k : 10 - k;
      var part = partialPath(route, idx / 10);
      stoneXY.push(part[part.length - 1]);
    }
    var ridge = [[-30, 420], [-30, 300], [70, 200], [150, 130], [230, 40], [300, -22], [370, 30], [450, 60],
      [540, 140], [600, 230], [650, 280], [650, 420]];
    var cap = snowCap(ridge, 52);

    function draw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.appendChild(s('polygon', { points: pts(ridge), class: 'ladder-mtn' }));
      if (cap.length) svg.appendChild(s('polygon', { points: pts(cap), class: 'ladder-snow' }));
      svg.appendChild(s('polyline', { points: pts(route), class: 'ladder-path' }));
      for (var j = 0; j <= 10; j++) {
        var xy = stoneXY[j], known = j < pos || finished, isNow = j === pos && !finished;
        svg.appendChild(s('circle', { cx: xy[0], cy: xy[1], r: 24, class: 'stone' + (known ? ' stone-done' : '') + (isNow ? ' stone-now' : '') }));
        var label = known ? String(vals[j]) : (isNow ? (typed || '?') : '');
        if (label) svg.appendChild(s('text', { x: xy[0], y: xy[1] + 8, 'text-anchor': 'middle', class: 'stone-num' + (isNow ? ' stone-num-now' : '') + (known ? ' stone-num-done' : '') }, label));
      }
      var summit = route[route.length - 1];
      if (finished && dir > 0) {
        svg.appendChild(s('line', { x1: summit[0], y1: summit[1] - 24, x2: summit[0], y2: summit[1] - 100, class: 'pole' }));
        svg.appendChild(s('polygon', { points: pts([[summit[0] + 1, summit[1] - 100], [summit[0] + 40, summit[1] - 86], [summit[0] + 1, summit[1] - 72]]), class: 'pennant' }));
      }
      if (!finished) {
        var me = stoneXY[pos - 1];
        svg.appendChild(s('circle', { cx: me[0] - 20, cy: me[1] - 26, r: 9, class: 'climber' }));
      }
      display.innerHTML = '';
      add(display, typed || ' ');
    }

    function step() { return dir > 0 ? '+' : '−'; }

    function setMsg(lead, eqLine, isHint) {
      msg.className = 'ladder-msg' + (isHint ? ' hint' : '');
      msg.innerHTML = '';
      add(msg, h('span', { class: 'msg-lead' }, lead));
      if (eqLine) add(msg, h('span', { class: 'msg-eq' }, eqLine));
    }

    function onKey(key) {
      if (finished) return;
      if (key === 'del') { typed = typed.slice(0, -1); draw(); return; }
      if (key === 'ok') {
        if (!typed) return;
        var want = vals[pos], prev = vals[pos - 1];
        if (parseInt(typed, 10) === want) {
          if (firstTry) { S.stats.stars++; }
          SND.ok();
          pos++; typed = ''; misses = 0; firstTry = true;
          if (pos > 10) {
            finished = true;
            saveState();
            SND.done();
            showEnd();
          } else {
            setMsg(dir > 0 ? 'Juist! En de volgende steen?' : 'Juist! En de steen eronder?', null, false);
          }
          draw();
          return;
        }
        misses++; firstTry = false; typed = '';
        SND.oops();
        if (misses === 1) setMsg(dir > 0 ? 'Tel er ' + t + ' bij:' : 'Haal er ' + t + ' af:', prev + ' ' + step() + ' ' + t + ' = ?', true);
        else setMsg('Typ ' + want + ':', prev + ' ' + step() + ' ' + t + ' = ' + want, true);
        draw();
        return;
      }
      if (typed.length < 3) { typed += key; draw(); }
    }

    var side = h('div', { class: 'ladder-side' });
    function showEnd() {
      side.innerHTML = '';
      var title = dir > 0 ? 'Je bent boven!' : 'Weer beneden!';
      add(side, [
        h('div', { class: 'end-card' }, [
          icon('flag'),
          h('h2', null, title),
          h('p', null, dir > 0 ? 'Durf je nu achteruit naar beneden?' : 'Je kent de tafelrij van ' + t + ' in twee richtingen.'),
          dir > 0
            ? h('button', { class: 'btn btn-sun', onclick: function () { go('ladder', { t: t, dir: -1 }); } }, h('span', { class: 'btn-title' }, 'Achteruit naar beneden'))
            : h('button', { class: 'btn btn-sun', onclick: function () { go('practice', { tables: [t], from: 'table' }); } }, h('span', { class: 'btn-title' }, 'Oefen de tafel van ' + t)),
          h('button', { class: 'btn btn-ice', onclick: current.back }, h('span', { class: 'btn-title' }, 'Klaar'))
        ])
      ]);
    }

    setMsg(dir > 0 ? 'Je start onderaan bij 0. Welk getal komt op de volgende steen?' : 'Je start bovenaan bij ' + (10 * t) + '. Welk getal komt eronder?', null, false);
    add(side, [msg, display, keypad(onKey)]);
    keyHandler = onKey;
    draw();

    root.appendChild(h('div', { class: 'screen ladder' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Tafelrij van ' + t), starBadge(S.stats.stars)),
      h('div', { class: 'ladder-main' }, [h('div', { class: 'ladder-art' }, svg), side])
    ]));
  };

  // ---------- oefenen: de adaptieve kern
  function newSession(tables) {
    var pool = [];
    for (var i = 0; i < tables.length; i++) for (var a = 1; a <= 10; a++) pool.push({ a: a, t: tables[i] });
    var before = {};
    for (var j = 0; j < tables.length; j++) before[tables[j]] = tableDone(tables[j]);
    return {
      tables: tables.slice(), pool: pool, len: S.settings.len,
      i: 0, main: 0, queue: [], hist: [], count: {}, newBudget: 3,
      stars: 0, firstOk: 0, fast: 0, wrong: [], wrongSeen: {}, mastered: [], doneBefore: before
    };
  }

  function askedWithin(se, k, win) {
    for (var i = se.hist.length - 1, n = 0; i >= 0 && n < win; i--, n++) if (se.hist[i].k === k) return true;
    return false;
  }

  function queued(se, k) {
    for (var i = 0; i < se.queue.length; i++) if (fkey(se.queue[i].a, se.queue[i].t) === k) return true;
    return false;
  }

  function weakRecent(se) {
    var n = 0;
    for (var i = se.hist.length - 1, c = 0; i >= 0 && c < 3; i--, c++) if (se.hist[i].weak) n++;
    return n;
  }

  function pickOld(list) {
    list.sort(function (x, y) {
      var fx = getFact(x.a, x.t), fy = getFact(y.a, y.t);
      return (fx ? fx.last : 0) - (fy ? fy.last : 0);
    });
    return list[Math.floor(Math.random() * Math.min(3, list.length))];
  }

  function introNext(fresh) {
    var best = 99, opts = [];
    for (var i = 0; i < fresh.length; i++) {
      var o = INTRO_ORDER.indexOf(fresh[i].a);
      if (o < best) { best = o; opts = [fresh[i]]; } else if (o === best) opts.push(fresh[i]);
    }
    return pick(opts);
  }

  function choose(se, win, lastResort) {
    var now = Date.now(), learn = [], due = [], fresh = [], known = [];
    for (var j = 0; j < se.pool.length; j++) {
      var p = se.pool[j], k = fkey(p.a, p.t);
      if (askedWithin(se, k, win) || queued(se, k)) continue;
      if (!lastResort && (se.count[k] || 0) >= 3) continue;
      var f = S.facts[k];
      if (!f) fresh.push(p);
      else if (f.b < 2) learn.push(p);
      else if (now >= f.due) due.push(p);
      else known.push(p);
    }
    var solid = due.length ? due : known;
    if (weakRecent(se) >= 2 && solid.length) return pickOld(solid);
    if (learn.length) return pickOld(learn);
    if (due.length && (Math.random() < 0.6 || !fresh.length || se.newBudget <= 0)) return pickOld(due);
    if (fresh.length && se.newBudget > 0) { se.newBudget--; return introNext(fresh); }
    if (known.length) return pickOld(known);
    if (lastResort && fresh.length) return introNext(fresh);
    return null;
  }

  function makeQuestion(a, t, reask) {
    var f = getFact(a, t), b = f ? f.b : -1, kind = 'mul';
    if (!reask && b >= 2) {
      var r = Math.random(), div = S.settings.div;
      if (div && b >= 3 && r < 0.25) kind = 'div';
      else if (b >= 3 && r < (div ? 0.4 : 0.2)) kind = 'miss';
      else if (a !== t && r < (div ? 0.6 : 0.45)) kind = 'swap';
    }
    var p = a * t, q = { a: a, t: t, kind: kind, product: p, x: a, y: t, reask: !!reask, tries: 0 };
    if (kind === 'mul') { q.parts = [a, TIMES, t, '=', null]; q.answer = p; }
    else if (kind === 'swap') { q.parts = [t, TIMES, a, '=', null]; q.answer = p; q.x = t; q.y = a; }
    else if (kind === 'miss') { q.parts = [null, TIMES, t, '=', p]; q.answer = a; }
    else { q.parts = [p, ':', t, '=', null]; q.answer = a; }
    return q;
  }

  function pickNext(se) {
    var i, r;
    for (i = 0; i < se.queue.length; i++) {
      if (se.queue[i].at <= se.i) {
        r = se.queue.splice(i, 1)[0];
        var rq = makeQuestion(r.a, r.t, true); rq.tries = r.tries;
        return rq;
      }
    }
    if (se.main >= se.len) {
      if (!se.queue.length) return null;
      se.queue.sort(function (x, y) { return x.at - y.at; });
      r = se.queue.shift();
      var lq = makeQuestion(r.a, r.t, true); lq.tries = r.tries;
      return lq;
    }
    var p = choose(se, 2, false) || choose(se, 1, false) || choose(se, 1, true) || choose(se, 0, true);
    if (!p) {
      if (!se.queue.length) return null;
      r = se.queue.shift();
      var fq = makeQuestion(r.a, r.t, true); fq.tries = r.tries;
      return fq;
    }
    return makeQuestion(p.a, p.t, false);
  }

  function fastLimit(q) {
    var ms = (q.kind === 'mul' || q.kind === 'swap') ? 5000 : 7000;
    return einkOn() ? ms + 1500 : ms;
  }

  // Het hart van de herhaling: hoe verandert het niveau van een som na een antwoord?
  function grade(q, ok, ms, assisted) {
    var k = fkey(q.a, q.t), f = S.facts[k], now = Date.now(), isNew = !f;
    if (!f) f = S.facts[k] = { b: 0, n: 0, c: 0, due: 0, last: 0 };
    var before = isNew ? -1 : f.b;
    var fast = ok && !assisted && ms <= fastLimit(q);
    f.n++;
    if (q.reask) {
      if (ok && !assisted) f.b = Math.max(f.b, 1);
    } else if (ok && !assisted) {
      f.c++;
      if (fast) {
        if (isNew) f.b = 2;                                  // kende hij al: meteen een stap verder
        else if (f.b < 2 || now >= f.due) f.b = Math.min(5, f.b + 1);
      } else if (f.b < 1) {
        f.b = 1;                                             // juist maar traag: wel begonnen, nog niet vlot
      }
    } else if (ok && assisted) {
      f.b = Math.min(f.b, 1);
    } else {
      f.b = f.b >= 3 ? 1 : 0;
    }
    f.due = now + INTERVALS[f.b];
    f.last = now;
    return { fast: fast, before: before, after: f.b, isNew: isNew };
  }

  screens.practice = function (p) {
    var tables = p.tables && p.tables.length ? p.tables : S.settings.tables;
    var se = newSession(tables);
    var q = null, typed = '', phase = 'ask', started = 0, assisted = false;
    current.back = function () {
      if (p.from === 'table' && tables.length === 1) go('table', { t: tables[0] });
      else go('home');
    };

    var pebbles = h('div', { class: 'pebbles', 'aria-hidden': 'true' });
    var stars = starBadge(S.stats.stars);
    var eq = h('div', { class: 'equation', 'aria-live': 'polite' });
    var fb = h('div', { class: 'feedback' });
    var helpBtn = h('button', { class: 'btn btn-ghost help-btn', onclick: showHelp }, 'Hulp');
    var helpRow = h('div', { class: 'help-row' }, helpBtn);

    function drawPebbles() {
      pebbles.innerHTML = '';
      for (var i = 0; i < se.len; i++) {
        pebbles.appendChild(h('span', { class: 'pebble' + (i < se.main ? ' done' : '') + (i === se.main - 1 && !q.reask && phase !== 'ask' ? ' last' : '') + (i === se.main && phase === 'ask' && !q.reask ? ' now' : '') }));
      }
    }

    function drawStars() {
      var n = stars.getElementsByTagName('span');
      for (var i = 0; i < n.length; i++) if (n[i].className === 'stars-n') n[i].textContent = String(S.stats.stars);
    }

    function drawEq(reveal) {
      eq.innerHTML = '';
      for (var i = 0; i < q.parts.length; i++) {
        var part = q.parts[i];
        if (part === null) {
          var txt = reveal ? String(q.answer) : typed;
          eq.appendChild(h('span', { class: 'tok blank' + (txt ? ' filled' : '') + (phase === 'fix' ? ' fix' : '') }, txt || ' '));
        } else if (part === TIMES || part === ':' || part === '=') {
          eq.appendChild(h('span', { class: 'tok op' }, part));
        } else {
          eq.appendChild(h('span', { class: 'tok num' }, String(part)));
        }
      }
    }

    function modelBlock(withAnswer) {
      var cap;
      if (q.kind === 'div' || q.kind === 'miss') {
        cap = withAnswer ? q.product + ' is ' + groupsText(q.a, q.t) + '.' : 'Hoeveel groepjes van ' + q.t + ' zijn samen ' + q.product + '?';
      } else {
        cap = groupsText(q.x, q.y) + (withAnswer ? (q.x === 1 ? ' is ' : ' zijn samen ') + q.product + '.' : '.');
      }
      return [h('div', { class: 'fb-model' }, dotModel(q.x, q.y)), h('p', { class: 'fb-cap' }, cap)];
    }

    function showHelp() {
      if (phase !== 'ask' || assisted) return;
      assisted = true;
      helpRow.style.display = 'none';
      fb.innerHTML = '';
      fb.className = 'feedback help';
      var kids = modelBlock(false);
      if ((q.kind === 'mul' || q.kind === 'swap') && q.x !== 1 && q.y !== 1) kids.push(h('p', { class: 'fb-tip' }, strategy(q.x, q.y, true)));
      add(fb, kids);
    }

    function next() {
      q = pickNext(se);
      if (!q) { finish(); return; }
      se.i++;
      if (!q.reask) se.main++;
      typed = ''; phase = 'ask'; assisted = false;
      fb.innerHTML = ''; fb.className = 'feedback';
      helpRow.style.display = '';
      drawEq(false); drawPebbles();
      started = Date.now();
    }

    function finish() {
      S.stats.rounds++;
      var today = todayStr();
      if (S.stats.lastDay !== today) { S.stats.days++; S.stats.lastDay = today; }
      saveState();
      go('summary', { se: se, from: p.from });
    }

    function onKey(key) {
      if (phase === 'wait') return;
      if (key === 'del') { typed = typed.slice(0, -1); drawEq(false); return; }
      if (key !== 'ok') {
        if (typed.length < 3) { typed += key; drawEq(false); }
        return;
      }
      if (!typed) return;
      var ans = parseInt(typed, 10), ok = ans === q.answer;

      if (phase === 'fix') {
        if (ok) {
          phase = 'wait';
          drawEq(true);
          fb.className = 'feedback fixed';
          fb.innerHTML = '';
          add(fb, h('p', { class: 'fb-big' }, 'Goed zo. Onthoud hem goed!'));
          later(next, einkOn() ? 1300 : 1000);
        } else {
          typed = '';
          drawEq(false);
          var nudge = fb.querySelector('.fb-do');
          if (nudge) { nudge.innerHTML = ''; add(nudge, 'Typ het getal ' + q.answer + '.'); }
        }
        return;
      }

      var ms = Date.now() - started;
      var res = grade(q, ok, ms, assisted);
      var k = fkey(q.a, q.t);
      se.count[k] = (se.count[k] || 0) + 1;
      se.hist.push({ k: k, weak: !ok || assisted || (res.isNew && !res.fast) });

      if (ok) {
        phase = 'wait';
        if (!assisted) { S.stats.stars++; se.stars++; }
        if (!q.reask && !assisted) se.firstOk++;
        if (res.fast && !q.reask) { se.fast++; if (res.isNew) se.newBudget++; }
        if (res.before < MASTER && res.after >= MASTER) se.mastered.push(q);
        saveState();
        drawStars();
        drawEq(false);
        fb.className = 'feedback good';
        fb.innerHTML = '';
        var line = [h('span', { class: 'fb-praise' }, pick(PRAISE))];
        if (res.fast) line.push(icon('bolt'));
        add(fb, h('p', { class: 'fb-big' }, line));
        if (res.before < MASTER && res.after >= MASTER) add(fb, h('p', { class: 'fb-sub' }, 'Die zit erin!'));
        else if (assisted) add(fb, h('p', { class: 'fb-sub' }, 'Met hulp lukt het. Straks probeer je hem zonder.'));
        helpRow.style.display = 'none';
        if (res.fast) SND.fast(); else SND.ok();
        later(next, einkOn() ? 1100 : 850);
        return;
      }

      // fout: uitleg, zelf verbeteren, en later in deze ronde opnieuw
      phase = 'fix';
      saveState();
      if (!se.wrongSeen[k]) { se.wrongSeen[k] = true; se.wrong.push(q); }
      if (q.tries < 2) se.queue.push({ a: q.a, t: q.t, at: se.i + (q.reask ? 2 : 3), tries: q.tries + 1 });
      SND.oops();
      typed = '';
      drawEq(false);
      helpRow.style.display = 'none';
      fb.className = 'feedback fix';
      fb.innerHTML = '';
      var note = errorNote(q, ans);
      var kids = [h('p', { class: 'fb-title' }, [
        h('span', { class: 'fb-lead' }, res.isNew ? 'Deze is nieuw. Kijk:' : 'Niet helemaal. Kijk:'),
        h('span', { class: 'fb-eq' }, eqText(q))
      ])];
      if (note) kids.push(h('p', { class: 'fb-note' }, note));
      kids.push(h('div', { class: 'fb-model' }, dotModel(q.x, q.y)));
      var why;
      if (q.kind === 'div' || q.kind === 'miss') why = q.product + ' is ' + groupsText(q.a, q.t) + ', want ' + q.a + ' ' + TIMES + ' ' + q.t + ' = ' + q.product + '.';
      else if (q.x === 1 || q.y === 1) why = groupsText(q.x, q.y) + (q.x === 1 ? ' is ' : ' zijn samen ') + q.product + '.';
      else why = strategy(q.x, q.y, false);
      kids.push(h('p', { class: 'fb-tip' }, why));
      kids.push(h('p', { class: 'fb-do' }, q.kind === 'miss' ? 'Typ nu zelf het getal dat ontbreekt.' : 'Typ nu zelf de uitkomst.'));
      add(fb, kids);
    }

    keyHandler = onKey;
    root.appendChild(h('div', { class: 'screen practice' }, [
      topBar(iconButton('close', 'Stoppen', current.back), pebbles, stars),
      h('div', { class: 'practice-main' }, [
        h('div', { class: 'qzone' }, [eq, fb, helpRow]),
        h('div', { class: 'padzone' }, keypad(onKey))
      ])
    ]));
    next();
  };

  // ---------- einde van een ronde
  screens.summary = function (p) {
    var se = p.se;
    var again = function () { go('practice', { tables: se.tables, from: p.from }); };
    current.back = function () {
      if (p.from === 'table' && se.tables.length === 1) go('table', { t: se.tables[0] });
      else go('home');
    };
    var summits = [];
    for (var i = 0; i < se.tables.length; i++) {
      var t = se.tables[i];
      if (!se.doneBefore[t] && tableDone(t)) summits.push(t);
    }
    SND.done();

    var title = summits.length ? 'Op de top van de tafel van ' + listNl(summits) + '!' : 'Klaar!';
    var stats = h('div', { class: 'sum-stats' }, [
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, se.firstOk + ' van ' + se.len), h('span', { class: 'sum-l' }, 'meteen juist')]),
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, [icon('bolt'), String(se.fast)]), h('span', { class: 'sum-l' }, 'keer bliksemsnel')]),
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, [icon('star'), '+' + se.stars]), h('span', { class: 'sum-l' }, 'sterren')])
    ]);

    function chips(list) {
      var wrap = h('div', { class: 'chips' });
      for (var j = 0; j < list.length; j++) wrap.appendChild(h('span', { class: 'chip' }, eqText(list[j])));
      return wrap;
    }

    var blocks = [];
    if (se.mastered.length) blocks.push(h('div', { class: 'sum-block' }, [h('h2', null, 'Deze zitten erin'), chips(se.mastered)]));
    if (se.wrong.length) blocks.push(h('div', { class: 'sum-block' }, [h('h2', null, 'Hier oefenen we nog op'), chips(se.wrong)]));
    if (!se.wrong.length && !se.mastered.length) blocks.push(h('p', { class: 'sum-quiet' }, 'Geen enkele fout!'));

    root.appendChild(h('div', { class: 'screen summary' }, [
      topBar(iconButton('back', 'Terug', current.back), null, starBadge(S.stats.stars)),
      h('div', { class: 'sum-main' }, [
        h('div', { class: 'sum-flag' + (summits.length ? ' big' : '') }, icon(summits.length ? 'flag' : 'mountain')),
        h('h1', null, title),
        stats,
        h('div', { class: 'sum-blocks' }, blocks),
        h('div', { class: 'sum-actions' }, [
          h('button', { class: 'btn btn-sun', onclick: again }, h('span', { class: 'btn-title' }, 'Nog een ronde')),
          h('button', { class: 'btn btn-ice', onclick: function () { go('home'); } }, h('span', { class: 'btn-title' }, 'Naar de bergen'))
        ])
      ])
    ]));
  };

  // ---------- tafelkaart: alle 100 sommen in één oogopslag
  screens.chart = function () {
    current.back = function () { go('home'); };
    var grid = h('div', { class: 'chart', role: 'table', 'aria-label': 'Tafelkaart' });
    var head = h('div', { class: 'chart-row chart-head', role: 'row' }, h('span', { class: 'chart-corner' }, TIMES));
    for (var a = 1; a <= 10; a++) head.appendChild(h('span', { class: 'chart-h' }, String(a)));
    grid.appendChild(head);
    for (var t = 1; t <= 10; t++) {
      (function (tt) {
        var row = h('div', { class: 'chart-row', role: 'row' }, h('button', { class: 'chart-t', 'aria-label': 'De tafel van ' + tt, onclick: function () { go('table', { t: tt }); } }, String(tt)));
        for (var aa = 1; aa <= 10; aa++) {
          row.appendChild(h('span', { class: 'cell lv' + level(aa, tt), title: aa + ' ' + TIMES + ' ' + tt }, String(aa * tt)));
        }
        grid.appendChild(row);
      })(t);
    }
    var legend = h('div', { class: 'legend' });
    var names = ['nog niet geoefend', 'aan het leren', 'bijna', 'zit erin'];
    for (var i = 0; i < 4; i++) legend.appendChild(h('span', { class: 'legend-item' }, [h('span', { class: 'cell mini lv' + i }), names[i]]));
    var n = masteredTotal();

    root.appendChild(h('div', { class: 'screen chartscreen' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Mijn tafelkaart'), starBadge(S.stats.stars)),
      h('p', { class: 'chart-sum' }, n === 1 ? '1 van de 100 sommen zit erin.' : n + ' van de 100 sommen zitten erin.'),
      h('div', { class: 'chart-wrap' }, [h('p', { class: 'chart-axis' }, 'Elke rij is een tafel. Tik op een getal links om die tafel te openen.'), grid]),
      legend
    ]));
  };

  // ---------- instellingen (voor ouders)
  screens.settings = function () {
    current.back = function () { go('home'); };
    var st = S.settings;

    function toggle(label, note, get, set) {
      var btn = h('button', { class: 'switch' + (get() ? ' on' : ''), role: 'switch', 'aria-checked': get() ? 'true' : 'false', 'aria-label': label });
      btn.appendChild(h('span', { class: 'knob' }));
      btn.addEventListener('click', function () {
        set(!get());
        btn.className = 'switch' + (get() ? ' on' : '');
        btn.setAttribute('aria-checked', get() ? 'true' : 'false');
        saveState();
      }, false);
      return h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, [h('span', { class: 'set-label' }, label), note ? h('span', { class: 'set-note' }, note) : null]), btn]);
    }

    var nameInput = h('input', { type: 'text', class: 'name-input', value: st.name, maxlength: '20', autocomplete: 'off', 'aria-label': 'Naam' });
    nameInput.addEventListener('input', function () { st.name = nameInput.value.replace(/^\s+|\s+$/g, ''); saveState(); }, false);

    var tableChips = h('div', { class: 'table-chips' });
    function drawTableChips() {
      tableChips.innerHTML = '';
      for (var t = 1; t <= 10; t++) {
        (function (tt) {
          var on = st.tables.indexOf(tt) >= 0;
          tableChips.appendChild(h('button', {
            class: 'tchip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false',
            onclick: function () {
              var idx = st.tables.indexOf(tt);
              if (idx >= 0) { if (st.tables.length > 1) st.tables.splice(idx, 1); }
              else { st.tables.push(tt); st.tables.sort(function (x, y) { return x - y; }); }
              saveState(); drawTableChips();
            }
          }, String(tt)));
        })(t);
      }
    }
    drawTableChips();

    var lenWrap = h('div', { class: 'seg' });
    function drawLen() {
      lenWrap.innerHTML = '';
      var opts = [8, 12, 16, 20];
      for (var i = 0; i < opts.length; i++) {
        (function (n) {
          lenWrap.appendChild(h('button', { class: 'seg-btn' + (st.len === n ? ' on' : ''), onclick: function () { st.len = n; saveState(); drawLen(); } }, String(n)));
        })(opts[i]);
      }
    }
    drawLen();

    var resetBtn = h('button', { class: 'btn btn-line' }, 'Voortgang wissen');
    var armed = false;
    resetBtn.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        resetBtn.innerHTML = '';
        add(resetBtn, 'Zeker? Tik nog eens om alles te wissen');
        resetBtn.className = 'btn btn-line danger';
        return;
      }
      S.facts = {};
      S.stats = defaultState().stats;
      saveState();
      go('home');
    }, false);

    root.appendChild(h('div', { class: 'screen settings' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Instellingen'), null),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-col' }, [
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, h('span', { class: 'set-label' }, 'Naam')), nameInput]),
          h('div', { class: 'set-block' }, [h('span', { class: 'set-label' }, 'Tafels bij Oefenen'), h('span', { class: 'set-note' }, 'Kies de tafels die in de klas al aan bod kwamen.'), tableChips]),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, h('span', { class: 'set-label' }, 'Sommen per ronde')), lenWrap]),
          toggle('Deelsommen meeoefenen', 'Zoals 12 : 3. Pas als de maalsom al goed gaat.', function () { return !!st.div; }, function (v) { st.div = v; }),
          toggle('E-inkweergave', 'Zwart-wit en zonder beweging. Staat vanzelf aan op een Boox.', function () { return einkOn(); }, function (v) { st.eink = v; applyTheme(); }),
          toggle('Geluid', null, function () { return !!st.sound; }, function (v) { st.sound = v; }),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, [h('span', { class: 'set-label' }, 'Opnieuw beginnen'), h('span', { class: 'set-note' }, 'Wist alle niveaus en sterren.')]), resetBtn])
        ]),
        h('div', { class: 'set-col parents' }, [
          h('h2', null, 'Voor ouders'),
          h('p', null, 'Tafelberg volgt de opbouw uit de klas. Eerst begrijpen: elke som is een aantal groepjes, getoond als stippen in bakjes. Dan slim afleiden vanuit de steunpunttafels 1, 2, 5 en 10. Pas daarna komt het vlot onthouden.'),
          h('p', null, 'Elke som heeft een eigen niveau. Wie een som juist en vlot beantwoordt (binnen een vijftal seconden, typen inbegrepen), gaat een niveau hoger. Die som komt dan pas later terug: na een dag, daarna na twee, vier en negen dagen. Bij een fout zakt de som. Uw kind ziet meteen hoe het zit, typt de juiste uitkomst over en krijgt dezelfde som later in de ronde nog eens.'),
          h('p', null, 'Er loopt geen klok in beeld. Snelheid telt mee, maar wordt enkel beloond met een bliksem. Nieuwe sommen komen in kleine porties, tussen sommen die al goed gaan. Een som zit erin als ze over enkele dagen heen telkens vlot juist was.'),
          h('p', null, 'Elke dag een korte ronde werkt beter dan af en toe lang oefenen.'),
          h('p', { class: 'set-small' }, 'Gedaan: ' + S.stats.rounds + (S.stats.rounds === 1 ? ' ronde' : ' rondes') + ' op ' + S.stats.days + (S.stats.days === 1 ? ' dag' : ' dagen') + '. ' + masteredTotal() + ' van de 100 sommen zitten erin.')
        ])
      ])
    ]));
  };

  // ---------------------------------------------------------------- start
  function boot() {
    S = loadState();
    applyTheme();
    fitRoot();
    window.addEventListener('resize', fitRoot, false);
    window.addEventListener('orientationchange', function () { window.setTimeout(fitRoot, 200); }, false);
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, false);
    go('home');
  }

  // Voor tests in een gewone browser.
  window.Tafelberg = {
    state: function () { return S; },
    grade: function (q, ok, ms, assisted) { return grade(q, ok, ms, assisted); },
    makeQuestion: makeQuestion,
    newSession: newSession,
    pickNext: pickNext,
    strategy: strategy,
    go: go,
    reload: function () { S = loadState(); applyTheme(); go('home'); }
  };

  boot();
}());
