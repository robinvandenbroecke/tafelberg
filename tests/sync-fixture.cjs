const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function fixture(){
 let clock=Date.now();const sheets={},properties={SPREADSHEET_ID:'test-sheet'},cache=new Map();
 class Range{constructor(sheet,row,col,height=1,width=1){Object.assign(this,{sheet,row,col,height,width});}getValues(){return Array.from({length:this.height},(_,i)=>Array.from({length:this.width},(_,j)=>(this.sheet.rows[this.row+i-1]||[])[this.col+j-1]??''));}setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>{this.sheet.rows[this.row+i-1]??=[];this.sheet.rows[this.row+i-1][this.col+j-1]=v;}));return this;}setValue(v){return this.setValues([[v]]);}}
 class Sheet{constructor(width){this.width=width;this.rows=[Array(width).fill('header')];}getLastRow(){return this.rows.length;}getLastColumn(){return this.width;}getRange(...args){return new Range(this,...args);}appendRow(row){this.rows.push(JSON.parse(JSON.stringify(row)));}}
 for(const [name,width]of [['Spelers',12],['Voortgang',6],['Rondes',8],['Sessies',8]])sheets[name]=new Sheet(width);
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 let locked=false;
 const context=vm.createContext({Date:FakeDate,JSON,Math,Object,Array,String,Number,Error,isFinite,Uint8Array,Uint32Array,DataView,TextEncoder,TextDecoder,console,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>{properties[k]=v;}})},
 SpreadsheetApp:{openById:id=>{if(id!=='test-sheet')throw Error('unexpected spreadsheet');return {getSheetByName:n=>sheets[n]};}},
 CacheService:{getScriptCache:()=>({get:k=>{const e=cache.get(k);return e&&e.expires>clock?e.value:null;},put:(k,value,seconds)=>cache.set(k,{value,expires:clock+seconds*1000})})},
 LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},
 Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(s,key)=>Array.from(crypto.createHmac('sha256',key).update(s).digest()).map(v=>v>127?v-256:v)}
 });
 for(const file of ['Password.gs','Progress.gs','Code.gs'])vm.runInContext(fs.readFileSync('server/apps-script/'+file,'utf8'),context);
 context.TB_ITERATIONS=1000;
 return {context,sheets,rpc:r=>JSON.parse(JSON.stringify(context.rpc(JSON.parse(JSON.stringify(r))))),advance:ms=>{clock+=ms;}};
}
function profile(name='Klimmer',stars=0,rounds=0){return {id:'plocal',name,color:0,created:1,settings:{tables:[2,5,10],len:12,div:false,sound:false,vibrate:false,auto:true,pace:'auto',tempo:true,goal:'gewoon',voice:false},facts:{},stats:{stars,rounds}};}
module.exports={fixture,profile};
