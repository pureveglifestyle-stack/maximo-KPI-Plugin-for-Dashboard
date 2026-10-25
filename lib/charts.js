/*
 * OpsLens – tiny dependency-free SVG chart library (bar, donut, line).
 * All labels are inserted with textContent – never innerHTML.
 */
var OpsCharts = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#118DFF', '#E66C37', '#6B007B', '#1AAB40', '#D9B300', '#E044A7', '#744EC2', '#12239E', '#D64550', '#197278', '#8A8A8A'];

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  function text(parent, x, y, str, attrs) {
    const t = svgEl('text', Object.assign({ x, y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }

  const fmt = (n) => (Math.abs(n) >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n * 10) / 10));
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  let tip = null;
  function tooltip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tooltip';
      document.body.appendChild(tip);
    }
    return tip;
  }
  function bindTip(node, label, value, extra) {
    node.addEventListener('mousemove', (ev) => {
      const t = tooltip();
      t.textContent = '';
      const b = document.createElement('strong');
      b.textContent = label;
      t.appendChild(b);
      t.appendChild(document.createTextNode(': ' + value + (extra ? ' ' + extra : '')));
      t.style.display = 'block';
      t.style.left = Math.min(ev.clientX + 12, window.innerWidth - t.offsetWidth - 8) + 'px';
      t.style.top = ev.clientY + 12 + 'px';
    });
    node.addEventListener('mouseleave', () => { tooltip().style.display = 'none'; });
  }

  function prepare(container, height) {
    container.textContent = '';
    const width = Math.max(container.clientWidth || 360, 220);
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img' }, container);
    return { svg, width };
  }

  function empty(container, msg) {
    container.textContent = '';
    const p = document.createElement('div');
    p.className = 'chart-empty';
    p.textContent = msg || 'No data';
    container.appendChild(p);
  }

  function clickable(node, item, opts) {
    if (!opts.onSelect || item.other) return;
    node.style.cursor = 'pointer';
    node.setAttribute('tabindex', '0');
    node.addEventListener('click', () => opts.onSelect(item.label));
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter') opts.onSelect(item.label); });
  }

  function colorFor(i, item, opts) {
    if (item.color) return item.color;
    if (opts.colors) return opts.colors[i % opts.colors.length];
    return opts.color || PALETTE[0];
  }

  /** data: [{label, value}] ; opts: {horizontal, onSelect, selected, height, color, colors} */
  function bar(container, data, opts = {}) {
    if (!data.length || data.every((d) => !d.value)) return empty(container);
    const horizontal = !!opts.horizontal;
    const height = opts.height || (horizontal ? Math.max(120, data.length * 26 + 16) : 240);
    const { svg, width } = prepare(container, height);
    svg.setAttribute('aria-label', opts.title || 'Bar chart');
    const max = Math.max(...data.map((d) => d.value), 1);
    const dim = (item) => opts.selected && opts.selected !== item.label ? 0.35 : 1;

    if (horizontal) {
      const labelW = Math.min(150, width * 0.38);
      const barArea = width - labelW - 48;
      const rowH = (height - 8) / data.length;
      data.forEach((item, i) => {
        const y = 4 + i * rowH;
        const w = Math.max(2, (item.value / max) * barArea);
        text(svg, labelW - 6, y + rowH / 2 + 4, trunc(item.label, 22), { 'text-anchor': 'end', class: 'chart-label' });
        const r = svgEl('rect', { x: labelW, y: y + rowH * 0.15, width: w, height: rowH * 0.7, rx: 3, fill: colorFor(i, item, opts), opacity: dim(item) }, svg);
        text(svg, labelW + w + 6, y + rowH / 2 + 4, fmt(item.value), { class: 'chart-value' });
        bindTip(r, item.label, item.value);
        clickable(r, item, opts);
      });
    } else {
      const padL = 34, padB = data.length > 8 ? 54 : 30, padT = 14;
      const plotH = height - padB - padT;
      const plotW = width - padL - 8;
      const slot = plotW / data.length;
      [0, 0.5, 1].forEach((f) => {
        const y = padT + plotH * (1 - f);
        svgEl('line', { x1: padL, x2: width - 8, y1: y, y2: y, class: 'chart-grid' }, svg);
        text(svg, padL - 6, y + 4, fmt(max * f), { 'text-anchor': 'end', class: 'chart-axis' });
      });
      data.forEach((item, i) => {
        const h = (item.value / max) * plotH;
        const x = padL + i * slot + slot * 0.15;
        const r = svgEl('rect', { x, y: padT + plotH - h, width: slot * 0.7, height: Math.max(h, 1), rx: 3, fill: colorFor(i, item, opts), opacity: dim(item) }, svg);
        if (slot > 26) text(svg, x + slot * 0.35, padT + plotH - h - 4, fmt(item.value), { 'text-anchor': 'middle', class: 'chart-value' });
        const lx = x + slot * 0.35, ly = padT + plotH + 14;
        const lbl = text(svg, lx, ly, trunc(item.label, data.length > 8 ? 10 : 14), { 'text-anchor': data.length > 8 ? 'end' : 'middle', class: 'chart-label' });
        if (data.length > 8) lbl.setAttribute('transform', `rotate(-40 ${lx} ${ly})`);
        bindTip(r, item.label, item.value);
        clickable(r, item, opts);
      });
    }
  }

  /** data: [{label, value}] ; opts: {onSelect, selected, centerLabel} */
  function donut(container, data, opts = {}) {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (!total) return empty(container);
    container.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'donut-wrap';
    container.appendChild(wrap);
    const size = 180, R = 80, r = 52, cx = size / 2, cy = size / 2;
    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': opts.title || 'Donut chart' }, wrap);
    let angle = -Math.PI / 2;
    const legend = document.createElement('ul');
    legend.className = 'chart-legend';
    data.forEach((item, i) => {
      const frac = item.value / total;
      const a2 = angle + frac * Math.PI * 2;
      const color = item.color || PALETTE[i % PALETTE.length];
      const large = a2 - angle > Math.PI ? 1 : 0;
      const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      let path;
      if (frac >= 0.9999) {
        path = svgEl('circle', { cx, cy, r: (R + r) / 2, fill: 'none', stroke: color, 'stroke-width': R - r }, svg);
      } else {
        const [x1, y1] = p(R, angle), [x2, y2] = p(R, a2), [x3, y3] = p(r, a2), [x4, y4] = p(r, angle);
        path = svgEl('path', { d: `M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`, fill: color }, svg);
      }
      if (opts.selected && opts.selected !== item.label) path.setAttribute('opacity', 0.3);
      bindTip(path, item.label, item.value, '(' + (frac * 100).toFixed(1) + '%)');
      clickable(path, item, opts);
      angle = a2;

      const li = document.createElement('li');
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = color;
      const name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = item.label;
      const val = document.createElement('span');
      val.className = 'legend-val';
      val.textContent = item.value + ' · ' + (frac * 100).toFixed(0) + '%';
      li.append(sw, name, val);
      if (opts.selected && opts.selected !== item.label) li.classList.add('dim');
      clickable(li, item, opts);
      legend.appendChild(li);
    });
    text(svg, cx, cy + 2, fmt(total), { 'text-anchor': 'middle', class: 'donut-total' });
    text(svg, cx, cy + 20, opts.centerLabel || 'total', { 'text-anchor': 'middle', class: 'donut-sub' });
    wrap.appendChild(legend);
  }

  /** opts: {labels:[], series:[{name, values, color}], height} */
  function line(container, { labels, series }, opts = {}) {
    if (!labels.length || series.every((s) => s.values.every((v) => !v))) return empty(container);
    const height = opts.height || 250;
    const { svg, width } = prepare(container, height);
    svg.setAttribute('aria-label', opts.title || 'Line chart');
    const padL = 36, padR = 12, padT = 26, padB = 30;
    const plotW = width - padL - padR, plotH = height - padT - padB;
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const x = (i) => padL + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
    const y = (v) => padT + plotH * (1 - v / max);

    [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
      svgEl('line', { x1: padL, x2: width - padR, y1: y(max * f), y2: y(max * f), class: 'chart-grid' }, svg);
      text(svg, padL - 6, y(max * f) + 4, fmt(max * f), { 'text-anchor': 'end', class: 'chart-axis' });
    });
    const step = Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 60)));
    labels.forEach((l, i) => {
      if (i % step === 0 || i === labels.length - 1) text(svg, x(i), height - 10, l, { 'text-anchor': 'middle', class: 'chart-axis' });
    });

    series.forEach((s, si) => {
      const color = s.color || PALETTE[si];
      const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      if (si === 0) {
        svgEl('polygon', { points: `${x(0)},${y(0)} ${pts} ${x(labels.length - 1)},${y(0)}`, fill: color, opacity: 0.12 }, svg);
      }
      svgEl('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, svg);
      s.values.forEach((v, i) => {
        const c = svgEl('circle', { cx: x(i), cy: y(v), r: 3.5, fill: color }, svg);
        bindTip(c, s.name + ' – ' + labels[i], v);
      });
      // legend
      const lx = padL + si * 120;
      svgEl('rect', { x: lx, y: 6, width: 12, height: 4, rx: 2, fill: color }, svg);
      text(svg, lx + 16, 12, s.name, { class: 'chart-label' });
    });
  }

  return { bar, donut, line, PALETTE };
})();
