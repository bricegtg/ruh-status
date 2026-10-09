/* Rolling 24 h flow chart (SVG). Mirrors the PDF: stacked landings (navy, bottom) + takeoffs (teal, top) per hour,
   x marks = cancellations at scheduled hour, gray boxes = halts >=45 min with vertical labels. */
function renderFlow(el, f, opt) {
  opt = opt || {};
  if (!f || !f.buckets) { el.innerHTML = '<div style="color:#9FB0C6">Flow data not available</div>'; return; }
  var B = f.buckets, n = B.length, W = opt.width || 680, H = opt.height || 300;
  var L = 34, R = 8, T = 34, BOT = 46, pw = W - L - R, ph = H - T - BOT, bw = pw / n;
  var mx = 4; B.forEach(function (b) { mx = Math.max(mx, b.takeoffs + b.landings); });
  var ymax = Math.ceil(mx * 1.35 / 8) * 8, y = function (v) { return T + ph - v / ymax * ph; };
  var t0 = new Date(f.buckets[0].hour_start).getTime(), tEnd = new Date(f.end).getTime();
  var xt = function (ms) { return L + (ms - t0) / 3600000 * bw; };
  var esc = function (s) { return String(s).replace(/[&<>]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); };
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Takeoffs and landings per hour, last 24 hours" style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">';
  // legend
  s += '<rect x="' + L + '" y="8" width="12" height="10" fill="#14B8A6"/><text x="' + (L + 16) + '" y="17" font-size="11" fill="#E8EEF6">Takeoffs</text>';
  s += '<rect x="' + (L + 82) + '" y="8" width="12" height="10" fill="#3B6FB6"/><text x="' + (L + 98) + '" y="17" font-size="11" fill="#E8EEF6">Landings</text>';
  s += '<text x="' + (L + 166) + '" y="17" font-size="12" fill="#F2B8B5" font-weight="700">&#215;</text><text x="' + (L + 178) + '" y="17" font-size="11" fill="#E8EEF6">Cancelled</text>';
  s += '<rect x="' + (L + 244) + '" y="8" width="12" height="10" fill="#8A97A8" opacity=".45"/><text x="' + (L + 260) + '" y="17" font-size="11" fill="#E8EEF6">Halt 45+ min</text>';
  // grid
  for (var g = 0; g <= 4; g++) { var gv = Math.round(ymax * g / 4), gy = y(gv);
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="#ffffff" stroke-opacity=".08"/>';
    s += '<text x="' + (L - 5) + '" y="' + (gy + 4) + '" font-size="10" fill="#9FB0C6" text-anchor="end">' + gv + '</text>'; }
  // halts
  (f.halts || []).forEach(function (h) {
    var a = Math.max(xt(new Date(h.start).getTime()), L), e = Math.min(xt(h.end ? new Date(h.end).getTime() : tEnd), W - R);
    if (e <= a) return; var w = e - a, cx = (a + e) / 2, cy = T + ph * 0.42;
    s += '<rect x="' + a + '" y="' + T + '" width="' + w + '" height="' + ph + '" fill="#8A97A8" opacity=".35"/>';
    s += w < 70 ? '<text transform="translate(' + (cx + 4) + ',' + cy + ') rotate(-90)" font-size="10" font-weight="700" fill="#E8EEF6" text-anchor="middle">' + esc(h.label) + '</text>'
               : '<text x="' + cx + '" y="' + cy + '" font-size="10" font-weight="700" fill="#E8EEF6" text-anchor="middle">' + esc(h.label) + '</text>';
  });
  // bars + x marks + labels
  B.forEach(function (b, i) {
    var x0 = L + i * bw + bw * 0.1, w = bw * 0.8, yl = y(b.landings), yt = y(b.landings + b.takeoffs);
    s += '<g><title>' + esc(b.label) + ': ' + b.takeoffs + ' takeoffs, ' + b.landings + ' landings, ' + b.cancelled + ' cancelled</title>';
    if (b.landings) s += '<rect x="' + x0 + '" y="' + yl + '" width="' + w + '" height="' + (T + ph - yl) + '" fill="#3B6FB6"/>';
    if (b.takeoffs) s += '<rect x="' + x0 + '" y="' + yt + '" width="' + w + '" height="' + (yl - yt) + '" fill="#14B8A6"/>';
    s += '</g>';
    if (b.cancelled) { var sz = 4 + Math.min(b.cancelled, 12) * 0.6;
      s += '<text x="' + (x0 + w / 2) + '" y="' + (T + ph + 12 + sz / 2) + '" font-size="' + (sz * 2) + '" fill="#F2B8B5" text-anchor="middle" font-weight="700">&#215;</text>'; }
    if (i % 3 === 0 || i === n - 1)
      s += '<text x="' + (x0 + w / 2) + '" y="' + (H - 10) + '" font-size="10.5" fill="#9FB0C6" text-anchor="middle">' + esc(b.label) + '</text>';
  });
  s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="#9FB0C6" stroke-opacity=".5"/>';
  s += '<text transform="translate(10,' + (T + ph / 2) + ') rotate(-90)" font-size="10" fill="#9FB0C6" text-anchor="middle">Movements / hour</text>';
  el.innerHTML = s + '</svg>';
}
