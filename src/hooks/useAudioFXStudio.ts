import { useCallback, useEffect, useRef, useState, RefObject } from 'react';
import { isIOSDevice } from '@/lib/utils';

export type AmbienceLayer = 'vinyl' | 'rain' | 'hiss';

export type FXStylePreset = 'slowed-reverb' | 'nightcore' | '8d-spatial';

interface AmbienceState {
  enabled: boolean;
  volume: number; // 0..1
}

const DEFAULT_AMBIENCE: Record<AmbienceLayer, AmbienceState> = {
  vinyl: { enabled: false, volume: 0.3 },
  rain: { enabled: false, volume: 0.3 },
  hiss: { enabled: false, volume: 0.2 },
};

const loadAmbience = (): Record<AmbienceLayer, AmbienceState> => {
  try {
    const raw = localStorage.getItem('pocket-mp3-ambience');
    if (raw) return { ...DEFAULT_AMBIENCE, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_AMBIENCE;
};

// Procedural ambience buffer generators (4s loops)
const generateVinylCrackle = (ctx: AudioContext): AudioBuffer => {
  const dur = 4;
  const buf = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      // sparse pops + low background hiss
      const pop = Math.random() < 0.0008 ? (Math.random() - 0.5) * 0.8 : 0;
      const hiss = (Math.random() - 0.5) * 0.05;
      d[i] = pop + hiss;
    }
  }
  return buf;
};

const generateRain = (ctx: AudioContext): AudioBuffer => {
  const dur = 4;
  const buf = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // Filtered pink-ish noise (one-pole lowpass on white noise)
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.92 + white * 0.08;
      d[i] = last * 1.4;
    }
  }
  return buf;
};

const generateTapeHiss = (ctx: AudioContext): AudioBuffer => {
  const dur = 4;
  const buf = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // Highpass-ish white noise + slow LFO breathing
    let prev = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      const hp = white - prev * 0.5;
      prev = white;
      const breath = 0.7 + 0.3 * Math.sin((i / d.length) * Math.PI * 2 * 0.3);
      d[i] = hp * 0.18 * breath;
    }
  }
  return buf;
};

interface FXStudioParams {
  audioContextRef: RefObject<AudioContext | null>;
  limiterRef: RefObject<DynamicsCompressorNode | null>;
  isBypassMode: boolean;
  // injected setters from useAudioEffects
  updatePitch: (semitones: number) => void;
  updatePlaybackRate: (rate: number) => void;
  toggleReverb: (enabled?: boolean) => void;
  updateReverbAmount: (amount: number) => void;
  toggle8DSpatial: (enabled?: boolean) => void;
  updateStereoPan: (pan: number) => void;
}

