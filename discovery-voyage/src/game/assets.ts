/** Resolve a public-asset path against Vite's base URL so the game also
 *  works when deployed under a subpath (e.g. /games/scorching-hot/). */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}

/** One symbol tile for the DOM screens (intro, game info). */
export function symbolArt(sym: string, cls = 'xc-sym'): string {
  return `<span class="${cls}"><img src="${asset(`assets/art/symbols/${sym}.webp`)}" alt="${sym}"></span>`;
}
