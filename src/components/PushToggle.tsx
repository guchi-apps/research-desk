"use client";

import { useEffect, useState } from "react";

/**
 * 新着記事のPush通知（#231）を、この端末で受け取るかどうかの切り替え。
 * Service Workerを登録するのはここだけで、設定画面を開いたときにしか動かない
 * （通知を使わない画面に常駐するものを増やさない）。
 */

type Phase = "checking" | "unsupported" | "unconfigured" | "off" | "on" | "denied";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function detectPhase(): Promise<Phase> {
  if (!isSupported()) return "unsupported";
  try {
    const res = await fetch("/api/notifications/subscribe");
    const json = (await res.json()) as { publicKey?: string | null };
    if (!res.ok || !json.publicKey) return "unconfigured";
  } catch {
    return "unconfigured";
  }
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

export default function PushToggle() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await detectPhase();
      if (!cancelled) setPhase(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPhase(permission === "denied" ? "denied" : "off");
        return;
      }
      const keyRes = await fetch("/api/notifications/subscribe");
      const { publicKey } = (await keyRes.json()) as { publicKey?: string | null };
      if (!publicKey) {
        setPhase("unconfigured");
        return;
      }
      const registration = await getRegistration();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error(String(res.status));
      setPhase("on");
    } catch {
      setMessage("通知をオンにできませんでした。しばらくしてからもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setPhase("off");
    } catch {
      setMessage("通知をオフにできませんでした。しばらくしてからもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      setMessage(res.ok ? "テスト通知を送りました。" : "テスト通知を送れませんでした。");
    } catch {
      setMessage("テスト通知を送れませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-card">
      <h2>新着記事の通知</h2>
      <p className="desc">毎朝の収集で新しい記事が入った日に、この端末へ通知します（記事が0件の日は通知しません）。</p>
      {phase === "checking" && <p className="desc">確認中…</p>}
      {phase === "unsupported" && (
        <p className="desc">
          このブラウザは通知に対応していません。iPhoneは、ホーム画面に追加したアプリから開くと使えます。
        </p>
      )}
      {phase === "unconfigured" && <p className="desc">通知の設定がまだ完了していません（サーバー側の準備待ちです）。</p>}
      {phase === "denied" && (
        <p className="desc">通知がブラウザ・端末の設定で拒否されています。設定で許可してから、もう一度開いてください。</p>
      )}
      {phase === "off" && (
        <button type="button" className="logout-btn" disabled={busy} onClick={enable}>
          この端末で通知をオンにする
        </button>
      )}
      {phase === "on" && (
        <div className="account-row">
          <p className="email">この端末で通知を受け取っています</p>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="logout-btn" disabled={busy} onClick={sendTest}>
              テスト通知
            </button>
            <button type="button" className="logout-btn" disabled={busy} onClick={disable}>
              オフにする
            </button>
          </span>
        </div>
      )}
      {message && (
        <p className="desc" role="status" style={{ marginTop: 10 }}>
          {message}
        </p>
      )}
    </div>
  );
}
