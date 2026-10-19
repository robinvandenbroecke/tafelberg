/* Alleen in de webbuild geladen. ES5; geen afhankelijkheden tijdens het spelen. */
(function () {
  'use strict';
  if (window.AndroidStore || !/^https?:$/.test(location.protocol)) return;
  var api = null, waiting = null, updating = false, lastScreen = '', hiddenToday = false;
  var entries = [], cursor = 0, popping = false, expectedPop = false;
  var android = /Android/i.test(navigator.userAgent);
  var standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  function node(tag, cls, text) {
    var el = document.createElement(tag); el.className = cls || '';
    if (text) el.appendChild(document.createTextNode(text));
    return el;
  }
  function dateKey() { var d = new Date(); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function banner() {
    var host = document.querySelector('.home .web-notices');
    if (!host || !api) return;
    host.innerHTML = '';
    if (waiting) {
      var update = node('button', 'web-update', 'Er is een nieuwe versie. Tik om bij te werken.');
      update.addEventListener('click', function () {
        if (!waiting || lastScreen !== 'home') return;
        api.save(); updating = true; update.disabled = true;
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }, false);
      host.appendChild(update);
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
    if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; banner(); }
    reg.addEventListener('updatefound', function () {
      var worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) { waiting = reg.waiting || worker; banner(); }
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
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          // Ook in andere open vensters nooit een ronde onderbreken.
          if (updating && lastScreen === 'home') location.reload();
        }, false);
        navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(watch, function () {});
      }
    },
    screen: function (name, params, back) {
      lastScreen = name;
      banner();
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
