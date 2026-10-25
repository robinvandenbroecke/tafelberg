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
    { id: 'stars200', icon: 'star', title: 'Sterrenhemel', text: '200 sterren verzameld.', test: function (st) { return st.stars >= 200; } },
    { id: 'boltrun5', icon: 'bolt', title: 'Bliksemreeks', text: '5 keer na elkaar bliksemsnel.', test: function (st) { return st.bestBoltRun >= 5; } },
    { id: 'record5', icon: 'trophy', title: 'Recordjager', text: '5 keer je eigen record verbeterd.', test: function (st) { return st.records >= 5; } },
    { id: 'race1', icon: 'flag', title: 'Eerste race', text: 'Een tafelrace uitgereden.', test: function (st) { return st.races >= 1; } },
    { id: 'racegold', icon: 'trophy', title: 'Gouden race', text: 'Goud in een tafelrace.', test: function () { return raceGoldCount() >= 1; } },
    { id: 'goldtop', icon: 'bolt', title: 'Bliksemtop', text: 'Een hele tafel bliksemsnel.', test: function () { return goldCount() >= 1; } },
    { id: 'goal7', icon: 'sun', title: 'Doelwit', text: '7 keer je dagdoel gehaald.', test: function (st) { return st.goals >= 7; } }
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
      sprints: 0, sprintBest: 0, ladderUp: {}, ladderDown: {}, badges: {},
      lm: defaultLm(), hist: [],
      huts: 1, hutDays: [], played: [], today: null, goals: 0, chests: 0,
      records: 0, bestBoltRun: 0, races: 0, race: {}, gold: {}, mo: {}
    };
  }

  function defaultSettings() { return { tables: [2, 5, 10], len: 12, div: false, sound: true, vibrate: false, auto: true, pace: 'auto', tempo: true, goal: 'gewoon', voice: true }; }

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
    if (window.TBCloud) window.TBCloud.saved();
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

  var lastLayout = null;
  function isPort() { return (window.innerHeight || 0) >= (window.innerWidth || 0); }

  function fitRoot() {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var hh = window.innerHeight || document.documentElement.clientHeight;
    var phone = Math.min(w, hh) < 600;
    var base = phone ? Math.max(13, Math.min(18, Math.min(w, hh) / (w > hh ? 28 : 24))) : Math.max(11, Math.min(30, Math.min(w, hh) / 38));
    document.documentElement.style.fontSize = base.toFixed(2) + 'px';
    setHtmlClass('land', w > hh); setHtmlClass('port', w <= hh);
    setHtmlClass('phone', phone); setHtmlClass('tablet', !phone);
    var layout = [w, hh, phone].join(':');
    // Geen herstart van een ronde, aftelklok, invoerveld of feestje bij draaien.
    if (lastLayout !== null && layout !== lastLayout && current && /^(home|table|chart|medals|speed|who)$/.test(current.name)) {
      go(current.name, current.params);
    }
    lastLayout = layout;
  }

  // ---------------------------------------------------------------- geluid
  var audioCtx = null, mediaUnlocked = !!window.AndroidStore, clipAudio = null, browserVoice = null;
  function chooseVoice() {
    if (!window.speechSynthesis) return;
    var voices;
    try { voices = window.speechSynthesis.getVoices(); } catch (e) { return; }
    browserVoice = null;
    var wants = ['nl-be', 'nl-nl', 'nl'];
    for (var j = 0; j < wants.length && !browserVoice; j++) {
      for (var i = 0; i < voices.length; i++) {
        var lang = (voices[i].lang || '').toLowerCase().replace('_', '-');
        if (lang === wants[j] || (wants[j] === 'nl' && lang.indexOf('nl-') === 0)) { browserVoice = voices[i]; break; }
      }
    }
  }
  function hushPromise(value) { if (value && typeof value.then === 'function') value.then(function () {}, function () {}); }
  function unlockMedia() {
    mediaUnlocked = true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.resume) hushPromise(audioCtx.resume());
        var source = audioCtx.createBufferSource();
        source.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
        source.connect(audioCtx.destination); source.start(0);
      }
      if (!clipAudio && window.Audio) {
        clipAudio = new window.Audio();
        // Zelfde audio-element hergebruiken na ontgrendeling door een echte tik.
        clipAudio.src = 'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';
        hushPromise(clipAudio.play());
      }
    } catch (e) { /* geen geluid is geen spelprobleem */ }
    chooseVoice();
  }
  document.addEventListener('touchend', unlockMedia, true);
  document.addEventListener('click', unlockMedia, true);
  document.addEventListener('keydown', function () { if (!mediaUnlocked) unlockMedia(); }, false);
  if (window.speechSynthesis) {
    chooseVoice();
    if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', chooseVoice, false);
  }
  function vibrate(pattern) {
    if (S && S.current && P().settings.vibrate && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(pattern); } catch (e) { /* niet ondersteund */ }
    }
  }
  function play(notes, step) {
    var pr = S && S.current ? P() : null;
    if (!pr || !pr.settings.sound) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (!mediaUnlocked) return;
      if (audioCtx.resume) hushPromise(audioCtx.resume());
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
    ok: function () { vibrate(15); play([659, 880], 0.09); },
    fast: function () { vibrate(15); play([659, 880, 1175], 0.08); },
    combo: function () { vibrate(15); play([784, 988, 1175, 1568], 0.07); },
    oops: function () { vibrate([15, 60, 15]); play([392, 349], 0.14); },
    done: function () { play([523, 659, 784, 1047], 0.12); },
    tick: function () { vibrate(15); play([1047], 0.04); }
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
    } else if (name === 'trophy') {
      svg.appendChild(s('path', { d: 'M7 3.5h10v5.5a5 5 0 0 1-10 0z', class: 'fill' }));
      svg.appendChild(s('path', { d: 'M7 5.5H3.8a3.4 3.4 0 0 0 3.6 4.6M17 5.5h3.2a3.4 3.4 0 0 1-3.6 4.6', class: 'line thin' }));
      svg.appendChild(s('path', { d: 'M10.5 14h3v3.5h-3zM7.5 18h9v2.6h-9z', class: 'fill' }));
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

  // ---------------------------------------------------------------- Mo de marmot
  // De gids van Tafelberg. Stemmingen: blij, juich, denk, wauw, troost, zwaai.
  // Kleren komen vrij per klimniveau en zitten elk op een eigen plek (slot).
  var MO_ITEMS = [
    { id: 'muts', slot: 'head', level: 2, name: 'een muts' },
    { id: 'sjaal', slot: 'neck', level: 3, name: 'een sjaal' },
    { id: 'rugzak', slot: 'back', level: 4, name: 'een rugzak' },
    { id: 'bril', slot: 'eyes', level: 5, name: 'een skibril' },
    { id: 'helm', slot: 'head', level: 6, name: 'een klimhelm' },
    { id: 'vlag', slot: 'hand', level: 7, name: 'een vlag' },
    { id: 'medaille', slot: 'neck', level: 8, name: 'een medaille' },
    { id: 'ijsbijl', slot: 'hand', level: 9, name: 'een ijsbijl' },
    { id: 'kroon', slot: 'head', level: 10, name: 'een kroon' }
  ];

  function moItem(id) {
    for (var i = 0; i < MO_ITEMS.length; i++) if (MO_ITEMS[i].id === id) return MO_ITEMS[i];
    return null;
  }

  function moWear(pr) { return (pr || P()).stats.mo || {}; }

  function ell(cx, cy, rx, ry, cls, rot) {
    var a = { cx: cx, cy: cy, rx: rx, ry: ry, class: cls };
    if (rot) a.transform = 'rotate(' + rot + ' ' + cx + ' ' + cy + ')';
    return s('ellipse', a);
  }

  function moSvg(mood, wear, extra) {
    mood = mood || 'blij';
    wear = wear || {};
    var g = s('svg', { viewBox: '0 0 120 132', class: 'mo' + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' });
    var up = mood === 'juich', wave = mood === 'zwaai', chin = mood === 'denk';
    var paw = up ? [97, 34] : (wave ? [99, 36] : (chin ? [74, 63] : [90, 96]));

    // rugzak achter het lijf
    if (wear.back === 'rugzak') g.appendChild(s('rect', { x: 20, y: 62, width: 80, height: 46, rx: 14, class: 'it', fill: '#2D7A4D' }));

    // voeten en lijf
    g.appendChild(ell(45, 122, 12, 6.5, 'mo-fur mo-line'));
    g.appendChild(ell(75, 122, 12, 6.5, 'mo-fur mo-line'));
    g.appendChild(s('path', { d: 'M60 50 C86 50 97 77 95 99 C93 117 80 125 60 125 C40 125 27 117 25 99 C23 77 34 50 60 50 Z', class: 'mo-fur mo-line' }));
    g.appendChild(ell(60, 98, 20, 22, 'mo-light'));

    if (wear.back === 'rugzak') {
      g.appendChild(s('path', { d: 'M45 58 Q38 76 41 94', class: 'it-line', stroke: '#1E5A37' }));
      g.appendChild(s('path', { d: 'M75 58 Q82 76 79 94', class: 'it-line', stroke: '#1E5A37' }));
    }

    // armen
    if (up) {
      g.appendChild(ell(27, 48, 7, 15, 'mo-fur mo-line', -32));
    } else {
      g.appendChild(ell(33, 87, 7, 14, 'mo-fur mo-line', 18));
    }
    if (up || wave) g.appendChild(ell(93, 48, 7, 15, 'mo-fur mo-line', up ? 32 : 24));
    else if (chin) g.appendChild(ell(78, 74, 7, 13, 'mo-fur mo-line', -38));
    else g.appendChild(ell(87, 87, 7, 14, 'mo-fur mo-line', -18));

    // sjaal of medaille om de hals
    if (wear.neck === 'sjaal') {
      g.appendChild(s('path', { d: 'M35 59 Q60 72 85 59 L86 68 Q60 81 34 68 Z', class: 'it', fill: '#2F6FD0' }));
      g.appendChild(s('rect', { x: 68, y: 66, width: 10, height: 24, rx: 3, class: 'it', fill: '#2F6FD0', transform: 'rotate(-8 73 78)' }));
      g.appendChild(s('path', { d: 'M69 74h9M69 81h9', class: 'it-line thin', stroke: '#FFFFFF', transform: 'rotate(-8 73 78)' }));
    } else if (wear.neck === 'medaille') {
      g.appendChild(s('path', { d: 'M48 60 L60 80 L72 60', class: 'it-line', stroke: '#D33F49' }));
      g.appendChild(s('circle', { cx: 60, cy: 83, r: 8, class: 'it', fill: '#F2B705' }));
      g.appendChild(s('path', { d: 'M60 78.5l1.4 2.9 3.2.4-2.3 2.2.6 3.1-2.9-1.5-2.9 1.5.6-3.1-2.3-2.2 3.2-.4z', class: 'it-dark' }));
    }

    // oren en kop
    g.appendChild(s('circle', { cx: 36, cy: 21, r: 8.5, class: 'mo-fur mo-line' }));
    g.appendChild(s('circle', { cx: 84, cy: 21, r: 8.5, class: 'mo-fur mo-line' }));
    g.appendChild(s('circle', { cx: 36, cy: 21, r: 4, class: 'mo-dark soft' }));
    g.appendChild(s('circle', { cx: 84, cy: 21, r: 4, class: 'mo-dark soft' }));
    g.appendChild(ell(60, 40, 31, 27, 'mo-fur mo-line'));
    g.appendChild(ell(60, 51, 15.5, 11.5, 'mo-light'));
    g.appendChild(s('circle', { cx: 40, cy: 47, r: 5, class: 'mo-cheek' }));
    g.appendChild(s('circle', { cx: 80, cy: 47, r: 5, class: 'mo-cheek' }));

    // ogen
    if (up) {
      g.appendChild(s('path', { d: 'M44 36 Q49 29 54 36', class: 'mo-stroke' }));
      g.appendChild(s('path', { d: 'M66 36 Q71 29 76 36', class: 'mo-stroke' }));
    } else {
      var big = mood === 'wauw' ? 5.6 : 4.6, dx = chin ? 2 : 0, dy = chin ? -3 : 0;
      g.appendChild(s('circle', { cx: 49 + dx, cy: 34 + dy, r: big, class: 'mo-dark' }));
      g.appendChild(s('circle', { cx: 71 + dx, cy: 34 + dy, r: big, class: 'mo-dark' }));
      g.appendChild(s('circle', { cx: 50.6 + dx, cy: 32.2 + dy, r: 1.6, class: 'mo-white' }));
      g.appendChild(s('circle', { cx: 72.6 + dx, cy: 32.2 + dy, r: 1.6, class: 'mo-white' }));
      if (mood === 'troost') {
        g.appendChild(s('path', { d: 'M43 25 L53 23', class: 'mo-stroke thin' }));
        g.appendChild(s('path', { d: 'M77 25 L67 23', class: 'mo-stroke thin' }));
      }
    }

    // neus, mond en tanden
    g.appendChild(s('path', { d: 'M54 43 Q60 39 66 43 Q63 48.5 60 48.5 Q57 48.5 54 43 Z', class: 'mo-dark' }));
    if (up || mood === 'wauw') {
      g.appendChild(s('path', { d: mood === 'wauw' ? 'M55 52 Q60 50 65 52 Q66 61 60 62 Q54 61 55 52 Z' : 'M50 51 Q60 67 70 51 Z', class: 'mo-mouth' }));
      g.appendChild(s('rect', { x: 56.2, y: 51.2, width: 3.6, height: 5.4, rx: 1, class: 'mo-white mo-tooth' }));
      g.appendChild(s('rect', { x: 60.2, y: 51.2, width: 3.6, height: 5.4, rx: 1, class: 'mo-white mo-tooth' }));
    } else if (chin) {
      g.appendChild(s('circle', { cx: 63, cy: 55, r: 2.4, class: 'mo-dark' }));
    } else {
      g.appendChild(s('path', { d: 'M51 51 Q55.5 55.5 60 51.5 Q64.5 55.5 69 51', class: 'mo-stroke thin' }));
      g.appendChild(s('rect', { x: 56.2, y: 52.4, width: 3.6, height: 5.4, rx: 1, class: 'mo-white mo-tooth' }));
      g.appendChild(s('rect', { x: 60.2, y: 52.4, width: 3.6, height: 5.4, rx: 1, class: 'mo-white mo-tooth' }));
    }

    // op het hoofd
    if (wear.head === 'muts') {
      g.appendChild(s('path', { d: 'M32 29 Q33 4 60 4 Q87 4 88 29 Z', class: 'it', fill: '#D33F49' }));
      g.appendChild(s('rect', { x: 29, y: 23, width: 62, height: 10, rx: 5, class: 'it', fill: '#F4F1EC' }));
      g.appendChild(s('circle', { cx: 60, cy: 4, r: 6.5, class: 'it', fill: '#F4F1EC' }));
    } else if (wear.head === 'helm') {
      g.appendChild(s('path', { d: 'M30 30 Q30 5 60 5 Q90 5 90 30 Z', class: 'it', fill: '#E07B24' }));
      g.appendChild(s('path', { d: 'M46 8 Q60 3 74 8', class: 'it-line thin', stroke: '#FFFFFF' }));
      g.appendChild(s('rect', { x: 53, y: 12, width: 14, height: 8, rx: 3, class: 'it', fill: '#F7C83A' }));
    } else if (wear.head === 'kroon') {
      g.appendChild(s('path', { d: 'M40 18 L42 1 L51 10 L60 -1 L69 10 L78 1 L80 18 Z', class: 'it', fill: '#F2B705' }));
      g.appendChild(s('circle', { cx: 60, cy: 12, r: 2.6, class: 'it', fill: '#D33F49' }));
    }
    if (wear.eyes === 'bril') {
      var gy = wear.head ? 19 : 15;
      g.appendChild(s('rect', { x: 29, y: gy + 3, width: 62, height: 5, rx: 2.5, class: 'it-dark' }));
      g.appendChild(s('rect', { x: 38, y: gy - 3, width: 19, height: 13, rx: 6, class: 'it', fill: '#7FC4E8' }));
      g.appendChild(s('rect', { x: 63, y: gy - 3, width: 19, height: 13, rx: 6, class: 'it', fill: '#7FC4E8' }));
      g.appendChild(s('path', { d: 'M42 ' + (gy + 1) + ' l5 -2.5 M67 ' + (gy + 1) + ' l5 -2.5', class: 'it-line thin', stroke: '#FFFFFF' }));
    }

    // in de hand
    if (wear.hand === 'vlag') {
      g.appendChild(s('line', { x1: paw[0], y1: paw[1] + 6, x2: paw[0], y2: paw[1] - 30, class: 'it-line', stroke: '#5A3A22' }));
      g.appendChild(s('path', { d: 'M' + paw[0] + ' ' + (paw[1] - 30) + ' l20 6 l-20 7 z', class: 'it', fill: '#D33F49' }));
    } else if (wear.hand === 'ijsbijl') {
      g.appendChild(s('line', { x1: paw[0], y1: paw[1] + 10, x2: paw[0], y2: paw[1] - 24, class: 'it-line', stroke: '#5A3A22' }));
      g.appendChild(s('path', { d: 'M' + (paw[0] - 9) + ' ' + (paw[1] - 22) + ' q9 -6 18 -2 l-2 4 q-7 -2 -16 2 z', class: 'it', fill: '#A9B7C6' }));
    }
    if (wear.hand) g.appendChild(s('circle', { cx: paw[0], cy: paw[1], r: 6, class: 'mo-fur mo-line' }));
    return g;
  }

  // Voorlezen: Android-spraak via de schil, anders de browserstem, anders niets.
  function speak(text) {
    var pr = S && S.current ? P() : null;
    if (!pr || pr.settings.voice === false || !text) return;
    try {
      if (window.AndroidSpeech && typeof window.AndroidSpeech.speak === 'function') { window.AndroidSpeech.speak(text); return; }
      if (!mediaUnlocked) return;
      var clips = window.TB_CLIPS || {}, clip = clips[text];
      if (clip && typeof clip === 'object') clip = clip.file || clip.src;
      if (clip && clipAudio && /^voice\/[a-zA-Z0-9_./-]+\.(mp3|m4a|wav|ogg)$/.test(clip)) {
        clipAudio.src = clip; hushPromise(clipAudio.play()); return;
      }
      chooseVoice();
      if (browserVoice && window.speechSynthesis && window.SpeechSynthesisUtterance) {
        window.speechSynthesis.cancel();
        var u = new window.SpeechSynthesisUtterance(text);
        u.voice = browserVoice;
        u.lang = browserVoice.lang;
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      }
    } catch (e) { /* geen stem beschikbaar */ }
  }

  function stopSpeaking() {
    try {
      if (clipAudio) clipAudio.pause();
      if (window.AndroidSpeech && typeof window.AndroidSpeech.stop === 'function') window.AndroidSpeech.stop();
      else if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) { /* niets */ }
  }

  // Mo met een tekstballon. Tik op de ballon om het opnieuw te horen.
  function moSay(text, mood, opts) {
    opts = opts || {};
    var bubble = h('button', { class: 'bubble', 'aria-label': text, onclick: function () { speak(text); } }, text);
    var figure = h(opts.onMo ? 'button' : 'div', { class: 'mo-fig', 'aria-label': opts.onMo ? 'Mo' : null, onclick: opts.onMo || null }, moSvg(mood, opts.wear || moWear()));
    var box = h('div', { class: 'mo-say' + (opts.cls ? ' ' + opts.cls : '') }, opts.left ? [bubble, figure] : [figure, bubble]);
    if (opts.speak !== false) later(function () { speak(text); }, 250);
    return box;
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
    if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (k === 'esc') { if (current && current.back) current.back(); return; }
    if (keyHandler) { e.preventDefault(); keyHandler(k); }
  }, false);

  // ---------------------------------------------------------------- schermen
  var screens = {};

  function go(name, params) {
    clearTimers();
    stopSpeaking();
    keyHandler = null;
    current = { name: name, params: params || {}, back: null };
    root.innerHTML = '';
    screens[name](current.params);
    window.scrollTo(0, 0);
    if (window.TBWeb) window.TBWeb.screen(name, current.params, current.back);
    if (window.TBCloud) window.TBCloud.screen();
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
  // Rechtop worden de bergen lager gemaakt tot beide rijen op het scherm passen.
  var portVb = 178;

  function peakGeom(t, port) {
    var vbH = port ? portVb : 380, base = vbH - 34, maxH = base - 26;
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

    var off = {};
    for (i = 0; i < n; i++) {
      var t = tables[i], g = peakGeom(t, port), base = g.base, H = g.H;
      var prog = decor ? 0 : tableProgress(t), done = decor ? false : tableDone(t);
      var ridge = ridgeFor(g), trail = trailFor(g);
      // Tafels die nog niet aan de beurt zijn, liggen in de wolken.
      off[t] = !decor && P().settings.auto && P().settings.tables.indexOf(t) < 0 && prog === 0;
      var grp = s('g', { transform: 'translate(' + (i * 100) + ' 0)', class: off[t] ? 'peak-off' : null });
      grp.appendChild(s('polygon', { points: pts(ridge), class: 'mtn mtn' + (t % 3) }));
      var cap = snowCap(ridge, base - 0.72 * H);
      if (cap.length) grp.appendChild(s('polygon', { points: pts(cap), class: 'snow' }));
      if (!decor) grp.appendChild(s('polyline', { points: pts(trail), class: 'trail' }));
      if (prog > 0) grp.appendChild(s('polyline', { points: pts(partialPath(trail, prog)), class: 'trail-done' }));
      if (done) {
        var top = base - H, gold = !decor && !!P().stats.gold[t];
        grp.appendChild(s('line', { x1: 50, y1: top + 1, x2: 50, y2: top - 17, class: 'pole' }));
        grp.appendChild(s('polygon', { points: pts([[50.5, top - 17], [64, top - 12.5], [50.5, top - 8]]), class: 'pennant' + (gold ? ' gold' : '') }));
      }
      svg.appendChild(grp);
    }

    svg.appendChild(s('rect', { x: 0, y: g0.base, width: W, height: g0.vbH - g0.base + 2, class: 'meadow' }));
    svg.appendChild(s('line', { x1: 0, y1: g0.base, x2: W, y2: g0.base, class: 'ground' }));
    for (i = 0; i < n && !decor; i++) {
      var tt = tables[i], gg = peakGeom(tt, port), cx = i * 100 + 50;
      if (!tableDone(tt) && !off[tt]) {
        var tr = trailFor(gg), at = partialPath(tr, tableProgress(tt));
        at = at[at.length - 1];
        svg.appendChild(s('circle', { cx: at[0] + i * 100, cy: at[1], r: 4.6, class: 'climber' }));
      }
      var rm = P().stats.race[tt];
      svg.appendChild(s('circle', { cx: cx, cy: g0.base + 17, r: 13, class: 'badge' + (off[tt] ? ' badge-off' : '') + (rm && rm.medal ? ' ring m' + rm.medal : '') }));
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
  // ---------- startscherm
  function goalCard(pr) {
    var t = today(), goal = goalStars(pr), frac = Math.min(1, t.stars / goal), R = 17, C = 2 * Math.PI * R;
    var ring = s('svg', { viewBox: '0 0 44 44', class: 'goal-ring', 'aria-hidden': 'true' }, [
      s('circle', { cx: 22, cy: 22, r: R, class: 'gr-bg' }),
      s('circle', { cx: 22, cy: 22, r: R, class: 'gr-fg', 'stroke-dasharray': (C * frac).toFixed(1) + ' ' + C.toFixed(1), transform: 'rotate(-90 22 22)' })
    ]);
    var mid = h('span', { class: 'goal-mid' }, t.hit ? icon('trophy') : icon('star'));
    return h('div', { class: 'goal' + (t.hit ? ' hit' : '') }, [
      h('div', { class: 'goal-ringbox' }, [ring, mid]),
      h('div', { class: 'goal-body' }, [
        h('span', { class: 'goal-title' }, 'Dagdoel'),
        h('span', { class: 'goal-n' }, t.hit ? 'Gehaald!' : t.stars + ' van ' + goal + ' sterren')
      ])
    ]);
  }

  // Wat zegt Mo op het startscherm? Kort, en telkens iets wat het kind nu kan doen.
  function homeLine(pr) {
    var st = pr.stats, t = today(), goal = goalStars(pr), streak = currentStreak(), name = pr.name;
    if (!st.rounds && !st.sprints && !st.races) return { text: 'Hoi ' + name + '! Ik ben Mo. Samen klimmen we de tafelbergen op. Tik op Oefenen!', mood: 'zwaai' };
    if (!t.stars) {
      if (streak > 1) return { text: 'Hoi ' + name + '! Al ' + streak + ' dagen op rij. Maken we er ' + (streak + 1) + ' van?', mood: 'zwaai' };
      return { text: 'Hoi ' + name + '! Zin om te klimmen? Je dagdoel is ' + goal + ' sterren.', mood: 'zwaai' };
    }
    if (!t.hit) {
      var left = goal - t.stars;
      if (left <= 8) return { text: 'Nog maar ' + left + ' sterren en je dagdoel is binnen!', mood: 'juich' };
      return { text: 'Al ' + t.stars + ' sterren vandaag. Snelle antwoorden geven extra sterren!', mood: 'blij' };
    }
    for (var i = 0; i < pr.settings.tables.length; i++) {
      var tt = pr.settings.tables[i];
      if (raceable(tt) && !st.race[tt]) return { text: 'Dagdoel gehaald! Durf je de tafel van ' + tt + ' te racen?', mood: 'wauw' };
    }
    if (st.sprintBest) return { text: 'Dagdoel gehaald! Kan jij je sprintrecord van ' + st.sprintBest + ' breken?', mood: 'wauw' };
    return { text: 'Dagdoel gehaald! Knap gedaan. Tot morgen?', mood: 'juich' };
  }

  var lastHomeLine = '';

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
    var line = homeLine(pr);

    var right = [];
    right.push(h('button', { class: 'chip-days' + (streak ? '' : ' zero'), 'aria-label': streak === 1 ? '1 dag geoefend' : streak + ' dagen op rij', onclick: function () { go('week'); } }, [icon('sun'), h('span', null, String(streak))]));
    right.push(starBadge(stats.stars));
    right.push(iconButton('gear', 'Instellingen', function () { go('settings'); }));

    var say = moSay(line.text, line.mood, { cls: 'home-mo', left: !port, speak: line.text !== lastHomeLine, onMo: function () { go('kast'); } });
    lastHomeLine = line.text;
    var hello = h('div', { class: 'hello' }, [
      h('h1', null, 'Dag ' + pr.name + '!'),
      h('div', { class: 'hello-cards' }, [levelCard(stats.stars, 'home-lvl'), goalCard(pr)])
    ]);
    var rangeEl = h('div', { class: 'range' }, [sun, hello, say, peaks]);

    root.appendChild(h('div', { class: 'screen home' }, [
      h('header', { class: 'bar home-bar' }, [
        h('button', { class: 'player-chip', 'aria-label': 'Andere speler kiezen', onclick: function () { go('who'); } }, [
          avatar(pr), h('span', { class: 'player-name' }, pr.name), icon('swap')
        ]),
        h('div', { class: 'bar-side bar-right' }, right)
      ]),
      window.TBWeb ? h('div', { class: 'web-notices' }) : null,
      rangeEl,
      h('div', { class: 'home-actions' }, [
        h('button', { class: 'btn btn-sun btn-big btn-main', onclick: function () { go('practice', { tables: st.tables.slice(), from: 'home' }); } }, [
          h('span', { class: 'btn-title' }, 'Oefenen'),
          h('span', { class: 'btn-sub' }, label)
        ]),
        h('button', { class: 'btn btn-ice btn-big btn-tile btn-speed', onclick: function () { go('speed'); } }, [icon('bolt'), h('span', { class: 'btn-title' }, 'Snelheid')]),
        h('button', { class: 'btn btn-ice btn-big btn-tile', onclick: function () { go('medals'); } }, [icon('medal'), h('span', { class: 'btn-title' }, 'Medailles')]),
        h('button', { class: 'btn btn-ice btn-big btn-tile', onclick: function () { go('chart'); } }, [icon('grid'), h('span', { class: 'btn-title' }, 'Tafelkaart')])
      ])
    ]));
    if (port) {
      var avail = rangeEl.clientHeight - hello.offsetHeight - say.offsetHeight - 16;
      var want = Math.max(110, Math.min(178, Math.floor(avail / 2 * 500 / Math.max(1, rangeEl.clientWidth))));
      if (Math.abs(want - portVb) > 2) {
        portVb = want;
        peaks.innerHTML = '';
        add(peaks, [rangeRow([1, 2, 3, 4, 5], true), rangeRow([6, 7, 8, 9, 10], true)]);
      }
    }
  };

  // ---------- week: dagen op rij en schuilhutten
  screens.week = function () {
    current.back = function () { go('home'); };
    var st = P().stats, n = currentStreak();
    var text = n ? 'Al ' + n + (n === 1 ? ' dag' : ' dagen') + ' op rij! Elke dag een rondje houdt je reeks levend.' : 'Speel vandaag een rondje en je reeks begint!';
    root.appendChild(h('div', { class: 'screen celebrate cel-streak' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Mijn week'), starBadge(st.stars)),
      h('div', { class: 'cel-main' }, [
        moSay(text, n ? 'juich' : 'zwaai', { cls: 'cel-mo' }),
        h('div', { class: 'cel-body' }, [
          bigSun(n),
          h('h1', null, n === 1 ? '1 dag op rij' : n + ' dagen op rij'),
          weekRow(),
          h('p', { class: 'cel-note' }, [icon('hut'), st.huts === 1 ? 'Je hebt 1 schuilhut. Mis je een dag, dan bewaart die je reeks.' : 'Je hebt ' + st.huts + ' schuilhutten. Mis je een dag, dan bewaart er een je reeks.']),
          h('p', { class: 'cel-note small' }, 'Langste reeks ooit: ' + st.bestStreak + (st.bestStreak === 1 ? ' dag' : ' dagen') + '.')
        ])
      ])
    ]));
  };

  function decoRange() {
    var port = isPort();
    return h('div', { class: 'deco', 'aria-hidden': 'true' }, rangeSvg(port ? [3, 7, 1, 9, 5] : [1, 3, 6, 2, 9, 7, 4, 8, 10, 5], port, true));
  }

  screens.cloud = function (params) {
    current.back = function () { go(S.current ? 'settings' : 'newPlayer'); };
    window.TBCloud.render(root, params);
  };

  function cloudButton(label, params) {
    return window.TBCloud && window.TBCloud.configured() ? h('button', { class: 'btn btn-line', onclick: function () { go('cloud', params || {}); } }, label) : null;
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
      h('div', { class: 'who-main' }, [h('h1', null, 'Wie gaat er klimmen?'), cards, cloudButton('Online speler toevoegen', { mode: 'login' })]),
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
      topBar(current.back ? iconButton('back', 'Terug', current.back) : null, h('h1', null, first ? 'Welkom bij Tafelberg' : 'Nieuwe klimmer'), window.TBCloud && window.TBCloud.configured() ? h('button', { class: 'btn cloud-entry', 'aria-label': 'Online speler toevoegen', onclick: function () { go('cloud', { mode: 'login' }); } }, '☁') : null),
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
            h('span', { class: 'set-note' }, 'Kies de tafels die in de klas al aan bod kwamen. Daarna komen er vanzelf nieuwe bij, zodra deze goed zitten.'),
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
        h('button', { class: 'btn btn-ice', onclick: function () { go('ladder', { t: t, dir: 1 }); } }, [icon('stairs'), h('span', { class: 'btn-title' }, 'Tafelrij')]),
        h('button', { class: 'btn btn-ice', onclick: function () { go('race', { t: t, from: 'table' }); } }, [icon('bolt'), h('span', { class: 'btn-title' }, 'Race'), P().stats.race[t] ? h('span', { class: 'btn-time' }, fmtClock(P().stats.race[t].best)) : null]),
        h('button', { class: 'btn btn-sun', onclick: function () { go('practice', { tables: [t], from: 'table' }); } }, [h('span', { class: 'btn-title' }, 'Oefenen')])
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
      if (typed.length < 3) {
        typed += key;
        if (String(vals[pos]).indexOf(typed) !== 0) firstTry = false;
        draw();
        if (parseInt(typed, 10) === vals[pos]) onKey('ok');
      }
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
          pending.length
            ? endButtons(dir > 0 ? function () { go('ladder', { t: t, dir: -1 }); } : function () { go('practice', { tables: [t], from: 'table' }); },
              dir > 0 ? 'Achteruit naar beneden' : 'Oefen de tafel van ' + t, current.back, 'Klaar')
            : null,
          pending.length ? null : (dir > 0
            ? h('button', { class: 'btn btn-sun', onclick: function () { go('ladder', { t: t, dir: -1 }); } }, h('span', { class: 'btn-title' }, 'Achteruit naar beneden'))
            : h('button', { class: 'btn btn-sun', onclick: function () { go('practice', { tables: [t], from: 'table' }); } }, h('span', { class: 'btn-title' }, 'Oefen de tafel van ' + t))),
          pending.length ? null : h('button', { class: 'btn btn-ice', onclick: current.back }, h('span', { class: 'btn-title' }, 'Klaar'))
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
  //
  // Twee lagen passen zich aan:
  //  1. Per som: een niveau (0 tot 5) met een tempo-eis per niveau. De denktijd is de tijd
  //     tot de eerste toets, zodat traag typen niet meetelt. Naar niveau 2 binnen 6 s,
  //     naar 3 binnen 4,5 s, naar 4 en 5 binnen 3 s: dan is de som paraat.
  //  2. Per kind: een leertempo (rustig, gewoon, snel) uit juistheid en denktijd.
  //     Dat bepaalt hoeveel nieuwe sommen per ronde, hoeveel steun, hoe snel herhaald wordt,
  //     wanneer wisselsommen en ontbrekende getallen komen en wanneer een nieuwe tafel opengaat.

  // Volgorde voor nieuwe tafels: eerst de steunpunten, dan wat ervan afgeleid wordt.
  var ORDER = [2, 10, 5, 1, 4, 3, 6, 8, 9, 7];

  var PACE = {
    // days: na hoeveel dagen een som op elk niveau terugkomt.
    // unlockBox/unlock: welk deel van de sommen minstens dat niveau moet hebben voor een nieuwe tafel.
    1: { key: 'rustig', label: 'Rustig', newStart: 1, newMax: 3, weakWin: 1, days: [0, 0, 1, 1, 2, 5], newFastBox: 1, intro: true, swapFrom: 3, missFrom: 4, unlockBox: 3, unlock: 0.9 },
    2: { key: 'gewoon', label: 'Gewoon', newStart: 2, newMax: 6, weakWin: 2, days: [0, 0, 1, 2, 4, 9], newFastBox: 2, intro: false, swapFrom: 2, missFrom: 3, unlockBox: 3, unlock: 0.75 },
    3: { key: 'snel', label: 'Snel', newStart: 4, newMax: 12, weakWin: 2, days: [0, 0, 1, 3, 6, 14], newFastBox: 2, intro: false, swapFrom: 2, missFrom: 2, unlockBox: 2, unlock: 0.8 }
  };

  function defaultLm() { return { n: 0, acc: 0.8, think: 4000 }; }

  // Leertempo: automatisch uit de prestaties, of vast gekozen door een ouder.
  function paceLevel(pr) {
    pr = pr || P();
    var fixed = { rustig: 1, gewoon: 2, snel: 3 }[pr.settings.pace];
    if (fixed) return fixed;
    var lm = pr.stats.lm;
    return lm && lm.n >= 15 && lm.pace ? lm.pace : 2;
  }

  // Na elke ronde bijgesteld, met een marge zodat het tempo niet elke dag heen en weer springt.
  //   snel:   minstens 90% meteen juist en gekende sommen binnen 2,3 s
  //   rustig: minder dan 72% meteen juist of gekende sommen trager dan 4,8 s
  function updatePace() {
    var lm = P().stats.lm, cur = lm.pace || 2;
    if (lm.n < 15) { lm.pace = 2; return; }
    if (cur === 2) {
      if (lm.acc >= 0.9 && lm.think <= 2300) cur = 3;
      else if (lm.acc < 0.72 || lm.think > 4800) cur = 1;
    } else if (cur === 3) {
      if (lm.acc < 0.85 || lm.think > 2800) cur = 2;
    } else if (lm.acc >= 0.8 && lm.think <= 4000) {
      cur = 2;
    }
    lm.pace = cur;
  }

  function pace() { return PACE[paceLevel()]; }

  // Denktijd die nodig is om een som naar een bepaald niveau te brengen.
  function speedLimit(q, toBox) {
    var ms = toBox <= 1 ? 1e9 : (toBox === 2 ? 6000 : (toBox === 3 ? 4500 : 3000));
    if (q.kind === 'miss' || q.kind === 'div') ms += 1500;
    if (einkOn()) ms += 700;
    return ms;
  }

  function boltLimit(q) { return speedLimit(q, 4); }

  // correct: 1 = meteen juist, 0.5 = zelf verbeterd, 0 = fout.
  function lmUpdate(correct, think, wasKnown) {
    var lm = P().stats.lm, v = correct === true ? 1 : (correct ? correct : 0);
    lm.n++;
    lm.acc = lm.acc * 0.9 + v * 0.1;
    if (v === 1 && wasKnown) lm.think = lm.think * 0.9 + Math.min(think, 12000) * 0.1;
  }

  function newSession(tables) {
    var pool = [];
    for (var i = 0; i < tables.length; i++) for (var a = 1; a <= 10; a++) pool.push({ a: a, t: tables[i] });
    var before = {};
    for (var j = 0; j < tables.length; j++) before[tables[j]] = tableDone(tables[j]);
    var pc = pace();
    return {
      tables: tables.slice(), pool: pool, len: P().settings.len, pace: paceLevel(),
      i: 0, main: 0, queue: [], hist: [], count: {}, newBudget: pc.newStart, newMax: pc.newMax, newCount: 0,
      errRun: 0, calm: false, fastRun: 0,
      stars: 0, firstOk: 0, fast: 0, wrong: [], wrongSeen: {}, mastered: [], doneBefore: before,
      answered: 0, combo: 0, bestCombo: 0, bonus: 0, starsBefore: P().stats.stars, perfect: false, newBadges: [],
      thinks: [], slow: [], slowSeen: {}, unlocked: null,
      boltRun: 0, bestBoltRun: 0, boltStars: 0, records: [], moSaid: {}
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

  // Sommen die al gekend zijn maar nog traag gaan: daar zit de tempo-oefening.
  function pickSlow(list) {
    list.sort(function (x, y) {
      var fx = getFact(x.a, x.t), fy = getFact(y.a, y.t);
      return (fy.rt || 0) - (fx.rt || 0);
    });
    return list[Math.floor(Math.random() * Math.min(2, list.length))];
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
    var now = Date.now(), learn = [], due = [], fresh = [], known = [], slow = [];
    var pc = PACE[se.pace];
    for (var j = 0; j < se.pool.length; j++) {
      var p = se.pool[j], k = fkey(p.a, p.t);
      if (askedWithin(se, k, win) || queued(se, k)) continue;
      if (!lastResort && (se.count[k] || 0) >= 3) continue;
      var f = P().facts[k];
      if (!f) fresh.push(p);
      else if (f.b < 2) learn.push(p);
      else if (now >= f.due) due.push(p);
      else if (f.b < 5 && f.rt && f.rt > speedLimit({ kind: 'mul' }, f.b + 1)) slow.push(p);
      else known.push(p);
    }
    var solid = due.length ? due : (known.length ? known : slow);
    var canNew = fresh.length && se.newBudget > 0 && se.newCount < se.newMax && !se.calm;
    if (weakRecent(se) >= pc.weakWin && solid.length) return pickOld(solid);
    if (learn.length) return pickOld(learn);
    if (due.length && (Math.random() < 0.6 || !canNew)) return pickOld(due);
    if (canNew) { se.newBudget--; se.newCount++; return introNext(fresh); }
    if (slow.length && (Math.random() < 0.7 || !known.length)) return pickSlow(slow);
    if (known.length) return pickOld(known);
    if (slow.length) return pickSlow(slow);
    if (lastResort && fresh.length) { se.newCount++; return introNext(fresh); }
    return null;
  }

  function makeQuestion(a, t, reask) {
    var f = getFact(a, t), b = f ? f.b : -1, kind = 'mul', pc = pace();
    if (!reask && b >= pc.swapFrom) {
      var r = Math.random(), div = P().settings.div, canMiss = b >= pc.missFrom;
      if (div && canMiss && r < 0.25) kind = 'div';
      else if (canMiss && r < (div ? 0.4 : 0.2)) kind = 'miss';
      else if (a !== t && r < (div ? 0.6 : 0.45)) kind = 'swap';
    }
    var p = a * t, q = { a: a, t: t, kind: kind, product: p, x: a, y: t, reask: !!reask, tries: 0 };
    if (kind === 'mul') { q.parts = [a, TIMES, t, '=', null]; q.answer = p; }
    else if (kind === 'swap') { q.parts = [t, TIMES, a, '=', null]; q.answer = p; q.x = t; q.y = a; }
    else if (kind === 'miss') { q.parts = [null, TIMES, t, '=', p]; q.answer = a; }
    else { q.parts = [p, ':', t, '=', null]; q.answer = a; }
    return q;
  }

  function fromQueue(se, idx) {
    var r = se.queue.splice(idx, 1)[0];
    var q = makeQuestion(r.a, r.t, true);
    q.tries = r.tries;
    return q;
  }

  function pickNext(se) {
    for (var i = 0; i < se.queue.length; i++) if (se.queue[i].at <= se.i) return fromQueue(se, i);
    if (se.main >= se.len) {
      if (!se.queue.length) return null;
      se.queue.sort(function (x, y) { return x.at - y.at; });
      return fromQueue(se, 0);
    }
    var p = choose(se, 2, false) || choose(se, 1, false) || choose(se, 1, true) || choose(se, 0, true);
    if (!p) return se.queue.length ? fromQueue(se, 0) : null;
    var q = makeQuestion(p.a, p.t, false);
    // Bij een rustig leertempo wordt een nieuwe som eerst getoond en pas daarna gevraagd.
    if (!getFact(p.a, p.t) && PACE[se.pace].intro) q.intro = true;
    return q;
  }

  // Het hart van de herhaling: hoe verandert het niveau van een som na een antwoord?
  // think = denktijd tot de eerste toets.
  // corrected = het kind typte eerst iets fouts en verbeterde zelf: juist, maar geen stijging.
  function grade(q, ok, think, assisted, corrected) {
    var k = fkey(q.a, q.t), f = P().facts[k], now = Date.now(), isNew = !f, pc = pace();
    if (!f) f = P().facts[k] = { b: 0, n: 0, c: 0, due: 0, last: 0, rt: 0 };
    var before = isNew ? -1 : f.b;
    var clean = ok && !assisted && !corrected;
    var fast = clean && think <= speedLimit(q, Math.max(2, Math.min(5, f.b + 1)));
    var bolt = clean && think <= boltLimit(q);
    var prevBest = f.best || 0;
    var record = clean && !q.reask && prevBest > 0 && think <= prevBest - 300 && think <= 6000;
    f.n++;
    if (clean) {
      f.rt = f.rt ? Math.round(0.6 * f.rt + 0.4 * think) : think;
      if (!f.best || think < f.best) f.best = think;
    }
    if (q.reask) {
      if (ok && !assisted) f.b = Math.max(f.b, 1);
    } else if (ok && !assisted && corrected) {
      if (f.b < 1) f.b = 1;
    } else if (clean) {
      f.c++;
      if (isNew) {
        f.b = think <= speedLimit(q, 2) ? pc.newFastBox : 1;
      } else if (f.b < 2) {
        f.b = think <= speedLimit(q, f.b + 1) ? f.b + 1 : Math.max(f.b, 1);
      } else if (now >= f.due) {
        if (think <= speedLimit(q, f.b + 1)) f.b = Math.min(5, f.b + 1);
        else if (think > speedLimit(q, f.b) + 2500) f.b--;
      } else if (f.b >= 3 && think > speedLimit(q, f.b) + 2500) {
        f.b--;
      }
    } else if (ok && assisted) {
      f.b = Math.min(f.b, 1);
    } else {
      f.b = f.b >= 3 ? 1 : 0;
    }
    // Een paar uur speling, zodat een som die 'morgen' terugkomt ook bij een vroegere ronde klaarstaat.
    f.due = pc.days[f.b] ? now + pc.days[f.b] * DAY - 4 * HOUR : now;
    f.last = now;
    return { fast: fast, bolt: bolt, before: before, after: f.b, isNew: isNew, think: think, record: record, prevBest: prevBest };
  }

  // Na een ronde: gaat er een nieuwe berg open? Enkel als de tafels vanzelf uitbreiden.
  function maybeUnlock() {
    var st = P().settings;
    if (!st.auto) return null;
    var total = 0, good = 0;
    for (var i = 0; i < st.tables.length; i++) {
      for (var a = 1; a <= 10; a++) { total++; if (box(a, st.tables[i]) >= pace().unlockBox) good++; }
    }
    if (!total || good / total < pace().unlock) return null;
    for (var j = 0; j < ORDER.length; j++) {
      if (st.tables.indexOf(ORDER[j]) < 0) {
        st.tables.push(ORDER[j]);
        st.tables.sort(function (x, y) { return x - y; });
        return ORDER[j];
      }
    }
    return null;
  }

  function fmtSec(ms) { return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',') + ' s'; }

  function median(list) {
    if (!list.length) return 0;
    var c = list.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(c.length / 2);
    return c.length % 2 ? c[m] : (c[m - 1] + c[m]) / 2;
  }

  screens.practice = function (p) {
    var pr = P();
    var unlockedNow = p.from === 'home' ? maybeUnlock() : null;
    var tables = p.from === 'home' ? pr.settings.tables.slice() : (p.tables && p.tables.length ? p.tables : pr.settings.tables);
    var se = newSession(tables);
    se.unlocked = unlockedNow;
    var q = null, typed = '', phase = 'ask', started = 0, assisted = false, firstKey = 0, tempoMs = 0, corrected = false;
    current.back = function () {
      if (p.from === 'table' && tables.length === 1) go('table', { t: tables[0] });
      else go('home');
    };

    // Bliksembalk: loopt leeg in de tijd die nodig is om de som een niveau hoger te krijgen.
    // Alleen bij sommen die al begrepen zijn; bij nieuwe sommen telt eerst het inzicht.
    var tempoFill = h('div', { class: 'tempo-fill' });
    var tempo = h('div', { class: 'tempo', 'aria-hidden': 'true' }, [icon('bolt'), h('div', { class: 'tempo-track' }, tempoFill)]);

    function setTransition(el, v) { el.style.webkitTransition = v; el.style.transition = v; }

    function startTempo() {
      var b = box(q.a, q.t);
      tempoMs = 0;
      tempo.className = 'tempo';
      if (pr.settings.tempo === false || q.reask || q.intro || b < 2) return;
      tempoMs = speedLimit(q, Math.min(5, b + 1));
      tempo.className = 'tempo on';
      setTransition(tempoFill, 'none');
      tempoFill.style.width = '100%';
      var still = einkOn();
      try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) still = true; } catch (e) { still = true; }
      if (still) {
        // E-ink en minder beweging: de balk krimpt per seconde in plaats van vloeiend.
        var mine = q;
        var stepDown = function () {
          if (!tempoMs || q !== mine) return;
          var left = Math.max(0, 1 - (Date.now() - started) / tempoMs);
          tempoFill.style.width = (left * 100).toFixed(0) + '%';
          if (left > 0) later(stepDown, 1000);
        };
        later(stepDown, 1000);
        return;
      }
      tempoFill.getBoundingClientRect();
      setTransition(tempoFill, 'width ' + tempoMs + 'ms linear');
      tempoFill.style.width = '0%';
    }

    function stopTempo() {
      if (!tempoMs) return;
      var left = Math.max(0, 1 - (Date.now() - started) / tempoMs);
      setTransition(tempoFill, 'none');
      tempoFill.style.width = (left * 100).toFixed(1) + '%';
      tempo.className = 'tempo on ' + (left > 0 ? 'hit' : 'late');
      tempoMs = 0;
    }

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
      if (se.boltRun >= 3) {
        combo.className = 'combo on boltrun';
        add(combo, [icon('bolt'), h('span', null, String(se.boltRun)), h('small', null, '×2')]);
        return;
      }
      combo.className = 'combo' + (se.combo >= 2 ? ' on' : '');
      if (se.combo >= 2) add(combo, [icon('link'), h('span', null, String(se.combo))]);
    }

    // Mo zegt af en toe iets tijdens een ronde, telkens maar één keer per soort.
    function moLine(kind, text, mood) {
      if (se.moSaid[kind]) return null;
      se.moSaid[kind] = true;
      return moSay(text, mood, { cls: 'fb-mo' });
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
      typed = ''; phase = q.intro ? 'intro' : 'ask'; assisted = false; firstKey = 0; corrected = false;
      fb.innerHTML = ''; fb.className = 'feedback';
      helpRow.style.display = '';
      if (q.intro) showIntro();
      drawEq(!!q.intro); drawClimb(); drawCombo();
      started = Date.now();
      startTempo();
    }

    // Nieuwe som bij een rustig leertempo: eerst tonen, twee vragen later zelf beantwoorden.
    function showIntro() {
      helpRow.style.display = 'none';
      fb.className = 'feedback fix intro';
      fb.innerHTML = '';
      var why = (q.x === 1 || q.y === 1) ? groupsText(q.x, q.y) + (q.x === 1 ? ' is ' : ' zijn samen ') + q.product + '.' : strategy(q.x, q.y, false);
      add(fb, [
        h('p', { class: 'fb-title' }, [h('span', { class: 'fb-lead' }, 'Nieuwe som. Kijk goed:'), h('span', { class: 'fb-eq' }, eqText(q))]),
        h('div', { class: 'fb-model' }, dotModel(q.x, q.y)),
        h('p', { class: 'fb-tip' }, why),
        h('button', { class: 'btn btn-sun intro-go', onclick: endIntro }, h('span', { class: 'btn-title' }, 'Ik heb het gezien'))
      ]);
    }

    function endIntro() {
      if (phase !== 'intro') return;
      phase = 'wait';
      se.queue.push({ a: q.a, t: q.t, at: se.i + 2, tries: 0 });
      se.hist.push({ k: fkey(q.a, q.t), weak: true });
      se.answered++;
      next();
    }

    function finish() {
      var st = pr.stats;
      st.rounds++;
      markDay();
      se.perfect = !se.wrong.length && se.firstOk >= se.len;
      if (se.perfect) st.perfect++;
      if (se.bestCombo > st.bestCombo) st.bestCombo = se.bestCombo;
      if (se.fast > st.bestBolts) st.bestBolts = se.fast;
      st.hist.push({ d: todayStr(), acc: Math.round(se.firstOk / se.len * 100) / 100, think: Math.round(median(se.thinks)), pace: se.pace });
      if (st.hist.length > 40) st.hist.shift();
      updatePace();
      se.unlocked = se.unlocked || maybeUnlock();
      if (se.bestBoltRun > st.bestBoltRun) st.bestBoltRun = se.bestBoltRun;
      checkGold(se.tables);
      se.newBadges = awardBadges();
      saveState();
      go('summary', { se: se, from: p.from });
    }

    function onKey(key) {
      if (phase === 'wait') return;
      if (phase === 'intro') { if (key === 'ok') endIntro(); return; }
      if (key === 'del') { typed = typed.slice(0, -1); drawEq(false); return; }
      if (key !== 'ok') {
        if (typed.length < 3) {
          typed += key;
          if (phase === 'ask' && !firstKey) { firstKey = Date.now(); stopTempo(); }
          // Een getypt cijfer dat niet bij de juiste uitkomst past: zelf verbeteren mag,
          // maar dan telt de som niet als meteen juist en stijgt ze niet.
          if (phase === 'ask' && String(q.answer).indexOf(typed) !== 0) corrected = true;
          drawEq(false);
          // Juiste uitkomst getypt: meteen verder, zonder OK.
          if (parseInt(typed, 10) === q.answer) onKey('ok');
        }
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

      var think = (firstKey || Date.now()) - started;
      stopTempo();
      var res = grade(q, ok, think, assisted, corrected);
      if (!q.reask) lmUpdate(ok && !assisted ? (corrected ? 0.5 : 1) : 0, think, res.before >= 2);
      var k = fkey(q.a, q.t);
      se.count[k] = (se.count[k] || 0) + 1;
      se.hist.push({ k: k, weak: !ok || assisted || corrected || (res.isNew && !res.fast) });
      if (!q.reask) se.answered++;

      if (ok) {
        phase = 'wait';
        var bonus = false, gain = 0, boltGain = 0;
        if (!assisted) {
          se.combo++;
          if (se.combo > se.bestCombo) se.bestCombo = se.combo;
          gain = 1;
          if (se.combo % 5 === 0) { gain++; se.bonus++; bonus = true; }
        } else {
          se.combo = 0;
          pr.stats.helpOk++;
        }
        // Snelheid loont: een extra ster per bliksemantwoord, twee tijdens een bliksemreeks.
        if (!assisted && !corrected && !q.reask && res.bolt) {
          se.boltRun++;
          if (se.boltRun > se.bestBoltRun) se.bestBoltRun = se.boltRun;
          boltGain = se.boltRun >= 3 ? 2 : 1;
          gain += boltGain;
          se.boltStars += boltGain;
        } else if (!q.reask) {
          se.boltRun = 0;
        }
        if (res.record) { se.records.push({ q: q, ms: think, was: res.prevBest }); pr.stats.records++; gain++; }
        if (gain) { addStars(gain); se.stars += gain; }
        if (q.kind === 'div') pr.stats.divOk++;
        if (!q.reask && !assisted && !corrected) se.firstOk++;
        if (!q.reask) {
          if (res.bolt) se.fast++;
          if (!assisted) { if (!corrected) se.thinks.push(think); se.errRun = 0; }
          // Tempo binnen de ronde: wie nieuwe sommen meteen vlot kent, krijgt er sneller nieuwe bij.
          if (res.isNew && res.fast && !se.calm) se.newBudget++;
          if (res.fast) {
            se.fastRun++;
            if (se.fastRun >= 6 && !se.calm) { se.newBudget += 2; se.fastRun = 0; }
          } else se.fastRun = 0;
          if (!assisted && !corrected && res.before >= 2 && think > speedLimit(q, 3) && !se.slowSeen[k]) { se.slowSeen[k] = true; se.slow.push(q); }
        }
        var nowMastered = res.before < MASTER && res.after >= MASTER;
        if (nowMastered) se.mastered.push(q);
        saveState();
        drawStars(); drawCombo(); drawClimb();
        drawEq(false);
        fb.className = 'feedback good';
        fb.innerHTML = '';
        var line = [h('span', { class: 'fb-praise' }, res.bolt && se.boltRun >= 3 ? 'Bliksem!' : pick(PRAISE))];
        if (res.bolt) line.push(icon('bolt'));
        add(fb, h('p', { class: 'fb-big' }, line));
        // Wat leverde dit antwoord op? Kleine labels onder de lof.
        var tags = [];
        if (gain) tags.push(h('span', { class: 'tag tag-star' }, [icon('star'), '+' + gain]));
        if (boltGain) tags.push(h('span', { class: 'tag tag-bolt' }, [icon('bolt'), se.boltRun >= 3 ? 'reeks ×2' : 'snel']));
        if (res.record) tags.push(h('span', { class: 'tag tag-rec' }, [icon('trophy'), 'record ' + fmtSec(think)]));
        else if (!assisted && !corrected && res.before >= 2) tags.push(h('span', { class: 'tag tag-time' }, fmtSec(think)));
        if (bonus) tags.push(h('span', { class: 'tag tag-combo' }, [icon('link'), se.combo + ' op rij']));
        if (tags.length) add(fb, h('p', { class: 'fb-tags' }, tags));
        if (corrected && !assisted) add(fb, h('p', { class: 'fb-sub' }, 'Goed verbeterd!'));
        if (nowMastered) add(fb, h('p', { class: 'fb-sub' }, 'Die zit erin!'));
        else if (assisted) add(fb, h('p', { class: 'fb-sub' }, 'Met hulp lukt het. Straks probeer je hem zonder.'));
        var say = null;
        if (se.boltRun === 3) say = moLine('bolt3', 'Bliksemreeks! Nu krijg je dubbele bliksemsterren.', 'wauw');
        else if (se.boltRun === 6) say = moLine('bolt6', 'Zes keer bliksemsnel. Niet te stoppen!', 'juich');
        else if (res.record) say = moLine('rec', 'Sneller dan ooit voor ' + eqText(q).replace(/ = .*/, '') + '!', 'juich');
        else if (se.combo === 10) say = moLine('combo10', 'Tien juist op een rij!', 'juich');
        if (say) add(fb, say);
        helpRow.style.display = 'none';
        if (bonus || se.boltRun === 3 || res.record) SND.combo(); else if (res.bolt) SND.fast(); else SND.ok();
        var pause = say ? 1700 : (bonus || res.record ? 1250 : 850);
        later(next, einkOn() ? pause + 300 : pause);
        return;
      }

      // fout: uitleg, zelf verbeteren, en later in deze ronde opnieuw
      phase = 'fix';
      se.combo = 0;
      if (!q.reask) {
        se.errRun++;
        se.fastRun = 0;
        // Drie fouten na elkaar: deze ronde geen nieuwe sommen meer, eerst verstevigen.
        if (se.errRun >= 3) se.calm = true;
        se.boltRun = 0;
      }
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
        h('div', { class: 'qzone' }, [eq, tempo, fb, helpRow]),
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
    var moText, moMood = 'juich';
    var hist = pr.stats.hist, nowThink = median(se.thinks), prevThink = 0;
    for (var hi = hist.length - 2; hi >= 0; hi--) { if (hist[hi].think) { prevThink = hist[hi].think; break; } }
    var thinkLabel = 'denktijd';
    if (nowThink && prevThink) {
      var diff = prevThink - nowThink;
      if (diff >= 200) thinkLabel = 'denktijd, ' + fmtSec(diff) + ' sneller';
      else if (diff <= -200) thinkLabel = 'denktijd, vorige keer ' + fmtSec(prevThink);
      else thinkLabel = 'denktijd, even snel';
    }
    // Mo vat de ronde samen, met de nadruk op wat beter ging.
    if (summits.length) moText = 'Je staat op de top! Alle sommen van de tafel van ' + listNl(summits) + ' zitten erin.';
    else if (se.records.length >= 2) moText = se.records.length + ' nieuwe records! Je wordt echt sneller.';
    else if (nowThink && prevThink && prevThink - nowThink >= 200) moText = 'Je was ' + fmtSec(prevThink - nowThink) + ' sneller dan vorige keer!';
    else if (se.perfect) moText = 'Geen enkele fout. Knap gedaan!';
    else if (se.bestBoltRun >= 3) moText = 'Wat een bliksemreeks! ' + se.bestBoltRun + ' keer na elkaar supersnel.';
    else if (se.wrong.length > 3) { moText = 'Goed gewerkt. Die moeilijke sommen oefenen we samen nog.'; moMood = 'troost'; }
    else moText = 'Goed bezig! Elke ronde word je een beetje sneller.';
    var stats = h('div', { class: 'sum-stats' }, [
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, se.firstOk + ' van ' + se.len), h('span', { class: 'sum-l' }, 'meteen juist')]),
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, nowThink ? fmtSec(nowThink) : '–'), h('span', { class: 'sum-l' }, thinkLabel)]),
      h('div', { class: 'sum-stat' }, [h('span', { class: 'sum-n' }, [icon('bolt'), String(se.fast)]), h('span', { class: 'sum-l' }, 'bliksemsnel')]),
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
    if (se.records.length) {
      var recWrap = h('div', { class: 'chips' });
      for (var ri = 0; ri < se.records.length && ri < 3; ri++) {
        var r0 = se.records[ri];
        recWrap.appendChild(h('span', { class: 'chip chip-rec' }, [icon('trophy'), eqText(r0.q).replace(/ = .*/, '') + ': ' + fmtSec(r0.ms)]));
      }
      blocks.unshift(h('div', { class: 'sum-block' }, [h('h2', null, se.records.length === 1 ? 'Nieuw record' : 'Nieuwe records'), recWrap]));
    }
    if (se.slow.length) blocks.push(h('div', { class: 'sum-block' }, [h('h2', null, 'Deze mogen nog sneller'), chips(se.slow.slice(0, 6))]));

    var screen = h('div', { class: 'screen summary' }, [
      topBar(iconButton('back', 'Terug', current.back), null, starBadge(pr.stats.stars)),
      h('div', { class: 'sum-main' }, [
        h('div', { class: 'sum-head' }, [
          h('div', { class: 'mo-fig' }, moSvg(moMood, moWear())),
          h('div', { class: 'sum-headtext' }, [h('h1', null, title), h('button', { class: 'bubble', onclick: function () { speak(moText); } }, moText)])
        ]),
        stats,
        h('div', { class: 'sum-lvl-wrap' }, [
          se.unlocked ? h('p', { class: 'sum-levelup unlock' }, [icon('mountain'), 'Nieuwe berg open: de tafel van ' + se.unlocked + '!']) : null,
          levelCard(pr.stats.stars, 'sum-lvl')
        ]),
        h('div', { class: 'sum-blocks' }, blocks)
      ]),
      h('div', { class: 'sum-foot' }, endButtons(again, 'Nog een ronde'))
    ]);
    root.appendChild(screen);
    later(function () { speak(moText); }, 250);
    if (summits.length || up || se.unlocked || (se.newBadges && se.newBadges.length) || se.perfect) confetti(screen);
  };

  // ---------- sprint naar de hut: één minuut, alleen sommen die al goed gaan
  // De hut staat op de plaats van het eigen record: wie de hut haalt, evenaart zijn record.
  function sprintArt(frac, ghostFrac) {
    var svg = s('svg', { viewBox: '0 0 400 112', class: 'sprint-svg', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    var path = [[20, 94], [110, 84], [200, 68], [290, 56], [348, 46]];
    svg.appendChild(s('polygon', { points: pts([[0, 112], [0, 97]].concat(path).concat([[400, 40], [400, 112]])), class: 'sprint-hill' }));
    svg.appendChild(s('polyline', { points: pts(path), class: 'sprint-path' }));
    var hx = 356, hy = 44;
    svg.appendChild(s('rect', { x: hx, y: hy - 4, width: 30, height: 21, class: 'hut-wall' }));
    svg.appendChild(s('polygon', { points: pts([[hx - 5, hy - 3], [hx + 15, hy - 22], [hx + 35, hy - 3]]), class: 'hut-roof' }));
    svg.appendChild(s('rect', { x: hx + 11.5, y: hy + 5, width: 7, height: 12, class: 'hut-door' }));
    if (ghostFrac !== undefined && ghostFrac !== null) {
      var gh = partialPath(path, Math.max(0, Math.min(1, ghostFrac)));
      gh = gh[gh.length - 1];
      svg.appendChild(s('circle', { cx: gh[0], cy: gh[1] - 9, r: 7.5, class: 'ghost' }));
    }
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

    current.back = function () { go('speed'); };
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
        moSay(locked ? 'Eerst nog wat oefenen. Dan mag je sprinten!' : (stats.sprintBest ? 'Je schaduw loopt mee in het tempo van je record. Ben jij sneller?' : 'Eén minuut! Hoeveel sommen kan jij?'), locked ? 'denk' : 'wauw', { cls: 'card-mo' }),
        h('p', null, locked
          ? 'De sprint gaat open zodra minstens ' + SPRINT_MIN + ' sommen bijna of helemaal in zitten. Nu zijn dat er ' + pool.length + '.'
          : 'Je krijgt alleen sommen die je al goed kent. De hut staat bij je record.'),
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

    // De schaduw loopt in het tempo van je record en staat na een minuut bij de hut.
    function ghostFrac() {
      if (!stats.sprintBest) return null;
      var el = SPRINT_MS - Math.max(0, endAt - Date.now());
      return (el / SPRINT_MS) * stats.sprintBest / target();
    }

    function drawArt() {
      art.innerHTML = '';
      add(art, [sprintArt(count / target(), phase === 'intro' ? null : ghostFrac()), h('span', { class: 'sprint-count' }, [String(count), h('small', null, count === 1 ? 'som' : 'sommen')])]);
    }

    function tick() {
      if (phase === 'end' || phase === 'intro') return;
      var left = Math.max(0, endAt - Date.now());
      fill.style.width = (left / SPRINT_MS * 100).toFixed(1) + '%';
      secs.textContent = Math.ceil(left / 1000) + ' s';
      if (left <= 0) { finishRun(); return; }
      if (stats.sprintBest) drawArt();
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
      if (key !== 'ok') {
        if (typed.length < 3) {
          typed += key;
          drawEq();
          if (parseInt(typed, 10) === q.answer) onKey('ok');
        }
        return;
      }
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
      var gain = count + (rec && best ? 5 : 0);
      addStars(gain);
      markDay();
      var got = awardBadges();
      saveState();
      SND.done();
      var n = stars.getElementsByTagName('span');
      for (var i = 0; i < n.length; i++) if (n[i].className === 'stars-n') n[i].textContent = String(stats.stars);
      main.innerHTML = '';
      add(main, h('div', { class: 'sprint-card' }, [
        h('div', { class: 'sprint-art' }, sprintArt(count / Math.max(10, best), best ? best / Math.max(10, best) : null)),
        moSay(rec ? (best ? 'Je was sneller dan je schaduw! ' + (count - best) + ' sommen meer dan je record.' : 'Je eerste record! Nu loopt je schaduw mee.') : (best - count <= 2 ? 'Net niet! Nog eens, dan haal je je schaduw in.' : 'Goed gesprint. Je record blijft ' + best + '.'), rec ? 'juich' : 'troost', { cls: 'card-mo' }),
        h('p', { class: 'sprint-score' }, count + (count === 1 ? ' som juist' : ' sommen juist')),
        h('p', { class: 'sprint-record' + (rec ? ' rec' : '') }, rec ? (best ? 'Nieuw record! Je vorige record was ' + best + '.' : 'Je eerste record!') : 'Jouw record blijft ' + best + '.'),
        h('p', { class: 'sprint-stars' }, [icon('star'), '+' + gain]),
        newBadgesBlock(got),
        endButtons(function () { go('sprint', { now: true }); }, 'Nog eens', function () { go('speed'); }, 'Andere race')
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
      h('div', { class: 'record' }, [h('span', { class: 'rec-n' }, [icon('bolt'), String(st.bestBoltRun)]), h('span', { class: 'rec-l' }, 'bliksemreeks')]),
      h('div', { class: 'record' }, [h('span', { class: 'rec-n' }, [icon('flag'), String(summitsCount())]), h('span', { class: 'rec-l' }, 'toppen')])
    ]);
    root.appendChild(h('div', { class: 'screen medals' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Mijn medailles'), starBadge(st.stars)),
      recs,
      h('p', { class: 'chart-sum' }, badgeCount() + ' van de ' + BADGES.length + ' medailles verdiend'),
      h('div', { class: 'medal-wrap' }, grid)
    ]));
  };

  // ---------------------------------------------------------------- dagdoel, reeks en feestjes
  var GOALS = { klein: 15, gewoon: 25, groot: 40 };
  var WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  var pending = [];   // feestjes die na een ronde, race of sprint één voor één getoond worden

  function daysAgoStr(n) { var d = new Date(); d.setDate(d.getDate() - n); return dayStr(d); }

  function goalStars(pr) { pr = pr || P(); return GOALS[pr.settings.goal] || GOALS.gewoon; }

  function today() {
    var st = P().stats, d = todayStr();
    if (!st.today || st.today.d !== d) st.today = { d: d, stars: 0, hit: false, chest: false };
    return st.today;
  }

  // Eén feestje per soort; kleren en gouden toppen mogen meermaals.
  function queue(type, data) {
    for (var i = 0; i < pending.length; i++) {
      if (pending[i].type === type && type !== 'item' && type !== 'gold') { pending[i].data = data || {}; return; }
    }
    pending.push({ type: type, data: data || {} });
  }

  // Sterren bijtellen. Hier zitten ook het dagdoel en de nieuwe kleren voor Mo.
  function addStars(n) {
    var pr = P(), t = today(), before = levelInfo(pr.stats.stars).n;
    pr.stats.stars += n;
    t.stars += n;
    if (!t.hit && t.stars >= goalStars(pr)) { t.hit = true; pr.stats.goals++; queue('goal'); }
    var after = levelInfo(pr.stats.stars).n;
    for (var i = 0; i < MO_ITEMS.length; i++) {
      var it = MO_ITEMS[i];
      if (it.level > before && it.level <= after) {
        pr.stats.mo[it.slot] = it.id;
        queue('item', { id: it.id });
      }
    }
  }

  // Dagen op rij. Mis je één dag en heb je een schuilhut, dan blijft de reeks staan.
  function markDay() {
    var st = P().stats, td = todayStr();
    if (st.lastDay === td) return;
    var saved = false, earned = false;
    if (st.lastDay === daysAgoStr(1)) st.streak++;
    else if (st.lastDay === daysAgoStr(2) && st.streak > 0 && st.huts > 0) {
      st.huts--; st.streak++; saved = true;
      st.hutDays.push(daysAgoStr(1));
      if (st.hutDays.length > 10) st.hutDays.shift();
    } else st.streak = 1;
    if (st.streak > st.bestStreak) st.bestStreak = st.streak;
    if (st.streak > 1 && st.streak % 7 === 0 && st.huts < 2) { st.huts++; earned = true; }
    st.days++;
    st.lastDay = td;
    st.played.push(td);
    if (st.played.length > 30) st.played.shift();
    queue('streak', { saved: saved, earned: earned });
  }

  function currentStreak() {
    var st = P().stats;
    if (st.lastDay === todayStr() || st.lastDay === daysAgoStr(1)) return st.streak;
    if (st.lastDay === daysAgoStr(2) && st.huts > 0) return st.streak;
    return 0;
  }

  // Bliksemtop: alle sommen van een tafel zitten erin én gaan gemiddeld binnen 2,2 s.
  function goldMs() { return einkOn() ? 2900 : 2200; }

  function tableGold(t) {
    for (var a = 1; a <= 10; a++) {
      var f = getFact(a, t);
      if (!f || f.b < MASTER || !f.rt || f.rt > goldMs()) return false;
    }
    return true;
  }

  function checkGold(tables) {
    var st = P().stats;
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      if (!st.gold[t] && tableGold(t)) { st.gold[t] = todayStr(); queue('gold', { t: t }); }
    }
  }

  function goldCount() {
    var n = 0, g = P().stats.gold;
    for (var k in g) if (g.hasOwnProperty(k)) n++;
    return n;
  }

  // Knoppen onderaan een eindscherm: eerst de feestjes, daarna verder spelen.
  function endButtons(again, againLabel, home, homeLabel) {
    home = home || function () { go('home'); };
    if (pending.length) {
      return h('div', { class: 'sum-actions' }, h('button', { class: 'btn btn-sun btn-wide', onclick: function () { go('celebrate', { again: again, againLabel: againLabel, home: home, homeLabel: homeLabel }); } }, h('span', { class: 'btn-title' }, 'Verder')));
    }
    return h('div', { class: 'sum-actions' }, [
      again ? h('button', { class: 'btn btn-sun', onclick: again }, h('span', { class: 'btn-title' }, againLabel || 'Nog een ronde')) : null,
      h('button', { class: 'btn btn-ice', onclick: home }, h('span', { class: 'btn-title' }, homeLabel || 'Naar de bergen'))
    ]);
  }

  // ---------- week met zonnetjes
  function weekRow() {
    var st = P().stats, now = new Date(), idx = (now.getDay() + 6) % 7;
    var row = h('div', { class: 'week' });
    for (var i = 0; i < 7; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - idx + i), ds = dayStr(d);
      var played = st.played.indexOf(ds) >= 0, hut = st.hutDays.indexOf(ds) >= 0, isToday = i === idx, future = i > idx;
      row.appendChild(h('div', { class: 'wd' + (played ? ' on' : '') + (hut ? ' hut' : '') + (isToday ? ' today' : '') + (future ? ' future' : '') }, [
        h('span', { class: 'wd-dot' }, played ? icon('sun') : (hut ? icon('hut') : null)),
        h('span', { class: 'wd-name' }, WEEKDAYS[i])
      ]));
    }
    return row;
  }

  function bigSun(n) {
    var svg = s('svg', { viewBox: '0 0 120 120', class: 'bigsun', 'aria-hidden': 'true' });
    for (var i = 0; i < 12; i++) svg.appendChild(s('path', { d: 'M60 4 L65 20 L55 20 Z', class: 'ray', transform: 'rotate(' + (i * 30) + ' 60 60)' }));
    svg.appendChild(s('circle', { cx: 60, cy: 60, r: 36, class: 'core' }));
    svg.appendChild(s('text', { x: 60, y: 73, 'text-anchor': 'middle', class: 'core-n' }, String(n)));
    return svg;
  }

  function chestSvg(open) {
    var svg = s('svg', { viewBox: '0 0 140 120', class: 'chest' + (open ? ' open' : ''), 'aria-hidden': 'true' });
    if (open) {
      // Het deksel klapt naar achter: je ziet de binnenkant, en er straalt licht uit de kist.
      svg.appendChild(s('path', { d: 'M26 52 L114 52 L106 14 L34 14 Z', class: 'lid-in' }));
      for (var i = 0; i < 7; i++) svg.appendChild(s('path', { d: 'M70 50 L64 2 L76 2 Z', class: 'glow', transform: 'rotate(' + (-54 + i * 18) + ' 70 52)' }));
      svg.appendChild(s('ellipse', { cx: 70, cy: 53, rx: 46, ry: 6, class: 'inside' }));
    }
    svg.appendChild(s('rect', { x: 20, y: 52, width: 100, height: 56, rx: 8, class: 'box' }));
    svg.appendChild(s('rect', { x: 20, y: 70, width: 100, height: 9, class: 'band' }));
    svg.appendChild(s('rect', { x: 62, y: 64, width: 16, height: 20, rx: 3, class: 'lock' }));
    if (!open) svg.appendChild(s('path', { d: 'M22 52 L118 52 L112 22 Q70 4 28 22 Z', class: 'lid' }));
    return svg;
  }

  // ---------- feestjes
  var CEL_ORDER = { item: 1, gold: 2, streak: 3, goal: 4 };

  screens.celebrate = function (p) {
    pending.sort(function (x, y) { return CEL_ORDER[x.type] - CEL_ORDER[y.type]; });
    var item = pending.shift(), pr = P(), st = pr.stats;
    current.back = null;
    if (!item) { (p.home || function () { go('home'); })(); return; }
    var body = [], mo = null, more = function () { return pending.length > 0; };
    var actions = h('div', { class: 'cel-actions' });

    function drawActions() {
      actions.innerHTML = '';
      if (more()) add(actions, h('button', { class: 'btn btn-sun btn-wide', onclick: function () { go('celebrate', p); } }, h('span', { class: 'btn-title' }, 'Verder')));
      else add(actions, endButtons(p.again, p.againLabel, p.home, p.homeLabel));
    }

    if (item.type === 'streak') {
      var n = st.streak;
      body.push(bigSun(n));
      body.push(h('h1', null, n === 1 ? 'Eerste dag!' : n + ' dagen op rij!'));
      body.push(weekRow());
      var line = n === 1 ? 'Kom morgen terug, dan worden het er twee.' : 'Kom morgen terug, dan worden het er ' + (n + 1) + '.';
      if (item.data.saved) line = 'Gisteren was je er niet, maar een schuilhut heeft je reeks bewaard.';
      else if (item.data.earned) line = 'Een hele week! Je krijgt een schuilhut. Mis je een dag, dan bewaart die je reeks.';
      mo = moSay(line, 'juich', { cls: 'cel-mo' });
      body.push(h('p', { class: 'cel-note' }, [icon('hut'), st.huts === 1 ? 'Je hebt 1 schuilhut.' : 'Je hebt ' + st.huts + ' schuilhutten.']));
    } else if (item.type === 'goal') {
      var t = today(), chestBox = h('button', { class: 'chest-btn', 'aria-label': 'Schatkist openen' }, chestSvg(false));
      var reward = h('div', { class: 'reward' }, h('p', { class: 'reward-hint' }, 'Tik op de schatkist!'));
      body.push(h('h1', null, 'Dagdoel gehaald!'));
      body.push(h('p', { class: 'cel-sub' }, [icon('star'), t.stars + ' sterren vandaag']));
      body.push(chestBox, reward);
      mo = moSay('Je dagdoel is binnen! Er staat een schatkist voor je klaar.', 'juich', { cls: 'cel-mo' });
      chestBox.addEventListener('click', function () {
        if (t.chest) return;
        t.chest = true;
        st.chests++;
        var gift, text;
        if (st.huts < 2 && Math.random() < 0.3) { st.huts++; gift = icon('hut'); text = 'Een schuilhut! Die bewaart je reeks als je een dag mist.'; }
        else { var k = 5 + Math.floor(Math.random() * 8); addStars(k); gift = icon('star'); text = k + ' extra sterren!'; }
        saveState();
        SND.combo();
        chestBox.innerHTML = '';
        add(chestBox, chestSvg(true));
        reward.innerHTML = '';
        add(reward, h('p', { class: 'reward-got' }, [gift, text]));
        speak(text);
        confetti(root.firstChild);
        drawActions();
      }, false);
    } else if (item.type === 'item') {
      var it = moItem(item.data.id);
      body.push(h('h1', null, 'Nieuw voor Mo!'));
      body.push(h('p', { class: 'cel-sub' }, 'Je bent nu ' + levelInfo(st.stars).title + '. Mo krijgt ' + it.name + '.'));
      mo = moSay('Kijk, ' + it.name + '! Die doe ik meteen aan.', 'juich', { cls: 'cel-mo big' });
      body.push(h('button', { class: 'btn btn-line', onclick: function () { go('kast', { back: 'home' }); } }, 'Naar de kast van Mo'));
    } else if (item.type === 'gold') {
      body.push(h('div', { class: 'cel-flag' }, icon('flag')));
      body.push(h('h1', null, 'Bliksemtop!'));
      body.push(h('p', { class: 'cel-sub' }, 'Alle sommen van de tafel van ' + item.data.t + ' gaan bliksemsnel. Op die berg wappert nu een gouden vlag.'));
      mo = moSay('Wauw, zo snel! De tafel van ' + item.data.t + ' kan je als de bliksem.', 'wauw', { cls: 'cel-mo' });
    }

    drawActions();
    if (item.type === 'goal') {
      actions.innerHTML = '';
      add(actions, h('p', { class: 'reward-wait' }, ' '));
    }
    var screen = h('div', { class: 'screen celebrate cel-' + item.type }, [
      h('div', { class: 'cel-main' }, [mo, h('div', { class: 'cel-body' }, body), actions])
    ]);
    root.appendChild(screen);
    if (item.type !== 'goal') { SND.done(); confetti(screen); }
    saveState();
  };

  function bubbleOnly(text) {
    later(function () { speak(text); }, 250);
    return h('button', { class: 'bubble solo', onclick: function () { speak(text); } }, text);
  }

  // ---------- de kast van Mo
  screens.kast = function (p) {
    current.back = function () { go('home'); };
    var pr = P(), wear = pr.stats.mo, L = levelInfo(pr.stats.stars).n;
    var stage = h('div', { class: 'kast-mo' });
    var grid = h('div', { class: 'kast-grid' });

    function drawStage() { stage.innerHTML = ''; add(stage, moSvg('blij', wear, 'kast-big')); }

    function drawGrid() {
      grid.innerHTML = '';
      for (var i = 0; i < MO_ITEMS.length; i++) {
        (function (it) {
          var owned = L >= it.level, on = wear[it.slot] === it.id;
          var demo = {}; demo[it.slot] = it.id;
          grid.appendChild(h('button', {
            class: 'kast-item' + (owned ? '' : ' locked') + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false',
            onclick: function () {
              if (!owned) { speak('Dat krijg je op niveau ' + it.level + '.'); return; }
              wear[it.slot] = on ? null : it.id;
              saveState(); drawStage(); drawGrid();
            }
          }, [
            moSvg('blij', demo, 'kast-mini'),
            h('span', { class: 'ki-name' }, it.name.replace(/^een /, '')),
            h('span', { class: 'ki-state' }, owned ? (on ? 'Aan' : 'Uit') : 'Niveau ' + it.level)
          ]));
        })(MO_ITEMS[i]);
      }
    }
    drawStage(); drawGrid();

    root.appendChild(h('div', { class: 'screen kast' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'De kast van Mo'), starBadge(pr.stats.stars)),
      h('div', { class: 'kast-main' }, [
        h('div', { class: 'kast-left' }, [stage, bubbleOnly('Wat zal ik aandoen? Tik op iets.')]),
        grid
      ])
    ]));
  };

  // ---------------------------------------------------------------- snelheid: race per tafel
  // De tien sommen van één tafel zo snel mogelijk. De tijd loopt door, ook bij een fout:
  // de foute som komt achteraan terug. Een schaduwklimmer loopt in het tempo van je record.
  var RACE_LIMITS = [70000, 45000, 30000];      // brons, zilver, goud
  var MEDAL_NAMES = ['', 'brons', 'zilver', 'goud'];

  function raceLimit(n) { return Math.round(RACE_LIMITS[n - 1] * (einkOn() ? 1.2 : 1)); }

  function raceMedalFor(ms) {
    for (var n = 3; n >= 1; n--) if (ms <= raceLimit(n)) return n;
    return 0;
  }

  function raceable(t) {
    var n = 0;
    for (var a = 1; a <= 10; a++) if (box(a, t) >= 2) n++;
    return n >= 6;
  }

  function raceGoldCount() {
    var n = 0, r = P().stats.race;
    for (var k in r) if (r.hasOwnProperty(k) && r[k].medal === 3) n++;
    return n;
  }

  function fmtClock(ms, coarse) {
    if (coarse) return Math.floor(ms / 1000) + ' s';
    return (Math.floor(ms / 100) / 10).toFixed(1).replace('.', ',') + ' s';
  }

  function raceMedal(n, extra) {
    var svg = s('svg', { viewBox: '0 0 48 56', class: 'rmedal m' + n + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' });
    svg.appendChild(s('path', { d: 'M13 2h9l5 16h-9z', class: 'ribbon-a' }));
    svg.appendChild(s('path', { d: 'M35 2h-9l-5 16h9z', class: 'ribbon-b' }));
    svg.appendChild(s('circle', { cx: 24, cy: 34, r: 19, class: 'disc' }));
    svg.appendChild(s('circle', { cx: 24, cy: 34, r: 14.5, class: 'disc-in' }));
    svg.appendChild(s('path', { d: 'M26.5 22L17 36h6l-2 10 9.5-14h-6z', class: 'bolt' }));
    return svg;
  }

  // Een horizontale klim met jou en je schaduw.
  function trackSvg() {
    var svg = s('svg', { viewBox: '0 0 400 76', class: 'track', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    var path = [[18, 62], [140, 52], [260, 38], [372, 22]];
    svg.appendChild(s('polygon', { points: pts([[0, 76], [0, 64]].concat(path).concat([[400, 18], [400, 76]])), class: 'sprint-hill' }));
    svg.appendChild(s('polyline', { points: pts(path), class: 'sprint-path' }));
    svg.appendChild(s('line', { x1: 372, y1: 22, x2: 372, y2: 2, class: 'pole' }));
    svg.appendChild(s('polygon', { points: pts([[372.5, 2], [390, 7], [372.5, 12]]), class: 'pennant' }));
    var ghost = s('circle', { r: 7.5, class: 'ghost' });
    var me = s('circle', { r: 8, class: 'climber' });
    svg.appendChild(ghost);
    svg.appendChild(me);
    function put(el, frac) {
      var at = partialPath(path, Math.max(0, Math.min(1, frac)));
      at = at[at.length - 1];
      el.setAttribute('cx', at[0].toFixed(1));
      el.setAttribute('cy', (at[1] - 9).toFixed(1));
    }
    return { el: svg, me: function (f) { put(me, f); }, ghost: function (f) { if (f === null) ghost.setAttribute('class', 'ghost off'); else { ghost.setAttribute('class', 'ghost'); put(ghost, f); } } };
  }

  screens.race = function (p) {
    var t = p.t, pr = P(), stats = pr.stats, rec = stats.race[t] || null;
    current.back = function () { if (p.from === 'table') go('table', { t: t }); else go('speed'); };

    var stars = starBadge(stats.stars);
    var main = h('div', { class: 'race-main' });
    var screen = h('div', { class: 'screen race' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Race: tafel van ' + t), stars),
      main
    ]);
    root.appendChild(screen);

    var phase = 'intro', items = [], solved = 0, typed = '', q = null, t0 = 0, qStart = 0, coarse = einkOn();
    var track, clock, eq, fb;

    function nextMedalText() {
      if (!rec) return 'Goud haal je onder ' + Math.round(raceLimit(3) / 1000) + ' seconden.';
      if (rec.medal >= 3) return 'Je hebt goud. Kan je je record nog breken?';
      return 'Voor ' + MEDAL_NAMES[rec.medal + 1] + ': onder ' + Math.round(raceLimit(rec.medal + 1) / 1000) + ' seconden.';
    }

    function intro() {
      phase = 'intro';
      main.innerHTML = '';
      if (!raceable(t)) {
        add(main, h('div', { class: 'sprint-card' }, [
          moSay('Eerst wat oefenen op de tafel van ' + t + '. Daarna racen we!', 'denk', { cls: 'card-mo' }),
          h('button', { class: 'btn btn-sun', onclick: function () { go('practice', { tables: [t], from: 'table' }); } }, h('span', { class: 'btn-title' }, 'Oefen de tafel van ' + t))
        ]));
        return;
      }
      add(main, h('div', { class: 'sprint-card' }, [
        moSay(rec ? 'Je schaduw loopt mee in het tempo van je record. Haal je hem in?' : 'Alle tien sommen, zo snel als je kan. Klaar?', 'wauw', { cls: 'card-mo' }),
        h('div', { class: 'race-rec' }, [
          raceMedal(rec ? rec.medal : 0, 'race-rec-medal'),
          h('div', null, [
            h('p', { class: 'sprint-record' }, rec ? 'Jouw record: ' + fmtClock(rec.best) : 'Nog geen record'),
            h('p', { class: 'race-next' }, nextMedalText())
          ])
        ]),
        h('button', { class: 'btn btn-sun btn-big sprint-go', onclick: countdown }, h('span', { class: 'btn-title' }, 'Start'))
      ]));
    }

    function countdown() {
      phase = 'count';
      main.innerHTML = '';
      var n = 3, big = h('div', { class: 'countdown' }, '3');
      add(main, big);
      function tickDown() {
        n--;
        if (n <= 0) { run(); return; }
        big.textContent = String(n);
        SND.tick();
        later(tickDown, 650);
      }
      SND.tick();
      later(tickDown, 650);
    }

    function build() {
      var order = [];
      for (var a = 1; a <= 10; a++) order.push(a);
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = order[i]; order[i] = order[j]; order[j] = x; }
      items = [];
      for (var k = 0; k < order.length; k++) items.push({ a: order[k], swap: order[k] !== t && Math.random() < 0.4 });
    }

    function nextQ() {
      var it = items[0];
      q = { a: it.a, t: t, kind: it.swap ? 'swap' : 'mul', product: it.a * t, answer: it.a * t };
      q.parts = it.swap ? [t, TIMES, it.a, '=', null] : [it.a, TIMES, t, '=', null];
      typed = '';
      drawEq();
      qStart = Date.now();
    }

    function drawEq() {
      eq.innerHTML = '';
      for (var i = 0; i < q.parts.length; i++) {
        var part = q.parts[i];
        if (part === null) eq.appendChild(h('span', { class: 'tok blank' + (typed ? ' filled' : '') }, typed || ' '));
        else eq.appendChild(h('span', { class: 'tok ' + (typeof part === 'number' ? 'num' : 'op') }, String(part)));
      }
    }

    function tick() {
      if (phase !== 'run' && phase !== 'pause') return;
      var el = Date.now() - t0;
      clock.textContent = fmtClock(el, coarse);
      track.ghost(rec ? el / rec.best : null);
      later(tick, coarse ? 1000 : 100);
    }

    function run() {
      phase = 'run'; solved = 0;
      build();
      main.innerHTML = '';
      track = trackSvg();
      clock = h('div', { class: 'race-clock' }, '0 s');
      eq = h('div', { class: 'equation' });
      fb = h('p', { class: 'sprint-fb' }, ' ');
      add(main, h('div', { class: 'practice-main' }, [
        h('div', { class: 'qzone' }, [h('div', { class: 'race-top' }, [h('div', { class: 'race-track' }, track.el), clock]), eq, fb]),
        h('div', { class: 'padzone' }, keypad(onKey))
      ]));
      track.me(0);
      track.ghost(rec ? 0 : null);
      keyHandler = onKey;
      t0 = Date.now();
      nextQ();
      tick();
    }

    function onKey(key) {
      if (phase !== 'run') return;
      if (key === 'del') { typed = typed.slice(0, -1); drawEq(); return; }
      if (key !== 'ok') {
        if (typed.length < 3) {
          typed += key;
          drawEq();
          if (parseInt(typed, 10) === q.answer) onKey('ok');
        }
        return;
      }
      if (!typed) return;
      var f = getFact(q.a, t);
      if (parseInt(typed, 10) === q.answer) {
        var think = Date.now() - qStart;
        if (f && (!f.best || think < f.best)) f.best = think;
        items.shift();
        solved++;
        track.me(solved / 10);
        SND.tick();
        if (!items.length) { finish(); return; }
        nextQ();
        return;
      }
      // Fout: toon de juiste som, en deze komt achteraan terug.
      if (f) { if (f.b >= 3) f.b--; f.due = Date.now(); }
      SND.oops();
      phase = 'pause';
      items.push(items.shift());
      fb.className = 'sprint-fb show';
      fb.textContent = eqText(q);
      later(function () {
        if (phase !== 'pause') return;
        phase = 'run';
        fb.className = 'sprint-fb';
        fb.textContent = ' ';
        nextQ();
      }, 1200);
    }

    function finish() {
      phase = 'end';
      keyHandler = null;
      var ms = Date.now() - t0, medal = raceMedalFor(ms);
      var first = !rec, better = !rec || ms < rec.best, prevBest = rec ? rec.best : 0;
      var gotMedal = medal > (rec ? rec.medal : 0);
      stats.race[t] = { best: better ? ms : rec.best, medal: Math.max(medal, rec ? rec.medal : 0) };
      rec = stats.race[t];
      stats.races++;
      var gain = 5 + medal * 2 + (better && !first ? 3 : 0);
      addStars(gain);
      markDay();
      checkGold([t]);
      var got = awardBadges();
      saveState();
      SND.done();
      var n = stars.getElementsByTagName('span');
      for (var i = 0; i < n.length; i++) if (n[i].className === 'stars-n') n[i].textContent = String(stats.stars);

      var line;
      if (gotMedal && medal === 3) line = 'Goud! Zo snel ging het nog nooit.';
      else if (gotMedal) line = 'Je haalt ' + MEDAL_NAMES[medal] + '! ' + (medal < 3 ? 'Voor ' + MEDAL_NAMES[medal + 1] + ' moet je onder ' + Math.round(raceLimit(medal + 1) / 1000) + ' seconden.' : '');
      else if (better && !first) line = 'Nieuw record! Je was ' + fmtSec(prevBest - ms) + ' sneller dan je schaduw.';
      else if (first) line = 'Je eerste race! Nu loopt je schaduw mee.';
      else line = 'Je schaduw was net iets sneller. Nog eens?';

      main.innerHTML = '';
      add(main, h('div', { class: 'sprint-card' }, [
        moSay(line, better || gotMedal ? 'juich' : 'troost', { cls: 'card-mo' }),
        h('div', { class: 'race-rec' }, [
          raceMedal(medal, 'race-rec-medal big'),
          h('div', null, [
            h('p', { class: 'sprint-score' }, fmtClock(ms)),
            h('p', { class: 'sprint-record' + (better ? ' rec' : '') }, better && !first ? 'Nieuw record!' : 'Record: ' + fmtClock(rec.best)),
            h('p', { class: 'sprint-stars' }, [icon('star'), '+' + gain])
          ])
        ]),
        newBadgesBlock(got),
        endButtons(function () { go('race', { t: t, from: p.from }); }, 'Nog eens', function () { go('speed'); }, 'Andere race')
      ]));
      if (better || gotMedal) confetti(screen);
    }

    intro();
  };

  // ---------- snelheidsscherm: sprint en races
  screens.speed = function () {
    current.back = function () { go('home'); };
    var pr = P(), st = pr.stats;
    var sprintCard = h('button', { class: 'speed-sprint', onclick: function () { go('sprint'); } }, [
      icon('hut'),
      h('span', { class: 'ss-text' }, [h('span', { class: 'ss-title' }, 'Sprint naar de hut'), h('span', { class: 'ss-sub' }, 'Eén minuut, alle tafels door elkaar')]),
      h('span', { class: 'ss-rec' }, st.sprintBest ? [h('small', null, 'record'), String(st.sprintBest)] : '')
    ]);
    var grid = h('div', { class: 'race-grid' });
    for (var t = 1; t <= 10; t++) {
      (function (tt) {
        var r = st.race[tt], ok = raceable(tt);
        grid.appendChild(h('button', { class: 'race-card' + (ok ? '' : ' locked') + (r && r.medal === 3 ? ' gold' : ''), onclick: function () { go('race', { t: tt, from: 'speed' }); } }, [
          h('span', { class: 'rc-t' }, String(tt)),
          raceMedal(r ? r.medal : 0, 'rc-medal'),
          h('span', { class: 'rc-time' }, r ? fmtClock(r.best) : (ok ? 'Nog geen tijd' : 'Eerst oefenen'))
        ]));
      })(t);
    }
    root.appendChild(h('div', { class: 'screen speed' }, [
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Snelheid'), starBadge(st.stars)),
      h('div', { class: 'speed-main' }, [
        moSay('Hoe snel ben jij? Race tegen je eigen schaduw.', 'wauw', { cls: 'speed-mo' }),
        sprintCard,
        h('h2', { class: 'speed-h2' }, 'Race per tafel'),
        grid
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
      topBar(iconButton('back', 'Terug', current.back), h('h1', null, 'Mijn tafelkaart'), starBadge(P().stats.stars)),
      h('p', { class: 'chart-sum' }, n === 1 ? '1 van de 100 sommen zit erin.' : n + ' van de 100 sommen zitten erin.'),
      h('div', { class: 'chart-wrap' }, [h('p', { class: 'chart-axis' }, 'Elke rij is een tafel. Tik op een getal links om die tafel te openen.'), grid]),
      legend
    ]));
  };

  // ---------- verloop voor ouders: één reeks per grafiek, geen dubbele as
  function sparkline(values, o) {
    var W = 300, H = 70, padX = 8, padY = 8, n = values.length, i;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'spark', role: 'img', 'aria-label': o.label });
    function X(k) { return padX + (W - 2 * padX) * (n === 1 ? 0.5 : k / (n - 1)); }
    function Y(v) { return H - padY - (H - 2 * padY) * (Math.max(o.min, Math.min(o.max, v)) - o.min) / (o.max - o.min); }
    svg.appendChild(s('line', { x1: padX, x2: W - padX, y1: H - padY, y2: H - padY, class: 'spark-base' }));
    if (o.target !== undefined) {
      svg.appendChild(s('line', { x1: padX, x2: W - padX, y1: Y(o.target), y2: Y(o.target), class: 'spark-target' }));
    }
    var line = [];
    for (i = 0; i < n; i++) line.push([X(i), Y(values[i])]);
    if (n > 1) svg.appendChild(s('polyline', { points: pts(line), class: 'spark-line' }));
    for (i = 0; i < n; i++) {
      svg.appendChild(s('circle', { cx: line[i][0], cy: line[i][1], r: i === n - 1 ? 4.5 : 3, class: 'spark-dot' + (i === n - 1 ? ' last' : '') },
        s('title', null, o.fmt(values[i]))));
    }
    return svg;
  }

  function paceText(level) {
    if (level === 1) return 'Weinig nieuwe sommen per ronde. Een nieuwe som wordt eerst getoond en pas daarna gevraagd. Er komt meer herhaling, met kortere tussenpozen.';
    if (level === 3) return 'Veel nieuwe sommen per ronde en langere tussenpozen. Wisselsommen en ontbrekende getallen komen vroeger, en een nieuwe tafel gaat sneller open.';
    return 'Een paar nieuwe sommen per ronde, herhaling volgens het gewone schema.';
  }

  function progressBlock(pr) {
    var lm = pr.stats.lm, lvl = paceLevel(pr), hist = pr.stats.hist, i;
    var kids = [
      h('p', { class: 'pace-line' }, [h('span', { class: 'pace-tag' }, 'Leertempo: ' + PACE[lvl].label.toLowerCase()), pr.settings.pace === 'auto' ? (lm.n < 15 ? ' (nog aan het inschatten)' : '') : ' (vast ingesteld)']),
      h('p', null, paceText(lvl))
    ];
    if (lm.n >= 5) {
      kids.push(h('p', null, 'Juist bij de eerste poging: ongeveer ' + Math.round(lm.acc * 100) + '% van de laatste antwoorden. Denktijd bij sommen die al gekend zijn: ' + fmtSec(lm.think) + '. Het doel is drie seconden of minder.'));
    }
    var th = [], ac = [];
    for (i = Math.max(0, hist.length - 14); i < hist.length; i++) { if (hist[i].think) th.push(hist[i].think); ac.push(hist[i].acc); }
    if (hist.length >= 2) {
      var tmax = 6000;
      for (i = 0; i < th.length; i++) if (th[i] > tmax) tmax = th[i];
      kids.push(h('div', { class: 'spark-wrap' }, [
        h('span', { class: 'spark-title' }, 'Denktijd per ronde, laatste ' + th.length + (th.length === 1 ? ' ronde' : ' rondes')),
        sparkline(th, { min: 0, max: tmax, target: 3000, label: 'Denktijd per ronde', fmt: fmtSec }),
        h('span', { class: 'spark-note' }, 'Stippellijn: drie seconden. Laatste ronde: ' + fmtSec(th[th.length - 1] || 0) + '.')
      ]));
      kids.push(h('div', { class: 'spark-wrap' }, [
        h('span', { class: 'spark-title' }, 'Meteen juist per ronde'),
        sparkline(ac, { min: 0.4, max: 1, label: 'Meteen juist per ronde', fmt: function (v) { return Math.round(v * 100) + '%'; } }),
        h('span', { class: 'spark-note' }, 'Laatste ronde: ' + Math.round(ac[ac.length - 1] * 100) + '%.')
      ]));
    } else {
      kids.push(h('p', { class: 'set-small' }, 'Na een paar rondes verschijnt hier het verloop van denktijd en juistheid.'));
    }
    return h('div', { class: 'progress' }, kids);
  }

  // Een kopie bevat alle spelers. Alleen geldige spelopslag mag de huidige vervangen.
  function validateBackup(st) {
    if (!st || st.v !== 2 || !st.device || !st.profiles || !Array.isArray(st.order) || st.order.length > 50) throw new Error('Geen geldige Tafelberg-kopie.');
    function plain(o) { return o && Object.prototype.toString.call(o) === '[object Object]'; }
    function check(o, defaults) {
      if (!plain(o)) throw new Error('Ongeldige gegevens in de kopie.');
      for (var k in defaults) if (defaults.hasOwnProperty(k) && o[k] !== undefined && defaults[k] !== null) {
        var d = defaults[k], v = o[k];
        if (typeof v !== typeof d || (typeof d === 'number' && (!isFinite(v) || v < 0)) || (Array.isArray(d) && !Array.isArray(v)) || (plain(d) && !plain(v))) throw new Error('Ongeldige gegevens in de kopie.');
      }
    }
    var seen = {};
    for (var i = 0; i < st.order.length; i++) {
      var id = st.order[i], p = st.profiles[id];
      if (typeof id !== 'string' || !/^p[a-z0-9]+$/i.test(id) || seen[id] || !p || p.id !== id || typeof p.name !== 'string' || !p.name.length || p.name.length > 20) throw new Error('Ongeldige speler in de kopie.');
      seen[id] = true;
      if (typeof p.color !== 'number' || !isFinite(p.color) || p.color < 0 || p.color % 1 !== 0) throw new Error('Ongeldige kleur.');
      check(p.settings, defaultSettings()); check(p.stats, defaultStats());
      if (!Array.isArray(p.settings.tables) || !p.settings.tables.length || p.settings.tables.length > 10 || [8,12,16,20].indexOf(p.settings.len) < 0) throw new Error('Ongeldige instellingen.');
      for (var t = 0; t < p.settings.tables.length; t++) if (typeof p.settings.tables[t] !== 'number' || p.settings.tables[t] < 1 || p.settings.tables[t] > 10 || p.settings.tables[t] % 1) throw new Error('Ongeldige tafel.');
      if (p.stats.lm) check(p.stats.lm, defaultLm());
      if (p.settings.pace !== undefined && ['auto','rustig','gewoon','snel'].indexOf(p.settings.pace) < 0) throw new Error('Ongeldig leertempo.');
      if (p.settings.goal !== undefined && ['klein','gewoon','groot'].indexOf(p.settings.goal) < 0) throw new Error('Ongeldig dagdoel.');
      var stt = p.stats;
      if (stt.hist) for (var hi = 0; hi < stt.hist.length; hi++) { check(stt.hist[hi], { d: '', acc: 0, think: 0, pace: 0 }); }
      var lists = ['played', 'hutDays'];
      for (var li = 0; li < lists.length; li++) if (stt[lists[li]]) for (var di = 0; di < stt[lists[li]].length; di++) {
        if (typeof stt[lists[li]][di] !== 'string') throw new Error('Ongeldige kalender.');
      }
      if (stt.today) check(stt.today, { d: '', stars: 0, hit: false, chest: false });
      if (stt.race) for (var rk in stt.race) if (stt.race.hasOwnProperty(rk)) {
        check(stt.race[rk], { best: 0, medal: 0 });
        if (typeof stt.race[rk].best !== 'number' || typeof stt.race[rk].medal !== 'number' || stt.race[rk].medal > 3) throw new Error('Ongeldig racerecord.');
      }
      if (stt.mo) for (var slot in stt.mo) if (stt.mo.hasOwnProperty(slot) && stt.mo[slot] !== null && typeof stt.mo[slot] !== 'string') throw new Error('Ongeldige kleren.');

      if (!plain(p.facts)) throw new Error('Ongeldige sommen.');
      for (var f in p.facts) if (p.facts.hasOwnProperty(f)) {
        if (!/^(10|[1-9])x(10|[1-9])$/.test(f)) throw new Error('Ongeldige som.');
        check(p.facts[f], { b: 0, n: 0, c: 0, due: 0, last: 0, rt: 0 });
        if (typeof p.facts[f].b !== 'number' || p.facts[f].b > 5 || p.facts[f].b % 1) throw new Error('Ongeldig niveau.');
      }
    }
    if (st.current !== null && !seen[st.current]) throw new Error('De huidige speler ontbreekt.');
    return normalise(st);
  }

  function restoreBackup(raw) {
    if (typeof raw !== 'string' || raw.length > 2000000) throw new Error('De kopie is te groot.');
    var candidate = JSON.parse(raw, function (k, v) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype' || k === 'hasOwnProperty') throw new Error('Ongeldige sleutel in de kopie.');
      return v;
    });
    candidate = validateBackup(candidate);
    var json = JSON.stringify(candidate), b = bridge();
    // Eerst duurzaam opslaan. Bij een volle/geblokkeerde opslag blijft S intact.
    if (b) b.set(json); else window.localStorage.setItem(STORE_KEY, json);
    S = candidate; pending = []; applyTheme();
    go(S.order.length ? 'who' : 'newPlayer');
  }

  function backupBlock() {
    var code = h('textarea', { class: 'backup-code', rows: '5', 'aria-label': 'Kopie van de voortgang', spellcheck: 'false' });
    var status = h('p', { class: 'set-note', role: 'status' });
    var panel = h('div', { class: 'backup-panel', hidden: 'hidden' });
    var file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Kopiebestand kiezen' });
    function show(text) { panel.hidden = false; if (text !== undefined) code.value = text; }
    function fallback(raw) { show(raw); status.textContent = 'Selecteer de tekst en bewaar hem op een veilige plek.'; code.focus(); code.select(); }
    function download(raw) {
      var URL = window.URL || window.webkitURL;
      if (!URL || !URL.createObjectURL || !window.Blob || !('download' in document.createElement('a'))) { fallback(raw); return; }
      var link = h('a', { download: 'Tafelberg-voortgang-' + todayStr() + '.json' });
      var url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); link.href = url;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      status.textContent = 'Kopie gedownload. Bewaar het bestand op een veilige plek.';
    }
    function exportCopy() {
      var raw = JSON.stringify(S);
      try {
        if (navigator.share && navigator.canShare && window.File) {
          var f = new File([raw], 'Tafelberg-voortgang.json', { type: 'application/json' });
          if (navigator.canShare({ files: [f] })) {
            navigator.share({ files: [f], title: 'Tafelberg-voortgang' }).then(function () { status.textContent = 'Kopie gedeeld.'; }, function (e) { if (!e || e.name !== 'AbortError') download(raw); }); return;
          }
        }
      } catch (e) { /* gewone download als terugval */ }
      download(raw);
    }
    function restore() {
      try {
        validateBackup(JSON.parse(code.value));
        if (!window.confirm('Deze kopie vervangt alle spelers en voortgang op dit toestel. Eerst een kopie maken? Kies Annuleren. Terugzetten? Kies OK.')) return;
        restoreBackup(code.value);
      } catch (e) { status.textContent = 'Niet teruggezet: ' + (e.message || 'ongeldige kopie') + ' Je voortgang is niet gewijzigd.'; }
    }
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f || !window.FileReader) return;
      if (f.size > 2000000) { status.textContent = 'De kopie is te groot.'; return; }
      var reader = new FileReader();
      reader.onload = function () { show(String(reader.result)); status.textContent = 'Kopie ingelezen. Tik op Terugzetten om te bevestigen.'; };
      reader.onerror = function () { status.textContent = 'Het bestand kon niet worden gelezen.'; };
      reader.readAsText(f);
    }, false);
    add(panel, [h('p', { class: 'set-note' }, 'Plak je kopie of kies een JSON-bestand. Terugzetten vervangt alle spelers.'), code, file,
      h('button', { class: 'btn btn-line', onclick: restore }, 'Terugzetten'),
      h('button', { class: 'btn btn-line', onclick: function () { fallback(JSON.stringify(S)); } }, 'Toon kopietekst')]);
    return h('section', { class: 'set-block backup' }, [h('h2', null, 'Voortgang bewaren'),
      h('p', { class: 'set-note' }, 'Bewaar een kopie van alle spelers. Op iPhone en iPad kan de beginschermapp een eigen opslag hebben, los van Safari. Speel steeds via het icoon.'),
      h('div', { class: 'backup-actions' }, [h('button', { class: 'btn btn-line', onclick: exportCopy }, 'Kopie maken'), h('button', { class: 'btn btn-line', onclick: function () { show(''); } }, 'Kopie terugzetten')]), panel, status]);
  }

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

    var paceNote = h('span', { class: 'set-note' });
    var paceWrap = h('div', { class: 'seg seg-wide' });
    function drawPace() {
      paceWrap.innerHTML = '';
      paceNote.innerHTML = '';
      add(paceNote, st.pace === 'auto'
        ? 'Vanzelf: bepaald uit juistheid en denktijd. Nu ' + PACE[paceLevel(pr)].label.toLowerCase() + '.'
        : 'Vast ingesteld op ' + PACE[paceLevel(pr)].label.toLowerCase() + '.');
      var opts = [['auto', 'Vanzelf'], ['rustig', 'Rustig'], ['gewoon', 'Gewoon'], ['snel', 'Snel']];
      for (var i = 0; i < opts.length; i++) {
        (function (o) {
          paceWrap.appendChild(h('button', { class: 'seg-btn' + (st.pace === o[0] ? ' on' : ''), onclick: function () { st.pace = o[0]; saveState(); drawPace(); } }, o[1]));
        })(opts[i]);
      }
    }
    drawPace();

    var goalWrap = h('div', { class: 'seg seg-wide' });
    function drawGoal() {
      goalWrap.innerHTML = '';
      var opts = [['klein', 'Klein (15)'], ['gewoon', 'Gewoon (25)'], ['groot', 'Groot (40)']];
      for (var i = 0; i < opts.length; i++) {
        (function (o) {
          goalWrap.appendChild(h('button', { class: 'seg-btn' + ((st.goal || 'gewoon') === o[0] ? ' on' : ''), onclick: function () { st.goal = o[0]; saveState(); drawGoal(); } }, o[1]));
        })(opts[i]);
      }
    }
    drawGoal();

    var resetBtn = twoTap('Voortgang wissen', 'Zeker? Tik nog eens', function () {
      if (window.TBCloud && window.TBCloud.linked(pr.id)) {
        if (!window.confirm('Online blijft de verste voortgang bewaard. Op dit toestel afmelden en opnieuw beginnen?')) return;
        window.TBCloud.detach(pr.id);
      }
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
          toggle('Nieuwe tafels vanzelf erbij', 'Zodra de gekozen tafels goed zitten, komt de volgende erbij, in deze volgorde: 2, 10, 5, 1, 4, 3, 6, 8, 9, 7.', function () { return !!st.auto; }, function (v) { st.auto = v; }),
          h('div', { class: 'set-block' }, [h('span', { class: 'set-label' }, 'Leertempo'), paceNote, paceWrap]),
          toggle('Bliksembalk', 'Een balk die leegloopt bij sommen die al begrepen zijn. Niet bij nieuwe sommen en niet op e-ink.', function () { return st.tempo !== false; }, function (v) { st.tempo = v; }),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, h('span', { class: 'set-label' }, 'Sommen per ronde')), lenWrap]),
          h('div', { class: 'set-block' }, [h('span', { class: 'set-label' }, 'Dagdoel'), h('span', { class: 'set-note' }, 'Hoeveel sterren per dag. Een ronde levert er meestal 15 tot 30 op.'), goalWrap]),
          toggle('Mo leest voor', 'Mo zegt zijn zinnen hardop. Op Android is daarvoor een Nederlandse stem nodig.', function () { return st.voice !== false; }, function (v) { st.voice = v; if (!v) stopSpeaking(); }),
          toggle('Deelsommen meeoefenen', 'Zoals 12 : 3. Pas als de maalsom al goed gaat.', function () { return !!st.div; }, function (v) { st.div = v; }),
          typeof navigator.vibrate === 'function' ? toggle('Trillen', 'Een korte trilling bij een antwoord.', function () { return !!st.vibrate; }, function (v) { st.vibrate = v; }) : null,
          toggle('Geluid', null, function () { return !!st.sound; }, function (v) { st.sound = v; }),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, [h('span', { class: 'set-label' }, 'Opnieuw beginnen'), h('span', { class: 'set-note' }, 'Wist alle niveaus, sterren en medailles van ' + pr.name + '.')]), resetBtn]),
          h('div', { class: 'set-row' }, [h('div', { class: 'set-text' }, [h('span', { class: 'set-label' }, 'Speler verwijderen'), h('span', { class: 'set-note' }, 'Haalt ' + pr.name + ' en alle voortgang weg.')]), removeBtn]),
          window.TBCloud && window.TBCloud.configured() ? h('section', { class: 'set-block' }, [h('h2', null, 'Online bewaren'), h('p', { class: 'set-note' }, window.TBCloud.status(pr.id)), cloudButton('Online bewaren', { id: pr.id })]) : null,
          backupBlock(),
          h('h2', { class: 'set-head' }, 'Dit toestel'),
          toggle('E-inkweergave', 'Zwart-wit en zonder beweging. Staat vanzelf aan op een Boox.', function () { return einkOn(); }, function (v) { S.device.eink = v; applyTheme(); }),
          h('div', { class: 'set-row' }, [
            h('div', { class: 'set-text' }, [h('span', { class: 'set-label' }, 'Spelers'), h('span', { class: 'set-note' }, S.order.length === 1 ? '1 speler op dit toestel.' : S.order.length + ' spelers op dit toestel.')]),
            h('button', { class: 'btn btn-line', onclick: function () { go('newPlayer'); } }, 'Speler toevoegen')
          ])
        ]),
        h('div', { class: 'set-col parents' }, [
          h('h2', null, 'Voortgang van ' + pr.name),
          progressBlock(pr),
          h('h2', { class: 'parents-h2' }, 'Hoe Tafelberg werkt'),
          h('p', null, 'Tafelberg volgt de opbouw uit de klas. Eerst begrijpen: elke som is een aantal groepjes, getoond als stippen in bakjes. Dan slim afleiden vanuit de steunpunttafels 1, 2, 5 en 10. Pas daarna komt het vlot onthouden.'),
          h('p', null, 'Elke som heeft een eigen niveau, en hoger gaan vraagt telkens meer vlotheid: eerst binnen zes seconden denktijd, dan binnen vier en een halve, tot slot binnen drie. Pas dan zit een som erin. De denktijd loopt tot de eerste toets, zodat traag typen niet meetelt. Een som die vlot gaat, komt pas later terug: bij een gewoon tempo na een dag, daarna na twee, vier en negen dagen; bij een rustig tempo vaker, bij een snel tempo minder vaak. Bij een fout zakt de som. Uw kind ziet meteen hoe het zit, typt de juiste uitkomst over en krijgt dezelfde som later in de ronde nog eens.'),
          h('p', null, 'Het leertempo past zich aan het kind aan. Wie juist en vlot antwoordt, krijgt meer nieuwe sommen per ronde, langere tussenpozen en sneller een nieuwe tafel. Wie het moeilijk heeft, krijgt minder nieuwe sommen, ziet een nieuwe som eerst voor hij ze moet beantwoorden, en herhaalt vaker. Ook binnen een ronde schuift het mee: drie fouten na elkaar en er komen die ronde geen nieuwe sommen meer bij; een reeks vlotte antwoorden en er komen er net meer bij.'),
          h('p', null, 'Zodra de juiste uitkomst getypt is, gaat het spel vanzelf verder. Een foute uitkomst moet het kind met OK bevestigen. Wie eerst iets fouts typt en zelf verbetert, gaat ook verder, maar die som stijgt dan niet in niveau, zodat gokken niets oplevert.'),
          h('p', null, 'Op tempo werken komt pas als een som begrepen is. De bliksembalk verschijnt alleen bij sommen die al gekend zijn, en bij nieuwe sommen telt eerst het inzicht. Sterren komen er voor elk juist antwoord, met een extra ster per reeks van vijf. Zo telt nauwkeurig werken meer dan haast.'),
          h('p', null, 'Snelheid wordt apart beloond, altijd tegenover het eigen kunnen. Een antwoord binnen drie seconden levert een extra ster op, en tijdens een bliksemreeks (drie of meer na elkaar) twee. Wie een som sneller beantwoordt dan ooit tevoren, krijgt een record en een ster. Zit een hele tafel erin én gaat ze gemiddeld binnen 2,2 seconden, dan wappert er een gouden vlag op die berg.'),
          h('p', null, 'Onder Snelheid staan de sprint en een race per tafel. De sprint duurt één minuut, met alleen sommen die al goed gaan. Een race gaat over de tien sommen van één tafel, met brons onder 70, zilver onder 45 en goud onder 30 seconden (op e-ink een vijfde ruimer). Een race opent pas als minstens zes sommen van die tafel vlot gaan. In beide loopt een schaduwklimmer mee in het tempo van het eigen record. Een fout tijdens een race of sprint stuurt die som terug naar het gewone oefenen.'),
          h('p', null, 'Mo de marmot moedigt aan in korte zinnen en kan ze voorlezen. Er is een dagdoel in sterren met een schatkist als het gehaald is, en een reeks van dagen op rij. Mist uw kind één dag, dan bewaart een schuilhut de reeks. Elke zeven dagen op rij levert er een op, met een maximum van twee. Bij elk nieuw klimniveau krijgt Mo iets nieuws om aan te trekken.'),
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
    document.addEventListener('contextmenu', function (e) { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); }, false);
    if (window.TBWeb) window.TBWeb.init(window.Tafelberg);
    if (window.TBCloud) window.TBCloud.init(window.Tafelberg, h);
    if (!S.order.length) go('newPlayer');
    else if (S.order.length > 1) go('who');
    else go('home');
  }

  // Voor tests in een gewone browser.
  window.Tafelberg = {
    state: function () { return S; },
    cloudImport: function (pr, select) {
      var candidate = defaultStore(); candidate.profiles[pr.id] = pr; candidate.order = [pr.id]; candidate.current = pr.id;
      pr = validateBackup(JSON.parse(JSON.stringify(candidate))).profiles[pr.id];
      var next = JSON.parse(JSON.stringify(S));
      if (!next.profiles[pr.id]) next.order.push(pr.id);
      next.profiles[pr.id] = pr; if (select) next.current = pr.id;
      var raw = JSON.stringify(next), b = bridge();
      if (b) b.set(raw); else window.localStorage.setItem(STORE_KEY, raw);
      S = next; saveState(); return pr.id;
    },
    cloudReplaceId: function (oldId, pr) {
      // Eerst het nieuwe profiel duurzaam bewaren, dan pas de oude lokale ID verwijderen.
      this.cloudImport(pr, true);
      if (oldId && oldId !== pr.id && S.profiles[oldId]) { delete S.profiles[oldId]; S.order.splice(S.order.indexOf(oldId), 1); saveState(); }
    },
    cloudSelect: function (id) { if (S.profiles[id]) { S.current = id; saveState(); } },
    exportBackup: function () { return JSON.stringify(S); },
    restoreBackup: restoreBackup,
    current: function () { return current; },
    profile: function () { return P(); },
    grade: function (q, ok, ms, assisted, corrected) { return grade(q, ok, ms, assisted, corrected); },
    makeQuestion: makeQuestion,
    newSession: newSession,
    pickNext: pickNext,
    strategy: strategy,
    levelInfo: levelInfo,
    lmUpdate: lmUpdate,
    paceLevel: function () { return paceLevel(); },
    maybeUnlock: maybeUnlock,
    updatePace: updatePace,
    median: median,
    speedLimit: speedLimit,
    award: awardBadges,
    addStars: addStars,
    markDay: markDay,
    pending: function () { return pending; },
    tableGold: tableGold,
    checkGold: checkGold,
    go: go,
    save: saveState,
    reload: function () { S = loadState(); applyTheme(); go(S.order.length ? 'home' : 'newPlayer'); }
  };

  boot();
}());
