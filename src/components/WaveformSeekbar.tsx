import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

interface WaveformSeekbarProps {
  trackId: string;
  url: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  height?: number;
  bars?: number; // peak resolution
  className?: string;
}

// Module-level cache so we only decode each track once per session.
const peakCache = new Map<string, number[]>();
const inflight = new Map<string, Promise<number[] | null>>();

const computePeaks = async (url: string, bars: number): Promise<number[] | null> => {
  try {
    const Ctx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const channel = audio.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
    const peaks: number[] = new Array(bars);
    for (let i = 0; i < bars; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, channel.length);
      let max = 0;
      // Step within block to keep this O(bars * 256) at most
      const step = Math.max(1, Math.floor((end - start) / 256));
      for (let j = start; j < end; j += step) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    // Normalize 0..1
    const peak = peaks.reduce((m, v) => (v > m ? v : m), 0) || 1;
    for (let i = 0; i < peaks.length; i++) peaks[i] = peaks[i] / peak;
    try { await ctx.close(); } catch { }
    return peaks;
  } catch (err) {
    logger.warn('Waveform decode failed for', url, err);
    return null;
  }
};

const getPeaks = (id: string, url: string, bars: number) => {
  if (peakCache.has(id)) return Promise.resolve(peakCache.get(id)!);
  if (inflight.has(id)) return inflight.get(id)!;
  const p = computePeaks(url, bars).then((peaks) => {
    if (peaks) peakCache.set(id, peaks);
    inflight.delete(id);
    return peaks;
  });
  inflight.set(id, p);
  return p;
};

export const WaveformSeekbar = ({
  trackId,
  url,
  currentTime,
  duration,
  onSeek,
  height = 56,
  bars = 180,
  className,
}: WaveformSeekbarProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(() => peakCache.get(trackId) ?? null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const draggingRef = useRef(false);

  // Load peaks when track changes
  useEffect(() => {
    let cancelled = false;
    setPeaks(peakCache.get(trackId) ?? null);
    if (!url) return;
    getPeaks(trackId, url, bars).then((p) => {
      if (!cancelled) setPeaks(p);
    });
    return () => {
      cancelled = true;
    };
  }, [trackId, url, bars]);

  // Render to canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = container.clientWidth;
    const cssH = height;
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Theme tokens — read from CSS variables
    const css = getComputedStyle(document.documentElement);
    const primary = `hsl(${css.getPropertyValue('--primary').trim()})`;
    const muted = `hsl(${css.getPropertyValue('--muted-foreground').trim()} / 0.35)`;
    const playedGlow = `hsl(${css.getPropertyValue('--primary').trim()} / 0.18)`;

    const data = peaks ?? new Array(bars).fill(0).map((_, i) => 0.25 + Math.sin(i * 0.4) * 0.08);
    const barCount = data.length;
    const gap = 1;
    const totalGap = gap * (barCount - 1);
    const barW = Math.max(1, (cssW - totalGap) / barCount);
    const midY = cssH / 2;
    const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
    const playedBars = progress * barCount;
    const hoverBar = hoverX != null ? (hoverX / cssW) * barCount : -1;

    // Played background glow
    if (progress > 0) {
      ctx.fillStyle = playedGlow;
      ctx.fillRect(0, 0, progress * cssW, cssH);
    }

    for (let i = 0; i < barCount; i++) {
      const amp = data[i];
      const h = Math.max(2, amp * (cssH * 0.85));
      const x = i * (barW + gap);
      const y = midY - h / 2;
      let color: string;
      if (i < playedBars) color = primary;
      else if (hoverBar >= 0 && i < hoverBar) color = `hsl(${css.getPropertyValue('--primary').trim()} / 0.55)`;
      else color = muted;
      ctx.fillStyle = color;
      // rounded rect-ish: just fillRect for perf
      ctx.fillRect(x, y, barW, h);
    }

    // Playhead line
    if (duration > 0) {
      const px = progress * cssW;
      ctx.fillStyle = primary;
      ctx.fillRect(Math.max(0, px - 1), 0, 2, cssH);
    }
  }, [peaks, currentTime, duration, hoverX, bars, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handler = () => draw();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [draw]);

  const seekFromEvent = (clientX: number) => {
    const container = containerRef.current;
    if (!container || duration <= 0) return;
    const rect = container.getBoundingClientRect();
    const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
    const ratio = x / rect.width;
    onSeek(ratio * duration);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full select-none cursor-pointer touch-none ${className ?? ''}`}
      style={{ height }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        draggingRef.current = true;
        seekFromEvent(e.clientX);
      }}
      onPointerMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) setHoverX(e.clientX - rect.left);
        if (draggingRef.current) seekFromEvent(e.clientX);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      }}
      onPointerLeave={() => setHoverX(null)}
      role="slider"
      aria-label="Track progress"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      {!peaks && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground/60">analyzing waveform…</span>
        </div>
      )}
    </div>
  );
};
