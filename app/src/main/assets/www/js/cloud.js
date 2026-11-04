/* ES5. Eén afzonderlijke aanmeldsessie per speler op dit toestel. */
(function () {
  'use strict';
  var api, h, meta = { accounts: {}, device: '' }, storageKey = 'tafelberg.supabase.v1';
  var busy = false, timer = null, ui = null, suppressed = false, linkSession = null, pendingLogin = null;
  var native = window.AndroidSync, pending = {}, sequence = 0;
  function random() {
    var a = new Uint8Array(32), text = '', i;
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Dit toestel kan nog niet veilig online aanmelden.');
    window.crypto.getRandomValues(a);
    for (i = 0; i < a.length; i++) text += ('0' + a[i].toString(16)).slice(-2);
    return text;
  }
  function configured() { return /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/tafelberg$/.test(window.TB_CLOUD_URL || ''); }
  function persist() { window.localStorage.setItem(storageKey, JSON.stringify(meta)); }
  function clone(p) { return JSON.parse(JSON.stringify(p)); }
  function profile(id) { return api.state().profiles[id]; }
  function snapshot(id) { return JSON.stringify(profile(id)); }
  function safe() { return api && api.current() && /^(home|who|settings|cloud)$/.test(api.current().name); }
  function applySafe() { return api && api.current() && /^(home|who|cloud)$/.test(api.current().name); }
  function status(id, message) { var a = meta.accounts[id]; if (a) a.message = message; if (ui && ui.id === id && ui.status) ui.status.textContent = message; }
  function finish(id, result) { var p = pending[id]; if (!p) return; delete pending[id]; window.clearTimeout(p.timeout); p.callback(result); }
  function rawTransport(request, callback) {
    if (!configured()) { callback({ ok: false, message: 'Online bewaren is nog niet beschikbaar.' }); return; }
    if (navigator.onLine === false) { callback({ ok: false, offline: true, message: 'Geen internet. Je voortgang blijft op dit toestel.' }); return; }
    var id = 'r' + (++sequence);
    pending[id] = { callback: callback, timeout: window.setTimeout(function () { finish(id, { ok: false, message: 'Geen bevestiging ontvangen. Je voortgang blijft op dit toestel.' }); }, 30000) };
    if (native && typeof native.request === 'function') { native.request(window.TB_CLOUD_URL, id, JSON.stringify(request)); return; }
    if (window.AndroidStore) { finish(id, { ok: false, message: 'Installeer de nieuwe APK om online te bewaren, of gebruik de webapp.' }); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', window.TB_CLOUD_URL, true); xhr.timeout = 25000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () { try { finish(id, JSON.parse(xhr.responseText)); } catch (e) { finish(id, { ok: false, message: 'Online bewaren lukt nu niet.' }); } };
    xhr.onerror = xhr.ontimeout = function () { finish(id, { ok: false, message: 'Geen verbinding. Je voortgang blijft op dit toestel.' }); };
    try { xhr.send(JSON.stringify(request)); } catch (e) { finish(id, { ok: false, message: 'Geen verbinding. Je voortgang blijft op dit toestel.' }); }
  }
  function transport(request, callback) {
    var account = null;
    for (var id in meta.accounts) if (meta.accounts.hasOwnProperty(id) && request.token && meta.accounts[id].token === request.token) account = meta.accounts[id];
    function refresh(next) {
      rawTransport({ action: 'refresh', refresh: account.refresh }, function (result) {
        if (!result.ok) { callback(result); return; }
        account.token = result.token; account.refresh = result.refresh; account.expires = result.expires;
        try { persist(); } catch (e) { callback({ ok: false, message: 'De opslag is vol. Maak een voortgangskopie.' }); return; }
        request.token = account.token; next();
      });
    }
    function send(retried) {
      rawTransport(request, function (result) {
        if (result.authExpired && account && account.refresh && !retried) refresh(function () { send(true); });
        else callback(result);
      });
    }
    if (account && account.refresh && account.expires < Date.now() + 60000) refresh(function () { send(true); });
    else send(false);
  }
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
    if (pendingLogin && applySafe()) { var login = pendingLogin; pendingLogin = null; acceptLogin(login.result, login.sourceId); return; }
    var id = api.state().current, a = meta.accounts[id];
    // Ook eerder gespeelde klimmers flushen als inmiddels een andere speler actief is.
    if (!a || !a.dirty) for (var other in meta.accounts) if (meta.accounts.hasOwnProperty(other) && meta.accounts[other].dirty && profile(other)) { id = other; a = meta.accounts[id]; break; }
    if (!a || !a.token || !profile(id)) return;
    if (a.remote && applySafe()) {
      var remembered = a.remote; a.remote = null;
      if (TBProgress.compare(profile(id), remembered.profile) <= 0) install(id, remembered.profile, remembered.revision);
      else { a.base = JSON.stringify(remembered.profile); a.revision = remembered.revision; }
    }
    captureWithoutTimer(id);
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
      if (result.ok) for (var other in meta.accounts) if (meta.accounts.hasOwnProperty(other) && other !== id && meta.accounts[other].dirty) { schedule(); break; }

    });
  }
  function captureWithoutTimer(id) { if (api && profile(id) && meta.accounts[id]) meta.accounts[id].dirty = snapshot(id) !== meta.accounts[id].base; }
  function button(label, fn) { return h('button', { class: 'btn btn-line', onclick: fn }, label); }
  function field(label, type, autocomplete) {
    var input = h('input', { class: 'name-input', type: type || 'text', 'aria-label': label, autocomplete: autocomplete || 'off', maxlength: type === 'password' ? '128' : type === 'email' ? '254' : '30' });
    if (type === 'password') input.setAttribute('minlength', '12');
    if (type !== 'password') input.setAttribute('autocapitalize', 'none');
    return { input: input, node: h('label', { class: 'cloud-field' }, [h('span', { class: 'set-label' }, label), input]) };
  }
  function acceptLogin(result, sourceId) {
    if (!result.user || !result.profile || result.user !== result.profile.id) throw new Error('Ongeldig accountantwoord.');
    var target = result.user, local = profile(target), source = sourceId && profile(sourceId), chosen = result.profile;
    if (local && TBProgress.compare(local, chosen) > 0) chosen = local;
    if (source && TBProgress.compare(source, chosen) >= 0) { chosen = clone(source); chosen.id = target; }
    suppressed = true;
    try {
      if (sourceId && sourceId !== target) api.cloudReplaceId(sourceId, chosen); else api.cloudImport(chosen, true);
      meta.accounts[target] = { user: target, username: result.username, token: result.token, refresh: result.refresh,
        expires: result.expires, revision: result.revision, base: JSON.stringify(result.profile), dirty: snapshot(target) !== JSON.stringify(result.profile), message: 'Aangemeld. Voortgang wordt gecontroleerd.' };
      if (meta.pending && meta.pending[result.username]) delete meta.pending[result.username];
      meta.lastUsername = result.username;
      persist(); api.go('cloud', { id: target }); schedule();
    } finally { suppressed = false; }
  }
  function show(root, params) {
    root.innerHTML = ''; var id = params.id || api.state().current, p = profile(id), a = meta.accounts[id];
    var content = h('div', { class: 'cloud-card' }), note = h('p', { class: 'set-note', role: 'status' });
    ui = { id: id, status: note };
    root.appendChild(h('div', { class: 'screen settings cloud' }, [h('header', { class: 'bar' }, [button('Terug', function () { api.go(p ? 'settings' : 'newPlayer'); }), h('h1', null, 'Online bewaren')]), h('div', { class: 'cloud-main' }, content)]));
    if (!configured()) { content.appendChild(h('p', null, 'Online bewaren is nog niet beschikbaar. Je voortgang blijft op dit toestel.')); return; }
    var mode = params.mode || (a && a.token ? 'account' : p ? 'register' : 'login');
    if (mode === 'reset' || mode === 'resume') {
      content.appendChild(h('h2', null, mode === 'reset' ? 'Nieuw wachtwoord kiezen' : 'Account bevestigd'));
      if (!linkSession) { content.appendChild(h('p', null, 'Deze link is niet meer geldig. Vraag een nieuwe herstelmail of meld je aan.')); return; }
      var newPassword = field('Nieuw wachtwoord', 'password', 'new-password'), confirmPassword = field('Herhaal wachtwoord', 'password', 'new-password');
      if (mode === 'reset') { content.appendChild(newPassword.node); content.appendChild(confirmPassword.node); }
      var finishButton = button(mode === 'reset' ? 'Wachtwoord opslaan' : 'Verder met dit account', function () {
        if (mode === 'reset' && (newPassword.input.value.length < 12 || newPassword.input.value !== confirmPassword.input.value)) { note.textContent = 'Gebruik minstens 12 tekens en herhaal hetzelfde wachtwoord.'; return; }
        finishButton.disabled = true;
        var request = { action: mode, token: linkSession.token };
        if (mode === 'reset') request.password = newPassword.input.value;
        newPassword.input.value = ''; confirmPassword.input.value = '';
        transport(request, function (result) {
          finishButton.disabled = false;
          if (!result.ok) { note.textContent = result.message; return; }
          if (mode === 'reset') { linkSession = null; note.textContent = result.message; finishButton.disabled = true; content.appendChild(button('Aanmelden', function () { api.go('cloud', { mode: 'login' }); })); return; }
          try {
            result.token = linkSession.token; result.refresh = linkSession.refresh; result.expires = linkSession.expires;
            var sourceId = meta.pending && meta.pending[result.username] ? meta.pending[result.username].id : null;
            acceptLogin(result, sourceId); linkSession = null;
          } catch (e) { note.textContent = 'Niet toegepast: ' + e.message; }
        });
      });
      content.appendChild(finishButton); content.appendChild(note); return;
    }
    if (a && a.token && mode === 'account') {
      content.appendChild(h('h2', null, 'Aangemeld als ' + a.username)); note.textContent = a.message || 'Je voortgang blijft ook op dit toestel bewaard.';
      content.appendChild(note);
      content.appendChild(h('p', { class: 'set-note' }, 'Op verschillende toestellen gespeeld? De meeste sterren bepalen welke versie blijft. Bij gelijkstand tellen afgeronde rondes en daarna de beheersing van de sommen.'));
      content.appendChild(button('Nu synchroniseren', sync));
      content.appendChild(button('Afmelden op dit toestel', function () {
        if (!window.confirm('Afmelden? De voortgang blijft op dit toestel. Niet-verzonden wijzigingen staan dan nog niet online.')) return;
        transport({ action: 'logout', token: a.token }, function () {}); delete meta.accounts[id]; persist(); show(root, { id: id, mode: 'login' });
      }));
      content.appendChild(button('Andere online speler toevoegen', function () { api.go('cloud', { mode: 'login' }); })); return;
    }
    content.appendChild(h('p', null, 'Met je gebruikersnaam en wachtwoord speel je verder op andere toestellen. Dit toestel kan meerdere spelers onthouden.'));
    content.appendChild(h('h2', null, mode === 'register' && p ? 'Bewaar de voortgang van ' + p.name : mode === 'recover' ? 'Wachtwoord vergeten' : 'Bestaande speler aanmelden'));
    var username = field('Gebruikersnaam', 'text', 'username'), password = field('Wachtwoord', 'password', mode === 'login' ? 'current-password' : 'new-password'), repeat = field('Herhaal wachtwoord', 'password', 'new-password'), email = field('Herstel-e-mailadres', 'email', 'email');
    if (meta.lastUsername) username.input.value = meta.lastUsername;
    content.appendChild(username.node);
    if (mode !== 'recover') content.appendChild(password.node);
    if (mode === 'register') { content.appendChild(repeat.node); content.appendChild(email.node); }
    content.appendChild(h('p', { class: 'set-note' }, mode === 'register' ? 'Gebruikersnaam: 3 tot 30 letters, cijfers, - of _. Wachtwoord: minstens 12 tekens. Elk account heeft een eigen e-mailadres voor bevestiging en herstel.' : mode === 'recover' ? 'We sturen de herstellink naar het e-mailadres dat bij dit account hoort.' : 'Gebruik je Tafelberg-account. Lokaal opgeslagen spelers blijven beschikbaar.'));
    var submit = button(mode === 'register' ? 'Account maken en bewaren' : mode === 'recover' ? 'Herstelmail versturen' : 'Aanmelden', function () {
      if (submit.disabled) return;
      var name = username.input.value.toLowerCase().replace(/^\s+|\s+$/g, '');
      if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(name)) { note.textContent = 'Controleer je gebruikersnaam.'; return; }
      if (mode !== 'recover' && !password.input.value.length) { note.textContent = 'Vul je wachtwoord in.'; return; }
      if (mode === 'register' && (!p || password.input.value.length < 12 || password.input.value !== repeat.input.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.input.value))) { note.textContent = 'Controleer het e-mailadres en gebruik twee gelijke wachtwoorden van minstens 12 tekens.'; return; }
      var request = { action: mode, username: name, device: meta.device };
      if (mode !== 'recover') request.password = password.input.value;
      if (mode === 'register') { request.email = email.input.value; request.profile = clone(p); }
      var sourceId = mode === 'register' ? id : meta.pending && meta.pending[name] ? meta.pending[name].id : null;
      if (mode === 'login' && sourceId && profile(sourceId)) request.profile = clone(profile(sourceId));
      password.input.value = ''; repeat.input.value = ''; submit.disabled = true; note.textContent = 'Even verbinden…';
      transport(request, function (result) {
        submit.disabled = false;
        if (!result.ok) { note.textContent = result.message || 'Aanmelden lukt nu niet.'; return; }
        if (mode === 'recover') { note.textContent = result.message; return; }
        if (result.confirmation) {
          meta.pending = meta.pending || {}; meta.pending[name] = { id: id }; meta.lastUsername = name; persist(); note.textContent = result.message;
          content.appendChild(button('Account bevestigd? Aanmelden', function () { api.go('cloud', { mode: 'login' }); })); return;
        }
        try { if (!applySafe()) { pendingLogin = { result: result, sourceId: sourceId }; schedule(); } else acceptLogin(result, sourceId); } catch (e) { note.textContent = 'Aanmelding ontvangen, maar lokaal bewaren lukte niet: ' + e.message; }
      });
    });
    content.appendChild(submit); content.appendChild(note);
    if (mode !== 'login') content.appendChild(button('Ik heb al een account', function () { api.go('cloud', { mode: 'login' }); }));
    if (mode === 'login') {
      content.appendChild(button('Wachtwoord vergeten', function () { api.go('cloud', { mode: 'recover' }); }));
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
      try {
        var hash = window.location.hash.substring(1).split('&'), values = {};
        for (var hi = 0; hi < hash.length; hi++) { var pair = hash[hi].split('='); values[decodeURIComponent(pair[0])] = decodeURIComponent(pair.slice(1).join('=')); }
        if (values.access_token) {
          linkSession = { token: values.access_token, refresh: values.refresh_token, expires: Date.now() + Number(values.expires_in || 3600) * 1000 };
          window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
          window.setTimeout(function () { api.go('cloud', { mode: values.type === 'recovery' ? 'reset' : 'resume' }); }, 0);
        }
      } catch (e2) { linkSession = null; }
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
