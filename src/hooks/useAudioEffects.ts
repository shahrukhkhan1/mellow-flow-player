import { useEffect, useRef, useState, useCallback } from 'react';
import { Howler } from 'howler';
import { isIOSDevice } from '@/lib/utils';

export type EqualizerPreset = 'flat' | 'bass' | 'treble' | 'vocal' | 'rock' | 'pop' | 'jazz' | 'classical' | 'hiphop' | 'trap' | 'drill' | 'lofi' | 'electronic' | 'acoustic' | 'metal' | 'rnb';

const EQUALIZER_PRESETS: Record<EqualizerPreset, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [5, 4, 3, 2, 0, -1, -2, -2, -2, -2],
  treble: [-2, -2, -2, -1, 0, 2, 3, 4, 5, 5],
  vocal: [-1, -2, -2, 2, 4, 4, 3, 2, 0, -1],
  rock: [4, 3, 2, -1, -2, -1, 2, 3, 4, 4],
  pop: [-1, 2, 3, 3, 2, 0, -1, -1, -1, -1],
  jazz: [3, 2, 0, 2, 3, 3, 2, 2, 3, 3],
  classical: [3, 2, 0, 0, 0, 0, -1, -1, -1, -2],
  hiphop: [5, 4, 2, 1, -1, -1, 1, 2, 2, 3],
  trap: [6, 4, 2, 1, -1, -1, 0, 2, 3, 4],
  drill: [6, 5, 3, 0, -2, -1, 0, 2, 3, 4],
  lofi: [3, 2, 0, -1, 2, 3, 2, -1, -2, -3],
  electronic: [4, 3, 2, 0, -1, 2, 3, 4, 3, 2],
  acoustic: [4, 3, 1, 0, 2, 2, 2, 1, 0, -1],
  metal: [5, 4, 3, 2, -1, -2, 0, 3, 4, 5],
  rnb: [3, 4, 2, 1, -1, 2, 3, 2, 1, 0],
};

