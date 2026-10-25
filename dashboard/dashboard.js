/*
 * OpsLens – dashboard controller.
 */
(async function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const DEMO = params.get('demo') === '1';

  // ---- Terms gate ---------------------------------------------------------
  if (!(await OpsTerms.isAccepted())) {
    location.replace(chrome.runtime.getURL('terms/terms.html') + '?return=' + encodeURIComponent(location.href));
    return;
  }

  // ---- State & preferences ------------------------------------------------
  const stored = (await chrome.storage.local.get('prefs')).prefs || {};
  const prefs = Object.assign({ range: 90, theme: null, auto: 0 }, stored);
  const savePrefs = () => chrome.storage.local.set({ prefs });

  const client = DEMO ? null : new MaximoClient.Client({ tabId: params.get('tabId'), base: params.get('base') || '' });
  const state = { data: null, site: '', filters: {}, tab: 'overview', woView: 'all', woSearch: '' };

  // Cross-filter dimensions (click a chart to filter).
  const DIMS = {
    status: { label: 'Status', get: (w) => w.status },
    worktype: { label: 'Work type', get: (w) => w.worktype },
    wopriority: { label: 'Priority', get: (w) => w.wopriority },
    assetnum: { label: 'Asset', get: (w) => w.assetnum },
    ownergroup: { label: 'Owner group', get: (w) => w.ownergroup || w.owner }
  };
  const matches = (v, label) => (label === '(none)' ? v === null || v === undefined || v === '' : String(v) === label);

  // ---- Formatting helpers -------------------------------------------------
  const num = (n, d = 0) => (n === null || n === undefined || !isFinite(n) ? '–' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));
  const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

  function link(app, uid, label) {
    const href = client && uid ? client.recordLink(app, uid) : null;
    if (!href) return label || '';
    const a = el('a', null, label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = 'Open in Maximo (view)';
    return a;
  }
  function pill(text, cls) { return el('span', 'pill' + (cls ? ' ' + cls : ''), text); }

  // ---- Theme --------------------------------------------------------------
  function applyTheme() {
    const t = prefs.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
  }
  applyTheme();
  $('theme').addEventListener('click', () => {
    prefs.theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    savePrefs();
    applyTheme();
    render();
  });

  // ---- Controls -----------------------------------------------------------
  $('range').value = String(prefs.range);
  $('auto').value = String(prefs.auto);
  $('range').addEventListener('change', (e) => { prefs.range = Number(e.target.value); savePrefs(); load(); });
  $('site').addEventListener('change', (e) => { state.site = e.target.value; render(); });
  $('refresh').addEventListener('click', () => load());

  let autoTimer = null;
  function setupAuto() {
    clearInterval(autoTimer);
    if (prefs.auto > 0) autoTimer = setInterval(() => load(true), prefs.auto * 60000);
  }
  $('auto').addEventListener('change', (e) => { prefs.auto = Number(e.target.value); savePrefs(); setupAuto(); });

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    state.tab = b.dataset.tab;
    document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + state.tab; });
    render();
  }));

  document.querySelectorAll('#wo-view button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#wo-view button').forEach((x) => x.classList.toggle('active', x === b));
    state.woView = b.dataset.v;
    renderWorkOrders();
  }));
  let searchTimer;
  $('wo-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.woSearch = e.target.value.trim().toLowerCase(); renderWorkOrders(); }, 200);
  });
  $('wo-export').addEventListener('click', () => {
    const rows = woTableRows();
    OpsTable.download('opslens-workorders-' + new Date().toISOString().slice(0, 10) + '.csv', OpsTable.toCSV(rows, WO_COLUMNS));
  });

  // About tab
  $('about-terms').innerHTML = OpsTerms.HTML; // static text authored in lib/terms.js
  $('revoke').addEventListener('click', async () => {
    await OpsTerms.revoke();
    location.replace(chrome.runtime.getURL('terms/terms.html') + '?return=' + encodeURIComponent(location.href));
  });

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 200); });

  // ---- Overlay ------------------------------------------------------------
  function overlay(msg) {
    const box = document.querySelector('.overlay-box');
    box.classList.remove('error');
    box.querySelectorAll('.actions').forEach((a) => a.remove());
    $('overlay-msg').textContent = msg;
    $('overlay').hidden = false;
  }
  function hideOverlay() { $('overlay').hidden = true; }
  function overlayError(err) {
    overlay('');
    const box = document.querySelector('.overlay-box');
    box.classList.add('error');
    const m = $('overlay-msg');
    m.textContent = '';
    m.append(el('h3', null, 'Could not load data'), el('p', null, err.message || String(err)));
    const tips = el('p', 'hint');
    tips.textContent = 'Make sure the Maximo tab is open and you are logged in. Your account needs read access to the standard ' +
      'REST object structures (e.g. MXAPIWO / MXWO). OpsLens never changes anything in Maximo.';
    m.appendChild(tips);
    const actions = el('div', 'actions');
    const retry = el('button', 'btn', 'Retry');
    retry.onclick = () => load();
    const demo = el('button', 'btn', 'Open demo instead');
    demo.onclick = () => { location.href = chrome.runtime.getURL('dashboard/dashboard.html?demo=1'); };
    actions.append(demo, retry);
    box.appendChild(actions);
  }

  // ---- Load ---------------------------------------------------------------
  let loading = false;
  async function load(silent) {
    if (loading) return;
    loading = true;
    if (!silent) overlay('Loading…');
    try {
      if (DEMO) state.data = OpsDemo.generate(prefs.range);
      else state.data = await OpsLoader.load(client, prefs.range, (m) => { if (!silent) $('overlay-msg').textContent = m; });
      populateSites();
      renderConn();
      render();
      hideOverlay();
    } catch (e) {
      console.error(e);
      renderConn(e);
      if (!silent) overlayError(e);
    } finally {
      loading = false;
    }
  }

  function renderConn(err) {
    const c = $('conn');
    c.textContent = '';
    const dot = el('span', 'dot' + (DEMO ? ' demo' : err ? ' err' : ''));
    let txt;
    if (DEMO) txt = 'Demo data';
    else if (err) txt = 'Not connected';
    else {
      const u = state.data.meta.user || {};
      txt = new URL(client.base).host + ' · ' + (u.name || u.personid || 'user') +
        ' · updated ' + state.data.loadedAt.toLocaleTimeString();
    }
    c.append(dot, document.createTextNode(txt));
  }

  function populateSites() {
    const d = state.data;
    const sites = new Set();
    [d.wos, d.srs, d.assets, d.pms].forEach((list) => list.forEach((r) => r.siteid && sites.add(r.siteid)));
    const sel = $('site');
    const cur = state.site;
    sel.textContent = '';
    sel.appendChild(new Option('All sites', ''));
    Array.from(sites).sort().forEach((s) => sel.appendChild(new Option(s, s)));
    if (sites.has(cur)) sel.value = cur; else state.site = '';
  }

  // ---- Filtering ----------------------------------------------------------
  const bySite = (list) => (state.site ? list.filter((r) => r.siteid === state.site) : list);
  function wosFiltered(exceptKey) {
    return bySite(state.data.wos).filter((w) => Object.entries(state.filters).every(([k, v]) => k === exceptKey || matches(DIMS[k].get(w), v)));
  }
  function toggleFilter(key, label) {
    if (state.filters[key] === label) delete state.filters[key];
    else state.filters[key] = label;
    render();
  }
  function renderChips() {
    const c = $('chips');
    c.textContent = '';
    const entries = Object.entries(state.filters);
    if (!entries.length) return;
    c.appendChild(el('span', 'hint', 'Filters:'));
    entries.forEach(([k, v]) => {
      const chip = el('span', 'chip', DIMS[k].label + ': ' + v);
      const x = el('button', null, '×');
      x.title = 'Remove filter';
      x.onclick = () => { delete state.filters[k]; render(); };
      chip.appendChild(x);
      c.appendChild(chip);
    });
    const clear = el('button', 'clear', 'Clear all');
    clear.onclick = () => { state.filters = {}; render(); };
    c.appendChild(clear);
  }

  function renderWarnings() {
    const w = $('warnings');
    w.textContent = '';
    (state.data.warnings || []).forEach((m) => w.appendChild(el('div', null, '⚠ ' + m)));
  }

  // ---- KPI cards ----------------------------------------------------------
  function kpis(container, items) {
    container.textContent = '';
    items.forEach((k) => {
      const card = el('div', 'kpi' + (k.tone ? ' ' + k.tone : ''));
      card.append(el('div', 'label', k.label), el('div', 'value', k.value), el('div', 'sub', k.sub || ''));
      if (k.title) card.title = k.title;
      container.appendChild(card);
    });
  }

  // ---- Render -------------------------------------------------------------
  function render() {
    if (!state.data) return;
    renderWarnings();
    renderChips();
    if (state.tab === 'overview') renderOverview();
    if (state.tab === 'wo') renderWorkOrders();
    if (state.tab === 'assets') renderAssets();
    if (state.tab === 'sr') renderServiceRequests();
  }

  function dimChart(id, key, kind, opts = {}) {
    const data = OpsAnalytics.top(OpsAnalytics.countBy(wosFiltered(key), DIMS[key].get), 8);
    const common = { selected: state.filters[key], onSelect: (l) => toggleFilter(key, l) };
    if (kind === 'donut') OpsCharts.donut($(id), data, Object.assign({ centerLabel: 'work orders' }, common));
    else OpsCharts.bar($(id), data, Object.assign({ colors: opts.colors }, opts.bar || {}, common));
  }

  function renderOverview() {
    const wos = wosFiltered();
    const a = OpsAnalytics.workOrders(wos, prefs.range);
    kpis($('wo-kpis'), [
      { label: 'Open work orders', value: num(a.open), sub: 'current backlog' },
      { label: 'Overdue', value: num(a.overdue), sub: num(a.overduePct, 1) + '% of open', tone: a.overduePct > 20 ? 'bad' : a.overduePct > 10 ? 'warn' : 'good' },
      { label: 'Emergency / P1 open', value: num(a.emergencyOpen), sub: 'work type EM or priority 1', tone: a.emergencyOpen ? 'bad' : 'good' },
      { label: 'Created', value: num(a.created), sub: 'in selected period' },
      { label: 'Completed', value: num(a.completed), sub: 'in selected period', tone: 'good' },
      { label: 'Avg. completion time', value: a.avgCompletionHours === null ? '–' : num(a.avgCompletionHours / 24, 1) + ' d', sub: 'start → finish, completed WOs' },
      { label: 'PM compliance', value: a.pmCompliance === null ? '–' : num(a.pmCompliance, 0) + '%', sub: a.pmDue + ' PM WOs due in period', tone: a.pmCompliance === null ? '' : a.pmCompliance >= 90 ? 'good' : a.pmCompliance >= 75 ? 'warn' : 'bad', title: 'PM work orders completed by target date (+1 day grace)' },
      { label: 'Backlog hours', value: num(a.backlogHours), sub: 'estimated duration, open WOs' }
    ]);

    OpsCharts.line($('c-trend'), { labels: a.trend.labels, series: [
      { name: 'Created', values: a.trend.created, color: '#118DFF' },
      { name: 'Completed', values: a.trend.completed, color: '#1AAB40' }
    ] });
    dimChart('c-status', 'status', 'donut');
    dimChart('c-type', 'worktype', 'bar', { colors: OpsCharts.PALETTE });
    // Priority chart covers open work orders only
    {
      const data = OpsAnalytics.countBy(wosFiltered('wopriority').filter(OpsAnalytics.isOpen), DIMS.wopriority.get)
        .sort((x, y) => (Number(x.label) || 99) - (Number(y.label) || 99)).slice(0, 10);
      OpsCharts.bar($('c-priority'), data, { colors: ['#D64550', '#E66C37', '#D9B300', '#118DFF', '#1AAB40', '#8A8A8A'], selected: state.filters.wopriority, onSelect: (l) => toggleFilter('wopriority', l) });
    }
    OpsCharts.bar($('c-aging'), a.aging, { colors: ['#1AAB40', '#118DFF', '#D9B300', '#E66C37', '#D64550'] });
    OpsCharts.bar($('c-site'), OpsAnalytics.countBy(wos, (w) => w.siteid).slice(0, 10), {
      horizontal: true, color: '#12239E', selected: state.site || null,
      onSelect: (l) => { state.site = state.site === l ? '' : l; $('site').value = state.site; render(); }
    });
    {
      const from = Date.now() - prefs.range * 86400000;
      const data = OpsAnalytics.countBy(wosFiltered('assetnum').filter((w) => w.assetnum && !w.pmnum && new Date(w.reportdate) >= from), DIMS.assetnum.get).slice(0, 10);
      OpsCharts.bar($('c-assets'), data, { horizontal: true, color: '#E66C37', selected: state.filters.assetnum, onSelect: (l) => toggleFilter('assetnum', l) });
    }
    {
      const data = OpsAnalytics.countBy(wosFiltered('ownergroup').filter(OpsAnalytics.isOpen), DIMS.ownergroup.get).slice(0, 10);
      OpsCharts.bar($('c-owner'), data, { horizontal: true, color: '#744EC2', selected: state.filters.ownergroup, onSelect: (l) => toggleFilter('ownergroup', l) });
    }

    OpsTable.render($('t-overdue'), a.overdueList, WO_COLUMNS, { pageSize: 10, emptyText: 'No overdue work orders 🎉' });
  }

  // ---- Work order table ---------------------------------------------------
  const now = () => new Date();
  const WO_COLUMNS = [
    { key: 'wonum', label: 'Work order', render: (w) => link('wotrack', w.workorderid, w.wonum) },
    { key: 'description', label: 'Description', wrap: true },
    { key: 'status', label: 'Status', render: (w) => pill(w.status || '', OpsAnalytics.isCompleted(w) ? 'good' : '') },
    { key: 'worktype', label: 'Type' },
    { key: 'wopriority', label: 'Pri', sortValue: (w) => Number(w.wopriority) || 99 },
    { key: 'siteid', label: 'Site' },
    { key: 'assetnum', label: 'Asset' },
    { key: 'location', label: 'Location' },
    { key: 'ownergroup', label: 'Owner group' },
    { key: 'reportdate', label: 'Reported', render: (w) => fmtDate(w.reportdate), sortValue: (w) => w.reportdate || '' },
    { key: 'targcompdate', label: 'Due', render: (w) => fmtDate(w.targcompdate || w.schedfinish), csv: (w) => w.targcompdate || w.schedfinish || '', sortValue: (w) => w.targcompdate || w.schedfinish || '' },
    { key: '_state', label: 'Health', sortValue: (w) => (OpsAnalytics.isOverdue(w, now()) ? 0 : OpsAnalytics.isOpen(w) ? 1 : 2),
      render: (w) => (OpsAnalytics.isOverdue(w, now()) ? pill('Overdue', 'bad') : OpsAnalytics.isOpen(w) ? pill('Open') : pill('Closed', 'good')),
      csv: (w) => (OpsAnalytics.isOverdue(w, now()) ? 'Overdue' : OpsAnalytics.isOpen(w) ? 'Open' : 'Closed') }
  ];

  function woTableRows() {
    const n = now();
    let rows = wosFiltered();
    if (state.woView === 'open') rows = rows.filter(OpsAnalytics.isOpen);
    if (state.woView === 'overdue') rows = rows.filter((w) => OpsAnalytics.isOverdue(w, n));
    if (state.woView === 'emergency') rows = rows.filter((w) => OpsAnalytics.isOpen(w) && OpsAnalytics.isEmergency(w));
    if (state.woView === 'completed') rows = rows.filter(OpsAnalytics.isCompleted);
    if (state.woSearch) {
      const q = state.woSearch;
      rows = rows.filter((w) => ['wonum', 'description', 'assetnum', 'location', 'status', 'worktype', 'ownergroup', 'siteid']
        .some((k) => w[k] !== null && w[k] !== undefined && String(w[k]).toLowerCase().includes(q)));
    }
    return rows;
  }
  function renderWorkOrders() {
    if (!state.data) return;
    OpsTable.render($('t-wo'), woTableRows(), WO_COLUMNS, { pageSize: 25, sortKey: 'reportdate', sortDesc: true });
  }

  // ---- Assets & PM --------------------------------------------------------
  function renderAssets() {
    const assets = bySite(state.data.assets);
    const a = OpsAnalytics.assets(assets, state.site ? assets.length : state.data.assetTotal);
    const fromWO = state.data.pmSource === 'wo';
    const p = fromWO ? OpsAnalytics.pmsFromWorkOrders(bySite(state.data.wos)) : OpsAnalytics.pms(bySite(state.data.pms));
    const title = (id, text) => { $(id).parentElement.querySelector('h3').textContent = text; };
    kpis($('asset-kpis'), [
      { label: 'Assets', value: num(a.total), sub: a.sampled < a.total ? 'charts use first ' + num(a.sampled) : 'in scope' },
      { label: 'Operating', value: a.availabilityPct === null ? '–' : num(a.availabilityPct, 1) + '%', sub: num(a.running) + ' assets operating', tone: 'good' },
      { label: 'Not operating', value: num(a.notRunning), sub: 'status not OPERATING', tone: a.notRunning ? 'warn' : 'good' },
      fromWO
        ? { label: 'Open PM work orders', value: num(p.active), sub: 'from PM-generated WOs' }
        : { label: 'Active PMs', value: num(p.active), sub: 'preventive maintenance' },
      { label: fromWO ? 'PM WOs overdue' : 'PMs overdue', value: num(p.overdue), sub: fromWO ? 'target date passed' : 'next due date passed', tone: p.overdue ? 'bad' : 'good' },
      { label: fromWO ? 'PM WOs due ≤ 30 days' : 'PMs due ≤ 30 days', value: num(p.next30), sub: 'upcoming workload' }
    ]);
    OpsCharts.donut($('c-asset-status'), OpsAnalytics.top(a.byStatus, 7), { centerLabel: 'assets' });
    OpsCharts.bar($('c-asset-type'), a.byType.slice(0, 10), { horizontal: true, color: '#197278' });
    title('c-pm-upcoming', fromWO ? 'PM work orders – due next 4 weeks' : 'PM schedule – next 4 weeks');
    OpsCharts.bar($('c-pm-upcoming'), p.upcoming, { colors: ['#D64550', '#118DFF', '#118DFF', '#118DFF', '#118DFF'] });
    if (fromWO) {
      title('c-pm-freq', 'Open PM work orders by status');
      OpsCharts.donut($('c-pm-freq'), OpsAnalytics.top(p.byStatus, 7), { centerLabel: 'PM WOs' });
      title('t-pm', 'Overdue & upcoming PM work orders (30 days)');
      OpsTable.render($('t-pm'), p.list, [
        { key: 'wonum', label: 'Work order', render: (w) => link('wotrack', w.workorderid, w.wonum) },
        { key: 'pmnum', label: 'PM' },
        { key: 'description', label: 'Description', wrap: true },
        { key: 'status', label: 'Status', render: (w) => pill(w.status || '') },
        { key: 'siteid', label: 'Site' },
        { key: 'assetnum', label: 'Asset' },
        { key: 'targcompdate', label: 'Due', render: (w) => fmtDate(w.targcompdate || w.schedfinish), sortValue: (w) => w.targcompdate || w.schedfinish || '' },
        { key: '_s', label: 'Health', render: (w) => (OpsAnalytics.isOverdue(w, now()) ? pill('Overdue', 'bad') : pill('Upcoming')) }
      ], { pageSize: 10, emptyText: 'No overdue or upcoming PM work orders' });
      return;
    }
    title('c-pm-freq', 'PMs by frequency');
    title('t-pm', 'Overdue & upcoming PMs (30 days)');
    OpsCharts.bar($('c-pm-freq'), p.byFrequency, { horizontal: true, color: '#6B007B' });
    OpsTable.render($('t-pm'), p.list, [
      { key: 'pmnum', label: 'PM', render: (r) => link('pm', r.pmuid, r.pmnum) },
      { key: 'description', label: 'Description', wrap: true },
      { key: 'siteid', label: 'Site' },
      { key: 'assetnum', label: 'Asset' },
      { key: 'frequency', label: 'Frequency', render: (r) => (r.frequency ? r.frequency + ' ' + (r.frequnit || '') : '') },
      { key: 'nextdate', label: 'Next due', render: (r) => fmtDate(r.nextdate) },
      { key: '_s', label: 'Health', render: (r) => (new Date(r.nextdate) < now() ? pill('Overdue', 'bad') : pill('Upcoming')) }
    ], { pageSize: 10, emptyText: 'No overdue or upcoming PMs' });
  }

  // ---- Service requests ---------------------------------------------------
  function renderServiceRequests() {
    const s = OpsAnalytics.serviceRequests(bySite(state.data.srs), prefs.range);
    kpis($('sr-kpis'), [
      { label: 'Created', value: num(s.created), sub: 'in selected period' },
      { label: 'Open', value: num(s.open), sub: 'not resolved / closed' },
      { label: 'Past target', value: num(s.overdue), sub: 'open after target finish', tone: s.overdue ? 'bad' : 'good' },
      { label: 'Closed', value: num(s.closed), sub: 'in selected period', tone: 'good' },
      { label: 'Avg. resolution', value: s.avgResolutionDays === null ? '–' : num(s.avgResolutionDays, 1) + ' d', sub: 'report → actual finish' }
    ]);
    OpsCharts.line($('c-sr-trend'), { labels: s.trend.labels, series: [
      { name: 'Created', values: s.trend.created, color: '#E66C37' },
      { name: 'Closed', values: s.trend.closed, color: '#1AAB40' }
    ] });
    OpsCharts.donut($('c-sr-status'), OpsAnalytics.top(s.byStatus, 7), { centerLabel: 'requests' });
    OpsCharts.bar($('c-sr-priority'), s.byPriority, { colors: ['#D64550', '#E66C37', '#D9B300', '#118DFF', '#8A8A8A'] });
    OpsCharts.bar($('c-sr-site'), s.bySite.slice(0, 10), { horizontal: true, color: '#12239E' });
    OpsTable.render($('t-sr'), s.openList, [
      { key: 'ticketid', label: 'SR', render: (r) => link('sr', r.ticketuid, r.ticketid) },
      { key: 'description', label: 'Description', wrap: true },
      { key: 'status', label: 'Status', render: (r) => pill(r.status || '') },
      { key: 'reportedpriority', label: 'Pri' },
      { key: 'siteid', label: 'Site' },
      { key: 'reportdate', label: 'Reported', render: (r) => fmtDate(r.reportdate) },
      { key: 'targetfinish', label: 'Target', render: (r) => fmtDate(r.targetfinish) }
    ], { pageSize: 10, emptyText: 'No open service requests' });
  }

  // ---- Go -----------------------------------------------------------------
  if (!DEMO && !params.get('base')) {
    overlayError(new Error('No Maximo address given. Open OpsLens from the toolbar icon while on your Maximo tab.'));
    return;
  }
  setupAuto();
  load();
})();
