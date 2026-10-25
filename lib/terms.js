/*
 * OpsLens – Terms & Conditions (single source of truth).
 * Bump VERSION whenever the text changes; users are asked to accept again.
 */
var OpsTerms = (function () {
  const VERSION = '1.0';

  const SUMMARY = [
    'READ-ONLY: OpsLens only reads data (HTTP GET) through your existing Maximo login. It never creates, changes or deletes anything.',
    'NOT AFFILIATED WITH IBM: this is an independent research project. IBM and Maximo are trademarks of IBM Corp.',
    'USE AT YOUR OWN RISK: provided free and "as is", without any warranty. You are solely responsible for its use.',
    'YOUR DATA STAYS IN YOUR BROWSER: no external servers, no tracking, no telemetry.'
  ];

  const HTML = `
<h2>OpsLens – Terms &amp; Conditions of Use</h2>
<p class="terms-meta">Version ${VERSION}</p>

<h3>1. Independent research project – no affiliation</h3>
<p>OpsLens ("the Extension") is an independent, free research project developed by its authors.
It is <strong>not</strong> affiliated with, related to, endorsed by, sponsored by or supported by
International Business Machines Corporation ("IBM") or any of its products, including IBM Maximo,
IBM Maximo Application Suite or IBM Maximo Manage. "IBM" and "Maximo" are trademarks of IBM Corp.,
used here only to describe compatibility.</p>

<h3>2. Read-only by design</h3>
<p>The Extension is strictly <strong>read-only</strong>. It only issues HTTP <code>GET</code> requests
to the standard Maximo REST/OSLC endpoints, using the session you are already logged in with.
It does not create, update, approve, route or delete any record, and it requires no configuration,
customisation, script, object structure or installation inside Maximo.</p>

<h3>3. Your access rights apply</h3>
<p>All data shown is retrieved with your own user account. Maximo's security (sites, security groups,
object structure permissions) decides what you can see. The Extension does not bypass any security.</p>

<h3>4. Privacy – your data stays local</h3>
<p>Data is fetched directly from your Maximo server into your browser and is kept in memory only while
the dashboard is open. Nothing is sent to the authors or any third party. There is no analytics,
tracking or telemetry. The Extension stores only your acceptance of these terms and display preferences
in your browser's local extension storage.</p>

<h3>5. No warranty – use at your own risk</h3>
<p>The Extension is provided free of charge, <strong>"AS IS" and "AS AVAILABLE", without warranty of any
kind</strong>, express or implied, including but not limited to merchantability, fitness for a particular
purpose, accuracy, and non-infringement. Figures, KPIs and charts are indicative calculations made in your
browser and may differ from official Maximo reports. Always verify in Maximo before making decisions.</p>

<h3>6. Limitation of liability</h3>
<p>To the maximum extent permitted by law, the authors and contributors shall not be liable for any direct,
indirect, incidental, special, consequential or exemplary damages (including loss of data, business
interruption, system performance impact, or policy or contractual breaches) arising in any way from the
use of, or inability to use, the Extension.</p>

<h3>7. Your sole responsibility</h3>
<p>You, the user, are <strong>solely responsible</strong> for your decision to install and use this free
Extension, and for making sure that your use complies with your organisation's IT, security and data
policies, your software licence agreements (including any IBM licence terms), and all applicable laws.
If in doubt, ask your Maximo administrator or IT department <em>before</em> using it.</p>

<h3>8. Reasonable use</h3>
<p>Every refresh sends read queries to your Maximo server. Use sensible date ranges and refresh intervals,
especially on production systems.</p>

<h3>9. No support, changes</h3>
<p>The Extension is a research work offered without any support or maintenance obligation. It may be
changed or discontinued at any time. These terms may be updated; you will be asked to accept the new
version before continuing.</p>

<h3>10. Acceptance</h3>
<p>By ticking the box and clicking <em>Accept</em>, you confirm that you have read, understood and agree to
these terms. If you do not agree, do not use the Extension and remove it from your browser.</p>
`;

  async function isAccepted() {
    try {
      const s = await chrome.storage.local.get('termsAccepted');
      return s.termsAccepted === VERSION;
    } catch (e) {
      return false;
    }
  }

  async function accept() {
    await chrome.storage.local.set({ termsAccepted: VERSION, termsAcceptedAt: new Date().toISOString() });
  }

  async function revoke() {
    await chrome.storage.local.remove(['termsAccepted', 'termsAcceptedAt']);
  }

  return { VERSION, SUMMARY, HTML, isAccepted, accept, revoke };
})();
