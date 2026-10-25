const esbuild=require('esbuild'),fs=require('node:fs');
esbuild.buildSync({entryPoints:['server/password-entry.js'],bundle:true,format:'iife',globalName:'TBPassword',target:'es2020',outfile:'server/apps-script/Password.gs',legalComments:'inline'});
fs.copyFileSync('node_modules/@noble/hashes/LICENSE','server/apps-script/LICENSE-noble.txt');

fs.copyFileSync('app/src/main/assets/www/js/sync-rules.js','server/apps-script/Progress.gs');
