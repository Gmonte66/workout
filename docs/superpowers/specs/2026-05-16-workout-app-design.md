# Workout App — Design

**Date:** 2026-05-16
**Status:** Approved, building.

## Goal

A personal, offline, $0 workout app the author can install on his iPhone and use mid-workout. Sets-and-reps tracking with per-set editable reps/weight, an audio cue between sets, and a real lockdown of the phone during use.

## Constraints

- Single user: the author.
- iPhone (iOS 17+) is the only target device.
- Zero recurring cost: no domain, no paid hosting, no third-party services.
- No remote storage. Data lives in the installed PWA's localStorage container.
- "Incredibly simple": no framework, no build step, no dependencies. The whole app must be readable in one sitting.

## Architecture

Stack: plain HTML + CSS + vanilla JS. No npm, no bundler, no transpile step. Deployed by `git push` to GitHub Pages.

File layout:

```
index.html               # single page; each screen is a <section data-screen="…">
style.css                # mobile-first, dark theme
app.js                   # state + tiny router + screen renderers
manifest.webmanifest     # PWA install metadata
service-worker.js        # cache-first offline shell
apple-touch-icon.png     # 180×180
icons/icon-192.png
icons/icon-512.png
```

Hosting: GitHub Pages, public repo, project page at `https://<user>.github.io/workout/`. `manifest.webmanifest` scope and `start_url` are `/workout/`. Service worker registered at `/workout/sw.js` (controlled scope = subpath). Service worker file is served with `Cache-Control: no-cache` so the registered worker can update on next visit.

iOS install: Safari → Share → Add to Home Screen. Launches fullscreen via `display: standalone` plus legacy `<meta name="apple-mobile-web-app-capable" content="yes">`. Status bar styled black-translucent.

Lockdown during a workout:
- `navigator.wakeLock.request('screen')` is requested on workout start; re-requested on every `visibilitychange` because Safari releases the lock on background.
- User triple-clicks the side button to enable iOS Guided Access. This is manual every workout; the app reminds them on the Workout Detail screen.

Storage durability:
- `navigator.storage.persist()` is called on every app launch to reduce non-use eviction.
- Installed PWA storage is isolated from Safari's container as of iOS 16.4+, so Safari "Clear History" does not affect the app.
- Settings → Export All Data and Settings → Import All Data are the user's escape hatch against accidental Delete App / new phone.

## Data model

### Workout JSON (pasted into the app)

```json
{
  "version": 1,
  "id": "push-day-v1",
  "name": "Push Day",
  "unit": "lb",
  "exercises": [
    {
      "id": "bench-press",
      "name": "Bench Press",
      "sets": 3,
      "reps": 10,
      "weight": 135,
      "rest": 90,
      "notes": "tempo: slow eccentric"
    }
  ]
}
```

Required fields: workout `version`, `id`, `name`, `exercises`. Per exercise: `id`, `name`, `sets`, `reps`.
Optional fields: workout `unit` (default `lb`). Per exercise: `weight`, `rest`, `notes`.

Behavior of optional fields:
- `weight` missing → bodyweight; no weight UI on the active-set screen.
- `rest` missing or 0 → skip the rest screen; advance straight to next set.
- `notes` missing → notes panel hidden.

Workout `id` is the library key. Exercise `id` is the stable key history is matched on; renames of `name` do not break history.

### localStorage keys

| Key                   | Shape                                                              | Purpose                                                                                                          |
| --------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `workout.library`     | `{ [workoutId]: WorkoutJSON }`                                     | All imported workouts.                                                                                           |
| `workout.active`      | `ActiveSession \| null`                                            | The in-progress workout. Lets the user resume on relaunch. Kept for one workout's grace period after completion. |
| `workout.history`     | `CompletedSession[]`                                               | Append-only log, newest-last, of every completed workout session.                                                |
| `workout.lastExport`  | `number` (timestamp)                                               | When the user last copied an export blob. Drives the "back up your data" banner.                                 |
| `workout.schema`      | `number`                                                           | Schema version of the localStorage shape. Currently `1`.                                                         |

ActiveSession shape:

