/* Browser + echte Edge-handler + Postgres, met nagebootste externe Auth-service. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{backend}=require('./supabase-edge.cjs');
const endpoint='https://test.supabase.co/functions/v1/tafelberg';
async function main(){
 const b=await backend();let hold=null;
 const server=http.createServer((req,res)=>{
  const root=path.resolve('app/src/main/assets/www'),pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(file.endsWith('cloud-config.js')?"window.TB_CLOUD_URL = '"+endpoint+"';":fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const opts={headless:true};if(process.env.TB_LITE_BROWSER){const pkg=require('@sparticuz/chromium'),lite=pkg.default||pkg;opts.executablePath=await lite.executablePath();opts.args=lite.args.filter(a=>a!=='--single-process');}
  browser=await chromium.launch(opts);
  async function device(){
   const c=await browser.newContext({viewport:{width:375,height:667},hasTouch:true});const p=await c.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
   await c.route(endpoint,async route=>{
    const data=route.request().postDataJSON();
    const response=await b.handler(new Request(endpoint,{method:'POST',headers:{Origin:'https://robinvandenbroecke.github.io','Content-Type':'application/json'},body:JSON.stringify(data)}));
    const result=await response.text();const deliver=()=>route.fulfill({status:response.status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:result});
    if(hold&&data.action==='write'){hold.deliver=deliver;return;}
    await deliver();
   });
   await p.addInitScript(()=>{window.completedCloud=0;const send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(){this.addEventListener('loadend',()=>window.completedCloud++);return send.apply(this,arguments);};});
   await p.goto('http://127.0.0.1:'+server.address().port); if(p.errors.length)throw Error(JSON.stringify(p.errors)); return {p,c};
  }
  async function local(p,name,stars){await p.getByRole('textbox',{name:'Naam',exact:true}).fill(name);await p.getByRole('button',{name:'Start de klim',exact:true}).click();await p.evaluate(stars=>{const a=Tafelberg.profile();a.settings.sound=false;a.settings.voice=false;a.stats.stars=stars;Tafelberg.save();},stars);}
  async function form(p,mode,name,password,options={}){
   await p.evaluate(mode=>Tafelberg.go('cloud',{mode}),mode);await p.getByRole('textbox',{name:'Gebruikersnaam',exact:true}).fill(name);await p.getByLabel('Wachtwoord',{exact:true}).fill(password);
   if(mode==='register'){
    await p.getByLabel('Herhaal wachtwoord',{exact:true}).fill(password);
    await p.getByRole('textbox',{name:'Herstel-e-mailadres',exact:true}).fill(name+'@example.test');
    if(options.empty)await p.getByRole('combobox',{name:'Voortgang bij account maken',exact:true}).selectOption('');
   }
   await p.getByRole('button',{name:mode==='register'?'Account maken en bewaren':'Aanmelden',exact:true}).click();
   if(mode==='register'&&b.settings.confirmation){
    await p.getByRole('status').filter({hasText:'Controleer je e-mail'}).waitFor();
    assert.equal(await p.evaluate(()=>Tafelberg.profile().name),name==='alice'?'Alice':'Bob');
    b.settings.confirmation=false;
    await p.getByRole('button',{name:'Account bevestigd? Aanmelden',exact:true}).click();
    await p.getByLabel('Wachtwoord',{exact:true}).fill(password);
    await p.getByRole('button',{name:'Aanmelden',exact:true}).click();
   }
   await p.getByRole('heading',{name:'Account van '+name,exact:true}).waitFor();
  }
  async function settled(p){try { await p.waitForFunction(()=>{const m=JSON.parse(localStorage.getItem('tafelberg.supabase.v2')),a=m.links[Tafelberg.state().current];return a&&!a.dirty;},null,{timeout:15000}); } catch(e) {console.error(await p.evaluate(()=>({body:document.body.innerText,links:JSON.parse(localStorage.getItem('tafelberg.supabase.v2')).links,current:Tafelberg.state().current})));throw e;} }
  async function play(p,name){await p.getByRole('button',{name:'Spelen met '+name,exact:true}).click();await settled(p);}
  async function account(p){await p.evaluate(()=>Tafelberg.go('cloud'));await p.getByRole('status').filter({hasText:'Klimmers bijgewerkt.'}).waitFor();}
  async function upload(p,name,target=''){
   const id=await p.evaluate(name=>Object.values(Tafelberg.state().profiles).find(p=>p.name===name).id,name);
   await p.getByRole('combobox',{name:'Lokale klimmer meenemen',exact:true}).selectOption(id);
   await p.getByRole('combobox',{name:'Opslaan als',exact:true}).selectOption(target);
   await p.getByRole('button',{name:'Voortgang toevoegen',exact:true}).click();await settled(p);
  }
  const a=await device();await local(a.p,'Alice',15);b.settings.confirmation=true;await form(a.p,'register','alice','Alice-password-123');await settled(a.p);
  await a.p.getByRole('button',{name:'Spelen met Alice',exact:true}).waitFor();
  const hector=await a.p.evaluate(()=>Tafelberg.state().current);
  await a.p.evaluate(()=>Tafelberg.go('newPlayer'));await local(a.p,'Basil',7);await account(a.p);await upload(a.p,'Basil');
  const basil=await a.p.evaluate(()=>Tafelberg.state().current);assert.notEqual(basil,hector);
  let online=(await b.rpc({action:'login',username:'alice',password:'Alice-password-123'})).data;
  assert.equal(online.profiles.length,2);assert.deepEqual(online.profiles.map(p=>p.profile.stats.stars).sort((a,b)=>a-b),[7,15]);
  // Een tweede toestel haalt alle kinderen met één ouderaccount op.
  const d=await device();await form(d.p,'login','alice','Alice-password-123');await play(d.p,'Alice');
  assert.equal(await d.p.evaluate(()=>Tafelberg.state().order.length),2);
  await play(a.p,'Alice');
  await a.p.evaluate(()=>{Tafelberg.profile().stats.stars=30;Tafelberg.save();TBCloud.sync();});await settled(a.p);
  await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=20;Tafelberg.save();TBCloud.sync();});await settled(d.p);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),30);
  await a.p.evaluate(()=>{Tafelberg.profile().stats.stars=40;Tafelberg.save();TBCloud.sync();});await settled(a.p);
  hold={};await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=31;Tafelberg.save();TBCloud.sync();Tafelberg.go('practice',{tables:[5],from:'table'});});
  for(let i=0;i<100&&!hold.deliver;i++)await new Promise(r=>setTimeout(r,20));assert(hold.deliver);const eq=await d.p.locator('.equation').textContent(),completed=await d.p.evaluate(()=>window.completedCloud);await hold.deliver();hold=null;await d.p.waitForFunction(n=>window.completedCloud>n,completed);
  // Het vertraagde antwoord mag de lopende oefening niet vervangen.
  await d.p.waitForFunction(()=>document.querySelector('.equation'));
  assert.equal(await d.p.locator('.equation').textContent(),eq);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),31);
  await d.p.evaluate(()=>{Tafelberg.go('home');TBCloud.sync();});await settled(d.p);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),40);
  await d.c.setOffline(true);await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=50;Tafelberg.save();TBCloud.sync();});assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),50);
  await d.c.setOffline(false);await d.p.evaluate(()=>TBCloud.sync());await settled(d.p);
  await a.p.evaluate(()=>TBCloud.sync());await a.p.waitForFunction(()=>Tafelberg.profile().stats.stars===50);await settled(a.p);
  // Eén verversbare sessie bedient beide klimmers.
  const oldToken=await a.p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('tafelberg.supabase.v2')).sessions)[0].token);
  await a.p.evaluate(()=>{const m=JSON.parse(localStorage.getItem('tafelberg.supabase.v2'));Object.values(m.sessions)[0].expires=0;localStorage.setItem('tafelberg.supabase.v2',JSON.stringify(m));});
  await a.p.reload();await a.p.evaluate(()=>TBCloud.sync());await a.p.waitForFunction(token=>Object.values(JSON.parse(localStorage.getItem('tafelberg.supabase.v2')).sessions)[0].token!==token,oldToken);await settled(a.p);
  assert.equal(await a.p.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('tafelberg.supabase.v2')).sessions).length),1);
  const backup=await a.p.evaluate(()=>Tafelberg.exportBackup());assert(!/access-|refresh-|password-123|token|refresh/.test(backup));
  await account(a.p);
  assert.equal(await a.p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(await a.p.locator('.cloud button').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44;}).map(e=>e.textContent)),[]);
  fs.mkdirSync('test-results/screens',{recursive:true});await a.p.screenshot({path:'test-results/screens/supabase-family-account.png'});
  await a.p.evaluate(()=>Tafelberg.go('cloud',{mode:'recover'}));await a.p.getByRole('textbox',{name:'Gebruikersnaam',exact:true}).fill('alice');await a.p.getByRole('button',{name:'Herstelmail versturen',exact:true}).click();await a.p.getByRole('status').filter({hasText:'Als dit account bestaat'}).waitFor();
  // Aanmelden doet op zichzelf geen upload. De gebruiker kiest de lokale bron en het kind.
  const e=await device();await local(e.p,'Lokale Alice',80);await form(e.p,'login','alice','Alice-password-123');
  assert.equal((await b.rpc({action:'login',username:'alice',password:'Alice-password-123'})).data.profiles.find(p=>p.user===hector).profile.stats.stars,50);
  await upload(e.p,'Lokale Alice',hector);assert.equal(await e.p.evaluate(()=>Tafelberg.profile().stats.stars),80);assert.equal(await e.p.evaluate(()=>Tafelberg.state().order.length),2);
  // Minder lokale voortgang blijft afzonderlijk bewaard; Basil wordt niet teruggezet.
  const low=await device();await local(low.p,'Beginnende Basil',5);await form(low.p,'login','alice','Alice-password-123');await upload(low.p,'Beginnende Basil',basil);
  assert.equal(await low.p.evaluate(()=>Tafelberg.profile().stats.stars),7);assert.equal(await low.p.evaluate(()=>Object.values(Tafelberg.state().profiles).find(p=>p.name==='Beginnende Basil').stats.stars),5);
  const skip=await device();await local(skip.p,'Apart houden',100);await form(skip.p,'login','alice','Alice-password-123');await play(skip.p,'Basil');
  assert.equal(await skip.p.evaluate(()=>Object.values(Tafelberg.state().profiles).find(p=>p.name==='Apart houden').stats.stars),100);
  online=(await b.rpc({action:'login',username:'alice',password:'Alice-password-123'})).data;
  assert.equal(online.profiles.length,2);assert.equal(online.profiles.find(p=>p.user===hector).profile.stats.stars,80);assert.equal(online.profiles.find(p=>p.user===basil).profile.stats.stars,7);
  // Een nieuw gezinsaccount mag leeg beginnen; een kind heeft geen eigen e-mailadres nodig.
  const fresh=await device();await local(fresh.p,'Bewaar lokaal',90);await form(fresh.p,'register','fresh','Fresh-password-123',{empty:true});
  assert.equal((await b.rpc({action:'login',username:'fresh',password:'Fresh-password-123'})).data.profiles.length,0);
  await fresh.p.getByRole('textbox',{name:'Naam van nieuwe klimmer',exact:true}).fill('Dolores');await fresh.p.getByRole('button',{name:'Nieuwe klimmer maken',exact:true}).click();
  await fresh.p.getByRole('button',{name:'Spelen met Dolores',exact:true}).waitFor();await settled(fresh.p);assert.equal(await fresh.p.evaluate(()=>Tafelberg.profile().stats.stars),0);
  assert.equal(await fresh.p.evaluate(()=>Object.values(Tafelberg.state().profiles).find(p=>p.name==='Bewaar lokaal').stats.stars),90);
  for(const dev of [e,low,skip,fresh]){assert.deepEqual(dev.p.errors,[]);await dev.c.close();}
  const login=await b.rpc({action:'login',username:'alice',password:'Alice-password-123'});
  await a.p.goto('http://127.0.0.1:'+server.address().port+'/#type=recovery&access_token='+login.data.token+'&refresh_token='+login.data.refresh+'&expires_in=3600');
  await a.p.reload();
  await a.p.getByRole('heading',{name:'Nieuw wachtwoord kiezen',exact:true}).waitFor();
  assert.equal(await a.p.evaluate(()=>location.hash),'','Hersteltokens verdwijnen uit de adresbalk');
  await a.p.getByLabel('Nieuw wachtwoord',{exact:true}).fill('New-Alice-password-123');
  await a.p.getByLabel('Herhaal wachtwoord',{exact:true}).fill('New-Alice-password-123');
  await a.p.getByRole('button',{name:'Wachtwoord opslaan',exact:true}).click();
  await a.p.getByRole('status').filter({hasText:'Wachtwoord gewijzigd'}).waitFor();
  assert.deepEqual(a.p.errors,[]);assert.deepEqual(d.p.errors,[]);
  await a.c.close();await d.c.close();
  console.log('Supabase browser: migratie, meerdere spelers, twee toestellen, verste versie, offline, lopende ronde, tokenverversing, herstel, veilige kopieën en optionele upload naar nieuwe/bestaande accounts geslaagd.');
 }finally{if(browser)await browser.close();await b.db.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
