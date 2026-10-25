/* Privé-spreadsheet; alleen rpc() is bereikbaar via google.script.run.
 * Alle helpers eindigen op _ zodat bezoekers ze niet rechtstreeks kunnen oproepen. */
var TB_ITERATIONS = 600000;
var TB_MAX_JSON = 44000;
function properties_() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('PEPPER')) p.setProperty('PEPPER', Utilities.getUuid() + Utilities.getUuid());
  return p;
}
function db_() {
  var id = properties_().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Online bewaren is nog niet beschikbaar.');
  return SpreadsheetApp.openById(id);
}
function table_(name) { var s=db_().getSheetByName(name); if(!s)throw new Error('Opslag niet beschikbaar.');return s; }
function find_(sheet,column,value) {
  if(sheet.getLastRow()<2)return null;
  var rows=sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
  for(var i=0;i<rows.length;i++)if(String(rows[i][column])===String(value))return {row:i+2,values:rows[i]};
  return null;
}
function safeCell_(v){v=String(v);return /^[=+@-]/.test(v)?"'"+v:v;}
function now_(){return new Date().toISOString();}
function random_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function digest_(s){return Utilities.computeHmacSha256Signature(String(s),properties_().getProperty('PEPPER')).map(function(x){return ('0'+((x+256)%256).toString(16)).slice(-2);}).join('');}
function equal_(a,b){a=String(a);b=String(b);var diff=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function limited_(key,max,seconds){var c=CacheService.getScriptCache(),n=Number(c.get(key)||0);if(n>=max)throw new Error('Even wachten en opnieuw proberen.');c.put(key,String(n+1),seconds);}
function username_(v){v=String(v||'').toLowerCase().replace(/^\s+|\s+$/g,'');if(!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(v))throw new Error('Kies 3 tot 30 letters, cijfers, streepjes of underscores.');return v;}
function pin_(v){if(typeof v!=='string'||!/^\d{6}$/.test(v))throw new Error('Gebruik een pincode van zes cijfers.');return v;}
function parse_(s){return JSON.parse(s,function(k,v){if(k==='__proto__'||k==='constructor'||k==='prototype'||k==='hasOwnProperty')throw new Error('Ongeldige gegevens.');return v;});}
function profile_(p,id){
  p=parse_(JSON.stringify(p));
  if(!p||typeof p.name!=='string'||p.name.length<1||p.name.length>20||typeof p.color!=='number'||p.color<0||p.color>7||!p.settings||!p.stats||!p.facts||Array.isArray(p.facts))throw new Error('Ongeldige voortgang.');
  if(!Array.isArray(p.settings.tables)||!p.settings.tables.length||p.settings.tables.some(function(n){return typeof n!=='number'||n<1||n>10||n%1;}))throw new Error('Ongeldige tafels.');
  p.id=id;var allowed={id:1,name:1,color:1,created:1,settings:1,stats:1,facts:1};
  Object.keys(p).forEach(function(k){if(!allowed[k])delete p[k];});
  var raw=JSON.stringify(p);if(raw.length>TB_MAX_JSON)throw new Error('De voortgang is te groot om online te bewaren. Maak een kopie.');
  return raw;
}
function state_(user){var found=find_(table_('Voortgang'),0,user);if(!found)throw new Error('Voortgang ontbreekt.');return {record:found,revision:Number(found.values[1]),profile:parse_(String(found.values[3]))};}
function session_(user,device){
  var token=random_(),created=now_(),expiry=new Date(Date.now()+30*86400000).toISOString();
  var s=table_('Sessies');if(s.getLastRow()>5000)throw new Error('Te veel aanmeldsessies. Neem contact op met de beheerder.');
  s.appendRow([random_(),user,String(device||'').slice(0,100),digest_(token),created,expiry,created,'']);
  return {token:token,expires:expiry};
}
function auth_(req){
  if(typeof req.token!=='string'||!/^[a-f0-9]{64}$/.test(req.token))throw new Error('Meld je opnieuw aan.');
  var s=table_('Sessies'),f=find_(s,3,digest_(req.token));
  if(!f||f.values[7]||Date.parse(f.values[5])<=Date.now())throw new Error('Meld je opnieuw aan.');
  return {user:String(f.values[1]),session:f};
}
function rpc(req){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return {ok:false,message:'Het is even druk. Probeer opnieuw.'};
  try{
    if(!req||JSON.stringify(req).length>100000)throw new Error('Ongeldige aanvraag.');
    limited_('requests',120,60);
    if(req.device && !/^[a-zA-Z0-9_-]{1,100}$/.test(req.device))throw new Error('Ongeldig toestel.');
    var action=req.action,users=table_('Spelers'),user,record,st,session;
    if(action==='register'){
      var name=username_(req.username);pin_(req.pin);limited_('registrations',30,3600);
      if(find_(users,1,name))throw new Error('Deze gebruikersnaam is al in gebruik.');
      if(users.getLastRow()>1000)throw new Error('Er kunnen voorlopig geen spelers meer bij.');
      user='p'+Utilities.getUuid().replace(/-/g,'');var salt=random_(),recovery=random_(),raw=profile_(req.profile,user);
      var hash=TBPassword.derive(req.pin,salt,properties_().getProperty('PEPPER'),TB_ITERATIONS),when=now_();
      // Eerst de voortgang, daarna het account. Een eventuele losse voortgang is onbereikbaar.
      table_('Voortgang').appendRow([user,1,2,raw,when,String(req.device||'').slice(0,100)]);
      users.appendRow([user,name,safeCell_(parse_(raw).name),hash,salt,'PBKDF2-HMAC-SHA256+pepper',JSON.stringify({iterations:TB_ITERATIONS}),when,when,0,'',digest_(recovery)]);
      session=session_(user,req.device);return {ok:true,user:user,username:name,token:session.token,revision:1,profile:parse_(raw),recovery:recovery};
    }
    if(action==='login'||action==='recover'){
      var username=username_(req.username);record=find_(users,1,username);
      limited_('login:'+digest_(username),10,900);
      if(!record)throw new Error('Gebruikersnaam of code klopt niet.');
      var v=record.values;
      if(v[10]&&Date.parse(v[10])>Date.now())throw new Error('Te vaak geprobeerd. Wacht 15 minuten.');
      var correct;
      if(action==='login'){pin_(req.pin);correct=equal_(TBPassword.derive(req.pin,String(v[4]),properties_().getProperty('PEPPER'),JSON.parse(v[6]).iterations),v[3]);}
      else {pin_(req.pin);correct=typeof req.recovery==='string'&&req.recovery.length===64&&equal_(digest_(req.recovery),v[11]);}
      if(!correct){v[9]=Number(v[9]||0)+1;if(v[9]>=5)v[10]=new Date(Date.now()+900000).toISOString();users.getRange(record.row,1,1,12).setValues([v]);throw new Error('Gebruikersnaam of code klopt niet.');}
      v[9]=0;v[10]='';v[8]=now_();
      if(action==='recover'){
        v[4]=random_();v[3]=TBPassword.derive(req.pin,v[4],properties_().getProperty('PEPPER'),TB_ITERATIONS);v[6]=JSON.stringify({iterations:TB_ITERATIONS});
        var sessions=table_('Sessies'),all=sessions.getLastRow()>1?sessions.getRange(2,1,sessions.getLastRow()-1,8).getValues():[];
        all.forEach(function(row,i){if(row[1]===v[0])sessions.getRange(i+2,8).setValue(now_());});
      }
      users.getRange(record.row,1,1,12).setValues([v]);st=state_(String(v[0]));session=session_(String(v[0]),req.device);
      return {ok:true,user:String(v[0]),username:username,token:session.token,revision:st.revision,profile:st.profile};
    }
    var auth=auth_(req);user=auth.user;
    if(action==='logout'){table_('Sessies').getRange(auth.session.row,8).setValue(now_());return {ok:true};}
    st=state_(user);
    if(action==='read')return {ok:true,revision:st.revision,profile:st.profile};
    if(action!=='write')throw new Error('Onbekende aanvraag.');
    if(typeof req.changeId!=='string'||!/^c[a-z0-9]{20,100}$/.test(req.changeId))throw new Error('Ongeldige wijziging.');
    var raw=profile_(req.profile,user),journal=table_('Rondes'),entry=find_(journal,0,req.changeId);
    if(entry){if(entry.values[1]!==user||entry.values[7]!==digest_(raw))throw new Error('Ongeldige herhaling.');return {ok:true,revision:st.revision,profile:st.profile};}
    var order=TBProgress.compare(parse_(raw),st.profile);
    if(order<0 || (order===0 && Number(req.revision)!==st.revision))return {ok:true,revision:st.revision,profile:st.profile,chosen:'remote'};
    if(JSON.stringify(st.profile)===raw)return {ok:true,revision:st.revision,profile:st.profile};
    var revision=st.revision+1,updated=now_();
    table_('Voortgang').getRange(st.record.row,1,1,6).setValues([[user,revision,2,raw,updated,String(req.device||'').slice(0,100)]]);
    // Auditlog van synchronisaties; geen onbewezen optelling van sterren of rondes.
    journal.appendRow([req.changeId,user,String(req.device||'').slice(0,100),'',updated,updated,st.revision,digest_(raw)]);
    return {ok:true,revision:revision,profile:parse_(raw)};
  }catch(e){return {ok:false,message:e.message||'Online bewaren lukt nu niet.'};}
  finally{lock.releaseLock();}
}
function doPost(e){var result;try{result=rpc(parse_(e.postData.contents));}catch(err){result={ok:false,message:'Ongeldige aanvraag.'};}return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);}
function doGet(e){
  var t=HtmlService.createTemplateFromFile('Bridge');
  t.channel=JSON.stringify(String((e&&e.parameter.channel)||'').replace(/[^a-f0-9]/g,'').slice(0,64));
  return t.evaluate().setTitle('Tafelberg verbinden').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
