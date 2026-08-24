const CACHE = "my-dict-v2-20260823-practice-v2";
const APP_SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest",
  "./vendor/hypher/hypher.js", "./vendor/hypher/en-us.js",
  "./vendor/tesseract/tesseract.min.js", "./vendor/tesseract/worker.min.js",
  "./vendor/tesseract/lang/eng_best.traineddata.gz",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const shouldRefresh = event.request.mode === "navigate" || ["script", "style"].includes(event.request.destination);
  const remember = (response) => {
    if (response.ok && url.origin === self.location.origin) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  };
  if (shouldRefresh) {
    event.respondWith(fetch(event.request).then(remember).catch(() => caches.match(event.request)));
  } else {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then(remember)));
  }
});