```js
{
  workoutId: "push-day-v1",
  startedAt: 1715900000000,
  exerciseIndex: 2,        // 0-based pointer into exercises[]
  setIndex: 1,             // 0-based pointer; how many sets are completed for the current exercise
  setsLog: [               // every completed set in this session
    { exerciseId, setNumber, reps, weight, completedAt }
  ],
  lastWeightByExercise: {  // drives the "carry weight forward" rule
    [exerciseId]: number
  },
  restEndsAt: 1715900090000 | null  // timestamp the current rest will end; null when not resting
}
```

CompletedSession is `ActiveSession` plus `finishedAt`, minus `restEndsAt`.

### Defaults during a workout

- First set of an exercise:
  - `reps` = `exercise.reps` (plan).
  - `weight` = `lastWeightByExercise[id]` if set this session, else `exercise.weight` if defined, else blank.
- Subsequent sets:
  - `reps` = `exercise.reps` (plan).
  - `weight` = last `weight` the user logged on the previous set of this same exercise this session.
- Tap pencil icon on reps or weight → inline numeric keypad → save updates that set's logged value and (for weight) `lastWeightByExercise[id]`.

The "carry weight forward" rule assumes straight sets. Drop sets / pyramids work via per-set manual override.

### Derived data

- "Last time" hint on active-set screen: walk `workout.history` newest-to-oldest; first entry whose `setsLog` contains the current `exerciseId` wins. Show the last logged set's reps + weight from that session. Hidden if no match.
- Progress chip: `${exerciseIndex + 1} / ${exercises.length} · Set ${setIndex + 1} / ${exercises[exerciseIndex].sets}`.

## Screens

A tiny router toggles which `<section>` is visible. State changes call `render()`. The browser back button maps to `history.back()`.

### Home

- App title.
- List of workouts in `workout.library`. Each row: name + "N exercises · ~M sets".
- "+ Import workout (paste JSON)" → Settings.
- Footer: **History** · **Settings**.
- Banners:
  - If `workout.active` exists: "Resume: Push Day (Exercise 3, Set 2)" → Active Set.
  - If `Date.now() - workout.lastExport > 30 days`: "Last backup: N days ago — tap to copy" → triggers export.

### Workout Detail

- Workout name, total exercises, total planned sets.
- Scrollable list of exercises with planned `sets×reps @ weight` and notes inline.
- A clearly visible reminder: "**After tapping Start: triple-click the side button to enable Guided Access.**"
- Primary action: **Start workout**. Creates `workout.active`, requests Wake Lock, requests `storage.persist()`, navigates to Active Set.
- Secondary: **Delete this workout** (with confirm).

### Active Set (layout B — confirmed)

- Top: progress chip ("3 / 6 · Set 2 / 3"). Top-right: small **End workout** (with confirm).
- Exercise name.
- Card row: reps and weight side-by-side, each with a pencil icon. Tap pencil → inline numeric keypad overlay → set the value for *this* set. Weight column hidden entirely if `weight` is null and there is no override.
- Notes panel, only if notes exist.
- "LAST: 3×10 @ 130 lb" line from derived `lastTimeHint`. Hidden if no history.
- Big green **SET DONE** button. Implemented as a hold-to-confirm: progress fills the button over 250ms; release before that cancels. Prevents fat-finger accidental completion.

### Rest

- Big countdown computed from `Date.now()` vs `restEndsAt` (not `setInterval` tick counts). Re-syncs on `visibilitychange`.
- "Set 2 done · Set 3 of 3 next" line.
- **Skip rest** button (big).
- **Undo last set** button (small but reachable). Reverts the last `setsLog` entry, decrements `setIndex`, clears `restEndsAt`, returns to Active Set.
- At 0:00: single short Web Audio beep + `navigator.vibrate(150)` + auto-advance to Active Set for the next set.
- If `exercise.rest` is missing or 0, the Rest screen is skipped entirely.

### Workout Done

- Summary: total sets, total time.
- Per-set log table.
- **Back to home**.
- On render: append session to `workout.history`, clear current `workout.active` after a one-workout grace period (i.e., we keep it across one more launch in case the user wants to inspect it; replaced when a new workout starts).

