/* Geen SDK of beheersleutel in de browser. Auth blijft volledig bij Supabase. */
export function createHandler(config, fetcher = fetch) {
  const site = config.site || 'https://robinvandenbroecke.github.io/tafelberg/';
  const origin = new URL(site).origin;
  const allowed = new Set([origin, 'null', ...(config.testOrigins || [])]);
  const url = config.url, anon = config.anonKey, service = config.serviceKey;
  async function call(path, body, token, admin = false, method = 'POST') {
    const response = await fetcher(url + path, {
      method, headers: { apikey: admin ? service : anon, Authorization: 'Bearer ' + (admin ? service : token || anon), 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000)
    });
    let result; try { result = await response.json(); } catch { result = {}; }
    return { ok: response.ok, status: response.status, data: result };
  }
  async function limit(key, max, seconds) {
    const hashed = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))).map(n => n.toString(16).padStart(2, '0')).join('');
    const r = await call('/rest/v1/rpc/tb_rate_limit', { wanted: hashed, max_attempts: max, seconds }, null, true);
    return r.ok && r.data === true;
  }
  function session(data) { return { token: data.access_token, refresh: data.refresh_token, expires: Date.now() + data.expires_in * 1000 }; }
  async function progress(token, candidate = null, revision = 0, player = null, createNew = false, createKey = null, baseProfile = null) {
    const r = await call('/rest/v1/rpc/tb_sync', { candidate, base_revision: revision, requested_profile: player, create_new: createNew, request_key: createKey, base_profile: baseProfile }, token);
    if (!r.ok) return { ok: false, message: r.status === 401 ? 'Meld je opnieuw aan.' : 'Voortgang kon niet worden bewaard. Je lokale voortgang blijft behouden.', authExpired: r.status === 401 };
    return r.data;
  }
  async function list(token) {
    const r = await call('/rest/v1/rpc/tb_list_profiles', {}, token);
    if (!r.ok) return { ok: false, authExpired: r.status === 401, message: 'Klimmers ophalen lukt nu niet.' };
    const user = await call('/auth/v1/user', null, token, false, 'GET');
    if (!user.ok) return { ok: false, authExpired: true, message: 'Meld je opnieuw aan.' };
    return { ...r.data, email: user.data.email || '' };
  }
  return async function handler(req) {
    const requestOrigin = req.headers.get('origin');
    const cors = { 'Access-Control-Allow-Origin': requestOrigin && allowed.has(requestOrigin) ? requestOrigin : origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'content-type,authorization,apikey', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
    function reply(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: cors }); }
    if (requestOrigin && !allowed.has(requestOrigin)) return reply({ ok: false, message: 'Niet toegestaan.' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply({ ok: false, message: 'Gebruik POST.' }, 405);
    if (!url || !anon || !service) return reply({ ok: false, message: 'Online bewaren is nog niet ingesteld.' }, 503);
    try {
      const raw = await req.text();
      if (raw.length > 120000) return reply({ ok: false, message: 'Aanvraag te groot.' }, 413);
      const input = JSON.parse(raw, (k, v) => {
        if (['__proto__', 'constructor', 'prototype', 'hasOwnProperty'].includes(k)) throw Error('input');
        return v;
      });
      if (!input || typeof input !== 'object') return reply({ ok: false, message: 'Ongeldige aanvraag.' }, 400);
      const action = input.action;
      if (!['register','login','recover','refresh','resume','reset','logout','read','write','list','create'].includes(action)) return reply({ ok: false, message: 'Onbekende aanvraag.' }, 400);
      // Supabase zet het bronadres; gebruikersnamen en IP's worden alleen gehasht opgeslagen.
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (!await limit('ip:' + ip, 120, 60)) return reply({ ok: false, message: 'Even wachten en opnieuw proberen.' }, 429);
      if (['register','login','recover'].includes(action)) {
        const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
        const byEmail = typeof input.email === 'string';
        const suppliedEmail = byEmail ? input.email.trim().toLowerCase() : '';
        if (byEmail && (suppliedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail))) return reply({ ok: false, message: 'Vul een geldig e-mailadres in.' }, 400);
        if ((!byEmail || action === 'register' && username) && (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(username) || ['constructor','prototype'].includes(username))) return reply({ ok: false, message: 'Gebruik 3 tot 30 letters, cijfers, - of _.' }, 400);
        if (!await limit(action + ':ip:' + ip, action === 'login' ? 30 : 5, action === 'login' ? 900 : 3600)
          || !await limit(action + ':identity:' + (byEmail ? suppliedEmail : username), action === 'login' ? 10 : 3, 900)) return reply({ ok: false, message: 'Te vaak geprobeerd. Probeer later opnieuw.' }, 429);
        if (action !== 'recover' && (typeof input.password !== 'string' || input.password.length < (action === 'register' ? 8 : 1) || input.password.length > 128)) return reply({ ok: false, message: 'Gebruik een wachtwoord van 8 tot 128 tekens.' }, 400);
        if (action === 'register') {
          const email = suppliedEmail;
          if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ ok: false, message: 'Vul een geldig e-mailadres in.' }, 400);
          const r = await call('/auth/v1/signup?redirect_to=' + encodeURIComponent(site), {
            email, password: input.password, data: username ? { username } : {}, ...(input.captcha ? { gotrue_meta_security: { captcha_token: input.captcha } } : {})
          });
          if (!r.ok) return reply({ ok: false, message: 'Account maken lukt niet. Controleer de gegevens of kies Aanmelden als je al een account hebt.' });
          if (!r.data.access_token) return reply({ ok: true, confirmation: true, message: 'Bevestig je account via de e-mail. Meld je daarna aan.' });
          return reply({ ...await list(r.data.access_token), ...session(r.data) });
        }
        // Oudere APK's blijven tijdelijk ook met hun bestaande gebruikersnaam werken.
        const lookup = byEmail ? null : await call('/rest/v1/rpc/tb_lookup_username', { wanted: username }, null, true);
        const email = byEmail ? suppliedEmail : lookup.ok && typeof lookup.data === 'string' ? lookup.data : null;
        if (action === 'recover') {
          if (email) await call('/auth/v1/recover?redirect_to=' + encodeURIComponent(site), { email });
          return reply({ ok: true, message: 'Als dit account bestaat, ontvang je een herstelmail.' });
        }
        // Ook onbekende gebruikers door Auth laten controleren; de fout blijft gelijk.
        const r = await call('/auth/v1/token?grant_type=password', { email: email || 'unknown-' + crypto.randomUUID() + '@invalid.example', password: input.password });
        if (!r.ok || !email) return reply({ ok: false, message: 'Aanmelden lukt niet. Controleer e-mailadres, wachtwoord en e-mailbevestiging.' });
        return reply({ ...await list(r.data.access_token), ...session(r.data) });
      }
      if (action === 'refresh') {
        if (typeof input.refresh !== 'string' || input.refresh.length > 4096) return reply({ ok: false, authExpired: true, message: 'Meld je opnieuw aan.' });
        const r = await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: input.refresh });
        return reply(r.ok ? { ok: true, ...session(r.data) } : { ok: false, authExpired: true, message: 'Meld je opnieuw aan. Je voortgang blijft lokaal bewaard.' });
      }
      if (typeof input.token !== 'string' || input.token.length > 8192) return reply({ ok: false, authExpired: true, message: 'Meld je opnieuw aan.' }, 401);
      const verified = await call('/auth/v1/user', null, input.token, false, 'GET');
      if (!verified.ok || !verified.data.id) return reply({ ok: false, authExpired: true, message: 'Meld je opnieuw aan.' }, 401);
      if (action === 'logout') { await call('/auth/v1/logout?scope=local', {}, input.token); return reply({ ok: true }); }
      if (action === 'reset') {
        if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) return reply({ ok: false, message: 'Gebruik 8 tot 128 tekens.' }, 400);
        const r = await call('/auth/v1/user', { password: input.password }, input.token, false, 'PUT');
        return reply(r.ok ? { ok: true, message: 'Wachtwoord gewijzigd. Meld je opnieuw aan in Tafelberg.' } : { ok: false, message: 'Herstellen lukt niet. Vraag een nieuwe herstelmail aan.' });
      }
      if (action === 'resume' || action === 'list') return reply(await list(input.token));
      if (action !== 'create' && (typeof input.player !== 'string' || !/^p[a-zA-Z0-9]{1,100}$/.test(input.player))) return reply({ ok: false, message: 'Kies een klimmer.' }, 400);
      return reply(await progress(input.token, action === 'write' || action === 'create' ? input.profile || null : null,
        Number.isSafeInteger(input.revision) ? input.revision : 0, input.player || null, action === 'create', input.changeId || null, input.baseProfile || null));
    } catch {
      // Geen wachtwoorden, tokens of interne foutmeldingen in logs of antwoorden.
      return reply({ ok: false, message: 'Online bewaren lukt nu niet. Je lokale voortgang blijft behouden.' }, 503);
    }
  };
}
if (typeof Deno !== 'undefined') {
  Deno.serve(createHandler({ url: Deno.env.get('SUPABASE_URL'), anonKey: Deno.env.get('SUPABASE_ANON_KEY'), serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), site: Deno.env.get('TAFELBERG_SITE_URL') }));
}
