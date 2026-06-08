import { useState, useRef, useCallback, useEffect } from 'react';
import { Howler } from 'howler';
import { isIOSDevice } from '@/lib/utils';
import {
  VideoExportConfig,
  GRADIENT_PRESETS,
  ensureGoogleFont,
  paintGradient,
} from '@/lib/videoExportConfig';

export type RecordingMode = 'single' | 'continuous';

interface UseVideoRecorderOptions {
  trackTitle?: string;
  onRecordingComplete?: (blob: Blob, filename: string) => void;
  // Pulled at start so live config edits don't require re-render of the hook
  getExportConfig?: () => VideoExportConfig;
}

// YouTube-recommended encoding presets
// Tuned for HD quality with manageable file size (smaller than YouTube max).
const PRESETS_16x9 = {
  '1440p': { width: 2560, height: 1440, videoBitrate: 18_000_000, audioBitrate: 256_000, frameRate: 60 },
  '1080p': { width: 1920, height: 1080, videoBitrate: 10_000_000, audioBitrate: 192_000, frameRate: 60 },
  '720p':  { width: 1280, height: 720,  videoBitrate:  6_000_000, audioBitrate: 192_000, frameRate: 60 },
} as const;

const PRESETS_9x16 = {
  '1440p': { width: 1440, height: 2560, videoBitrate: 18_000_000, audioBitrate: 256_000, frameRate: 60 },
  '1080p': { width: 1080, height: 1920, videoBitrate: 10_000_000, audioBitrate: 192_000, frameRate: 60 },
  '720p':  { width: 720,  height: 1280, videoBitrate:  6_000_000, audioBitrate: 192_000, frameRate: 60 },
} as const;

export type Resolution = '1440p' | '1080p' | '720p';

