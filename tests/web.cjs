/* Volledige schermmatrix; lokaal gebruikt de test de reeds geïnstalleerde browsers. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium,webkit}=require('playwright');
const root=path.resolve('_site');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.woff':'font/woff','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');let rel=decodeURIComponent(u.pathname);
 if(rel.startsWith('/apk/'))rel=rel.slice(5);else if(rel.startsWith('/tafelberg/'))rel=rel.slice(11);else {res.writeHead(404);res.end();return;}
 const base=u.pathname.startsWith('/apk/')?path.resolve('app/src/main/assets/www'):root;
 let file=path.resolve(base,rel||'.');if(!file.startsWith(base+path.sep)&&file!==base){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(fs.readFileSync(file));
});
const sizes=[['iphone-se',375,667],['iphone15',393,852],['iphone15-land',852,393],['iphone-max',430,932],['pixel7',412,915],['pixel7-land',915,412],['ipad',820,1180],['ipad-land',1180,820],['ipad-pro',1024,1366],['ipad-pro-land',1366,1024],['split',507,1180],['tab-s3',768,1024],['tab-s3-land',1024,768],['boox',702,936],['iphone-se-land',667,375]];
const screens=['who','newPlayer','home','table','ladder','practice','summary','celebrate','week','kast','speed','race','sprint','medals','chart','settings'];
let results=[],failures=[],errors=[];
async function seed(page){
 await page.getByRole('textbox',{name:'Naam',exact:true}).fill('Klimmer');await page.getByRole('button',{name:'Start de klim'}).click();
 await page.evaluate(()=>{const app=window.Tafelberg,p=app.profile();p.settings.voice=false;p.settings.sound=false;p.settings.tables=[2,5,10];p.settings.auto=false;
 for(let a=1;a<=10;a++)for(let t=1;t<=10;t++)p.facts[a+'x'+t]={b:4,n:5,c:5,due:0,last:0,rt:1500};
 p.stats.stars=150;p.stats.lm.n=30;app.save();app.go('home');});
}
async function visit(page,name){
 await page.evaluate(name=>{const a=window.Tafelberg;let p={};if(['table','ladder','race'].includes(name))p={t:10,from:'table'};
 if(name==='practice')p={tables:[10],from:'table'};
 if(name==='sprint')p={now:true};
 if(name==='summary'){p.se=a.newSession([2,5,10]);p.se.thinks=[1500,2200];p.se.firstOk=12;p.se.stars=20;p.se.records=[];p.se.mastered=[];}
 if(name==='celebrate')a.pending().push({type:'item',data:{id:'muts'}});
 a.go(name,p);},name);
 if(name==='race'){await page.getByRole('button',{name:'Start',exact:true}).click();await page.waitForSelector('.race .keypad',{timeout:5000});}
 await page.waitForTimeout(40);
}
async function metrics(page){return page.evaluate(()=>{
 const w=innerWidth,h=innerHeight,small=[];
 for(const el of document.querySelectorAll('button,[role="switch"]')){const r=el.getBoundingClientRect(),cs=getComputedStyle(el);if(r.width&&r.height&&cs.visibility!=='hidden'&&cs.display!=='none'&&(r.width<43.9||r.height<43.9))small.push({text:el.getAttribute('aria-label')||el.textContent.slice(0,40),cls:el.className,w:r.width,h:r.height});}
 const pad=document.querySelector('.keypad'),r=pad&&pad.getBoundingClientRect();
 const badPad=r&&(r.top<-.5||r.bottom>h+.5||r.left<-.5||r.right>w+.5);
 const active=document.activeElement;const over=document.documentElement.scrollWidth>document.documentElement.clientWidth;
 const off=[];for(const el of document.querySelectorAll('.sum-n')){const range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),card=el.parentNode.getBoundingClientRect();if(text.left<card.left-1||text.right>card.right+1)off.push('Resultaattekst buiten kaart');}
 for(const el of document.querySelectorAll('.sum-foot .btn,.cel-actions .btn,.np-start,.table-actions .btn,.home-actions .btn')){const b=el.getBoundingClientRect();if(b.height&&(b.top<0||b.bottom>h+.5))off.push(el.textContent);}
 return {over,small,pad:badPad?{top:r.top,bottom:r.bottom,h}:null,off};
});}
async function matrix(browser,type,base){
 for(const [device,w,h] of sizes.filter(v=>!process.env.TB_TEST_DEVICE||v[0]===process.env.TB_TEST_DEVICE)){const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();
 page.on('pageerror',e=>errors.push({type,device,message:e.message}));page.on('console',m=>{if(m.type()==='error')errors.push({type,device,message:m.text()});});
 await page.goto(base+(device==='boox'?'?eink=1':''));await seed(page);
 for(const name of screens){await visit(page,name);const m=await metrics(page);results.push({type,device,name,...m});if(m.over||m.pad||m.small.length||m.off.length)failures.push({type,device,name,...m});
 await page.screenshot({path:`test-results/screens/${type}-${device}-${name}.png`});
 if(name==='practice') {await page.getByRole('button',{name:'9',exact:true}).click();await page.getByRole('button',{name:'Klaar',exact:true}).click();const fix=await metrics(page);if(fix.pad||fix.over)failures.push({type,device,name:'practice-fix',...fix});await page.screenshot({path:`test-results/screens/${type}-${device}-practice-fix.png`});}
 }
 await context.close();
 }
}
async function safeAreas(browser,type,base){
 for(const side of ['left','right']){
  const c=await browser.newContext({viewport:{width:852,height:393},hasTouch:true});
  await c.route('**/css/style.css',route=>{
   let css=fs.readFileSync('_site/css/style.css','utf8').replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g,(_,edge)=>edge==='bottom'?'21px':edge===side?'44px':'0px');
   route.fulfill({contentType:'text/css',body:css});
  });
  const p=await c.newPage();await p.goto(base);await seed(p);
  for(const name of ['home','practice','ladder','race','sprint']){await visit(p,name);const m=await metrics(p);results.push({type,device:'notch-'+side,name,...m});if(m.pad||m.over||m.off.length)failures.push({type,device:'notch-'+side,name,...m});await p.screenshot({path:`test-results/screens/${type}-notch-${side}-${name}.png`});}
  await c.close();
 }
}
async function voiceAndCopies(browser,base){
 const c=await browser.newContext({viewport:{width:393,height:852}});
 await c.addInitScript(()=>{
  window.voiceCalls=[];window.testVoices=[];window.voiceListener=null;
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>window.testVoices,cancel:()=>{},speak:u=>window.voiceCalls.push(u.voice.lang),addEventListener:(name,fn)=>{if(name==='voiceschanged')window.voiceListener=fn;}}});
  window.SpeechSynthesisUtterance=function(text){this.text=text;};
 });
 const p=await c.newPage();await p.goto(base);await seed(p);
 await p.evaluate(()=>{Tafelberg.profile().settings.voice=true;});
 await p.locator('.home .bubble').click();assert.deepEqual(await p.evaluate(()=>voiceCalls),[]);
 for(const [voices,want] of [[['nl-NL','nl-BE'],'nl-BE'],[['en-US','nl-NL'],'nl-NL'],[['nl'],'nl']]){
  await p.evaluate(v=>{testVoices=v.map(lang=>({lang}));voiceListener();},voices);
  await p.locator('.home .bubble').click();assert.equal(await p.evaluate(()=>voiceCalls[voiceCalls.length-1]),want);
 }
 const raw=await p.evaluate(()=>Tafelberg.exportBackup());await p.evaluate(()=>Tafelberg.go('settings'));
 await p.getByRole('button',{name:'Kopie terugzetten',exact:true}).click();await p.getByRole('textbox',{name:'Kopie van de voortgang',exact:true}).fill(raw);
 p.once('dialog',d=>d.dismiss());await p.getByRole('button',{name:'Terugzetten',exact:true}).click();assert.equal(await p.evaluate(()=>Tafelberg.exportBackup()),raw);
 p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Terugzetten',exact:true}).click();assert.equal(await p.evaluate(()=>Tafelberg.current().name),'who');
 assert.equal(await p.evaluate(()=>Tafelberg.profile().name),'Klimmer');await c.close();
}
async function installation(browser,base){
 const variants=[['iphone','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1','iPhone',5,'ios-safari'],['ipad','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15','MacIntel',5,'ipad'],['ios-chrome','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1','iPhone',5,'ios-chrome'],['android','Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36','Linux',5,'android-menu'],['whatsapp','Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 WhatsApp/2.0','iPhone',5,'in-app'],['desktop','Mozilla/5.0 Chrome/130 Safari/537.36','Linux',0,'desktop']];
 for(const [name,ua,platform,touch,expected] of variants){const c=await browser.newContext({userAgent:ua,viewport:{width:393,height:852}});await c.addInitScript(({platform,touch})=>{Object.defineProperty(navigator,'platform',{value:platform});Object.defineProperty(navigator,'maxTouchPoints',{value:touch});},{platform,touch});const page=await c.newPage();await page.goto(base+'installeer/');assert.equal(await page.locator('#instructions').getAttribute('data-device'),expected);
 if(name==='android'){await page.evaluate(()=>{const e=new Event('beforeinstallprompt');e.prompt=()=>{window.promptUsed=true;};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e);});await page.getByRole('button',{name:'Installeer Tafelberg',exact:true}).click();assert(await page.evaluate(()=>window.promptUsed));await page.getByText('Klaar! Je vindt Tafelberg op je beginscherm.').waitFor();}
 await page.screenshot({path:`test-results/screens/install-${name}.png`});await c.close();}
}
async function functional(browser,base){
 const c=await browser.newContext({viewport:{width:393,height:852},userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36'});const p=await c.newPage();await p.goto(base);await seed(p);
 // Systeemterugknop; de ronde gaat terug naar haar tafel en daarna naar huis.
 await p.evaluate(()=>Tafelberg.go('table',{t:2}));await p.evaluate(()=>Tafelberg.go('practice',{tables:[2],from:'table'}));await p.goBack();assert.equal(await p.evaluate(()=>Tafelberg.current().name),'table');await p.goBack();assert.equal(await p.evaluate(()=>Tafelberg.current().name),'home');
 const backup=await p.evaluate(()=>Tafelberg.exportBackup());
 await p.evaluate(raw=>{const b=JSON.parse(raw);b.profiles[b.current].name='Hersteld';Tafelberg.restoreBackup(JSON.stringify(b));},backup);assert.equal(await p.evaluate(()=>Tafelberg.profile().name),'Hersteld');
 const before=await p.evaluate(()=>Tafelberg.exportBackup());await p.evaluate(()=>{try{Tafelberg.restoreBackup('{"v":2}');throw Error('ten onrechte aanvaard');}catch(e){if(e.message==='ten onrechte aanvaard')throw e;}});assert.equal(await p.evaluate(()=>Tafelberg.exportBackup()),before);
 await p.evaluate(()=>Tafelberg.go('practice',{tables:[10],from:'table'}));const initial=await p.locator('.equation').textContent();await p.setViewportSize({width:852,height:393});assert.equal(await p.locator('.equation').textContent(),initial);
 // file://: geen webbootstrap, manifest of SW. Androidbrug blijft de opslag gebruiken.
 const apk=await c.newPage();await apk.addInitScript(()=>{window.AndroidStore={get:()=>null,set:()=>{window.savedAndroid=true;}};});await apk.goto('file://'+path.resolve('app/src/main/assets/www/index.html'));await seed(apk);assert(await apk.evaluate(()=>window.savedAndroid));assert.equal(await apk.locator('link[rel="manifest"]').count(),0);assert.equal(await apk.evaluate(()=>!!window.TBWeb),false);await c.close();
}
(async()=>{fs.mkdirSync('test-results/screens',{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;const base=`http://127.0.0.1:${port}/tafelberg/`;
 try{for(const [type,engine] of [['chromium',chromium],['webkit',webkit]].filter(v=>!process.env.TB_TEST_ENGINE||v[0]===process.env.TB_TEST_ENGINE)){const launch={headless:true};if(type==='chromium'&&process.env.TB_LITE_BROWSER){const lite=require('@sparticuz/chromium');launch.executablePath=path.resolve(process.env.TB_CHROMIUM_EXECUTABLE||'.test-browsers/lite/chromium');launch.args=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'];}const b=await engine.launch(launch);try{await matrix(b,type,base);await safeAreas(b,type,base);await voiceAndCopies(b,base);await installation(b,base);if(type==='chromium')await functional(b,base);}finally{await b.close();}}}
 finally{server.close();fs.writeFileSync('test-results/layout.json',JSON.stringify({results,failures,errors},null,2));}
 console.log(JSON.stringify({screens:results.length,failures:failures.length,errors},null,2));if(failures.length){console.log(JSON.stringify(failures.slice(0,20),null,2));process.exitCode=1;}if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
