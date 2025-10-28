import { useEffect, useRef, useState, useCallback } from 'react';

export type EqualizerPreset = 'flat' | 'bass' | 'treble' | 'vocal' | 'rock' | 'pop' | 'jazz' | 'classical' | 'hiphop' | 'trap' | 'drill' | 'lofi';

const EQUALIZER_PRESETS: Record<EqualizerPreset, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [8, 6, 4, 2, 0, -2, -4, -4, -4, -4],
  treble: [-4, -4, -4, -2, 0, 2, 4, 6, 8, 8],
  vocal: [-2, -4, -4, 2, 6, 6, 4, 2, 0, -2],
  rock: [6, 4, 2, -2, -4, -2, 2, 4, 6, 6],
  pop: [-2, 2, 4, 4, 2, 0, -2, -2, -2, -2],
  jazz: [4, 2, 0, 2, 4, 4, 2, 2, 4, 4],
  classical: [4, 2, 0, 0, 0, 0, -2, -2, -2, -4],
  hiphop: [8, 6, 2, 1, -1, -1, 1, 2, 3, 4],
  trap: [9, 7, 3, 1, -2, -2, 0, 2, 4, 5],
  drill: [10, 8, 4, 0, -3, -2, 0, 3, 5, 6],
  lofi: [4, 2, 0, -2, 2, 4, 2, -2, -4, -6],
};

export const useAudioEffects = (audioElement: HTMLAudioElement | null) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const equalizerRef = useRef<BiquadFilterNode[]>([]);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [reverbAmount, setReverbAmount] = useState(0.5);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentPreset, setCurrentPreset] = useState<EqualizerPreset>('flat');

  // Initialize Audio Context and nodes
  useEffect(() => {
    if (!audioElement) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    // Create source
    const source = audioContext.createMediaElementSource(audioElement);
    sourceRef.current = source;

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

    wetGain.gain.value = 0;
    dryGain.gain.value = 1;

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

    return () => {
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [audioElement]);

  const setEqualizer = useCallback((preset: EqualizerPreset) => {
    const gains = EQUALIZER_PRESETS[preset];
    equalizerRef.current.forEach((filter, index) => {
      filter.gain.value = gains[index];
    });
    setCurrentPreset(preset);
  }, []);

  const toggleReverb = useCallback((enabled?: boolean) => {
    const newState = enabled ?? !reverbEnabled;
    setReverbEnabled(newState);
    
    if (audioContextRef.current) {
      const wetGain = audioContextRef.current.createGain();
      wetGain.gain.value = newState ? reverbAmount : 0;
    }
  }, [reverbEnabled, reverbAmount]);

  const updateReverbAmount = useCallback((amount: number) => {
    setReverbAmount(amount);
    if (reverbEnabled && audioContextRef.current) {
      // Update wet gain based on amount
    }
  }, [reverbEnabled]);

  const updatePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioElement) {
      audioElement.playbackRate = rate;
    }
  }, [audioElement]);

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
    getAnalyserData,
    getWaveformData,
    reverbEnabled,
    reverbAmount,
    playbackRate,
    currentPreset,
    analyser: analyserRef.current,
  };
};
