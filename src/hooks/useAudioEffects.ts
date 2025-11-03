import { useEffect, useRef, useState, useCallback } from 'react';

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

export const useAudioEffects = (audioElement: HTMLAudioElement | null) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const equalizerRef = useRef<BiquadFilterNode[]>([]);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isConnectedRef = useRef(false);
  
  const [reverbEnabled, setReverbEnabled] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-reverb-enabled');
    return saved !== null ? saved === 'true' : true; // Default to true
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
  const [isBypassMode, setIsBypassMode] = useState(false);
  const effectSettingsRef = useRef({
    preset: 'flat' as EqualizerPreset,
    reverb: false,
    reverbAmount: 0.5
  });
  const isDisconnectedRef = useRef(false);

  // Initialize Audio Context and nodes ONCE
  useEffect(() => {
    if (!audioElement) return;

    // Check if already initialized to prevent recreating source
    if (sourceRef.current && audioContextRef.current) {
      console.log('🎛️ Audio context already initialized');
      return;
    }

    // CRITICAL FIX for iOS: Don't use Web Audio API at all on iOS
    // iOS suspends AudioContext in background, blocking playback
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS) {
      console.log('🍎 iOS detected - using native audio (no Web Audio API for background compatibility)');
      setIsBypassMode(true);
      // Don't create AudioContext on iOS - use native audio element
      return;
    }

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      // Create source - this can only be done ONCE per audio element
      const source = audioContext.createMediaElementSource(audioElement);
      sourceRef.current = source;
      
      console.log('🎛️ Audio context initialized:', audioContext.state);

    // Create analyser for visualizer
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    // Create 10-band equalizer
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const filters = frequencies.map((freq) => {
      const filter = audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });
    equalizerRef.current = filters;

    // Create reverb (convolver)
    const convolver = audioContext.createConvolver();
    convolverRef.current = convolver;

    // Create gain nodes
    const dryGain = audioContext.createGain();
    const wetGain = audioContext.createGain();
    const masterGain = audioContext.createGain();
    gainRef.current = masterGain;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;

    // Initialize based on saved settings (reduce reverb to prevent distortion)
    const safeReverbAmount = reverbAmount * 0.5; // Scale down reverb
    wetGain.gain.value = reverbEnabled ? safeReverbAmount : 0;
    dryGain.gain.value = 1; // Keep dry signal at full volume

    // Apply saved equalizer preset
    const savedPresetGains = EQUALIZER_PRESETS[currentPreset];
    filters.forEach((filter, index) => {
      filter.gain.value = savedPresetGains[index];
    });

    // Create impulse response for reverb
    const createImpulseResponse = (duration: number, decay: number) => {
      const sampleRate = audioContext.sampleRate;
      const length = sampleRate * duration;
      const impulse = audioContext.createBuffer(2, length, sampleRate);
      
      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
      }
      return impulse;
    };

    convolver.buffer = createImpulseResponse(2, 2);

    // Connect nodes: source -> analyser -> filters -> split (dry/wet) -> master -> destination
    source.connect(analyser);
    
    let currentNode: AudioNode = analyser;
    filters.forEach(filter => {
      currentNode.connect(filter);
      currentNode = filter;
    });

    // Dry path
    currentNode.connect(dryGain);
    dryGain.connect(masterGain);

    // Wet path (reverb)
    currentNode.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(masterGain);

      masterGain.connect(audioContext.destination);
      isConnectedRef.current = true;

      console.log('🎛️ Audio nodes connected successfully');

      // Resume AudioContext on user interaction (iOS requirement)
      const resumeContext = async () => {
        if (audioContext.state !== 'running') {
          try {
            await audioContext.resume();
            console.log('✅ AudioContext resumed:', audioContext.state);
          } catch (err) {
            console.error('❌ Failed to resume AudioContext:', err);
          }
        }
      };
      
      // iOS requires explicit user interaction - attach to multiple events
      const interactionEvents = ['touchstart', 'touchend', 'click', 'play'];
      interactionEvents.forEach(event => {
        if (event === 'play') {
          audioElement.addEventListener(event, resumeContext);
        } else {
          document.addEventListener(event, resumeContext, { once: true, passive: true });
        }
      });
      
      // Complete Web Audio API disconnect for iOS background playback
      const disconnectWebAudio = async () => {
        if (isDisconnectedRef.current || !audioContext || !source) return;
        
        try {
          console.log('📱 Disconnecting Web Audio API for background playback...');
          
          // Store current settings
          effectSettingsRef.current = {
            preset: currentPreset,
            reverb: reverbEnabled,
            reverbAmount: reverbAmount
          };
          
          // Disconnect entire audio graph
          source.disconnect();
          
          // Connect audio element directly to destination (bypass all effects)
          source.connect(audioContext.destination);
          
          // Suspend context to free resources
          if (audioContext.state === 'running') {
            await audioContext.suspend();
          }
          
          isDisconnectedRef.current = true;
          setIsBypassMode(true);
          console.log('✅ Web Audio API disconnected - native audio active');
        } catch (err) {
          console.error('❌ Failed to disconnect Web Audio API:', err);
        }
      };
      
      const reconnectWebAudio = async () => {
        if (!isDisconnectedRef.current || !audioContext || !source) return;
        
        try {
          console.log('📱 Reconnecting Web Audio API for foreground...');
          
          // Resume context first
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          
          // Disconnect from destination
          source.disconnect();
          
          // Reconnect full audio graph: source -> analyser -> filters -> dry/wet split -> master -> destination
          source.connect(analyser);
          
          let currentNode: AudioNode = analyser;
          filters.forEach(filter => {
            currentNode.connect(filter);
            currentNode = filter;
          });
          
          // Dry path
          currentNode.connect(dryGain);
          dryGain.connect(masterGain);
          
          // Wet path (reverb)
          currentNode.connect(convolver);
          convolver.connect(wetGain);
          wetGain.connect(masterGain);
          
          masterGain.connect(audioContext.destination);
          
          // Restore saved settings
          const savedPresetGains = EQUALIZER_PRESETS[effectSettingsRef.current.preset];
          filters.forEach((filter, index) => {
            filter.gain.value = savedPresetGains[index];
          });
          
          const safeReverbAmount = effectSettingsRef.current.reverbAmount * 0.5;
          wetGainRef.current.gain.value = effectSettingsRef.current.reverb ? safeReverbAmount : 0;
          dryGainRef.current.gain.value = 1;
          
          isDisconnectedRef.current = false;
          setIsBypassMode(false);
          console.log('✅ Web Audio API reconnected - effects restored');
        } catch (err) {
          console.error('❌ Failed to reconnect Web Audio API:', err);
        }
      };
      
      // Enhanced visibility change handler with full disconnect/reconnect
      const handleVisibilityChange = async () => {
        const isHidden = document.visibilityState === 'hidden';
        
        if (isHidden && !audioElement.paused) {
          console.log('📱 App backgrounded - disconnecting Web Audio API');
          await disconnectWebAudio();
        } else if (!isHidden) {
          console.log('📱 App foregrounded - reconnecting Web Audio API');
          await reconnectWebAudio();
        }
      };
      
      // Also handle page freeze/resume for iOS
      const handlePageFreeze = () => {
        if (!audioElement.paused) {
          disconnectWebAudio();
        }
      };
      
      const handlePageResume = () => {
        reconnectWebAudio();
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('freeze', handlePageFreeze);
      document.addEventListener('resume', handlePageResume);

      return () => {
        audioElement.removeEventListener('play', resumeContext);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.removeEventListener('freeze', handlePageFreeze);
        document.removeEventListener('resume', handlePageResume);
        
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
        sourceRef.current = null;
        audioContextRef.current = null;
        isConnectedRef.current = false;
        isDisconnectedRef.current = false;
      };
    } catch (error) {
      console.error('❌ Error initializing audio context:', error);
    }
  }, [audioElement]);

  // Apply equalizer preset changes without recreating audio context
  useEffect(() => {
    if (equalizerRef.current.length === 0) return;
    
    const gains = EQUALIZER_PRESETS[currentPreset];
    equalizerRef.current.forEach((filter, index) => {
      filter.gain.value = gains[index];
    });
  }, [currentPreset]);

  // Apply reverb changes without recreating audio context
  useEffect(() => {
    if (!dryGainRef.current || !wetGainRef.current) return;
    
    // Scale down reverb to prevent distortion
    const safeReverbAmount = reverbAmount * 0.5;
    
    if (reverbEnabled) {
      wetGainRef.current.gain.value = safeReverbAmount;
    } else {
      wetGainRef.current.gain.value = 0;
    }
    // Keep dry signal at full volume always
    dryGainRef.current.gain.value = 1;
  }, [reverbEnabled, reverbAmount]);

  const setEqualizer = useCallback((preset: EqualizerPreset) => {
    const gains = EQUALIZER_PRESETS[preset];
    equalizerRef.current.forEach((filter, index) => {
      filter.gain.value = gains[index];
    });
    setCurrentPreset(preset);
    localStorage.setItem('pocket-mp3-equalizer', preset);
  }, []);

  const toggleReverb = useCallback((enabled?: boolean) => {
    const newState = enabled ?? !reverbEnabled;
    setReverbEnabled(newState);
    localStorage.setItem('pocket-mp3-reverb-enabled', newState.toString());
    
    // Update gain nodes (scaled down to prevent distortion)
    if (dryGainRef.current && wetGainRef.current) {
      const safeReverbAmount = reverbAmount * 0.5;
      wetGainRef.current.gain.value = newState ? safeReverbAmount : 0;
      dryGainRef.current.gain.value = 1; // Keep dry signal at full
    }
  }, [reverbEnabled, reverbAmount]);

  const updateReverbAmount = useCallback((amount: number) => {
    setReverbAmount(amount);
    localStorage.setItem('pocket-mp3-reverb-amount', amount.toString());
    
    // Update gain nodes if reverb is enabled (scaled down)
    if (reverbEnabled && wetGainRef.current) {
      const safeReverbAmount = amount * 0.5;
      wetGainRef.current.gain.value = safeReverbAmount;
    }
  }, [reverbEnabled]);

  const updatePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioElement) {
      audioElement.playbackRate = rate;
    }
    localStorage.setItem('pocket-mp3-playback-rate', rate.toString());
  }, [audioElement]);

  const resetAllSettings = useCallback(() => {
    // Reset to defaults
    setEqualizer('flat');
    setReverbEnabled(false);
    setReverbAmount(0.3);
    updatePlaybackRate(1);
    
    // Clear localStorage
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
