import { useState, useRef, useCallback, useEffect } from 'react';
import { Howler } from 'howler';

export type RecordingMode = 'single' | 'continuous';

interface UseVideoRecorderOptions {
  trackTitle?: string;
  onRecordingComplete?: (blob: Blob, filename: string) => void;
}

export const useVideoRecorder = (options: UseVideoRecorderOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('single');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hdCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // HD resolution settings
  const HD_WIDTH = 1280;
  const HD_HEIGHT = 720;

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

    try {
      sourceCanvasRef.current = canvas;

      // Create HD off-screen canvas for high quality recording
      const hdCanvas = document.createElement('canvas');
      hdCanvas.width = HD_WIDTH;
      hdCanvas.height = HD_HEIGHT;
      const hdCtx = hdCanvas.getContext('2d', { alpha: false });
      
      if (!hdCtx) {
        console.error('Failed to create HD canvas context');
        return;
      }

      hdCanvasRef.current = hdCanvas;

      // Set up high quality rendering
      hdCtx.imageSmoothingEnabled = true;
      hdCtx.imageSmoothingQuality = 'high';

      // Start copying frames to HD canvas
      const copyFrame = () => {
        if (!sourceCanvasRef.current || !hdCanvasRef.current) return;
        
        const ctx = hdCanvasRef.current.getContext('2d', { alpha: false });
        if (ctx) {
          // Fill with black background first
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, HD_WIDTH, HD_HEIGHT);
          
          // Calculate aspect ratio preserving dimensions
          const sourceAspect = sourceCanvasRef.current.width / sourceCanvasRef.current.height;
          const targetAspect = HD_WIDTH / HD_HEIGHT;
          
          let drawWidth = HD_WIDTH;
          let drawHeight = HD_HEIGHT;
          let offsetX = 0;
          let offsetY = 0;
          
          if (sourceAspect > targetAspect) {
            drawHeight = HD_WIDTH / sourceAspect;
            offsetY = (HD_HEIGHT - drawHeight) / 2;
          } else {
            drawWidth = HD_HEIGHT * sourceAspect;
            offsetX = (HD_WIDTH - drawWidth) / 2;
          }
          
          // Draw scaled image
          ctx.drawImage(
            sourceCanvasRef.current,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight
          );
        }
        
        animationFrameRef.current = requestAnimationFrame(copyFrame);
      };

      // Start frame copying
      copyFrame();

      // Get video stream from HD canvas (30fps for smooth video)
      const videoStream = hdCanvas.captureStream(30);
      
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

      // Create MediaRecorder with optimal settings for HD quality
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 8000000, // 8 Mbps for HD quality
        audioBitsPerSecond: 192000, // 192 kbps audio for better quality
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
        
        // Generate filename with track title and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const trackName = options.trackTitle?.replace(/[^a-zA-Z0-9]/g, '_') || 'visualizer';
        const filename = `${trackName}_${timestamp}.webm`;

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
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      console.log('🔴 Recording started (HD 720p)');
    } catch (error) {
      console.error('Failed to start recording:', error);
      // Clean up on error
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [isRecording, options.trackTitle, options.onRecordingComplete]);

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
    formattedTime: formatRecordingTime(recordingTime),
    startRecording,
    stopRecording,
    toggleRecording,
  };
};
