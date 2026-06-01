import { useEffect, useRef, useState, useCallback } from 'react';
import { Howler } from 'howler';
import { isIOSDevice } from '@/lib/utils';

export type EqualizerPreset = 'flat' | 'bass' | 'treble' | 'vocal' | 'rock' | 'pop' | 'jazz' | 'classical' | 'hiphop' | 'trap' | 'drill' | 'lofi' | 'electronic' | 'acoustic' | 'metal' | 'rnb';

export type EnhancerPreset = 'off' | 'studio' | 'live' | 'intimate' | 'custom';

// Boosted gain values so EQ presets are CLEARLY audible (Q is also lowered for wider effect)
const EQUALIZER_PRESETS: Record<EqualizerPreset, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [9, 7, 5, 3, 0, -2, -3, -3, -3, -3],
  treble: [-3, -3, -3, -2, 0, 3, 5, 7, 8, 8],
  vocal: [-2, -3, -3, 3, 6, 6, 5, 3, 0, -2],
  rock: [7, 5, 3, -2, -3, -2, 3, 5, 7, 7],
  pop: [-2, 3, 5, 5, 3, 0, -2, -2, -2, -2],
  jazz: [5, 3, 0, 3, 5, 5, 3, 3, 5, 5],
  classical: [5, 3, 0, 0, 0, 0, -2, -2, -2, -3],
  hiphop: [8, 6, 3, 2, -2, -2, 2, 3, 3, 5],
  trap: [10, 7, 3, 2, -2, -2, 0, 3, 5, 7],
  drill: [10, 8, 5, 0, -3, -2, 0, 3, 5, 7],
  lofi: [5, 3, 0, -2, 3, 5, 3, -2, -3, -5],
  electronic: [7, 5, 3, 0, -2, 3, 5, 7, 5, 3],
  acoustic: [6, 5, 2, 0, 3, 3, 3, 2, 0, -2],
  metal: [8, 6, 5, 3, -2, -3, 0, 5, 7, 8],
  rnb: [5, 6, 3, 2, -2, 3, 5, 3, 2, 0],
};

