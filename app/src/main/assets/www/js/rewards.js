/* Eén bron voor klimniveaus, kleding en de kroon. Sterren zijn een aparte oefenbeloning. */
var TBRewards = (function () {
  'use strict';
  var masteredBox = 4;
  var levels = [[0,'Wandelaar'],[5,'Padzoeker'],[12,'Rotsklimmer'],[22,'Touwklimmer'],[35,'Gletsjerloper'],[50,'Berggids'],[65,'Toppenjager'],[78,'Bergkampioen'],[90,'Sneeuwarend'],[100,'Tafelkoning']];
  var items = [
    {id:'muts',slot:'head',level:2,name:'een muts'},{id:'sjaal',slot:'neck',level:3,name:'een sjaal'},
    {id:'rugzak',slot:'back',level:4,name:'een rugzak'},{id:'bril',slot:'eyes',level:5,name:'een skibril'},
    {id:'helm',slot:'head',level:6,name:'een klimhelm'},{id:'vlag',slot:'hand',level:7,name:'een vlag'},
    {id:'medaille',slot:'neck',level:8,name:'een medaille'},{id:'ijsbijl',slot:'hand',level:9,name:'een ijsbijl'},
    {id:'kroon',slot:'head',level:10,name:'een kroon'}
  ];
  function count(pr) {
    var n=0,facts=pr.facts||{};
    for(var t=1;t<=10;t++)for(var a=1;a<=10;a++){var f=facts[a+'x'+t];if(f&&typeof f.b==='number'&&f.b>=masteredBox)n++;}
    return n;
  }
  function best(pr) {
    var st=pr.stats||{},n=st.masteredBest;
    if(typeof n!=='number'||n<0||n>100||n%1!==0)n=0;
    return Math.max(n,count(pr),st.badges&&st.badges.summit10?100:0);
  }
  function info(pr) {
    var known=count(pr),achieved=best(pr),i=0;
    while(i+1<levels.length&&achieved>=levels[i+1][0])i++;
    var last=i===levels.length-1,from=levels[i][0],to=last?100:levels[i+1][0];
    return {n:i+1,title:levels[i][1],next:last?null:levels[i+1][1],need:last?0:Math.max(0,to-known),frac:last?1:Math.max(0,Math.min(1,(known-from)/(to-from))),mastered:known,best:achieved};
  }
  function update(pr) {
    var st=pr.stats,gained=[];st.masteredBest=best(pr);st.wardrobe=st.wardrobe||{};
    var level=info(pr).n;
    for(var i=0;i<items.length;i++)if(items[i].level<=level&&!st.wardrobe[items[i].id]){st.wardrobe[items[i].id]=true;gained.push(items[i]);}
    return gained;
  }
  function init(pr,legacy) {
    var st=pr.stats;
    if(legacy){
      // Bestaande gewone kleding blijft beschikbaar. De kroon hoort uitsluitend bij alle tafels.
      var costs=[15,40,80,140,220,320,450,620];
      for(var i=0;i<costs.length;i++)if(st.stars>=costs[i]||st.mo&&st.mo[items[i].slot]===items[i].id)st.wardrobe[items[i].id]=true;
    }
    st.rewardsVersion=1;update(pr);
  }
  function owns(pr,item){return item.id==='kroon'?best(pr)===100:!!(pr.stats.wardrobe&&pr.stats.wardrobe[item.id])||info(pr).n>=item.level;}
  function wear(pr){var out={},mo=pr.stats.mo||{};for(var k in mo)if(Object.prototype.hasOwnProperty.call(mo,k)&&!(mo[k]==='kroon'&&best(pr)<100))out[k]=mo[k];return out;}
  function merge(pr,other){
    if(!other)return pr;
    pr.stats.masteredBest=Math.max(best(pr),best(other));pr.stats.rewardsVersion=1;
    var owned=pr.stats.wardrobe||{},extra=other.stats.wardrobe||{};
    for(var i=0;i<items.length;i++)if(extra[items[i].id]===true)owned[items[i].id]=true;
    pr.stats.wardrobe=owned;return pr;
  }
  return {master:masteredBox,levels:levels,items:items,count:count,best:best,info:info,update:update,init:init,owns:owns,wear:wear,merge:merge};
}());
