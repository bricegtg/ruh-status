// RUH Airport Status widget for Scriptable (iOS). No secrets.
// Widget cycles one frame per refresh (small/medium); large shows two frames. Tap opens the full paged view.
const DATA_URL = "https://ruh-status.onrender.com/latest.json";
const NAVY = new Color("#0B1F3A"), TEAL = new Color("#14B8A6"), WHITE = Color.white(),
      MUTED = new Color("#A9B8CC"), AMBER = new Color("#F59E0B"), RED = new Color("#F87171");
const STALE_MIN = 90, REFRESH_MIN = 15;
const FRAMES = ["status", "movements", "flow", "cancellations", "gulf", "news"];
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "ruh_status");
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
const CACHE = fm.joinPath(dir, "latest.json"), IDX = fm.joinPath(dir, "frame_index.txt");

async function getData() {
  let data = null, offline = false;
  try {
    const r = new Request(DATA_URL + (DATA_URL.includes("?") ? "&" : "?") + "t=" + Date.now());
    r.timeoutInterval = 15;
    data = await r.loadJSON();
    if (!data || !data.schema) throw new Error("bad json");
    fm.writeString(CACHE, JSON.stringify(data));
  } catch (e) {
    offline = true;
    if (fm.fileExists(CACHE)) data = JSON.parse(fm.readString(CACHE));
  }
  return { data, offline };
}

function t12(iso) { // US 12-hour clock, Riyadh time
  if (!iso) return "n/a";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh" });
}
function dataAsOf(d) { return d ? (d.data_as_of || d.live_as_of || d.as_of) : null; }
function ageMin(d) { const a = dataAsOf(d); return a ? Math.round((Date.now() - new Date(a).getTime()) / 60000) : null; }
function v(x) { return x === null || x === undefined ? "n/a" : String(x); }
function levelColor(l) { l = (l || "").toUpperCase(); return l === "NORMAL" ? TEAL : (l.includes("CLOSED") || l.includes("HALT")) ? RED : AMBER; }
function tagColor(t) { t = (t || "").toUpperCase(); return t === "CONFIRMED" || t === "CORROBORATED" ? TEAL : t === "UNVERIFIED" || t === "CLAIM" ? AMBER : MUTED; }

function frameLines(d, f, max) {
  const L = []; // [text, color, size, bold]
  const mv = d.movements || {}, c = d.cancellations || {};
  if (f === "status") {
    L.push([v(d.level), levelColor(d.level), 15, true]);
    L.push([d.status_line || d.headline || "No status line", WHITE, 12, false]);
    if (d.headline && d.status_line) L.push([d.headline, MUTED, 10, false]);
    L.push([`Report ${t12(d.editorial_as_of || d.as_of)} · next ${v(d.next_update)}`, MUTED, 9, false]);
  } else if (f === "movements") {
    L.push(["LAST HOUR", TEAL, 10, true]);
    L.push([`${v(mv.takeoffs_last_hour)} takeoffs · ${v(mv.landings_last_hour)} landings`, WHITE, 14, true]);
    const lt = mv.last_takeoff, ll = mv.last_landing;
    if (lt) L.push([`Last takeoff ${v(lt.time)} ${v(lt.flight)} to ${v(lt.city)}`, WHITE, 11, false]);
    if (ll) L.push([`Last landing ${v(ll.time)} ${v(ll.flight)} from ${v(ll.city)}`, WHITE, 11, false]);
  } else if (f === "flow") {
    const ft = (d.flow24 || {}).totals || {};
    L.push(["FLOW · LAST 24 H", TEAL, 10, true]);
    L.push([`${v(ft.takeoffs)} takeoffs · ${v(ft.landings)} landings · ${v(ft.cancelled)} ×`, WHITE, 10, false]);
  } else if (f === "cancellations") {
    L.push(["CANCELLED TODAY", TEAL, 10, true]);
    L.push([`${v(c.total)} flights (${v(c.pct_of_scheduled)}% of ${v(c.scheduled)})`, WHITE, 14, true]);
    L.push([`${v(c.departures)} departures · ${v(c.arrivals)} arrivals · ${v(d.diversions)} diverted`, WHITE, 11, false]);
    const h = (d.halts || []).slice(0, 2).map(x => `${x.label} (${x.minutes} min)`).join("; ");
    if (h) L.push(["Halts: " + h, MUTED, 10, false]);
  } else if (f === "gulf") {
    L.push(["GULF ROUTES · NEXT FLIGHT", TEAL, 10, true]);
    for (const g of d.gulf || []) {
      const time = g.estimated && g.estimated !== g.scheduled ? `${v(g.scheduled)}→${g.estimated}` : v(g.scheduled);
      L.push([`${g.code} ${v(g.flight)} ${time}${g.tomorrow ? " (tmrw)" : ""} · ${v(g.status)}`, WHITE, 10, false]);
    }
  } else if (f === "news") {
    L.push(["TOP NEWS" + (d.news_checked ? " · checked " + d.news_checked : ""), TEAL, 10, true]);
    for (const n of (d.news || []).slice(0, max || 3)) L.push([`[${v(n.tag)}] ${v(n.title)}`, tagColor(n.tag), 10, false]);
  }
  return L;
}

