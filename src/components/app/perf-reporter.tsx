"use client";

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useApp } from "@/components/providers/app-provider";

type Entry = { kind: "web_vital" | "nav" | "api" | "error"; name: string; ms: number; meta?: Record<string, unknown> };

const queue: Entry[] = [];
let accountId: string | null = null;

function flush() {
  if (!queue.length) return;
  const entries = queue.splice(0, 100);
  const payload = JSON.stringify({ account_id: accountId, entries });
  if (!(navigator.sendBeacon?.("/api/perf", new Blob([payload], { type: "application/json" })) ?? false)) {
    void fetch("/api/perf", { method: "POST", body: payload, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => undefined);
  }
}

function push(e: Entry) {
  queue.push(e);
  if (queue.length >= 50) flush();
}

/** UUID va raqamlarni umumlashtirish: /app/automation/<id> → /app/automation/:id */
export function routeName(path: string): string {
  return path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id").replace(/\/\d+(?=\/|$)/g, "/:n");
}

function apiName(url: URL, method: string): string | null {
  if (url.pathname.startsWith("/api/perf")) return null;
  if (url.pathname.startsWith("/api/")) return `${method} ${routeName(url.pathname)}`;
  const rpc = /\/rest\/v1\/rpc\/(\w+)/.exec(url.pathname);
  if (rpc) return `rpc ${rpc[1]}`;
  const rest = /\/rest\/v1\/(\w+)/.exec(url.pathname);
  if (rest) return `${method} ${rest[1]}`;
  return null;
}

/**
 * Tezlik monitoringi (8-bo'lim): Web Vitals, ilova ichidagi sahifa o'tishlari va API javob vaqtlari → perf_logs.
 * Settings → Logs'da p50/p95/p99 ko'rinadi.
 */
export function PerfReporter() {
  const app = useApp();
  const pathname = usePathname();
  const navStart = useRef<{ at: number; to: string } | null>(null);
  accountId = app.account.id;

  useReportWebVitals((m) => {
    // CLS — birliksiz; ms maydonida ×1000 saqlanadi
    push({ kind: "web_vital", name: m.name, ms: m.name === "CLS" ? m.value * 1000 : m.value, meta: { route: routeName(location.pathname), rating: m.rating } });
  });

  // Havola bosilishidan yangi sahifa render bo'lishigacha
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href^='/app']") as HTMLAnchorElement | null;
      if (a && !e.metaKey && !e.ctrlKey && a.target !== "_blank") navStart.current = { at: performance.now(), to: new URL(a.href).pathname };
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    const s = navStart.current;
    if (s && s.to === pathname) {
      requestAnimationFrame(() => push({ kind: "nav", name: routeName(pathname), ms: performance.now() - s.at }));
    }
    navStart.current = null;
  }, [pathname]);

  // API (Next.js route'lar va Supabase REST/RPC) javob vaqtlari
  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const t0 = performance.now();
      const res = await orig(input, init);
      try {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const name = apiName(url, method);
        if (name) push({ kind: res.ok ? "api" : "error", name, ms: performance.now() - t0, meta: res.ok ? undefined : { status: res.status } });
      } catch {
        /* o'lchov — ixtiyoriy */
      }
      return res;
    };
    const id = setInterval(flush, 10_000);
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.fetch = orig;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);

  return null;
}
