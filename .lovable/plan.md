## Plan: Audio FX Studio Panel

Add a new "Audio FX Studio" dialog accessible next to the existing Equalizer button, with three sections: style presets, FX sliders, and a Lo-Fi ambience mixer.

### 1. New hook `src/hooks/useAudioFXStudio.ts`

Manages pitch, tempo, panning, and ambience layers. Wires into the existing Web Audio chain built by `useAudioEffects.ts`.

- **Pitch Shift (semitones, -12 to +12)**: Implemented via a lightweight phase-vocoder using `AudioWorkletNode` if available, with a graceful fallback to `playbackRate` + inverse-rate granular resampling. To avoid distortion, route through a small `DelayNode` + `WaveShaperNode` soft-clip set to unity (no clipping at normal levels).
  - Pragmatic implementation: use the `soundtouchjs` AudioWorklet (already pure JS, no extra native deps) loaded dynamically. It supports independent pitch and tempo without artifacts. If load fails, fall back to coupled `Howler.rate()` (pitch+speed together) and surface a small "fallback mode" hint.
- **Playback Speed (BPM, expressed as 0.5x–2x or ±BPM offset)**: Drives SoundTouch `tempo` parameter independently of pitch. Persisted to `localStorage`.
- **3D Panning**: A `StereoPannerNode` and a `PannerNode` (HRTF) added after the enhancer/reverb merge, before the limiter. Used by the 8D preset to auto-rotate pan position.

### 2. Lo-Fi Ambience Mixer

A separate `GainNode` sub-mixer that runs in parallel with the music chain and feeds the limiter input.

- Three looped `AudioBufferSourceNode`s for **Vinyl Crackle**, **Soft Rain**, **Tape Hiss**.
- Source files added under `src/assets/ambience/` (small ~200KB MP3 loops each — generated/sourced as royalty-free white-noise + filter-based synthesis at build time if not bundled). Each gets a toggle (`Switch`) and a 0–100% volume `Slider`.
- State + volumes persisted to `localStorage` (`pocket-mp3-ambience-*`).
- Loops auto-start/stop with playback or run continuously per user toggle (default: only while a track is playing).

### 3. One-Click Style Presets (top of panel)

Three buttons that configure sliders + panning in one click:

| Preset | Speed | Pitch | Reverb | Pan | Ambience |
|---|---|---|---|---|---|
| Slowed & Reverb | 0.80x | -2 st | on, 70% | center | Vinyl 30% |
| Sped Up (Nightcore) | 1.25x | +3 st | off | center | none |
| 8D Spatial Audio | 1.00x | 0 st | on, 40% | auto-rotate 360° @ 0.1Hz via `PannerNode` LFO | none |

Each preset writes to the corresponding `useAudioFXStudio` setters and reverb controls in `useAudioEffects`.

### 4. New UI component `src/components/AudioFXStudio.tsx`

`Dialog`-based panel modeled on `EqualizerPanel.tsx`. Sections:

1. **Style Presets** — 3 large buttons in a grid.
2. **FX Studio** — Pitch slider (semitones, with -/0/+ ticks), Speed slider (0.5x–2x with BPM readout based on a configurable base BPM input, default 120).
3. **Lo-Fi Ambience Mixer** — 3 rows, each row = `Switch` + `Slider`.
4. **Reset** button.

Triggered by a new icon button (Sparkles/Sliders icon) placed next to the existing equalizer trigger in `MusicPlayer.tsx`.

### 5. Integration points

- `MusicPlayer.tsx`: render `<AudioFXStudio />` adjacent to the existing `<EqualizerPanel />`. Pass through `audioContext`, `limiterRef`, and current track playing state.
- `useAudioEffects.ts`: expose `audioContextRef` and `enhancerOutputRef` via the returned object so the FX Studio can insert its pitch/pan/ambience nodes between `enhancerOutput` and the existing reverb split.
- iOS bypass: when `isIOSDevice()` is true, disable FX Studio sliders (same UX as EQ) and show a small notice — only ambience loops remain available since they don't depend on the music's source node.

### 6. Files

| File | Action |
|---|---|
| `src/hooks/useAudioFXStudio.ts` | new |
| `src/hooks/useAudioEffects.ts` | expose refs needed for chain splice |
| `src/components/AudioFXStudio.tsx` | new |
| `src/components/MusicPlayer.tsx` | mount the new panel button |
| `src/assets/ambience/{vinyl,rain,hiss}.mp3` | new (small loops) |
| `package.json` | add `soundtouchjs` |

### Non-goals / safety

- No changes to streaming logic, sync, EQ presets, visualizer, or recording.
- No changes to existing reverb/enhancer math; the new chain inserts only when FX Studio sliders are non-default.
- Ambience loops respect the existing limiter so they cannot push the mix into clipping.
