const version = 1;
const staticCache = `PWA-Static-Movie-APP-${version}`;
const dynamicCache = `PWA-Dynamic-Movie-APP-${version}`;
const cacheLimit = 40;
const cacheList = [
  "/",
  "/index.html",
  "/searchresults.html",
  "/suggestedmovies.html",
  "/404page.html",
  "/css/main.css",
  "/js/app.js",
  "/img/placeholder.png",
  "/img/android-chrome-192x192.png",
  "/img/android-chrome-512x512.png",
  "/img/apple-touch-icon.png",
  "/img/favicon-16x16.png",
  "/img/favicon-32x32.png",
  "/img/logo.png",
  "/img/mstile-150x150.png",
  "/img/svg/safari-pinned-tab.svg",
  "/favicon.ico",
  "/manifest.json",
  "https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap",
  "https://fonts.googleapis.com/css?family=Material+Icons|Material+Icons+Outlined|Material+Icons+Two+Tone|Material+Icons+Round|Material+Icons+Sharp",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(staticCache).then((cache) => {
      cache.addAll(cacheList);
    })
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => {
              if (key === staticCache || key === dynamicCache) {
                return false;
              } else {
                return true;
              }
            })
            .map((key) => {
              caches.delete(key);
            })
        );
      })
      .catch(console.warn)
  );
  limitCache();
});

self.addEventListener("fetch", (ev) => {
  let options = {};
  if (ev.request.destination.toString() === "document") {
    // fetching a page
    options = { ignoreSearch: true };
  }
  ev.respondWith(
    caches.match(ev.request, options).then((cacheResponse) => {
      if (cacheResponse) {
        return cacheResponse;
      }
      return fetch(ev.request)
        .then((fetchRes) => {
          if (fetchRes.status > 399) {
            throw new Error("bad response");
          } else {
            //return a new fetch
            return caches.open(dynamicCache).then((cache) => {
              let copy = fetchRes.clone();
              cache.put(ev.request, copy);
              return fetchRes;
            });
          }
        })
        .catch((err) => {
          console.log("SW fetch failed");
          console.warn(err);
          if (ev.request.mode === "navigate") {
            return caches.match("/404page.html").then((page404Response) => {
              return page404Response;
            });
          }
        });
    })
  );
});

self.addEventListener("message", (ev) => {
  //check ev.data to get the message
  if (ev.data.ONLINE) {
    sendMessage("You are online");
  } else {
    sendMessage("You are offline");
  }
});

function sendMessage(msg) {
  self.clients.matchAll().then(function (clients) {
    if (clients && clients.length) {
      //Respond to last focused tab
      clients[0].postMessage(msg);
    }
  });
}

function limitCache() {
  //remove some files from the dynamic cache
  caches.open(dynamicCache).then((cache) => {
    cache.keys().then((keys) => {
      if (keys.length > cacheLimit) {
        cache.delete(keys[0]).then(() => {
          limitCache();
        });
      }
    });
  });
}
