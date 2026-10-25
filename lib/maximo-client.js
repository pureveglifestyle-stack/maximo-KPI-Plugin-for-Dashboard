/*
 * OpsLens – read-only Maximo REST client.
 *
 * Every request is an HTTP GET executed *inside the user's Maximo tab*
 * (same origin), so it re-uses the existing login session. Nothing needs
 * to be configured in Maximo. There is deliberately no code path that can
 * send POST/PUT/PATCH/DELETE or a method-override header.
 */
var MaximoClient = (function () {
  const PAGE_SIZE = 500;

  /** Runs inside the Maximo tab. Must be self-contained (it is serialised). */
  async function inTabGet(url) {
    try {
      const target = new URL(url, location.href);
      if (target.origin !== location.origin) {
        return { ok: false, status: 0, error: 'Blocked: cross-origin request' };
      }
      const r = await fetch(target.href, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const text = await r.text();
      return { ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '', text: text };
    } catch (e) {
      return { ok: false, status: 0, error: String(e && e.message ? e.message : e) };
    }
  }

  class MaximoError extends Error {
    constructor(message, status, kind) {
      super(message);
      this.status = status;
      this.kind = kind || 'error';
    }
  }

  class Client {
    /**
     * @param {{tabId:number, base:string}} opts base = e.g. https://host/maximo
     */
    constructor(opts) {
      this.tabId = Number(opts.tabId);
      this.base = String(opts.base).replace(/\/+$/, '');
      this.origin = new URL(this.base).origin;
      this.apiRoot = null; // 'oslc' or 'api'
      this.user = null;
    }

    async _ensureTab() {
      try {
        const t = await chrome.tabs.get(this.tabId);
        if (t && t.url && t.url.startsWith(this.origin)) return;
      } catch (e) { /* tab closed */ }
      const tabs = await chrome.tabs.query({ url: this.origin + '/*' });
      if (!tabs.length) {
        throw new MaximoError('No open Maximo tab found for ' + this.origin +
          '. Open Maximo, log in, and keep that tab open while using the dashboard.', 0, 'notab');
      }
      this.tabId = tabs[0].id;
    }

    /** The only network primitive. GET only. */
    async get(path, params) {
      await this._ensureTab();
      const url = new URL(this.base + path);
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      });
      let res;
      try {
        const out = await chrome.scripting.executeScript({
          target: { tabId: this.tabId },
          func: inTabGet,
          args: [url.href]
        });
        res = out && out[0] && out[0].result;
      } catch (e) {
        throw new MaximoError('Cannot access the Maximo tab (' + e.message + '). ' +
          'Click the OpsLens icon on your Maximo tab and allow access.', 0, 'permission');
      }
      if (!res) throw new MaximoError('No response from Maximo tab', 0);
      if (res.error) throw new MaximoError(res.error, res.status);
      if (res.status === 401 || res.status === 403) {
        throw new MaximoError('Not authorised (' + res.status + '). Your session may have expired or you lack access.', res.status, 'auth');
      }
      let json = null;
      if (/json/i.test(res.ct) || /^\s*[{[]/.test(res.text)) {
        try { json = JSON.parse(res.text); } catch (e) { /* fallthrough */ }
      }
      if (!json) {
        if (/<html|login/i.test(res.text.slice(0, 2000))) {
          throw new MaximoError('Maximo returned a login page – please log in again in the Maximo tab.', res.status, 'auth');
        }
        throw new MaximoError('Unexpected response from Maximo (HTTP ' + res.status + ')', res.status);
      }
      if (!res.ok) {
        const msg = (json.Error && (json.Error.message || json.Error.reasonCode)) || ('HTTP ' + res.status);
        throw new MaximoError(msg, res.status);
      }
      return json;
    }

    /** Detects REST root (/oslc or /api) and who is logged in. */
    async connect() {
      let lastErr = null;
      for (const root of ['oslc', 'api']) {
        try {
          const who = await this.get('/' + root + '/whoami', { lean: 1 });
          this.apiRoot = root;
          this.user = {
            personid: who.personid || who.userName || who.loginID || '',
            name: who.displayName || who.displayname || who.personid || '',
            site: who.insertSite || who.defaultSite || '',
            org: who.insertOrg || who.defaultOrg || ''
          };
          return { apiRoot: root, user: this.user };
        } catch (e) {
          lastErr = e;
          if (e.kind === 'auth' || e.kind === 'notab' || e.kind === 'permission') throw e;
        }
      }
      throw lastErr || new MaximoError('Maximo REST API not reachable', 0);
    }

    /** Returns the first object structure the user can read, or null. */
    async resolveOS(candidates) {
      for (const os of candidates) {
        try {
          await this.get('/' + this.apiRoot + '/os/' + os, { lean: 1, 'oslc.pageSize': 1, 'oslc.select': 'href' });
          return os;
        } catch (e) {
          if (e.kind === 'auth' && e.status !== 403) throw e;
        }
      }
      return null;
    }

    /**
     * Reads all pages (up to cap) of an object structure.
     * @returns {{rows:object[], total:number|null, truncated:boolean}}
     */
    async fetchAll(os, { select, where, orderBy, cap = 5000, onPage } = {}) {
      const rows = [];
      let total = null;
      for (let page = 1; rows.length < cap; page++) {
        const json = await this.get('/' + this.apiRoot + '/os/' + os, {
          lean: 1,
          'oslc.select': select,
          'oslc.where': where,
          'oslc.orderBy': orderBy,
          'oslc.pageSize': PAGE_SIZE,
          pageno: page,
          collectioncount: page === 1 ? 1 : undefined
        });
        const members = json.member || json['rdfs:member'] || [];
        if (page === 1 && json.responseInfo && typeof json.responseInfo.totalCount === 'number') {
          total = json.responseInfo.totalCount;
        }
        rows.push(...members);
        if (onPage) onPage(rows.length, total);
        const hasNext = json.responseInfo && json.responseInfo.nextPage;
        if (members.length < PAGE_SIZE || !hasNext) break;
      }
      const truncated = rows.length >= cap && (total === null || total > rows.length);
      return { rows: rows.slice(0, cap), total, truncated };
    }

    /** Tries several where clauses (older Maximo versions differ in what they accept). */
    async fetchFirstWorking(os, wheres, opts) {
      let lastErr = null;
      for (const where of wheres) {
        try {
          return await this.fetchAll(os, Object.assign({}, opts, { where }));
        } catch (e) {
          lastErr = e;
          if (e.kind === 'auth' || e.kind === 'notab' || e.kind === 'permission') throw e;
        }
      }
      throw lastErr;
    }

    /** Deep link that opens a record in the Maximo UI (navigation only). */
    recordLink(app, uid) {
      if (!uid) return null;
      return this.base + '/ui/?event=loadapp&value=' + encodeURIComponent(app) + '&uniqueid=' + encodeURIComponent(uid);
    }
  }

  /** Works out the Maximo base URL (origin + context root) from any Maximo page URL. */
  function detectBase(pageUrl) {
    let u;
    try { u = new URL(pageUrl); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const segs = u.pathname.split('/').filter(Boolean);
    const known = ['ui', 'webclient', 'oslc', 'api', 'maxrest'];
    const idx = segs.findIndex((s) => known.includes(s.toLowerCase()));
    if (idx > 0) return { base: u.origin + '/' + segs.slice(0, idx).join('/'), confident: true };
    const mx = segs.findIndex((s) => /^maximo/i.test(s));
    if (mx >= 0) return { base: u.origin + '/' + segs.slice(0, mx + 1).join('/'), confident: true };
    return { base: u.origin + '/maximo', confident: false };
  }

  return { Client, MaximoError, detectBase };
})();
