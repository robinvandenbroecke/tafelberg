/* Bouw alleen een projectsubmap; nooit Android-bronnen of secrets kopiëren. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const QR = require('qrcode');
const out = path.resolve('_site');
const root = path.resolve('app/src/main/assets/www');
const version = (process.env.GITHUB_SHA || process.env.TB_VERSION || 'local').slice(0, 12);
const repo = process.env.GITHUB_REPOSITORY || 'robinvandenbroecke/tafelberg';
const base = process.env.TB_SITE_URL || `https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/`;
(async () => {
  fs.rmSync(out, {recursive: true, force: true});
  fs.cpSync(root, out, {recursive: true});
  fs.cpSync('web', out, {recursive: true});
  fs.mkdirSync(path.join(out, 'icons'), {recursive:true});
  const fg = 'app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png';
  for (const [name, size, fraction] of [['icon-192',192,.86],['icon-512',512,.86],['maskable-512',512,.68],['apple-touch-icon',180,.86]]) {
    const width = Math.round(size * fraction);
    const image = await sharp(fg).resize(width,width,{fit:'contain'}).png().toBuffer();
    await sharp({create:{width:size,height:size,channels:3,background:'#BBDDF3'}})
      .composite([{input:image,gravity:'centre'}]).png().toFile(path.join(out,'icons',name+'.png'));
  }
  fs.writeFileSync(path.join(out,'installeer/qr.svg'), await QR.toString(base+'installeer/',{type:'svg',margin:2,color:{dark:'#1F2A44',light:'#FFFFFF'}}));
  // Een optionele catalogus. Geen 404 in repositories zonder opgenomen stemmen.
  if (!fs.existsSync(path.join(out,'voice/clips.js'))) {
    fs.mkdirSync(path.join(out,'voice'),{recursive:true});
    fs.writeFileSync(path.join(out,'voice/clips.js'),'window.TB_CLIPS = {};\n');
  }
  let html = fs.readFileSync(path.join(out,'index.html'),'utf8');
  html = html.replace('</head>', `<meta name="theme-color" content="#B8D9F0">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Tafelberg">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" href="icons/icon-192.png">
</head>`);
  html = html.replace('<script src="js/app.js">','<script src="voice/clips.js"></script>\n<script src="web.js"></script>\n<script src="js/app.js">');
  fs.writeFileSync(path.join(out,'index.html'),html);
  const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(d => d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);
  const files = walk(out).map(p => './'+path.relative(out,p).split(path.sep).join('/')).filter(p => p!=='./sw.js').sort();
  let sw = fs.readFileSync('web/sw.js','utf8').replace('__VERSION__',JSON.stringify(version)).replace('__FILES__',JSON.stringify(files));
  fs.writeFileSync(path.join(out,'sw.js'),sw);
  fs.writeFileSync(path.join(out,'.nojekyll'),'');
  console.log(`Webapp ${version}: ${files.length} bestanden, ${base}`);
})().catch(e=>{console.error(e);process.exit(1);});