// Widget canvas sizes in points (iPhone 6.1"); used to size the chart to the space that is left.
const SZ = { small: [158, 158], medium: [338, 158], large: [338, 354], extraLarge: [715, 338] };
const PAD = 12;

function txt(stack, t, col, size, bold, lines, minScale) {
  const s = stack.addText(String(t)); s.textColor = col; s.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  s.lineLimit = lines || 1; s.minimumScaleFactor = minScale || 0.6; return s;
}

function addFrame(stack, d, f, family, max) {
  for (const [t, col, size, bold] of frameLines(d, f, max)) {
    const sz = family === "small" ? size - 1 : size;
    txt(stack, t, col, sz, bold, family === "small" ? 3 : 4, 0.7); stack.addSpacer(2);
  }
}

function nextIndex() {
  let i = fm.fileExists(IDX) ? parseInt(fm.readString(IDX)) || 0 : new Date().getHours();
  i = (i + 1) % FRAMES.length; fm.writeString(IDX, String(i)); return i;
}

// Rolling 24 h flow chart. opts: {axis: hour labels, halts: vertical halt labels, every: label step}
function flowImage(f, w, h, labels, opts) {
  opts = opts || {}; const axis = opts.axis !== undefined ? opts.axis : labels, hl = !!opts.halts;
  if (!f || !f.buckets) return null;
  const dc = new DrawContext(); dc.size = new Size(w, h); dc.opaque = false; dc.respectScreenScale = true;
  const B = f.buckets, n = B.length, L = 4, R = 4, T = 4, BOT = axis ? 24 : 12, pw = w - L - R, ph = h - T - BOT, bw = pw / n;
  let mx = 4; for (const b of B) mx = Math.max(mx, b.takeoffs + b.landings);
  const ymax = mx * (hl ? 1.25 : 1.12), Y = v => T + ph - v / ymax * ph;
  const t0 = new Date(B[0].hour_start).getTime(), tEnd = new Date(f.end).getTime(), X = ms => L + (ms - t0) / 3600000 * bw;
  const spans = [];
  for (const x of f.halts || []) {
    const a = Math.max(X(new Date(x.start).getTime()), L), e = Math.min(X(x.end ? new Date(x.end).getTime() : tEnd), w - R);
    if (e > a) { dc.setFillColor(new Color("#8A97A8", 0.35)); dc.fillRect(new Rect(a, T, e - a, ph)); spans.push([a, e, x.label]); }
  }
  B.forEach((b, i) => {
    const x0 = L + i * bw + bw * 0.12, bwid = bw * 0.76;
    if (b.landings) { dc.setFillColor(new Color("#3B6FB6")); dc.fillRect(new Rect(x0, Y(b.landings), bwid, T + ph - Y(b.landings))); }
    if (b.takeoffs) { dc.setFillColor(TEAL); dc.fillRect(new Rect(x0, Y(b.landings + b.takeoffs), bwid, Y(b.landings) - Y(b.landings + b.takeoffs))); }
    if (b.cancelled) { dc.setTextColor(new Color("#F2B8B5")); dc.setFont(Font.boldSystemFont(Math.min(9, 5 + b.cancelled * 0.3)));
      dc.drawTextInRect("\u00d7", new Rect(x0 - 2, T + ph, bwid + 4, 11)); }
    const every = opts.every || 6;
    if (axis && (i % every === 0 || i === n - 1)) { dc.setTextColor(MUTED); dc.setFont(Font.systemFont(8));
      dc.drawTextInRect(b.label, new Rect(x0 - 14, h - 11, bwid + 28, 11)); }
  });
  dc.setFillColor(new Color("#9FB0C6", 0.5)); dc.fillRect(new Rect(L, T + ph, pw, 0.7));
  if (hl) { // halt labels: rotate the canvas by drawing characters stacked is unreadable; use short time text centered in the box top
    dc.setFont(Font.boldSystemFont(7)); dc.setTextColor(WHITE);
    for (const [a, e, lab] of spans) {
      const short = String(lab).replace("Halt ", "").replace(/ (AM|PM)/g, "").replace("since ", ">");
      const wdt = Math.max(e - a, 30), cx = (a + e) / 2;
      dc.drawTextInRect(short, new Rect(cx - wdt / 2 - 6, T + 1, wdt + 12, 10));
    }
  }
  return dc.getImage();
}

