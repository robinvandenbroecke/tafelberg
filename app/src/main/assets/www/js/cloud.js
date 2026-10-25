/* ES5. Eén afzonderlijke aanmeldsessie per speler op dit toestel. */
(function () {
  'use strict';
  var api, h, meta = { accounts: {}, device: '' }, storageKey = 'tafelberg.sync.v1';
  var busy = false, timer = null, channel = '', frame = null, peer = null, peerOrigin = '', pending = {}, queue = [], sequence = 0;
  var native = window.AndroidSync, ui = null, suppressed = false;
  function random() {
    var a = new Uint8Array(32), text = '', i;
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Dit toestel kan nog niet veilig online aanmelden.');
    window.crypto.getRandomValues(a);
    for (i = 0; i < a.length; i++) text += ('0' + a[i].toString(16)).slice(-2);
    return text;
  }
  function configured() { return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(window.TB_CLOUD_URL || ''); }
  function persist() { window.localStorage.setItem(storageKey, JSON.stringify(meta)); }
  function clone(p) { return JSON.parse(JSON.stringify(p)); }
  function profile(id) { return api.state().profiles[id]; }
  function snapshot(id) { return JSON.stringify(profile(id)); }
  function safe() { return api && api.current() && /^(home|who|settings|cloud)$/.test(api.current().name); }
  function applySafe() { return api && api.current() && /^(home|who|cloud)$/.test(api.current().name); }
  function status(id, message) { var a = meta.accounts[id]; if (a) a.message = message; if (ui && ui.id === id && ui.status) ui.status.textContent = message; }
  function finish(id, result) { var p = pending[id]; if (!p) return; delete pending[id]; window.clearTimeout(p.timeout); p.callback(result); }
  function send(item) { peer.postMessage({ type: 'tb-sync-request', channel: channel, id: item.id, request: item.request }, peerOrigin); }
  function transport(request, callback) {
    if (!configured()) { callback({ ok: false, message: 'Online bewaren is nog niet beschikbaar.' }); return; }
    if (navigator.onLine === false) { callback({ ok: false, offline: true, message: 'Geen internet. Je voortgang blijft op dit toestel.' }); return; }
    var id = 'r' + (++sequence), item = { id: id, request: request };
    pending[id] = { callback: callback, timeout: window.setTimeout(function () { finish(id, { ok: false, message: 'Geen bevestiging ontvangen. Probeer opnieuw. Na registreren kan je met je gekozen pincode aanmelden.' }); }, 60000) };
    if (native && typeof native.request === 'function') {
      native.request(window.TB_CLOUD_URL, id, JSON.stringify(request)); return;
    }
    if (peer) { send(item); return; }
    queue.push(item);
    if (!frame) {
      try { channel = random(); } catch (e) { finish(id, { ok: false, message: e.message }); return; }
      frame = document.createElement('iframe'); frame.title = 'Tafelberg verbinden'; frame.hidden = true; frame.setAttribute('aria-hidden', 'true');
      frame.src = window.TB_CLOUD_URL + '?channel=' + channel; document.body.appendChild(frame);
    }
  }
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!channel || !data || data.channel !== channel || !/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)) return;
    if (peer && (event.source !== peer || event.origin !== peerOrigin)) return;
    if (data.type === 'tb-sync-ready') {
      peer = event.source; peerOrigin = event.origin;
      var waiting = queue; queue = [];
      for (var i = 0; i < waiting.length; i++) if (pending[waiting[i].id]) send(waiting[i]);
    } else if (data.type === 'tb-sync-response' && peer) finish(data.id, data.result);
  }, false);
  function capture() {
    if (!api || suppressed) return;
    for (var id in meta.accounts) if (meta.accounts.hasOwnProperty(id)) {
      var a = meta.accounts[id];
      if (!profile(id)) { delete meta.accounts[id]; continue; }
      a.dirty = snapshot(id) !== a.base;
    }
    try { persist(); } catch (e) { /* Spelopslag zelf blijft via de bestaande opslag werken. */ }
    schedule();
  }
  function schedule() { if (timer) window.clearTimeout(timer); timer = window.setTimeout(sync, 2500); }
  function install(id, remote, revision) {
    var a = meta.accounts[id];
    suppressed = true;
    try { api.cloudImport(remote, false); a.base = snapshot(id); a.revision = revision; a.dirty = false; a.remote = null; persist(); }
    finally { suppressed = false; }
    status(id, 'Online bewaard.');
    var screen = api.current(); if (screen && /^(home|who)$/.test(screen.name)) api.go(screen.name, screen.params);
  }
  function sync() {
    if (!api || busy || !configured() || navigator.onLine === false) return;
    var id = api.state().current, a = meta.accounts[id];
    if (!a || !a.token || !profile(id)) return;
    if (a.remote && applySafe()) {
      var remembered = a.remote; a.remote = null;
      if (TBProgress.compare(profile(id), remembered.profile) <= 0) install(id, remembered.profile, remembered.revision);
      else { a.base = JSON.stringify(remembered.profile); a.revision = remembered.revision; }
    }
    captureWithoutTimer();
    var raw = snapshot(id), writing = a.dirty;
    if (!writing && !applySafe()) return;
    busy = true; status(id, writing ? 'Voortgang bewaren…' : 'Voortgang controleren…');
    var request = { action: writing ? 'write' : 'read', token: a.token, device: meta.device };
    if (writing) {
      try { if (!a.change || a.change.raw !== raw) a.change = { id: 'c' + random(), raw: raw }; } catch (e) { busy = false; status(id, e.message); return; }
      request.changeId = a.change.id; request.revision = a.revision; request.profile = JSON.parse(raw);
      try { persist(); } catch (e) { busy = false; status(id, 'Maak een kopie: de opslag van dit toestel is vol.'); return; }
    }
    transport(request, function (result) {
      busy = false;
      if (meta.accounts[id] !== a || !profile(id)) return;
      if (!result.ok) status(id, result.message || 'Online bewaren lukt nu niet.');
      else {
        try {
          var remote = JSON.stringify(result.profile), local = snapshot(id);
          a.revision = result.revision; a.change = null;
          if (remote === local) { a.base = local; a.dirty = false; status(id, 'Online bewaard.'); }
          else if (TBProgress.compare(profile(id), result.profile) <= 0) {
            if (applySafe()) install(id, result.profile, result.revision);
            else { a.remote = { profile: result.profile, revision: result.revision }; status(id, 'De verste voortgang wordt na deze ronde geladen.'); }
          } else { a.base = remote; a.dirty = true; status(id, 'De voortgang van dit toestel staat verder. Wordt bewaard…'); schedule(); }
          persist();
        } catch (e) { status(id, 'Niet toegepast: ' + e.message); }
      }
      try { persist(); } catch (e2) { /* Bestaande lokale spelopslag is ongewijzigd. */ }

    });
  }
  function captureWithoutTimer() { if (api && api.state().current && meta.accounts[api.state().current]) { var id = api.state().current; meta.accounts[id].dirty = snapshot(id) !== meta.accounts[id].base; } }
  function button(label, fn) { return h('button', { class: 'btn btn-line', onclick: fn }, label); }
  function field(label, type, autocomplete) {
    var input = h('input', { class: 'name-input', type: type || 'text', 'aria-label': label, autocomplete: autocomplete || 'off', maxlength: type === 'password' ? '6' : '30' });
    if (type === 'password') { input.setAttribute('inputmode', 'numeric'); input.setAttribute('pattern', '[0-9]{6}'); }
    return { input: input, node: h('label', { class: 'cloud-field' }, [h('span', { class: 'set-label' }, label), input]) };
  }
  function show(root, params) {
    root.innerHTML = ''; var id = params.id || api.state().current, p = profile(id), a = meta.accounts[id];
    var content = h('div', { class: 'cloud-card' }), note = h('p', { class: 'set-note', role: 'status' });
    ui = { id: id, status: note, redraw: function () { if (api.current().name === 'cloud') show(root, params); } };
    root.appendChild(h('div', { class: 'screen settings cloud' }, [h('header', { class: 'bar' }, [button('Terug', function () { api.go(p ? 'settings' : 'newPlayer'); }), h('h1', null, 'Online bewaren')]), h('div', { class: 'cloud-main' }, content)]));
    if (!configured()) { content.appendChild(h('p', null, 'Online bewaren is nog niet beschikbaar. Je voortgang blijft op dit toestel.')); return; }
    content.appendChild(h('p', null, 'Met je gebruikersnaam en pincode speel je verder op een ander toestel. Op dit toestel blijven meerdere spelers mogelijk.'));
    if (a && a.token && params.mode !== 'login') {
      content.appendChild(h('h2', null, 'Aangemeld als ' + a.username)); note.textContent = a.message || 'Je voortgang blijft ook op dit toestel bewaard.';
      content.appendChild(note);
      content.appendChild(h('p', { class: 'set-note' }, 'Op verschillende toestellen gespeeld? De versie met de meeste sterren blijft bewaard. Bij gelijkstand tellen afgeronde rondes en daarna de beheersing van de sommen.'));
      content.appendChild(button('Nu synchroniseren', sync));
      content.appendChild(button('Afmelden op dit toestel', function () {
        if (!window.confirm('Afmelden? De voortgang blijft op dit toestel. Niet-verzonden wijzigingen staan dan nog niet online.')) return;
        transport({ action: 'logout', token: a.token }, function () {}); delete meta.accounts[id]; persist(); show(root, params);
      }));
      content.appendChild(button('Andere online speler toevoegen', function () { api.go('cloud', { mode: 'login' }); })); return;
    }
    var mode = params.mode || (p ? 'register' : 'login');
    content.appendChild(h('h2', null, mode === 'register' ? 'Bewaar de voortgang van ' + p.name : mode === 'recover' ? 'Pincode herstellen' : 'Bestaande speler aanmelden'));
    var username = field('Gebruikersnaam', 'text', 'username'), pin = field(mode === 'recover' ? 'Nieuwe pincode' : 'Pincode', 'password', mode === 'login' ? 'current-password' : 'new-password'), confirmPin = field('Herhaal pincode', 'password', 'new-password'), recovery = field('Herstelcode');
    recovery.input.maxLength = 64;
    content.appendChild(username.node); content.appendChild(pin.node);
    if (mode !== 'login') content.appendChild(confirmPin.node);
    if (mode === 'recover') content.appendChild(recovery.node);
    content.appendChild(h('p', { class: 'set-note' }, 'Gebruikersnaam: 3 tot 30 letters of cijfers, eventueel met - of _. Pincode: zes cijfers.'));
    var submit = button(mode === 'register' ? 'Account maken en bewaren' : mode === 'recover' ? 'Pincode herstellen' : 'Aanmelden', function () {
      if (submit.disabled) return;
      if (!/^\d{6}$/.test(pin.input.value)) { note.textContent = 'Gebruik zes cijfers.'; return; }
      if (mode !== 'login' && pin.input.value !== confirmPin.input.value) { note.textContent = 'De twee pincodes verschillen.'; return; }
      var request = { action: mode === 'register' ? 'register' : mode === 'recover' ? 'recover' : 'login', username: username.input.value, pin: pin.input.value, device: meta.device };
      if (mode === 'register') request.profile = clone(p);
      if (mode === 'recover') request.recovery = recovery.input.value;
      pin.input.value = ''; confirmPin.input.value = ''; recovery.input.value = ''; submit.disabled = true; note.textContent = 'Even verbinden…';
      transport(request, function (result) {
        submit.disabled = false;
        if (!result.ok) { note.textContent = result.message || 'Aanmelden lukt nu niet.'; return; }
        try {
          var target = result.user, existing = meta.accounts[target], local = profile(target);
          // Bestaande onverzonden voortgang nooit door opnieuw aanmelden verliezen.
          if (local && TBProgress.compare(local, result.profile) > 0) {
            existing = existing || { user: target, username: result.username, base: JSON.stringify(result.profile), revision: result.revision }; meta.accounts[target] = existing; existing.token = result.token; existing.remote = { profile: result.profile, revision: result.revision }; persist(); api.cloudSelect(target); api.go('cloud', { id: target }); schedule(); return;
          }
          suppressed = true;
          if (mode === 'register' && id !== target) api.cloudReplaceId(id, result.profile); else api.cloudImport(result.profile, true);
          meta.accounts[target] = { user: target, username: result.username, token: result.token, revision: result.revision, base: snapshot(target), dirty: false, message: 'Online bewaard.' };
          persist();
          api.go('cloud', { id: target });
          if (result.recovery) {
            var code = h('textarea', { class: 'backup-code', readonly: 'readonly', rows: '3', 'aria-label': 'Herstelcode' }); code.value = result.recovery;
            var targetCard = document.querySelector('.cloud-card'); targetCard.appendChild(h('h2', null, 'Bewaar je herstelcode'));
            targetCard.appendChild(h('p', null, 'Bewaar deze code bij een ouder. Hiermee herstel je een vergeten pincode. De code wordt nu één keer getoond.')); targetCard.appendChild(code);
          }
        } catch (e) { note.textContent = 'Aanmelding ontvangen, maar lokaal bewaren lukte niet: ' + e.message; }
        finally { suppressed = false; }
      });
    });
    content.appendChild(submit); content.appendChild(note);
    if (mode !== 'login') content.appendChild(button('Ik heb al een account', function () { api.go('cloud', { mode: 'login' }); }));
    if (mode === 'login') {
      content.appendChild(button('Pincode vergeten', function () { api.go('cloud', { mode: 'recover' }); }));
      if (p) content.appendChild(button('Deze klimmer online bewaren', function () { api.go('cloud', { id: id, mode: 'register' }); }));
    }
  }
  window.TBCloud = {
    configured: configured,
    linked: function (id) { return !!meta.accounts[id]; },
    detach: function (id) { delete meta.accounts[id]; persist(); },
    init: function (app, dom) {
      api = app; h = dom;
      try { var saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null'); if (saved && saved.accounts && typeof saved.accounts === 'object') meta = saved; if (!meta.device) meta.device = random(); persist(); }
      catch (e) { meta = { accounts: {}, device: '' }; }
      window.addEventListener('online', schedule, false);
      window.setInterval(function () { if (safe()) sync(); }, 60000);
    },
    saved: capture,
    screen: function () { if (api.current().name !== 'cloud') ui = null; schedule(); },
    render: show,
    nativeReply: function (id, result) { finish(id, result); },
    sync: sync,
    status: function (id) { var a = meta.accounts[id]; return a ? a.message || 'Online bewaren staat aan.' : 'Bewaar deze klimmer ook op andere toestellen.'; }
  };
}());
