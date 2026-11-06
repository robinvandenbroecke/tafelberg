/* Werkelijke Edge-handler + Postgres; alleen de externe Supabase Auth-service is nagebootst. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {fixture,A,B}=require('./supabase-db.cjs');
async function backend(){
 const f=await fixture(),users={},tokens={},refreshes={},settings={confirmation:false};let serial=0;
 function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
 function session(user){const token='access-'+(++serial),refresh='refresh-'+serial;tokens[token]=user;refreshes[refresh]=user;return {access_token:token,refresh_token:refresh,expires_in:3600,user:{id:user.id}};}
 const authCalls=[];
 async function fetcher(url,opts){
  const u=new URL(url),data=opts.body?JSON.parse(opts.body):null,token=opts.headers.Authorization.replace(/^Bearer /,'');authCalls.push({path:u.pathname,admin:opts.headers.apikey==='server-secret'});
  if(u.pathname==='/auth/v1/signup'){
   if(users[data.email])return response({message:'exists'},400);
   const id=data.email==='alice@example.test'?A:data.email==='bob@example.test'?B:crypto.randomUUID();
   if(id!==A&&id!==B)await f.db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,data.email,JSON.stringify(data.data)]);
   const user={id,email:data.email,password:data.password};users[data.email]=user;
   return response(settings.confirmation?{user:{id:user.id}}:session(user));
  }
  if(u.pathname==='/auth/v1/token'){
   if(u.searchParams.get('grant_type')==='refresh_token'){
    const user=refreshes[data.refresh_token];if(!user)return response({},401);delete refreshes[data.refresh_token];return response(session(user));
   }
   const user=users[data.email];return user&&user.password===data.password?response(session(user)):response({},400);
  }
  if(u.pathname==='/auth/v1/user'){
   const user=tokens[token];if(!user)return response({},401);
   if(opts.method==='PUT')user.password=data.password;
   return response({id:user.id,email:user.email});
  }
  if(u.pathname==='/auth/v1/logout'){delete tokens[token];return response({});}
  if(u.pathname==='/auth/v1/recover')return response({});
  if(u.pathname==='/rest/v1/rpc/tb_rate_limit')return response(true);
  if(u.pathname==='/rest/v1/rpc/tb_lookup_username'){
   assert.equal(opts.headers.apikey,'server-secret');const r=await f.db.query('select public.tb_lookup_username($1) as email',[data.wanted]);return response(r.rows[0].email);
  }
  if(u.pathname==='/rest/v1/rpc/tb_list_profiles'){
   assert.equal(opts.headers.apikey,'public-key');const user=tokens[token];if(!user)return response({},401);
   return response(await f.list(user.id));
  }
  if(u.pathname==='/rest/v1/rpc/tb_sync'){
   assert.equal(opts.headers.apikey,'public-key','Voortgang gebruikt de gebruikerssessie, niet de beheersleutel');
   const user=tokens[token];if(!user)return response({},401);
   try{return response(await f.playerSync(user.id,data.candidate,data.base_revision,data.requested_profile,data.create_new,data.request_key,data.base_profile));}catch{return response({},400);}
  }
  throw Error('Onverwacht verzoek: '+u.pathname);
 }
 const source=fs.readFileSync('supabase/functions/tafelberg/index.ts','utf8');
 const {createHandler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const handler=createHandler({url:'https://test.supabase.co',anonKey:'public-key',serviceKey:'server-secret'},fetcher);
 async function rpc(body,origin='https://robinvandenbroecke.github.io',method='POST'){
  const r=await handler(new Request('https://test.supabase.co/functions/v1/tafelberg',{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
  return {status:r.status,data:r.status===204?null:await r.json()};
 }
 return {...f,handler,rpc,authCalls,tokens,users,settings};
}
async function test(){
 const b=await backend();try{
 const {profile}=require('./supabase-db.cjs');
 let r=await b.rpc({action:'register',username:'alice',email:'alice@example.test',password:'Alice-password-123',profile:profile(15)});assert(r.data.ok);const alice=r.data;assert.deepEqual(alice.profiles,[]);
 r=await b.rpc({action:'create',token:alice.token,profile:profile(15),changeId:'c'+'1'.repeat(64)});assert(r.data.ok);const alicePlayer=r.data.user;
 r=await b.rpc({action:'create',token:alice.token,profile:{...profile(7),name:'Basil'},changeId:'c'+'2'.repeat(64)});assert(r.data.ok);const basil=r.data.user;
 r=await b.rpc({action:'register',username:'bob',email:'bob@example.test',password:'Bob-password-123',profile:profile(2)});assert(r.data.ok);const bob=r.data;
 r=await b.rpc({action:'create',token:bob.token,profile:profile(2),changeId:'c'+'3'.repeat(64)});assert(r.data.ok);const bobPlayer=r.data.user;
 r=await b.rpc({action:'login',username:'alice',password:'wrong'});assert.equal(r.data.ok,false);const failure=r.data.message;
 r=await b.rpc({action:'login',username:'unknown',password:'wrong'});assert.equal(r.data.message,failure);
 r=await b.rpc({action:'read',token:bob.token,player:alicePlayer});assert.equal(r.data.ok,false);
 r=await b.rpc({action:'read',token:bob.token,player:bobPlayer});assert.equal(r.data.profile.stats.stars,2);
 r=await b.rpc({action:'list',token:alice.token});assert.equal(r.data.profiles.length,2);
 r=await b.rpc({action:'read',token:alice.token,player:basil});assert.equal(r.data.profile.stats.stars,7);
 r=await b.rpc({action:'refresh',refresh:alice.refresh});assert(r.data.ok);const fresh=r.data;
 r=await b.rpc({action:'refresh',refresh:'invalid'});assert(r.data.authExpired);
 r=await b.rpc({action:'write',player:alicePlayer,token:fresh.token,profile:profile(30),revision:1});assert.equal(r.data.profile.stats.stars,30);
 r=await b.rpc({action:'write',player:alicePlayer,token:alice.token,profile:profile(20),revision:1});assert.equal(r.data.profile.stats.stars,30);
 r=await b.rpc({action:'read',token:'forged'});assert(r.data.authExpired);
 r=await b.rpc({action:'read',token:alice.token},'https://evil.example');assert.equal(r.status,403);
 r=await b.rpc({},'https://robinvandenbroecke.github.io','OPTIONS');assert.equal(r.status,204);
 r=await b.rpc({action:'recover',username:'alice'});assert(r.data.ok);const recovery=r.data.message;
 r=await b.rpc({action:'recover',username:'missing'});assert.equal(r.data.message,recovery);
 r=await b.rpc({action:'reset',token:alice.token,password:'New-password-123'});assert(r.data.ok);
 r=await b.rpc({action:'login',username:'alice',password:'New-password-123'});assert(r.data.ok);
 assert(!JSON.stringify(r.data).includes('server-secret'));assert(!JSON.stringify(r.data).includes('New-password-123'));
 r=await b.rpc({action:'logout',token:alice.token});assert(r.data.ok);
 r=await b.rpc({action:'read',token:alice.token});assert(r.data.authExpired);
 // Nieuwe accounts hebben alleen e-mail en wachtwoord; bestaande namen blijven compatibel.
 r=await b.rpc({action:'register',email:'short@example.test',password:'Seven12'});assert.equal(r.status,400,'Registratie weigert zeven tekens');
 r=await b.rpc({action:'register',email:'email-only@example.test',password:'Eight-12'});assert(r.data.ok);assert.equal(r.data.email,'email-only@example.test');const emailOnly=r.data;
 r=await b.rpc({action:'login',email:' EMAIL-ONLY@EXAMPLE.TEST ',password:'Eight-12'});assert(r.data.ok);assert.equal(r.data.account,emailOnly.account);
 r=await b.rpc({action:'reset',token:emailOnly.token,password:'Seven12'});assert.equal(r.status,400,'Herstel weigert zeven tekens');
 r=await b.rpc({action:'reset',token:emailOnly.token,password:'Other-12'});assert(r.data.ok,'Herstel accepteert acht tekens');
 r=await b.rpc({action:'login',email:'email-only@example.test',password:'Other-12'});assert(r.data.ok);
 r=await b.rpc({action:'login',email:'missing@example.test',password:'wrong'});assert.equal(r.data.message,failure);
 r=await b.rpc({action:'recover',email:'email-only@example.test'});assert.equal(r.data.message,recovery);
 r=await b.rpc({action:'login',email:'bad',password:'wrong'});assert.equal(r.status,400);
 r=await b.rpc({action:'register',username:'tiny',email:'bad',password:'123'});assert.equal(r.status,400);
 console.log('Supabase Edge: aanmelden, wachtwoorden, verversen, eigenaarcontrole, herstel, CORS, afmelden en foutmeldingen geslaagd.');
 }finally{await b.db.close();}
}
module.exports={backend};if(require.main===module)test().catch(e=>{console.error(e);process.exitCode=1;});