function countsRow(stack, d, family) {
  const c = d.cancellations || {}, row = stack.addStack(); row.centerAlignContent();
  const cell = (big, small) => { const s = row.addStack(); s.layoutVertically();
    txt(s, v(big), WHITE, family === "small" ? 13 : 16, true); txt(s, small, MUTED, 8); row.addSpacer(); };
  cell(c.departures, "dep cxl"); cell(c.arrivals, "arr cxl"); cell(d.diversions, "diverted");
  if (family !== "small") { const m = d.movements || {}; cell(`${v(m.takeoffs_last_hour)}/${v(m.landings_last_hour)}`, "tko/lnd 1h"); }
}

function gulfRow(stack, d) {
  const g = (d.gulf || []).map(x => `${x.code} ${x.flight ? x.flight + " " + (x.tomorrow ? "tmrw " : "") + v(x.estimated || x.scheduled) : "none"}`);
  txt(stack, "Gulf next: " + g.join(" · "), MUTED, 9, false, 2, 0.6);
}

// Locked single frame that fills the widget (Smart Stack). Returns nothing; draws into body.
function lockedFrame(body, d, f, family, availH, W) {
  const ft = (d.flow24 || {}).totals || {};
  if (f === "flow") {
    txt(body, `FLOW · LAST 24 H · ${v(ft.takeoffs)} tko · ${v(ft.landings)} lnd · ${v(ft.cancelled)} ×`, TEAL, 10, true);
    body.addSpacer(3);
    const h = Math.max(50, availH - 16), img = flowImage(d.flow24, W, h, family !== "small", { halts: family !== "small", every: family === "small" ? 12 : (family === "medium" ? 6 : 3) });
    if (img) { const wi = body.addImage(img); wi.imageSize = new Size(W, h); }
    return;
  }
  if (f === "status") {
    txt(body, v(d.level), levelColor(d.level), family === "small" ? 14 : 16, true);
    txt(body, d.status_line || d.headline || "", WHITE, family === "small" ? 10 : 12, false, family === "small" ? 3 : 2, 0.7);
    if (family === "large" && d.headline) { body.addSpacer(3); txt(body, d.headline, MUTED, 11, false, 4, 0.7); }
    body.addSpacer(); countsRow(body, d, family);
    if (family === "large") { body.addSpacer(6); gulfRow(body, d); }
    return;
  }
  addFrame(body, d, f, family, family === "large" ? 6 : family === "medium" ? 3 : 2);
  body.addSpacer();
  if (f !== "cancellations" && family !== "small") countsRow(body, d, family);
}

