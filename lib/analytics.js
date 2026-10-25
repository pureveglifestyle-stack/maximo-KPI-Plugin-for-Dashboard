/*
 * OpsLens – KPI and aggregation functions. Pure, no DOM, no network.
 */
var OpsAnalytics = (function () {
  const DAY = 86400000;
  const CLOSED = new Set(['COMP', 'CLOSE', 'CAN', 'CANCEL', 'CANCELLED', 'CLOSED', 'COMPLETE', 'COMPLETED', 'RESOLVED']);
  const CANCELLED = new Set(['CAN', 'CANCEL', 'CANCELLED']);
  const EMERGENCY_TYPES = new Set(['EM', 'EMERG', 'EMERGENCY', 'BRKDWN', 'BD']);
  const RUNNING_ASSET = new Set(['OPERATING', 'ACTIVE', 'OPERATIONAL', 'IN SERVICE', 'INSERVICE']);

  const up = (v) => (v === undefined || v === null ? '' : String(v).toUpperCase());
  const d = (v) => (v ? new Date(v) : null);
  const valid = (x) => x instanceof Date && !isNaN(x);

  function isCancelled(w) { return CANCELLED.has(up(w.status)); }
  function isClosed(w) { return w.historyflag === true || CLOSED.has(up(w.status)); }
  function isOpen(w) { return !isClosed(w); }
  function isCompleted(w) { return !isCancelled(w) && (CLOSED.has(up(w.status)) || !!w.actfinish); }
  function dueDate(w) { return d(w.targcompdate || w.schedfinish || w.targetfinish); }
  function isOverdue(w, now) {
    const due = dueDate(w);
    return isOpen(w) && valid(due) && due < now;
  }
  function isEmergency(w) { return EMERGENCY_TYPES.has(up(w.worktype)) || Number(w.wopriority) === 1; }
  function completedDate(w) { return d(w.actfinish || (CLOSED.has(up(w.status)) && !isCancelled(w) ? w.statusdate : null)); }

  function countBy(rows, fn, blank = '(none)') {
    const m = new Map();
    rows.forEach((r) => {
      const k = fn(r);
      const label = k === undefined || k === null || k === '' ? blank : String(k);
      m.set(label, (m.get(label) || 0) + 1);
    });
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }

  function top(list, n) {
    if (list.length <= n) return list;
    const head = list.slice(0, n);
    const rest = list.slice(n).reduce((s, x) => s + x.value, 0);
    return head.concat([{ label: 'Other', value: rest, other: true }]);
  }

  /** Time buckets (weekly when range ≤ 120 days, otherwise monthly). */
  function buckets(rangeDays, now) {
    const out = [];
    if (rangeDays <= 120) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
      const n = Math.ceil(rangeDays / 7);
      for (let i = n - 1; i >= 0; i--) {
        const s = new Date(start.getTime() - i * 7 * DAY);
        const e = new Date(s.getTime() + 7 * DAY);
        out.push({ start: s, end: e, label: s.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) });
      }
    } else {
      const n = Math.ceil(rangeDays / 30.4);
      for (let i = n - 1; i >= 0; i--) {
        const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        out.push({ start: s, end: e, label: s.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) });
      }
    }
    return out;
  }

  function series(rows, dateFn, bks) {
    return bks.map((b) => rows.reduce((n, r) => {
      const x = dateFn(r);
      return n + (valid(x) && x >= b.start && x < b.end ? 1 : 0);
    }, 0));
  }

  function avg(nums) {
    const v = nums.filter((n) => isFinite(n));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  function workOrders(wos, rangeDays, now = new Date()) {
    const from = new Date(now.getTime() - rangeDays * DAY);
    const open = wos.filter(isOpen);
    const overdue = open.filter((w) => isOverdue(w, now));
    const createdInRange = wos.filter((w) => valid(d(w.reportdate)) && d(w.reportdate) >= from);
    const completedInRange = wos.filter((w) => isCompleted(w) && valid(completedDate(w)) && completedDate(w) >= from);

    const durations = completedInRange.map((w) => {
      const s = d(w.actstart) || d(w.reportdate);
      const e = completedDate(w);
      return valid(s) && valid(e) && e >= s ? (e - s) / 3600000 : NaN;
    });

    // PM compliance: PM work orders due in range that were completed on/before due date.
    const pmDue = wos.filter((w) => w.pmnum && !isCancelled(w) && valid(dueDate(w)) && dueDate(w) >= from && dueDate(w) <= now);
    const pmOnTime = pmDue.filter((w) => isCompleted(w) && valid(completedDate(w)) && completedDate(w) <= new Date(dueDate(w).getTime() + DAY));

    const aging = [
      { label: '0–7 d', min: 0, max: 7 },
      { label: '8–30 d', min: 8, max: 30 },
      { label: '31–90 d', min: 31, max: 90 },
      { label: '91–180 d', min: 91, max: 180 },
      { label: '> 180 d', min: 181, max: Infinity }
    ].map((b) => ({
      label: b.label,
      value: open.filter((w) => {
        const r = d(w.reportdate);
        if (!valid(r)) return false;
        const age = Math.floor((now - r) / DAY);
        return age >= b.min && age <= b.max;
      }).length
    }));

    const bks = buckets(rangeDays, now);
    const assetCounts = countBy(wos.filter((w) => w.assetnum && valid(d(w.reportdate)) && d(w.reportdate) >= from && !w.pmnum), (w) => w.assetnum);

    return {
      total: wos.length,
      open: open.length,
      overdue: overdue.length,
      overduePct: open.length ? (overdue.length / open.length) * 100 : 0,
      emergencyOpen: open.filter(isEmergency).length,
      created: createdInRange.length,
      completed: completedInRange.length,
      avgCompletionHours: avg(durations),
      pmCompliance: pmDue.length ? (pmOnTime.length / pmDue.length) * 100 : null,
      pmDue: pmDue.length,
      backlogHours: open.reduce((s, w) => s + (Number(w.estdur) || 0), 0),
      actualHours: completedInRange.reduce((s, w) => s + (Number(w.actlabhrs) || 0), 0),
      actualCost: completedInRange.reduce((s, w) => s + (Number(w.acttotalcost) || 0), 0),
      trend: {
        labels: bks.map((b) => b.label),
        created: series(wos, (w) => d(w.reportdate), bks),
        completed: series(wos.filter(isCompleted), completedDate, bks)
      },
      byStatus: countBy(wos, (w) => w.status),
      byWorkType: countBy(wos, (w) => w.worktype),
      openByPriority: countBy(open, (w) => w.wopriority).sort((a, b) => (Number(a.label) || 99) - (Number(b.label) || 99)),
      bySite: countBy(wos, (w) => w.siteid),
      byOwnerGroup: countBy(open, (w) => w.ownergroup || w.owner),
      topAssets: assetCounts.slice(0, 10),
      aging,
      overdueList: overdue.sort((a, b) => dueDate(a) - dueDate(b))
    };
  }

  function serviceRequests(srs, rangeDays, now = new Date()) {
    const from = new Date(now.getTime() - rangeDays * DAY);
    const open = srs.filter(isOpen);
    const inRange = srs.filter((s) => valid(d(s.reportdate)) && d(s.reportdate) >= from);
    const closedInRange = srs.filter((s) => !isOpen(s) && valid(d(s.actualfinish)) && d(s.actualfinish) >= from);
    const days = closedInRange.map((s) => (d(s.actualfinish) - d(s.reportdate)) / DAY);
    const bks = buckets(rangeDays, now);
    return {
      created: inRange.length,
      open: open.length,
      closed: closedInRange.length,
      overdue: open.filter((s) => valid(d(s.targetfinish)) && d(s.targetfinish) < now).length,
      avgResolutionDays: avg(days.filter((x) => x >= 0)),
      byStatus: countBy(srs, (s) => s.status),
      byPriority: countBy(srs, (s) => s.reportedpriority || s.internalpriority).sort((a, b) => (Number(a.label) || 99) - (Number(b.label) || 99)),
      bySite: countBy(srs, (s) => s.siteid),
      trend: { labels: bks.map((b) => b.label), created: series(srs, (s) => d(s.reportdate), bks), closed: series(srs, (s) => d(s.actualfinish), bks) },
      openList: open.sort((a, b) => (d(a.reportdate) || 0) - (d(b.reportdate) || 0))
    };
  }

  function assets(list, total) {
    const running = list.filter((a) => (a.isrunning === undefined ? RUNNING_ASSET.has(up(a.status)) : a.isrunning !== false && RUNNING_ASSET.has(up(a.status))));
    return {
      total: total || list.length,
      sampled: list.length,
      running: running.length,
      notRunning: list.length - running.length,
      availabilityPct: list.length ? (running.length / list.length) * 100 : null,
      byStatus: countBy(list, (a) => a.status),
      byType: countBy(list, (a) => a.assettype),
      bySite: countBy(list, (a) => a.siteid)
    };
  }

  function pms(list, now = new Date()) {
    const active = list.filter((p) => !p.status || up(p.status) === 'ACTIVE');
    const overdue = active.filter((p) => valid(d(p.nextdate)) && d(p.nextdate) < now);
    const next30 = active.filter((p) => valid(d(p.nextdate)) && d(p.nextdate) >= now && d(p.nextdate) < new Date(now.getTime() + 30 * DAY));
    const weeks = [0, 1, 2, 3].map((i) => {
      const s = new Date(now.getTime() + i * 7 * DAY);
      const e = new Date(now.getTime() + (i + 1) * 7 * DAY);
      return { label: i === 0 ? 'This week' : '+' + i + ' wk', value: active.filter((p) => valid(d(p.nextdate)) && d(p.nextdate) >= s && d(p.nextdate) < e).length };
    });
    return {
      active: active.length,
      overdue: overdue.length,
      next30: next30.length,
      byFrequency: countBy(active, (p) => (p.frequency ? p.frequency + ' ' + (p.frequnit || '') : null)).slice(0, 10),
      upcoming: [{ label: 'Overdue', value: overdue.length }].concat(weeks),
      list: overdue.concat(next30).sort((a, b) => d(a.nextdate) - d(b.nextdate))
    };
  }

  return { workOrders, serviceRequests, assets, pms, isOpen, isOverdue, isEmergency, isCompleted, dueDate, countBy, top };
})();

if (typeof module !== 'undefined') module.exports = OpsAnalytics;
