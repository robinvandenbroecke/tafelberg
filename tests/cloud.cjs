/* Echte app en browser, met een geïsoleerde Apps Script-database. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{fixture}=require('./sync-fixture.cjs');
const db=fixture(),endpoint='https://script.google.com/macros/s/test/exec';
let hold=null;
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,'http://localhost').pathname;
 const file=path.join(path.resolve('app/src/main/assets/www'),rel==='/'?'index.html':rel);
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
 res.end(file.endsWith('cloud-config.js')?'window.TB_CLOUD_URL = '+JSON.stringify(endpoint)+';':fs.readFileSync(file));
});
async function context(browser,base){
 const c=await browser.newContext({viewport:{width:375,height:667},hasTouch:true});
 await c.exposeBinding('testRpc',async({page},id,raw)=>{
  const req=JSON.parse(raw),result=db.rpc(req);
  if(hold&&req.action==='write'){hold.resolve=()=>page.evaluate(({id,result})=>TBCloud.nativeReply(id,result),{id,result});return;}
  await page.evaluate(({id,result})=>TBCloud.nativeReply(id,result),{id,result});
 });
 await c.addInitScript(()=>{window.AndroidSync={request:(endpoint,id,raw)=>window.testRpc(id,raw)};});
 const p=await c.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));await p.goto(base);return {c,p};
}
async function local(p,name){await p.getByRole('textbox',{name:'Naam',exact:true}).fill(name);await p.getByRole('button',{name:'Start de klim',exact:true}).click();await p.evaluate(()=>{Tafelberg.profile().settings.voice=false;Tafelberg.profile().settings.sound=false;Tafelberg.save();});}
async function form(p,mode,user,pin){await p.evaluate(mode=>Tafelberg.go('cloud',{mode}),mode);await p.getByRole('textbox',{name:'Gebruikersnaam',exact:true}).fill(user);await p.getByRole('textbox',{name:'Pincode',exact:true}).fill(pin);if(mode==='register')await p.getByRole('textbox',{name:'Herhaal pincode',exact:true}).fill(pin);await p.getByRole('button',{name:mode==='register'?'Account maken en bewaren':'Aanmelden',exact:true}).click();await p.getByRole('heading',{name:'Aangemeld als '+user,exact:true}).waitFor();}
async function settled(p){await p.waitForFunction(()=>{const m=JSON.parse(localStorage.getItem('tafelberg.sync.v1'));const a=m.accounts[Tafelberg.state().current];return a&&!a.dirty&&a.message==='Online bewaard.';});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://localhost:'+server.address().port+'/';
 const opts={headless:true,args:['--no-sandbox']};if(process.env.TB_LITE_BROWSER){opts.executablePath=path.resolve('.test-browsers/lite/chromium');opts.args.push('--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader');}
 const b=await chromium.launch(opts);try{
  const a=await context(b,base);await local(a.p,'Alice');await a.p.evaluate(()=>{Tafelberg.profile().stats.stars=15;Tafelberg.save();});await form(a.p,'register','alice','123456');
  const recovery=await a.p.getByRole('textbox',{name:'Herstelcode',exact:true}).inputValue();assert.equal(recovery.length,64);
  const alice=await a.p.evaluate(()=>Tafelberg.state().current);
  const d=await context(b,base);await local(d.p,'Bob');await form(d.p,'register','bob','654321');await form(d.p,'login','alice','123456');assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),15);assert.equal(await d.p.evaluate(()=>Tafelberg.state().order.length),2);
  // Meer sterren op toestel A winnen van een later ontvangen, lagere versie B.
  await a.p.evaluate(()=>{Tafelberg.profile().stats.stars=30;Tafelberg.save();TBCloud.sync();});await settled(a.p);
  await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=20;Tafelberg.save();TBCloud.sync();});await settled(d.p);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),30);
  // Een antwoordscherm blijft intact tot de speler terug thuis is.
  await a.p.evaluate(()=>{Tafelberg.profile().stats.stars=40;Tafelberg.save();TBCloud.sync();});await settled(a.p);
  hold={};await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=31;Tafelberg.save();TBCloud.sync();Tafelberg.go('practice',{tables:[2],from:'home'});});
  for(let n=0;n<100&&!hold.resolve;n++)await new Promise(r=>setTimeout(r,10));assert(hold.resolve);const equation=await d.p.locator('.equation').textContent();await hold.resolve();hold=null;
  assert.equal(await d.p.evaluate(()=>Tafelberg.current().name),'practice');assert.equal(await d.p.locator('.equation').textContent(),equation);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),31);
  await d.p.evaluate(()=>{Tafelberg.go('home');TBCloud.sync();});await settled(d.p);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),40);
  // Offline voortgang blijft lokaal en wordt bij herstel geüpload.
  await d.c.setOffline(true);await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=50;Tafelberg.save();TBCloud.sync();});assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),50);await d.c.setOffline(false);await d.p.evaluate(()=>TBCloud.sync());await settled(d.p);
  await a.p.evaluate(()=>TBCloud.sync());await settled(a.p);assert.equal(await a.p.evaluate(()=>Tafelberg.profile().stats.stars),50);
  const backup=await a.p.evaluate(()=>Tafelberg.exportBackup());assert(!backup.includes('token'));assert(!backup.includes('123456'));assert(!backup.includes(recovery));
  await a.p.evaluate(()=>Tafelberg.go('cloud'));assert.equal(await a.p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const small=await a.p.locator('.cloud button').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44;}).map(e=>e.textContent));assert.deepEqual(small,[]);
  fs.mkdirSync('test-results/screens',{recursive:true});await a.p.screenshot({path:'test-results/screens/cloud-connected.png'});
  assert.deepEqual(a.p.errors,[]);assert.deepEqual(d.p.errors,[]);assert.equal(db.sheets.Spelers.rows.length,3);assert(alice);
  await a.c.close();await d.c.close();console.log('Online bewaren: aanmelden, meerdere spelers, verste versie, offline, actieve ronde en geheime gegevens geslaagd.');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
