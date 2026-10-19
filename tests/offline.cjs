const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
fs.mkdirSync('test-results/tls',{recursive:true});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout','test-results/tls/key.pem','-out','test-results/tls/cert.pem','-subj','/CN=localhost','-days','1'],{stdio:'ignore'});
const swPath='_site/sw.js',original=fs.readFileSync(swPath,'utf8');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff'};
let networkUnavailable=false;
const server=https.createServer({key:fs.readFileSync('test-results/tls/key.pem'),cert:fs.readFileSync('test-results/tls/cert.pem')},(req,res)=>{
 if(networkUnavailable){req.socket.destroy();return;}
 const url=new URL(req.url,'https://localhost');const root=path.resolve('_site');let p=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/tafelberg\//,''));
 if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');
 if(!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(p));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`https://localhost:${server.address().port}/tafelberg/`;let reports=[];
 try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(v=>!process.env.TB_TEST_ENGINE||v[0]===process.env.TB_TEST_ENGINE)){
 fs.writeFileSync(swPath,original.replace('var FILES = [','var FILES = ["./voice/missing-test.mp3",'));
 const launch={headless:true};if(name==='chromium')launch.args=['--ignore-certificate-errors','--no-sandbox'];
 if(name==='chromium'&&process.env.TB_LITE_BROWSER){launch.executablePath=path.resolve('.test-browsers/lite/chromium');launch.args.push('--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader');}
 const b=await engine.launch(launch);try{
 const c=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:393,height:852}}),p=await c.newPage();
 console.log(name+': starten');await p.goto(base);await p.getByRole('textbox',{name:'Naam',exact:true}).fill('Offline');await p.getByRole('button',{name:'Start de klim'}).click();
 await p.evaluate(()=>{Tafelberg.profile().settings.voice=false;Tafelberg.profile().settings.sound=false;Tafelberg.save();});
 await p.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
 // WebKit setOffline breekt SW-navigaties (Playwright #42775). Maak de echte server onbereikbaar.
 // Chromium gebruikt daarnaast de gevraagde browseremulatie van vliegtuigmodus.
 console.log(name+': offline');networkUnavailable=true;if(name==='chromium')await c.setOffline(true);
 const offlineResponse=await p.goto(base+'?eink=1');assert(offlineResponse.fromServiceWorker());assert(await p.getByText('Dag Offline!',{exact:true}).isVisible());
 await p.goto(base+'installeer/');assert(await p.getByRole('heading',{name:'Klaar om te klimmen?'}).isVisible());await p.goto(base);
 assert(await p.evaluate(()=>Promise.race([fetch('not-cached-test.txt').then(()=>false,()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),5000))])));
 networkUnavailable=false;if(name==='chromium')await c.setOffline(false);
 console.log(name+': update');const other=await c.newPage();await other.goto(base);await other.evaluate(()=>Tafelberg.go('practice',{tables:[2],from:'home'}));const equation=await other.locator('.equation').textContent();
 await p.evaluate(()=>Tafelberg.go('practice',{tables:[2],from:'home'}));const primary=await p.locator('.equation').textContent();
 fs.writeFileSync(swPath,original.replace(/var VERSION = [^;]+;/,'var VERSION = "test-next";'));
 await p.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));
 await p.waitForFunction(()=>navigator.serviceWorker.getRegistration().then(r=>!!r.waiting));
 assert.equal(await p.locator('.web-update').count(),0);assert.equal(await p.locator('.equation').textContent(),primary);
 await p.evaluate(()=>Tafelberg.go('home'));
 await Promise.all([p.waitForEvent('load'),p.getByRole('button',{name:'Er is een nieuwe versie. Tik om bij te werken.'}).click()]);
 assert(await p.getByText('Dag Offline!',{exact:true}).isVisible());assert.equal(await other.locator('.equation').textContent(),equation);
 const caches=await p.evaluate(()=>window.caches.keys());assert.deepEqual(caches.filter(x=>x.startsWith('tafelberg-')),['tafelberg-test-next']);
 const manifest=await p.evaluate(()=>fetch('manifest.webmanifest').then(r=>r.json()));assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./?bron=app');assert.equal(manifest.icons.length,3);
 if(name==='chromium'){
  const devtools=await c.newCDPSession(p);const install=await devtools.send('Page.getInstallabilityErrors');
  assert.deepEqual(install.installabilityErrors,[],JSON.stringify(install));await devtools.detach();
 }
 const png=await p.evaluate(()=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve([img.width,img.height]);img.onerror=reject;img.src='icons/maskable-512.png';}));assert.deepEqual(png,[512,512]);
 reports.push({engine:name,offlineMode:name==='webkit'?'origin-unreachable':'browser-offline-and-origin-unreachable',offline:true,missingAudioTolerated:true,waitingUpdate:true,noMidRoundReload:true,multipleTabs:true,manifest:true,installability:name==='chromium'?'no-errors':'manual-device-installation'});await c.close();
 }finally{await b.close();}
 }}finally{fs.writeFileSync(swPath,original);server.close();try{fs.rmSync('test-results/tls',{recursive:true});}catch(e){}fs.writeFileSync('test-results/offline.json',JSON.stringify(reports,null,2));}
 console.log(JSON.stringify(reports,null,2));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
