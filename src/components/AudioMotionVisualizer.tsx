import { useEffect, useRef, useState, useCallback } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { Howler } from 'howler';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize } from 'lucide-react';

interface AudioMotionVisualizerProps {
  type: 'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform' | 'rings' | 'galaxy';
  isPlaying: boolean;
  sourceNode?: AudioNode | null;
  isReady?: boolean;
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
      return { mode: 8, gradient: 'orangered', barSpace: 0.5, reflexRatio: 0, reflexAlpha: 0, radial: false, spinSpeed: 0, lumiBars: false, ledBars: true };
    case 'waveform':
      return { mode: 10, gradient: 'steelblue', lineWidth: 3, fillAlpha: 0, radial: false, spinSpeed: 0, lumiBars: false };
    case 'rings':
      return { mode: 2, gradient: 'steelblue', barSpace: 0.4, reflexRatio: 0.5, reflexAlpha: 0.4, radial: true, spinSpeed: 0, lumiBars: false };
    case 'galaxy':
      return { mode: 5, gradient: 'rainbow', barSpace: 0.2, reflexRatio: 0.4, reflexAlpha: 0.25, radial: true, spinSpeed: 2, lumiBars: false };
    default:
      return { mode: 2, gradient: 'rainbow', barSpace: 0.25, reflexRatio: 0, reflexAlpha: 0, radial: false, spinSpeed: 0, lumiBars: false };
  }
};

export const AudioMotionVisualizer = ({ type, isPlaying, sourceNode, isReady }: AudioMotionVisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const connectedSourceRef = useRef<AudioNode | null>(null);
  const mountedRef = useRef(true);

  // Initialize analyzer when sourceNode becomes available
  useEffect(() => {
    mountedRef.current = true;
    
    if (!containerRef.current || !sourceNode || !isReady) return;

    // Don't reinit if we already have an analyzer with same source
    if (analyzerRef.current && connectedSourceRef.current === sourceNode) {
      return;
    }

    // Get the audio context from Howler
    const ctx = Howler.ctx;
    if (!ctx) {
      console.log('⏳ Waiting for Howler audio context...');
      return;
    }

    // Resume context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.error);
    }

    // Clean up previous analyzer
    if (analyzerRef.current) {
      try {
        analyzerRef.current.destroy();
      } catch (e) {}
      analyzerRef.current = null;
      connectedSourceRef.current = null;
    }

    try {
      const analyzer = new AudioMotionAnalyzer(containerRef.current!, {
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

      analyzerRef.current = analyzer;
      console.log('✅ AudioMotion analyzer created');

      // Connect the source node
      try {
        analyzer.connectInput(sourceNode);
        connectedSourceRef.current = sourceNode;
        setIsConnected(true);
        console.log('✅ AudioMotion connected to source node');
      } catch (error) {
        console.error('Failed to connect source to AudioMotion:', error);
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
    } catch (error) {
      console.error('Failed to create AudioMotion analyzer:', error);
    }

    return () => {
      mountedRef.current = false;
      if (analyzerRef.current) {
        try {
          analyzerRef.current.destroy();
        } catch (e) {}
        analyzerRef.current = null;
        connectedSourceRef.current = null;
        setIsConnected(false);
      }
    };
  }, [sourceNode, isReady]);

  // Update visualizer settings when type changes
  useEffect(() => {
    if (!analyzerRef.current) return;

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
  }, [type]);

  // Handle play/pause state
  useEffect(() => {
    if (!analyzerRef.current) return;
    
    if (isPlaying) {
      analyzerRef.current.start();
    }
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

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
