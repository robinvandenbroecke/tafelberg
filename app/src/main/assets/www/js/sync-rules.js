/* Zelfde ES5-regel in browser, APK en Apps Script: één volledige verste versie. */
var TBProgress = (function () {
  'use strict';
  function count(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0; }
  function rank(p) {
    var st = p && p.stats || {}, facts = p && p.facts || {}, mastery = 0;
    for (var k in facts) if (Object.prototype.hasOwnProperty.call(facts, k)) mastery += Math.min(5, count(facts[k].b));
    return [count(st.stars), count(st.rounds) + count(st.races) + count(st.sprints), mastery];
  }
  function compare(a, b) {
    var x = rank(a), y = rank(b);
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    return 0;
  }
  return { rank: rank, compare: compare };
}());