export const useAudioEffects = () => {
  const isIOS = isIOSDevice();
  const audioContextRef = useRef<AudioContext | null>(null);
  const equalizerRef = useRef<BiquadFilterNode[]>([]);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const visualizerSourceRef = useRef<GainNode | null>(null);
  const isInitializedRef = useRef(false);
  const initAttemptRef = useRef(0);
  
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [visualizerSource, setVisualizerSource] = useState<GainNode | null>(null);
  const [isReady, setIsReady] = useState(false);
  
  const [reverbEnabled, setReverbEnabled] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-reverb-enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [reverbAmount, setReverbAmount] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-reverb-amount');
    return saved ? parseFloat(saved) : 0.5;
  });
  const [playbackRate, setPlaybackRate] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-playback-rate');
    return saved ? parseFloat(saved) : 1;
  });
  const [currentPreset, setCurrentPreset] = useState<EqualizerPreset>(() => {
    const saved = localStorage.getItem('pocket-mp3-equalizer');
    return (saved as EqualizerPreset) || 'flat';
  });
  const [isBypassMode, setIsBypassMode] = useState(true);

  const initEffects = useCallback((): boolean => {
    // Prevent double initialization
    if (isInitializedRef.current) return true;

    if (isIOS) {
      setIsBypassMode(true);
      isInitializedRef.current = true;
      setIsReady(true);
      return true;
    }

    try {
      // Force Howler to use Web Audio API
      if (!(Howler as any).usingWebAudio) {
        (Howler as any).usingWebAudio = true;
      }

      // CRITICAL: Always use Howler's context - don't create our own!
      const ctx = Howler.ctx;
      const masterGain = (Howler as any).masterGain;
      
      // If Howler's context isn't ready yet, return false to retry
      if (!ctx || !masterGain) {
        return false;
      }
      
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      audioContextRef.current = ctx;
      console.log('🎛️ AudioContext initialized:', ctx.state);

      // Create analyser for visualizers
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.8;
      analyserRef.current = analyserNode;
      setAnalyser(analyserNode);

      // Create a dedicated gain node for visualizer source (audiomotion needs a source node, not analyser)
      const vizSource = ctx.createGain();
      vizSource.gain.value = 1;
      visualizerSourceRef.current = vizSource;
      setVisualizerSource(vizSource);

      // Create limiter for hearing protection
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 10;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      limiterRef.current = limiter;
      console.log('🛡️ Audio limiter enabled for hearing protection');

      setIsBypassMode(false);

      // Create 10-band equalizer
      const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      const filters = frequencies.map((freq) => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });
      equalizerRef.current = filters;

      // Create reverb (convolver)
      const convolver = ctx.createConvolver();
      convolverRef.current = convolver;

      // Create gain nodes
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      dryGainRef.current = dryGain;
      wetGainRef.current = wetGain;

      // Initialize based on saved settings
      const safeReverbAmount = reverbAmount * 0.5;
      wetGain.gain.value = reverbEnabled ? safeReverbAmount : 0;
      dryGain.gain.value = 1;

      // Apply saved equalizer preset
      const savedPresetGains = EQUALIZER_PRESETS[currentPreset];
      filters.forEach((filter, index) => {
        filter.gain.value = savedPresetGains[index];
      });

      // Create impulse response for reverb
      const createImpulseResponse = (duration: number, decay: number) => {
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const impulse = ctx.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
          const channelData = impulse.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
          }
        }
        return impulse;
      };

      convolver.buffer = createImpulseResponse(2, 2);

      // Connect audio chain
      try {
        masterGain.disconnect();
      } catch (e) {}

      // masterGain -> vizSource (for audiomotion) -> analyser -> filters -> split (dry/wet) -> limiter -> destination
      masterGain.connect(vizSource);
      vizSource.connect(analyserNode);
      
      let currentNode: AudioNode = analyserNode;
      filters.forEach(filter => {
        currentNode.connect(filter);
        currentNode = filter;
      });

      // Dry path
      currentNode.connect(dryGain);
      dryGain.connect(limiter);

      // Wet path (reverb)
      currentNode.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(limiter);

      // Final output
      limiter.connect(ctx.destination);

      console.log('🎛️ Full audio effects chain connected');
      isInitializedRef.current = true;
      setIsReady(true);
      return true;
    } catch (error) {
      console.error('❌ Error initializing audio effects:', error);
      return false;
    }
  }, [currentPreset, isIOS, reverbAmount, reverbEnabled]);

  useEffect(() => {
    if (isIOS) {
      initEffects();
      return;
    }

    let initInterval: number | null = null;
    
    // Try to init immediately
    if (!initEffects()) {
      // Keep retrying - Howler.ctx is created when first Howl instance plays
      initInterval = window.setInterval(() => {
        initAttemptRef.current++;
        if (initEffects() && initInterval) {
          clearInterval(initInterval);
          initInterval = null;
        }
      }, 200);
    }

    // Resume audio context on user interaction
    const handleUserInteraction = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
        console.log('🎛️ AudioContext resumed on user interaction');
      }
      // Also try to init if not ready
      if (!isInitializedRef.current) {
        initEffects();
      }
    };
    
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);

    return () => {
      if (initInterval) {
        clearInterval(initInterval);
      }
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [initEffects, isIOS]);

  // Apply equalizer preset changes
  useEffect(() => {
    if (equalizerRef.current.length === 0 || isBypassMode) return;
    
    const gains = EQUALIZER_PRESETS[currentPreset];
    equalizerRef.current.forEach((filter, index) => {
      filter.gain.value = gains[index];
    });
  }, [currentPreset, isBypassMode]);

  // Apply reverb changes
  useEffect(() => {
    if (!dryGainRef.current || !wetGainRef.current || isBypassMode) return;
    
    const safeReverbAmount = reverbAmount * 0.5;
    
    if (reverbEnabled) {
      wetGainRef.current.gain.value = safeReverbAmount;
    } else {
      wetGainRef.current.gain.value = 0;
    }
    dryGainRef.current.gain.value = 1;
  }, [reverbEnabled, reverbAmount, isBypassMode]);

  const setEqualizer = useCallback((preset: EqualizerPreset) => {
    if (isBypassMode || equalizerRef.current.length === 0) return;
    
    const gains = EQUALIZER_PRESETS[preset];
    equalizerRef.current.forEach((filter, index) => {
      filter.gain.value = gains[index];
    });
    setCurrentPreset(preset);
    localStorage.setItem('pocket-mp3-equalizer', preset);
  }, [isBypassMode]);

  const toggleReverb = useCallback((enabled?: boolean) => {
    if (isBypassMode) return;
    
    const newState = enabled ?? !reverbEnabled;
    setReverbEnabled(newState);
    localStorage.setItem('pocket-mp3-reverb-enabled', newState.toString());
    
    if (dryGainRef.current && wetGainRef.current) {
      const safeReverbAmount = reverbAmount * 0.5;
      wetGainRef.current.gain.value = newState ? safeReverbAmount : 0;
      dryGainRef.current.gain.value = 1;
    }
  }, [reverbEnabled, reverbAmount, isBypassMode]);

  const updateReverbAmount = useCallback((amount: number) => {
    setReverbAmount(amount);
    localStorage.setItem('pocket-mp3-reverb-amount', amount.toString());
    
    if (reverbEnabled && wetGainRef.current && !isBypassMode) {
      const safeReverbAmount = amount * 0.5;
      wetGainRef.current.gain.value = safeReverbAmount;
    }
  }, [reverbEnabled, isBypassMode]);

  const updatePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    localStorage.setItem('pocket-mp3-playback-rate', rate.toString());
    // Dispatch event for useAudioPlayer to listen to
    window.dispatchEvent(new CustomEvent('playbackRateChange', { detail: rate }));
  }, []);

  const resetAllSettings = useCallback(() => {
    setEqualizer('flat');
    setReverbEnabled(false);
    setReverbAmount(0.3);
    updatePlaybackRate(1);
    
    localStorage.removeItem('pocket-mp3-equalizer');
    localStorage.removeItem('pocket-mp3-reverb-enabled');
    localStorage.removeItem('pocket-mp3-reverb-amount');
    localStorage.removeItem('pocket-mp3-playback-rate');
  }, [setEqualizer, updatePlaybackRate]);

  const getAnalyserData = useCallback(() => {
    if (!analyserRef.current) return new Uint8Array(0);
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    return dataArray;
  }, []);

  const getWaveformData = useCallback(() => {
    if (!analyserRef.current) return new Uint8Array(0);
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(dataArray);
    return dataArray;
  }, []);

  return {
    setEqualizer,
    toggleReverb,
    updateReverbAmount,
    updatePlaybackRate,
    resetAllSettings,
    getAnalyserData,
    getWaveformData,
    reverbEnabled,
    reverbAmount,
    playbackRate,
    currentPreset,
    analyser,
    visualizerSource,
    isBypassMode,
    isReady,
  };
};
