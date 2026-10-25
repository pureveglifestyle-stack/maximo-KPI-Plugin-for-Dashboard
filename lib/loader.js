/*
 * OpsLens – loads and normalises dashboard data from Maximo (read-only).
 */
var OpsLoader = (function () {
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

  async function load(client, rangeDays, progress) {
    const say = progress || function () {};
    say('Connecting to Maximo…');
    const meta = await client.connect();
    const from = isoDaysAgo(rangeDays);
    const out = { wos: [], srs: [], assets: [], pms: [], warnings: [], meta, source: 'live', loadedAt: new Date(), rangeDays };

    // Work orders: reported in range + everything still open (backlog)
    const woOS = await client.resolveOS(['mxapiwo', 'mxwo']);
    if (woOS) {
      say('Reading work orders…');
      const opts = { select: WO_FIELDS, orderBy: '-reportdate', cap: CAP,
        onPage: (n) => say('Reading work orders… ' + n) };
      const recent = await client.fetchFirstWorking(woOS,
        ['istask=0 and reportdate>="' + from + '"', 'reportdate>="' + from + '"'], opts);
      say('Reading open backlog…');
      const open = await client.fetchFirstWorking(woOS,
        ['istask=0 and historyflag=0', 'historyflag=0'], opts);
      out.wos = mergeUnique(recent.rows, open.rows, 'siteid', 'wonum')
        .filter((w) => !w.woclass || /^(WORKORDER|WO)$/i.test(w.woclass));
      if (recent.truncated || open.truncated) {
        out.warnings.push('Work orders limited to the latest ' + CAP + ' records per query – narrow the date range for exact figures.');
      }
    } else {
      out.warnings.push('Your account cannot read work orders (MXAPIWO / MXWO). Reason from Maximo: ' + reason(client));
    }

    const srOS = await client.resolveOS(['mxapisr', 'mxsr']);
    if (srOS) {
      say('Reading service requests…');
      const opts = { select: SR_FIELDS, orderBy: '-reportdate', cap: CAP };
      const recent = await client.fetchFirstWorking(srOS, ['reportdate>="' + from + '"'], opts);
      const open = await client.fetchFirstWorking(srOS, ['historyflag=0'], opts).catch(() => ({ rows: [] }));
      out.srs = mergeUnique(recent.rows, open.rows, 'ticketid');
      if (recent.truncated) out.warnings.push('Service requests limited to ' + CAP + ' records.');
    } else {
      out.warnings.push('Your account cannot read service requests (MXAPISR / MXSR). Reason from Maximo: ' + reason(client));
    }

    const assetOS = await client.resolveOS(['mxapiasset', 'mxasset']);
    if (assetOS) {
      say('Reading assets…');
      const r = await client.fetchAll(assetOS, { select: ASSET_FIELDS, cap: CAP,
        onPage: (n) => say('Reading assets… ' + n) });
      out.assets = r.rows;
      out.assetTotal = r.total;
      if (r.truncated) out.warnings.push('Asset charts are based on the first ' + CAP + ' assets' + (r.total ? ' of ' + r.total : '') + '.');
    } else {
      out.warnings.push('Your account cannot read assets (MXAPIASSET / MXASSET). Reason from Maximo: ' + reason(client));
    }

    const pmOS = await client.resolveOS(['mxapipm', 'mxpm']);
    if (pmOS) {
      say('Reading preventive maintenance…');
      const r = await client.fetchFirstWorking(pmOS, ['status="ACTIVE"', ''], { select: PM_FIELDS, cap: CAP });
      out.pms = r.rows;
    } else {
      // No access to PM records: fall back to PM-generated work orders, which are already loaded.
      out.pmSource = 'wo';
      out.warnings.push('PM records (MXAPIPM / MXPM) are not readable with your Maximo account, so PM figures are ' +
        'calculated from PM-generated work orders instead. Reason from Maximo: ' + reason(client) +
        ' (ask your Maximo administrator for read access to the Preventive Maintenance application if you need PM master data).');
    }

    return out;
  }

  return { load, isoDaysAgo };
})();
