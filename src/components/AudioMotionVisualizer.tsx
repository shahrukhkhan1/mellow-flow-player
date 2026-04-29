import { useEffect, useRef, useState, useCallback } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { Howler } from 'howler';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize } from 'lucide-react';
import { isIOSDevice } from '@/lib/utils';
import { VisualizerColorScheme } from '@/components/VisualizerColorPicker';

interface AudioMotionVisualizerProps {
  type: 'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform' | 'rings' | 'galaxy';
  isPlaying: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  colorScheme?: VisualizerColorScheme;
}

const COLOR_SCHEME_GRADIENTS: Record<VisualizerColorScheme, string> = {
  default: 'rainbow',
  sunset: 'orangered',
  ocean: 'steelblue',
  neon: 'prism',
  fire: 'orangered',
  ice: 'steelblue',
  forest: 'classic',
  candy: 'prism',
};

const getModeSettings = (type: string, colorScheme: VisualizerColorScheme = 'default') => {
  const gradient = COLOR_SCHEME_GRADIENTS[colorScheme] || 'rainbow';
  switch (type) {
    case 'bars':
      return { mode: 2, gradient, barSpace: 0.25, reflexRatio: 0.3, reflexAlpha: 0.25, radial: false, spinSpeed: 0, lumiBars: false };
    case 'wave':
      return { mode: 10, gradient, lineWidth: 2, fillAlpha: 0.3, radial: false, spinSpeed: 0, lumiBars: false };
    case 'circular':
      return { mode: 3, gradient, barSpace: 0.1, reflexRatio: 0, reflexAlpha: 0, radial: true, spinSpeed: 1, lumiBars: false };
    case 'spectrum':
      return { mode: 4, gradient, barSpace: 0.1, reflexRatio: 0.2, reflexAlpha: 0.15, radial: false, spinSpeed: 0, lumiBars: true };
    case 'particles':
      return { mode: 6, gradient, barSpace: 0.6, reflexRatio: 0, reflexAlpha: 0, radial: true, spinSpeed: 3, lumiBars: false };
    case 'waveform':
      return { mode: 10, gradient, lineWidth: 3, fillAlpha: 0, radial: false, spinSpeed: 0, lumiBars: false };
    case 'rings':
      return { mode: 1, gradient, barSpace: 0.5, reflexRatio: 0.6, reflexAlpha: 0.5, radial: true, spinSpeed: -1, lumiBars: true };
    case 'galaxy':
      return { mode: 8, gradient, barSpace: 0.3, reflexRatio: 0.4, reflexAlpha: 0.25, radial: true, spinSpeed: 2, lumiBars: false, ledBars: true };
    default:
      return { mode: 2, gradient, barSpace: 0.25, reflexRatio: 0, reflexAlpha: 0, radial: false, spinSpeed: 0, lumiBars: false };
  }
};


// Simple iOS fallback - just show a subtle equalizer bar animation
const IOSAnimatedVisualizer = ({ isPlaying }: { type: string; isPlaying: boolean; colorScheme?: VisualizerColorScheme }) => {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[3px] px-6 pb-6">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm bg-primary/60"
          style={{
            height: isPlaying ? `${12 + Math.random() * 55}%` : '6%',
            opacity: isPlaying ? 0.7 : 0.2,
            animation: isPlaying ? `ios-bar-pulse ${0.4 + Math.random() * 0.6}s ease-in-out ${i * 0.06}s infinite alternate` : 'none',
            transition: 'height 0.3s ease, opacity 0.3s ease',
          }}
        />
      ))}
    </div>
  );
};

