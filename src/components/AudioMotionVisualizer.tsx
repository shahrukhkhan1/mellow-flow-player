import { useEffect, useRef, useState, useCallback } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { Howler } from 'howler';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize } from 'lucide-react';

interface AudioMotionVisualizerProps {
  type: 'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform' | 'rings' | 'galaxy';
  isPlaying: boolean;
}

// Map our visualizer types to audiomotion modes
const getModeSettings = (type: string) => {
  switch (type) {
    case 'bars':
      return { mode: 2, gradient: 'rainbow', barSpace: 0.25, reflexRatio: 0.3, reflexAlpha: 0.25 };
    case 'wave':
      return { mode: 10, gradient: 'prism', lineWidth: 2, fillAlpha: 0.3 };
    case 'circular':
      return { mode: 3, gradient: 'rainbow', radial: true, spinSpeed: 1 };
    case 'spectrum':
      return { mode: 4, gradient: 'classic', barSpace: 0.1, lumiBars: true };
    case 'particles':
      return { mode: 6, gradient: 'rainbow', radial: true, spinSpeed: 2 };
    case 'waveform':
      return { mode: 10, gradient: 'prism', lineWidth: 3, fillAlpha: 0 };
    case 'rings':
      return { mode: 3, gradient: 'steelblue', radial: true, reflexRatio: 0.5 };
    case 'galaxy':
      return { mode: 5, gradient: 'rainbow', radial: true, spinSpeed: 1, reflexRatio: 0.4 };
    default:
      return { mode: 2, gradient: 'rainbow' };
  }
};

export const AudioMotionVisualizer = ({ type, isPlaying }: AudioMotionVisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize analyzer
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      // Create AudioMotion analyzer
      const analyzer = new AudioMotionAnalyzer(containerRef.current, {
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
      console.log('🎨 AudioMotion analyzer created');

      // Try to connect to Howler's audio context
      const connectToHowler = () => {
        try {
          // Get Howler's audio context and master gain
          const ctx = Howler.ctx;
          const masterGain = Howler.masterGain;

          if (ctx && masterGain) {
            // Connect Howler's master gain to our analyzer
            analyzer.connectInput(masterGain);
            setIsConnected(true);
            console.log('✅ Connected to Howler audio context');
            return true;
          }
        } catch (error) {
          console.error('Failed to connect to Howler:', error);
        }
        return false;
      };

      // Try to connect immediately
      if (!connectToHowler()) {
        // Retry after a short delay (Howler might not be initialized yet)
        const retryInterval = setInterval(() => {
          if (connectToHowler()) {
            clearInterval(retryInterval);
          }
        }, 500);

        // Clean up retry interval after 10 seconds
        setTimeout(() => clearInterval(retryInterval), 10000);
      }

      return () => {
        analyzer.destroy();
        analyzerRef.current = null;
        console.log('🎨 AudioMotion analyzer destroyed');
      };
    } catch (error) {
      console.error('Failed to create AudioMotion analyzer:', error);
    }
  }, []);

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
