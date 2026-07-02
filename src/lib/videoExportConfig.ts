// Shared types & helpers for the Video Export Suite.
import { logger } from '@/lib/logger';

export type AspectRatio = '16:9' | '9:16';

export type BackgroundType = 'gradient' | 'image';

export interface GradientPreset {
  id: 'aurora' | 'midnight' | 'sunset';
  label: string;
  // CSS-style hex stops used both for the preview chip and the canvas paint
  stops: { offset: number; color: string }[];
  angle: number; // degrees
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: 'aurora',
    label: 'Aurora',
    angle: 135,
    stops: [
      { offset: 0, color: '#5b21b6' },
      { offset: 0.5, color: '#db2777' },
      { offset: 1, color: '#0ea5e9' },
    ],
  },
  {
    id: 'midnight',
    label: 'Midnight',
    angle: 160,
    stops: [
      { offset: 0, color: '#020617' },
      { offset: 0.6, color: '#1e1b4b' },
      { offset: 1, color: '#000000' },
    ],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    angle: 120,
    stops: [
      { offset: 0, color: '#f97316' },
      { offset: 0.55, color: '#db2777' },
      { offset: 1, color: '#4c1d95' },
    ],
  },
];

export const GOOGLE_FONTS = [
  'Inter',
  'Poppins',
  'Montserrat',
  'Oswald',
  'Bebas Neue',
  'Playfair Display',
  'Roboto Mono',
  'Pacifico',
] as const;

export type GoogleFont = typeof GOOGLE_FONTS[number];

export interface VideoExportConfig {
  aspectRatio: AspectRatio;
  background: {
    type: BackgroundType;
    gradientId: GradientPreset['id'];
    // dataURL for custom image / GIF (persisted to localStorage)
    imageDataUrl?: string;
  };
  overlay: {
    enabled: boolean;
    title: string;
    artist: string;
    handle: string;
    font: GoogleFont;
    color: string; // hex
    position: 'bottom' | 'top';
  };
}

export const DEFAULT_VIDEO_EXPORT_CONFIG: VideoExportConfig = {
  aspectRatio: '16:9',
  background: { type: 'gradient', gradientId: 'aurora' },
  overlay: {
    enabled: true,
    title: '',
    artist: '',
    handle: '',
    font: 'Inter',
    color: '#ffffff',
    position: 'bottom',
  },
};

const STORAGE_KEY = 'pocket-mp3-video-export-config';

export const loadVideoExportConfig = (): VideoExportConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIDEO_EXPORT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_VIDEO_EXPORT_CONFIG,
      ...parsed,
      background: { ...DEFAULT_VIDEO_EXPORT_CONFIG.background, ...(parsed.background ?? {}) },
      overlay: { ...DEFAULT_VIDEO_EXPORT_CONFIG.overlay, ...(parsed.overlay ?? {}) },
    };
  } catch {
    return DEFAULT_VIDEO_EXPORT_CONFIG;
  }
};

export const saveVideoExportConfig = (cfg: VideoExportConfig) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    logger.warn('Failed to persist video export config', e);
  }
};

// Inject a Google Fonts <link> for a single family if not already loaded.
const loadedFonts = new Set<string>();
export const ensureGoogleFont = async (family: GoogleFont): Promise<void> => {
  if (typeof document === 'undefined') return;
  if (!loadedFonts.has(family)) {
    const id = `gfont-${family.replace(/\s+/g, '-')}`;
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;600;700&display=swap`;
      document.head.appendChild(link);
    }
    loadedFonts.add(family);
  }
  // Wait for it to actually be available for canvas drawing.
  try {
    if ((document as any).fonts?.load) {
      await Promise.all([
        (document as any).fonts.load(`700 64px "${family}"`),
        (document as any).fonts.load(`400 32px "${family}"`),
      ]);
    }
  } catch {
    // best-effort
  }
};

export const paintGradient = (
  ctx: CanvasRenderingContext2D,
  preset: GradientPreset,
  width: number,
  height: number,
) => {
  const rad = (preset.angle * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const len = Math.max(width, height);
  const x0 = cx - Math.cos(rad) * len * 0.5;
  const y0 = cy - Math.sin(rad) * len * 0.5;
  const x1 = cx + Math.cos(rad) * len * 0.5;
  const y1 = cy + Math.sin(rad) * len * 0.5;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  preset.stops.forEach((s) => grad.addColorStop(s.offset, s.color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
};

export const gradientToCss = (preset: GradientPreset): string => {
  const stops = preset.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
  return `linear-gradient(${preset.angle}deg, ${stops})`;
};