export const AudioMotionVisualizer = ({ type, isPlaying, onCanvasReady, colorScheme = 'default' }: AudioMotionVisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const initIntervalRef = useRef<number | null>(null);
  const isIOS = isIOSDevice();

  // On iOS, use CSS-animated visualizer to preserve background playback
  // createMediaElementSource would route audio through AudioContext which suspends on screen lock
  const initAnalyzer = useCallback(() => {
    if (!containerRef.current || isIOS) return false;
    if (analyzerRef.current) return true;

    const ctx = Howler.ctx;
    const masterGain = (Howler as any).masterGain;
    if (!ctx || !masterGain) return false;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.error);
    }

    try {
      const analyzer = new AudioMotionAnalyzer(containerRef.current, {
        audioCtx: ctx,
        connectSpeakers: false,
        mode: 2,
        gradient: 'rainbow',
        showScaleX: false,
        showScaleY: false,
        showBgColor: true,
        bgAlpha: 0.7,
        overlay: true,
        showPeaks: true,
        smoothing: 0.7,
        fftSize: 8192,
        minFreq: 20,
        maxFreq: 16000,
        showFPS: false,
        barSpace: 0.25,
        reflexRatio: 0.3,
        reflexAlpha: 0.25,
      });

      analyzer.connectInput(masterGain);
      analyzerRef.current = analyzer;
      setIsConnected(true);
      console.log('✅ AudioMotion visualizer connected to Howler');

      if (onCanvasReady && analyzer.canvas) {
        onCanvasReady(analyzer.canvas);
      }

      const settings = getModeSettings(type, colorScheme);
      analyzer.setOptions({
        mode: settings.mode,
        gradient: settings.gradient,
        barSpace: settings.barSpace ?? 0.25,
        reflexRatio: settings.reflexRatio ?? 0,
        reflexAlpha: settings.reflexAlpha ?? 0.15,
        lineWidth: settings.lineWidth ?? 0,
        fillAlpha: settings.fillAlpha ?? 1,
        radial: settings.radial ?? false,
        spinSpeed: settings.spinSpeed ?? 0,
        lumiBars: settings.lumiBars ?? false,
        ledBars: settings.ledBars ?? false,
      });

      if (isPlaying) analyzer.start();
      return true;
    } catch (error) {
      console.error('Failed to create AudioMotion analyzer:', error);
      return false;
    }
  }, [type, isPlaying, isIOS, colorScheme, onCanvasReady]);

  useEffect(() => {
    if (isIOS) {
      // iOS uses CSS animated visualizer, mark as connected
      setIsConnected(true);
      return;
    }

    if (!initAnalyzer()) {
      initIntervalRef.current = window.setInterval(() => {
        if (initAnalyzer() && initIntervalRef.current) {
          clearInterval(initIntervalRef.current);
          initIntervalRef.current = null;
        }
      }, 200);
    }

    const tryInit = () => {
      if (!analyzerRef.current) initAnalyzer();
    };
    document.addEventListener('click', tryInit);
    document.addEventListener('touchstart', tryInit);

    return () => {
      if (initIntervalRef.current) clearInterval(initIntervalRef.current);
      document.removeEventListener('click', tryInit);
      document.removeEventListener('touchstart', tryInit);

      if (analyzerRef.current) {
        try { analyzerRef.current.destroy(); } catch (e) {}
        analyzerRef.current = null;
        setIsConnected(false);
        if (onCanvasReady) onCanvasReady(null);
      }
    };
  }, [initAnalyzer, onCanvasReady, isIOS]);

  useEffect(() => {
    if (!analyzerRef.current) return;
    const settings = getModeSettings(type, colorScheme);
    try {
      analyzerRef.current.setOptions({
        mode: settings.mode,
        gradient: settings.gradient,
        barSpace: settings.barSpace ?? 0.25,
        reflexRatio: settings.reflexRatio ?? 0,
        reflexAlpha: settings.reflexAlpha ?? 0.15,
        lineWidth: settings.lineWidth ?? 0,
        fillAlpha: settings.fillAlpha ?? 1,
        radial: settings.radial ?? false,
        spinSpeed: settings.spinSpeed ?? 0,
        lumiBars: settings.lumiBars ?? false,
        ledBars: settings.ledBars ?? false,
      });
    } catch (error) {
      console.error('Failed to update visualizer settings:', error);
    }
  }, [type, colorScheme]);

  useEffect(() => {
    if (!analyzerRef.current) return;
    if (isPlaying) analyzerRef.current.start();
  }, [isPlaying]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!isFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full group bg-background/50 rounded-lg overflow-hidden">
      {isIOS ? (
        <IOSAnimatedVisualizer type={type} isPlaying={isPlaying} colorScheme={colorScheme} />
      ) : (
        !isConnected && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            {isPlaying ? 'Connecting visualizer...' : 'Play a track to see visualizer'}
          </div>
        )
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70 z-10"
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </Button>
    </div>
  );
};