async function buildWidget(d, offline) {
  const family = config.widgetFamily || (args.queryParameters && args.queryParameters.preview) || "medium";
  const [WW, WH] = SZ[family] || SZ.medium, W = WW - 2 * PAD;
  const w = new ListWidget(); w.backgroundColor = NAVY; w.setPadding(10, PAD, 10, PAD);
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MIN * 60000);
  w.url = URLScheme.forRunningScript();
  const head = w.addStack(); head.centerAlignContent();
  txt(head, "RUH STATUS", TEAL, 10, true); head.addSpacer();
  if (!d) { txt(w, "No data yet. Check connection.", WHITE, 12, false, 3); return w; }
  const age = ageMin(d), stale = age !== null && age > STALE_MIN;
  const a = txt(head, family === "small" ? t12(d.live_as_of || d.as_of) : `live ${t12(d.live_as_of || d.as_of)} · rpt ${t12(d.editorial_as_of || d.as_of)}`, stale ? AMBER : MUTED, 9);
  w.addSpacer(4);
  const param = String(args.widgetParameter || "").trim().toLowerCase();
  const locked = FRAMES.includes(param) ? param : null;
  const body = w.addStack(); body.layoutVertically();
  const HEAD = 18, FOOT = 12, avail = WH - 20 - HEAD - FOOT;   // 20 = vertical padding
  let i = -1;
  if (locked) {
    lockedFrame(body, d, locked, family, avail, W);
  } else if (family === "large" || family === "extraLarge") {
    // status block + rotating frame; flow is sized to the remaining height, then counts + Gulf footer
    txt(body, v(d.level), levelColor(d.level), 15, true);
    txt(body, d.status_line || d.headline || "", WHITE, 12, false, 3, 0.7);
    body.addSpacer(6);
    i = nextIndex(); const f = FRAMES[1 + (i % (FRAMES.length - 1))];
    if (f === "flow") {
      const ft = (d.flow24 || {}).totals || {};
      txt(body, `FLOW · LAST 24 H · ${v(ft.takeoffs)} tko · ${v(ft.landings)} lnd · ${v(ft.cancelled)} ×`, TEAL, 10, true); body.addSpacer(2);
      const h = Math.max(90, avail - 66 - 16 - 50), img = flowImage(d.flow24, W, h, true, { halts: true, every: 3 });
      if (img) { const wi = body.addImage(img); wi.imageSize = new Size(W, h); }
    } else addFrame(body, d, f, family, 5);
    body.addSpacer();
    countsRow(body, d, family); body.addSpacer(4); gulfRow(body, d);
  } else {
    i = nextIndex(); const f = FRAMES[i];
    if (f === "flow") lockedFrame(body, d, "flow", family, avail, W);
    else { addFrame(body, d, f, family); }
  }
  w.addSpacer();
  const foot = w.addStack();
  const dots = txt(foot, locked ? locked.toUpperCase() : (i >= 0 && family !== "large" ? FRAMES.map((_, k) => (k === i ? "\u25CF" : "\u25CB")).join(" ") : ""), TEAL, 7);
  foot.addSpacer();
  if (stale || offline) txt(foot, stale ? `STALE ${Math.round(age / 60 * 10) / 10}h` : "offline cache", AMBER, 8, true);
  return w;
}