export const useAudioFXStudio = ({
  audioContextRef,
  limiterRef,
  isBypassMode,
  updatePitch,
  updatePlaybackRate,
  toggleReverb,
  updateReverbAmount,
  toggle8DSpatial,
  updateStereoPan,
}: FXStudioParams) => {
  const isIOS = isIOSDevice();

  // BPM base for the speed slider's BPM readout
  const [baseBPM, setBaseBPM] = useState<number>(() => {
    const s = localStorage.getItem('pocket-mp3-fx-base-bpm');
    return s ? parseInt(s, 10) : 120;
  });

  const [ambience, setAmbience] = useState<Record<AmbienceLayer, AmbienceState>>(loadAmbience);

  const sourcesRef = useRef<Record<AmbienceLayer, AudioBufferSourceNode | null>>({
    vinyl: null, rain: null, hiss: null,
  });
  const gainsRef = useRef<Record<AmbienceLayer, GainNode | null>>({
    vinyl: null, rain: null, hiss: null,
  });
  const buffersRef = useRef<Partial<Record<AmbienceLayer, AudioBuffer>>>({});
  const startedRef = useRef(false);

  const ensureBuffers = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (!buffersRef.current.vinyl) buffersRef.current.vinyl = generateVinylCrackle(ctx);
    if (!buffersRef.current.rain) buffersRef.current.rain = generateRain(ctx);
    if (!buffersRef.current.hiss) buffersRef.current.hiss = generateTapeHiss(ctx);
  }, [audioContextRef]);

  const startLayer = useCallback((layer: AmbienceLayer, volume: number) => {
    const ctx = audioContextRef.current;
    const limiter = limiterRef.current;
    if (!ctx || !limiter) return;
    ensureBuffers();
    // Stop existing
    try { sourcesRef.current[layer]?.stop(); } catch {}
    try { sourcesRef.current[layer]?.disconnect(); } catch {}
    try { gainsRef.current[layer]?.disconnect(); } catch {}

    const src = ctx.createBufferSource();
    src.buffer = buffersRef.current[layer]!;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(limiter);
    src.start();
    sourcesRef.current[layer] = src;
    gainsRef.current[layer] = g;
  }, [audioContextRef, limiterRef, ensureBuffers]);

  const stopLayer = useCallback((layer: AmbienceLayer) => {
    try { sourcesRef.current[layer]?.stop(); } catch {}
    try { sourcesRef.current[layer]?.disconnect(); } catch {}
    try { gainsRef.current[layer]?.disconnect(); } catch {}
    sourcesRef.current[layer] = null;
    gainsRef.current[layer] = null;
  }, []);

  // Sync ambience state to audio graph
  useEffect(() => {
    if (isBypassMode || isIOS) return;
    if (!audioContextRef.current || !limiterRef.current) return;
    (Object.keys(ambience) as AmbienceLayer[]).forEach(layer => {
      const { enabled, volume } = ambience[layer];
      const existingGain = gainsRef.current[layer];
      if (enabled) {
        if (!sourcesRef.current[layer]) {
          startLayer(layer, volume);
        } else if (existingGain) {
          existingGain.gain.value = volume;
        }
      } else {
        if (sourcesRef.current[layer]) stopLayer(layer);
      }
    });
    startedRef.current = true;
    try { localStorage.setItem('pocket-mp3-ambience', JSON.stringify(ambience)); } catch {}
  }, [ambience, isBypassMode, isIOS, audioContextRef, limiterRef, startLayer, stopLayer]);

  const setAmbienceLayer = useCallback((layer: AmbienceLayer, patch: Partial<AmbienceState>) => {
    setAmbience(prev => ({ ...prev, [layer]: { ...prev[layer], ...patch } }));
  }, []);

  const updateBaseBPM = useCallback((bpm: number) => {
    setBaseBPM(bpm);
    localStorage.setItem('pocket-mp3-fx-base-bpm', bpm.toString());
  }, []);

  const applyStylePreset = useCallback((preset: FXStylePreset) => {
    switch (preset) {
      case 'slowed-reverb':
        updatePlaybackRate(0.8);
        updatePitch(-2);
        toggleReverb(true);
        updateReverbAmount(0.7);
        toggle8DSpatial(false);
        updateStereoPan(0);
        setAmbience(prev => ({
          ...prev,
          vinyl: { enabled: true, volume: 0.3 },
          rain: { enabled: false, volume: prev.rain.volume },
          hiss: { enabled: false, volume: prev.hiss.volume },
        }));
        break;
      case 'nightcore':
        updatePlaybackRate(1.25);
        updatePitch(3);
        toggleReverb(false);
        toggle8DSpatial(false);
        updateStereoPan(0);
        setAmbience(prev => ({
          ...prev,
          vinyl: { enabled: false, volume: prev.vinyl.volume },
          rain: { enabled: false, volume: prev.rain.volume },
          hiss: { enabled: false, volume: prev.hiss.volume },
        }));
        break;
      case '8d-spatial':
        updatePlaybackRate(1);
        updatePitch(0);
        toggleReverb(true);
        updateReverbAmount(0.4);
        toggle8DSpatial(true);
        break;
    }
  }, [updatePlaybackRate, updatePitch, toggleReverb, updateReverbAmount, toggle8DSpatial, updateStereoPan]);

  return {
    ambience,
    setAmbienceLayer,
    baseBPM,
    updateBaseBPM,
    applyStylePreset,
    isFXDisabled: isIOS || isBypassMode,
  };
};
