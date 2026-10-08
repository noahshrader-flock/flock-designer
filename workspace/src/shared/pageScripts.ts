import type { MarkerRequest } from './contract';

/**
 * The code the app runs *inside* a preview page, as source strings.
 *
 * Strings, not functions: a bundler rewrites function bodies, and a rewritten
 * body cannot be serialised into another process. Each script returns its result
 * to the app. The page is given no function to call; the one thing a pin needs to
 * say back -- "I was clicked", "I was moved" -- goes out as a console message
 * carrying a per-preview secret, which the app listens for and validates. The
 * page can see these scripts and could tamper with them or forge a message, which
 * is why everything that comes back is validated, and why the worst a forged
 * message can do is move or select a pin that exists.
 *
 * Nothing here may use a backtick or a dollar-brace: they are written inside a
 * template literal.
 */

/**
 * The colours of the things this app draws *inside someone else's page*.
 *
 * Written as literals on purpose, and the only place in the app where that is right: these live in
 * the previewed product's document, which has its own stylesheet and cannot see this app's theme. They
 * are Tailwind's own values rather than anything chosen by hand -- blue-600 for a pin and the outline
 * that shows what it will attach to, amber-500 for one not yet saved -- so they match the app around
 * them. White and a plain shadow keep a pin legible on whatever it lands on.
 */
const INK = {
	/** tailwind blue-600 */
	pin: '#2563eb',
	/** tailwind blue-600 at 8% */
	pinWash: 'rgba(37,99,235,.08)',
	/** tailwind amber-500: a pin being placed, not yet saved */
	draft: '#f59e0b',
	on: '#fff',
	shadow: 'rgba(0,0,0,.45)',
} as const;

