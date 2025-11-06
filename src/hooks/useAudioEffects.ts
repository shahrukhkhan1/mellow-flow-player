import { useEffect, useRef, useState, useCallback } from 'react';
import { Howler } from 'howler';

export type EqualizerPreset = 'flat' | 'bass' | 'treble' | 'vocal' | 'rock' | 'pop' | 'jazz' | 'classical' | 'hiphop' | 'trap' | 'drill' | 'lofi';

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
};

export const useAudioEffects = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const equalizerRef = useRef<BiquadFilterNode[]>([]);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
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

  // Initialize Audio Context and nodes - always for visualizers
  useEffect(() => {
    // Check user preference for effects
    const effectsEnabled = localStorage.getItem('pocket-mp3-enable-effects') === 'true';
    
    // iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    // Set bypass mode but still initialize analyser for visualizers
    if (!effectsEnabled || isIOS) {
      console.log(isIOS 
        ? '🍎 iOS detected - visualizers only, effects disabled' 
        : '🎵 Visualizers enabled - effects disabled'
      );
      setIsBypassMode(true);
    } else {
      console.log('🎛️ Effects mode enabled - Full audio processing active');
      setIsBypassMode(false);
    }

    // Wait for Howler to initialize its audio context
    const initEffects = () => {
      try {
        // Get Howler's audio context (created when first sound plays with html5: false)
        const ctx = Howler.ctx;
        if (!ctx) {
          console.log('⏳ Waiting for Howler AudioContext...');
          setTimeout(initEffects, 100);
          return;
        }

        audioContextRef.current = ctx;
        console.log('🎛️ Using Howler AudioContext:', ctx.state);

        // Create analyser for visualizer (always needed)
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        // Get Howler's master gain node
        const masterGain = (Howler as any).masterGain;
        
        // If effects are disabled, just connect analyser for visualizers
        if (isBypassMode) {
          if (masterGain) {
            try {
              masterGain.disconnect();
            } catch (e) {
              // Already disconnected
            }
            // Simple path: masterGain -> analyser -> destination
            masterGain.connect(analyser);
            analyser.connect(ctx.destination);
            console.log('🎛️ Visualizer-only mode connected');
          }
          return; // Skip effects creation
        }

        // Create 10-band equalizer (only if effects enabled)
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

        // Connect full effects chain (only when effects are enabled)
        if (masterGain) {
          try {
            // Disconnect Howler's default routing safely
            masterGain.disconnect();
          } catch (e) {
            // Already disconnected or not connected
          }

          // Connect: masterGain -> analyser -> filters -> split (dry/wet) -> destination
          masterGain.connect(analyser);
          
          let currentNode: AudioNode = analyser;
          filters.forEach(filter => {
            currentNode.connect(filter);
            currentNode = filter;
          });

          // Dry path
          currentNode.connect(dryGain);
          dryGain.connect(ctx.destination);

          // Wet path (reverb)
          currentNode.connect(convolver);
          convolver.connect(wetGain);
          wetGain.connect(ctx.destination);

          console.log('🎛️ Full audio effects chain connected');
        }

      } catch (error) {
        console.error('❌ Error initializing audio effects:', error);
        setIsBypassMode(true);
      }
    };

    // Start initialization
    initEffects();
  }, []); // Only run once on mount

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
    if (isBypassMode) {
      console.warn('⚠️ Cannot set equalizer in native audio mode');
      return;
    }
    
    const gains = EQUALIZER_PRESETS[preset];
    equalizerRef.current.forEach((filter, index) => {
      filter.gain.value = gains[index];
    });
    setCurrentPreset(preset);
    localStorage.setItem('pocket-mp3-equalizer', preset);
  }, [isBypassMode]);

  const toggleReverb = useCallback((enabled?: boolean) => {
    if (isBypassMode) {
      console.warn('⚠️ Cannot toggle reverb in native audio mode');
      return;
    }
    
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
    Howler.rate(rate); // Set global playback rate for Howler
    localStorage.setItem('pocket-mp3-playback-rate', rate.toString());
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
    analyser: analyserRef.current,
    isBypassMode,
  };
};
