/* Echt Postgres (PGlite), met dezelfde rollen en migratie als productie. */
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 const files=fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
 for(const f of files)await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query(`insert into auth.users values($1,'alice@example.test','{"username":"alice"}'),($2,'bob@example.test','{"username":"bob"}')`,[A,B]);
 async function as(user,sql,args=[]){
  await db.exec('begin; set local role authenticated;');
  try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);const r=await db.query(sql,args);await db.exec('commit');return r;}
  catch(e){await db.exec('rollback');throw e;}
 }
 const first={};
 async function playerSync(user,profile=null,revision=0,pid=null,create=false,key=null,base=null){return (await as(user,'select public.tb_sync($1::jsonb,$2,$3,$4,$5,$6::jsonb) as result',[profile&&JSON.stringify(profile),revision,pid,create,key,base&&JSON.stringify(base)])).rows[0].result;}
 async function list(user){return (await as(user,'select public.tb_list_profiles() as result')).rows[0].result;}
 async function create(user,profile=null,key='c'+require('node:crypto').randomBytes(32).toString('hex')){return playerSync(user,profile,0,null,true,key);}
 async function sync(user,profile=null,revision=0){if(!first[user]){const r=await create(user,profile);first[user]=r.user;return r;}return playerSync(user,profile,revision,first[user]);}
 return {db,as,sync,playerSync,list,create};
}
function profile(stars=0,rounds=0,b=0){return {id:'plocal',name:'Alice',color:0,created:0,settings:{tables:[5,10],excludedTables:[2],len:12,pace:'gewoon'},stats:{stars,rounds},facts:{'3x5':{b,n:1,c:1,due:0,last:0,rt:1500}}};}
async function test(){
 const {db,as,sync,playerSync,list,create}=await fixture();try{
 const C='33333333-3333-4333-8333-333333333333';
 await db.query("insert into auth.users values($1,'email-only@example.test','{}')",[C]);
 assert.equal((await list(C)).profiles.length,0,'Account zonder gebruikersnaam wordt bruikbaar');
 assert.equal((await create(C,profile(4))).profile.stats.stars,4);
 let r=await sync(A,profile(15));assert.equal(r.profile.stats.stars,15);assert.equal(r.revision,1);assert.match(r.user,/^p[a-f0-9]{32}$/);const aliceId=r.user;
 let bob=await sync(B,profile(2));assert.equal(bob.profile.stats.stars,2);
 assert.equal((await as(A,'select * from public.tafelberg_progress')).rows.length,1);
 await assert.rejects(as(A,'select public.tb_lookup_username(\'bob\')'));
 await assert.rejects(as(A,'select * from tafelberg_private.usernames'));
 await assert.rejects(as(A,'update public.tafelberg_progress set revision=100'));
 await assert.rejects(as(A,'delete from public.tafelberg_progress'));
 await assert.rejects(as(A,"select public.tb_rate_limit('x',10,60)"));
 r=await sync(A,profile(30),1);assert.equal(r.revision,2);
 r=await sync(A,profile(20,100,5),1);assert.equal(r.profile.stats.stars,30);assert.equal(r.revision,2);
 r=await sync(A,profile(30,1),1);assert.equal(r.profile.stats.rounds,1);assert.equal(r.revision,3);
 r=await sync(A,profile(30,1,4),1);assert.equal(r.profile.facts['3x5'].b,4);assert.equal(r.revision,4);
 const changed=profile(30,1,4);changed.settings.tables=[10];
 r=await sync(A,changed,1);assert.deepEqual(r.profile.settings.tables,[5,10]);assert.equal(r.revision,4);
 r=await sync(A,changed,4);assert.deepEqual(r.profile.settings.tables,[10]);assert.equal(r.revision,5);
 r=await sync(A,changed,4);assert.equal(r.revision,5,'Herhaalde verzending telt niet dubbel');
 for(const mutate of [p=>p.stats.stars=-1,p=>p.stats.rounds='99',p=>p.facts['3x5'].b=6,p=>p.settings.tables=[],p=>p.settings.tables=['2'],p=>p.settings.excludedTables=[11],p=>p.name='',p=>p.color=2.5]){
  const bad=profile();mutate(bad);await assert.rejects(sync(A,bad,5));
 }
 assert.equal((await sync(B)).profile.stats.stars,2,'Alice kan Bob niet wijzigen');
 const key='c'+'a'.repeat(64),child=await create(A,{...profile(7),name:'Tweede klimmer'},key);
 assert.notEqual(child.user,aliceId);assert.equal((await list(A)).profiles.length,2);
 assert.equal((await list(B)).profiles.length,1);
 assert.equal((await create(A,profile(99),key)).user,child.user,'Netwerkherhaling maakt geen dubbele klimmer');
 assert.equal((await playerSync(A,null,0,child.user)).profile.stats.stars,7);
 assert.equal((await playerSync(A,null,0,aliceId)).profile.stats.stars,30);
 await assert.rejects(playerSync(B,profile(99),1,child.user),'Ander account mag deze klimmer niet wijzigen');
 await assert.rejects(playerSync(B,null,0,child.user),'Ander account mag deze klimmer niet lezen');
 assert.equal((await as(A,'select * from public.tafelberg_progress')).rows.length,2);
 await db.exec('begin; set local role anon;');
 await assert.rejects(db.query('select public.tb_sync(null,0)'));await db.exec('rollback');
 await db.exec('begin; set local role service_role;');
 assert.equal((await db.query("select public.tb_lookup_username('alice') as email")).rows[0].email,'alice@example.test');
 assert.equal((await db.query("select public.tb_rate_limit('unit-test',1,60) as ok")).rows[0].ok,true);
 assert.equal((await db.query("select public.tb_rate_limit('unit-test',1,60) as ok")).rows[0].ok,false);
 await db.exec('rollback');
 // Instellingen reizen mee ongeacht de score, met een drie-wegvergelijking.
 const D='44444444-4444-4444-8444-444444444444';
 await db.query("insert into auth.users values($1,'settings@example.test','{}')",[D]);
 const initial=await create(D,{...profile(10),name:'Hector'}),base=initial.profile;
 const advanced={...base,stats:{stars:90,rounds:8}};
 const newer=await playerSync(D,advanced,initial.revision,initial.user);
 const offline=JSON.parse(JSON.stringify(base));offline.settings={tables:[4,8],excludedTables:[2,5,10],len:20,pace:'rustig',auto:false,tempo:false,div:true,sound:false,voice:false,vibrate:true,goal:'groot'};offline.color=3;offline.stats.mo={hat:'blue'};
 const saved=await playerSync(D,offline,initial.revision,initial.user,false,null,base);
 assert.equal(saved.profile.stats.stars,90);assert.deepEqual(saved.profile.settings,offline.settings);assert.equal(saved.profile.color,3);assert.deepEqual(saved.profile.stats.mo,{hat:'blue'});
 const retry=await playerSync(D,offline,initial.revision,initial.user,false,null,base);
 assert.equal(retry.revision,saved.revision,'Herhaalde instellingen-upload is idempotent');
 const stale=JSON.parse(JSON.stringify(base));stale.stats.stars=100;
 const kept=await playerSync(D,stale,initial.revision,initial.user,false,null,base);
 assert.deepEqual(kept.profile.settings,offline.settings,'Meer sterren overschrijven geen nieuwere voorkeuren');
 const conflict=JSON.parse(JSON.stringify(base));conflict.settings.pace='snel';
 assert.equal((await playerSync(D,conflict,initial.revision,initial.user,false,null,base)).profile.settings.pace,'rustig','Gelijktijdig gewijzigd veld behoudt bevestigde serverwaarde');
 // Dubbelen binnen hetzelfde account, geen optelling; oud ID en aanvraag-ID blijven bruikbaar.
 const duplicate={...profile(5),name:'  HECTOR  ',settings:{...offline.settings,goal:'klein'},facts:{'2x4':{b:3,n:7,last:200}}};
 const dupKey='c'+'d'.repeat(64),merged=await create(D,duplicate,dupKey);
 assert.equal((await list(D)).profiles.length,1);assert.equal(merged.profile.stats.stars,100);
 assert.equal(merged.profile.settings.goal,'klein');assert(merged.profile.facts['2x4']);assert(merged.profile.facts['3x5']);
 assert.equal((await create(D,{...duplicate,stats:{stars:999}},dupKey)).profile.stats.stars,100,'Herhaalde aanmaak telt niet opnieuw mee');
 const oldId=merged.user===initial.user?merged.merged[0]:initial.user;
 const oldRead=await playerSync(D,null,0,oldId);assert.equal(oldRead.user,merged.user);
 const oldWrite=await playerSync(D,{...duplicate,stats:{stars:120}},0,oldId);assert.equal(oldWrite.user,merged.user);assert.equal(oldWrite.profile.stats.stars,120);
 await assert.rejects(playerSync(B,null,0,oldId),'Alias geeft geen toegang tot een ander account');
 const distinct=await create(D,{...profile(),name:'Andere'});
 const rename={...distinct.profile,name:'hector'};
 await playerSync(D,rename,distinct.revision,distinct.user,false,null,distinct.profile);
 assert.equal((await list(D)).profiles.length,1,'Ook hernoemen voegt dezelfde namen samen');
 // Bestaande dubbelen worden bij ophalen samengevoegd en de oorspronkelijke rijen blijven bewaard.
 await db.query("insert into public.tafelberg_progress(owner_id,profile_id,profile) values($1,'plegacy',$2::jsonb)",[D,JSON.stringify({...profile(150),id:'plegacy',name:'Hector'})]);
 const migrated=await list(D);assert.equal(migrated.profiles.length,1);assert.equal(migrated.profiles[0].profile.stats.stars,150);
 assert((await db.query('select count(*)::int as n from public.tafelberg_progress where owner_id=$1 and merged_into is not null',[D])).rows[0].n>=3);
 console.log('Supabase Postgres: gebruikersscheiding, RLS, rolrechten, verste versie, revisies, herhalingen, validatie en limieten geslaagd.');
 }finally{await db.close();}
}
module.exports={fixture,profile,A,B};if(require.main===module)test().catch(e=>{console.error(e);process.exitCode=1;});
