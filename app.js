/* ────────────────────────────────────────────────────────────────
 * Workout app — vanilla JS, single file.
 * Regions: CONST · STORAGE · VALIDATE · ROUTER · RENDER · ACTIVE
 *          · KEYPAD · CONFIRM · TIMER · WAKE · AUDIO · BOOT
 * ──────────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  /* ─────────── CONST ─────────── */
  const APP_VERSION = '1.6.0';
  const SCHEMA = 1;
  const ONE_DAY = 86_400_000;
  const BACKUP_NAG_AFTER_MS = 30 * ONE_DAY;

  const K = {
    library: 'workout.library',
    active: 'workout.active',
    history: 'workout.history',
    lastExport: 'workout.lastExport',
    previous: 'workout.previous',
    schema: 'workout.schema',
    defaultsSeeded: 'workout.defaultsSeeded',
  };

  /* ─────────── STORAGE ─────────── */
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        alert('Storage full. Export your data from Settings, then reinstall the app.');
        return false;
      }
    },
    remove(key) { localStorage.removeItem(key); },
  };

  function getLibrary()  { return store.get(K.library, {}); }
  function setLibrary(v) { return store.set(K.library, v); }
  function getActive()   { return store.get(K.active, null); }
  function setActive(v)  { return v ? store.set(K.active, v) : store.remove(K.active); }
  function getHistory()  { return store.get(K.history, []); }
  function setHistory(v) { return store.set(K.history, v); }

  /* ─────────── VALIDATE ─────────── */
  // Sanity caps so a bad paste can't produce a screen with 10,000 sets.
  const MAX_SETS = 50;
  const MAX_REPS = 1000;
  const MAX_WEIGHT = 10000;
  const MAX_REST = 3600;
  const MAX_EXERCISES = 50;
  const MAX_RA_NAME = 40;
  const MAX_RA_PRESCRIPTION = 200;
  const MAX_SUPERSET_ID = 40;

  function validateWorkout(obj) {
    const errs = [];
    const isStr = (x) => typeof x === 'string' && x.length > 0;
    const isPosInt = (x) => Number.isInteger(x) && x > 0;
    const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
      return ['Top-level value must be a JSON object.'];
    }
    if (obj.version !== 1) errs.push('Field "version" must be the number 1.');
    if (!isStr(obj.id)) errs.push('Field "id" must be a non-empty string.');
    if (!isStr(obj.name)) errs.push('Field "name" must be a non-empty string.');
    if (obj.unit != null && obj.unit !== 'lb' && obj.unit !== 'kg') {
      errs.push('Field "unit" must be "lb" or "kg" (or omitted).');
    }
    if (!Array.isArray(obj.exercises) || obj.exercises.length === 0) {
      errs.push('Field "exercises" must be a non-empty array.');
      return errs;
    }
    if (obj.exercises.length > MAX_EXERCISES) {
      errs.push(`Field "exercises" has ${obj.exercises.length} entries; max is ${MAX_EXERCISES}.`);
    }
    const ids = new Set();
    obj.exercises.forEach((ex, i) => {
      const at = `exercises[${i}]`;
      if (ex == null || typeof ex !== 'object') {
        errs.push(`${at} must be an object.`);
        return;
      }
      if (!isStr(ex.id)) errs.push(`${at}.id must be a non-empty string.`);
      else if (ids.has(ex.id)) errs.push(`${at}.id "${ex.id}" is duplicated within this workout.`);
      else ids.add(ex.id);
      if (!isStr(ex.name)) errs.push(`${at}.name must be a non-empty string.`);
      if (!isPosInt(ex.sets)) errs.push(`${at}.sets must be a positive integer.`);
      else if (ex.sets > MAX_SETS) errs.push(`${at}.sets must be ≤ ${MAX_SETS}.`);
      if (!isPosInt(ex.reps)) errs.push(`${at}.reps must be a positive integer.`);
      else if (ex.reps > MAX_REPS) errs.push(`${at}.reps must be ≤ ${MAX_REPS}.`);
      if (ex.repsMin != null) {
        if (!(Number.isInteger(ex.repsMin) && ex.repsMin >= 0 && ex.repsMin <= MAX_REPS)) {
          errs.push(`${at}.repsMin must be a non-negative integer ≤ ${MAX_REPS} (or omitted).`);
        } else if (isPosInt(ex.reps) && ex.repsMin > ex.reps) {
          errs.push(`${at}.repsMin (${ex.repsMin}) must be ≤ reps (${ex.reps}).`);
        }
      }
      if (ex.weight != null && !(isNum(ex.weight) && ex.weight >= 0 && ex.weight <= MAX_WEIGHT)) {
        errs.push(`${at}.weight must be a non-negative number ≤ ${MAX_WEIGHT} (or omitted).`);
      }
      if (ex.rest != null && !(isNum(ex.rest) && ex.rest >= 0 && ex.rest <= MAX_REST)) {
        errs.push(`${at}.rest must be a non-negative number of seconds ≤ ${MAX_REST} (or omitted).`);
      }
      if (ex.notes != null && typeof ex.notes !== 'string') errs.push(`${at}.notes must be a string (or omitted).`);
      if (ex.restActivity != null) {
        if (typeof ex.restActivity !== 'object' || Array.isArray(ex.restActivity)) {
          errs.push(`${at}.restActivity must be an object (or omitted).`);
        } else {
          const ra = ex.restActivity;
          if (typeof ra.name !== 'string' || ra.name.length < 1 || ra.name.length > MAX_RA_NAME) {
            errs.push(`${at}.restActivity.name must be a 1-${MAX_RA_NAME} character string.`);
          }
          if (typeof ra.prescription !== 'string' || ra.prescription.length < 1 || ra.prescription.length > MAX_RA_PRESCRIPTION) {
            errs.push(`${at}.restActivity.prescription must be a 1-${MAX_RA_PRESCRIPTION} character string.`);
          }
        }
      }
      if (ex.supersetId != null && (typeof ex.supersetId !== 'string' || ex.supersetId.length < 1 || ex.supersetId.length > MAX_SUPERSET_ID)) {
        errs.push(`${at}.supersetId must be a 1-${MAX_SUPERSET_ID} character string (or omitted).`);
      }
    });

    // Cross-exercise superset rules: each group must have ≥2 contiguous members
    // with identical set counts. Non-contiguous IDs are invalid (alternation
    // semantics break if a non-member sits between members).
    const groupRuns = [];
    let run = null;
    obj.exercises.forEach((ex, i) => {
      const id = typeof ex === 'object' && ex && typeof ex.supersetId === 'string' ? ex.supersetId : null;
      if (id && id.length > 0) {
        if (run && run.id === id) run.members.push({ ex, i });
        else { if (run) groupRuns.push(run); run = { id, members: [{ ex, i }] }; }
      } else {
        if (run) groupRuns.push(run);
        run = null;
      }
    });
    if (run) groupRuns.push(run);

    const seenGroupIds = new Set();
    groupRuns.forEach((g) => {
      if (g.members.length < 2) {
        errs.push(`supersetId "${g.id}" has only ${g.members.length} contiguous member(s); groups need ≥2 adjacent exercises sharing the id.`);
      }
      const firstSets = g.members[0].ex.sets;
      const mismatched = g.members.find((m) => m.ex.sets !== firstSets);
      if (mismatched) {
        errs.push(`supersetId "${g.id}" members must all have the same sets count; got ${g.members.map((m) => m.ex.sets).join(', ')}.`);
      }
      if (seenGroupIds.has(g.id)) {
        errs.push(`supersetId "${g.id}" appears in non-contiguous positions; group members must be adjacent in the exercises array.`);
      }
      seenGroupIds.add(g.id);
    });

    return errs;
  }

  function validateExportBlob(obj) {
    const errs = [];
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return ['Top-level value must be a JSON object.'];
    if (obj.schema !== SCHEMA) errs.push(`Field "schema" must be ${SCHEMA}.`);
    if (obj.library == null || typeof obj.library !== 'object' || Array.isArray(obj.library)) {
      errs.push('Field "library" must be an object.');
    } else {
      Object.entries(obj.library).forEach(([id, w]) => {
        const sub = validateWorkout(w);
        sub.forEach((e) => errs.push(`library["${id}"]: ${e}`));
      });
    }
    if (!Array.isArray(obj.history)) errs.push('Field "history" must be an array.');
    return errs;
  }

  /* ─────────── ROUTER ─────────── */
  const screens = Array.from(document.querySelectorAll('section[data-screen]'));
  let currentScreen = null;
  const detailState = { workoutId: null };

  function show(name, opts = {}) {
    // Leaving the Done screen for Home is the cue that the just-finished
    // session is no longer needed in localStorage. History has the durable copy.
    if (name === 'home') {
      const active = getActive();
      if (active && active.finishedAt) setActive(null);
    }
    screens.forEach((s) => {
      s.hidden = s.dataset.screen !== name;
    });
    currentScreen = name;
    if (name === 'home') renderHome();
    else if (name === 'detail') renderDetail(opts.workoutId);
    else if (name === 'active') renderActive();
    else if (name === 'rest') renderRest();
    else if (name === 'done') renderDone();
    else if (name === 'history') renderHistory();
    else if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  /* ─────────── RENDER · Home ─────────── */
  function renderHome() {
    const library = getLibrary();
    const ids = Object.keys(library);
    const listEl = document.querySelector('[data-list="workouts"]');
    const emptyEl = document.querySelector('[data-empty="workouts"]');
    listEl.innerHTML = '';
    if (ids.length === 0) {
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      ids.forEach((id) => {
        const w = library[id];
        const totalSets = w.exercises.reduce((sum, ex) => sum + ex.sets, 0);
        const li = document.createElement('li');
        li.innerHTML = `<div class="w-name"></div><div class="w-meta"></div>`;
        li.querySelector('.w-name').textContent = w.name;
        li.querySelector('.w-meta').textContent = `${w.exercises.length} exercises · ${totalSets} sets`;
        li.addEventListener('click', () => show('detail', { workoutId: id }));
        listEl.appendChild(li);
      });
    }

    const active = getActive();
    const resumeBanner = document.querySelector('[data-banner="resume"]');
    if (active && !active.finishedAt) {
      const w = library[active.workoutId];
      const exName = w && w.exercises[active.exerciseIndex] ? w.exercises[active.exerciseIndex].name : 'workout';
      resumeBanner.textContent = `Resume: ${w ? w.name : '?'} (${exName}, Set ${active.setIndex + 1})`;
      resumeBanner.hidden = false;
      resumeBanner.onclick = () => show('active');
    } else {
      resumeBanner.hidden = true;
    }

    const lastExport = store.get(K.lastExport, 0);
    const backupBanner = document.querySelector('[data-banner="backup"]');
    const history = getHistory();
    if (history.length > 0 && (Date.now() - lastExport) > BACKUP_NAG_AFTER_MS) {
      const days = lastExport === 0 ? 'never' : `${Math.floor((Date.now() - lastExport) / ONE_DAY)} days ago`;
      backupBanner.textContent = `Last backup: ${days} — tap to copy.`;
      backupBanner.hidden = false;
      backupBanner.onclick = () => show('settings');
    } else {
      backupBanner.hidden = true;
    }
  }

  /* ─────────── RENDER · Workout Detail ─────────── */
  function renderDetail(workoutId) {
    if (workoutId) detailState.workoutId = workoutId;
    const id = detailState.workoutId;
    const w = getLibrary()[id];
    if (!w) { show('home'); return; }

    document.querySelector('[data-field="detail-name"]').textContent = w.name;
    const total = w.exercises.reduce((s, ex) => s + ex.sets, 0);
    document.querySelector('[data-field="detail-meta"]').textContent =
      `${w.exercises.length} exercises · ${total} planned sets · ${w.unit || 'lb'}`;

    const list = document.querySelector('[data-list="detail-exercises"]');
    list.innerHTML = '';
    w.exercises.forEach((ex, i) => {
      const inSS = ex.supersetId != null;
      const prevSameSS = inSS && i > 0 && w.exercises[i - 1].supersetId === ex.supersetId;
      const nextSameSS = inSS && i < w.exercises.length - 1 && w.exercises[i + 1].supersetId === ex.supersetId;
      const isFirstInSS = inSS && !prevSameSS;
      const isLastInSS = inSS && !nextSameSS;

      const li = document.createElement('li');
      if (inSS) {
        li.classList.add('ex-superset');
        if (isFirstInSS) li.classList.add('ex-superset-first');
        if (isLastInSS) li.classList.add('ex-superset-last');
        if (!isFirstInSS && !isLastInSS) li.classList.add('ex-superset-mid');
      }

      if (isFirstInSS) {
        let groupSize = 1;
        for (let j = i + 1; j < w.exercises.length && w.exercises[j].supersetId === ex.supersetId; j++) groupSize++;
        const badge = document.createElement('div');
        badge.className = 'ex-superset-badge';
        badge.textContent = `SUPERSET · ${groupSize} EXERCISES`;
        li.appendChild(badge);
      }

      const weightStr = ex.weight != null ? ` @ ${ex.weight} ${w.unit || 'lb'}` : '';
      const restStr = inSS && !isLastInSS
        ? ' · → next'
        : (ex.rest ? ` · ${ex.rest}s rest` : '');
      const nameDiv = document.createElement('div');
      nameDiv.className = 'ex-name';
      nameDiv.textContent = ex.name;
      const planDiv = document.createElement('div');
      planDiv.className = 'ex-plan';
      planDiv.textContent = `${ex.sets} × ${formatRepsPlan(ex)}${weightStr}${restStr}`;
      li.appendChild(nameDiv);
      li.appendChild(planDiv);

      if (ex.notes) {
        const n = document.createElement('div');
        n.className = 'ex-notes';
        n.textContent = ex.notes;
        li.appendChild(n);
      }
      list.appendChild(li);
    });
  }

  /* ─────────── RENDER · Active Set ─────────── */
  function renderActive() {
    const active = getActive();
    if (!active) { show('home'); return; }
    const w = getLibrary()[active.workoutId];
    if (!w) { show('home'); return; }
    const ex = w.exercises[active.exerciseIndex];

    const groupA = getSupersetGroup(w, active.exerciseIndex);
    document.querySelector('[data-field="active-chip"]').textContent = groupA
      ? `${active.exerciseIndex + 1} / ${w.exercises.length} · SS ${groupA.myPos + 1}/${groupA.members.length} · ROUND ${active.setIndex + 1} / ${ex.sets}`
      : `${active.exerciseIndex + 1} / ${w.exercises.length} · SET ${active.setIndex + 1} / ${ex.sets}`;
    document.querySelector('[data-field="active-name"]').textContent = ex.name;

    const currentReps = defaultRepsForCurrentSet(active, ex);
    const currentWeight = defaultWeightForCurrentSet(active, ex);

    document.querySelector('[data-field="active-reps"]').textContent = currentReps;
    document.querySelector('[data-field="active-reps-label"]').textContent =
      hasRepsRange(ex) ? `REPS · ${ex.repsMin}-${ex.reps}` : 'REPS';
    const wEl = document.querySelector('[data-field="active-weight"]');
    const wCell = document.querySelector('[data-cell="weight"]');
    const wLabel = document.querySelector('[data-field="active-weight-unit"]');
    if (currentWeight == null) {
      wCell.style.display = 'none';
    } else {
      wCell.style.display = '';
      wEl.textContent = currentWeight;
      wLabel.textContent = (w.unit || 'lb').toUpperCase();
    }

    const notesEl = document.querySelector('[data-field="active-notes"]');
    if (ex.notes) {
      notesEl.textContent = ex.notes;
      notesEl.hidden = false;
    } else {
      notesEl.hidden = true;
    }

    const lastEl = document.querySelector('[data-field="active-last"]');
    const hint = lastTimeHint(ex.id, w.unit || 'lb');
    if (hint) { lastEl.textContent = hint; lastEl.hidden = false; }
    else { lastEl.hidden = true; }

    activeUi.pendingReps = currentReps;
    activeUi.pendingWeight = currentWeight;
  }

  // Per-render UI state (not persisted; just current-set pending edits)
  const activeUi = { pendingReps: null, pendingWeight: null };

  // True only when the exercise declares a range with distinct ends.
  // `repsMin === reps` collapses to the single-number display.
  function hasRepsRange(ex) {
    return Number.isInteger(ex.repsMin) && ex.repsMin < ex.reps;
  }

  // Returns { startIdx, endIdx, members, myPos } when exerciseIndex falls
  // inside a superset group (contiguous run of exercises sharing supersetId).
  // Returns null for sequential exercises. Relies on the validator enforcing
  // contiguity, so we only walk neighbors.
  function getSupersetGroup(workout, exerciseIndex) {
    const ex = workout.exercises[exerciseIndex];
    if (!ex || !ex.supersetId) return null;
    const id = ex.supersetId;
    let startIdx = exerciseIndex;
    while (startIdx > 0 && workout.exercises[startIdx - 1].supersetId === id) startIdx--;
    let endIdx = exerciseIndex;
    while (endIdx < workout.exercises.length - 1 && workout.exercises[endIdx + 1].supersetId === id) endIdx++;
    return {
      startIdx,
      endIdx,
      members: workout.exercises.slice(startIdx, endIdx + 1),
      myPos: exerciseIndex - startIdx,
    };
  }
  function formatRepsPlan(ex) {
    return hasRepsRange(ex) ? `${ex.repsMin}-${ex.reps}` : `${ex.reps}`;
  }

  function defaultRepsForCurrentSet(active, ex) {
    // Always default to plan target reps for this set, regardless of what was logged on prior sets.
    return ex.reps;
  }

  function defaultWeightForCurrentSet(active, ex) {
    if (active.lastWeightByExercise && active.lastWeightByExercise[ex.id] != null) {
      return active.lastWeightByExercise[ex.id];
    }
    if (ex.weight != null) return ex.weight;
    return null;
  }

  function lastTimeHint(exerciseId, unit) {
    const history = getHistory();
    for (let i = history.length - 1; i >= 0; i--) {
      const session = history[i];
      const sets = session.setsLog.filter((s) => s.exerciseId === exerciseId);
      if (sets.length === 0) continue;
      const last = sets[sets.length - 1];
      return `LAST: ${sets.length}×${last.reps}` + (last.weight != null ? ` @ ${last.weight} ${unit}` : '');
    }
    return null;
  }

  /* ─────────── RENDER · Rest ─────────── */
  let restTickToken = 0;  // bump to invalidate any in-flight ticker
  let restFiring = false; // re-entrancy guard for finishRest

  function renderRest() {
    const active = getActive();
    if (!active || active.restEndsAt == null) { show('active'); return; }
    const w = getLibrary()[active.workoutId];
    if (!w) { show('home'); return; }
    const ex = w.exercises[active.exerciseIndex];

    const groupR = getSupersetGroup(w, active.exerciseIndex);
    document.querySelector('[data-field="rest-chip"]').textContent = groupR
      ? `${active.exerciseIndex + 1} / ${w.exercises.length} · SS ${groupR.myPos + 1}/${groupR.members.length} · NEXT ROUND ${active.setIndex + 1} / ${ex.sets}`
      : `${active.exerciseIndex + 1} / ${w.exercises.length} · NEXT SET ${active.setIndex + 1} / ${ex.sets}`;

    // "Set N done" should reflect the most recently logged set's setNumber,
    // not the (already-advanced) active.setIndex which can be 0 across exercise
    // boundaries. Three cases:
    //   - Inside a superset cycle: name + round on both sides.
    //   - Cross-exercise transition (e.g. superset → next, or sequential A→B):
    //     name the previous and upcoming exercises so the user isn't guessing
    //     which "Set 3" refers to what.
    //   - Same-exercise between-sets rest: the plain "Set N of K" form.
    const lastLogged = active.setsLog[active.setsLog.length - 1];
    const justDone = lastLogged ? lastLogged.setNumber : 0;
    const justEx = lastLogged ? w.exercises.find((e) => e.id === lastLogged.exerciseId) : null;
    const justName = justEx ? justEx.name : (lastLogged ? lastLogged.exerciseId : '');
    let restNextText;
    if (lastLogged && groupR) {
      restNextText = `${justName} R${justDone} done · ${ex.name} R${active.setIndex + 1} next`;
    } else if (lastLogged && justEx && justEx.id !== ex.id) {
      restNextText = `${justName} done · ${ex.name} Set ${active.setIndex + 1} of ${ex.sets} next`;
    } else {
      restNextText = `Set ${justDone} done · Set ${active.setIndex + 1} of ${ex.sets} next`;
    }
    document.querySelector('[data-field="rest-next"]').textContent = restNextText;

    // Activity panel — defaults to upcoming exercise's, but inter-round rest
    // inside a superset uses the just-finished last-member's activity.
    const sourceId = active.restActivitySourceId;
    const activityEx = sourceId ? (w.exercises.find((e) => e.id === sourceId) || ex) : ex;
    const raEl = document.querySelector('[data-field="rest-activity"]');
    if (activityEx.restActivity) {
      document.querySelector('[data-field="ra-name"]').textContent = activityEx.restActivity.name;
      document.querySelector('[data-field="ra-prescription"]').textContent = activityEx.restActivity.prescription;
      raEl.hidden = false;
    } else {
      raEl.hidden = true;
    }

    startRestTicker();
  }

  function startRestTicker() {
    const my = ++restTickToken;
    const loop = () => {
      if (my !== restTickToken) return;            // newer ticker exists
      if (currentScreen !== 'rest') return;        // navigated away
      const active = getActive();
      if (!active || active.restEndsAt == null) return;
      const remaining = Math.max(0, active.restEndsAt - Date.now());
      const el = document.querySelector('[data-field="rest-countdown"]');
      if (el) el.textContent = formatMS(remaining);
      if (remaining <= 0) {
        finishRest();
      } else {
        setTimeout(loop, 200);
      }
    };
    loop();
  }

  function formatMS(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // `silent` is true when the user taps "Skip rest" — no cue needed, they
  // initiated it. The natural rest-timer expiry path still beeps + buzzes.
  function finishRest(opts = {}) {
    if (restFiring) return;
    const active = getActive();
    if (!active || active.restEndsAt == null) return;
    restFiring = true;
    restTickToken++;  // invalidate any other in-flight ticker
    active.restEndsAt = null;
    setActive(active);
    if (!opts.silent) {
      beep();
      // Double-buzz so a backgrounded app / disconnected AirPods still draw
      // attention. iOS Safari ignores vibrate; harmless there.
      if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
    }
    show('active');
    restFiring = false;
  }

  /* ─────────── RENDER · Done ─────────── */
  function renderDone() {
    const active = getActive();
    if (!active) { show('home'); return; }
    const w = getLibrary()[active.workoutId] || { name: '(deleted)', unit: 'lb' };
    const elapsed = (active.finishedAt || Date.now()) - active.startedAt;
    const min = Math.floor(elapsed / 60_000);
    const sec = Math.floor((elapsed % 60_000) / 1000);
    document.querySelector('[data-field="done-summary"]').textContent =
      `${active.setsLog.length} sets in ${min}:${String(sec).padStart(2, '0')}`;
    const list = document.querySelector('[data-list="done-log"]');
    list.innerHTML = '';
    active.setsLog.forEach((s) => {
      const ex = w.exercises ? w.exercises.find((e) => e.id === s.exerciseId) : null;
      const exName = ex ? ex.name : s.exerciseId;
      const li = document.createElement('li');
      li.innerHTML = `<span class="ex"></span><span class="nums"></span>`;
      li.querySelector('.ex').textContent = `${exName} · Set ${s.setNumber}`;
      li.querySelector('.nums').textContent = `${s.reps}` + (s.weight != null ? ` @ ${s.weight} ${w.unit || 'lb'}` : '');
      list.appendChild(li);
    });
  }

  /* ─────────── RENDER · History ─────────── */
  function renderHistory() {
    const history = getHistory();
    const list = document.querySelector('[data-list="history"]');
    const empty = document.querySelector('[data-empty="history"]');
    list.innerHTML = '';
    if (history.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    const library = getLibrary();
    [...history].reverse().forEach((session) => {
      const li = document.createElement('li');
      const date = new Date(session.startedAt);
      const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const elapsed = (session.finishedAt - session.startedAt);
      const min = Math.floor(elapsed / 60_000);
      const sec = Math.floor((elapsed % 60_000) / 1000);
      const w = library[session.workoutId];
      const unit = (w && w.unit) || 'lb';
      const elapsedStr = `${min}:${String(sec).padStart(2, '0')}`;
      li.innerHTML = `
        <div class="h-row"><span class="h-name"></span><span class="h-date"></span></div>
        <div class="h-meta"></div>
        <div class="h-detail" hidden></div>
      `;
      li.querySelector('.h-name').textContent = session.workoutName;
      li.querySelector('.h-date').textContent = `${dateStr} ${timeStr}`;
      li.querySelector('.h-meta').textContent = `${session.setsLog.length} sets in ${elapsedStr}`;
      const detail = li.querySelector('.h-detail');
      session.setsLog.forEach((s) => {
        const exName = (w && w.exercises && w.exercises.find((e) => e.id === s.exerciseId) || {}).name || s.exerciseId;
        const row = document.createElement('div');
        const left = document.createElement('span');
        const right = document.createElement('span');
        left.textContent = `${exName} · Set ${s.setNumber}`;
        right.textContent = `${s.reps}` + (s.weight != null ? ` @ ${s.weight} ${unit}` : '');
        row.appendChild(left);
        row.appendChild(right);
        detail.appendChild(row);
      });
      li.addEventListener('click', () => { detail.hidden = !detail.hidden; });
      list.appendChild(li);
    });
  }

  /* ─────────── RENDER · Settings ─────────── */
  function renderSettings() {
    document.querySelector('[data-field="import-workout-textarea"]').value = '';
    document.querySelector('[data-field="import-workout-output"]').textContent = '';
    document.querySelector('[data-field="import-workout-output"]').className = 'validate-output';
    document.querySelector('[data-action="import-workout-commit"]').disabled = true;
    importWorkoutState.parsed = null;

    document.querySelector('[data-field="import-all-textarea"]').value = '';
    document.querySelector('[data-field="import-all-output"]').textContent = '';
    document.querySelector('[data-field="import-all-output"]').className = 'validate-output';
    document.querySelector('[data-action="import-all-commit"]').disabled = true;
    importAllState.parsed = null;
    document.querySelector('[data-action="import-all-undo"]').hidden = !store.get(K.previous);

    const blob = {
      schema: SCHEMA,
      exportedAt: Date.now(),
      library: getLibrary(),
      history: getHistory(),
    };
    document.querySelector('[data-field="export-textarea"]').value = JSON.stringify(blob, null, 2);
    document.querySelector('[data-field="export-status"]').textContent = '';

    document.querySelector('[data-field="about-info"]').textContent =
      `v${APP_VERSION} · schema ${SCHEMA} · ${Object.keys(getLibrary()).length} workouts · ${getHistory().length} sessions`;

    const lib = getLibrary();
    const missing = DEFAULT_WORKOUTS.filter((w) => !lib[w.id]);
    const present = DEFAULT_WORKOUTS.length - missing.length;
    document.querySelector('[data-field="defaults-status"]').textContent =
      `${present} of ${DEFAULT_WORKOUTS.length} default workouts in your library` +
      (missing.length > 0 ? `. Missing: ${missing.map((w) => w.name).join(', ')}.` : '.');
    document.querySelector('[data-action="restore-defaults"]').disabled = missing.length === 0;
  }

  const importWorkoutState = { parsed: null };
  const importAllState = { parsed: null };

  /* ─────────── ACTIVE workout lifecycle ─────────── */
  function startWorkout(workoutId) {
    const w = getLibrary()[workoutId];
    if (!w) return;
    const existing = getActive();
    if (existing && !existing.finishedAt) {
      openConfirm('You have an unfinished session. Discard it and start a new workout?', () => {
        beginFresh(workoutId);
      });
    } else {
      beginFresh(workoutId);
    }
  }

  function beginFresh(workoutId) {
    const session = {
      workoutId,
      startedAt: Date.now(),
      exerciseIndex: 0,
      setIndex: 0,
      setsLog: [],
      lastWeightByExercise: {},
      restEndsAt: null,
    };
    setActive(session);
    requestStoragePersist();
    requestWakeLock();
    unlockAudio();
    show('active');
  }

  function logSet() {
    const active = getActive();
    if (!active) return;
    const w = getLibrary()[active.workoutId];
    if (!w) return;
    const ex = w.exercises[active.exerciseIndex];
    const reps = activeUi.pendingReps != null ? activeUi.pendingReps : ex.reps;
    const weight = activeUi.pendingWeight != null ? activeUi.pendingWeight : (ex.weight != null ? ex.weight : null);

    active.setsLog.push({
      exerciseId: ex.id,
      setNumber: active.setIndex + 1,
      reps,
      weight,
      completedAt: Date.now(),
    });
    if (weight != null) {
      active.lastWeightByExercise[ex.id] = weight;
    }

    // Advance — either superset cycling or plain sequential.
    const group = getSupersetGroup(w, active.exerciseIndex);
    if (group) {
      if (group.myPos < group.members.length - 1) {
        // Mid-round in a group: jump to next member, same round (setIndex unchanged).
        active.exerciseIndex = group.startIdx + group.myPos + 1;
      } else {
        // Just finished the last member → completed a round.
        active.setIndex += 1;
        if (active.setIndex >= ex.sets) {
          // Group complete — advance past the group.
          active.exerciseIndex = group.endIdx + 1;
          active.setIndex = 0;
          if (active.exerciseIndex >= w.exercises.length) {
            finishWorkout(active);
            return;
          }
        } else {
          // Next round — back to first member.
          active.exerciseIndex = group.startIdx;
        }
      }
    } else {
      active.setIndex += 1;
      if (active.setIndex >= ex.sets) {
        active.setIndex = 0;
        active.exerciseIndex += 1;
        if (active.exerciseIndex >= w.exercises.length) {
          finishWorkout(active);
          return;
        }
      }
    }

    // Rest: default is upcoming exercise's rest. Exception — inter-round
    // transition inside a group: the rest belongs to the JUST-FINISHED last
    // member, since that's where the user encodes the round's rest.
    const upcoming = w.exercises[active.exerciseIndex];
    let restEx = upcoming;
    let restSourceId = null;
    if (ex.supersetId && upcoming && upcoming.supersetId === ex.supersetId) {
      restEx = ex;
      restSourceId = ex.id;
    }
    const restSec = restEx && restEx.rest && restEx.rest > 0 ? restEx.rest : 0;
    if (restSec > 0) {
      active.restEndsAt = Date.now() + restSec * 1000;
      active.restActivitySourceId = restSourceId;
      setActive(active);
      show('rest');
    } else {
      active.restEndsAt = null;
      active.restActivitySourceId = null;
      setActive(active);
      show('active');
    }
  }

  function undoLastSet() {
    const active = getActive();
    if (!active || active.setsLog.length === 0) return;
    const last = active.setsLog.pop();
    // Compute exercise + set indices that were active when this was logged
    const w = getLibrary()[active.workoutId];
    if (!w) return;
    // Find this exercise's index
    const exIdx = w.exercises.findIndex((e) => e.id === last.exerciseId);
    if (exIdx < 0) return;
    active.exerciseIndex = exIdx;
    active.setIndex = last.setNumber - 1;
    // Recompute lastWeightByExercise from remaining setsLog
    active.lastWeightByExercise = {};
    active.setsLog.forEach((s) => {
      if (s.weight != null) active.lastWeightByExercise[s.exerciseId] = s.weight;
    });
    active.restEndsAt = null;
    setActive(active);
    show('active');
  }

  function endWorkout() {
    openConfirm('End workout now? Your sets so far will be saved.', () => {
      const active = getActive();
      if (!active) { show('home'); return; }
      finishWorkout(active);
    });
  }

  function finishWorkout(active) {
    active.finishedAt = Date.now();
    active.restEndsAt = null;
    setActive(active);

    const w = getLibrary()[active.workoutId] || {};
    const history = getHistory();
    history.push({
      workoutId: active.workoutId,
      workoutName: w.name || '(deleted)',
      startedAt: active.startedAt,
      finishedAt: active.finishedAt,
      setsLog: active.setsLog,
    });
    setHistory(history);
    releaseWakeLock();
    show('done');
  }

  /* ─────────── KEYPAD modal ───────────
   * Opens showing the current value so the user knows the starting state, but
   * the first digit press replaces the buffer. Backspace and decimal commit
   * the buffer as an "in progress" edit (the user took explicit action), so
   * subsequent keys append instead of replace.
   */
  const keypadState = { target: null, buffer: '', maxDecimals: 0, label: '', fresh: true };

  function openKeypad(target) {
    const ex = currentExercise();
    if (!ex) return;
    const w = getLibrary()[getActive().workoutId];
    if (target === 'reps') {
      keypadState.target = 'reps';
      keypadState.buffer = String(activeUi.pendingReps != null ? activeUi.pendingReps : ex.reps);
      keypadState.maxDecimals = 0;
      keypadState.label = 'REPS · type to replace';
    } else {
      const current = activeUi.pendingWeight != null ? activeUi.pendingWeight : (ex.weight != null ? ex.weight : 0);
      keypadState.target = 'weight';
      keypadState.buffer = String(current);
      keypadState.maxDecimals = 2;
      keypadState.label = (w.unit || 'lb').toUpperCase() + ' · type to replace';
    }
    keypadState.fresh = true;
    document.querySelector('[data-field="keypad-label"]').textContent = keypadState.label;
    document.querySelector('[data-field="keypad-display"]').textContent = keypadState.buffer;
    document.querySelector('[data-modal="keypad"]').hidden = false;
  }

  function closeKeypad() { document.querySelector('[data-modal="keypad"]').hidden = true; }

  function keypadKey(k) {
    if (k === 'back') {
      // Backspace commits to "editing" mode and removes one digit.
      keypadState.fresh = false;
      keypadState.buffer = keypadState.buffer.slice(0, -1);
    } else if (k === '.') {
      if (keypadState.maxDecimals === 0) return;
      if (keypadState.fresh) { keypadState.buffer = '0'; keypadState.fresh = false; }
      if (keypadState.buffer.includes('.')) return;
      if (keypadState.buffer === '') keypadState.buffer = '0';
      keypadState.buffer += '.';
    } else {
      // Digit: if the buffer is "fresh" (just opened), replace it. Otherwise append.
      if (keypadState.fresh) {
        keypadState.buffer = (k === '0') ? '0' : k;
        keypadState.fresh = false;
      } else if (keypadState.buffer === '0' && k !== '0') {
        keypadState.buffer = k;
      } else if (keypadState.buffer === '0' && k === '0') {
        return;
      } else {
        keypadState.buffer += k;
      }
    }
    // Enforce decimal cap
    if (keypadState.maxDecimals > 0 && keypadState.buffer.includes('.')) {
      const [whole, dec] = keypadState.buffer.split('.');
      if (dec.length > keypadState.maxDecimals) keypadState.buffer = whole + '.' + dec.slice(0, keypadState.maxDecimals);
    }
    document.querySelector('[data-field="keypad-display"]').textContent = keypadState.buffer || '0';
  }

  function keypadSave() {
    const raw = keypadState.buffer;
    if (raw === '' || raw === '.') { closeKeypad(); return; }
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) { closeKeypad(); return; }
    if (keypadState.target === 'reps') {
      if (!Number.isInteger(num) || num <= 0) { closeKeypad(); return; }
      activeUi.pendingReps = num;
      document.querySelector('[data-field="active-reps"]').textContent = num;
    } else {
      activeUi.pendingWeight = num;
      document.querySelector('[data-field="active-weight"]').textContent = num;
    }
    closeKeypad();
  }

  function currentExercise() {
    const active = getActive();
    if (!active) return null;
    const w = getLibrary()[active.workoutId];
    if (!w) return null;
    return w.exercises[active.exerciseIndex];
  }

  /* ─────────── CONFIRM modal ─────────── */
  const confirmState = { onOk: null };

  function openConfirm(message, onOk) {
    document.querySelector('[data-field="confirm-message"]').textContent = message;
    confirmState.onOk = onOk;
    document.querySelector('[data-modal="confirm"]').hidden = false;
  }
  function closeConfirm() {
    document.querySelector('[data-modal="confirm"]').hidden = true;
    confirmState.onOk = null;
  }

  /* ─────────── WAKE lock ─────────── */
  let wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {}
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch {} wakeLock = null; }
  }
  function reacquireWakeLockIfNeeded() {
    const active = getActive();
    if (!active || active.finishedAt) return;
    if (document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
    // Re-kick the rest timer in case the previous setTimeout chain was paused.
    if (document.visibilityState === 'visible' && currentScreen === 'rest') {
      startRestTicker();
    }
  }

  /* ─────────── STORAGE persist ─────────── */
  async function requestStoragePersist() {
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist(); } catch {}
    }
  }

  /* ─────────── AUDIO cue ─────────── */
  let audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch {}
  }
  function beep() {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch {}
  }

  /* ─────────── EVENT WIRING ─────────── */
  function wire() {
    document.addEventListener('click', (e) => {
      const goEl = e.target.closest('[data-go]');
      if (goEl) { show(goEl.dataset.go); return; }
      const backEl = e.target.closest('[data-back]');
      if (backEl) { show('home'); return; }
      const actEl = e.target.closest('[data-action]');
      if (actEl) handleAction(actEl.dataset.action, actEl);
      const keyEl = e.target.closest('[data-key]');
      if (keyEl) keypadKey(keyEl.dataset.key);
    });


    // Active value taps also open the keypad (in addition to the pencil)
    const repsCell = document.querySelector('[data-cell="reps"]');
    if (repsCell) repsCell.addEventListener('click', (e) => {
      if (e.target.closest('.btn-pencil')) return;
      if (e.target.closest('.active-value')) openKeypad('reps');
    });
    const weightCell = document.querySelector('[data-cell="weight"]');
    if (weightCell) weightCell.addEventListener('click', (e) => {
      if (e.target.closest('.btn-pencil')) return;
      if (e.target.closest('.active-value')) openKeypad('weight');
    });

    // Back-button / hash routing — minimal: use popstate to land on home
    window.addEventListener('popstate', () => show('home'));

    // Wake lock re-acquire on visibility
    document.addEventListener('visibilitychange', reacquireWakeLockIfNeeded);

    // Editing either Import textarea after a successful Validate must
    // re-disable the commit button so the user can't ship a stale parse.
    const importWorkoutTa = document.querySelector('[data-field="import-workout-textarea"]');
    if (importWorkoutTa) importWorkoutTa.addEventListener('input', () => {
      importWorkoutState.parsed = null;
      const btn = document.querySelector('[data-action="import-workout-commit"]');
      if (btn) btn.disabled = true;
      const out = document.querySelector('[data-field="import-workout-output"]');
      if (out) { out.textContent = ''; out.className = 'validate-output'; }
    });
    const importAllTa = document.querySelector('[data-field="import-all-textarea"]');
    if (importAllTa) importAllTa.addEventListener('input', () => {
      importAllState.parsed = null;
      const btn = document.querySelector('[data-action="import-all-commit"]');
      if (btn) btn.disabled = true;
      const out = document.querySelector('[data-field="import-all-output"]');
      if (out) { out.textContent = ''; out.className = 'validate-output'; }
    });
  }

  function handleAction(action, el) {
    switch (action) {
      // Workout detail
      case 'start-workout': startWorkout(detailState.workoutId); break;
      case 'delete-workout': openConfirm('Delete this workout?', () => {
        const lib = getLibrary(); delete lib[detailState.workoutId]; setLibrary(lib); show('home');
      }); break;

      // Active set
      case 'set-done': unlockAudio(); logSet(); break;
      case 'edit-reps': openKeypad('reps'); break;
      case 'edit-weight': openKeypad('weight'); break;
      case 'end-workout': endWorkout(); break;

      // Rest
      case 'skip-rest': finishRest({ silent: true }); break;
      case 'undo-set': undoLastSet(); break;

      // Keypad modal
      case 'keypad-cancel': closeKeypad(); break;
      case 'keypad-save': keypadSave(); break;

      // Confirm modal
      case 'confirm-cancel': closeConfirm(); break;
      case 'confirm-ok': {
        const fn = confirmState.onOk;
        closeConfirm();
        if (fn) fn();
        break;
      }

      // Settings — defaults
      case 'restore-defaults': {
        const added = restoreDefaults();
        const out = document.querySelector('[data-field="defaults-output"]');
        out.textContent = added > 0
          ? `Restored ${added} default workout${added === 1 ? '' : 's'}.`
          : 'Nothing to restore — all defaults are already in your library.';
        renderSettings();
        break;
      }

      // Settings — import workout
      case 'import-workout-validate': importWorkoutValidate(); break;
      case 'import-workout-commit': importWorkoutCommit(); break;

      // Settings — export
      case 'export-copy': exportCopy(); break;

      // Settings — import all
      case 'import-all-validate': importAllValidate(); break;
      case 'import-all-commit': importAllCommit(); break;
      case 'import-all-undo': importAllUndo(); break;
    }
  }

  /* ─────────── Import workout actions ─────────── */
  function importWorkoutValidate() {
    const raw = document.querySelector('[data-field="import-workout-textarea"]').value.trim();
    const out = document.querySelector('[data-field="import-workout-output"]');
    const btn = document.querySelector('[data-action="import-workout-commit"]');
    out.textContent = ''; out.className = 'validate-output';
    btn.disabled = true; importWorkoutState.parsed = null;
    if (!raw) { out.className = 'validate-output err'; out.textContent = 'Paste a workout JSON first.'; return; }
    let obj;
    try { obj = JSON.parse(raw); }
    catch (e) { out.className = 'validate-output err'; out.textContent = `Invalid JSON: ${e.message}`; return; }
    const errs = validateWorkout(obj);
    if (errs.length > 0) {
      out.className = 'validate-output err';
      out.innerHTML = '<strong>Schema errors:</strong>';
      const ul = document.createElement('ul');
      errs.forEach((m) => { const li = document.createElement('li'); li.textContent = m; ul.appendChild(li); });
      out.appendChild(ul);
      return;
    }
    importWorkoutState.parsed = obj;
    const total = obj.exercises.reduce((s, ex) => s + ex.sets, 0);
    out.className = 'validate-output ok';
    const exists = !!getLibrary()[obj.id];
    out.textContent = `Looks good: "${obj.name}" — ${obj.exercises.length} exercises, ${total} planned sets.` +
      (exists ? ' Will replace existing workout with this id.' : '');
    btn.disabled = false;
  }

  function importWorkoutCommit() {
    const w = importWorkoutState.parsed;
    if (!w) return;
    const lib = getLibrary();
    const replacing = !!lib[w.id];
    const commit = () => {
      const next = { ...lib, [w.id]: w };
      setLibrary(next);
      const out = document.querySelector('[data-field="import-workout-output"]');
      out.className = 'validate-output ok';
      out.textContent = `Imported "${w.name}".`;
      document.querySelector('[data-field="import-workout-textarea"]').value = '';
      document.querySelector('[data-action="import-workout-commit"]').disabled = true;
      importWorkoutState.parsed = null;
    };
    if (replacing) openConfirm(`Replace existing "${lib[w.id].name}"?`, commit);
    else commit();
  }

  /* ─────────── Export / Import all ─────────── */
  async function exportCopy() {
    const txt = document.querySelector('[data-field="export-textarea"]').value;
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
        ok = true;
      } else {
        const ta = document.querySelector('[data-field="export-textarea"]');
        ta.focus(); ta.select(); document.execCommand && document.execCommand('copy'); ok = true;
      }
    } catch { ok = false; }
    const status = document.querySelector('[data-field="export-status"]');
    if (ok) {
      store.set(K.lastExport, Date.now());
      status.textContent = 'Copied. Paste somewhere safe (Notes / email / AirDrop).';
    } else {
      status.textContent = 'Copy failed. Select the text manually and copy.';
    }
  }

  function importAllValidate() {
    const raw = document.querySelector('[data-field="import-all-textarea"]').value.trim();
    const out = document.querySelector('[data-field="import-all-output"]');
    const btn = document.querySelector('[data-action="import-all-commit"]');
    out.textContent = ''; out.className = 'validate-output';
    btn.disabled = true; importAllState.parsed = null;
    if (!raw) { out.className = 'validate-output err'; out.textContent = 'Paste an export blob first.'; return; }
    let obj;
    try { obj = JSON.parse(raw); }
    catch (e) { out.className = 'validate-output err'; out.textContent = `Invalid JSON: ${e.message}`; return; }
    const errs = validateExportBlob(obj);
    if (errs.length > 0) {
      out.className = 'validate-output err';
      out.innerHTML = '<strong>Errors:</strong>';
      const ul = document.createElement('ul');
      errs.slice(0, 20).forEach((m) => { const li = document.createElement('li'); li.textContent = m; ul.appendChild(li); });
      out.appendChild(ul);
      if (errs.length > 20) {
        const more = document.createElement('p');
        more.textContent = `…and ${errs.length - 20} more.`;
        out.appendChild(more);
      }
      return;
    }
    importAllState.parsed = obj;
    out.className = 'validate-output ok';
    out.textContent = `Looks good. ${Object.keys(obj.library).length} workouts, ${obj.history.length} sessions.`;
    btn.disabled = false;
  }

  function importAllCommit() {
    const blob = importAllState.parsed;
    if (!blob) return;
    openConfirm('Overwrite your library and history with this blob?', () => {
      const previous = { library: getLibrary(), history: getHistory(), savedAt: Date.now() };
      store.set(K.previous, previous);
      setLibrary(blob.library);
      setHistory(blob.history);
      renderSettings();
      const out = document.querySelector('[data-field="import-all-output"]');
      out.className = 'validate-output ok';
      out.textContent = 'Imported. Use Undo if this was a mistake.';
      document.querySelector('[data-action="import-all-undo"]').hidden = false;
    });
  }

  function importAllUndo() {
    const prev = store.get(K.previous);
    if (!prev) return;
    setLibrary(prev.library);
    setHistory(prev.history);
    store.remove(K.previous);
    renderSettings();
    const out = document.querySelector('[data-field="import-all-output"]');
    out.className = 'validate-output ok';
    out.textContent = 'Reverted to previous library and history.';
  }

  /* ─────────── DEFAULTS ─────────── */
  // Bundled workouts seeded into the library on first launch. The user can
  // delete any of them without them returning; Settings → Restore defaults
  // re-adds any that are missing without touching the rest of the library.
  const DEFAULT_WORKOUTS = [
      {
          "version": 1,
          "id": "monday_upper_a",
          "name": "Upper A (Push)",
          "unit": "lb",
          "exercises": [
              {
                  "id": "warmup-bike-row",
                  "name": "Warmup — Bike or Row",
                  "sets": 1,
                  "reps": 1,
                  "rest": 0,
                  "notes": "3 minutes easy."
              },
              {
                  "id": "warmup-band-pull-aparts",
                  "name": "Warmup — Band Pull-Aparts",
                  "sets": 2,
                  "reps": 15,
                  "rest": 0,
                  "notes": "Light band, squeeze at end range."
              },
              {
                  "id": "warmup-band-external-rotations",
                  "name": "Warmup — Band External Rotations",
                  "sets": 2,
                  "reps": 10,
                  "rest": 0,
                  "notes": "10 each side. Light band. Elbow glued to side."
              },
              {
                  "id": "warmup-wall-slides",
                  "name": "Warmup — Wall Slides",
                  "sets": 1,
                  "reps": 10,
                  "rest": 0,
                  "notes": "Back flat against wall, arms in goalpost position."
              },
              {
                  "id": "warmup-tib-raises",
                  "name": "Warmup — Tib Raises",
                  "sets": 2,
                  "reps": 15,
                  "rest": 0,
                  "notes": "Heels on floor, lift toes against wall or weight."
              },
              {
                  "id": "warmup-cat-cow",
                  "name": "Warmup — Cat-Cow",
                  "sets": 1,
                  "reps": 8,
                  "rest": 0,
                  "notes": "Slow, full range, breathe with it."
              },
              {
                  "id": "warmup-scapular-pull-ups",
                  "name": "Warmup — Scapular Pull-Ups",
                  "sets": 1,
                  "reps": 8,
                  "rest": 0,
                  "notes": "Hang, pull shoulder blades down and back without bending arms."
              },
              {
                  "id": "incline-db-press",
                  "name": "Incline DB Press",
                  "sets": 4,
                  "reps": 8,
                  "repsMin": 6,
                  "weight": 45,
                  "rest": 180,
                  "restActivity": {
                      "name": "Neck CARs",
                      "prescription": "1 slow circle each direction"
                  },
                  "notes": "RPE 7-8. 30-45 degree bench. 45s, or 40s if 45s feel like RPE 9."
              },
              {
                  "id": "pull-up",
                  "name": "Pull-up",
                  "sets": 4,
                  "reps": 8,
                  "repsMin": 6,
                  "weight": 0,
                  "rest": 180,
                  "restActivity": {
                      "name": "Doorway pec stretch",
                      "prescription": "30 sec each side"
                  },
                  "notes": "RPE 8. Weighted if possible, assisted if needed. Find weight or assist for 8 clean reps. Goal: 3-5 strict unassisted by week 8."
              },
              {
                  "id": "standing-db-ohp",
                  "name": "Standing DB Overhead Press",
                  "sets": 3,
                  "reps": 8,
                  "repsMin": 6,
                  "weight": 35,
                  "rest": 150,
                  "restActivity": {
                      "name": "Open-book / T-spine extension",
                      "prescription": "5 each side"
                  },
                  "notes": "RPE 7-8. 35 lb DBs to start, find RPE 7-8. Strict, no leg drive, ribs down. Lumbar arch = first sign too heavy → drop weight or move to seated DB."
              },
              {
                  "id": "chest-supported-row",
                  "name": "Chest-Supported Row",
                  "sets": 3,
                  "reps": 10,
                  "repsMin": 8,
                  "weight": 70,
                  "rest": 120,
                  "restActivity": {
                      "name": "Thread the needle",
                      "prescription": "5 each side"
                  },
                  "notes": "RPE 7-8. Squeeze 1 sec at contraction, control negative. Find RPE 7 weight in week 1."
              },
              {
                  "id": "lateral-raise",
                  "name": "Lateral Raise",
                  "sets": 4,
                  "reps": 15,
                  "repsMin": 12,
                  "weight": 10,
                  "rest": 60,
                  "restActivity": {
                      "name": "Wall pec/shoulder stretch",
                      "prescription": "30 sec each side"
                  },
                  "notes": "RPE 9. Scapular plane, slight pour, no upper-trap shrug. Top isolation priority."
              },
              {
                  "id": "overhead-tricep-extension",
                  "name": "Overhead Tricep Extension",
                  "sets": 2,
                  "reps": 12,
                  "repsMin": 10,
                  "weight": 40,
                  "rest": 60,
                  "notes": "RPE 8. Rope from low cable or single-arm DB. Arm overhead, stretch long head at bottom, control eccentric."
              },
              {
                  "id": "supinating-curl",
                  "name": "Supinating Curl",
                  "sets": 3,
                  "reps": 12,
                  "repsMin": 10,
                  "weight": 25,
                  "rest": 60,
                  "notes": "RPE 8. Incline DB or EZ-bar. Short-head / peak bias. Start 25 lb DBs or find RPE 8."
              },
              {
                  "id": "tricep-pushdown",
                  "name": "Tricep Pushdown",
                  "sets": 2,
                  "reps": 15,
                  "repsMin": 12,
                  "weight": 45,
                  "rest": 60,
                  "notes": "RPE 8-9. Start 45 lb (new gym pulley ratio — not 75). Hits lockout/contracted position; complements Mon overhead extension (stretched position)."
              }
          ]
      },
      {
          "version": 1,
          "id": "wednesday_lower_strength",
          "name": "Lower Strength",
          "unit": "lb",
          "exercises": [
              {
                  "id": "warmup-bike",
                  "name": "Warmup — Bike",
                  "sets": 1,
                  "reps": 1,
                  "rest": 0,
                  "notes": "3 minutes easy spin."
              },
              {
                  "id": "warmup-calf-raise-toe-spread",
                  "name": "Warmup — Calf Raise + Toe Spread",
                  "sets": 2,
                  "reps": 15,
                  "rest": 0,
                  "notes": "Barefoot. Slow calf raises with conscious toe spread at top and bottom. 2 x 15 each foot."
              },
              {
                  "id": "warmup-tib-raises",
                  "name": "Warmup — Tib Raises",
                  "sets": 2,
                  "reps": 15,
                  "rest": 0,
                  "notes": "Heels on floor, lift toes against wall or weight. Anterior tibialis."
              },
              {
                  "id": "warmup-resisted-ankle-inversion",
                  "name": "Warmup — Resisted Ankle Inversion",
                  "sets": 2,
                  "reps": 12,
                  "rest": 0,
                  "notes": "2 x 12 each foot. Band anchored lateral, pull foot inward, slow. Posterior tib / arch support."
              },
              {
                  "id": "warmup-banded-glute-bridges",
                  "name": "Warmup — Banded Glute Bridges",
                  "sets": 1,
                  "reps": 12,
                  "rest": 0,
                  "notes": "Slow. Band above knees. Drive knees out against band on way up."
              },
              {
                  "id": "warmup-banded-lateral-walks",
                  "name": "Warmup — Banded Lateral Walks",
                  "sets": 2,
                  "reps": 10,
                  "rest": 0,
                  "notes": "10 each direction. Heaviest band available. Slow and deliberate."
              },
              {
                  "id": "warmup-leg-swings",
                  "name": "Warmup — Leg Swings",
                  "sets": 1,
                  "reps": 10,
                  "rest": 0,
                  "notes": "10 front-to-back and 10 side-to-side, each leg."
              },
              {
                  "id": "warmup-bw-squat-to-stand",
                  "name": "Warmup — Bodyweight Squat to Stand",
                  "sets": 1,
                  "reps": 8,
                  "rest": 0,
                  "notes": "Reach floor at bottom, reach overhead at top."
              },
              {
                  "id": "back-squat",
                  "name": "Back Squat",
                  "sets": 3,
                  "reps": 8,
                  "repsMin": 6,
                  "weight": 135,
                  "rest": 180,
                  "restActivity": {
                      "name": "Toe yoga",
                      "prescription": "30 sec each foot, barefoot"
                  },
                  "notes": "RPE 7-8. High-bar, bar on traps, brace 360 each rep. Depth: comfortable. Knee long-resolved — sit into it; only cap depth if the anterior knee genuinely aches."
              },
              {
                  "id": "romanian-deadlift",
                  "name": "Romanian Deadlift",
                  "sets": 3,
                  "reps": 8,
                  "weight": 145,
                  "rest": 150,
                  "restActivity": {
                      "name": "90/90 hip switches",
                      "prescription": "5 each direction"
                  },
                  "notes": "RPE 7-8. Slight knee bend, hinge from hips, bar travels along legs."
              },
              {
                  "id": "atg-step-up",
                  "name": "ATG Step-up",
                  "sets": 3,
                  "reps": 10,
                  "repsMin": 8,
                  "weight": 0,
                  "rest": 90,
                  "restActivity": {
                      "name": "Ankle dorsiflexion mobilization",
                      "prescription": "30 sec each side"
                  },
                  "notes": "RPE 7-8. 8-10 each leg. Start LOW box (6-8 in) bodyweight 2-3 weeks before going higher. Step up, lower with 3-sec eccentric, knee tracks over toes, full range. Working leg does the work. Hold rack for balance. Add light DBs only once BW is clean. Pain-free only — earn the height and load."
              },
              {
                  "id": "leg-curl",
                  "name": "Leg Curl",
                  "sets": 3,
                  "reps": 15,
                  "repsMin": 12,
                  "weight": 90,
                  "rest": 90,
                  "restActivity": {
                      "name": "Couch stretch",
                      "prescription": "30 sec each side"
                  },
                  "notes": "RPE 8. Control eccentric, 3 sec down."
              },
              {
                  "id": "hip-abduction",
                  "name": "Hip Abduction (machine or cable)",
                  "sets": 3,
                  "reps": 15,
                  "repsMin": 12,
                  "weight": 50,
                  "rest": 60,
                  "restActivity": {
                      "name": "Dead bug or Pallof press",
                      "prescription": "Dead bug 5 each side OR Pallof press 8 each side"
                  },
                  "notes": "RPE 8. Find weight in week 1. Slight forward lean to bias glute med over TFL. Glute med = knee protection + hip stability for running."
              },
              {
                  "id": "seated-calf-raise",
                  "name": "Seated Calf Raise",
                  "sets": 3,
                  "reps": 15,
                  "repsMin": 12,
                  "weight": 45,
                  "rest": 60,
                  "restActivity": {
                      "name": "Standing hamstring stretch",
                      "prescription": "30 sec each side"
                  },
                  "notes": "RPE 8-9. Bent-knee soleus work, critical with rising running mileage."
              },
              {
                  "id": "single-leg-standing-heel-raise",
                  "name": "Single-Leg Standing Heel Raise (PF-protective)",
                  "sets": 2,
                  "reps": 12,
                  "repsMin": 10,
                  "weight": 0,
                  "rest": 60,
                  "notes": "RPE 8. Toes dorsiflexed on a step edge. 3-sec eccentric, heavy + slow. Loads gastroc + plantar fascia."
              },
              {
                  "id": "hanging-knee-raise",
                  "name": "Hanging Knee Raise",
                  "sets": 3,
                  "reps": 15,
                  "repsMin": 10,
                  "weight": 0,
                  "rest": 60,
                  "notes": "RPE 8. Bodyweight. Slow and controlled, no swinging. Pause at top. Add ankle weights when 3 x 15 is easy. Direct anterior core work."
              }
          ]
      },
      {
          "version": 1,
          "id": "friday_upper_b",
          "name": "Upper B (Pull)",
          "unit": "lb",
          "exercises": [
              {
                  "id": "warmup-bike-row",
                  "name": "Warmup — Bike or Row",
                  "sets": 1,
                  "reps": 1,
                  "rest": 0,
                  "notes": "3 minutes easy."
              },
              {
                  "id": "warmup-band-pull-aparts",
                  "name": "Warmup — Band Pull-Aparts",
                  "sets": 2,
                  "reps": 15,
                  "rest": 0,
                  "notes": "Light band, squeeze at end range."
              },
              {
                  "id": "warmup-band-external-rotations",
                  "name": "Warmup — Band External Rotations",
                  "sets": 2,
                  "reps": 10,
                  "rest": 0,
                  "notes": "10 each side. Light band. Elbow glued to side."
              },
              {
                  "id": "warmup-wall-slides",
                  "name": "Warmup — Wall Slides",
                  "sets": 1,
                  "reps": 10,
                  "rest": 0,
                  "notes": "Back flat against wall, arms in goalpost position."
              },
              {
                  "id": "warmup-tib-raises",
                  "name": "Warmup — Tib Raises",
                  "sets": 2,
                  "reps": 15,
                  "rest": 0,
                  "notes": "Heels on floor, lift toes against wall or weight."
              },
              {
                  "id": "warmup-cat-cow",
                  "name": "Warmup — Cat-Cow",
                  "sets": 1,
                  "reps": 8,
                  "rest": 0,
                  "notes": "Slow, full range."
              },
              {
                  "id": "warmup-scapular-pull-ups",
                  "name": "Warmup — Scapular Pull-Ups",
                  "sets": 1,
                  "reps": 8,
                  "rest": 0,
                  "notes": "Hang, pull shoulder blades down and back without bending arms."
              },
              {
                  "id": "dips",
                  "name": "Dips",
                  "sets": 4,
                  "reps": 12,
                  "repsMin": 8,
                  "weight": 0,
                  "rest": 120,
                  "restActivity": {
                      "name": "Thread the needle",
                      "prescription": "5 each side"
                  },
                  "notes": "RPE 8. Week 1: test set BW to RPE 9, then prescribe. 8+ reps → 4x8-12 BW. 4-7 → 4x6-10 BW. 1-3 → assisted for 10. <1 → assisted for 8. Cues: slightly upright torso, controlled depth, no deep bottom stretch in early weeks. Lockout-position triceps."
              },
              {
                  "id": "lat-pulldown",
                  "name": "Lat Pulldown",
                  "sets": 4,
                  "reps": 12,
                  "repsMin": 10,
                  "weight": 105,
                  "rest": 120,
                  "restActivity": {
                      "name": "Doorway pec stretch",
                      "prescription": "30 sec each side"
                  },
                  "notes": "RPE 8. 105-110 lb. Verify per-handle vs total labeling. Lats = V-taper."
              },
              {
                  "id": "cable-row",
                  "name": "Cable Row",
                  "sets": 3,
                  "reps": 12,
                  "repsMin": 10,
                  "weight": 80,
                  "rest": 90,
                  "restActivity": {
                      "name": "Open-book / T-spine extension",
                      "prescription": "5 each side"
                  },
                  "notes": "RPE 8. Find RPE 8 weight in week 1. Back thickness + posture."
              },
              {
                  "id": "lateral-raise-second-hit",
                  "name": "Lateral Raise",
                  "sets": 4,
                  "reps": 15,
                  "repsMin": 12,
                  "weight": 10,
                  "rest": 0,
                  "notes": "RPE 9. Scapular plane, no shrug.",
                  "supersetId": "lr-fp-finisher"
              },
              {
                  "id": "face-pull",
                  "name": "Face Pull",
                  "sets": 4,
                  "reps": 20,
                  "repsMin": 15,
                  "weight": 30,
                  "rest": 60,
                  "restActivity": {
                      "name": "Wall pec/shoulder stretch",
                      "prescription": "30 sec each side"
                  },
                  "notes": "RPE 8. Rope at face height, elbows high, pull to forehead + external-rotate at end, brief pause. Rear delt + posture. Light, quality over load.",
                  "supersetId": "lr-fp-finisher"
              },
              {
                  "id": "hammer-curl",
                  "name": "Hammer Curl",
                  "sets": 3,
                  "reps": 12,
                  "repsMin": 10,
                  "weight": 25,
                  "rest": 75,
                  "notes": "RPE 8. Start 25 lb DBs. Brachialis / forearm thickness."
              }
          ]
      }
  ];

  function seedDefaultsIfNeeded() {
    if (store.get(K.defaultsSeeded)) return;
    const lib = getLibrary();
    let inserted = 0;
    DEFAULT_WORKOUTS.forEach((w) => {
      const errs = validateWorkout(w);
      if (errs.length > 0) {
        console.warn(`Default workout "${w.id}" failed validation, skipping:`, errs);
        return;
      }
      if (!lib[w.id]) { lib[w.id] = w; inserted++; }
    });
    if (inserted > 0) setLibrary(lib);
    store.set(K.defaultsSeeded, true);
  }

  function restoreDefaults() {
    const lib = getLibrary();
    let added = 0;
    DEFAULT_WORKOUTS.forEach((w) => {
      const errs = validateWorkout(w);
      if (errs.length > 0) return;
      if (!lib[w.id]) { lib[w.id] = w; added++; }
    });
    if (added > 0) setLibrary(lib);
    return added;
  }

  /* ─────────── BOOT ─────────── */
  function boot() {
    // Skip full boot if no app DOM is present (e.g. running from the test page).
    if (!document.querySelector('section[data-screen="home"]')) return;

    // Initialize schema if missing
    if (store.get(K.schema) == null) store.set(K.schema, SCHEMA);

    // First-launch seeding: drop the bundled workouts into an empty library.
    // Idempotent — re-running boot won't duplicate or undo user deletions.
    seedDefaultsIfNeeded();

    wire();
    requestStoragePersist();

    // Register service worker if we're being served (not opened as a file://)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }

    // Determine starting screen: resume in-progress workout if applicable
    const active = getActive();
    if (active && !active.finishedAt) {
      show('home'); // user can tap the banner to resume; don't auto-jump
    } else {
      show('home');
    }
  }

  // Expose a tiny test surface for the validation test page.
  window.__workout = { validateWorkout, validateExportBlob };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