/** Shared by the pick and resolve scripts: how an element is found, and described. */
const HELPERS = String.raw`
  var doc = document;
  var collapse = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); };
  var esc = function (v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/[^\w-]/g, '\\$&'); };
  var unique = function (sel) { try { return doc.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  var route = function () { return location.pathname + location.hash; };
  // Which state of the page a prototype is showing. Recorded with a comment and compared when the
  // comment is placed again, so the two must read it the same way: one definition, used by both.
  var pageState = function () { return location.search.slice(0, 200); };
  var segment = function (el) {
    var ref = el.getAttribute('data-e2e-ref');
    if (ref) return '[data-e2e-ref="' + ref.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
    // Ids React and component libraries generate at render time (":r1:", "mui-3") are not
    // the same next time, so they are not used to find an element again.
    if (el.id && !/^(:r|mui-|radix-|react-|rc_)|\d{3,}/i.test(el.id) && unique('#' + esc(el.id))) return '#' + esc(el.id);
    var tag = el.tagName.toLowerCase();
    var n = 1, sib = el;
    while ((sib = sib.previousElementSibling)) { if (sib.tagName === el.tagName) n++; }
    return tag + ':nth-of-type(' + n + ')';
  };
  /** The nearest ancestor with a stable name, which is the part of the page least likely to be rearranged. */
  var namedScope = function (el) {
    var cur = el.parentElement;
    while (cur && cur !== doc.body && cur !== doc.documentElement) {
      if (cur.getAttribute('data-e2e-ref')) return cur;
      cur = cur.parentElement;
    }
    return null;
  };
  /**
   * How an element is found again after the code has changed.
   *
   * A path of direct children says where an element sits in a tree that is about to be
   * rearranged: inserting one wrapper div, which is what restyling does, breaks it. So when the element
   * has no stable name of its own, it is described as a *descendant* of the nearest element that does
   * ("the p inside billing-card"). That holds through anything done inside the card, and is scoped to
   * the card, so it cannot drift onto an identical-looking element elsewhere on the page. The old path
   * remains for a page with no stable names anywhere.
   */
  var selectorFor = function (el) {
    var own = segment(el);
    if (own.charAt(0) === '[' || own.charAt(0) === '#') return own;
    var scope = namedScope(el);
    if (scope) {
      var head = segment(scope) + ' ', tag = el.tagName.toLowerCase();
      if (unique(head + tag)) return head + tag;
      var same = scope.querySelectorAll(tag);
      for (var i = 0; i < same.length; i++) {
        if (same[i] === el) {
          var nth = head + tag + ':nth-of-type(' + (i + 1) + ')';
          // nth-of-type counts among siblings, not among matches, so it only means this element when it agrees.
          if (doc.querySelectorAll(nth).length === 1 && doc.querySelector(nth) === el) return nth;
          break;
        }
      }
    }
    var parts = [], cur = el;
    while (cur && cur.nodeType === 1 && cur !== doc.documentElement) {
      parts.unshift(segment(cur));
      var sel = parts.join(' > ');
      if (unique(sel)) return sel;
      cur = cur.parentElement;
    }
    return parts.join(' > ') || 'html';
  };
  /** The page's own element at a point, ignoring this app's pins. */
  var underlying = function (x, y) {
    var stack = doc.elementsFromPoint ? doc.elementsFromPoint(x, y) : [];
    for (var i = 0; i < stack.length; i++) { if (!stack[i].closest('[data-fd-layer]')) return stack[i]; }
    return null;
  };
  /** The text of the heading a container leads with, if it has one. */
  var headingOf = function (container) {
    for (var i = 0; i < container.children.length; i++) {
      var c = container.children[i];
      if (/^(H[1-6]|LEGEND)$/.test(c.tagName)) return collapse(c.textContent);
      if (c.tagName === 'HEADER') {
        for (var j = 0; j < c.children.length; j++) { if (/^H[1-6]$/.test(c.children[j].tagName)) return collapse(c.children[j].textContent); }
      }
    }
    return '';
  };
  /**
   * The named containers an element sits inside, outermost first (at most three): what a person would call
   * the section. A container is named by its aria-label, its own heading, or its stable name. This is text
   * a person or an agent can search for, which a path of nth-of-type cannot be.
   */
  var containers = function (el) {
    var found = [], own = collapse(el.textContent).slice(0, 60), cur = el.parentElement;
    while (cur && cur !== doc.body && cur !== doc.documentElement && found.length < 3) {
      var label = collapse(cur.getAttribute('aria-label') || '') || headingOf(cur) || collapse(cur.getAttribute('data-e2e-ref') || '');
      label = label.slice(0, 60);
      if (label && label !== own && found.indexOf(label) < 0) found.push(label);
      cur = cur.parentElement;
    }
    return found.reverse();
  };
  /** Where a click landed: the element, and the position inside it. */
  var describe = function (el, x, y) {
    var rect = el.getBoundingClientRect();
    return {
      route: route(),
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      inside: containers(el),
      nearbyText: collapse(el.innerText || el.textContent).slice(0, 80),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      commit: '',
      // Which state of the page: a prototype's switch lives in the query string, so a comment
      // made on Error is not mistaken for one made on Loaded.
      state: pageState(),
      offset: rect.width > 0 && rect.height > 0
        ? { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height }
        : { x: 0, y: 0 }
    };
  };
  /**
   * The blue outline and its label, which show what a pin will attach to.
   *
   * Shared by placing a pin and dragging one: a pin that is dropped re-attaches to whatever is under
   * it, so the person moving it needs to see the same thing as the person placing it, looking the
   * same way. Returns what the caller drives it with; remove() takes it off the page again.
   */
  var hoverOutline = function () {
    var outline = doc.createElement('div');
    outline.setAttribute('data-fd-layer', 'hover');
    outline.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;display:none;border:2px solid ${INK.pin};background:${INK.pinWash};border-radius:2px;box-sizing:border-box';
    var chip = doc.createElement('div');
    chip.setAttribute('data-fd-layer', 'hover');
    chip.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;display:none;background:${INK.pin};color:${INK.on};font:600 11px/1.4 sans-serif;padding:2px 6px;border-radius:3px;max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    doc.documentElement.appendChild(outline);
    doc.documentElement.appendChild(chip);
    return {
      /** Draws it around el, with its tag and text; hint is appended to the label when given. */
      show: function (el, hint) {
        if (!el || el.nodeType !== 1) { outline.style.display = 'none'; chip.style.display = 'none'; return; }
        var r = el.getBoundingClientRect();
        outline.style.display = 'block';
        outline.style.left = r.left + 'px';
        outline.style.top = r.top + 'px';
        outline.style.width = r.width + 'px';
        outline.style.height = r.height + 'px';
        chip.textContent = '<' + el.tagName.toLowerCase() + '> ' + collapse(el.innerText || el.textContent).slice(0, 40) + (hint || '');
        chip.style.display = 'block';
        chip.style.left = Math.max(0, r.left) + 'px';
        chip.style.top = (r.top > 22 ? r.top - 22 : r.bottom + 2) + 'px';
      },
      hide: function () { outline.style.display = 'none'; chip.style.display = 'none'; },
      remove: function () { outline.remove(); chip.remove(); }
    };
  };
`;

