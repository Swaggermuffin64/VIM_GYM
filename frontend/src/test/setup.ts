// Node 25+ ships a built-in global `localStorage`/`sessionStorage` (undefined
// unless --localstorage-file is set). It shadows jsdom's Storage, so
// `window.localStorage` is undefined in tests. Point the globals back at jsdom.
declare const jsdom: { window: Window } | undefined;

if (typeof jsdom !== 'undefined') {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, {
      value: jsdom.window[key],
      configurable: true,
      writable: true,
    });
  }
}
