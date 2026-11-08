// Custom compact audio player with waveform, progress, seekable timeline,
// and play/pause control.

"use client";

import * as React from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string; // object URL
  label?: string;
}

const BAR_COUNT = 64;

export function AudioPlayer({ src, label }: AudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);
  const [duration, setDuration] = React.useState(0);
  const [current, setCurrent] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const draggingRef = React.useRef(false);

  // Decode audio for waveform peaks.
  React.useEffect(() => {
    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    setLoading(true);
    setError(null);
    setPeaks(null);
    (async () => {
      try {
        const res = await fetch(src);
        const arr = await res.arrayBuffer();
        audioCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
        const buffer = await audioCtx.decodeAudioData(arr);
        if (cancelled) return;
        const channel = buffer.getChannelData(0);
        const blockSize = Math.floor(channel.length / BAR_COUNT);
        const out: number[] = [];
        let max = 0.0001;
        for (let i = 0; i < BAR_COUNT; i++) {
          const start = i * blockSize;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channel[start + j] || 0);
          }
          const v = sum / blockSize;
          out.push(v);
          if (v > max) max = v;
        }
        // Normalize to 0..1.
        setPeaks(out.map((v) => Math.max(0.05, v / max)));
        setDuration(buffer.duration);
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("Could not load audio.");
          setLoading(false);
        }
      } finally {
        if (audioCtx) {
          try {
            await audioCtx.close();
          } catch {
            /* ignore */
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Sync audio time.
  const onTimeUpdate = () => {
    if (draggingRef.current) return;
    const a = audioRef.current;
    if (a) setCurrent(a.currentTime);
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
    } else {
      a.pause();
    }
  };

  const seekToFraction = (frac: number) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const t = Math.max(0, Math.min(1, frac)) * duration;
    a.currentTime = t;
    setCurrent(t);
  };

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const rect = canvas.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    seekToFraction(frac);
  };

  // Render waveform on canvas.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const gap = 1.5;
    const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    const mid = h / 2;
    const progress = duration > 0 ? current / duration : 0;
    for (let i = 0; i < BAR_COUNT; i++) {
      const v = peaks[i];
      const barH = Math.max(2, v * (h - 2));
      const x = i * (barW + gap);
      const played = i / BAR_COUNT <= progress;
      ctx.fillStyle = played ? "#1f1f1f" : "#d4d4d4";
      ctx.fillRect(x, mid - barH / 2, barW, barH);
    }
  }, [peaks, current, duration]);

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-muted-foreground py-1">
        {error}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 my-1 align-middle">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          if (duration === 0 && isFinite(e.currentTarget.duration)) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />
      <button
        onClick={toggle}
        disabled={loading}
        className="h-7 w-7 shrink-0 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3 w-3 ml-0.5" />
        )}
      </button>
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          handlePointer(e);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) handlePointer(e);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          try {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
        className={cn(
          "h-8 w-44 sm:w-52 cursor-pointer align-middle",
          loading && "opacity-40"
        )}
      />
      <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
        {fmt(current)} / {fmt(duration)}
      </span>
      {label && (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
