(async function () {
  const $ = (id) => document.getElementById(id);

  GenmahiTerms.SUMMARY.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = s;
    $('terms-summary').appendChild(li);
  });
  $('terms-full').innerHTML = GenmahiTerms.HTML; // static text authored in lib/terms.js

  $('link-terms').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('terms/terms.html') });
  });

  $('terms-check').addEventListener('change', (e) => { $('terms-accept').disabled = !e.target.checked; });
  $('terms-accept').addEventListener('click', async () => {
    await GenmahiTerms.accept();
    showMain();
  });
  $('terms-decline').addEventListener('click', () => window.close());

  if (await GenmahiTerms.isAccepted()) showMain();
  else $('view-terms').hidden = false;

  async function showMain() {
    $('view-terms').hidden = true;
    $('view-main').hidden = false;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const det = tab && tab.url ? MaximoClient.detectBase(tab.url) : null;
    const box = $('detect');
    box.textContent = '';

    const status = document.createElement('div');
    if (det && det.confident) {
      status.className = 'ok';
      status.textContent = '✔ Maximo detected';
    } else {
      status.className = 'no';
      status.textContent = det ? 'Maximo not recognised on this tab' : 'This tab is not a web page';
    }
    box.appendChild(status);

    if (det) {
      const code = document.createElement('code');
      code.textContent = det.base;
      box.appendChild(code);
      const btn = $('open-dashboard');
      btn.hidden = false;
      if (!det.confident) btn.textContent = 'Try this tab anyway';
      btn.addEventListener('click', () => openDashboard(tab, det.base));
    }

    $('open-demo').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html?demo=1') });
      window.close();
    });
  }

  async function openDashboard(tab, base) {
    const origin = new URL(base).origin;
    try {
      // Read-only access to this one Maximo host, requested on user click.
      const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
      if (!granted) {
        showError('Access to ' + origin + ' was not granted. GENMAHI AI needs it to read data through your Maximo session.');
        return;
      }
    } catch (e) {
      showError(e.message);
      return;
    }
    const url = chrome.runtime.getURL('dashboard/dashboard.html') +
      '?tabId=' + encodeURIComponent(tab.id) + '&base=' + encodeURIComponent(base);
    chrome.tabs.create({ url, index: tab.index + 1 });
    window.close();
  }

  function showError(msg) {
    const e = $('error');
    e.textContent = msg;
    e.hidden = false;
  }
})();
