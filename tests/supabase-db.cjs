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
 async function sync(user,profile=null,revision=0){return (await as(user,'select public.tb_sync($1::jsonb,$2) as result',[profile&&JSON.stringify(profile),revision])).rows[0].result;}
 return {db,as,sync};
}
function profile(stars=0,rounds=0,b=0){return {id:'plocal',name:'Alice',color:0,created:0,settings:{tables:[5,10],excludedTables:[2],len:12,pace:'gewoon'},stats:{stars,rounds},facts:{'3x5':{b,n:1,c:1,due:0,last:0,rt:1500}}};}
async function test(){
 const {db,as,sync}=await fixture();try{
 let r=await sync(A,profile(15));assert.equal(r.profile.stats.stars,15);assert.equal(r.revision,1);assert.equal(r.user,'p'+A.replaceAll('-',''));
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
 await db.exec('begin; set local role anon;');
 await assert.rejects(db.query('select public.tb_sync(null,0)'));await db.exec('rollback');
 await db.exec('begin; set local role service_role;');
 assert.equal((await db.query("select public.tb_lookup_username('alice') as email")).rows[0].email,'alice@example.test');
 assert.equal((await db.query("select public.tb_rate_limit('unit-test',1,60) as ok")).rows[0].ok,true);
 assert.equal((await db.query("select public.tb_rate_limit('unit-test',1,60) as ok")).rows[0].ok,false);
 await db.exec('rollback');
 console.log('Supabase Postgres: gebruikersscheiding, RLS, rolrechten, verste versie, revisies, herhalingen, validatie en limieten geslaagd.');
 }finally{await db.close();}
}
module.exports={fixture,profile,A,B};if(require.main===module)test().catch(e=>{console.error(e);process.exitCode=1;});
