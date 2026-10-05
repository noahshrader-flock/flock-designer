import type { MarkerRequest } from '../../shared/contract';

/**
 * The code the app runs *inside* a preview page, as source strings.
 *
 * Strings, not functions: a bundler rewrites function bodies, and a rewritten
 * body cannot be serialised into another process. Each script is a single
 * expression that returns its result to the app; the page is given no way to
 * call back. The page can see these scripts and could tamper with them, which
 * is why everything they return is validated again before it is used.
 *
 * Nothing here may use a backtick or a dollar-brace: they are written inside a
 * template literal.
 */

/** Shared by the pick and resolve scripts: how an element is found, and described. */
const HELPERS = String.raw`
  var doc = document;
  var collapse = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); };
  var esc = function (v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/[^\w-]/g, '\\$&'); };
  var unique = function (sel) { try { return doc.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  var route = function () { return location.pathname + location.hash; };
  var segment = function (el) {
    var ref = el.getAttribute('data-e2e-ref');
    if (ref) return '[data-e2e-ref="' + ref.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
    if (el.id && unique('#' + esc(el.id))) return '#' + esc(el.id);
    var tag = el.tagName.toLowerCase();
    var n = 1, sib = el;
    while ((sib = sib.previousElementSibling)) { if (sib.tagName === el.tagName) n++; }
    return tag + ':nth-of-type(' + n + ')';
  };
  var selectorFor = function (el) {
    var parts = [], cur = el;
    while (cur && cur.nodeType === 1 && cur !== doc.documentElement) {
      parts.unshift(segment(cur));
      var sel = parts.join(' > ');
      if (unique(sel)) return sel;
      cur = cur.parentElement;
    }
    return parts.join(' > ') || 'html';
  };
`;

/**
 * Comment mode. Resolves with where the next click landed, or null if the
 * person presses Escape or the app cancels. The click is swallowed, so placing
 * a pin never also follows a link or presses a button.
 *
 * The person is placing a pin, not choosing an element, so nothing is
 * highlighted. The element underneath is still recorded -- with the click's
 * position inside it -- because that is what lets the pin stay in the right
 * place when the window is resized or the page reflows.
 */
export const PICK_SCRIPT = String.raw`(function () {
${HELPERS}
  return new Promise(function (resolve) {
    var style = doc.createElement('style');
    style.setAttribute('data-fd', 'pick');
    style.textContent = 'html, html * { cursor: crosshair !important }';
    doc.head.appendChild(style);
    var swallow = function (e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    var done = function (value) {
      style.remove();
      doc.removeEventListener('click', click, true);
      doc.removeEventListener('mousedown', swallow, true);
      doc.removeEventListener('mouseup', swallow, true);
      doc.removeEventListener('keydown', key, true);
      window.__fdCancelPick = undefined;
      resolve(value);
    };
    var click = function (e) {
      swallow(e);
      var el = e.target;
      if (!el || el.nodeType !== 1) return done(null);
      var rect = el.getBoundingClientRect();
      var info = {
        route: route(),
        selector: selectorFor(el),
        nearbyText: collapse(el.innerText || el.textContent).slice(0, 80),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        commit: '',
        offset: rect.width > 0 && rect.height > 0
          ? { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
          : { x: 0, y: 0 }
      };
      done(info);
    };
    var key = function (e) { if (e.key === 'Escape') done(null); };
    window.__fdCancelPick = function () { done(null); };
    doc.addEventListener('click', click, true);
    doc.addEventListener('mousedown', swallow, true);
    doc.addEventListener('mouseup', swallow, true);
    doc.addEventListener('keydown', key, true);
  });
})()`;

export const CANCEL_PICK_SCRIPT = 'window.__fdCancelPick && window.__fdCancelPick()';

