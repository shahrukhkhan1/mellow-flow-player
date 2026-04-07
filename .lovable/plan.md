

## Plan: Audio Enhancement, Back Navigation Fix, and Effects Reliability

### Problem Summary
1. **Audio quality** — No sound enhancement beyond basic EQ presets; users want richer audio like Apple Music
2. **No back button from Favorites** — The "Back to All Songs" button exists but is likely not visible or accessible from within the playlist manager dialog
3. **Equalizer/effects not applying** — When streaming URLs use `html5: true`, audio bypasses the Web Audio effects chain entirely, so EQ/reverb have zero effect

---

### Plan

#### 1. Add Audio Enhancement (Sound Booster)

Add a **Loudness Enhancer** and **Stereo Widener** to the effects chain in `useAudioEffects.ts`:

- **Loudness Enhancer**: A `DynamicsCompressorNode` configured as a "makeup gain" compressor (low threshold, moderate ratio) followed by a `GainNode` for boost. This mimics Apple Music's "Sound Check" / loudness normalization — makes quiet parts louder without clipping.
- **Stereo Widener**: A mid-side processing technique using `ChannelSplitterNode` and `ChannelMergerNode` to widen the stereo image, giving a more immersive feel.
- **Bass Enhancer**: A low-shelf `BiquadFilterNode` at ~100Hz with adjustable gain for extra warmth.
- Add toggle controls and a boost slider to `EqualizerPanel.tsx` under a new "Sound Enhancer" section with presets like "Studio", "Live Concert", "Intimate".
- Save settings to localStorage like other effects.

#### 2. Fix "Back to All Songs" Visibility

The button currently only shows **above** the playlist toggle — users inside the playlist manager dialog or after clicking Favorites don't see it clearly.

- In `PlaylistManager.tsx`, after loading favorites, pass a callback or set a flag so the parent knows it's a filtered view.
- Add a prominent **"← Back to All Songs"** button **inside the playlist area** (the expanded playlist section), not just above it, so it's visible when the playlist is open.
- Also add it as a banner at the top of the track list when `isFilteredView` is true, with a distinct style (e.g., amber/yellow background) so it's unmissable.

#### 3. Fix Effects Not Working on Streaming Tracks

The root cause: streaming URLs use `html5: true` which creates an `<audio>` element that **does not route through Howler's masterGain** or the Web Audio effects chain.

- In `useAudioPlayer.ts`, after a track loads with `html5: true` on **non-iOS** devices, use `createMediaElementSource()` to connect the HTML5 audio element to the existing effects chain.
- Add a new method in `useAudioEffects.ts` called `connectHtml5Source(audioElement)` that:
  1. Creates a `MediaElementAudioSourceNode` from the `<audio>` element
  2. Disconnects the existing masterGain chain temporarily
  3. Routes: `mediaElementSource → vizSource → analyser → EQ filters → dry/wet → limiter → destination`
- Track which elements have already been connected (a `MediaElementAudioSourceNode` can only be created once per element) using a `WeakSet`.
- On iOS, skip this entirely to preserve background playback (per existing constraint).

#### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useAudioEffects.ts` | Add loudness compressor, stereo widener, bass enhancer nodes; expose `connectHtml5Source()` method; add new state/controls |
| `src/components/EqualizerPanel.tsx` | Add "Sound Enhancer" section with loudness boost toggle/slider, stereo width slider, bass boost slider, and enhancement presets |
| `src/hooks/useAudioPlayer.ts` | After Howl loads with html5=true on non-iOS, call `connectHtml5Source()` to route through effects chain |
| `src/components/MusicPlayer.tsx` | Move "Back to All Songs" button into the playlist track list area; make it a sticky banner when `isFilteredView` is true |

