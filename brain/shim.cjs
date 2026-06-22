// Shim de browser: faz o robot.js (feito pra rodar no navegador) carregar no Node.
// Tudo aqui e "fake" — nao desenha nada, so impede que o robo quebre ao tocar
// document/window/localStorage/canvas. O CEREBRO de calculo nao usa essas APIs;
// elas so existem pra preencher dados e desenhar. Nos preenchemos os dados por fora.

function noop() { return undefined; }

function makeFakeElement() {
  const el = {
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    children: [], attributes: {},
    appendChild: (c) => c, removeChild: noop, remove: noop, insertBefore: (c) => c,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    getContext: () => makeFakeCtx(),
    closest: () => null, contains: () => false, click: noop, focus: noop, blur: noop,
    cloneNode: () => makeFakeElement(),
    innerHTML: "", textContent: "", innerText: "", value: "", checked: false,
    offsetWidth: 0, offsetHeight: 0, scrollWidth: 0, scrollHeight: 0,
    parentNode: null, parentElement: null, nextSibling: null, previousSibling: null,
    firstChild: null, lastChild: null, options: [], selectedIndex: -1,
  };
  return el;
}

function makeFakeCtx() {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === "createLinearGradient") return () => ({ addColorStop: noop });
      if (prop === "canvas") return makeFakeElement();
      return noop;
    },
  });
}

const fakeDocument = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => makeFakeElement(),
  createElementNS: () => makeFakeElement(),
  createTextNode: () => ({}),
  addEventListener: noop, removeEventListener: noop,
  head: makeFakeElement(), body: makeFakeElement(),
  documentElement: makeFakeElement(),
  readyState: "complete",
  cookie: "",
};

const _ls = {};
const fakeLocalStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear: () => { for (const k of Object.keys(_ls)) delete _ls[k]; },
};

function install(globalObj) {
  globalObj.window = globalObj;        // window === global (como no browser)
  globalObj.self = globalObj;
  globalObj.globalThis = globalObj;
  globalObj.addEventListener = noop;
  globalObj.removeEventListener = noop;
  globalObj.dispatchEvent = noop;
  globalObj.postMessage = noop;
  globalObj.document = fakeDocument;
  globalObj.localStorage = fakeLocalStorage;
  globalObj.navigator = { userAgent: "node", language: "pt-BR" };
  globalObj.location = { href: "https://www.caramelotips.com.br/front.html", hostname: "www.caramelotips.com.br", search: "" };
  globalObj.setTimeout = globalObj.setTimeout || ((fn) => 0);
  globalObj.clearTimeout = globalObj.clearTimeout || noop;
  globalObj.setInterval = () => 0;     // robo nao agenda timers no servidor
  globalObj.clearInterval = noop;
  globalObj.requestAnimationFrame = () => 0;
  globalObj.cancelAnimationFrame = noop;
  globalObj.AudioContext = function () { return { createGain: () => ({ connect: noop, gain: {} }), createOscillator: () => ({ connect: noop, start: noop, stop: noop }), destination: {}, currentTime: 0, close: noop }; };
  globalObj.fetch = globalObj.fetch || (() => Promise.reject(new Error("no fetch in shim")));
  globalObj.MutationObserver = function () { return { observe: noop, disconnect: noop }; };
  globalObj.getComputedStyle = () => ({ getPropertyValue: () => "" });
  globalObj.alert = noop; globalObj.console = globalObj.console || { log: noop, warn: noop, error: noop };
  return globalObj;
}

module.exports = { install, fakeDocument, fakeLocalStorage, makeFakeElement };
