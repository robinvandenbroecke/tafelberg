/* Alleen in de webbuild geladen. ES5; geen afhankelijkheden tijdens het spelen. */
(function () {
  'use strict';
  if (window.AndroidStore || !/^https?:$/.test(location.protocol)) return;
  var watchedReg = null;
  var api = null, waiting = null, updating = false, reloadPending = false, hadController = false;
  var updateTimer = null, lastCheck = 0, lastScreen = '', hiddenToday = false;
  var entries = [], cursor = 0, popping = false, expectedPop = false;
  var android = /Android/i.test(navigator.userAgent);
  var standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  function node(tag, cls, text) {
    var el = document.createElement(tag); el.className = cls || '';
    if (text) el.appendChild(document.createTextNode(text));
    return el;
  }
  function dateKey() { var d = new Date(); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function safeToUpdate() { return api && lastScreen === 'home' && document.visibilityState !== 'hidden'; }
  function autoUpdate() {
    if (updateTimer !== null) window.clearTimeout(updateTimer);
    // Laat eerst navigatie en het opslaan van een afgeronde ronde voltooien.
    updateTimer = window.setTimeout(function () {
      updateTimer = null;
      if (!safeToUpdate()) return;
      if (reloadPending) { api.save(); location.reload(); return; }
      if (!waiting || updating) return;
      api.save(); updating = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    }, 100);
  }
  function checkForUpdate() {
    autoUpdate();
    if (!watchedReg || !watchedReg.update || navigator.onLine === false || document.visibilityState === 'hidden' || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    try { watchedReg.update().then(function () {}, function () {}); } catch (e) { /* later opnieuw bij verbinding */ }
  }
  function banner() {
    var host = document.querySelector('.home .web-notices');
    if (!host || !api) return;
    host.innerHTML = '';
    if (waiting) {
      host.appendChild(node('p', 'web-update', 'Nieuwe versie wordt automatisch geladen…'));
    }
    var mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1);
    var seen = false;
    try { seen = localStorage.getItem('tafelberg.install.dismissed') === dateKey(); } catch (e) { /* privéstand */ }
    if (!standalone && mobile && !seen && !hiddenToday) {
      var box = node('div', 'web-install');
      var link = node('a', '', 'Zet Tafelberg op je beginscherm, dan werkt het als een app.');
      link.href = 'installeer/'; box.appendChild(link);
      var close = node('button', '', '×'); close.setAttribute('aria-label', 'Installatietip sluiten');
      close.addEventListener('click', function () {
        hiddenToday = true;
        try { localStorage.setItem('tafelberg.install.dismissed', dateKey()); } catch (e) { /* niets */ }
        banner();
      }, false);
      box.appendChild(close); host.appendChild(box);
    }
  }
  function watch(reg) {
    if (!reg || watchedReg === reg) return;
    watchedReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; banner(); autoUpdate(); }
    reg.addEventListener('updatefound', function () {
      var worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) { waiting = reg.waiting || worker; banner(); autoUpdate(); }
      }, false);
    }, false);
  }
  window.TBWeb = {
    init: function (app) {
      api = app;
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        try { navigator.storage.persist().then(function () {}, function () {}); } catch (e) { /* facultatief */ }
      }
      if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
        hadController = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          // Ook een update vanuit een ander venster pas op een veilig scherm laden.
          if (hadController || updating) reloadPending = true;
          hadController = true; waiting = null; updating = false;
          autoUpdate();
        }, false);
        document.addEventListener('visibilitychange', checkForUpdate, false);
        window.addEventListener('focus', checkForUpdate, false);
        window.addEventListener('online', checkForUpdate, false);
        // Ook offline moet een bestaande registratie latere updates kunnen melden.
        if (navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration().then(watch, function () {});
        }
        navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(watch, function () {});
      }
    },
    screen: function (name, params, back) {
      lastScreen = name;
      banner();
      if (name === 'home') checkForUpdate();
      if (!android || !window.history || !history.pushState || popping) return;
      var item = { name: name, params: params, back: back };
      if (!entries.length) {
        entries = [item]; history.replaceState({ tafelberg: 0 }, ''); return;
      }
      if (entries[cursor].name === name) { entries[cursor] = item; return; }
      // Eigen terugknoppen en 'Naar de bergen' lopen dezelfde geschiedenis terug.
      var target = -1;
      for (var i = cursor - 1; i >= 0; i--) if (entries[i].name === name) { target = i; break; }
      if (target >= 0) {
        entries[target] = item; expectedPop = true;
        var delta = target - cursor; cursor = target; history.go(delta); return;
      }
      if (name === 'home') {
        entries[cursor] = item; history.replaceState({ tafelberg: cursor }, ''); return;
      }
      cursor++; entries = entries.slice(0, cursor); entries.push(item);
      history.pushState({ tafelberg: cursor }, '');
    }
  };
  window.addEventListener('popstate', function (event) {
    if (!android || !api) return;
    if (expectedPop) { expectedPop = false; return; }
    var target = event.state && event.state.tafelberg;
    if (typeof target !== 'number' || !entries[target]) return;
    var from = entries[cursor]; cursor = target; popping = true;
    try {
      if (from && from.name !== 'home' && from.back) from.back();
      if (lastScreen !== entries[target].name) api.go(entries[target].name, entries[target].params);
    } finally { popping = false; }
  }, false);
}());
