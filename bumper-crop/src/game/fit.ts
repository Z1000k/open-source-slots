/**
 * Phone fit-to-screen.
 *
 * The phone layout is authored ONCE at a single fixed WIDTH and scaled as a
 * whole to whatever screen it lands on, the way a film is shot once and plays
 * on any screen. Nothing is rearranged per device, so there is no
 * device-specific breakage to chase.
 *
 * Height is deliberately NOT a design constant: the usable height on a phone
 * is whatever the browser reports right now (Safari's address bar slides in
 * and out mid-game, Android's chrome differs again), so the box takes exactly
 * that. Fixing a design height instead would letterbox every device whose
 * chrome doesn't happen to match it. The only floor is MIN_H, below which the
 * layout would be crushed and the box scales down instead.
 *
 * Runs on portrait phones only. On desktop (and landscape) this module bails
 * out before touching anything and the existing CSS layout is untouched.
 */

/** the one width the phone layout is authored at (iPhone 12/13/14 logical) */
const DESIGN_W = 390;

/** shortest box the layout still fits in: logo + frame + control bar. Below
 *  this the box stops growing shorter and the whole thing scales down. */
const MIN_H = 680;

/** above this width the desktop layout owns the page and nothing here runs */
const PHONE_MAX = 900;

/** hidden element whose padding resolves the notch / home-bar insets, so the
 *  fit box can avoid them instead of scaling content underneath */
function insetProbe(): HTMLDivElement {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
  document.body.appendChild(probe);
  return probe;
}

export function initFit(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const probe = insetProbe();

  const apply = (): void => {
    // visualViewport tracks Safari's address bar sliding in and out; iOS gives
    // no fullscreen on iPhone, so the usable height changes while playing
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;

    // desktop and landscape phones keep their existing CSS layout verbatim
    if (vw > PHONE_MAX || vw >= vh) {
      app.classList.remove('fitted');
      app.style.transform = '';
      app.style.removeProperty('--fit-h');
      return;
    }

    const pad = getComputedStyle(probe);
    const top = parseFloat(pad.paddingTop) || 0;
    const right = parseFloat(pad.paddingRight) || 0;
    const bottom = parseFloat(pad.paddingBottom) || 0;
    const left = parseFloat(pad.paddingLeft) || 0;

    const availW = Math.max(1, vw - left - right);
    const availH = Math.max(1, vh - top - bottom);

    // fill the width, then take the height the screen actually has: the box is
    // as tall as availH measures once the scale is undone
    let k = availW / DESIGN_W;
    let boxH = availH / k;
    if (boxH < MIN_H) {
      // too short to hold the layout: stop shrinking the box, shrink the scale
      boxH = MIN_H;
      k = availH / MIN_H;
    }

    // centre the scaled box in what's left after the insets
    const x = left + (availW - DESIGN_W * k) / 2;
    const y = top + (availH - boxH * k) / 2;

    app.classList.add('fitted');
    app.style.setProperty('--fit-h', `${boxH}px`);
    app.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);
}
