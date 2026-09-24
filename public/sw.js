/*
 * Push通知（#231）専用のService Worker。**やることは通知の表示と、タップしたときの遷移だけ。**
 * `fetch`は扱わない（キャッシュを持つと古い画面や認証済み応答が残るため。#68の方針のまま）。
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 届いたpushには必ず通知を出す（購読は`userVisibleOnly: true`。出さないpushが続くとiOSが購読を失効させる）
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "新着記事があります", {
      body: payload.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: payload.tag || "research-desk",
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/dashboard/inbox" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard/inbox";
  const targetUrl = new URL(target, self.location.origin);
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if (new URL(client.url).origin !== targetUrl.origin) continue;
        if ("navigate" in client) {
          const navigated = await client.navigate(targetUrl.href);
          if (navigated) {
            await navigated.focus();
            return;
          }
        }
        await client.focus();
        return;
      }
      await self.clients.openWindow(targetUrl.href);
    })(),
  );
});
