/*
 * GENMAHI AI – synthetic demo data (no Maximo connection needed).
 * Deterministic pseudo-random generator so screenshots are reproducible.
 */
var GenmahiDemo = (function () {
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(rangeDays) {
    const r = rng(20261025);
    const pick = (arr, w) => {
      if (!w) return arr[Math.floor(r() * arr.length)];
      const total = w.reduce((a, b) => a + b, 0);
      let x = r() * total;
      for (let i = 0; i < arr.length; i++) { x -= w[i]; if (x <= 0) return arr[i]; }
      return arr[arr.length - 1];
    };
    const now = Date.now();
    const DAY = 86400000;
    const iso = (t) => new Date(t).toISOString();

    const sites = ['PLANT-A', 'PLANT-B', 'TERMINAL', 'DEPOT'];
    const types = ['CM', 'PM', 'EM', 'CAL', 'PROJ'];
    const groups = ['MECH', 'ELEC', 'INSTR', 'FACIL', 'HVAC'];
    const assetTypes = ['PUMP', 'MOTOR', 'COMPRESSOR', 'CONVEYOR', 'HVAC', 'VALVE', 'TRANSFORMER', 'BOILER'];
    const words = ['Pump seal leak', 'Motor overheating', 'Replace bearing', 'Inspect conveyor belt', 'Calibrate pressure gauge',
      'HVAC filter change', 'Valve not closing', 'Lubrication route', 'Electrical panel inspection', 'Boiler annual service',
      'Vibration alarm', 'Replace V-belts', 'Fire extinguisher check', 'Compressor oil change', 'Leak at flange'];

    const assets = [];
    for (let i = 0; i < 420; i++) {
      assets.push({
        assetuid: 1000 + i,
        assetnum: 'A' + String(10000 + i),
        description: pick(assetTypes) + ' unit ' + (i + 1),
        status: pick(['OPERATING', 'NOT READY', 'BROKEN', 'DECOMMISSIONED'], [88, 5, 4, 3]),
        siteid: pick(sites, [40, 30, 20, 10]),
        assettype: pick(assetTypes),
        location: 'LOC-' + (100 + Math.floor(r() * 60)),
        priority: 1 + Math.floor(r() * 5)
      });
    }
    // A few "bad actors" receive more corrective work.
    const badActors = assets.slice(0, 12);

    const wos = [];
    const span = Math.max(rangeDays, 400);
    for (let i = 0; i < 1600; i++) {
      const age = Math.pow(r(), 1.3) * span;
      const report = now - age * DAY;
      const type = pick(types, [45, 30, 8, 10, 7]);
      const asset = r() < 0.25 ? pick(badActors) : pick(assets);
      const pri = type === 'EM' ? 1 : pick([1, 2, 3, 4, 5], [5, 20, 40, 25, 10]);
      const target = report + (type === 'EM' ? 2 : type === 'PM' ? 7 : 14 + r() * 30) * DAY;
      const estdur = Math.round((1 + r() * 16) * 10) / 10;
      const closeChance = Math.min(0.97, age / 45);
      let status;
      let actstart = null;
      let actfinish = null;
      if (r() < closeChance) {
        status = pick(['CLOSE', 'COMP', 'CAN'], [65, 30, 5]);
        if (status !== 'CAN') {
          actstart = report + r() * Math.min(6, (target - report) / DAY * 0.6) * DAY;
          const late = r() < 0.12 ? (2 + r() * 12) * DAY : 0;
          actfinish = Math.min(now, actstart + estdur * 3600000 + r() * 3 * DAY + late);
        }
      } else {
        status = pick(['WAPPR', 'APPR', 'WMATL', 'WSCH', 'INPRG'], [20, 30, 15, 15, 20]);
        if (status === 'INPRG') actstart = report + r() * 3 * DAY;
      }
      wos.push({
        workorderid: 50000 + i,
        wonum: String(1000 + i),
        description: pick(words),
        status,
        statusdate: iso(actfinish || report),
        worktype: type,
        wopriority: pri,
        siteid: asset.siteid,
        location: asset.location,
        assetnum: asset.assetnum,
        reportdate: iso(report),
        targcompdate: iso(target),
        actstart: actstart ? iso(actstart) : null,
        actfinish: actfinish ? iso(actfinish) : null,
        estdur,
        actlabhrs: actfinish ? Math.round(estdur * (0.7 + r() * 0.8) * 10) / 10 : 0,
        acttotalcost: actfinish ? Math.round(estdur * (60 + r() * 140)) : 0,
        woclass: 'WORKORDER',
        historyflag: status === 'CLOSE' || status === 'CAN',
        pmnum: type === 'PM' ? 'PM' + (100 + Math.floor(r() * 80)) : null,
        ownergroup: pick(groups)
      });
    }

    const srs = [];
    for (let i = 0; i < 520; i++) {
      const age = Math.pow(r(), 1.2) * span;
      const report = now - age * DAY;
      const closed = r() < Math.min(0.96, age / 20);
      const finish = closed ? Math.min(now, report + (0.2 + r() * 9) * DAY) : null;
      srs.push({
        ticketuid: 9000 + i,
        ticketid: String(5000 + i),
        description: pick(['Room too hot', 'Light not working', 'Water leak', 'Door broken', 'Noise from pump', 'Access request', 'Spill cleanup']),
        status: closed ? pick(['RESOLVED', 'CLOSED'], [40, 60]) : pick(['NEW', 'QUEUED', 'INPROG', 'PENDING'], [35, 25, 30, 10]),
        reportdate: iso(report),
        targetfinish: iso(report + 5 * DAY),
        actualfinish: finish ? iso(finish) : null,
        siteid: pick(sites, [40, 30, 20, 10]),
        reportedpriority: pick([1, 2, 3, 4], [10, 30, 40, 20]),
        historyflag: closed && r() < 0.6
      });
    }

    const pms = [];
    for (let i = 0; i < 160; i++) {
      const unit = pick(['WEEKS', 'MONTHS', 'DAYS', 'YEARS'], [30, 50, 10, 10]);
      pms.push({
        pmuid: 3000 + i,
        pmnum: 'PM' + (100 + i),
        description: pick(['Lubrication route', 'Monthly inspection', 'Filter change', 'Annual service', 'Calibration']),
        status: r() < 0.9 ? 'ACTIVE' : 'INACTIVE',
        siteid: pick(sites),
        nextdate: iso(now + (r() * 60 - 12) * DAY),
        frequency: pick([1, 2, 3, 4, 6]),
        frequnit: unit,
        assetnum: pick(assets).assetnum
      });
    }

    return {
      wos, srs, assets, pms,
      assetTotal: assets.length,
      warnings: ['DEMO MODE – synthetic sample data, not connected to Maximo.'],
      meta: { apiRoot: 'demo', user: { name: 'Demo User', personid: 'DEMO', site: 'PLANT-A' } },
      source: 'demo',
      loadedAt: new Date(),
      rangeDays
    };
  }

  return { generate };
})();
