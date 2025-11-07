import { useEffect, useRef } from 'react';
import { trackPlayStats } from '@/lib/db';
import { Track } from './useAudioPlayer';

export const usePlayTracking = (
  currentTrack: Track | null,
  isPlaying: boolean,
  currentTime: number
) => {
  const playStartTimeRef = useRef<number | null>(null);
  const lastTrackedTrackRef = useRef<string | null>(null);

  useEffect(() => {
    // Track when playback starts
    if (isPlaying && currentTrack) {
      if (!playStartTimeRef.current || lastTrackedTrackRef.current !== currentTrack.id) {
        playStartTimeRef.current = currentTime;
        lastTrackedTrackRef.current = currentTrack.id;
      }
    }

    // Track when playback stops or changes
    return () => {
      if (playStartTimeRef.current !== null && currentTrack && lastTrackedTrackRef.current === currentTrack.id) {
        const playTime = currentTime - playStartTimeRef.current;
        if (playTime > 5) { // Only count if played for more than 5 seconds
          trackPlayStats(currentTrack.id, playTime).catch(console.error);
        }
      }
    };
  }, [isPlaying, currentTrack?.id]);

  // Track when song ends or user seeks
  useEffect(() => {
    if (currentTrack && playStartTimeRef.current !== null) {
      const playTime = currentTime - playStartTimeRef.current;
      
      // If song ends or big seek happens, save progress
      if (playTime > 5) {
        trackPlayStats(currentTrack.id, playTime).catch(console.error);
        playStartTimeRef.current = currentTime;
      }
    }
  }, [currentTrack?.id, currentTime]);
};