### History

- Reverse-chronological list of `workout.history`: date, workout name, "N sets in MM:SS".
- Tap → expand to per-set log.

### Settings

- **Import workout**: textarea + Validate. Validate runs the schema check; on success, shows a preview (workout name, exercise count, total sets) and an Import button. On failure, lists every error with the line number where possible.
- **Export all data**: read-only textarea with `JSON.stringify({ library, history, schema, exportedAt }, null, 2)` + Copy button. Tapping Copy uses `navigator.clipboard.writeText(...)` (no permission prompt) and updates `workout.lastExport`.
- **Import all data**: textarea + a clear "This will OVERWRITE your library and history" confirm. The previous library and history are stashed in `workout.previous` so a one-tap Undo is available immediately after import.
- About: version, link to repo, current schema version.

## Error handling & edge cases

- **Invalid JSON on import.** `JSON.parse` failure → show "Invalid JSON" with the parser's error message. Schema check failure → show a bulleted list of every problem ("exercises[2].sets must be a positive integer"). Library is never mutated until the user taps Import on a valid blob.
- **Duplicate workout id.** Import of a workout whose `id` already exists → confirm dialog: "Replace existing 'Push Day'?". Previous version stashed in `workout.previous` for one-tap undo.
- **Resume after relaunch / phone lock.** On app start, if `workout.active` exists with no `finishedAt`, the home screen shows a Resume banner. The user can also start a new workout, which prompts: "You have an unfinished session. Discard and start new?".
- **Wake Lock release on background.** `visibilitychange` listener re-requests the lock when the document becomes visible again. Failure to acquire is non-fatal — workout still runs.
- **Rest timer drift.** Always computed from `restEndsAt - Date.now()`. Backgrounding the app while resting is safe: when foregrounded, the timer shows the correct remaining time (or fires the beep if it should have fired while away).
- **Service worker stale.** SW uses cache-first for the app shell and network-first for itself. `sw.js` served with `Cache-Control: no-cache`. A new SW activates on next launch.
- **localStorage quota exceeded.** Extremely unlikely with this data shape, but `setItem` is wrapped in try/catch; on `QuotaExceededError` the UI shows a clear "Storage full — export your data and reinstall the app".
- **Audio cue blocked.** Web Audio requires a user gesture to first unlock the AudioContext. The first tap of Start Workout calls `audioContext.resume()`; subsequent beeps work for the rest of the session.

## Testing

- **Manual on iPhone**: the only test environment that matters. Verify install via Safari Share → Add to Home Screen; verify standalone display; verify Guided Access lockdown; verify a full workout end-to-end including pause/resume and audio cue.
- **Local dev**: `python3 -m http.server 8000` from the repo root. Open `http://localhost:8000/` in desktop Safari to iterate. Service worker registration works on localhost without HTTPS.
- **Validation unit tests**: a tiny `tests/validate.test.html` page that loads `app.js` and runs the schema validator against a battery of good and bad JSON inputs. Open in any browser, look for green/red counts. No test framework.

## Deferred / out of scope

- Ad-hoc exercise added mid-workout (substitutions). User edits the JSON and re-imports.
- Multi-device sync.
- Mixed timed + reps exercises. Reps only.
- Plate math calculator.
- Push notifications (audio + haptic is enough; user wears AirPods).
- Native app / TestFlight build.

## File-by-file overview

| File                  | Responsibility                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `index.html`          | Markup for all six screens, plus modals (numeric keypad, confirm dialogs).                        |
| `style.css`           | One stylesheet, dark theme, mobile-first, big tap targets.                                        |
| `app.js`              | State, router, renderers, validation, storage helpers, timer, wake lock, audio.                   |
| `manifest.webmanifest`| PWA metadata (name, short_name, icons, theme color, scope, start_url, display).                   |
| `service-worker.js`   | Cache-first shell of the five files above and the icons. Network-first for itself.                |
| `apple-touch-icon.png`| 180×180 home-screen icon.                                                                         |
| `icons/`              | 192×192 and 512×512 PNGs referenced by the manifest.                                              |
| `examples/push-day.json` | Example workout JSON to paste in for first use.                                                |
