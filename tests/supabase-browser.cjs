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
   await p.goto('http://127.0.0.1:'+server.address().port); if(p.errors.length)throw Error(JSON.stringify(p.errors)); return {p,c};
  }
  async function local(p,name,stars){await p.getByRole('textbox',{name:'Naam',exact:true}).fill(name);await p.getByRole('button',{name:'Start de klim',exact:true}).click();await p.evaluate(stars=>{const a=Tafelberg.profile();a.settings.sound=false;a.settings.voice=false;a.stats.stars=stars;Tafelberg.save();},stars);}
  async function form(p,mode,name,password){
   await p.evaluate(mode=>Tafelberg.go('cloud',{mode}),mode);await p.getByRole('textbox',{name:'Gebruikersnaam',exact:true}).fill(name);await p.getByLabel('Wachtwoord',{exact:true}).fill(password);
   if(mode==='register'){await p.getByLabel('Herhaal wachtwoord',{exact:true}).fill(password);await p.getByRole('textbox',{name:'Herstel-e-mailadres',exact:true}).fill(name+'@example.test');}
   await p.getByRole('button',{name:mode==='register'?'Account maken en bewaren':'Aanmelden',exact:true}).click();
   if(mode==='register'&&b.settings.confirmation){
    await p.getByRole('status').filter({hasText:'Controleer je e-mail'}).waitFor();
    assert.equal(await p.evaluate(()=>Tafelberg.profile().name),name==='alice'?'Alice':'Bob');
    b.settings.confirmation=false;
    await p.getByRole('button',{name:'Account bevestigd? Aanmelden',exact:true}).click();
    await p.getByLabel('Wachtwoord',{exact:true}).fill(password);
    await p.getByRole('button',{name:'Aanmelden',exact:true}).click();
   }
   await p.getByRole('heading',{name:'Aangemeld als '+name,exact:true}).waitFor();
  }
  async function settled(p){try{await p.waitForFunction(()=>{const m=JSON.parse(localStorage.getItem('tafelberg.supabase.v1')),a=m.accounts[Tafelberg.state().current];return a&&!a.dirty&&a.message==='Online bewaard.';},null,{timeout:15000});}catch(e){console.error(await p.evaluate(()=>({screen:Tafelberg.current().name,accounts:Object.values(JSON.parse(localStorage.getItem('tafelberg.supabase.v1')).accounts).map(a=>({username:a.username,dirty:a.dirty,message:a.message}))})));throw e;}}
  const a=await device();await local(a.p,'Alice',15);b.settings.confirmation=true;await form(a.p,'register','alice','Alice-password-123');await settled(a.p);
  const d=await device();await local(d.p,'Bob',2);await form(d.p,'register','bob','Bob-password-123');await settled(d.p);
  await form(d.p,'login','alice','Alice-password-123');await settled(d.p);
  assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),15);assert.equal(await d.p.evaluate(()=>Tafelberg.state().order.length),2);
  await a.p.evaluate(()=>{Tafelberg.profile().stats.stars=30;Tafelberg.save();TBCloud.sync();});await settled(a.p);
  await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=20;Tafelberg.save();TBCloud.sync();});await settled(d.p);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),30);
  await a.p.evaluate(()=>{Tafelberg.profile().stats.stars=40;Tafelberg.save();TBCloud.sync();});await settled(a.p);
  hold={};await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=31;Tafelberg.save();TBCloud.sync();Tafelberg.go('practice',{tables:[5],from:'table'});});
  for(let i=0;i<100&&!hold.deliver;i++)await new Promise(r=>setTimeout(r,20));assert(hold.deliver);const eq=await d.p.locator('.equation').textContent();await hold.deliver();hold=null;
  await d.p.waitForFunction(()=>{const a=JSON.parse(localStorage.getItem('tafelberg.supabase.v1')).accounts[Tafelberg.state().current];return !!a.remote;},null,{timeout:15000});
  assert.equal(await d.p.locator('.equation').textContent(),eq);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),31);
  await d.p.evaluate(()=>{Tafelberg.go('home');TBCloud.sync();});await settled(d.p);assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),40);
  await d.c.setOffline(true);await d.p.evaluate(()=>{Tafelberg.profile().stats.stars=50;Tafelberg.save();TBCloud.sync();});assert.equal(await d.p.evaluate(()=>Tafelberg.profile().stats.stars),50);
  await d.c.setOffline(false);await d.p.evaluate(()=>TBCloud.sync());await settled(d.p);
  await a.p.evaluate(()=>TBCloud.sync());await settled(a.p);assert.equal(await a.p.evaluate(()=>Tafelberg.profile().stats.stars),50);
  // Verlopen toegangstoken wordt via de bewaarde refreshsessie vernieuwd.
  await a.p.evaluate(()=>{const m=JSON.parse(localStorage.getItem('tafelberg.supabase.v1'));m.accounts[Tafelberg.state().current].expires=0;localStorage.setItem('tafelberg.supabase.v1',JSON.stringify(m));});
  await a.p.reload();await a.p.evaluate(()=>TBCloud.sync());await settled(a.p);
  const backup=await a.p.evaluate(()=>Tafelberg.exportBackup());assert(!/access-|refresh-|password-123|token|refresh/.test(backup));
  await a.p.evaluate(()=>Tafelberg.go('cloud'));
  assert.equal(await a.p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(await a.p.locator('.cloud button').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44;}).map(e=>e.textContent)),[]);
  fs.mkdirSync('test-results/screens',{recursive:true});await a.p.screenshot({path:'test-results/screens/supabase-account.png'});
  await a.p.evaluate(()=>Tafelberg.go('cloud',{mode:'recover'}));await a.p.getByRole('textbox',{name:'Gebruikersnaam',exact:true}).fill('alice');await a.p.getByRole('button',{name:'Herstelmail versturen',exact:true}).click();await a.p.getByRole('status').filter({hasText:'Als dit account bestaat'}).waitFor();
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
  console.log('Supabase browser: migratie, meerdere spelers, twee toestellen, verste versie, offline, lopende ronde, tokenverversing, herstel en veilige kopieën geslaagd.');
 }finally{if(browser)await browser.close();await b.db.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
