/* Regressies voor handmatige tafelkeuze, automatische uitbreiding en sprint. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve('app/src/main/assets/www');
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const opts = { headless: true };
    if (process.env.TB_LITE_BROWSER) {
      const pkg = require('@sparticuz/chromium'), lite = pkg.default || pkg;
      opts.executablePath = await lite.executablePath(); opts.args = lite.args;
    }
    browser = await chromium.launch(opts);
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', err => errors.push(err.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByRole('textbox', { name: 'Naam', exact: true }).fill('Klimmer');
    await page.getByRole('button', { name: 'Start de klim' }).click();
    const seed = await page.evaluate(() => Tafelberg.exportBackup());
    async function reset() {
      await page.evaluate(raw => {
        Tafelberg.restoreBackup(raw);
        const p = Tafelberg.profile(); p.settings.auto = true; p.settings.sound = false; p.settings.voice = false;
        p.settings.pace = 'gewoon';
        for (const t of p.settings.tables) for (let a = 1; a <= 10; a++) p.facts[a + 'x' + t] = { b: 4, n: 5, c: 5, due: 0, last: 0, rt: 1500 };
        Tafelberg.save(); Tafelberg.go('settings');
      }, seed);
    }
    await reset();
    await page.getByRole('button', { name: 'Tafel van 2', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Tafel van 2', exact: true }).getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => Tafelberg.go('practice', { from: 'home' }));
    assert.equal(await page.evaluate(() => Tafelberg.profile().settings.tables.includes(2)), false,
      'Een handmatig uitgezette tafel mag bij de start niet automatisch terugkomen');
    await page.evaluate(() => { Tafelberg.save(); Tafelberg.reload(); Tafelberg.maybeUnlock(); });
    assert.equal(await page.evaluate(() => Tafelberg.profile().settings.tables.includes(2)), false);
    const copy = await page.evaluate(() => Tafelberg.exportBackup());
    await page.evaluate(raw => { Tafelberg.restoreBackup(raw); Tafelberg.maybeUnlock(); }, copy);
    assert.equal(await page.evaluate(() => Tafelberg.profile().settings.tables.includes(2)), false);
    const questions = await page.evaluate(() => {
      const se = Tafelberg.newSession(Tafelberg.profile().settings.tables);
      return Array.from({ length: 200 }, () => Tafelberg.pickNext(se).t);
    });
    assert(!questions.includes(2), 'De oefenpool bevat geen uitgezette tafel');
    await page.evaluate(() => Tafelberg.go('settings'));
    await page.getByRole('button', { name: 'Tafel van 2', exact: true }).click();
    assert.equal(await page.evaluate(() => Tafelberg.profile().settings.tables.includes(2)), true);
    assert.equal(await page.evaluate(() => Tafelberg.profile().settings.excludedTables.includes(2)), false);

    // Alle tien tafels: handmatig uitzetten heeft voor iedere tafel voorrang.
    for (let t = 1; t <= 10; t++) {
      await reset();
      await page.evaluate(() => {
        const p = Tafelberg.profile(); p.settings.tables = [1,2,3,4,5,6,7,8,9,10];
        for (let t = 1; t <= 10; t++) for (let a = 1; a <= 10; a++) p.facts[a+'x'+t] = { b:4,n:5,c:5,due:0,last:0,rt:1500 };
        Tafelberg.go('settings');
      });
      await page.getByRole('button', { name: 'Tafel van ' + t, exact: true }).click();
      assert.equal(await page.evaluate(() => Tafelberg.maybeUnlock()), null);
      assert.equal(await page.evaluate(t => Tafelberg.profile().settings.tables.includes(t), t), false);
    }
    await reset();
    assert.equal(await page.evaluate(() => Tafelberg.maybeUnlock()), 1, 'Gewone automatische uitbreiding blijft werken');
    await reset();
    await page.evaluate(() => { Tafelberg.profile().settings.auto = false; });
    await page.getByRole('button', { name: 'Tafel van 2', exact: true }).click();
    assert.equal(await page.evaluate(() => Tafelberg.maybeUnlock()), null);
    await page.getByRole('switch', { name: 'Nieuwe tafels vanzelf erbij', exact: true }).click();
    await page.evaluate(() => Tafelberg.maybeUnlock());
    assert.equal(await page.evaluate(() => Tafelberg.profile().settings.tables.includes(2)), false);
    // De laatste tafel blijft gekozen; de interface legt dit uit.
    await page.evaluate(() => { const p = Tafelberg.profile(); p.settings.tables = [2]; p.settings.excludedTables = []; Tafelberg.go('settings'); });
    await page.getByRole('button', { name: 'Tafel van 2', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => Tafelberg.profile().settings.tables), [2]);
    assert.equal(await page.evaluate(() => Tafelberg.profile().settings.excludedTables.includes(2)), false);
    // Gekende sommen buiten de selectie mogen de sprint niet alsnog openen.
    await reset();
    await page.evaluate(() => {
      const p = Tafelberg.profile(); p.settings.tables = [5]; p.facts = {};
      for (let a = 1; a <= 10; a++) p.facts[a+'x2'] = { b:4,n:5,c:5,due:0,last:0,rt:1500 };
      Tafelberg.go('sprint');
    });
    assert.equal(await page.getByRole('button', { name: 'Start', exact: true }).count(), 0);
    // Oude opslag zonder extra instellingen blijft bruikbaar.
    await page.evaluate(raw => {
      const old = JSON.parse(raw); delete old.profiles[old.current].settings.excludedTables;
      Tafelberg.restoreBackup(JSON.stringify(old)); Tafelberg.go('settings');
    }, seed);
    assert.deepEqual(await page.evaluate(() => Tafelberg.profile().settings.excludedTables), []);
    for (const invalid of [[0], [11], [2.5], ['2'], null, {}]) {
      assert.equal(await page.evaluate(value => {
        const before = Tafelberg.exportBackup(), copy = JSON.parse(before);
        copy.profiles[copy.current].settings.excludedTables = value;
        try { Tafelberg.restoreBackup(JSON.stringify(copy)); return false; }
        catch (err) { return Tafelberg.exportBackup() === before; }
      }, invalid), true, 'Ongeldige tafeluitsluiting mag voortgang niet vervangen');
    }
    assert.deepEqual(errors, []);
    console.log('Tafelkeuze: start ronde, herladen, kopie, 200 vragen, alle 10 tafels, automatische uitbreiding, laatste tafel en sprint geslaagd.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