/**
 * Pin mode. Resolves with where the next click landed, or null if the person
 * presses Escape or the app cancels. The click is swallowed, so placing a pin
 * never also follows a link or presses a button.
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

    // What the pin will attach to is shown before the click: the element under the pointer is outlined and
    // named. Up and Down arrows climb to its container and back, for a comment about a section and not a
    // line. What is recorded is exactly what is outlined, never a guess about what was meant.
    var hover = hoverOutline();
    var stack = [];
    var chosen = function () { return stack.length ? stack[stack.length - 1] : null; };
    var paint = function () {
      var el = chosen();
      if (!el) return hover.hide();
      var up = el.parentElement && el.parentElement !== doc.body && el.parentElement !== doc.documentElement;
      hover.show(el, up ? '    ↑ container' : '');
    };
    var move = function (e) {
      var el = underlying(e.clientX, e.clientY);
      if (el && el.nodeType === 1 && (stack.length === 0 || stack[0] !== el)) { stack = [el]; paint(); }
    };

    var swallow = function (e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    var done = function (value) {
      style.remove();
      hover.remove();
      doc.removeEventListener('click', click, true);
      doc.removeEventListener('mousedown', swallow, true);
      doc.removeEventListener('mouseup', swallow, true);
      doc.removeEventListener('keydown', key, true);
      doc.removeEventListener('mousemove', move, true);
      window.removeEventListener('scroll', paint, true);
      window.__fdCancelPick = undefined;
      resolve(value);
    };
    var click = function (e) {
      swallow(e);
      // The element that is outlined, which is the one the person chose. A click that arrives with nothing
      // outlined yet (no pointer move came first) takes the element under it.
      var el = chosen();
      if (!el || !el.isConnected) {
        el = e.target;
        // A click on one of this app's own layers lands on the page beneath it.
        if (el && el.closest && el.closest('[data-fd-layer]')) el = underlying(e.clientX, e.clientY);
      }
      if (!el || el.nodeType !== 1) return done(null);
      var info = describe(el, e.clientX, e.clientY);
      // Where the click landed in the page, so the app can put the comment box beside the pin; and the
      // element's own box, so the picture can frame the element and not a fixed square around the click.
      info.at = { x: e.clientX, y: e.clientY };
      var r = el.getBoundingClientRect();
      info.box = { x: r.left, y: r.top, width: r.width, height: r.height };
      done(info);
    };
    var key = function (e) {
      if (e.key === 'Escape') return done(null);
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        swallow(e);
        if (e.key === 'ArrowUp') {
          var el = chosen();
          var p = el && el.parentElement;
          if (p && p !== doc.body && p !== doc.documentElement) { stack.push(p); paint(); }
        } else if (stack.length > 1) { stack.pop(); paint(); }
      }
    };
    window.__fdCancelPick = function () { done(null); };
    doc.addEventListener('click', click, true);
    doc.addEventListener('mousedown', swallow, true);
    doc.addEventListener('mouseup', swallow, true);
    doc.addEventListener('keydown', key, true);
    doc.addEventListener('mousemove', move, true);
    window.addEventListener('scroll', paint, true);
  });
})()`;

/**
 * Hides or shows the app's own layers (the pins, and the outline while one is being placed), and resolves once the
 * page has painted that. A picture of the spot is taken with them hidden, so it shows the thing that was clicked and
 * not an earlier pin.
 */