export const useVideoRecorder = (options: UseVideoRecorderOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('single');
  const [resolution, setResolution] = useState<Resolution>('1080p');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hdCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const activeConfigRef = useRef<VideoExportConfig | null>(null);

  const getSettings = (aspectRatio: '16:9' | '9:16') => {
    const table = aspectRatio === '9:16' ? PRESETS_9x16 : PRESETS_16x9;
    return table[resolution] ?? table['1080p'];
  };

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    try {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Restore the visualizer's normal on-screen pixel ratio
      window.dispatchEvent(new CustomEvent('visualizer:restore-pixel-ratio'));
      setRecordingTime(0);
      console.log('⬛ Recording stopped');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, []);

  const startRecording = useCallback(async (canvas: HTMLCanvasElement) => {
    if (isRecording || !canvas) return;

    if (isIOSDevice()) {
      console.warn('Recording not supported on iOS due to audio restrictions');
      return;
    }

    try {
      // Snapshot current export config so editing the sheet mid-record is safe.
      const config: VideoExportConfig =
        options.getExportConfig?.() ?? ({
          aspectRatio: '16:9',
          background: { type: 'gradient', gradientId: 'aurora' },
          overlay: { enabled: false, title: '', artist: '', handle: '', font: 'Inter', color: '#fff', position: 'bottom' },
        } as VideoExportConfig);
      activeConfigRef.current = config;

      const settings = getSettings(config.aspectRatio);
      sourceCanvasRef.current = canvas;

      // Bump the visualizer's internal pixelRatio so the captured frames are
      // HD instead of being upscaled from the small on-screen canvas (which
      // looks blurry in the final video, especially when not in fullscreen).
      try {
        const cssW = canvas.clientWidth || canvas.width;
        const targetW = settings.width;
        const idealPR = Math.min(4, Math.max(1.5, targetW / Math.max(1, cssW)));
        window.dispatchEvent(new CustomEvent('visualizer:boost-pixel-ratio', {
          detail: { pixelRatio: idealPR },
        }));
      } catch {}

      // Pre-load Google font + background image so first frame already has them
      if (config.overlay.enabled) {
        await ensureGoogleFont(config.overlay.font);
      }
      if (config.background.type === 'image' && config.background.imageDataUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = config.background.imageDataUrl;
        // For animated GIFs we keep the element attached (hidden) so the
        // browser keeps animating it; drawImage then pulls the current frame.
        img.style.position = 'fixed';
        img.style.left = '-99999px';
        img.style.top = '-99999px';
        img.style.width = '1px';
        img.style.height = '1px';
        document.body.appendChild(img);
        try {
          await new Promise<void>((res, rej) => {
            if (img.complete && img.naturalWidth) return res();
            img.onload = () => res();
            img.onerror = () => rej(new Error('bg image failed to load'));
          });
        } catch (e) {
          console.warn(e);
        }
        bgImageRef.current = img;
      } else {
        bgImageRef.current = null;
      }

      const hdCanvas = document.createElement('canvas');
      hdCanvas.width = settings.width;
      hdCanvas.height = settings.height;
      const hdCtx = hdCanvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!hdCtx) {
        console.error('Failed to create HD canvas context');
        return;
      }
      hdCanvasRef.current = hdCanvas;
      hdCtx.imageSmoothingEnabled = true;
      hdCtx.imageSmoothingQuality = 'high';

      const gradient = GRADIENT_PRESETS.find((g) => g.id === config.background.gradientId) ?? GRADIENT_PRESETS[0];
      const targetFrameTime = 1000 / settings.frameRate;

      const drawBackground = (ctx: CanvasRenderingContext2D) => {
        const { width, height } = settings;
        if (config.background.type === 'image' && bgImageRef.current?.complete && bgImageRef.current.naturalWidth) {
          // Cover the canvas
          const img = bgImageRef.current;
          const ar = img.naturalWidth / img.naturalHeight;
          const tar = width / height;
          let dw = width, dh = height, dx = 0, dy = 0;
          if (ar > tar) {
            dw = height * ar;
            dx = (width - dw) / 2;
          } else {
            dh = width / ar;
            dy = (height - dh) / 2;
          }
          ctx.drawImage(img, dx, dy, dw, dh);
          // Slight dark vignette so overlay text stays legible
          const vg = ctx.createLinearGradient(0, 0, 0, height);
          vg.addColorStop(0, 'rgba(0,0,0,0.15)');
          vg.addColorStop(0.5, 'rgba(0,0,0,0)');
          vg.addColorStop(1, 'rgba(0,0,0,0.55)');
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, width, height);
        } else {
          paintGradient(ctx, gradient, width, height);
        }
      };

      const drawOverlay = (ctx: CanvasRenderingContext2D) => {
        if (!config.overlay.enabled) return;
        const { width, height } = settings;
        const cfg = activeConfigRef.current ?? config;
        const title = (cfg.overlay.title || options.trackTitle || '').trim();
        const artist = cfg.overlay.artist.trim();
        const handle = cfg.overlay.handle.trim();
        if (!title && !artist && !handle) return;

        const fontFamily = `"${cfg.overlay.font}", sans-serif`;
        const isVertical = config.aspectRatio === '9:16';
        const baseSize = isVertical ? width * 0.06 : height * 0.075;
        const titleSize = baseSize;
        const subSize = baseSize * 0.5;
        const handleSize = baseSize * 0.42;
        const pad = isVertical ? width * 0.06 : height * 0.06;

        ctx.save();
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = cfg.overlay.color;
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = isVertical ? 14 : 18;
        ctx.shadowOffsetY = 2;

        const isBottom = cfg.overlay.position === 'bottom';
        const xLeft = pad;
        const totalLines =
          (title ? 1 : 0) + (artist ? 1 : 0) + (handle ? 1 : 0);
        const lineGap = baseSize * 0.25;
        const block =
          (title ? titleSize : 0) +
          (artist ? subSize : 0) +
          (handle ? handleSize : 0) +
          Math.max(0, totalLines - 1) * lineGap;

        let y = isBottom ? height - pad - block + titleSize : pad + titleSize;
        const advance = (lineH: number) => {
          y += lineH + lineGap;
        };

        if (title) {
          ctx.font = `700 ${titleSize}px ${fontFamily}`;
          ctx.fillText(title, xLeft, y, width - pad * 2);
          advance(subSize);
        }
        if (artist) {
          ctx.font = `500 ${subSize}px ${fontFamily}`;
          ctx.globalAlpha = 0.92;
          ctx.fillText(artist, xLeft, y, width - pad * 2);
          ctx.globalAlpha = 1;
          advance(handleSize);
        }
        if (handle) {
          ctx.font = `400 ${handleSize}px ${fontFamily}`;
          ctx.globalAlpha = 0.78;
          ctx.fillText(handle, xLeft, y, width - pad * 2);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      };

      const copyFrame = (timestamp: number) => {
        if (!sourceCanvasRef.current || !hdCanvasRef.current) return;
        const elapsed = timestamp - lastFrameTimeRef.current;
        if (elapsed < targetFrameTime) {
          animationFrameRef.current = requestAnimationFrame(copyFrame);
          return;
        }
        lastFrameTimeRef.current = timestamp;

        const ctx = hdCanvasRef.current.getContext('2d', { alpha: false });
        if (!ctx) {
          animationFrameRef.current = requestAnimationFrame(copyFrame);
          return;
        }
        const { width, height } = settings;

        // 1. Background (gradient or image)
        drawBackground(ctx);

        // 2. Visualizer (preserve aspect, contained)
        const sourceWidth = sourceCanvasRef.current.width;
        const sourceHeight = sourceCanvasRef.current.height;
        if (sourceWidth > 0 && sourceHeight > 0) {
          const sourceAspect = sourceWidth / sourceHeight;
          const isVertical = config.aspectRatio === '9:16';
          // For vertical: fit visualizer into the middle band (~55% of height)
          // For landscape: fit into the full frame
          let bandW = width;
          let bandH = height;
          let bandX = 0;
          let bandY = 0;
          if (isVertical) {
            bandH = height * 0.55;
            bandY = (height - bandH) / 2;
          }
          const bandAspect = bandW / bandH;
          let drawW = bandW, drawH = bandH, offX = bandX, offY = bandY;
          if (sourceAspect > bandAspect) {
            drawH = bandW / sourceAspect;
            offY = bandY + (bandH - drawH) / 2;
          } else {
            drawW = bandH * sourceAspect;
            offX = bandX + (bandW - drawW) / 2;
          }
          ctx.drawImage(
            sourceCanvasRef.current,
            0, 0, sourceWidth, sourceHeight,
            offX, offY, drawW, drawH,
          );
        }

        // 3. Overlay text
        drawOverlay(ctx);

        animationFrameRef.current = requestAnimationFrame(copyFrame);
      };

      lastFrameTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(copyFrame);

      const videoStream = hdCanvas.captureStream(settings.frameRate);

      const ctx = Howler.ctx;
      const masterGain = (Howler as any).masterGain;
      if (!ctx || !masterGain) {
        console.error('Audio context not available for recording');
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        return;
      }
      if (ctx.state === 'suspended') ctx.resume();

      const audioDestination = ctx.createMediaStreamDestination();
      masterGain.connect(audioDestination);
      audioDestinationRef.current = audioDestination;

      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      streamRef.current = combinedStream;

      let mimeType = 'video/webm';
      const codecs = [
        'video/mp4;codecs=avc1.640034,mp4a.40.2',
        'video/mp4;codecs=avc1.4d0034,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
      ];
      for (const codec of codecs) {
        if (MediaRecorder.isTypeSupported(codec)) { mimeType = codec; break; }
      }

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: settings.videoBitrate,
        audioBitsPerSecond: settings.audioBitrate,
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      mediaRecorder.onstop = () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const trackName = options.trackTitle?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'visualizer';
        const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        const orient = config.aspectRatio === '9:16' ? 'vertical' : 'landscape';
        const filename = `${trackName}_${resolution}_${orient}_${timestamp}.${ext}`;

        console.log(`📹 Video recorded: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
        options.onRecordingComplete?.(blob, filename);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        try {
          if (audioDestinationRef.current) {
            masterGain.disconnect(audioDestinationRef.current);
            audioDestinationRef.current = null;
          }
        } catch {}

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (bgImageRef.current?.parentNode) {
          bgImageRef.current.parentNode.removeChild(bgImageRef.current);
        }
        bgImageRef.current = null;
        hdCanvasRef.current = null;
        sourceCanvasRef.current = null;
        activeConfigRef.current = null;
        // Restore the on-screen visualizer's pixel ratio
        window.dispatchEvent(new CustomEvent('visualizer:restore-pixel-ratio'));
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(500);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => setRecordingTime((p) => p + 1), 1000);

      console.log(`🔴 Recording ${config.aspectRatio} ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);
    } catch (error) {
      console.error('Failed to start recording:', error);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      window.dispatchEvent(new CustomEvent('visualizer:restore-pixel-ratio'));
    }
  }, [isRecording, options, resolution]);

  const toggleRecording = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    if (isRecording) stopRecording();
    else startRecording(canvas);
  }, [isRecording, startRecording, stopRecording]);

  const formatRecordingTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (bgImageRef.current?.parentNode) {
        bgImageRef.current.parentNode.removeChild(bgImageRef.current);
      }
    };
  }, []);

  return {
    isRecording,
    recordingTime,
    recordingMode,
    setRecordingMode,
    resolution,
    setResolution,
    formattedTime: formatRecordingTime(recordingTime),
    startRecording,
    stopRecording,
    toggleRecording,
  };
};
