(async function () {
  const $ = (id) => document.getElementById(id);
  $('terms').innerHTML = GenmahiTerms.HTML; // static text authored in lib/terms.js
  const ret = new URLSearchParams(location.search).get('return');

  async function refresh() {
    const ok = await GenmahiTerms.isAccepted();
    $('accept-box').hidden = ok;
    $('accepted').hidden = !ok;
    $('ver').textContent = GenmahiTerms.VERSION;
  }

  $('check').addEventListener('change', (e) => { $('accept').disabled = !e.target.checked; });
  $('accept').addEventListener('click', async () => {
    await GenmahiTerms.accept();
    // Only return to pages inside this extension.
    if (ret && ret.startsWith(chrome.runtime.getURL(''))) location.href = ret;
    else refresh();
  });
  $('revoke').addEventListener('click', async () => {
    await GenmahiTerms.revoke();
    $('check').checked = false;
    $('accept').disabled = true;
    refresh();
  });
  refresh();
})();
