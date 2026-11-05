const assert=require('node:assert/strict');require('../app/src/main/assets/www/js/profile-merge.js');
const merge=globalThis.FamilyProfileMerge;
const a={id:'pa',name:'Hector',color:0,settings:{tables:[3],len:12},stats:{stars:100,rounds:1,hist:[{d:'2026-11-5',acc:1}]},facts:{'2x3':{b:1,last:200,n:4,c:3,best:2000}}};
const b={id:'pb',name:'Hector',color:0,settings:{tables:[2],len:8},stats:{stars:80,rounds:1,hist:[{d:'2026-11-4',acc:1}]},facts:{'2x3':{b:5,last:100,n:3,c:3,best:1000},'3x4':{b:2,last:100,n:1,c:1}}};
const result=merge.tafelberg(a,b,'pa');assert.equal(result.stats.stars,100);assert.equal(result.stats.rounds,2);assert.equal(result.facts['2x3'].b,1);assert.equal(result.facts['2x3'].best,1000);assert(result.facts['3x4']);assert.deepEqual(result.settings,a.settings);assert.deepEqual(merge.tafelberg(result,b,'pa'),result);
console.log('Family profile merge: unique history, latest evidence, preserved facts and idempotence passed.');
