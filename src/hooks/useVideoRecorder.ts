import { useState, useRef, useCallback } from 'react';
import { Howler } from 'howler';

interface UseVideoRecorderOptions {
  trackTitle?: string;
}

export const useVideoRecorder = (options: UseVideoRecorderOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback((canvas: HTMLCanvasElement) => {
    if (isRecording || !canvas) return;

    try {
      // Get video stream from canvas (30fps for good quality/size balance)
      const videoStream = canvas.captureStream(30);
      
      // Get audio stream from Howler's audio context
      const ctx = Howler.ctx;
      const masterGain = (Howler as any).masterGain;
      
      if (!ctx || !masterGain) {
        console.error('Audio context not available for recording');
        return;
      }

      // Create audio destination for recording
      const audioDestination = ctx.createMediaStreamDestination();
      masterGain.connect(audioDestination);

      // Combine video and audio streams
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);
      
      streamRef.current = combinedStream;

      // Create MediaRecorder with optimal settings
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 5000000, // 5 Mbps for HD quality
        audioBitsPerSecond: 128000, // 128 kbps audio
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Create blob from recorded chunks
        const blob = new Blob(chunksRef.current, { type: mimeType });
        
        // Generate filename with track title and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const trackName = options.trackTitle?.replace(/[^a-zA-Z0-9]/g, '_') || 'visualizer';
        const filename = `${trackName}_${timestamp}.webm`;

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
          masterGain.disconnect(audioDestination);
        } catch (e) {
          // Ignore disconnect errors
        }

        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      console.log('🔴 Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, [isRecording, options.trackTitle]);

  const stopRecording = useCallback(() => {
    if (!isRecording || !mediaRecorderRef.current) return;

    try {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTime(0);

      console.log('⬛ Recording stopped');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, [isRecording]);

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

  return {
    isRecording,
    recordingTime,
    formattedTime: formatRecordingTime(recordingTime),
    startRecording,
    stopRecording,
    toggleRecording,
  };
};