export const layerVisibleScript = (visible: boolean): string => String.raw`(function (visible) {
  var layers = document.querySelectorAll('[data-fd-layer]');
  for (var i = 0; i < layers.length; i++) layers[i].style.visibility = visible ? 'visible' : 'hidden';
  return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { r(true); }); }); });
})(${visible ? 'true' : 'false'})`;

export const CANCEL_PICK_SCRIPT = 'window.__fdCancelPick && window.__fdCancelPick()';

/** What a pin says back to the app. Prefix and secret let the app pick these out of the page's console. */
export const MESSAGE_PREFIX = '__fd:';

/**
 * Finds each comment's element and draws a numbered pin on it. Returns, per
 * comment, how it was placed:
 *
 * - `found`: the selector still matches exactly one element;
 * - `moved`: it does not, but one element still starts with the text that was
 *   beside the comment, so the pin follows the text;
 * - `missing`: neither -- the comment stays, as a page-level comment;
 * - `elsewhere`: it belongs to a different page of the preview;
 * - `otherState`: it belongs to this page but another state of it (`?state=error`), where the
 *   element may not exist or may be a different thing, so it is not drawn.
 *
 * A pin can be clicked (the app highlights its comment) and, if it is the
 * viewer's own, dragged (the app saves where it was dropped). Calling this again
 * replaces the pins; calling it with nothing clears them.
 */
