# Publishing GENMAHI AI to the Microsoft Edge Add-ons store

Everything you need to copy and paste into Microsoft Partner Center is in this file.
The images are in this `store/` folder.

## 1. One-time: register as an Edge extension developer (free)

1. Go to **https://partner.microsoft.com/dashboard/microsoftedge/overview** and sign in with a Microsoft account.
   A company account for GENMAHI AI is best.
2. Choose **Account type: Company**, and enter *GENMAHI AI Middle East Trading and Solutions FZ-LLC* with its
   contact details. Microsoft verifies company accounts, which can take a few business days.
3. Accept the Microsoft Edge Add-ons developer agreement. Registration is free.

## 2. Create the submission

1. In Partner Center, open **Microsoft Edge → Extensions → Create new extension**.
2. **Upload package:** `genmahi-ai-edge-store.zip`. `manifest.json` must be at the top level of the zip, as it is in
   that file.
3. **Availability:** *Public*, all markets. Choose *Hidden* if you only want people who have the link to install it.
4. **Properties**
   * Category: **Productivity**
   * Privacy policy: **Yes**. URL:
     `https://github.com/pureveglifestyle-stack/maximo-kpi-plugin-for-dashboard/blob/main/PRIVACY.md`
   * Website:
     `https://github.com/pureveglifestyle-stack/maximo-kpi-plugin-for-dashboard`
   * Support contact: your company support e-mail address
   * Mature content: **No**
5. **Store listings → English:** use the text and images below.
6. **Submit.** Certification usually takes up to 7 business days. When it is approved, you get a public store link like
   `https://microsoftedge.microsoft.com/addons/detail/<id>` that anyone can install from.

---

## Display name
```
GENMAHI AI – Read-only Operations Dashboard (for Maximo)
```

## Short description (shown in search results)
```
Free, read-only, BI-style operations dashboard for your Maximo session. Independent research project, not affiliated with IBM.
```

## Description
```
GENMAHI AI Operations Dashboard turns the Maximo you are already logged in to into a Power BI-style operations dashboard. There is nothing to configure and nothing to install inside Maximo.

WHAT YOU GET
• KPIs: open backlog, overdue %, emergency / priority 1, created vs completed, average completion time, PM compliance and backlog hours
• Interactive charts: trend, status, work type, priority, backlog aging, site, top-10 "bad actor" assets and owner groups
• Click any chart to cross-filter the whole dashboard
• Work order explorer with quick views, search, sorting and CSV export
• Assets & PM: asset status and type, % operating, overdue and upcoming PMs
• Service requests: trend, status, priority and average resolution time
• Period and site filters, auto-refresh, light and dark theme
• Demo mode with sample data, so you can try it without Maximo

HOW TO USE
1. Log in to Maximo (7.6.x or Maximo Application Suite / Manage) in a browser tab.
2. Click the GENMAHI AI icon and accept the Terms & Conditions.
3. Click "Open Operations Dashboard".

READ-ONLY AND PRIVATE
• It only reads data (HTTP GET) through your existing Maximo login. It never creates, changes or deletes anything.
• You only see what your Maximo security groups allow. If your group has no access to an area, the dashboard says "Not authorized to view".
• Your data stays in your browser: no external servers, no tracking and no telemetry.

DISCLAIMER
GENMAHI AI Operations Dashboard is a free, independent research project by GENMAHI AI Middle East Trading and Solutions FZ-LLC. It is not affiliated with, endorsed by or related to IBM or any IBM Maximo product. IBM and Maximo are trademarks of IBM Corp. and are used only to describe compatibility. It is provided "as is" without warranty. Users use it at their own risk and are solely responsible for complying with their organisation's policies and licence terms.
```

## Images

| Store field | File |
|---|---|
| Store logo (300 × 300) | `store-logo-300.png` |
| Small promotional tile (440 × 280) | `promo-small-440x280.png` |
| Large promotional tile (1400 × 560, optional) | `promo-large-1400x560.png` |
| Screenshots (1280 × 800, up to 10) | `screenshot-1-overview.png` to `screenshot-5-terms.png` |

## Search terms (up to 7)
```
Maximo dashboard; EAM KPI; maintenance dashboard; work order analytics; asset management; PM compliance; operations BI
```

---

## Notes for certification (paste into "Notes for certification")
```
This extension is a read-only dashboard for IBM Maximo users. Reviewers will usually not have a Maximo system, so please test with the built-in DEMO MODE:

1. Click the toolbar icon.
2. Tick the Terms & Conditions box and click Accept.
3. Click "Open demo (sample data)". The full dashboard opens with synthetic data and makes no network requests.

Permissions:
- activeTab + scripting: when the user is on their own logged-in Maximo tab, the extension runs a same-origin HTTP GET request inside that tab to read data through the user's existing session. GET only; it never writes data.
- storage: stores Terms acceptance and display preferences locally.
- optional host permissions: requested at runtime with chrome.permissions.request for the single Maximo host the user is on, only after the user clicks "Open Operations Dashboard".
No remote code, no analytics, no data is sent to any server other than the user's own Maximo.
```

## Permission justifications (if asked per permission)

| Permission | Justification |
|---|---|
| `activeTab` | Detects the Maximo address of the tab the user is on when they click the icon. |
| `scripting` | Runs a read-only, same-origin HTTP GET inside the user's Maximo tab to reuse their login session. |
| `storage` | Saves Terms acceptance and display preferences on the device. |
| Optional host access | Requested at runtime for the one Maximo host the user chooses. Used only for GET requests. |

## Updating later

Increase `"version"` in `manifest.json` (for example 1.1.1 → 1.1.2), build a new zip, then in Partner Center open the
extension, choose **Update → Upload package** and submit. Users who installed from the store get the update automatically.
