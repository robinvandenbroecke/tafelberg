const fs=require('node:fs'),path=require('node:path'),acorn=require('acorn');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);}
for(const file of walk('app/src/main/assets/www').concat(walk('web')).filter(f=>f.endsWith('.js')&&!f.endsWith('/sw.js'))){
 acorn.parse(fs.readFileSync(file,'utf8'),{ecmaVersion:5});console.log('ES5: '+file);
}
