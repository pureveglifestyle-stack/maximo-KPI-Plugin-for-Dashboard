/*
 * OpsLens – sortable, paged data table + CSV export. textContent only.
 */
var OpsTable = (function () {
  function render(container, rows, columns, opts = {}) {
    const pageSize = opts.pageSize || 15;
    let sortKey = opts.sortKey || null;
    let sortDesc = !!opts.sortDesc;
    let page = 0;

    function sorted() {
      if (!sortKey) return rows;
      const col = columns.find((c) => c.key === sortKey);
      const val = col.sortValue || ((r) => r[sortKey]);
      return rows.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        if (x === y) return 0;
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return sortDesc ? -cmp : cmp;
      });
    }

    function draw() {
      container.textContent = '';
      if (!rows.length) {
        const p = document.createElement('div');
        p.className = 'chart-empty';
        p.textContent = opts.emptyText || 'Nothing to show';
        container.appendChild(p);
        return;
      }
      const data = sorted();
      const pages = Math.ceil(data.length / pageSize);
      page = Math.min(page, pages - 1);
      const wrap = document.createElement('div');
      wrap.className = 'tbl-wrap';
      const table = document.createElement('table');
      const thead = table.createTHead().insertRow();
      columns.forEach((c) => {
        const th = document.createElement('th');
        th.textContent = c.label;
        if (c.key === sortKey) th.className = 'sorted' + (sortDesc ? ' desc' : '');
        th.addEventListener('click', () => {
          if (sortKey === c.key) sortDesc = !sortDesc;
          else { sortKey = c.key; sortDesc = false; }
          draw();
        });
        thead.appendChild(th);
      });
      const tbody = table.createTBody();
      data.slice(page * pageSize, (page + 1) * pageSize).forEach((r) => {
        const tr = tbody.insertRow();
        columns.forEach((c) => {
          const td = tr.insertCell();
          if (c.wrap) td.className = 'wrap';
          const v = c.render ? c.render(r) : r[c.key];
          if (v instanceof Node) td.appendChild(v);
          else td.textContent = v === null || v === undefined ? '' : String(v);
        });
      });
      wrap.appendChild(table);
      container.appendChild(wrap);

      const pager = document.createElement('div');
      pager.className = 'pager';
      const info = document.createElement('span');
      info.textContent = `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, data.length)} of ${data.length}`;
      const nav = document.createElement('span');
      const prev = document.createElement('button');
      prev.className = 'btn'; prev.textContent = '‹ Prev'; prev.disabled = page === 0;
      prev.onclick = () => { page--; draw(); };
      const next = document.createElement('button');
      next.className = 'btn'; next.textContent = 'Next ›'; next.disabled = page >= pages - 1;
      next.onclick = () => { page++; draw(); };
      nav.append(prev, next);
      pager.append(info, nav);
      container.appendChild(pager);
    }
    draw();
  }

  function toCSV(rows, columns) {
    const esc = (v) => {
      let s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [columns.map((c) => esc(c.label)).join(',')];
    rows.forEach((r) => lines.push(columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(',')));
    return '﻿' + lines.join('\r\n');
  }

  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { render, toCSV, download };
})();
