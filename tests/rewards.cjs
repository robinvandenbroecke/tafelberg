const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={};vm.runInNewContext(fs.readFileSync('app/src/main/assets/www/js/rewards.js','utf8'),sandbox);const R=sandbox.TBRewards;
function profile(n,stars=0){const p={facts:{},stats:{stars,mo:{},badges:{},masteredBest:0,wardrobe:{},rewardsVersion:1}};for(let i=0;i<n;i++)p.facts[(i%10+1)+'x'+(Math.floor(i/10)+1)]={b:4};return p;}
for(const stars of [0,850,10000,999999]){const p=profile(0,stars);R.init(p,false);assert.equal(R.info(p).n,1,'Herhaling en sterren verhogen het kennisniveau niet');assert(!R.owns(p,R.items[8]));}
for(let n=0;n<100;n++){const p=profile(n,999999);R.update(p);assert(R.info(p).n<10,n+' van 100 is geen hoogste niveau');assert(!R.owns(p,R.items[8]));}
const p=profile(100,0);R.init(p,false);assert.equal(R.info(p).n,10);assert.equal(R.info(p).need,0);assert(R.owns(p,R.items[8]),'Alle tafels volstaan, onafhankelijk van sterren');
p.facts['1x1'].b=0;R.update(p);assert.equal(R.info(p).n,10,'Een verdiend niveau wordt niet afgenomen na een fout');
const waiting=profile(99);waiting.facts['10x10']={b:3};assert.equal(R.info(waiting).need,1);assert.equal(R.update(waiting).filter(i=>i.id==='kroon').length,0);
waiting.facts['10x10'].b=4;assert.equal(R.update(waiting).filter(i=>i.id==='kroon').length,1);assert.equal(R.update(waiting).length,0,'Een kledingbeloning verschijnt één keer');
const legacy=profile(2,1000);legacy.stats.mo.head='kroon';R.init(legacy,true);assert.equal(R.info(legacy).n,1);assert.equal(R.wear(legacy).head,undefined);assert(legacy.stats.wardrobe.ijsbijl,'Gewone bestaande kleding blijft behouden');assert(!R.owns(legacy,R.items[8]));
const achieved=profile(0);achieved.stats.badges.summit10='2026-11-06';R.init(achieved,true);assert.equal(R.info(achieved).n,10,'Een echt eerder verdiende Alle toppen-medaille blijft geldig');
for(const threshold of R.levels.slice(1)){const at=profile(threshold[0]);R.update(at);assert.equal(R.info(at).title,threshold[1]);const below=profile(threshold[0]-1);R.update(below);assert.notEqual(R.info(below).title,threshold[1]);}
console.log('Beloningen: alle drempels, 99/100 sommen, onbeperkte sterren, kroon, blijvende mijlpalen en oude kleding gecontroleerd.');
async function browserTest(){
 const http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
 const root=path.resolve('app/src/main/assets/www');const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const options={headless:true};if(process.env.TB_LITE_BROWSER){const pkg=require('@sparticuz/chromium'),lite=pkg.default||pkg;options.executablePath=await lite.executablePath();options.args=lite.args.filter(a=>a!=='--single-process');}
  browser=await chromium.launch(options);const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('textbox',{name:'Naam',exact:true}).fill('Klimmer');await page.getByRole('button',{name:'Start de klim',exact:true}).click();
  await page.evaluate(()=>{const p=Tafelberg.profile();p.settings.sound=false;p.settings.voice=false;p.settings.pace='gewoon';p.stats.stars=100000;p.stats.mo.head='kroon';Tafelberg.addStars(1000);Tafelberg.go('home');});
  assert.equal(await page.locator('.lvl-title').textContent(),'Wandelaar');assert.match(await page.locator('.lvl-need').textContent(),/sommen/);
  await page.evaluate(()=>{const p=Tafelberg.profile();for(let t=1;t<=10;t++)for(let a=1;a<=10;a++)p.facts[a+'x'+t]={b:a===10&&t===10?3:4,n:10,c:10,due:0,last:0,rt:1000};Tafelberg.save();Tafelberg.reload();});
  assert.equal(await page.locator('.lvl-title').textContent(),'Sneeuwarend');assert.equal(await page.evaluate(()=>Tafelberg.levelInfo(Tafelberg.profile()).need),1);
  await page.evaluate(()=>Tafelberg.go('kast'));const crown=page.locator('.kast-item').filter({hasText:'kroon'});assert(await crown.evaluate(e=>e.classList.contains('locked')));assert.equal(await crown.getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>{Tafelberg.grade({a:10,t:10,answer:100,kind:'mul'},true,1000,true,false);Tafelberg.go('home');});
  assert.equal(await page.locator('.lvl-title').textContent(),'Sneeuwarend','Met hulp wordt de laatste som niet beheerst');
  await page.evaluate(()=>{Tafelberg.profile().facts['10x10'].b=3;Tafelberg.profile().facts['10x10'].due=0;});
  await page.evaluate(()=>{Tafelberg.grade({a:10,t:10,answer:100,kind:'mul'},true,1000,false,false);Tafelberg.award();Tafelberg.save();Tafelberg.go('home');});
  assert.equal(await page.locator('.lvl-title').textContent(),'Tafelkoning');
  assert.equal(await page.evaluate(()=>Tafelberg.profile().stats.mo.head),'kroon');
  assert(await page.evaluate(()=>!!Tafelberg.profile().stats.badges.summit10));
  assert.equal(await page.evaluate(()=>Tafelberg.pending().filter(e=>e.type==='item'&&e.data.id==='kroon').length),1);
  await page.evaluate(()=>{Tafelberg.grade({a:10,t:10,answer:100,kind:'mul'},false,9000,false,false);Tafelberg.save();Tafelberg.reload();});
  assert.equal(await page.locator('.lvl-title').textContent(),'Tafelkoning');assert(await page.evaluate(()=>Tafelberg.profile().facts['10x10'].b<4));
  for(const invalid of [{masteredBest:101},{masteredBest:1.5},{wardrobe:{kroon:'true'}},{rewardsVersion:2}])assert(await page.evaluate(invalid=>{const before=Tafelberg.exportBackup(),copy=JSON.parse(before);Object.assign(copy.profiles[copy.current].stats,invalid);try{Tafelberg.restoreBackup(JSON.stringify(copy));return false;}catch(e){return Tafelberg.exportBackup()===before;}},invalid));
  // De update herkent oude sterrenniveaus, maar verandert ze niet in kennis.
  await page.evaluate(()=>{const copy=JSON.parse(Tafelberg.exportBackup()),p=copy.profiles[copy.current];p.facts={};p.stats.badges={};delete p.stats.masteredBest;delete p.stats.wardrobe;delete p.stats.rewardsVersion;Tafelberg.restoreBackup(JSON.stringify(copy));Tafelberg.go('home');});
  assert.equal(await page.locator('.lvl-title').textContent(),'Wandelaar');
  assert.equal(await page.evaluate(()=>Tafelberg.profile().stats.stars),101000);
  await page.evaluate(()=>Tafelberg.go('kast'));assert.equal(await page.locator('.kast-item.locked').count(),1,'Oude gewone kleding blijft beschikbaar; de kroon vraagt alle tafels');
  assert.deepEqual(errors,[]);console.log('Beloningen in de browser: titel, kroon en medaille bij de 100ste som, herstart, fout antwoord en oude opslag geslaagd.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
browserTest().catch(e=>{console.error(e);process.exitCode=1;});
