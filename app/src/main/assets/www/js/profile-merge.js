/* Shared ES5 merge rules for the app family. Never add overlapping counters. */
(function (root) {
  'use strict';
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function keys(v) { return Object.keys(v || {}).filter(function (k) { return ['__proto__','constructor','prototype','hasOwnProperty'].indexOf(k)<0; }); }
  function stable(v) { return v===null || typeof v!=='object' ? JSON.stringify(v) : Array.isArray(v) ? '['+v.map(stable).join(',')+']' : '{'+keys(v).sort().map(function(k){return JSON.stringify(k)+':'+stable(v[k]);}).join(',')+'}'; }
  function day(v) { var p=String(v||'').split('-');return p.length===3?Date.UTC(Number(p[0]),Number(p[1])-1,Number(p[2])):0; }
  function union(a,b,key) {
    key=key||stable;var out=copy(a||[]),seen={},used={};
    (a||[]).forEach(function(v){var k=key(v);seen[k]=(seen[k]||0)+1;});
    (b||[]).forEach(function(v){var k=key(v);used[k]=(used[k]||0)+1;if(used[k]>(seen[k]||0))out.push(copy(v));});return out;
  }
  function unique(a,b,key) { key=key||stable;var seen={};return union(a,b,key).filter(function(v){var k=key(v);if(seen[k])return false;seen[k]=true;return true;}); }
  function positiveMin(a,b) { return a>0&&b>0?Math.min(a,b):Math.max(a||0,b||0); }
  function evidence(a,b,path) {
    if(a===undefined)return copy(b);if(b===undefined)return copy(a);
    if(typeof a==='number'&&typeof b==='number')return /(^|\.)(best|sprintBest)$/.test(path)?positiveMin(a,b):Math.max(a,b);
    if(typeof a==='boolean'&&typeof b==='boolean')return a||b;
    if(Array.isArray(a)&&Array.isArray(b))return union(a,b);
    if(a&&b&&typeof a==='object'&&typeof b==='object'){
      var out=copy(a);keys(b).forEach(function(k){out[k]=evidence(a[k],b[k],path+'.'+k);});return out;
    }
    return copy(a);
  }
  function tafelberg(primary,other,id) {
    if(!other){var only=copy(primary);only.id=id||primary.id;return only;}
    var out=copy(primary),a=primary.stats||{},b=other.stats||{},stats=evidence(a,b,'stats');
    stats.hist=union(a.hist,b.hist,function(v){var x=copy(v);x.d=day(x.d);return stable(x);}).sort(function(x,y){return day(x.d)-day(y.d);});
    stats.played=unique(a.played,b.played,day).sort(function(x,y){return day(x)-day(y);});
    stats.days=Math.max(stats.days||0,stats.played.length);stats.rounds=Math.max(stats.rounds||0,stats.hist.length);
    if(a.lm||b.lm)stats.lm=copy(a.lm&&(a.lm.n||0)>=(b.lm&&b.lm.n||0)?a.lm:b.lm);
    if(a.today||b.today){var ta=a.today||{},tb=b.today||{};stats.today=day(ta.d)===day(tb.d)?evidence(ta,tb,'today'):copy(day(ta.d)>day(tb.d)?ta:tb);}
    if(day(b.lastDay)>day(a.lastDay))stats.lastDay=b.lastDay;
    stats.badges=copy(a.badges||{});keys(b.badges).forEach(function(k){if(!stats.badges[k]||day(b.badges[k])<day(stats.badges[k]))stats.badges[k]=b.badges[k];});
    stats.hutDays=unique(a.hutDays,b.hutDays,day);
    var facts=copy(primary.facts||{});keys(other.facts).forEach(function(k){
      var x=facts[k],y=other.facts[k];if(!x){facts[k]=copy(y);return;}
      // Box, due time and pace follow the latest observation, not an old high box.
      var latest=(x.last||0)>=(y.last||0)?x:y,v=copy(latest);
      if(x.n!==undefined||y.n!==undefined)v.n=Math.max(x.n||0,y.n||0);
      if(x.c!==undefined||y.c!==undefined)v.c=Math.max(x.c||0,y.c||0);
      if(x.best!==undefined||y.best!==undefined)v.best=positiveMin(x.best,y.best);facts[k]=v;
    });
    out.id=id||primary.id;out.stats=stats;out.facts=facts;return out;
  }
  function rekenrinkel(primary,other,id) {
    if(!other){var only=copy(primary);only.id=id||primary.id;return only;}
    var out=copy(primary),skills=copy(primary.skills||{});
    keys(other.skills).forEach(function(k){var a=skills[k],b=other.skills[k];if(!a){skills[k]=copy(b);return;}
      var latest=(a.last||0)>=(b.last||0)?a:b,v=copy(latest);
      v.attempts=union(a.attempts,b.attempts).sort(function(x,y){return (x.at||0)-(y.at||0);}).slice(-16);
      v.correct=Math.max(a.correct||0,b.correct||0);v.incorrect=Math.max(a.incorrect||0,b.incorrect||0);skills[k]=v;
    });
    out.skills=skills;out.completed=unique(primary.completed,other.completed).slice(-128);
    out.rewards=evidence(primary.rewards,other.rewards,'rewards');
    ['days','stickers','wardrobe'].forEach(function(k){out.rewards[k]=unique(primary.rewards[k],other.rewards[k]);});
    out.rewards.rounds=Math.max(out.rewards.rounds,out.completed.length);
    out.round=copy(primary.round||other.round||null);out.updated=Math.max(primary.updated||0,other.updated||0);out.id=id||primary.id;
    return out;
  }
  root.FamilyProfileMerge={tafelberg:tafelberg,rekenrinkel:rekenrinkel};
}(typeof globalThis==='object'?globalThis:this));
