import { useState, useRef, useCallback, useEffect } from 'react';
import { Howler } from 'howler';
import { isIOSDevice } from '@/lib/utils';

export type RecordingMode = 'single' | 'continuous';

interface UseVideoRecorderOptions {
  trackTitle?: string;
  onRecordingComplete?: (blob: Blob, filename: string) => void;
}

// YouTube recommended settings for 1080p
const YOUTUBE_1080P = {
  width: 1920,
  height: 1080,
  videoBitrate: 12000000, // 12 Mbps for high quality 1080p
  audioBitrate: 320000,    // 320 kbps for high quality audio
  frameRate: 60,           // 60fps for smooth visualizer
};

// Alternative 720p for smaller file sizes
const YOUTUBE_720P = {
  width: 1280,
  height: 720,
  videoBitrate: 8000000,   // 8 Mbps for 720p
  audioBitrate: 256000,    // 256 kbps audio
  frameRate: 60,
};

export const useVideoRecorder = (options: UseVideoRecorderOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('single');
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hdCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const getSettings = () => resolution === '1080p' ? YOUTUBE_1080P : YOUTUBE_720P;

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;

    try {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      setIsRecording(false);

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      setRecordingTime(0);
      console.log('⬛ Recording stopped');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, []);

  const startRecording = useCallback((canvas: HTMLCanvasElement) => {
    if (isRecording || !canvas) return;

    // Check iOS - recording not supported due to html5 audio mode
    if (isIOSDevice()) {
      console.warn('Recording not supported on iOS due to audio restrictions');
      return;
    }

    try {
      const settings = getSettings();
      sourceCanvasRef.current = canvas;

      // Create HD off-screen canvas for YouTube-ready recording
      const hdCanvas = document.createElement('canvas');
      hdCanvas.width = settings.width;
      hdCanvas.height = settings.height;
      const hdCtx = hdCanvas.getContext('2d', { 
        alpha: false,
        desynchronized: true, // Better performance
      });
      
      if (!hdCtx) {
        console.error('Failed to create HD canvas context');
        return;
      }

      hdCanvasRef.current = hdCanvas;

      // Set up high quality rendering
      hdCtx.imageSmoothingEnabled = true;
      hdCtx.imageSmoothingQuality = 'high';

      // High-performance frame copy using requestAnimationFrame
      const targetFrameTime = 1000 / settings.frameRate;
      
      const copyFrame = (timestamp: number) => {
        if (!sourceCanvasRef.current || !hdCanvasRef.current) return;
        
        // Throttle to target framerate
        const elapsed = timestamp - lastFrameTimeRef.current;
        if (elapsed < targetFrameTime) {
          animationFrameRef.current = requestAnimationFrame(copyFrame);
          return;
        }
        lastFrameTimeRef.current = timestamp;
        
        const ctx = hdCanvasRef.current.getContext('2d', { alpha: false });
        if (ctx) {
          // Fill with black background
          ctx.fillStyle = '#0a0a14';
          ctx.fillRect(0, 0, settings.width, settings.height);
          
          // Calculate aspect ratio preserving dimensions
          const sourceWidth = sourceCanvasRef.current.width;
          const sourceHeight = sourceCanvasRef.current.height;
          
          if (sourceWidth === 0 || sourceHeight === 0) {
            animationFrameRef.current = requestAnimationFrame(copyFrame);
            return;
          }
          
          const sourceAspect = sourceWidth / sourceHeight;
          const targetAspect = settings.width / settings.height;
          
          let drawWidth = settings.width;
          let drawHeight = settings.height;
          let offsetX = 0;
          let offsetY = 0;
          
          if (sourceAspect > targetAspect) {
            drawHeight = settings.width / sourceAspect;
            offsetY = (settings.height - drawHeight) / 2;
          } else {
            drawWidth = settings.height * sourceAspect;
            offsetX = (settings.width - drawWidth) / 2;
          }
          
          // Draw scaled visualizer frame
          ctx.drawImage(
            sourceCanvasRef.current,
            0, 0, sourceWidth, sourceHeight,
            offsetX, offsetY, drawWidth, drawHeight
          );
        }
        
        animationFrameRef.current = requestAnimationFrame(copyFrame);
      };

      // Start frame copying
      lastFrameTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(copyFrame);

      // Get video stream from HD canvas at target framerate
      const videoStream = hdCanvas.captureStream(settings.frameRate);
      
      // Get audio stream from Howler's audio context
      const ctx = Howler.ctx;
      const masterGain = (Howler as any).masterGain;
      
      if (!ctx || !masterGain) {
        console.error('Audio context not available for recording');
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        return;
      }

      // Resume audio context if suspended
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Create audio destination for recording
      const audioDestination = ctx.createMediaStreamDestination();
      masterGain.connect(audioDestination);
      audioDestinationRef.current = audioDestination;

      // Combine video and audio streams
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      
      streamRef.current = combinedStream;

      // Select best available codec for YouTube compatibility
      // VP9 is preferred, then VP8, then default
      let mimeType = 'video/webm';
      const codecs = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4',
      ];
      
      for (const codec of codecs) {
        if (MediaRecorder.isTypeSupported(codec)) {
          mimeType = codec;
          break;
        }
      }

      console.log(`🎬 Using codec: ${mimeType}`);

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: settings.videoBitrate,
        audioBitsPerSecond: settings.audioBitrate,
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }

        // Create blob from recorded chunks
        const blob = new Blob(chunksRef.current, { type: mimeType });
        
        // Generate filename with track title, resolution, and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const trackName = options.trackTitle?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'visualizer';
        const resLabel = resolution === '1080p' ? '1080p' : '720p';
        const filename = `${trackName}_${resLabel}_${timestamp}.webm`;

        console.log(`📹 Video recorded: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);

        // Call callback if provided
        if (options.onRecordingComplete) {
          options.onRecordingComplete(blob, filename);
        }

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Disconnect audio destination
        try {
          if (audioDestinationRef.current) {
            masterGain.disconnect(audioDestinationRef.current);
            audioDestinationRef.current = null;
          }
        } catch (e) {
          // Ignore disconnect errors
        }

        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Clean up HD canvas
        hdCanvasRef.current = null;
        sourceCanvasRef.current = null;
      };

      mediaRecorderRef.current = mediaRecorder;
      // Request data more frequently for smoother recording
      mediaRecorder.start(500);
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      console.log(`🔴 Recording started (${resolution} @ ${settings.frameRate}fps, ${settings.videoBitrate / 1000000}Mbps video, ${settings.audioBitrate / 1000}kbps audio)`);
    } catch (error) {
      console.error('Failed to start recording:', error);
      // Clean up on error
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [isRecording, options.trackTitle, options.onRecordingComplete, resolution]);

  const toggleRecording = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    
    if (isRecording) {
      stopRecording();
    } else {
      startRecording(canvas);
    }
  }, [isRecording, startRecording, stopRecording]);

  // Format recording time as MM:SS
  const formatRecordingTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
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
