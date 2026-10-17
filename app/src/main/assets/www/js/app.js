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
 *
 * Spelelementen belonen inzet en nauwkeurigheid, niet alleen snelheid: sterren per juist
 * antwoord, een bonusster per reeks van vijf, klimniveaus, dagen op rij en medailles.
 * De sprint met klok is een vrijwillige uitdaging en gebruikt enkel sommen die al goed gaan.
 *
 * Meerdere spelers kunnen op hetzelfde toestel spelen, elk met een eigen voortgang.
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
  var COLORS = ['#D33F49', '#E07B24', '#F2B705', '#2D7A4D', '#1F8A8A', '#2F6FD0', '#7A4FB5', '#4C5D82'];
  var SPRINT_MS = 60000;
  var SPRINT_MIN = 6;

  // Klimniveaus: hoeveel sterren je nodig hebt voor elke titel.
  var LEVELS = [
    [0, 'Wandelaar'], [15, 'Padzoeker'], [40, 'Rotsklimmer'], [80, 'Touwklimmer'], [140, 'Gletsjerloper'],
    [220, 'Berggids'], [320, 'Toppenjager'], [450, 'Bergkampioen'], [620, 'Sneeuwarend'], [850, 'Tafelkoning']
  ];

  // Medailles. Elke test krijgt de statistieken van de speler.
  var BADGES = [
    { id: 'step', icon: 'mountain', title: 'Eerste stap', text: 'Je eerste oefenronde.', test: function (st) { return st.rounds >= 1; } },
    { id: 'perfect', icon: 'star', title: 'Foutloos', text: 'Een hele ronde zonder één fout.', test: function (st) { return st.perfect >= 1; } },
    { id: 'combo10', icon: 'link', title: 'Lange reeks', text: '10 sommen na elkaar juist.', test: function (st) { return st.bestCombo >= 10; } },
    { id: 'bolt8', icon: 'bolt', title: 'Bliksem', text: '8 keer bliksemsnel in één ronde.', test: function (st) { return st.bestBolts >= 8; } },
    { id: 'help', icon: 'bulb', title: 'Slim gevraagd', text: 'Hulp gevraagd en dan juist.', test: function (st) { return st.helpOk >= 1; } },
    { id: 'ladder', icon: 'stairs', title: 'Trappenloper', text: 'Een tafelrij naar boven en terug naar beneden.', test: function (st) { return ladderBoth(st) >= 1; } },
    { id: 'summit1', icon: 'flag', title: 'Eerste top', text: 'Alle sommen van één tafel zitten erin.', test: function () { return summitsCount() >= 1; } },
    { id: 'summit5', icon: 'flag', title: 'Vijf toppen', text: 'Vijf tafels helemaal onder de knie.', test: function () { return summitsCount() >= 5; } },
    { id: 'summit10', icon: 'crown', title: 'Alle toppen', text: 'Alle tien tafels zitten erin.', test: function () { return summitsCount() >= 10; } },
    { id: 'days3', icon: 'sun', title: 'Drie dagen', text: 'Drie dagen na elkaar geoefend.', test: function (st) { return st.bestStreak >= 3; } },
    { id: 'days7', icon: 'sun', title: 'Een hele week', text: 'Zeven dagen na elkaar geoefend.', test: function (st) { return st.bestStreak >= 7; } },
    { id: 'sprint10', icon: 'hut', title: 'Snelle voeten', text: '10 sommen in één sprint.', test: function (st) { return st.sprintBest >= 10; } },
    { id: 'sprint20', icon: 'hut', title: 'Hutkampioen', text: '20 sommen in één sprint.', test: function (st) { return st.sprintBest >= 20; } },
    { id: 'divide', icon: 'divide', title: 'Verdeler', text: '10 deelsommen juist.', test: function (st) { return st.divOk >= 10; } },
    { id: 'stars200', icon: 'star', title: 'Sterrenhemel', text: '200 sterren verzameld.', test: function (st) { return st.stars >= 200; } }
  ];

  var root = document.getElementById('app');
  var S = null;
  var current = null;
  var keyHandler = null;
  var timers = [];
  var deviceEink = /[?&]eink=1/.test(window.location.search);

  // ---------------------------------------------------------------- opslag
  // Eén opslag voor het toestel, met daarin een profiel per speler.
  function defaultStats() {
    return {
      stars: 0, rounds: 0, days: 0, lastDay: '', streak: 0, bestStreak: 0,
      bestCombo: 0, bestBolts: 0, perfect: 0, helpOk: 0, divOk: 0,
      sprints: 0, sprintBest: 0, ladderUp: {}, ladderDown: {}, badges: {}
    };
  }

  function defaultSettings() { return { tables: [2, 5, 10], len: 12, div: false, sound: true }; }

  function defaultStore() { return { v: 2, device: { eink: null }, current: null, order: [], profiles: {} }; }

  function makeProfile(name, color, tables) {
    var id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
    var st = defaultSettings();
    if (tables && tables.length) st.tables = tables.slice();
    return { id: id, name: name, color: color || 0, created: Date.now(), settings: st, facts: {}, stats: defaultStats() };
  }

  function fill(obj, defaults) {
    for (var k in defaults) if (defaults.hasOwnProperty(k) && !(k in obj)) obj[k] = defaults[k];
    return obj;
  }

  function migrate(st) {
    if (!st || typeof st !== 'object') return defaultStore();
    if (st.v === 2 && st.profiles) return st;
    var out = defaultStore();
    if (st.settings) {
      // Opslag van de eerste versie: één speler zonder profielen.
      var p = makeProfile(st.settings.name || 'Speler', 0, st.settings.tables);
      p.settings.len = st.settings.len || 12;
      p.settings.div = !!st.settings.div;
      p.settings.sound = st.settings.sound !== false;
      p.facts = st.facts || {};
      if (st.stats) { p.stats.stars = st.stats.stars || 0; p.stats.rounds = st.stats.rounds || 0; p.stats.days = st.stats.days || 0; p.stats.lastDay = st.stats.lastDay || ''; }
      out.device.eink = st.settings.eink === undefined ? null : st.settings.eink;
      out.profiles[p.id] = p;
      out.order.push(p.id);
      out.current = p.id;
    }
    return out;
  }

  function normalise(st) {
    st = migrate(st);
    if (!st.device) st.device = { eink: null };
    if (!st.order) st.order = [];
    if (!st.profiles) st.profiles = {};
    var keep = [];
    for (var i = 0; i < st.order.length; i++) {
      var p = st.profiles[st.order[i]];
      if (!p) continue;
      p.settings = fill(p.settings || {}, defaultSettings());
      if (!p.settings.tables || !p.settings.tables.length) p.settings.tables = [2];
      p.facts = p.facts || {};
      p.stats = fill(p.stats || {}, defaultStats());
      keep.push(p.id);
    }
    st.order = keep;
    if (!st.current || !st.profiles[st.current]) st.current = keep.length ? keep[0] : null;
    return st;
  }

  function bridge() {
    var b = window.AndroidStore;
    return b && typeof b.get === 'function' ? b : null;
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

  // De speler die nu aan de beurt is.
  function P() { return S.profiles[S.current]; }

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

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function listNl(nums) {
    if (nums.length === 1) return String(nums[0]);
    return nums.slice(0, -1).join(', ') + ' en ' + nums[nums.length - 1];
  }

  // ---------------------------------------------------------------- thema en maat
  function einkOn() { return S.device.eink === null ? deviceEink : !!S.device.eink; }

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
    if (lastPort !== null && port !== lastPort && current && (current.name === 'home' || current.name === 'table')) go(current.name, current.params);
    lastPort = port;
  }

  // ---------------------------------------------------------------- geluid
  var audioCtx = null;
  function play(notes, step) {
    var pr = S && S.current ? P() : null;
    if (!pr || !pr.settings.sound) return;
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
    combo: function () { play([784, 988, 1175, 1568], 0.07); },
    oops: function () { play([392, 349], 0.14); },
    done: function () { play([523, 659, 784, 1047], 0.12); },
    tick: function () { play([1047], 0.04); }
  };

  // ---------------------------------------------------------------- iconen
  function icon(name) {
    var svg = s('svg', { viewBox: '0 0 24 24', class: 'icon icon-' + name, 'aria-hidden': 'true' });
    var i;
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
      for (i = 0; i < 8; i++) g.appendChild(s('rect', { x: 10.4, y: 1.6, width: 3.2, height: 5, rx: 1, transform: 'rotate(' + (i * 45) + ' 12 12)' }));
      svg.appendChild(g);
      svg.appendChild(s('circle', { cx: 12, cy: 12, r: 7, class: 'fill' }));
      svg.appendChild(s('circle', { cx: 12, cy: 12, r: 3, class: 'hole' }));
    } else if (name === 'grid') {
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
        svg.appendChild(s('rect', { x: 3 + c * 6.5, y: 3 + r * 6.5, width: 5, height: 5, rx: 1.2, class: (r + c) % 2 ? 'fill soft' : 'fill' }));
      }
    } else if (name === 'flag') {
      svg.appendChild(s('path', { d: 'M6 21V3.5', class: 'line' }));
      svg.appendChild(s('path', { d: 'M6.5 4h11l-3 4 3 4h-11z', class: 'fill flagcloth' }));
    } else if (name === 'stairs') {
      svg.appendChild(s('path', { d: 'M3 20h5v-5h5v-5h5V5h3', class: 'line' }));
    } else if (name === 'erase') {
      svg.appendChild(s('path', { d: 'M8.5 5h11.5v14H8.5L2.5 12z', class: 'line' }));
      svg.appendChild(s('path', { d: 'M11 9.5l5 5M16 9.5l-5 5', class: 'line' }));
    } else if (name === 'mountain') {
      svg.appendChild(s('path', { d: 'M1.5 20.5L9 7l3.6 6.2L15.4 9l7.1 11.5z', class: 'fill' }));
    } else if (name === 'sun') {
      svg.appendChild(s('circle', { cx: 12, cy: 12, r: 4.6, class: 'fill' }));
      for (i = 0; i < 8; i++) svg.appendChild(s('line', { x1: 12, y1: 2.6, x2: 12, y2: 5.2, class: 'line thin', transform: 'rotate(' + (i * 45) + ' 12 12)' }));
    } else if (name === 'crown') {
      svg.appendChild(s('path', { d: 'M3 18.5h18L19.6 7.5l-4.6 4.3L12 5l-3 6.8-4.6-4.3z', class: 'fill' }));
    } else if (name === 'bulb') {
      svg.appendChild(s('path', { d: 'M12 2.8a6.2 6.2 0 0 0-3.7 11.2V16.5h7.4V14A6.2 6.2 0 0 0 12 2.8z', class: 'fill' }));
      svg.appendChild(s('path', { d: 'M9 19h6M10 21.4h4', class: 'line thin' }));
    } else if (name === 'link') {
      svg.appendChild(s('rect', { x: 2.5, y: 8, width: 11, height: 8, rx: 4, class: 'line' }));
      svg.appendChild(s('rect', { x: 10.5, y: 8, width: 11, height: 8, rx: 4, class: 'line' }));
    } else if (name === 'hut') {
      svg.appendChild(s('path', { d: 'M2.5 12.2L12 4l9.5 8.2', class: 'line' }));
      svg.appendChild(s('path', { d: 'M5.2 10.4V20.5h13.6V10.4L12 4.6z', class: 'fill' }));
      svg.appendChild(s('rect', { x: 10, y: 14.5, width: 4, height: 6, class: 'hole' }));
    } else if (name === 'divide') {
      svg.appendChild(s('circle', { cx: 12, cy: 5.5, r: 2.2, class: 'fill' }));
      svg.appendChild(s('circle', { cx: 12, cy: 18.5, r: 2.2, class: 'fill' }));
      svg.appendChild(s('path', { d: 'M4 12h16', class: 'line' }));
    } else if (name === 'medal') {
      svg.appendChild(s('path', { d: 'M7 2.5h4l2 6h-4zM17 2.5h-4l-2 6h4z', class: 'fill soft' }));
      svg.appendChild(s('circle', { cx: 12, cy: 15, r: 6.5, class: 'fill' }));
      svg.appendChild(s('circle', { cx: 12, cy: 15, r: 3, class: 'hole' }));
    } else if (name === 'plus') {
      svg.appendChild(s('path', { d: 'M12 5v14M5 12h14', class: 'line' }));
    } else if (name === 'swap') {
      svg.appendChild(s('path', { d: 'M4 8h13l-3.5-3.5M20 16H7l3.5 3.5', class: 'line' }));
    }
    return svg;
  }

  function starBadge(n) {
    return h('div', { class: 'stars', 'aria-label': n + ' sterren' }, [icon('star'), h('span', { class: 'stars-n' }, String(n))]);
  }

  function iconButton(name, label, fn, extra) {
    return h('button', { class: 'icon-btn' + (extra ? ' ' + extra : ''), 'aria-label': label, title: label, onclick: fn }, icon(name));
  }

  function initial(name) { return (name || '?').charAt(0).toUpperCase(); }

  function avatar(pr, extra) {
    var ci = pr.color % COLORS.length;
    return h('span', {
      class: 'avatar' + (extra ? ' ' + extra : ''),
      style: 'background-color:' + COLORS[ci] + ';color:' + (ci === 2 ? '#1F2A44' : '#FFFFFF'),
      'aria-hidden': 'true'
    }, initial(pr.name));
  }

  // ---------------------------------------------------------------- klimniveaus
  function levelInfo(stars) {
    var i = 0;
    while (i + 1 < LEVELS.length && stars >= LEVELS[i + 1][0]) i++;
    var from = LEVELS[i][0], last = i + 1 >= LEVELS.length;
    var to = last ? from : LEVELS[i + 1][0];
    return {
      n: i + 1, title: LEVELS[i][1], next: last ? null : LEVELS[i + 1][1],
      need: last ? 0 : to - stars, frac: last ? 1 : (stars - from) / (to - from)
    };
  }

  function levelCard(stars, extra) {
    var L = levelInfo(stars);
    return h('div', { class: 'lvl' + (extra ? ' ' + extra : '') }, [
      h('span', { class: 'lvl-n', 'aria-label': 'niveau ' + L.n }, String(L.n)),
      h('div', { class: 'lvl-body' }, [
        h('span', { class: 'lvl-title' }, L.title),
        h('div', { class: 'lvl-bar' }, h('div', { class: 'lvl-fill', style: 'width:' + Math.round(L.frac * 100) + '%' })),
        h('span', { class: 'lvl-need' }, L.next ? 'Nog ' + L.need + (L.need === 1 ? ' ster' : ' sterren') + ' tot ' + L.next : 'Het hoogste niveau!')
      ])
    ]);
  }

  // ---------------------------------------------------------------- dagen op rij, sterren, medailles
  function dayStr(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function todayStr() { return dayStr(new Date()); }
  function yesterdayStr() { var d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); }

  function markDay() {
    var st = P().stats, today = todayStr();
    if (st.lastDay === today) return;
    st.streak = st.lastDay === yesterdayStr() ? st.streak + 1 : 1;
    if (st.streak > st.bestStreak) st.bestStreak = st.streak;
    st.days++;
    st.lastDay = today;
  }

  function currentStreak() {
    var st = P().stats;
    return (st.lastDay === todayStr() || st.lastDay === yesterdayStr()) ? st.streak : 0;
  }

  function addStars(n) { P().stats.stars += n; }

  function ladderBoth(st) {
    var n = 0;
    for (var t in st.ladderUp) if (st.ladderUp.hasOwnProperty(t) && st.ladderDown[t]) n++;
    return n;
  }

  function summitsCount() {
    var n = 0;
    for (var t = 1; t <= 10; t++) if (tableDone(t)) n++;
    return n;
  }

  // Kent nieuwe medailles toe en geeft ze terug.
  function awardBadges() {
    var st = P().stats, got = [];
    for (var i = 0; i < BADGES.length; i++) {
      var b = BADGES[i];
      if (!st.badges[b.id] && b.test(st)) { st.badges[b.id] = todayStr(); got.push(b); }
    }
    return got;
  }

  function badgeCount() {
    var n = 0, st = P().stats;
    for (var i = 0; i < BADGES.length; i++) if (st.badges[BADGES[i].id]) n++;
    return n;
  }

  function medal(b, earned, extra) {
    var svg = s('svg', { viewBox: '0 0 48 56', class: 'medal' + (earned ? ' won' : ' locked') + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' });
    svg.appendChild(s('path', { d: 'M13 2h9l5 16h-9z', class: 'ribbon-a' }));
    svg.appendChild(s('path', { d: 'M35 2h-9l-5 16h9z', class: 'ribbon-b' }));
    svg.appendChild(s('circle', { cx: 24, cy: 34, r: 19, class: 'disc' }));
    svg.appendChild(s('circle', { cx: 24, cy: 34, r: 14.5, class: 'disc-in' }));
    var ic = icon(b.icon);
    ic.setAttribute('class', 'micon icon-' + b.icon);
    ic.setAttribute('x', '14'); ic.setAttribute('y', '24'); ic.setAttribute('width', '20'); ic.setAttribute('height', '20');
    svg.appendChild(ic);
    return svg;
  }

  function newBadgesBlock(list) {
    if (!list.length) return null;
    var row = h('div', { class: 'new-badges' });
    for (var i = 0; i < list.length; i++) {
      row.appendChild(h('div', { class: 'new-badge' }, [medal(list[i], true), h('span', { class: 'nb-title' }, list[i].title)]));
    }
    return h('div', { class: 'sum-block' }, [h('h2', null, list.length === 1 ? 'Nieuwe medaille' : 'Nieuwe medailles'), row]);
  }

  // Een korte regen van papiersnippers, alleen in kleur en zonder 'minder beweging'.
  function confetti(host) {
    if (einkOn()) return;
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { /* niets */ }
    var box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    var cols = ['#F2B705', '#D33F49', '#2F6FD0', '#2D7A4D', '#FFFFFF', '#E07B24'];
    for (var i = 0; i < 36; i++) {
      var left = Math.random() * 100, delay = Math.random() * 0.8, dur = 2.2 + Math.random() * 1.4, rot = Math.floor(Math.random() * 360);
      var st = 'left:' + left.toFixed(1) + '%;background-color:' + cols[i % cols.length] + ';-webkit-animation-delay:' + delay.toFixed(2) + 's;animation-delay:' + delay.toFixed(2) +
        's;-webkit-animation-duration:' + dur.toFixed(2) + 's;animation-duration:' + dur.toFixed(2) + 's;-webkit-transform:rotate(' + rot + 'deg);transform:rotate(' + rot + 'deg)';
      box.appendChild(h('span', { class: 'bit' + (i % 3 === 0 ? ' round' : ''), style: st }));
    }
    host.appendChild(box);
    later(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 4500);
  }

  // Kleine klimhelling voor in de balk tijdens een ronde: elke som is een stap naar de top.
  function climbBar(len, done, onStep) {
    var W = 320, H = 46, x0 = 14, y0 = 38, x1 = 292, y1 = 12;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'climb', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    svg.appendChild(s('polygon', { points: pts([[0, H], [0, y0 + 3], [x0, y0], [x1, y1], [W, y1 + 8], [W, H]]), class: 'climb-hill' }));
    svg.appendChild(s('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'climb-line' }));
    for (var i = 0; i <= len; i++) {
      var f = i / len, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
      if (i === len) continue;
      svg.appendChild(s('circle', { cx: x, cy: y, r: 3.3, class: 'climb-stop' + (i < done ? ' on' : '') + (i === onStep ? ' now' : '') }));
    }
    svg.appendChild(s('line', { x1: x1, y1: y1, x2: x1, y2: y1 - 12, class: 'climb-pole' }));
    svg.appendChild(s('polygon', { points: pts([[x1 + 0.5, y1 - 12], [x1 + 10, y1 - 9], [x1 + 0.5, y1 - 6]]), class: 'pennant' }));
    var cf = Math.min(done, len) / len;
    svg.appendChild(s('circle', { cx: x0 + (x1 - x0) * cf, cy: y0 + (y1 - y0) * cf - 6.5, r: 5.2, class: 'climber' }));
    return svg;
  }

  // ---------------------------------------------------------------- sommen en niveaus
  function fkey(a, t) { return a + 'x' + t; }
  function getFact(a, t) { return P().facts[fkey(a, t)] || null; }
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
  function rangeSvg(tables, port, decor) {
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
      var prog = decor ? 0 : tableProgress(t), done = decor ? false : tableDone(t);
      var ridge = ridgeFor(g), trail = trailFor(g);
      var grp = s('g', { transform: 'translate(' + (i * 100) + ' 0)' });
      grp.appendChild(s('polygon', { points: pts(ridge), class: 'mtn mtn' + (t % 3) }));
      var cap = snowCap(ridge, base - 0.72 * H);
      if (cap.length) grp.appendChild(s('polygon', { points: pts(cap), class: 'snow' }));
      if (!decor) grp.appendChild(s('polyline', { points: pts(trail), class: 'trail' }));
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
    for (i = 0; i < n && !decor; i++) {
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

  // ---------- gedeelde keuzelijsten
  function tableChooser(list, onChange) {
    var wrap = h('div', { class: 'table-chips' });
    function draw() {
      wrap.innerHTML = '';
      for (var t = 1; t <= 10; t++) {
        (function (tt) {
          var on = list.indexOf(tt) >= 0;
          wrap.appendChild(h('button', {
            class: 'tchip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'aria-label': 'Tafel van ' + tt,
            onclick: function () {
              var idx = list.indexOf(tt);
              if (idx >= 0) { if (list.length > 1) list.splice(idx, 1); }
              else { list.push(tt); list.sort(function (x, y) { return x - y; }); }
              if (onChange) onChange();
              draw();
            }
          }, String(tt)));
        })(t);
      }
    }
    draw();
    return wrap;
  }

  function colorChooser(get, set) {
    var wrap = h('div', { class: 'swatches' });
    function draw() {
      wrap.innerHTML = '';
      for (var i = 0; i < COLORS.length; i++) {
        (function (ci) {
          wrap.appendChild(h('button', {
            class: 'swatch' + (get() === ci ? ' on' : ''), style: 'background-color:' + COLORS[ci],
            'aria-label': 'Kleur ' + (ci + 1), 'aria-pressed': get() === ci ? 'true' : 'false',
            onclick: function () { set(ci); draw(); }
          }));
        })(i);
      }
    }
    draw();
    return wrap;
  }

  // ---------- startscherm
  screens.home = function () {
    current.back = null;
    var pr = P(), st = pr.settings, stats = pr.stats;
    var port = isPort();
    var peaks = h('div', { class: 'peaks' }, port
      ? [rangeRow([1, 2, 3, 4, 5], true), rangeRow([6, 7, 8, 9, 10], true)]
      : rangeRow([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false));
    var sun = s('svg', { viewBox: '0 0 40 40', class: 'sun', 'aria-hidden': 'true' }, s('circle', { cx: 20, cy: 20, r: 14 }));
    var label = st.tables.length === 1 ? 'de tafel van ' + st.tables[0] : 'tafels van ' + listNl(st.tables);
    var streak = currentStreak();

    var right = [];
    if (streak > 0) {
      right.push(h('div', { class: 'chip-days', 'aria-label': streak === 1 ? '1 dag geoefend' : streak + ' dagen op rij' }, [icon('sun'), h('span', null, String(streak))]));
    }
    right.push(starBadge(stats.stars));
    right.push(iconButton('gear', 'Instellingen', function () { go('settings'); }));

    root.appendChild(h('div', { class: 'screen home' }, [
      h('header', { class: 'bar home-bar' }, [
        h('button', { class: 'player-chip', 'aria-label': 'Andere speler kiezen', onclick: function () { go('who'); } }, [
          avatar(pr), h('span', { class: 'player-name' }, pr.name), icon('swap')
        ]),
        h('div', { class: 'bar-side bar-right' }, right)
      ]),
      h('div', { class: 'range' }, [
        sun,
        h('div', { class: 'hello' }, [
          h('h1', null, 'Dag ' + pr.name + '!'),
          levelCard(stats.stars, 'home-lvl'),
          h('p', { class: 'hello-hint' }, 'Tik op een berg om een tafel te bekijken.')
        ]),
        peaks
      ]),
      h('div', { class: 'home-actions' }, [
        h('button', { class: 'btn btn-sun btn-big btn-main', onclick: function () { go('practice', { tables: st.tables.slice(), from: 'home' }); } }, [
          h('span', { class: 'btn-title' }, 'Oefenen'),
          h('span', { class: 'btn-sub' }, label)
        ]),
        h('button', { class: 'btn btn-ice btn-big btn-tile', onclick: function () { go('sprint'); } }, [icon('hut'), h('span', { class: 'btn-title' }, 'Sprint')]),
        h('button', { class: 'btn btn-ice btn-big btn-tile', onclick: function () { go('medals'); } }, [icon('medal'), h('span', { class: 'btn-title' }, 'Medailles')]),
        h('button', { class: 'btn btn-ice btn-big btn-tile', onclick: function () { go('chart'); } }, [icon('grid'), h('span', { class: 'btn-title' }, 'Tafelkaart')])
      ])
    ]));
  };

  function decoRange() {
    var port = isPort();
    return h('div', { class: 'deco', 'aria-hidden': 'true' }, rangeSvg(port ? [3, 7, 1, 9, 5] : [1, 3, 6, 2, 9, 7, 4, 8, 10, 5], port, true));
  }

  // ---------- wie speelt er?
  screens.who = function () {
    current.back = S.current ? function () { go('home'); } : null;
    var cards = h('div', { class: 'who-cards' });
    for (var i = 0; i < S.order.length; i++) {
      (function (id) {
        var pr = S.profiles[id], L = levelInfo(pr.stats.stars);
        cards.appendChild(h('button', {
          class: 'who-card' + (id === S.current ? ' cur' : ''), 'aria-label': pr.name,
          onclick: function () { S.current = id; saveState(); go('home'); }
        }, [
          avatar(pr, 'big'),
          h('span', { class: 'who-name' }, pr.name),
          h('span', { class: 'who-lvl' }, L.title),
          h('span', { class: 'who-stars' }, [icon('star'), String(pr.stats.stars)])
        ]));
      })(S.order[i]);
    }
    cards.appendChild(h('button', { class: 'who-card who-new', onclick: function () { go('newPlayer'); } }, [
      h('span', { class: 'avatar big avatar-new' }, icon('plus')),
      h('span', { class: 'who-name' }, 'Nieuwe klimmer')
    ]));

    root.appendChild(h('div', { class: 'screen who' }, [
      topBar(current.back ? iconButton('back', 'Terug', current.back) : null,
        h('div', { class: 'brand' }, [icon('mountain'), h('span', { class: 'brand-name' }, 'Tafelberg')]), null),
      h('div', { class: 'who-main' }, [h('h1', null, 'Wie gaat er klimmen?'), cards]),
      decoRange()
    ]));
  };

  // ---------- nieuwe speler
  screens.newPlayer = function () {
    var first = !S.order.length;
    var name = '', color = S.order.length % COLORS.length, tables = [2, 5, 10];
    current.back = first ? null : function () { go('who'); };

    var preview = h('div', { class: 'np-preview' });
    var input = h('input', { type: 'text', class: 'name-input big', maxlength: '20', autocomplete: 'off', placeholder: 'Naam', 'aria-label': 'Naam' });
    var startBtn = h('button', { class: 'btn btn-sun np-start', onclick: create }, h('span', { class: 'btn-title' }, 'Start de klim'));

    function drawPreview() {
      preview.innerHTML = '';
      add(preview, avatar({ name: name || '?', color: color }, 'big'));
      startBtn.className = 'btn btn-sun np-start' + (name ? '' : ' off');
    }

    function create() {
      if (!name) { input.focus(); return; }
      var pr = makeProfile(name, color, tables);
      S.profiles[pr.id] = pr;
      S.order.push(pr.id);
      S.current = pr.id;
      saveState();
      go('home');
    }

    input.addEventListener('input', function () { name = input.value.replace(/^\s+|\s+$/g, ''); drawPreview(); }, false);
    input.addEventListener('keydown', function (e) { if ((e.keyCode || e.which) === 13) { input.blur(); create(); } }, false);
    drawPreview();

    root.appendChild(h('div', { class: 'screen newplayer' }, [
      topBar(current.back ? iconButton('back', 'Terug', current.back) : null, h('h1', null, first ? 'Welkom bij Tafelberg' : 'Nieuwe klimmer'), null),
      h('div', { class: 'np-main' }, [
        h('div', { class: 'np-card' }, [
          first ? h('p', { class: 'np-intro' }, 'Elke tafel is een berg. Wie de sommen vlot kent, klimt naar de top.') : null,
          h('div', { class: 'np-row' }, [
            preview,
            h('div', { class: 'np-field grow' }, [h('span', { class: 'set-label' }, 'Hoe heet de klimmer?'), input])
          ]),
          h('div', { class: 'np-field' }, [h('span', { class: 'set-label' }, 'Kies een kleur'), colorChooser(function () { return color; }, function (c) { color = c; drawPreview(); })]),
          h('div', { class: 'np-field' }, [
            h('span', { class: 'set-label' }, 'Met welke tafels begin je?'),
            h('span', { class: 'set-note' }, 'Kies de tafels die in de klas al aan bod kwamen. Dit kan later nog veranderen.'),
            tableChooser(tables, null)
          ]),
          startBtn
        ])
      ]),
      decoRange()
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
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'De tafel van ' + t), starBadge(P().stats.stars)),
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
    var t = p.t, dir = p.dir || 1, pr = P();
    var vals = [];
    for (var i = 0; i <= 10; i++) vals.push(i * t);
    if (dir < 0) vals.reverse();
    var pos = 1, typed = '', misses = 0, firstTry = true, finished = false;
    current.back = function () { go('table', { t: t }); };

    var stars = starBadge(pr.stats.stars);
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
      add(display, typed || '\u00a0');
    }

    function step() { return dir > 0 ? '+' : '−'; }

    function setMsg(lead, eqLine, isHint) {
      msg.className = 'ladder-msg' + (isHint ? ' hint' : '');
      msg.innerHTML = '';
      add(msg, h('span', { class: 'msg-lead' }, lead));
      if (eqLine) add(msg, h('span', { class: 'msg-eq' }, eqLine));
    }

    function drawStars() {
      var n = stars.getElementsByTagName('span');
      for (var q = 0; q < n.length; q++) if (n[q].className === 'stars-n') n[q].textContent = String(pr.stats.stars);
    }

    function onKey(key) {
      if (finished) return;
      if (key === 'del') { typed = typed.slice(0, -1); draw(); return; }
      if (key === 'ok') {
        if (!typed) return;
        var want = vals[pos], prev = vals[pos - 1];
        if (parseInt(typed, 10) === want) {
          if (firstTry) { addStars(1); drawStars(); }
          SND.ok();
          pos++; typed = ''; misses = 0; firstTry = true;
          if (pos > 10) {
            finished = true;
            if (dir > 0) pr.stats.ladderUp[t] = 1; else pr.stats.ladderDown[t] = 1;
            markDay();
            var got = awardBadges();
            saveState();
            SND.done();
            showEnd(got);
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
    function showEnd(got) {
      side.innerHTML = '';
      var title = dir > 0 ? 'Je bent boven!' : 'Weer beneden!';
      add(side, [
        h('div', { class: 'end-card' }, [
          icon('flag'),
          h('h2', null, title),
          h('p', null, dir > 0 ? 'Durf je nu achteruit naar beneden?' : 'Je kent de tafelrij van ' + t + ' in twee richtingen.'),
          newBadgesBlock(got),
          dir > 0
            ? h('button', { class: 'btn btn-sun', onclick: function () { go('ladder', { t: t, dir: -1 }); } }, h('span', { class: 'btn-title' }, 'Achteruit naar beneden'))
            : h('button', { class: 'btn btn-sun', onclick: function () { go('practice', { tables: [t], from: 'table' }); } }, h('span', { class: 'btn-title' }, 'Oefen de tafel van ' + t)),
          h('button', { class: 'btn btn-ice', onclick: current.back }, h('span', { class: 'btn-title' }, 'Klaar'))
        ])
      ]);
      if (got.length) confetti(root.firstChild);
    }

    setMsg(dir > 0 ? 'Je start onderaan bij 0. Welk getal komt op de volgende steen?' : 'Je start bovenaan bij ' + (10 * t) + '. Welk getal komt eronder?', null, false);
    add(side, [msg, display, keypad(onKey)]);
    keyHandler = onKey;
    draw();

    root.appendChild(h('div', { class: 'screen ladder' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Tafelrij van ' + t), stars),
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
      tables: tables.slice(), pool: pool, len: P().settings.len,
      i: 0, main: 0, queue: [], hist: [], count: {}, newBudget: 3,
      stars: 0, firstOk: 0, fast: 0, wrong: [], wrongSeen: {}, mastered: [], doneBefore: before,
      answered: 0, combo: 0, bestCombo: 0, bonus: 0, starsBefore: P().stats.stars, perfect: false, newBadges: []
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
      var f = P().facts[k];
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
      var r = Math.random(), div = P().settings.div;
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
    var k = fkey(q.a, q.t), f = P().facts[k], now = Date.now(), isNew = !f;
    if (!f) f = P().facts[k] = { b: 0, n: 0, c: 0, due: 0, last: 0 };
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
    var pr = P();
    var tables = p.tables && p.tables.length ? p.tables : pr.settings.tables;
    var se = newSession(tables);
    var q = null, typed = '', phase = 'ask', started = 0, assisted = false;
    current.back = function () {
      if (p.from === 'table' && tables.length === 1) go('table', { t: tables[0] });
      else go('home');
    };

    var climbWrap = h('div', { class: 'climb-wrap' });
    var combo = h('div', { class: 'combo', 'aria-live': 'polite' });
    var stars = starBadge(pr.stats.stars);
    var eq = h('div', { class: 'equation', 'aria-live': 'polite' });
    var fb = h('div', { class: 'feedback' });
    var helpBtn = h('button', { class: 'btn btn-ghost help-btn', onclick: showHelp }, 'Hulp');
    var helpRow = h('div', { class: 'help-row' }, helpBtn);

    function drawClimb() {
      climbWrap.innerHTML = '';
      add(climbWrap, climbBar(se.len, Math.min(se.answered, se.len), phase === 'ask' && !q.reask ? se.answered : -1));
    }

    function drawCombo() {
      combo.innerHTML = '';
      combo.className = 'combo' + (se.combo >= 2 ? ' on' : '');
      if (se.combo >= 2) add(combo, [icon('link'), h('span', null, String(se.combo))]);
    }

    function drawStars() {
      var n = stars.getElementsByTagName('span');
      for (var i = 0; i < n.length; i++) if (n[i].className === 'stars-n') n[i].textContent = String(pr.stats.stars);
    }

    function drawEq(reveal) {
      eq.innerHTML = '';
      for (var i = 0; i < q.parts.length; i++) {
        var part = q.parts[i];
        if (part === null) {
          var txt = reveal ? String(q.answer) : typed;
          eq.appendChild(h('span', { class: 'tok blank' + (txt ? ' filled' : '') + (phase === 'fix' ? ' fix' : '') }, txt || '\u00a0'));
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
      drawEq(false); drawClimb(); drawCombo();
      started = Date.now();
    }

    function finish() {
      var st = pr.stats;
      st.rounds++;
      markDay();
      se.perfect = !se.wrong.length && se.firstOk >= se.len;
      if (se.perfect) st.perfect++;
      if (se.bestCombo > st.bestCombo) st.bestCombo = se.bestCombo;
      if (se.fast > st.bestBolts) st.bestBolts = se.fast;
      se.newBadges = awardBadges();
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
      if (!q.reask) se.answered++;

      if (ok) {
        phase = 'wait';
        var bonus = false;
        if (!assisted) {
          se.combo++;
          if (se.combo > se.bestCombo) se.bestCombo = se.combo;
          addStars(1); se.stars++;
          if (se.combo % 5 === 0) { addStars(1); se.stars++; se.bonus++; bonus = true; }
        } else {
          se.combo = 0;
          pr.stats.helpOk++;
        }
        if (q.kind === 'div') pr.stats.divOk++;
        if (!q.reask && !assisted) se.firstOk++;
        if (res.fast && !q.reask) { se.fast++; if (res.isNew) se.newBudget++; }
        var nowMastered = res.before < MASTER && res.after >= MASTER;
        if (nowMastered) se.mastered.push(q);
        saveState();
        drawStars(); drawCombo(); drawClimb();
        drawEq(false);
        fb.className = 'feedback good';
        fb.innerHTML = '';
        var line = [h('span', { class: 'fb-praise' }, pick(PRAISE))];
        if (res.fast) line.push(icon('bolt'));
        add(fb, h('p', { class: 'fb-big' }, line));
        if (bonus) add(fb, h('p', { class: 'fb-bonus' }, [icon('link'), 'Reeks van ' + se.combo + '! Extra ster.']));
        if (nowMastered) add(fb, h('p', { class: 'fb-sub' }, 'Die zit erin!'));
        else if (assisted) add(fb, h('p', { class: 'fb-sub' }, 'Met hulp lukt het. Straks probeer je hem zonder.'));
        helpRow.style.display = 'none';
        if (bonus) SND.combo(); else if (res.fast) SND.fast(); else SND.ok();
        later(next, einkOn() ? (bonus ? 1500 : 1100) : (bonus ? 1250 : 850));
        return;
      }

      // fout: uitleg, zelf verbeteren, en later in deze ronde opnieuw
      phase = 'fix';
      se.combo = 0;
      saveState();
      drawCombo(); drawClimb();
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
      topBar(iconButton('close', 'Stoppen', current.back), climbWrap, [combo, stars]),
      h('div', { class: 'practice-main' }, [
        h('div', { class: 'qzone' }, [eq, fb, helpRow]),
        h('div', { class: 'padzone' }, keypad(onKey))
      ])
    ]));
    next();
  };

  // ---------- einde van een ronde
  screens.summary = function (p) {
    var se = p.se, pr = P();
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
    var L0 = levelInfo(se.starsBefore), L1 = levelInfo(pr.stats.stars), up = L1.n > L0.n;
    SND.done();

    var title = summits.length ? 'Op de top van de tafel van ' + listNl(summits) + '!' : (se.perfect ? 'Foutloos!' : 'Klaar!');
    var stats = h('div', { class: 'sum-stats' }, [
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, se.firstOk + ' van ' + se.len), h('span', { class: 'sum-l' }, 'meteen juist')]),
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, [icon('bolt'), String(se.fast)]), h('span', { class: 'sum-l' }, 'bliksemsnel')]),
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, [icon('link'), String(se.bestCombo)]), h('span', { class: 'sum-l' }, 'langste reeks')]),
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, [icon('star'), '+' + se.stars]), h('span', { class: 'sum-l' }, se.bonus ? 'sterren, ' + se.bonus + ' extra' : 'sterren')])
    ]);

    function chips(list) {
      var wrap = h('div', { class: 'chips' });
      for (var j = 0; j < list.length; j++) wrap.appendChild(h('span', { class: 'chip' }, eqText(list[j])));
      return wrap;
    }

    var blocks = [];
    var nb = newBadgesBlock(se.newBadges || []);
    if (nb) blocks.push(nb);
    if (se.mastered.length) blocks.push(h('div', { class: 'sum-block' }, [h('h2', null, 'Deze zitten erin'), chips(se.mastered)]));
    if (se.wrong.length) blocks.push(h('div', { class: 'sum-block' }, [h('h2', null, 'Hier oefenen we nog op'), chips(se.wrong)]));

    var screen = h('div', { class: 'screen summary' }, [
      topBar(iconButton('back', 'Terug', current.back), null, starBadge(pr.stats.stars)),
      h('div', { class: 'sum-main' }, [
        summits.length ? h('div', { class: 'sum-flag big' }, icon('flag')) : null,
        h('h1', null, title),
        stats,
        h('div', { class: 'sum-lvl-wrap' }, [
          up ? h('p', { class: 'sum-levelup' }, 'Nieuw niveau: ' + L1.title + '!') : null,
          levelCard(pr.stats.stars, 'sum-lvl')
        ]),
        h('div', { class: 'sum-blocks' }, blocks),
        h('div', { class: 'sum-actions' }, [
          h('button', { class: 'btn btn-sun', onclick: again }, h('span', { class: 'btn-title' }, 'Nog een ronde')),
          h('button', { class: 'btn btn-ice', onclick: function () { go('home'); } }, h('span', { class: 'btn-title' }, 'Naar de bergen'))
        ])
      ])
    ]);
    root.appendChild(screen);
    if (summits.length || up || (se.newBadges && se.newBadges.length) || se.perfect) confetti(screen);
  };

  // ---------- sprint naar de hut: één minuut, alleen sommen die al goed gaan
  // De hut staat op de plaats van het eigen record: wie de hut haalt, evenaart zijn record.
  function sprintArt(frac) {
    var svg = s('svg', { viewBox: '0 0 400 112', class: 'sprint-svg', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    var path = [[20, 94], [110, 84], [200, 68], [290, 56], [348, 46]];
    svg.appendChild(s('polygon', { points: pts([[0, 112], [0, 97]].concat(path).concat([[400, 40], [400, 112]])), class: 'sprint-hill' }));
    svg.appendChild(s('polyline', { points: pts(path), class: 'sprint-path' }));
    var hx = 356, hy = 44;
    svg.appendChild(s('rect', { x: hx, y: hy - 4, width: 30, height: 21, class: 'hut-wall' }));
    svg.appendChild(s('polygon', { points: pts([[hx - 5, hy - 3], [hx + 15, hy - 22], [hx + 35, hy - 3]]), class: 'hut-roof' }));
    svg.appendChild(s('rect', { x: hx + 11.5, y: hy + 5, width: 7, height: 12, class: 'hut-door' }));
    var at = partialPath(path, Math.max(0, Math.min(1, frac)));
    at = at[at.length - 1];
    svg.appendChild(s('circle', { cx: at[0], cy: at[1] - 9, r: 7.5, class: 'climber' }));
    return svg;
  }

  screens.sprint = function (p) {
    var pr = P(), stats = pr.stats;
    current.back = function () { go('home'); };

    function knownPool(tables) {
      var out = [];
      for (var i = 0; i < tables.length; i++) for (var a = 1; a <= 10; a++) if (box(a, tables[i]) >= 2) out.push({ a: a, t: tables[i] });
      return out;
    }
    var pool = knownPool(pr.settings.tables);
    if (pool.length < SPRINT_MIN) pool = knownPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    var stars = starBadge(stats.stars);
    var main = h('div', { class: 'sprint-main' });
    var screen = h('div', { class: 'screen sprint' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Sprint naar de hut'), stars),
      main
    ]);
    root.appendChild(screen);

    var phase = 'intro', count = 0, typed = '', q = null, last = [], endAt = 0;
    var fill, secs, art, eq, fb;

    function target() { return Math.max(10, stats.sprintBest); }

    function intro() {
      phase = 'intro';
      main.innerHTML = '';
      var locked = pool.length < SPRINT_MIN;
      add(main, h('div', { class: 'sprint-card' }, [
        h('div', { class: 'sprint-art' }, sprintArt(0)),
        h('h2', null, locked ? 'Nog even oefenen' : 'Eén minuut. Haal je de hut?'),
        h('p', null, locked
          ? 'De sprint gaat open zodra minstens ' + SPRINT_MIN + ' sommen bijna of helemaal in zitten. Nu zijn dat er ' + pool.length + '.'
          : 'Je krijgt alleen sommen die je al goed kent. Elke juiste som brengt je dichter bij de hut. De hut staat bij je record.'),
        locked ? null : h('p', { class: 'sprint-record' }, stats.sprintBest ? 'Jouw record: ' + stats.sprintBest + ' sommen' : 'Nog geen record. Zet er een neer!'),
        locked
          ? h('button', { class: 'btn btn-sun', onclick: function () { go('practice', { tables: pr.settings.tables.slice(), from: 'home' }); } }, h('span', { class: 'btn-title' }, 'Oefenen'))
          : h('button', { class: 'btn btn-sun btn-big sprint-go', onclick: run }, h('span', { class: 'btn-title' }, 'Start'))
      ]));
    }

    function nextQ() {
      var choice, tries = 0;
      do { choice = pick(pool); tries++; } while (tries < 20 && last.indexOf(fkey(choice.a, choice.t)) >= 0);
      last.push(fkey(choice.a, choice.t));
      if (last.length > Math.min(3, pool.length - 1)) last.shift();
      var swap = choice.a !== choice.t && Math.random() < 0.35;
      q = { a: choice.a, t: choice.t, kind: swap ? 'swap' : 'mul', product: choice.a * choice.t, answer: choice.a * choice.t };
      q.parts = swap ? [choice.t, TIMES, choice.a, '=', null] : [choice.a, TIMES, choice.t, '=', null];
      typed = '';
      drawEq();
    }

    function drawEq() {
      eq.innerHTML = '';
      for (var i = 0; i < q.parts.length; i++) {
        var part = q.parts[i];
        if (part === null) eq.appendChild(h('span', { class: 'tok blank' + (typed ? ' filled' : '') }, typed || '\u00a0'));
        else eq.appendChild(h('span', { class: 'tok ' + (typeof part === 'number' ? 'num' : 'op') }, String(part)));
      }
    }

    function drawArt() {
      art.innerHTML = '';
      add(art, [sprintArt(count / target()), h('span', { class: 'sprint-count' }, [String(count), h('small', null, count === 1 ? 'som' : 'sommen')])]);
    }

    function tick() {
      if (phase === 'end' || phase === 'intro') return;
      var left = Math.max(0, endAt - Date.now());
      fill.style.width = (left / SPRINT_MS * 100).toFixed(1) + '%';
      secs.textContent = Math.ceil(left / 1000) + ' s';
      if (left <= 0) { finishRun(); return; }
      later(tick, Math.min(einkOn() ? 5000 : 500, left));
    }

    function run() {
      phase = 'run'; count = 0; last = [];
      endAt = Date.now() + SPRINT_MS;
      main.innerHTML = '';
      fill = h('div', { class: 'sprint-fill' });
      secs = h('span', { class: 'sprint-secs' }, '60 s');
      art = h('div', { class: 'sprint-run-art' });
      eq = h('div', { class: 'equation' });
      fb = h('p', { class: 'sprint-fb' }, '\u00a0');
      add(main, h('div', { class: 'practice-main' }, [
        h('div', { class: 'qzone' }, [
          h('div', { class: 'sprint-timer' }, [h('div', { class: 'sprint-track' }, fill), secs]),
          art, eq, fb
        ]),
        h('div', { class: 'padzone' }, keypad(onKey))
      ]));
      keyHandler = onKey;
      drawArt();
      nextQ();
      tick();
    }

    function onKey(key) {
      if (phase !== 'run') return;
      if (key === 'del') { typed = typed.slice(0, -1); drawEq(); return; }
      if (key !== 'ok') { if (typed.length < 3) { typed += key; drawEq(); } return; }
      if (!typed) return;
      if (parseInt(typed, 10) === q.answer) {
        count++;
        SND.tick();
        fb.className = 'sprint-fb';
        fb.textContent = '\u00a0';
        drawArt();
        nextQ();
        return;
      }
      // Fout in de sprint: de som komt binnenkort terug bij gewoon oefenen.
      var f = P().facts[fkey(q.a, q.t)];
      if (f) { if (f.b >= 3) f.b--; f.due = Date.now(); }
      SND.oops();
      phase = 'pause';
      fb.className = 'sprint-fb show';
      fb.textContent = eqText(q);
      later(function () {
        if (phase !== 'pause') return;
        phase = 'run';
        fb.className = 'sprint-fb';
        fb.textContent = '\u00a0';
        nextQ();
      }, 1100);
    }

    function finishRun() {
      phase = 'end';
      keyHandler = null;
      var best = stats.sprintBest, rec = count > best;
      stats.sprints++;
      if (rec) stats.sprintBest = count;
      addStars(count);
      markDay();
      var got = awardBadges();
      saveState();
      SND.done();
      var n = stars.getElementsByTagName('span');
      for (var i = 0; i < n.length; i++) if (n[i].className === 'stars-n') n[i].textContent = String(stats.stars);
      main.innerHTML = '';
      add(main, h('div', { class: 'sprint-card' }, [
        h('div', { class: 'sprint-art' }, sprintArt(count / Math.max(10, best))),
        h('h2', null, 'De tijd is om!'),
        h('p', { class: 'sprint-score' }, count + (count === 1 ? ' som juist' : ' sommen juist')),
        h('p', { class: 'sprint-record' + (rec ? ' rec' : '') }, rec ? (best ? 'Nieuw record! Je vorige record was ' + best + '.' : 'Je eerste record!') : 'Jouw record blijft ' + best + '.'),
        h('p', { class: 'sprint-stars' }, [icon('star'), '+' + count]),
        newBadgesBlock(got),
        h('div', { class: 'sum-actions' }, [
          h('button', { class: 'btn btn-sun', onclick: function () { go('sprint', { now: true }); } }, h('span', { class: 'btn-title' }, 'Nog eens')),
          h('button', { class: 'btn btn-ice', onclick: function () { go('home'); } }, h('span', { class: 'btn-title' }, 'Naar de bergen'))
        ])
      ]));
      if (rec || got.length) confetti(screen);
    }

    if (p && p.now && pool.length >= SPRINT_MIN) run(); else intro();
  };

  // ---------- medailles en records
  screens.medals = function () {
    current.back = function () { go('home'); };
    var st = P().stats, grid = h('div', { class: 'medal-grid' });
    for (var i = 0; i < BADGES.length; i++) {
      var b = BADGES[i], won = !!st.badges[b.id];
      grid.appendChild(h('div', { class: 'medal-card' + (won ? ' won' : '') }, [
        medal(b, won), h('span', { class: 'mc-title' }, b.title), h('span', { class: 'mc-text' }, b.text)
      ]));
    }
    var recs = h('div', { class: 'records' }, [
      h('div', { class: 'record' }, [h('span', { class: 'rec-n' }, [icon('link'), String(st.bestCombo)]), h('span', { class: 'rec-l' }, 'langste reeks')]),
      h('div', { class: 'record' }, [h('span', { class: 'rec-n' }, [icon('hut'), String(st.sprintBest)]), h('span', { class: 'rec-l' }, 'sprintrecord')]),
      h('div', { class: 'record' }, [h('span', { class: 'rec-n' }, [icon('sun'), String(st.bestStreak)]), h('span', { class: 'rec-l' }, 'dagen na elkaar')]),
      h('div', { class: 'record' }, [h('span', { class: 'rec-n' }, [icon('flag'), String(summitsCount())]), h('span', { class: 'rec-l' }, 'toppen')])
    ]);
    root.appendChild(h('div', { class: 'screen medals' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Mijn medailles'), starBadge(st.stars)),
      recs,
      h('p', { class: 'chart-sum' }, badgeCount() + ' van de ' + BADGES.length + ' medailles verdiend'),
      h('div', { class: 'medal-wrap' }, grid)
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
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Mijn tafelkaart'), starBadge(P().stats.stars)),
      h('p', { class: 'chart-sum' }, n === 1 ? '1 van de 100 sommen zit erin.' : n + ' van de 100 sommen zitten erin.'),
      h('div', { class: 'chart-wrap' }, [h('p', { class: 'chart-axis' }, 'Elke rij is een tafel. Tik op een getal links om die tafel te openen.'), grid]),
      legend
    ]));
  };

  // ---------- instellingen: per speler en voor het toestel
  screens.settings = function () {
    current.back = function () { go('home'); };
    var pr = P(), st = pr.settings;

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

    function twoTap(label, confirmLabel, action) {
      var btn = h('button', { class: 'btn btn-line' }, label), armed = false;
      btn.addEventListener('click', function () {
        if (!armed) {
          armed = true;
          btn.innerHTML = '';
          add(btn, confirmLabel);
          btn.className = 'btn btn-line danger';
          return;
        }
        action();
      }, false);
      return btn;
    }

    var nameInput = h('input', { type: 'text', class: 'name-input', value: pr.name, maxlength: '20', autocomplete: 'off', 'aria-label': 'Naam' });
    var headName = h('span', null, pr.name);
    nameInput.addEventListener('input', function () {
      var v = nameInput.value.replace(/^\s+|\s+$/g, '');
      if (v) { pr.name = v; headName.textContent = v; saveState(); }
    }, false);

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

    var resetBtn = twoTap('Voortgang wissen', 'Zeker? Tik nog eens', function () {
      pr.facts = {};
      pr.stats = defaultStats();
      saveState();
      go('home');
    });
    var removeBtn = twoTap('Speler verwijderen', 'Zeker? Tik nog eens', function () {
      delete S.profiles[pr.id];
      S.order.splice(S.order.indexOf(pr.id), 1);
      S.current = S.order.length ? S.order[0] : null;
      saveState();
      go(S.order.length ? 'who' : 'newPlayer');
    });

    root.appendChild(h('div', { class: 'screen settings' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Instellingen'), null),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-col' }, [
          h('h2', { class: 'set-head' }, [avatar(pr), headName]),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, h('span', { class: 'set-label' }, 'Naam')), nameInput]),
          h('div', { class: 'set-block' }, [h('span', { class: 'set-label' }, 'Kleur'), colorChooser(function () { return pr.color; }, function (c) { pr.color = c; saveState(); })]),
          h('div', { class: 'set-block' }, [h('span', { class: 'set-label' }, 'Tafels bij Oefenen'), h('span', { class: 'set-note' }, 'Kies de tafels die in de klas al aan bod kwamen.'), tableChooser(st.tables, saveState)]),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, h('span', { class: 'set-label' }, 'Sommen per ronde')), lenWrap]),
          toggle('Deelsommen meeoefenen', 'Zoals 12 : 3. Pas als de maalsom al goed gaat.', function () { return !!st.div; }, function (v) { st.div = v; }),
          toggle('Geluid', null, function () { return !!st.sound; }, function (v) { st.sound = v; }),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, [h('span', { class: 'set-label' }, 'Opnieuw beginnen'), h('span', { class: 'set-note' }, 'Wist alle niveaus, sterren en medailles van ' + pr.name + '.')]), resetBtn]),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, [h('span', { class: 'set-label' }, 'Speler verwijderen'), h('span', { class: 'set-note' }, 'Haalt ' + pr.name + ' en alle voortgang weg.')]), removeBtn]),
          h('h2', { class: 'set-head' }, 'Dit toestel'),
          toggle('E-inkweergave', 'Zwart-wit en zonder beweging. Staat vanzelf aan op een Boox.', function () { return einkOn(); }, function (v) { S.device.eink = v; applyTheme(); }),
          h('div', { class: 'set-row' }, [
            h('div', { class: 'set-text' }, [h('span', { class: 'set-label' }, 'Spelers'), h('span', { class: 'set-note' }, S.order.length === 1 ? '1 speler op dit toestel.' : S.order.length + ' spelers op dit toestel.')]),
            h('button', { class: 'btn btn-line', onclick: function () { go('newPlayer'); } }, 'Speler toevoegen')
          ])
        ]),
        h('div', { class: 'set-col parents' }, [
          h('h2', null, 'Voor ouders'),
          h('p', null, 'Tafelberg volgt de opbouw uit de klas. Eerst begrijpen: elke som is een aantal groepjes, getoond als stippen in bakjes. Dan slim afleiden vanuit de steunpunttafels 1, 2, 5 en 10. Pas daarna komt het vlot onthouden.'),
          h('p', null, 'Elke som heeft een eigen niveau. Wie een som juist en vlot beantwoordt (binnen een vijftal seconden, typen inbegrepen), gaat een niveau hoger. Die som komt dan pas later terug: na een dag, daarna na twee, vier en negen dagen. Bij een fout zakt de som. Uw kind ziet meteen hoe het zit, typt de juiste uitkomst over en krijgt dezelfde som later in de ronde nog eens.'),
          h('p', null, 'Bij gewoon oefenen loopt er geen klok in beeld. Snelheid telt mee, maar wordt enkel beloond met een bliksem. Sterren komen er voor elk juist antwoord, met een extra ster per reeks van vijf. Zo telt nauwkeurig werken meer dan haast.'),
          h('p', null, 'De sprint is een vrijwillige uitdaging van één minuut met alleen sommen die al goed gaan. Het kind wedijvert er met zijn eigen record, niet met anderen. Een fout in de sprint stuurt de som terug naar het gewone oefenen.'),
          h('p', null, 'Elke dag een korte ronde werkt beter dan af en toe lang oefenen. Daarom telt Tafelberg de dagen op rij.'),
          h('p', { class: 'set-small' }, pr.name + ': ' + pr.stats.rounds + (pr.stats.rounds === 1 ? ' ronde' : ' rondes') + ' op ' + pr.stats.days + (pr.stats.days === 1 ? ' dag' : ' dagen') + ', ' + masteredTotal() + ' van de 100 sommen zitten erin.')
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
    if (!S.order.length) go('newPlayer');
    else if (S.order.length > 1) go('who');
    else go('home');
  }

  // Voor tests in een gewone browser.
  window.Tafelberg = {
    state: function () { return S; },
    profile: function () { return P(); },
    grade: function (q, ok, ms, assisted) { return grade(q, ok, ms, assisted); },
    makeQuestion: makeQuestion,
    newSession: newSession,
    pickNext: pickNext,
    strategy: strategy,
    levelInfo: levelInfo,
    award: awardBadges,
    go: go,
    save: saveState,
    reload: function () { S = loadState(); applyTheme(); go(S.order.length ? 'home' : 'newPlayer'); }
  };

  boot();
}());
