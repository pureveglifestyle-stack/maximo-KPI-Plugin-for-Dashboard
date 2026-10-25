/*
 * GENMAHI AI – loads and normalises dashboard data from Maximo (read-only).
 */
var GenmahiLoader = (function () {
  const CAP = 5000;

  const WO_FIELDS = 'workorderid,wonum,description,status,statusdate,worktype,wopriority,siteid,location,assetnum,' +
    'reportdate,targcompdate,schedfinish,actstart,actfinish,estdur,actlabhrs,acttotalcost,woclass,historyflag,' +
    'pmnum,ownergroup,owner,lead,supervisor';
  const SR_FIELDS = 'ticketuid,ticketid,description,status,reportdate,siteid,reportedpriority,internalpriority,' +
    'actualfinish,targetfinish,assetnum,location,ownergroup,historyflag';
  const ASSET_FIELDS = 'assetuid,assetnum,description,status,siteid,assettype,location,isrunning,priority';
  const PM_FIELDS = 'pmuid,pmnum,description,status,siteid,nextdate,frequency,frequnit,assetnum,location,worktype';

  function isoDaysAgo(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    const pad = (n) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T00:00:00' +
      sign + pad(Math.floor(Math.abs(off) / 60)) + ':' + pad(Math.abs(off) % 60);
  }

  function reason(client) {
    const errs = client.lastResolveErrors || [];
    return errs.length ? errs.join('; ') : 'not available';
  }

  function key(r, ...fields) { return fields.map((f) => r[f]).join('|'); }

  function mergeUnique(a, b, ...fields) {
    const seen = new Map();
    a.concat(b).forEach((r) => seen.set(key(r, ...fields), r));
    return Array.from(seen.values());
  }

  const AREAS = {
    wos: { name: 'work orders', app: 'Work Order Tracking', os: 'MXAPIWO / MXWO' },
    srs: { name: 'service requests', app: 'Service Requests', os: 'MXAPISR / MXSR' },
    assets: { name: 'assets', app: 'Assets', os: 'MXAPIASSET / MXASSET' },
    pms: { name: 'preventive maintenance (PM) records', app: 'Preventive Maintenance', os: 'MXAPIPM / MXPM' }
  };

  function deniedMessage(area) {
    const a = AREAS[area];
    return 'Missing group access: your Maximo security group does not have read access to the ' + a.app +
      ' application. Ask your Maximo administrator to grant read access.';
  }

  /**
   * Loads one area. Access problems are recorded per area (out.denied / warnings)
   * so the rest of the dashboard still loads.
   */
  async function loadArea(client, out, area, candidates, readFn) {
    const os = await client.resolveOS(candidates);
    if (!os) {
      if (client.lastResolveDenied) out.denied[area] = deniedMessage(area);
      else out.warnings.push(AREAS[area].name.charAt(0).toUpperCase() + AREAS[area].name.slice(1) +
        ' are not available on this Maximo system (' + AREAS[area].os + '). Details: ' + reason(client));
      return false;
    }
    try {
      await readFn(os);
      return true;
    } catch (e) {
      if (MaximoClient.FATAL.has(e.kind)) throw e;
      if (e.kind === 'denied') out.denied[area] = deniedMessage(area);
      else out.warnings.push('Could not read ' + AREAS[area].name + ': ' + e.message);
      return false;
    }
  }

  async function load(client, rangeDays, progress) {
    const say = progress || function () {};
    say('Connecting to Maximo…');
    const meta = await client.connect();
    const from = isoDaysAgo(rangeDays);
    const out = { wos: [], srs: [], assets: [], pms: [], warnings: [], denied: {}, meta, source: 'live', loadedAt: new Date(), rangeDays };

    // Work orders: reported in range + everything still open (backlog)
    await loadArea(client, out, 'wos', ['mxapiwo', 'mxwo'], async (os) => {
      say('Reading work orders…');
      const opts = { select: WO_FIELDS, orderBy: '-reportdate', cap: CAP,
        onPage: (n) => say('Reading work orders… ' + n) };
      const recent = await client.fetchFirstWorking(os,
        ['istask=0 and reportdate>="' + from + '"', 'reportdate>="' + from + '"'], opts);
      say('Reading open backlog…');
      const open = await client.fetchFirstWorking(os, ['istask=0 and historyflag=0', 'historyflag=0'], opts);
      out.wos = mergeUnique(recent.rows, open.rows, 'siteid', 'wonum')
        .filter((w) => !w.woclass || /^(WORKORDER|WO)$/i.test(w.woclass));
      if (recent.truncated || open.truncated) {
        out.warnings.push('Work orders limited to the latest ' + CAP + ' records per query – narrow the date range for exact figures.');
      }
    });

    await loadArea(client, out, 'srs', ['mxapisr', 'mxsr'], async (os) => {
      say('Reading service requests…');
      const opts = { select: SR_FIELDS, orderBy: '-reportdate', cap: CAP };
      const recent = await client.fetchFirstWorking(os, ['reportdate>="' + from + '"'], opts);
      const open = await client.fetchFirstWorking(os, ['historyflag=0'], opts).catch(() => ({ rows: [] }));
      out.srs = mergeUnique(recent.rows, open.rows, 'ticketid');
      if (recent.truncated) out.warnings.push('Service requests limited to ' + CAP + ' records.');
    });

    await loadArea(client, out, 'assets', ['mxapiasset', 'mxasset'], async (os) => {
      say('Reading assets…');
      const r = await client.fetchAll(os, { select: ASSET_FIELDS, cap: CAP, onPage: (n) => say('Reading assets… ' + n) });
      out.assets = r.rows;
      out.assetTotal = r.total;
      if (r.truncated) out.warnings.push('Asset charts are based on the first ' + CAP + ' assets' + (r.total ? ' of ' + r.total : '') + '.');
    });

    const pmOk = await loadArea(client, out, 'pms', ['mxapipm', 'mxpm'], async (os) => {
      say('Reading preventive maintenance…');
      const r = await client.fetchFirstWorking(os, ['status="ACTIVE"', ''], { select: PM_FIELDS, cap: CAP });
      out.pms = r.rows;
    });
    if (!pmOk && !out.denied.wos) {
      // No PM records: fall back to PM-generated work orders, which are already loaded.
      out.pmSource = 'wo';
      if (out.denied.pms) out.denied.pms += ' PM figures below are calculated from PM-generated work orders instead.';
      else out.warnings.push('PM figures are calculated from PM-generated work orders.');
    }

    return out;
  }

  return { load, isoDaysAgo };
})();