export const resolveScript = (items: MarkerRequest[], nonce: string): string => String.raw`(function (items, nonce) {
${HELPERS}
  var old = window.__fdMarkers;
  if (old) { old.stop(); }
  // The pins' own layer, not the first of the app's layers: comment mode keeps an outline on the page too, and
  // a redraw that took that one left the old pins behind (a deleted comment's pin stayed on the page).
  var layer = doc.querySelector('[data-fd-layer="pins"]');
  if (layer) layer.remove();
  var say = function (msg) { msg.n = nonce; console.debug('${MESSAGE_PREFIX}' + JSON.stringify(msg)); };
  var results = [], placed = [];
  var current = route();
  items.forEach(function (item) {
    var a = item.anchor;
    if (a.route !== current) { results.push({ id: item.id, state: 'elsewhere' }); return; }
    // Comments from before the state was recorded have none, and are shown wherever their element is.
    if (a.state !== undefined && a.state !== pageState()) { results.push({ id: item.id, state: 'otherState' }); return; }
    var el = null, state = 'found';
    try { var hits = doc.querySelectorAll(a.selector); if (hits.length === 1) el = hits[0]; } catch (e) {}
    // The selector did not match, so follow the text instead. The stored text is a prefix cut at 80
    // characters, often mid-word, and the page may have changed a little since; so this takes the
    // smallest element whose text *begins like* the stored text, rather than demanding the whole
    // prefix still match. A comment that lands roughly in the right place is worth far more than one
    // that disappears, which is what an exact match gave whenever a single character moved.
    if (!el && a.nearbyText.length >= 3) {
      var want = a.nearbyText;
      // Enough to identify the element, short enough to survive an edit further along the line.
      var head = want.slice(0, Math.max(12, Math.min(40, want.length)));
      var best = null, bestLen = Infinity, all = doc.body ? doc.body.querySelectorAll('*') : [];
      for (var i = 0; i < all.length; i++) {
        var t = collapse(all[i].textContent);
        if (t.length === 0) continue;
        // Either side may be the longer: the stored text is a prefix of the live text, or the element's
        // text was shortened since. The shortest element that still matches is the innermost one.
        var hit = t.indexOf(want) === 0 || want.indexOf(t) === 0 || t.indexOf(head) === 0;
        if (hit && t.length < bestLen) { best = all[i]; bestLen = t.length; }
      }
      if (best) { el = best; state = 'moved'; }
    }
    if (!el) { results.push({ id: item.id, state: 'missing' }); return; }
    placed.push({ id: item.id, number: item.number, draft: item.id < 0, movable: !!item.movable, el: el, offset: a.offset || { x: 0, y: 0 }, pos: null });
    results.push({ id: item.id, state: state });
  });
  if (placed.length === 0) { window.__fdMarkers = undefined; return results; }

  layer = doc.createElement('div');
  layer.setAttribute('data-fd-layer', 'pins');
  layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';

  var place = function () {
    placed.forEach(function (p) {
      var x, y, hidden = false;
      if (p.pos) { x = p.pos.x; y = p.pos.y; }
      else {
        var r = p.el.getBoundingClientRect();
        x = r.left + r.width * p.offset.x; y = r.top + r.height * p.offset.y;
        hidden = r.width === 0 && r.height === 0;
      }
      p.marker.style.left = x + 'px';
      p.marker.style.top = y + 'px';
      p.marker.style.display = hidden ? 'none' : 'block';
    });
  };

  // A teardrop pin whose tip is the point that was clicked. The wrapper has no
  // size and sits exactly on that point; the pin hangs above it.
  placed.forEach(function (p) {
    var m = doc.createElement('div');
    m.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
    var pin = doc.createElement('div');
    pin.style.cssText = 'position:absolute;left:-14px;top:-33px;width:28px;height:28px;border-radius:50% 50% 50% 0;background:' + (p.draft ? '${INK.draft}' : '${INK.pin}') + ';border:2px solid ${INK.on};box-shadow:0 2px 6px ${INK.shadow};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:' + (p.movable ? 'grab' : 'pointer');
    var label = doc.createElement('span');
    label.textContent = String(p.number);
    label.style.cssText = 'transform:rotate(45deg);color:${INK.on};font:700 12px/1 sans-serif;pointer-events:none';
    pin.appendChild(label);
    m.appendChild(pin);
    p.marker = m;
    p.pin = pin;
    layer.appendChild(m);

    // Click selects; dragging (only for the viewer's own pins) moves. Nothing
    // here reaches the page's own handlers.
    pin.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      var sx = e.clientX, sy = e.clientY, dragging = false, hover = null;
      if (pin.setPointerCapture && e.pointerId !== undefined) { try { pin.setPointerCapture(e.pointerId); } catch (err) {} }
      var move = function (ev) {
        ev.stopPropagation();
        if (!p.movable) return;
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        dragging = true;
        p.pos = { x: ev.clientX, y: ev.clientY };
        pin.style.cursor = 'grabbing';
        place();
        // Dropping re-attaches the pin to whatever is under it, so show what that is while it is being
        // dragged -- the same outline, from the same code, as when a pin is first placed. It exists
        // only for the length of the drag: there is nothing to point at the rest of the time.
        if (!hover) hover = hoverOutline();
        hover.show(underlying(ev.clientX, ev.clientY), '');
      };
      var up = function (ev) {
        ev.stopPropagation();
        pin.removeEventListener('pointermove', move);
        pin.removeEventListener('pointerup', up);
        if (hover) { hover.remove(); hover = null; }
        if (pin.releasePointerCapture && e.pointerId !== undefined) { try { pin.releasePointerCapture(e.pointerId); } catch (err) {} }
        pin.style.cursor = p.movable ? 'grab' : 'pointer';
        if (!dragging) { say({ t: 'click', id: p.id }); return; }
        var target = underlying(ev.clientX, ev.clientY);
        if (!target) { p.pos = null; place(); return; }
        // The pin stays where it was dropped until the app redraws it from the saved comment.
        say({ t: 'move', id: p.id, anchor: describe(target, ev.clientX, ev.clientY) });
      };
      pin.addEventListener('pointermove', move);
      pin.addEventListener('pointerup', up);
    });
  });
  doc.documentElement.appendChild(layer);
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
})(${JSON.stringify(items)}, ${JSON.stringify(nonce)})`;

export const focusScript = (id: number): string =>
	`window.__fdMarkers && window.__fdMarkers.focus(${Number.isInteger(id) ? id : -1})`;

export const ROUTE_SCRIPT = 'location.pathname + location.hash';
