# Rep Range Support — Design

**Status:** Approved 2026-06-01
**Scope:** Workout PWA (`/Users/gm/Code/workout`)
**Targets:** `app.js`, `index.html` (no markup change beyond cache bust), `style.css` (none), `service-worker.js`, `tests/validate.test.html`, `examples/2026-lower-strength.json`
**Version bump:** 1.2.0 → 1.3.0

## Problem

The workout schema only takes an integer `reps`. Real programming uses ranges ("3 sets × 6-8 reps"). The lifter chases the top of the range for progression. The current workaround — encoding the range in the `notes` field and using the top number as `reps` — loses the range from the per-set UI and means each tap-to-edit forgets the floor.

## Goal

Allow exercises to declare a rep range that:

- displays as `6-8` on the detail card and on the active screen,
- still defaults each set to the **top** of the range (the progression target),
- is non-breaking for existing single-integer workouts,
- requires no schema migration step (existing data continues to validate as-is).

## Schema delta

One new optional field on each exercise:

```jsonc
{
  "id": "rdl",
  "name": "Romanian Deadlift",
  "sets": 3,
  "reps": 8,          // existing: also the per-set default
  "repsMin": 6,       // NEW: optional. when present, range is repsMin..reps
  "weight": 145,
  "rest": 150,
  "notes": "RPE 7-8."
}
```

Constraints (added to `validateWorkout`):

- `repsMin` is optional. When omitted, behavior is unchanged.
- When present: `Number.isInteger(repsMin)`, `0 <= repsMin <= reps`.
- Capped by the existing `MAX_REPS` (1000).
- `repsMin === reps` is allowed; the renderer collapses it to a single number.

## Rendering

### Detail card (workout-list line per exercise)

| Before | After |
|---|---|
| `2 × 8 @ 100 lb · 30s rest` | `2 × 6-8 @ 100 lb · 30s rest` |

When `repsMin` is absent: unchanged.

### Active screen

| Before | After |
|---|---|
| Big number `8` / label `REPS` | Big number `8` / label `REPS · 6-8` |

The big value remains the per-set default (`reps`, the top of range). The range appears only in the small label below.

### Notes panel, rest screen, done log, history

Unchanged — they all show **actuals**, not the plan.

## Per-set behavior

- Keypad still opens prefilled with the current set's reps (top of range on first set; whatever the user last logged on subsequent sets if they choose to carry forward — current behavior unchanged).
- `reps` (top of range) is the authoritative default. `repsMin` is display-only.
- Logged set entries (`setsLog`) store the actual rep count, not the range, so history is unaffected.

## Implementation surface

- **`app.js` — VALIDATE region** (`validateWorkout`): add `repsMin` checks alongside the existing `reps` checks. Roughly five lines.
- **`app.js` — RENDER · Workout Detail** (`renderDetail`): change the `reps` interpolation to `formatRepsPlan(ex)` which returns `${repsMin}-${reps}` when `repsMin` is set and `repsMin < reps`, otherwise `${reps}`.
- **`app.js` — RENDER · Active** (`renderActive`): change the static `REPS` label to `REPS · ${repsMin}-${reps}` when applicable. Uses the same helper.
- **`tests/validate.test.html`**: five new cases (listed below).
- **`index.html`**: bump `?v=3` → `?v=4` on `style.css` and `app.js`.
- **`service-worker.js`**: `CACHE_VERSION = 'workout-v4'`.
- **`examples/2026-lower-strength.json`**: backfill `repsMin` on RDL (6), Leg Press (8), Leg Curl (10), Calf Raise (10).
- **`APP_VERSION`** in `app.js`: `1.2.0` → `1.3.0`.

## Tests

Add to `tests/validate.test.html`:

1. `'accepts repsMin within range'` — `{ reps: 8, repsMin: 6 }` → no errors.
2. `'rejects repsMin > reps'` — `{ reps: 6, repsMin: 8 }` → has errors.
3. `'rejects negative repsMin'` — `{ reps: 8, repsMin: -1 }` → has errors.
4. `'rejects non-integer repsMin'` — `{ reps: 8, repsMin: 6.5 }` → has errors.
5. `'accepts repsMin === reps'` — `{ reps: 8, repsMin: 8 }` → no errors.

Existing 29 tests must continue to pass unchanged (back-compat proof).

## Non-goals

- No tuple syntax (`reps: [6, 8]`).
- No descriptive labels (`"AMRAP"`, `"RIR 2"`).
- No history visualization of "set was inside the range vs outside" — out of scope.
- No keypad upper/lower-bound clamping when editing a set — user is allowed to log anything (life happens).

## Risks / open considerations

- **Visual crowding** on the active screen: `REPS · 6-8` is longer than `REPS`. The label is small (12px, letter-spaced); we expect it still fits on iPhone widths. Verify in Playwright before declaring done.
- **History import**: any historical export blob written before this change has no `repsMin`. Import path already tolerates extra/missing fields — confirmed during the validator review.

## Versioning + deploy

- Bump `APP_VERSION` and SW `CACHE_VERSION` in the same commit as the code so the installed PWA picks up the new shell on its next launch.
- Bump asset query-strings (`?v=4`) so browsers without SW also miss the cache.
