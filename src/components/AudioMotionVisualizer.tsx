import { useEffect, useRef, useState, useCallback } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { Howler } from 'howler';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize, Smartphone } from 'lucide-react';
import { isIOSDevice } from '@/lib/utils';

interface AudioMotionVisualizerProps {
  type: 'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform' | 'rings' | 'galaxy';
  isPlaying: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

// Map our visualizer types to audiomotion modes with unique settings
const getModeSettings = (type: string) => {
  switch (type) {
    case 'bars':
      return { mode: 2, gradient: 'rainbow', barSpace: 0.25, reflexRatio: 0.3, reflexAlpha: 0.25, radial: false, spinSpeed: 0, lumiBars: false };
    case 'wave':
      return { mode: 10, gradient: 'prism', lineWidth: 2, fillAlpha: 0.3, radial: false, spinSpeed: 0, lumiBars: false };
    case 'circular':
      return { mode: 3, gradient: 'rainbow', barSpace: 0.1, reflexRatio: 0, reflexAlpha: 0, radial: true, spinSpeed: 1, lumiBars: false };
    case 'spectrum':
      return { mode: 4, gradient: 'classic', barSpace: 0.1, reflexRatio: 0.2, reflexAlpha: 0.15, radial: false, spinSpeed: 0, lumiBars: true };
    case 'particles':
      return { mode: 6, gradient: 'orangered', barSpace: 0.6, reflexRatio: 0, reflexAlpha: 0, radial: true, spinSpeed: 3, lumiBars: false };
    case 'waveform':
      return { mode: 10, gradient: 'steelblue', lineWidth: 3, fillAlpha: 0, radial: false, spinSpeed: 0, lumiBars: false };
    case 'rings':
      return { mode: 1, gradient: 'steelblue', barSpace: 0.5, reflexRatio: 0.6, reflexAlpha: 0.5, radial: true, spinSpeed: -1, lumiBars: true };
    case 'galaxy':
      return { mode: 8, gradient: 'rainbow', barSpace: 0.3, reflexRatio: 0.4, reflexAlpha: 0.25, radial: true, spinSpeed: 2, lumiBars: false, ledBars: true };
    default:
      return { mode: 2, gradient: 'rainbow', barSpace: 0.25, reflexRatio: 0, reflexAlpha: 0, radial: false, spinSpeed: 0, lumiBars: false };
  }
};

// iOS Fallback Animated Visualizer Component
const IOSFallbackVisualizer = ({ type, isPlaying }: { type: string; isPlaying: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;
      
      // Clear with fade effect
      ctx.fillStyle = 'rgba(10, 10, 20, 0.15)';
      ctx.fillRect(0, 0, width, height);

      if (!isPlaying) {
        return;
      }

      timeRef.current += 0.02;
      const time = timeRef.current;

      // Generate fake audio-like data based on time
      const generateFakeData = (count: number) => {
        const data = [];
        for (let i = 0; i < count; i++) {
          const base = Math.sin(time * 2 + i * 0.1) * 0.3 + 0.5;
          const wave1 = Math.sin(time * 3 + i * 0.15) * 0.2;
          const wave2 = Math.sin(time * 5 + i * 0.08) * 0.15;
          const pulse = Math.sin(time * 1.5) * 0.1;
          data.push(Math.max(0.1, Math.min(1, base + wave1 + wave2 + pulse)));
        }
        return data;
      };

      const centerX = width / 2;
      const centerY = height / 2;

      if (type === 'bars' || type === 'spectrum') {
        const barCount = 32;
        const data = generateFakeData(barCount);
        const barWidth = (width / barCount) * 0.8;
        const gap = (width / barCount) * 0.2;

        data.forEach((value, i) => {
          const barHeight = value * height * 0.7;
          const x = i * (barWidth + gap);
          
          const gradient = ctx.createLinearGradient(x, height, x, height - barHeight);
          gradient.addColorStop(0, `hsl(${260 + i * 3}, 80%, 50%)`);
          gradient.addColorStop(1, `hsl(${280 + i * 3}, 90%, 70%)`);
          
          ctx.fillStyle = gradient;
          ctx.shadowBlur = 10;
          ctx.shadowColor = `hsl(${270 + i * 3}, 90%, 60%)`;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        });
      } else if (type === 'circular' || type === 'rings') {
        const segments = 36;
        const data = generateFakeData(segments);
        const baseRadius = Math.min(width, height) * 0.25;

        data.forEach((value, i) => {
          const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
          const barLength = value * baseRadius * 0.8;
          
          const x1 = centerX + Math.cos(angle) * baseRadius;
          const y1 = centerY + Math.sin(angle) * baseRadius;
          const x2 = centerX + Math.cos(angle) * (baseRadius + barLength);
          const y2 = centerY + Math.sin(angle) * (baseRadius + barLength);
          
          const hue = 260 + (i / segments) * 60;
          ctx.strokeStyle = `hsl(${hue}, 85%, 65%)`;
          ctx.lineWidth = 4;
          ctx.shadowBlur = 8;
          ctx.shadowColor = `hsl(${hue}, 90%, 60%)`;
          ctx.lineCap = 'round';
          
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        });

        // Inner glow circle
        const glowRadius = baseRadius * 0.9;
        const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
        glowGradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
        glowGradient.addColorStop(0.7, 'rgba(139, 92, 246, 0.1)');
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      } else if (type === 'wave' || type === 'waveform') {
        const points = 100;
        const data = generateFakeData(points);
        
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'hsl(271, 91%, 65%)';
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'hsl(271, 91%, 65%)';
        
        data.forEach((value, i) => {
          const x = (i / (points - 1)) * width;
          const y = centerY + (value - 0.5) * height * 0.6;
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        
        ctx.stroke();
        
        // Second wave for depth
        ctx.beginPath();
        ctx.strokeStyle = 'hsla(290, 91%, 65%, 0.5)';
        ctx.shadowBlur = 10;
        
        data.forEach((value, i) => {
          const x = (i / (points - 1)) * width;
          const y = centerY + (value - 0.5) * height * 0.4 + Math.sin(time + i * 0.1) * 10;
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        
        ctx.stroke();
      } else if (type === 'particles' || type === 'galaxy') {
        const particleCount = 80;
        const data = generateFakeData(particleCount);
        
        data.forEach((value, i) => {
          const angle = (i / particleCount) * Math.PI * 2 + time * 0.3;
          const spiralOffset = type === 'galaxy' ? i * 0.1 : 0;
          const distance = value * Math.min(width, height) * 0.35 + 20;
          
          const x = centerX + Math.cos(angle + spiralOffset) * distance;
          const y = centerY + Math.sin(angle + spiralOffset) * distance;
          const size = value * 6 + 2;
          
          const hue = 260 + (i / particleCount) * 80;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
          gradient.addColorStop(0, `hsl(${hue}, 90%, 75%)`);
          gradient.addColorStop(0.5, `hsl(${hue}, 85%, 55%)`);
          gradient.addColorStop(1, 'transparent');
          
          ctx.fillStyle = gradient;
          ctx.shadowBlur = value * 15;
          ctx.shadowColor = `hsl(${hue}, 90%, 60%)`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      ctx.shadowBlur = 0;
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [type, isPlaying]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full rounded-lg" />
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md text-xs text-muted-foreground">
        <Smartphone className="w-3 h-3" />
        <span>Animated mode (background playback enabled)</span>
      </div>
    </div>
  );
};

export const AudioMotionVisualizer = ({ type, isPlaying, onCanvasReady }: AudioMotionVisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const initIntervalRef = useRef<number | null>(null);
  const isIOS = isIOSDevice();

  // Initialize analyzer directly from Howler - no external dependencies
  const initAnalyzer = useCallback(() => {
    if (!containerRef.current) return false;
    if (analyzerRef.current) return true; // Already initialized
    if (isIOS) return false; // Don't init on iOS

    // Get Howler's audio context directly
    const ctx = Howler.ctx;
    const masterGain = (Howler as any).masterGain;

    if (!ctx || !masterGain) {
      return false; // Not ready yet
    }

    // Resume if suspended
    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.error);
    }

    try {
      const analyzer = new AudioMotionAnalyzer(containerRef.current, {
        audioCtx: ctx,
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

      // Connect to Howler's master gain
      analyzer.connectInput(masterGain);
      analyzerRef.current = analyzer;
      setIsConnected(true);
      console.log('✅ AudioMotion visualizer connected to Howler');

      // Notify parent about canvas availability for recording
      if (onCanvasReady && analyzer.canvas) {
        onCanvasReady(analyzer.canvas);
      }

      // Apply initial visualizer type settings
      const settings = getModeSettings(type);
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

      if (isPlaying) {
        analyzer.start();
      }

      return true;
    } catch (error) {
      console.error('Failed to create AudioMotion analyzer:', error);
      return false;
    }
  }, [type, isPlaying, isIOS]);

  // Initialize on mount and retry until Howler is ready (skip for iOS)
  useEffect(() => {
    if (isIOS) return; // Skip initialization on iOS

    // Try immediately
    if (!initAnalyzer()) {
      // Retry every 100ms until successful
      initIntervalRef.current = window.setInterval(() => {
        if (initAnalyzer() && initIntervalRef.current) {
          clearInterval(initIntervalRef.current);
          initIntervalRef.current = null;
        }
      }, 100);
    }

    // Also try on user interaction (click/touch can unlock audio context)
    const tryInit = () => {
      if (!analyzerRef.current) {
        initAnalyzer();
      }
    };
    document.addEventListener('click', tryInit);
    document.addEventListener('touchstart', tryInit);

    return () => {
      if (initIntervalRef.current) {
        clearInterval(initIntervalRef.current);
      }
      document.removeEventListener('click', tryInit);
      document.removeEventListener('touchstart', tryInit);
      
      if (analyzerRef.current) {
        try {
          analyzerRef.current.destroy();
        } catch (e) {}
        analyzerRef.current = null;
        setIsConnected(false);
        if (onCanvasReady) {
          onCanvasReady(null);
        }
      }
    };
  }, [initAnalyzer, onCanvasReady, isIOS]);

  // Update visualizer settings when type changes
  useEffect(() => {
    if (!analyzerRef.current || isIOS) return;

    const settings = getModeSettings(type);
    
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
      console.log('🎨 Visualizer type changed to:', type);
    } catch (error) {
      console.error('Failed to update visualizer settings:', error);
    }
  }, [type, isIOS]);

  // Handle play/pause state
  useEffect(() => {
    if (!analyzerRef.current || isIOS) return;
    
    if (isPlaying) {
      analyzerRef.current.start();
    }
  }, [isPlaying, isIOS]);

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

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Render iOS fallback visualizer
  if (isIOS) {
    return (
      <div ref={containerRef} className="relative w-full h-full group bg-background/50 rounded-lg overflow-hidden">
        <IOSFallbackVisualizer type={type} isPlaying={isPlaying} />
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
  }

  return (
    <div ref={containerRef} className="relative w-full h-full group bg-background/50 rounded-lg overflow-hidden">
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          {isPlaying ? 'Connecting visualizer...' : 'Play a track to see visualizer'}
        </div>
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
