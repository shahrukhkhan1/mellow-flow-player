## Plan

1. **Fix security warnings**
   - Enable leaked-password protection in the backend auth settings.
   - Add server-side display-name validation in a new migration:
     - trim whitespace
     - cap length
     - fallback to `User` when blank
     - add a database constraint so invalid names cannot be stored
   - Add matching frontend validation in the signup form so users get immediate feedback.

2. **Remove verbose production logging**
   - Add a small client logger utility that only writes debug logs in development.
   - Replace sensitive/noisy client `console.log`, `console.warn`, and `console.error` calls in player, sync, search, recording, startup, and utility code with the gated logger.
   - Keep user-facing errors as toasts, but avoid exposing internal URLs, track paths, sync details, or stack traces in production console output.

3. **Prevent duplicate parallel playback across screens**
   - Refactor the audio player into a single locked playback lifecycle:
     - stop/unload the previous Howl before creating a new one
     - ignore stale play/load callbacks from old audio instances
     - add a switching/loading lock so rapid navigation or Search → Player → Stats cannot spawn parallel playback
   - Keep the current track state, lock-screen controls, shuffle history, resume position, and external-stream bypass behavior intact.
   - Make Stats navigation preserve the same player state instead of creating conflicting audio when returning.

4. **Fix cross-device sync reliability**
   - Add missing backend table grants for existing music sync tables so authenticated device sync can read/write consistently.
   - Simplify sync flow so a manual/auto sync performs one clear pass:
     - check local vs cloud
     - upload missing local tracks
     - download missing cloud tracks
     - reload local IndexedDB playlist once
   - Add a sync lock to prevent overlapping syncs from multiple clicks, auth changes, or background effects.
   - Improve progress/error handling so partial upload/download failures are visible and don’t leave the app stuck in “syncing”.

5. **Verification**
   - Run the security scan again and mark the three findings fixed once confirmed.
   - Verify playback through Search → Player → Stats → Player does not duplicate audio.
   - Verify sync with a signed-in session can upload/download without permission errors and refreshes the local playlist correctly.