// Lees de zichtbare Nederlandse opdracht, zonder een antwoord uit de app op te vragen.
function readNumber(text) {
 const small=['nul','een','twee','drie','vier','vijf','zes','zeven','acht','negen','tien','elf','twaalf','dertien','veertien','vijftien','zestien','zeventien','achttien','negentien'];
 const tens={twintig:20,dertig:30,veertig:40,vijftig:50,zestig:60,zeventig:70,tachtig:80,negentig:90};
 function part(word){
  if(!word)return 0;
  if(word.includes('duizend')){const [a,b]=word.split('duizend');return part(a)*1000+part(b);}
  if(word.includes('honderd')){const [a,b]=word.split('honderd');return (a?part(a):1)*100+part(b);}
  if(small.includes(word))return small.indexOf(word);
  for(const [t,n] of Object.entries(tens))if(word.endsWith(t)){
   const prefix=word.slice(0,-t.length);if(!prefix)return n;
   const unit=prefix.replace(/(?:ën|en)$/,'');if(small.includes(unit))return n+small.indexOf(unit);
  }
  throw Error('Onleesbaar getal: '+word);
 }
 return part(text);
}
async function unlock(page){
 if(!await page.locator('.parent-control').count())return;
 const number=readNumber(await page.locator('.parent-number').textContent());
 if(number<21000||number>98999)throw Error('Geen vijfcijferige ouderopdracht');
 await page.getByRole('textbox',{name:'Getal in cijfers',exact:true}).fill(String(number));
 await page.getByRole('button',{name:'Doorgaan',exact:true}).click();
 await page.locator('.parent-control').waitFor({state:'hidden'});
}
module.exports={unlock,readNumber};