const ENHANCER_PRESETS: Record<Exclude<EnhancerPreset, 'off' | 'custom'>, { loudness: number; stereoWidth: number; bassBoost: number }> = {
  studio: { loudness: 0.5, stereoWidth: 0.3, bassBoost: 2 },
  live: { loudness: 0.7, stereoWidth: 0.6, bassBoost: 4 },
  intimate: { loudness: 0.3, stereoWidth: 0.2, bassBoost: 1 },
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

  // Sound enhancer refs
  const loudnessCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const loudnessGainRef = useRef<GainNode | null>(null);
  const bassEnhancerRef = useRef<BiquadFilterNode | null>(null);
  const stereoSplitterRef = useRef<ChannelSplitterNode | null>(null);
  const stereoMergerRef = useRef<ChannelMergerNode | null>(null);
  const stereoWidthGainLRef = useRef<GainNode | null>(null);
  const stereoWidthGainRRef = useRef<GainNode | null>(null);
  const enhancerBypassRef = useRef<GainNode | null>(null);
  const enhancerOutputRef = useRef<GainNode | null>(null);

  // FX Studio: pitch shifter (Jungle algorithm) + stereo panner + 8D LFO
  const pitchInputRef = useRef<GainNode | null>(null);
  const pitchOutputRef = useRef<GainNode | null>(null);
  const pitchDryGainRef = useRef<GainNode | null>(null);
  const pitchWetGainRef = useRef<GainNode | null>(null);
  const pitchModGainARef = useRef<GainNode | null>(null);
  const pitchModGainBRef = useRef<GainNode | null>(null);
  const stereoPannerRef = useRef<StereoPannerNode | null>(null);
  const panLfoRef = useRef<OscillatorNode | null>(null);
  const panLfoGainRef = useRef<GainNode | null>(null);

  // HTML5 source tracking
  const connectedElementsRef = useRef<WeakSet<HTMLMediaElement>>(new WeakSet());
  const html5SourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
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

  // Sound enhancer state
  const [enhancerPreset, setEnhancerPreset] = useState<EnhancerPreset>(() => {
    return (localStorage.getItem('pocket-mp3-enhancer-preset') as EnhancerPreset) || 'off';
  });
  const [loudnessAmount, setLoudnessAmount] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-loudness');
    return saved ? parseFloat(saved) : 0.5;
  });
  const [stereoWidth, setStereoWidth] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-stereo-width');
    return saved ? parseFloat(saved) : 0.3;
  });
  const [bassBoost, setBassBoost] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-bass-boost');
    return saved ? parseFloat(saved) : 2;
  });
  const [enhancerEnabled, setEnhancerEnabled] = useState(() => {
    return localStorage.getItem('pocket-mp3-enhancer-enabled') === 'true';
  });

  // FX Studio state
  const [pitchSemitones, setPitchSemitones] = useState(() => {
    const s = localStorage.getItem('pocket-mp3-pitch-semitones');
    return s ? parseFloat(s) : 0;
  });
  const [stereoPan, setStereoPan] = useState(() => {
    const s = localStorage.getItem('pocket-mp3-stereo-pan');
    return s ? parseFloat(s) : 0;
  });
  const [spatial8DEnabled, setSpatial8DEnabled] = useState(() => {
    return localStorage.getItem('pocket-mp3-8d-enabled') === 'true';
  });

  const initEffects = useCallback((): boolean => {
    if (isInitializedRef.current) return true;

    if (isIOS) {
      setIsBypassMode(true);
      isInitializedRef.current = true;
      setIsReady(true);
      return true;
    }

    try {
      if (!(Howler as any).usingWebAudio) {
        (Howler as any).usingWebAudio = true;
      }

      const ctx = Howler.ctx;
      const masterGain = (Howler as any).masterGain;
      
      if (!ctx || !masterGain) return false;
      
      if (ctx.state === 'suspended') ctx.resume();

      audioContextRef.current = ctx;
      console.log('🎛️ AudioContext initialized:', ctx.state);

      // Analyser
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.8;
      analyserRef.current = analyserNode;
      setAnalyser(analyserNode);

      // Visualizer source
      const vizSource = ctx.createGain();
      vizSource.gain.value = 1;
      visualizerSourceRef.current = vizSource;
      setVisualizerSource(vizSource);

      // Limiter — transparent safety net: only catches near-clipping, lets EQ boosts breathe
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 4;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      limiterRef.current = limiter;

      setIsBypassMode(false);

      // 10-band EQ
      const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      const filters = frequencies.map((freq) => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 0.7; // Wider, more audible band
        filter.gain.value = 0;
        return filter;
      });
      equalizerRef.current = filters;

      // Reverb
      const convolver = ctx.createConvolver();
      convolverRef.current = convolver;
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      dryGainRef.current = dryGain;
      wetGainRef.current = wetGain;
      const safeReverbAmount = reverbAmount * 0.5;
      wetGain.gain.value = reverbEnabled ? safeReverbAmount : 0;
      dryGain.gain.value = 1;

      const savedPresetGains = EQUALIZER_PRESETS[currentPreset];
      filters.forEach((filter, index) => {
        filter.gain.value = savedPresetGains[index];
      });

      // Impulse response
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

      // === Sound Enhancer Nodes ===
      
      // Loudness compressor + makeup gain
      const loudnessComp = ctx.createDynamicsCompressor();
      loudnessComp.threshold.value = -24;
      loudnessComp.knee.value = 12;
      loudnessComp.ratio.value = 4;
      loudnessComp.attack.value = 0.005;
      loudnessComp.release.value = 0.15;
      loudnessCompressorRef.current = loudnessComp;

      const loudnessGain = ctx.createGain();
      loudnessGain.gain.value = 1;
      loudnessGainRef.current = loudnessGain;

      // Bass enhancer (low-shelf filter at 100Hz)
      const bassEnh = ctx.createBiquadFilter();
      bassEnh.type = 'lowshelf';
      bassEnh.frequency.value = 100;
      bassEnh.gain.value = 0;
      bassEnhancerRef.current = bassEnh;

      // Stereo widener
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const gainL = ctx.createGain();
      const gainR = ctx.createGain();
      gainL.gain.value = 1;
      gainR.gain.value = 1;
      stereoSplitterRef.current = splitter;
      stereoMergerRef.current = merger;
      stereoWidthGainLRef.current = gainL;
      stereoWidthGainRRef.current = gainR;

      // Enhancer bypass/output nodes for clean switching
      const enhBypass = ctx.createGain();
      enhBypass.gain.value = 1;
      enhancerBypassRef.current = enhBypass;

      const enhOutput = ctx.createGain();
      enhOutput.gain.value = 1;
      enhancerOutputRef.current = enhOutput;

      // === FX Studio: Jungle pitch shifter ===
      // Two delay lines modulated by sawtooth oscillators, crossfaded for transparent pitch shifting.
      const pitchInput = ctx.createGain();
      const pitchOutput = ctx.createGain();
      const pitchDry = ctx.createGain();
      const pitchWet = ctx.createGain();
      pitchDry.gain.value = 1;
      pitchWet.gain.value = 0;
      pitchInputRef.current = pitchInput;
      pitchOutputRef.current = pitchOutput;
      pitchDryGainRef.current = pitchDry;
      pitchWetGainRef.current = pitchWet;

      const delayTime = 0.100;
      const fadeTime = 0.050;
      const bufferTime = 0.100;

      const createFadeBuffer = (activeTime: number, fade: number): AudioBuffer => {
        const length1 = activeTime * ctx.sampleRate;
        const length2 = (activeTime - 2 * fade) * ctx.sampleRate;
        const length = length1 + length2;
        const buf = ctx.createBuffer(1, length, ctx.sampleRate);
        const p = buf.getChannelData(0);
        const fadeLength = fade * ctx.sampleRate;
        const fadeIndex1 = fadeLength;
        const fadeIndex2 = length1 - fadeLength;
        for (let i = 0; i < length1; i++) {
          let v;
          if (i < fadeIndex1) v = Math.sqrt(i / fadeLength);
          else if (i >= fadeIndex2) v = Math.sqrt(1 - (i - fadeIndex2) / fadeLength);
          else v = 1;
          p[i] = v;
        }
        for (let i = length1; i < length; i++) p[i] = 0;
        return buf;
      };
      const createDelayTimeBuffer = (activeTime: number, fade: number, shiftUp: boolean): AudioBuffer => {
        const length1 = activeTime * ctx.sampleRate;
        const length2 = (activeTime - 2 * fade) * ctx.sampleRate;
        const length = length1 + length2;
        const buf = ctx.createBuffer(1, length, ctx.sampleRate);
        const p = buf.getChannelData(0);
        for (let i = 0; i < length1; i++) {
          if (shiftUp) p[i] = (length1 - i) / length1;
          else p[i] = i / length1;
        }
        for (let i = length1; i < length; i++) p[i] = 0;
        return buf;
      };

      const shiftDownBuffer = createDelayTimeBuffer(bufferTime, fadeTime, false);
      const shiftUpBuffer = createDelayTimeBuffer(bufferTime, fadeTime, true);
      const fadeBuffer = createFadeBuffer(bufferTime, fadeTime);

      // Two parallel branches A and B for crossfading
      const mod1 = ctx.createBufferSource(); mod1.buffer = shiftDownBuffer; mod1.loop = true;
      const mod2 = ctx.createBufferSource(); mod2.buffer = shiftDownBuffer; mod2.loop = true;
      const mod3 = ctx.createBufferSource(); mod3.buffer = shiftUpBuffer; mod3.loop = true;
      const mod4 = ctx.createBufferSource(); mod4.buffer = shiftUpBuffer; mod4.loop = true;

      const modGain1 = ctx.createGain(); modGain1.gain.value = 0;
      const modGain2 = ctx.createGain(); modGain2.gain.value = 0;
      pitchModGainARef.current = modGain1;
      pitchModGainBRef.current = modGain2;

      const delay1 = ctx.createDelay(); delay1.delayTime.value = delayTime;
      const delay2 = ctx.createDelay(); delay2.delayTime.value = delayTime;

      mod1.connect(modGain1); mod2.connect(modGain2);
      mod3.connect(modGain1); mod4.connect(modGain2);
      modGain1.connect(delay1.delayTime);
      modGain2.connect(delay2.delayTime);

      const fade1 = ctx.createBufferSource(); fade1.buffer = fadeBuffer; fade1.loop = true;
      const fade2 = ctx.createBufferSource(); fade2.buffer = fadeBuffer; fade2.loop = true;
      const mix1 = ctx.createGain(); mix1.gain.value = 0;
      const mix2 = ctx.createGain(); mix2.gain.value = 0;
      fade1.connect(mix1.gain); fade2.connect(mix2.gain);

      // wet path: pitchInput → delays → mix → pitchWet
      pitchInput.connect(delay1); pitchInput.connect(delay2);
      delay1.connect(mix1); delay2.connect(mix2);
      mix1.connect(pitchWet); mix2.connect(pitchWet);
      pitchInput.connect(pitchDry);
      pitchDry.connect(pitchOutput);
      pitchWet.connect(pitchOutput);

      // Start everything at staggered times
      const t = ctx.currentTime + 0.050;
      mod1.start(t);
      mod2.start(t + bufferTime - fadeTime);
      mod3.start(t);
      mod4.start(t + bufferTime - fadeTime);
      fade1.start(t);
      fade2.start(t + bufferTime - fadeTime);

      // === Stereo panner + 8D LFO ===
      const stereoPanner = ctx.createStereoPanner();
      stereoPanner.pan.value = 0;
      stereoPannerRef.current = stereoPanner;

      const panLfo = ctx.createOscillator();
      panLfo.frequency.value = 0.1; // 8D rotation speed
      const panLfoGain = ctx.createGain();
      panLfoGain.gain.value = 0; // off by default
      panLfo.connect(panLfoGain);
      panLfoGain.connect(stereoPanner.pan);
      panLfo.start();
      panLfoRef.current = panLfo;
      panLfoGainRef.current = panLfoGain;

      // === Connect the full chain ===
      try { masterGain.disconnect(); } catch (e) {}

      // masterGain → vizSource → analyser → EQ → enhancer chain → enhOutput
      //   → pitchInput → pitchOutput → stereoPanner → dry/wet reverb → limiter → destination
      masterGain.connect(vizSource);
      vizSource.connect(analyserNode);

      let currentNode: AudioNode = analyserNode;
      filters.forEach(filter => {
        currentNode.connect(filter);
        currentNode = filter;
      });
      currentNode.connect(enhBypass);

      enhBypass.connect(loudnessComp);
      loudnessComp.connect(loudnessGain);
      loudnessGain.connect(bassEnh);
      bassEnh.connect(splitter);
      splitter.connect(gainL, 0);
      splitter.connect(gainR, 1);
      gainL.connect(merger, 0, 0);
      gainR.connect(merger, 0, 1);
      merger.connect(enhOutput);

      enhOutput.connect(pitchInput);
      pitchOutput.connect(stereoPanner);

      stereoPanner.connect(dryGain);
      dryGain.connect(limiter);
      stereoPanner.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(limiter);
      limiter.connect(ctx.destination);

      // Apply saved enhancer settings
      if (enhancerEnabled) {
        applyEnhancerValues(loudnessAmount, stereoWidth, bassBoost, loudnessComp, loudnessGain, bassEnh, gainL, gainR);
      }

      console.log('🎛️ Full audio effects chain with enhancer connected');
      isInitializedRef.current = true;
      setIsReady(true);
      return true;
    } catch (error) {
      console.error('❌ Error initializing audio effects:', error);
      return false;
    }
  }, [currentPreset, isIOS, reverbAmount, reverbEnabled, enhancerEnabled, loudnessAmount, stereoWidth, bassBoost]);

  // Helper to apply enhancer values to nodes
  const applyEnhancerValues = (
    loudness: number, width: number, bass: number,
    comp?: DynamicsCompressorNode | null, gain?: GainNode | null,
    bassNode?: BiquadFilterNode | null, gL?: GainNode | null, gR?: GainNode | null
  ) => {
    const c = comp || loudnessCompressorRef.current;
    const g = gain || loudnessGainRef.current;
    const b = bassNode || bassEnhancerRef.current;
    const l = gL || stereoWidthGainLRef.current;
    const r = gR || stereoWidthGainRRef.current;

    if (c) {
      // Adjust compression threshold based on loudness amount (more aggressive)
      c.threshold.value = -30 + (1 - loudness) * 12; // -30 to -18
      c.ratio.value = 3 + loudness * 5; // 3 to 8
    }
    if (g) {
      // Makeup gain: noticeably louder, up to ~+6dB
      g.gain.value = 1 + loudness * 1.0; // 1.0 to 2.0 (~+6dB)
    }
    if (b) {
      // Bass boost: 0 to 8dB (more punch)
      b.gain.value = Math.min(bass * 1.3, 8);
    }
    if (l && r) {
      // Stereo widening: more pronounced (1.0 to 1.8)
      const widthFactor = 1 + width * 0.8;
      l.gain.value = widthFactor;
      r.gain.value = widthFactor;
    }
  };

  useEffect(() => {
    if (isIOS) {
      initEffects();
      return;
    }

    let initInterval: number | null = null;
    if (!initEffects()) {
      initInterval = window.setInterval(() => {
        initAttemptRef.current++;
        if (initEffects() && initInterval) {
          clearInterval(initInterval);
          initInterval = null;
        }
      }, 200);
    }

    const handleUserInteraction = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (!isInitializedRef.current) initEffects();
    };
    
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);
    // Resume context on fullscreen change & visibility change so effects stay active
    document.addEventListener('fullscreenchange', handleUserInteraction);
    document.addEventListener('visibilitychange', handleUserInteraction);

    return () => {
      if (initInterval) clearInterval(initInterval);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('fullscreenchange', handleUserInteraction);
      document.removeEventListener('visibilitychange', handleUserInteraction);
    };
  }, [initEffects, isIOS]);

  // Helper: ensure AudioContext is running before applying changes
  const ensureContextRunning = useCallback(() => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, []);

  // Apply equalizer preset changes
  useEffect(() => {
    if (equalizerRef.current.length === 0 || isBypassMode) return;
    ensureContextRunning();
    const gains = EQUALIZER_PRESETS[currentPreset];
    equalizerRef.current.forEach((filter, index) => {
      filter.gain.value = gains[index];
    });
  }, [currentPreset, isBypassMode, ensureContextRunning]);

  // Apply reverb changes
  useEffect(() => {
    if (!dryGainRef.current || !wetGainRef.current || isBypassMode) return;
    ensureContextRunning();
    const safeReverbAmount = reverbAmount * 0.6;
    if (reverbEnabled) {
      wetGainRef.current.gain.value = safeReverbAmount;
    } else {
      wetGainRef.current.gain.value = 0;
    }
    dryGainRef.current.gain.value = 1;
  }, [reverbEnabled, reverbAmount, isBypassMode, ensureContextRunning]);

  // Apply enhancer changes
  useEffect(() => {
    if (isBypassMode) return;
    ensureContextRunning();
    if (enhancerEnabled) {
      applyEnhancerValues(loudnessAmount, stereoWidth, bassBoost);
    } else {
      // Neutral pass-through when enhancer is off
      if (loudnessGainRef.current) loudnessGainRef.current.gain.value = 1;
      if (loudnessCompressorRef.current) {
        loudnessCompressorRef.current.threshold.value = 0;
        loudnessCompressorRef.current.ratio.value = 1;
      }
      if (bassEnhancerRef.current) bassEnhancerRef.current.gain.value = 0;
      if (stereoWidthGainLRef.current) stereoWidthGainLRef.current.gain.value = 1;
      if (stereoWidthGainRRef.current) stereoWidthGainRRef.current.gain.value = 1;
    }
  }, [enhancerEnabled, loudnessAmount, stereoWidth, bassBoost, isBypassMode, ensureContextRunning]);

  // Connect HTML5 audio element to effects chain (non-iOS only)
  const connectHtml5Source = useCallback((audioElement: HTMLMediaElement) => {
    if (isIOS || isBypassMode || !audioContextRef.current) return;
    if (connectedElementsRef.current.has(audioElement)) return;

    try {
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const source = ctx.createMediaElementSource(audioElement);
      html5SourceRef.current = source;
      connectedElementsRef.current.add(audioElement);

      // Connect source to the visualizer source (start of our chain)
      // But we need to disconnect masterGain path for this element
      // since createMediaElementSource takes over the audio output
      const vizSource = visualizerSourceRef.current;
      if (vizSource) {
        source.connect(vizSource);
      }

      console.log('🔗 HTML5 audio element connected to effects chain');
    } catch (error) {
      console.error('❌ Failed to connect HTML5 source:', error);
    }
  }, [isIOS, isBypassMode]);

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
      wetGainRef.current.gain.value = amount * 0.5;
    }
  }, [reverbEnabled, isBypassMode]);

  const updatePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    localStorage.setItem('pocket-mp3-playback-rate', rate.toString());
    window.dispatchEvent(new CustomEvent('playbackRateChange', { detail: rate }));
  }, []);

  const updateEnhancer = useCallback((settings: { loudness?: number; stereoWidth?: number; bassBoost?: number; enabled?: boolean; preset?: EnhancerPreset }) => {
    if (settings.loudness !== undefined) {
      setLoudnessAmount(settings.loudness);
      localStorage.setItem('pocket-mp3-loudness', settings.loudness.toString());
    }
    if (settings.stereoWidth !== undefined) {
      setStereoWidth(settings.stereoWidth);
      localStorage.setItem('pocket-mp3-stereo-width', settings.stereoWidth.toString());
    }
    if (settings.bassBoost !== undefined) {
      setBassBoost(settings.bassBoost);
      localStorage.setItem('pocket-mp3-bass-boost', settings.bassBoost.toString());
    }
    if (settings.enabled !== undefined) {
      setEnhancerEnabled(settings.enabled);
      localStorage.setItem('pocket-mp3-enhancer-enabled', settings.enabled.toString());
    }
    if (settings.preset !== undefined) {
      setEnhancerPreset(settings.preset);
      localStorage.setItem('pocket-mp3-enhancer-preset', settings.preset);
      if (settings.preset !== 'off' && settings.preset !== 'custom') {
        const presetValues = ENHANCER_PRESETS[settings.preset];
        setLoudnessAmount(presetValues.loudness);
        setStereoWidth(presetValues.stereoWidth);
        setBassBoost(presetValues.bassBoost);
        setEnhancerEnabled(true);
        localStorage.setItem('pocket-mp3-loudness', presetValues.loudness.toString());
        localStorage.setItem('pocket-mp3-stereo-width', presetValues.stereoWidth.toString());
        localStorage.setItem('pocket-mp3-bass-boost', presetValues.bassBoost.toString());
        localStorage.setItem('pocket-mp3-enhancer-enabled', 'true');
      } else if (settings.preset === 'off') {
        setEnhancerEnabled(false);
        localStorage.setItem('pocket-mp3-enhancer-enabled', 'false');
      }
    }
  }, []);

  const resetAllSettings = useCallback(() => {
    setEqualizer('flat');
    setReverbEnabled(false);
    setReverbAmount(0.3);
    updatePlaybackRate(1);
    updateEnhancer({ enabled: false, preset: 'off', loudness: 0.5, stereoWidth: 0.3, bassBoost: 2 });
    
    localStorage.removeItem('pocket-mp3-equalizer');
    localStorage.removeItem('pocket-mp3-reverb-enabled');
    localStorage.removeItem('pocket-mp3-reverb-amount');
    localStorage.removeItem('pocket-mp3-playback-rate');
    localStorage.removeItem('pocket-mp3-enhancer-preset');
    localStorage.removeItem('pocket-mp3-loudness');
    localStorage.removeItem('pocket-mp3-stereo-width');
    localStorage.removeItem('pocket-mp3-bass-boost');
    localStorage.removeItem('pocket-mp3-enhancer-enabled');
  }, [setEqualizer, updatePlaybackRate, updateEnhancer]);

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

  // === FX Studio: pitch shifter (semitones) ===
  // Jungle algorithm: delay modulation amount = (1 - 2^(semitones/12)) * delayTime
  const applyPitch = useCallback((semitones: number) => {
    const dry = pitchDryGainRef.current;
    const wet = pitchWetGainRef.current;
    const mg1 = pitchModGainARef.current;
    const mg2 = pitchModGainBRef.current;
    if (!dry || !wet || !mg1 || !mg2) return;
    if (Math.abs(semitones) < 0.05) {
      dry.gain.value = 1;
      wet.gain.value = 0;
      mg1.gain.value = 0;
      mg2.gain.value = 0;
      return;
    }
    // Pitch shift via varispeed delay (Jungle)
    const pitchRatio = Math.pow(2, semitones / 12);
    // Modulation amount (how much the delay sweeps): scale by ~0.1s buffer
    const delayDepth = Math.min(Math.abs(1 - pitchRatio) * 0.1, 0.1);
    mg1.gain.value = delayDepth;
    mg2.gain.value = delayDepth;
    dry.gain.value = 0;
    wet.gain.value = 1;
  }, []);

  useEffect(() => {
    if (isBypassMode) return;
    ensureContextRunning();
    applyPitch(pitchSemitones);
  }, [pitchSemitones, isBypassMode, applyPitch, ensureContextRunning, isReady]);

  // === Stereo pan + 8D ===
  useEffect(() => {
    if (isBypassMode) return;
    const panner = stereoPannerRef.current;
    const lfoGain = panLfoGainRef.current;
    if (!panner || !lfoGain) return;
    if (spatial8DEnabled) {
      lfoGain.gain.value = 1; // ±1 sweep
      panner.pan.value = 0;
    } else {
      lfoGain.gain.value = 0;
      panner.pan.value = Math.max(-1, Math.min(1, stereoPan));
    }
  }, [stereoPan, spatial8DEnabled, isBypassMode, isReady]);

  const updatePitch = useCallback((semitones: number) => {
    setPitchSemitones(semitones);
    localStorage.setItem('pocket-mp3-pitch-semitones', semitones.toString());
  }, []);
  const updateStereoPan = useCallback((pan: number) => {
    setStereoPan(pan);
    localStorage.setItem('pocket-mp3-stereo-pan', pan.toString());
  }, []);
  const toggle8DSpatial = useCallback((enabled?: boolean) => {
    setSpatial8DEnabled(prev => {
      const next = enabled ?? !prev;
      localStorage.setItem('pocket-mp3-8d-enabled', next.toString());
      return next;
    });
  }, []);

  return {
    setEqualizer,
    toggleReverb,
    updateReverbAmount,
    updatePlaybackRate,
    resetAllSettings,
    getAnalyserData,
    getWaveformData,
    connectHtml5Source,
    updateEnhancer,
    reverbEnabled,
    reverbAmount,
    playbackRate,
    currentPreset,
    analyser,
    visualizerSource,
    isBypassMode,
    isReady,
    enhancerEnabled,
    enhancerPreset,
    loudnessAmount,
    stereoWidth,
    bassBoost,
  };
};