function fillTable(tbl, d, offline, onRefresh, note) {
  tbl.removeAllRows();
  const add = (title, sub, col, onSelect, h) => {
    const r = new UITableRow(); r.backgroundColor = NAVY; if (h) r.height = h;
    const c = r.addText(title, sub || null); c.titleColor = col || WHITE; c.subtitleColor = MUTED;
    c.titleFont = Font.systemFont(14); c.subtitleFont = Font.systemFont(12); c.widthWeight = 1;
    if (onSelect) { r.dismissOnSelect = false; r.onSelect = onSelect; }
    tbl.addRow(r);
  };
  const hdr = (t) => { const r = new UITableRow(); r.isHeader = true; r.backgroundColor = new Color("#0F2C52");
    const c = r.addText(t); c.titleColor = TEAL; c.titleFont = Font.boldSystemFont(13); tbl.addRow(r); };
  // Refresh button row
  const rr = new UITableRow(); rr.backgroundColor = TEAL; rr.height = 52; rr.dismissOnSelect = false; rr.onSelect = onRefresh;
  const rc = rr.addText("\u21BB  Refresh", note || "Tap to fetch the latest data"); rc.titleColor = NAVY; rc.subtitleColor = NAVY;
  rc.titleFont = Font.boldSystemFont(16); rc.subtitleFont = Font.systemFont(11); tbl.addRow(rr);
  if (!d) { add("No data available", "Check the URL or connection"); return; }
  const age = ageMin(d);
  hdr(`RUH STATUS · live ${t12(d.live_as_of || d.as_of)} · report ${t12(d.editorial_as_of || d.as_of)} AST${age > STALE_MIN ? " · STALE" : ""}${offline ? " · offline" : ""}`);
  add(v(d.level), d.status_line, levelColor(d.level), null, 70);
  if (d.headline) add(d.headline, `Next update ${v(d.next_update)}`, WHITE, null, 90);
  const mv = d.movements || {}, c = d.cancellations || {};
  hdr("MOVEMENTS · LAST HOUR");
  add(`${v(mv.takeoffs_last_hour)} takeoffs · ${v(mv.landings_last_hour)} landings`);
  if (mv.last_takeoff) add(`Last takeoff ${mv.last_takeoff.time}`, `${v(mv.last_takeoff.flight)} to ${v(mv.last_takeoff.city)}`);
  if (mv.last_landing) add(`Last landing ${mv.last_landing.time}`, `${v(mv.last_landing.flight)} from ${v(mv.last_landing.city)}`);
  if (d.flow24) {
    const ft = d.flow24.totals || {};
    hdr(`FLOW · LAST 24 H · ${v(ft.takeoffs)} takeoffs · ${v(ft.landings)} landings · ${v(ft.cancelled)} cancelled`);
    const img = flowImage(d.flow24, 360, 170, true, { halts: true, every: 3 });
    if (img) { const r = new UITableRow(); r.backgroundColor = NAVY; r.height = 180; const ic = r.addImage(img); ic.centerAligned(); tbl.addRow(r); }
    add("Teal = takeoffs · blue = landings · × = cancelled · gray = halt 45+ min", null, MUTED, null, 40);
  }
  hdr("CANCELLATIONS · DIVERSIONS · HALTS");
  add(`${v(c.total)} cancelled (${v(c.pct_of_scheduled)}% of ${v(c.scheduled)})`, `${v(c.departures)} departures · ${v(c.arrivals)} arrivals`);
  add(`${v(d.diversions)} diversions today`);
  for (const h of d.halts || []) add(h.label, `${h.minutes} min`, MUTED);
  hdr("GULF ROUTES · NEXT FLIGHT");
  for (const g of d.gulf || []) add(`${g.code} ${g.city}: ${v(g.flight)} ${v(g.airline)}`,
    `Sched ${v(g.scheduled)}${g.estimated ? " · est " + g.estimated : ""}${g.tomorrow ? " (tomorrow)" : ""} · ${v(g.status)} · ${v(g.cancelled_today)} cancelled today`, WHITE, null, 64);
  hdr("TOP NEWS" + (d.news_checked ? ` · checked ${d.news_checked}` : "") + " (tap to open)");
  for (const n of d.news || []) add(`[${v(n.tag)}] ${v(n.title)}`, `${v(n.source)}`, tagColor(n.tag),
    n.url ? () => Safari.open(n.url) : null, 84);
}

function nowLabel() { return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Riyadh" }); }

async function showTable(d, offline) {
  const tbl = new UITable(); tbl.showSeparators = true;
  let busy = false;
  const refresh = async () => {
    if (busy) return; busy = true;
    fillTable(tbl, d, offline, refresh, "Refreshing\u2026"); tbl.reload();
    const r = await getData(); d = r.data || d; offline = r.offline;
    fillTable(tbl, d, offline, refresh, (offline ? "Refresh failed (showing cache) " : "Last refreshed ") + nowLabel() + " AST");
    tbl.reload(); busy = false;
  };
  fillTable(tbl, d, offline, refresh, "Last refreshed " + nowLabel() + " AST");
  await tbl.present(true);
}

const { data, offline } = await getData();   // every run (widget or app) fetches fresh data and updates the cache
if (config.runsInWidget) {
  Script.setWidget(await buildWidget(data, offline));
} else if (config.runsInApp && args.queryParameters && args.queryParameters.preview) {
  const fam = args.queryParameters.preview;
  const wd = await buildWidget(data, offline);
  if (fam === "small") await wd.presentSmall(); else if (fam === "large") await wd.presentLarge(); else await wd.presentMedium();
} else {
  await showTable(data, offline);
}
Script.complete();
