/* ES5. Eén beheerde account kan meerdere klimmers op meerdere toestellen bevatten. */
(function () {
  'use strict';
  var api, h, storageKey = 'tafelberg.supabase.v2';
  var meta = { sessions: {}, links: {}, pending: {}, creates: {}, device: '' };
  var native = window.AndroidSync, pending = {}, sequence = 0, timer = null, busy = false, suppressed = false;
  var ui = null, pendingLogin = null, pendingTransfers = [], pendingRows = {}, pendingLists = {}, linkSession = null;
  function configured() { return /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/tafelberg$/.test(window.TB_CLOUD_URL || ''); }
  function random() {
    var a = new Uint8Array(32), out = '';
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Veilig aanmelden is op dit toestel niet beschikbaar.');
    window.crypto.getRandomValues(a);
    for (var i = 0; i < a.length; i++) out += ('0' + a[i].toString(16)).slice(-2);
    return out;
  }
  function clone(p) { return JSON.parse(JSON.stringify(p)); }
  // Postgres jsonb verandert de sleutelvolgorde; vergelijk inhoud in vaste volgorde.
  function snapshot(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    var out = [], i, keys;
    if (Array.isArray(value)) { for (i = 0; i < value.length; i++) out.push(snapshot(value[i])); return '[' + out.join(',') + ']'; }
    keys = Object.keys(value).sort();
    for (i = 0; i < keys.length; i++) out.push(JSON.stringify(keys[i]) + ':' + snapshot(value[keys[i]]));
    return '{' + out.join(',') + '}';
  }
  function profile(id) { return api.state().profiles[id]; }
  function safe() { return api && api.current() && /^(home|who|cloud)$/.test(api.current().name); }
  function persist() { window.localStorage.setItem(storageKey, JSON.stringify(meta)); }
  function schedule() { if (timer) window.clearTimeout(timer); timer = window.setTimeout(sync, 2500); }
  function note(account, message) {
    if (meta.sessions[account]) meta.sessions[account].message = message;
    if (ui && ui.account === account) ui.note.textContent = message;
  }
  function finish(id, result) { var p = pending[id]; if (!p) return; delete pending[id]; window.clearTimeout(p.timeout); p.callback(result); }
  function raw(request, callback) {
    if (!configured()) { callback({ ok: false, message: 'Online bewaren is nog niet beschikbaar.' }); return; }
    if (navigator.onLine === false) { callback({ ok: false, message: 'Geen internet. Je voortgang blijft op dit toestel.' }); return; }
    var id = 'r' + (++sequence);
    pending[id] = { callback: callback, timeout: window.setTimeout(function () { finish(id, { ok: false, message: 'Geen bevestiging ontvangen. Je voortgang blijft op dit toestel.' }); }, 30000) };
    if (native && typeof native.request === 'function') { native.request(window.TB_CLOUD_URL, id, JSON.stringify(request)); return; }
    if (window.AndroidStore) { finish(id, { ok: false, message: 'Installeer de nieuwe APK om online te bewaren, of gebruik de webapp.' }); return; }
    var xhr = new XMLHttpRequest(); xhr.open('POST', window.TB_CLOUD_URL, true); xhr.timeout = 25000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () { try { finish(id, JSON.parse(xhr.responseText)); } catch (e) { finish(id, { ok: false, message: 'Ongeldig antwoord. Je voortgang blijft lokaal.' }); } };
    xhr.onerror = xhr.ontimeout = function () { finish(id, { ok: false, message: 'Geen verbinding. Je voortgang blijft op dit toestel.' }); };
    try { xhr.send(JSON.stringify(request)); } catch (e) { finish(id, { ok: false, message: 'Geen verbinding. Je voortgang blijft op dit toestel.' }); }
  }
  function transport(request, callback) {
    var session = null;
    for (var a in meta.sessions) if (meta.sessions.hasOwnProperty(a) && request.token && meta.sessions[a].token === request.token) session = meta.sessions[a];
    function refresh(next) {
      raw({ action: 'refresh', refresh: session.refresh }, function (r) {
        if (!r.ok) { callback(r); return; }
        session.token = r.token; session.refresh = r.refresh; session.expires = r.expires;
        try { persist(); } catch (e) { callback({ ok: false, message: 'De opslag is vol. Maak een voortgangskopie.' }); return; }
        request.token = session.token; next();
      });
    }
    function send(retried) { raw(request, function (r) { if (r.authExpired && session && session.refresh && !retried) refresh(function () { send(true); }); else callback(r); }); }
    if (session && session.refresh && session.expires < Date.now() + 60000) refresh(function () { send(true); }); else send(false);
  }
  function capture() {
    if (!api || suppressed) return;
    for (var id in meta.links) if (meta.links.hasOwnProperty(id)) {
      if (!profile(id)) delete meta.links[id]; else meta.links[id].dirty = snapshot(profile(id)) !== meta.links[id].base;
    }
    try { persist(); } catch (e) { /* De afzonderlijke spelopslag blijft bestaan. */ }
    schedule();
  }
  function install(row, account, select) {
    if (!row || !row.profile || row.user !== row.profile.id || row.account && row.account !== account) throw new Error('Ongeldige klimmer.');
    var remote = api.cloudNormalize(row.profile), local = profile(row.user), old = meta.links[row.user];
    if (old && old.account !== account) throw new Error('Deze klimmer hoort bij een ander account.');
    var keep = local && (TBProgress.compare(local, remote) > 0 || (old && old.dirty && TBProgress.compare(local, remote) === 0));
    suppressed = true;
    try {
      if (!keep) api.cloudImport(remote, !!select); else if (select) api.cloudSelect(row.user);
      meta.links[row.user] = { account: account, revision: row.revision, base: snapshot(remote), dirty: snapshot(profile(row.user)) !== snapshot(remote), message: snapshot(profile(row.user)) === snapshot(remote) ? 'Online bewaard.' : 'Voortgang wacht op verzending.' };
      persist();
    } finally { suppressed = false; }
  }
  function absorb(result, account) {
    if (!result || result.account !== account || !Array.isArray(result.profiles) || result.profiles.length > 50) throw new Error('Ongeldige accountgegevens.');
    for (var i = 0; i < result.profiles.length; i++) install(result.profiles[i], account, false);
    meta.sessions[account].checked = Date.now(); persist();
  }
  function redraw(account) { if (api.current().name === 'cloud' && ui && ui.account === account) show(document.getElementById('app'), { mode: 'account', account: account, cached: true }); }
  function refreshAccount(account) {
    var session = meta.sessions[account]; if (!session || busy) return;
    busy = true; note(account, 'Klimmers ophalen…');
    transport({ action: 'list', token: session.token }, function (r) {
      busy = false; if (meta.sessions[account] !== session) return;
      try {
        if (!r.ok) note(account, r.message);
        else if (safe()) { absorb(r, account); note(account, 'Klimmers bijgewerkt.'); redraw(account); }
        else pendingLists[account] = r;
      } catch (e) { note(account, 'Niet toegepast: ' + e.message); }
      schedule();
    });
  }
  function sourceIds() {
    var out = [], ids = api.state().order;
    for (var i = 0; i < ids.length; i++) if (profile(ids[i]) && !meta.links[ids[i]]) out.push(ids[i]);
    return out;
  }
  function accountIds(account) {
    var out = [], ids = api.state().order;
    for (var i = 0; i < ids.length; i++) if (meta.links[ids[i]] && meta.links[ids[i]].account === account && profile(ids[i])) out.push(ids[i]);
    return out;
  }
  function label(p) { var rank = TBProgress.rank(p); return p.name + ': ' + rank[0] + ' sterren, ' + rank[1] + ' rondes'; }
  function button(text, fn) { return h('button', { class: 'btn btn-line', onclick: fn }, text); }
  function field(text, type, autocomplete) {
    var input = h('input', { class: 'name-input', type: type || 'text', 'aria-label': text, autocomplete: autocomplete || 'off', maxlength: type === 'password' ? '128' : type === 'email' ? '254' : '30' });
    if (type !== 'password') input.setAttribute('autocapitalize', 'none');
    return { input: input, node: h('label', { class: 'cloud-field' }, [h('span', { class: 'set-label' }, text), input]) };
  }
  function chooser(text, ids, empty, initial) {
    var select = h('select', { class: 'name-input', 'aria-label': text });
    select.appendChild(h('option', { value: '' }, empty));
    for (var i = 0; i < ids.length; i++) select.appendChild(h('option', { value: ids[i] }, label(profile(ids[i]))));
    select.value = ids.indexOf(initial) >= 0 ? initial : '';
    return { input: select, node: h('label', { class: 'cloud-field' }, [h('span', { class: 'set-label' }, text), select]) };
  }
  function finishTransfer(result, sourceId, createKey) {
    var account = result.account, source = sourceId && profile(sourceId), local = profile(result.user), remote = api.cloudNormalize(result.profile), chosen = remote, useSource = false;
    if (!meta.sessions[account]) return;
    if (sourceId && meta.links[sourceId]) throw new Error('Deze lokale klimmer is al gekoppeld.');
    if (local && TBProgress.compare(local, chosen) > 0) chosen = local;
    if (source && TBProgress.compare(source, chosen) >= 0) { chosen = clone(source); chosen.id = result.user; useSource = true; }
    suppressed = true;
    try {
      // Eerst bevestigd door de server en duurzaam lokaal bewaren, dan pas de losse bron vervangen.
      if (useSource) api.cloudReplaceId(sourceId, chosen); else api.cloudImport(chosen, true);
      meta.links[result.user] = { account: account, revision: result.revision, base: snapshot(remote), dirty: snapshot(profile(result.user)) !== snapshot(remote), message: 'Online bewaard.' };
      persist();
    } finally { suppressed = false; }
    if (createKey) { delete meta.creates[createKey]; persist(); }
    note(account, source && !useSource ? 'De accountklimmer staat verder. Die versie blijft behouden; je lokale klimmer is apart bewaard.' : 'De klimmer is toegevoegd. De verste voortgang blijft bewaard.');
    redraw(account); schedule();
  }
  function transfer(account, sourceId, targetId, emptyProfile) {
    var session = meta.sessions[account];
    if (!session || busy) { note(account, 'Even wachten en opnieuw proberen.'); return; }
    var source = sourceId && profile(sourceId), target = targetId && meta.links[targetId];
    if (sourceId && (!source || meta.links[sourceId])) { note(account, 'Kies een losse lokale klimmer.'); return; }
    if (targetId && (!target || target.account !== account)) { note(account, 'Kies een klimmer uit dit account.'); return; }
    var candidate = clone(source || emptyProfile), key = account + ':' + (sourceId || 'new:' + candidate.name), create = !targetId;
    var request = { action: create ? 'create' : 'write', token: session.token, profile: candidate, player: targetId || null, revision: target ? target.revision : 0 };
    if (create) {
      try { if (!meta.creates[key]) meta.creates[key] = { id: 'c' + random() }; request.changeId = meta.creates[key].id; persist(); }
      catch (e) { note(account, 'Maak een kopie: de opslag van dit toestel is vol.'); return; }
    }
    busy = true; note(account, 'Voortgang verzenden…');
    transport(request, function (r) {
      busy = false; if (meta.sessions[account] !== session) return;
      if (!r.ok) { note(account, r.message || 'Niet verzonden. De lokale voortgang blijft behouden.'); return; }
      try {
        if (r.account !== account) throw new Error('Ongeldig accountantwoord.');
        if (safe()) finishTransfer(r, sourceId, create ? key : null); else pendingTransfers.push({ result: r, source: sourceId, key: create ? key : null });
        persist(); schedule();
      } catch (e) { note(account, 'Niet toegepast: ' + e.message); }
    });
  }
  function acceptAccount(result, sourceId) {
    if (!safe()) { pendingLogin = { result: result, source: sourceId }; schedule(); return; }
    if (!result.account || !/^[a-f0-9-]{36}$/.test(result.account)) throw new Error('Ongeldig accountantwoord.');
    var account = result.account;
    meta.sessions[account] = { username: result.username, token: result.token, refresh: result.refresh, expires: result.expires, checked: Date.now(), message: 'Aangemeld.' };
    absorb(result, account); meta.lastUsername = result.username;
    if (meta.pending[result.username]) delete meta.pending[result.username]; persist();
    api.go('cloud', { mode: 'account', account: account, cached: true });
    // Bij registratie heeft de gebruiker deze eerste upload al uitdrukkelijk gekozen.
    if (sourceId && profile(sourceId) && !meta.links[sourceId]) transfer(account, sourceId, null);
    else schedule();
  }
  function sync() {
    if (!api || busy || !configured() || navigator.onLine === false) return;
    if (safe()) {
      if (pendingLogin) { var login = pendingLogin; pendingLogin = null; acceptAccount(login.result, login.source); return; }
      if (pendingTransfers.length) { var item = pendingTransfers.shift(); finishTransfer(item.result, item.source, item.key); return; }
      for (var account in pendingLists) if (pendingLists.hasOwnProperty(account) && meta.sessions[account]) { var list = pendingLists[account]; delete pendingLists[account]; absorb(list, account); }
      for (var id in pendingRows) if (pendingRows.hasOwnProperty(id) && meta.links[id]) { var row = pendingRows[id]; delete pendingRows[id]; install(row, meta.links[id].account, false); }
    }
    var selected = api.state().current, link = meta.links[selected];
    for (var pid in meta.links) if (meta.links.hasOwnProperty(pid) && profile(pid) && meta.links[pid].dirty) { selected = pid; link = meta.links[pid]; break; }
    if (!link || !profile(selected) || !meta.sessions[link.account]) return;
    var session = meta.sessions[link.account], writing = snapshot(profile(selected)) !== link.base;
    if (!writing && !safe()) return;
    if (!writing && Date.now() - (session.checked || 0) > 60000) { refreshAccount(link.account); return; }
    var request = { action: writing ? 'write' : 'read', token: session.token, player: selected, revision: link.revision };
    if (writing) request.profile = clone(profile(selected));
    busy = true; link.message = writing ? 'Voortgang bewaren…' : 'Voortgang controleren…';
    transport(request, function (r) {
      busy = false; if (meta.sessions[link.account] !== session || meta.links[selected] !== link || !profile(selected)) return;
      try {
        if (!r.ok) { link.message = r.message; note(link.account, r.message); }
        else if (safe()) { install(r, link.account, false); note(link.account, 'Online bewaard.'); }
        else {
          var remote = api.cloudNormalize(r.profile);
          if (snapshot(remote) === snapshot(profile(selected))) { link.base = snapshot(remote); link.dirty = false; link.revision = r.revision; link.message = 'Online bewaard.'; }
          else pendingRows[selected] = r;
        }
        persist();
      } catch (e) { note(link.account, 'Niet toegepast: ' + e.message); }
      if (r.ok) for (var next in meta.links) if (meta.links.hasOwnProperty(next) && meta.links[next].dirty) { schedule(); break; }
    });
  }
  function show(root, params) {
    root.innerHTML = '';
    var current = api.state().current, linked = meta.links[current], account = params.account || (linked && linked.account), s;
    if (!account) for (var accountKey in meta.sessions) if (meta.sessions.hasOwnProperty(accountKey)) { account = accountKey; break; }
    s = account && meta.sessions[account];
    var mode = params.mode || (s ? 'account' : current ? 'register' : 'login');
    var content = h('div', { class: 'cloud-card' }), status = h('p', { class: 'set-note', role: 'status' });
    ui = { account: account, note: status };
    root.appendChild(h('div', { class: 'screen settings cloud' }, [h('header', { class: 'bar' }, [button('Terug', function () { api.go(api.state().current ? 'settings' : 'newPlayer'); }), h('h1', null, 'Online bewaren')]), h('div', { class: 'cloud-main' }, content)]));
    if (!configured()) { content.appendChild(h('p', null, 'Online bewaren is nog niet beschikbaar. Je voortgang blijft op dit toestel.')); return; }
    if (mode === 'account' && s) {
      content.appendChild(h('h2', null, 'Account van ' + s.username));
      content.appendChild(h('p', null, 'Eén account, meerdere klimmers. Elke klimmer heeft eigen tafels, sterren en voortgang.'));
      status.textContent = s.message || 'Je voortgang blijft ook lokaal bewaard.'; content.appendChild(status);
      var ids = accountIds(account);
      content.appendChild(h('h3', null, 'Klimmers in dit account'));
      if (!ids.length) content.appendChild(h('p', null, 'Voeg je eerste klimmer toe of neem lokale voortgang mee.'));
      for (var i = 0; i < ids.length; i++) (function (id) {
        content.appendChild(h('p', { class: 'set-note' }, label(profile(id))));
        content.appendChild(button('Spelen met ' + profile(id).name, function () { api.cloudSelect(id); api.go('home'); }));
      })(ids[i]);
      var name = field('Naam van nieuwe klimmer'); name.input.maxLength = 20;
      content.appendChild(h('h3', null, 'Nieuwe klimmer')); content.appendChild(name.node);
      content.appendChild(button('Nieuwe klimmer maken', function () {
        var n = name.input.value.replace(/^\s+|\s+$/g, ''); if (!n) { status.textContent = 'Vul een naam in.'; return; }
        transfer(account, null, null, api.cloudNewProfile(n));
      }));
      var sources = sourceIds();
      if (sources.length) {
        content.appendChild(h('h3', null, 'Lokale voortgang meenemen'));
        var source = chooser('Lokale klimmer meenemen', sources, 'Kies een lokale klimmer', null);
        var target = chooser('Opslaan als', ids, 'Nieuwe klimmer in dit account', null);
        content.appendChild(source.node); content.appendChild(target.node);
        content.appendChild(h('p', { class: 'set-note' }, 'Kies bij koppelen aan een bestaande klimmer dezelfde persoon. Alleen de verste volledige voortgang blijft behouden; sterren worden niet opgeteld.'));
        content.appendChild(button('Voortgang toevoegen', function () { if (!source.input.value) { status.textContent = 'Kies eerst een lokale klimmer.'; return; } transfer(account, source.input.value, target.input.value || null); }));
      }
      content.appendChild(button('Klimmers bijwerken', function () { refreshAccount(account); }));
      content.appendChild(button('Ander account aanmelden', function () { api.go('cloud', { mode: 'login' }); }));
      content.appendChild(button('Afmelden op dit toestel', function () {
        if (!window.confirm('Afmelden voor dit account? Alle klimmers blijven lokaal beschikbaar. Nog niet verzonden voortgang staat dan niet online.')) return;
        transport({ action: 'logout', token: s.token }, function () {});
        delete meta.sessions[account];
        for (var id in meta.links) if (meta.links.hasOwnProperty(id) && meta.links[id].account === account) delete meta.links[id];
        persist(); api.go('cloud', { mode: 'login' });
      }));
      if (!params.cached) refreshAccount(account);
      return;
    }
    if (mode === 'reset' || mode === 'resume') {
      content.appendChild(h('h2', null, mode === 'reset' ? 'Nieuw wachtwoord kiezen' : 'Account bevestigd'));
      if (!linkSession) { content.appendChild(h('p', null, 'Deze link is niet meer geldig. Vraag een nieuwe herstelmail of meld je aan.')); return; }
      var password = field('Nieuw wachtwoord', 'password', 'new-password'), repeat = field('Herhaal wachtwoord', 'password', 'new-password');
      if (mode === 'reset') { content.appendChild(password.node); content.appendChild(repeat.node); }
      var finishButton = button(mode === 'reset' ? 'Wachtwoord opslaan' : 'Verder met dit account', function () {
        if (mode === 'reset' && (password.input.value.length < 12 || password.input.value !== repeat.input.value)) { status.textContent = 'Gebruik twee gelijke wachtwoorden van minstens 12 tekens.'; return; }
        finishButton.disabled = true; var request = { action: mode, token: linkSession.token };
        if (mode === 'reset') request.password = password.input.value; password.input.value = ''; repeat.input.value = '';
        transport(request, function (r) {
          finishButton.disabled = false; if (!r.ok) { status.textContent = r.message; return; }
          if (mode === 'reset') { linkSession = null; status.textContent = r.message; finishButton.disabled = true; content.appendChild(button('Aanmelden', function () { api.go('cloud', { mode: 'login' }); })); return; }
          try {
            r.token = linkSession.token; r.refresh = linkSession.refresh; r.expires = linkSession.expires;
            var remembered = meta.pending[r.username]; acceptAccount(r, remembered && remembered.source); linkSession = null;
          } catch (e) { status.textContent = 'Niet toegepast: ' + e.message; }
        });
      });
      content.appendChild(finishButton); content.appendChild(status); return;
    }
    content.appendChild(h('h2', null, mode === 'register' ? 'Een account voor je klimmers' : mode === 'recover' ? 'Wachtwoord vergeten' : 'Account aanmelden'));
    content.appendChild(h('p', null, 'Een ouderaccount kan meerdere klimmers op verschillende toestellen onthouden. De kinderen hebben geen eigen e-mailadres nodig.'));
    var username = field('Gebruikersnaam', 'text', 'username'), pass = field('Wachtwoord', 'password', mode === 'login' ? 'current-password' : 'new-password');
    var confirmPass = field('Herhaal wachtwoord', 'password', 'new-password'), email = field('Herstel-e-mailadres', 'email', 'email');
    if (meta.lastUsername) username.input.value = meta.lastUsername;
    content.appendChild(username.node); if (mode !== 'recover') content.appendChild(pass.node);
    var firstSource = null;
    if (mode === 'register') {
      content.appendChild(confirmPass.node); content.appendChild(email.node);
      firstSource = chooser('Voortgang bij account maken', sourceIds(), 'Nog geen lokale voortgang meenemen', current); content.appendChild(firstSource.node);
      content.appendChild(h('p', { class: 'set-note' }, 'Kies eventueel je eerste lokale klimmer. Na e-mailbevestiging wordt die toegevoegd. Andere klimmers kun je daarna meenemen.'));
    }
    var submit = button(mode === 'register' ? 'Account maken en bewaren' : mode === 'recover' ? 'Herstelmail versturen' : 'Aanmelden', function () {
      if (submit.disabled) return;
      var u = username.input.value.toLowerCase().replace(/^\s+|\s+$/g, '');
      if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(u) || u === 'constructor' || u === 'prototype') { status.textContent = 'Gebruik 3 tot 30 letters, cijfers, - of _.'; return; }
      if (mode !== 'recover' && !pass.input.value.length) { status.textContent = 'Vul je wachtwoord in.'; return; }
      if (mode === 'register' && (pass.input.value.length < 12 || pass.input.value !== confirmPass.input.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.input.value))) { status.textContent = 'Controleer je e-mailadres en gebruik twee gelijke wachtwoorden van minstens 12 tekens.'; return; }
      var source = mode === 'register' ? firstSource.input.value || null : meta.pending[u] && meta.pending[u].source;
      var request = { action: mode, username: u };
      if (mode !== 'recover') request.password = pass.input.value;
      if (mode === 'register') request.email = email.input.value;
      pass.input.value = ''; confirmPass.input.value = ''; submit.disabled = true; status.textContent = 'Even verbinden…';
      transport(request, function (r) {
        submit.disabled = false; if (!r.ok) { status.textContent = r.message || 'Aanmelden lukt nu niet.'; return; }
        if (mode === 'recover') { status.textContent = r.message; return; }
        if (r.confirmation) { meta.pending[u] = { source: source }; meta.lastUsername = u; persist(); status.textContent = r.message; content.appendChild(button('Account bevestigd? Aanmelden', function () { api.go('cloud', { mode: 'login' }); })); return; }
        try { acceptAccount(r, source); } catch (e) { status.textContent = 'Niet toegepast: ' + e.message; }
      });
    });
    content.appendChild(submit); content.appendChild(status);
    if (mode !== 'login') content.appendChild(button('Ik heb al een account', function () { api.go('cloud', { mode: 'login' }); }));
    if (mode === 'login') { content.appendChild(button('Wachtwoord vergeten', function () { api.go('cloud', { mode: 'recover' }); })); content.appendChild(button('Nieuw account maken', function () { api.go('cloud', { mode: 'register' }); })); }
  }
  window.TBCloud = {
    configured: configured,
    linked: function (id) { return !!meta.links[id]; },
    detach: function (id) { delete meta.links[id]; persist(); },
    init: function (app, dom) {
      api = app; h = dom;
      try { var saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null'); if (saved && saved.sessions && saved.links) meta = saved; meta.pending = meta.pending || {}; meta.creates = meta.creates || {}; if (!meta.device) meta.device = random(); persist(); }
      catch (e) { meta = { sessions: {}, links: {}, pending: {}, creates: {}, device: '' }; }
      try {
        var parts = location.hash.substring(1).split('&'), values = {};
        for (var i = 0; i < parts.length; i++) { var pair = parts[i].split('='); values[decodeURIComponent(pair[0])] = decodeURIComponent(pair.slice(1).join('=')); }
        if (values.access_token) {
          linkSession = { token: values.access_token, refresh: values.refresh_token, expires: Date.now() + Number(values.expires_in || 3600) * 1000 };
          history.replaceState(history.state, '', location.pathname + location.search);
          window.setTimeout(function () { api.go('cloud', { mode: values.type === 'recovery' ? 'reset' : 'resume' }); }, 0);
        }
      } catch (e2) { linkSession = null; }
      window.addEventListener('online', schedule, false); window.setInterval(function () { if (safe()) sync(); }, 60000);
    },
    saved: capture,
    screen: function () { if (api.current().name !== 'cloud') ui = null; schedule(); },
    render: show,
    nativeReply: finish,
    sync: sync,
    status: function (id) { var link = meta.links[id]; return link ? link.message || 'Deze klimmer wordt online bewaard.' : 'Bewaar deze klimmer bij een account met meerdere klimmers.'; }
  };
}());
