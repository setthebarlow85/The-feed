"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Health = {
  openai_configured: boolean;
  recommended_mode: string;
  environment: string;
};

export default function AdminPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [log, setLog] = useState("Ready.");
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<{ remaining_sec: number; upcoming: { title: string; category: string }[] } | null>(null);

  async function refreshHealth() {
    const res = await fetch("/api/health", { cache: "no-store" });
    setHealth(await res.json());
  }

  async function refreshQueue() {
    const res = await fetch("/api/queue", { cache: "no-store" });
    setQueue(await res.json());
  }

  useEffect(() => {
    refreshHealth().catch(() => undefined);
    refreshQueue().catch(() => undefined);
  }, []);

  async function run(path: string, label: string) {
    setBusy(true);
    setLog(label + "...");
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json();
      setLog(label + " done.\n" + JSON.stringify(data, null, 2));
      await refreshQueue();
      await refreshHealth();
    } catch (err) {
      setLog(label + " failed: " + (err instanceof Error ? err.message : "error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-8">
      <Link href="/" className="text-xs uppercase tracking-[0.3em] text-amber-500">
        The Feed
      </Link>
      <h1 className="mt-3 font-display text-4xl font-extrabold text-amber-400">ADMIN</h1>
      <p className="mt-1 text-sm text-stone-400">Single-user initialize, refresh, and queue.</p>

      <section className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm">
        <p>OpenAI: {health ? (health.openai_configured ? "configured" : "off") : "..."}</p>
        <p>Mode: {health?.recommended_mode || "..."}</p>
        <p>Environment: {health?.environment || "..."}</p>
        <p>Queue: {Math.round((queue?.remaining_sec || 0) / 60)} min</p>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={() => void run("/api/seed", "Initialize / seed")}
          className="rounded-2xl bg-amber-400 px-4 py-4 font-display text-lg font-bold text-black disabled:opacity-40"
        >
          INITIALIZE
        </button>
        <button
          disabled={busy}
          onClick={() => void run("/api/refresh", "Refresh")}
          className="rounded-2xl border border-amber-900/60 bg-radio-panel px-4 py-4 font-display text-lg text-amber-200 disabled:opacity-40"
        >
          REFRESH
        </button>
      </div>

      <section className="mt-6">
        <h2 className="font-display tracking-[0.25em] text-amber-500">UPCOMING</h2>
        <ul className="mt-2 space-y-2">
          {(queue?.upcoming || []).slice(0, 12).map((item, i) => (
            <li key={i} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
              <span className="mr-2 text-xs uppercase text-amber-500">{item.category}</span>
              {item.title}
            </li>
          ))}
        </ul>
      </section>

      <pre className="mt-6 max-h-64 overflow-auto rounded-xl bg-black/60 p-3 text-[11px] text-stone-400">
        {log}
      </pre>
    </main>
  );
}
