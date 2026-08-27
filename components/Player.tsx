"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Card = {
  queue_id: number;
  script_id: string;
  item_id: string;
  title: string;
  text: string;
  audio_url: string | null;
  duration_sec: number;
  category: string | null;
  fringe: boolean;
  metadata_only: boolean;
  source_url: string | null;
  source_id: string;
  status: string;
};

type QueuePayload = {
  remaining_sec: number;
  current: Card | null;
  upcoming: Card[];
  rabbit_added?: number;
};

export function Player() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRef = useRef(false);
  const playingRef = useRef(false);
  const actionRef = useRef<(type: string) => Promise<void>>(async () => undefined);
  const toggleRef = useRef<() => Promise<void>>(async () => undefined);

  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [playing, setPlaying] = useState(false);
  const [drive, setDrive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Press PLAY");
  const [booting, setBooting] = useState(true);

  const current = queue?.current ?? null;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const loadQueue = useCallback(async () => {
    const res = await fetch("/api/queue", { cache: "no-store" });
    const data = (await res.json()) as QueuePayload;
    setQueue(data);
    return data;
  }, []);

  useEffect(() => {
    loadQueue()
      .catch(() => setStatus("Queue offline — open Admin to seed"))
      .finally(() => setBooting(false));
  }, [loadQueue]);

  const stopSpeech = () => {
    speakingRef.current = false;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const bindMediaSession = (card: Card | null) => {
    if (!("mediaSession" in navigator) || !card) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: card.title,
      artist: "The Feed",
      album: (card.category || "news").toUpperCase(),
      artwork: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
  };

  const playCard = async (card: Card) => {
    stopSpeech();
    bindMediaSession(card);
    await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue_id: card.queue_id }),
    }).catch(() => undefined);

    if (card.audio_url && audioRef.current) {
      audioRef.current.src = card.audio_url;
      try {
        await audioRef.current.play();
        setPlaying(true);
        setStatus("On air");
      } catch {
        setStatus("Tap PLAY — browser blocked autoplay");
        setPlaying(false);
      }
      return;
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      const utter = new SpeechSynthesisUtterance(card.text);
      utter.rate = 1.02;
      utter.pitch = 0.95;
      speakingRef.current = true;
      utter.onend = () => {
        if (speakingRef.current) void actionRef.current("ended");
      };
      window.speechSynthesis.speak(utter);
      setPlaying(true);
      setStatus("On air · live voice");
      return;
    }

    setStatus("No audio engine on this device");
  };

  const togglePlay = async () => {
    if (playingRef.current) {
      audioRef.current?.pause();
      stopSpeech();
      setPlaying(false);
      setStatus("Paused");
      return;
    }
    let data = queue;
    if (!data?.current) {
      setBusy(true);
      setStatus("Tuning the stack…");
      try {
        data = await loadQueue();
      } finally {
        setBusy(false);
      }
    }
    if (!data?.current) {
      setStatus("Empty queue — seed from Admin");
      return;
    }
    await playCard(data.current);
  };

  const action = async (type: string) => {
    setBusy(true);
    stopSpeech();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = (await res.json()) as QueuePayload;
      setQueue(data);
      if (type === "rabbit" && data.rabbit_added) {
        setStatus("Rabbit hole · " + data.rabbit_added + " related");
      }
      if (data.current && (playingRef.current || type === "ended" || type === "skip")) {
        await playCard(data.current);
      } else {
        setPlaying(false);
      }
    } catch {
      setStatus("Action failed");
    } finally {
      setBusy(false);
    }
  };

  actionRef.current = action;
  toggleRef.current = togglePlay;

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => void toggleRef.current());
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
      stopSpeech();
      setPlaying(false);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => void actionRef.current("skip"));
    navigator.mediaSession.setActionHandler("previoustrack", () => void actionRef.current("back"));
  }, []);

  const btn =
    "rounded-2xl border border-amber-900/50 bg-radio-panel px-4 py-4 font-display tracking-wide text-amber-200 active:scale-95 disabled:opacity-40";
  const huge = drive ? "min-h-24 text-3xl px-6" : "min-h-16 text-xl";

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-10 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-display text-sm tracking-[0.35em] text-amber-500/80">PRIVATE RADIO</p>
          <h1 className="font-display glow text-5xl font-extrabold tracking-tight text-amber-400">
            THE FEED
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${drive ? "bg-amber-400 text-black" : "bg-white/10 text-amber-200"}`}
            onClick={() => setDrive((d) => !d)}
          >
            Drive
          </button>
          <Link href="/admin" className="text-xs text-radio-mute underline-offset-2 hover:underline">
            Admin
          </Link>
        </div>
      </header>

      <div className="ticker mb-5 rounded-full" />

      <section className="dial mx-auto flex aspect-square w-[min(86vw,22rem)] flex-col items-center justify-center rounded-full">
        <button
          onClick={() => void togglePlay()}
          disabled={busy || booting}
          className={`flex items-center justify-center rounded-full bg-amber-400 font-display font-extrabold tracking-[0.2em] text-black shadow-[0_0_40px_rgba(232,163,23,0.45)] active:scale-95 disabled:opacity-50 ${drive ? "h-48 w-48 text-5xl" : "h-36 w-36 text-4xl"}`}
        >
          {playing ? "PAUSE" : "PLAY"}
        </button>
        <p className="mt-4 font-display text-sm tracking-[0.3em] text-amber-500/90">
          {booting ? "BOOT" : status.toUpperCase()}
        </p>
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-black/40 p-5">
        {current?.fringe ? (
          <p className="mb-2 font-display text-xs tracking-[0.25em] text-red-400">
            UNVERIFIED · THEORY · NOT FACT
          </p>
        ) : null}
        {current?.metadata_only ? (
          <p className="mb-2 font-display text-xs tracking-[0.25em] text-amber-300/80">
            SHOW NOTES ONLY · NO PODCAST AUDIO
          </p>
        ) : null}
        <p className="font-display text-xs uppercase tracking-[0.28em] text-amber-500">
          {(current?.category || "standby").toString()}
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-stone-100">
          {current?.title || (booting ? "Warming tubes…" : "Queue is dark")}
        </h2>
        <p className="mt-3 max-h-28 overflow-hidden text-sm leading-relaxed text-stone-400">
          {current?.text || "Seed the station from Admin, then hit PLAY."}
        </p>
        <p className="mt-3 text-xs text-radio-mute">
          {Math.round((queue?.remaining_sec || 0) / 60)} min in the stack
        </p>
      </section>

      <section className={`mt-5 grid grid-cols-3 gap-2 ${drive ? "gap-3" : ""}`}>
        <button className={`${btn} ${huge}`} disabled={busy} onClick={() => void action("back")}>
          BACK
        </button>
        <button className={`${btn} ${huge}`} disabled={busy} onClick={() => void action("skip")}>
          SKIP
        </button>
        <button className={`${btn} ${huge}`} disabled={busy} onClick={() => void action("rabbit")}>
          RABBIT
        </button>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-2">
        <button className={btn} disabled={busy} onClick={() => void action("more")}>
          MORE LIKE THIS
        </button>
        <button className={btn} disabled={busy} onClick={() => void action("less")}>
          LESS LIKE THIS
        </button>
        <button className={btn} disabled={busy} onClick={() => void action("follow")}>
          FOLLOW
        </button>
        <a
          className={`${btn} text-center`}
          href={current?.source_url || "#"}
          target="_blank"
          rel="noreferrer"
        >
          OPEN SOURCE
        </a>
      </section>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-radio-mute">
        Original summaries only. Fringe desks are labeled unverified. Add to Home Screen on iPhone
        via Share then Add to Home Screen.
      </p>

      <audio
        ref={audioRef}
        playsInline
        onEnded={() => void action("ended")}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          if (audioRef.current && !audioRef.current.ended) setPlaying(false);
        }}
      />
    </main>
  );
}
