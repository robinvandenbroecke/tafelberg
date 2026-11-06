/* Zelfde ES5-regel in browser, APK en Apps Script: voortgang en voorkeuren afzonderlijk. */
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
  function clone(p) { return JSON.parse(JSON.stringify(p)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function preferences(p) { return { name: p.name, color: p.color, settings: clone(p.settings), stats: { mo: clone(p.stats.mo || {}) }, facts: {} }; }
  function reconcile(remote, local, base, afterRequest) {
    if (!local) return clone(remote);
    var chosen = clone(compare(local, remote) > 0 ? local : remote), key;
    chosen.id = remote.id; chosen.name = remote.name; chosen.color = remote.color; chosen.settings = clone(remote.settings);
    chosen.stats.mo = clone(remote.stats.mo || {});
    if (typeof TBRewards !== 'undefined') { TBRewards.merge(chosen, remote); TBRewards.merge(chosen, local); }
    if (!base) return chosen;
    function changed(value, old, server) { return !same(value, old) && (afterRequest || same(server, old)); }
    for (key in local.settings) if (Object.prototype.hasOwnProperty.call(local.settings, key) && key !== 'tables' && key !== 'excludedTables') {
      if (changed(local.settings[key], base.settings[key], remote.settings[key])) chosen.settings[key] = clone(local.settings[key]);
    }
    var localTables = [local.settings.tables, local.settings.excludedTables], baseTables = [base.settings.tables, base.settings.excludedTables], remoteTables = [remote.settings.tables, remote.settings.excludedTables];
    if (changed(localTables, baseTables, remoteTables)) { chosen.settings.tables = local.settings.tables.slice(); chosen.settings.excludedTables = (local.settings.excludedTables || []).slice(); }
    var wear = local.stats.mo || {}, oldWear = base.stats.mo || {}, remoteWear = remote.stats.mo || {};
    for (key in wear) if (Object.prototype.hasOwnProperty.call(wear, key) && changed(wear[key], oldWear[key], remoteWear[key])) chosen.stats.mo[key] = wear[key];
    if (changed(local.name, base.name, remote.name)) chosen.name = local.name;
    if (changed(local.color, base.color, remote.color)) chosen.color = local.color;
    return chosen;
  }
  return { rank: rank, compare: compare, preferences: preferences, reconcile: reconcile };
}());