/**
 * Finds each comment's element and draws a numbered marker on it. Returns, per
 * comment, how it was placed:
 *
 * - `found`: the selector still matches exactly one element;
 * - `moved`: it does not, but one element still starts with the text that was
 *   beside the comment, so the marker follows the text;
 * - `missing`: neither -- the comment stays, as a page-level comment;
 * - `elsewhere`: it belongs to a different page of the preview.
 *
 * Calling it again replaces the markers; calling it with nothing clears them.
 */
export const resolveScript = (items: MarkerRequest[]): string => String.raw`(function (items) {
${HELPERS}
  var old = window.__fdMarkers;
  if (old) { old.stop(); }
  var layer = doc.querySelector('[data-fd-layer]');
  if (layer) layer.remove();
  var results = [], placed = [];
  var current = route();
  items.forEach(function (item) {
    var a = item.anchor;
    if (a.route !== current) { results.push({ id: item.id, state: 'elsewhere' }); return; }
    var el = null, state = 'found';
    try { var hits = doc.querySelectorAll(a.selector); if (hits.length === 1) el = hits[0]; } catch (e) {}
    if (!el && a.nearbyText.length >= 3) {
      var best = null, bestLen = Infinity, all = doc.body ? doc.body.querySelectorAll('*') : [];
      for (var i = 0; i < all.length; i++) {
        var t = collapse(all[i].textContent);
        if (t.indexOf(a.nearbyText) === 0 && t.length < bestLen) { best = all[i]; bestLen = t.length; }
      }
      if (best) { el = best; state = 'moved'; }
    }
    if (!el) { results.push({ id: item.id, state: 'missing' }); return; }
    placed.push({ id: item.id, number: item.number, draft: item.id < 0, el: el, offset: a.offset || { x: 0, y: 0 } });
    results.push({ id: item.id, state: state });
  });
  if (placed.length === 0) { window.__fdMarkers = undefined; return results; }

  layer = doc.createElement('div');
  layer.setAttribute('data-fd-layer', '');
  layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
  // A teardrop pin whose tip is the point that was clicked. The wrapper has no
  // size and sits exactly on that point; the pin hangs above it.
  placed.forEach(function (p) {
    var m = doc.createElement('div');
    m.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
    var pin = doc.createElement('div');
    pin.style.cssText = 'position:absolute;left:-14px;top:-33px;width:28px;height:28px;border-radius:50% 50% 50% 0;background:' + (p.draft ? '#f59e0b' : '#2563eb') + ';border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center';
    var label = doc.createElement('span');
    label.textContent = String(p.number);
    label.style.cssText = 'transform:rotate(45deg);color:#fff;font:700 12px/1 sans-serif';
    pin.appendChild(label);
    m.appendChild(pin);
    p.marker = m;
    layer.appendChild(m);
  });
  doc.documentElement.appendChild(layer);

  var place = function () {
    placed.forEach(function (p) {
      var r = p.el.getBoundingClientRect();
      p.marker.style.left = (r.left + r.width * p.offset.x) + 'px';
      p.marker.style.top = (r.top + r.height * p.offset.y) + 'px';
      p.marker.style.display = (r.width === 0 && r.height === 0) ? 'none' : 'block';
    });
  };
  place();
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  var timer = setInterval(place, 400);
  window.__fdMarkers = {
    stop: function () { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); clearInterval(timer); },
    focus: function (id) {
      for (var i = 0; i < placed.length; i++) {
        if (placed[i].id === id) {
          placed[i].el.scrollIntoView({ block: 'center', inline: 'nearest' });
          var m = placed[i].marker.firstChild;
          m.animate([{ transform: 'rotate(-45deg) scale(1)' }, { transform: 'rotate(-45deg) scale(1.6)' }, { transform: 'rotate(-45deg) scale(1)' }], { duration: 700 });
          place();
        }
      }
    }
  };
  return results;
})(${JSON.stringify(items)})`;

export const focusScript = (id: number): string =>
	`window.__fdMarkers && window.__fdMarkers.focus(${Number.isInteger(id) ? id : -1})`;

export const ROUTE_SCRIPT = 'location.pathname + location.hash';
