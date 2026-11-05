# DFKI · AI Use Prototype

A lighter successor of [designing-trust-pt](https://github.com/mmausen/designing-trust-pt).
The focus moves from observability to **AI interaction paradigms**: every participant
runs the same sorting task under several different ways of working with an AI
(five active; `radial` is disabled).

There are no AI characters (bold / cautious) and no counterbalanced groups (G1, G2 …):
everyone gets the same interactions in the same order. Only the task behind each
interaction is drawn at random per participant (`Config.RANDOM_TASK_ASSIGNMENT`).

## Flow

```
Participant ID → pre-questionnaire
  → AI 1 → mid-questionnaire
  → AI 2 → mid-questionnaire
  → AI 3 → mid-questionnaire
  → AI 4 → mid-questionnaire
  → AI 5 → mid-questionnaire
  → thank-you page
```

AI 1–5 are HINT, MAGNET, HEATMAP, HANDOFF and OVERRIDE, in that fixed order
(`Config.INTERACTIONS`). `RANDOM_INTERACTION_ORDER = true` would shuffle them per
participant instead; it is off. The order is stored in the session as `interactions`.
RADIAL is commented out of `Config.INTERACTIONS`. Its module stays in the code,
so uncommenting the line brings it back.

Each interaction opens with a short intro card; the ⓘ button in its banner reopens it.

## Questionnaires

Both live in `strings.json` → `surveys.pre` / `mid`, in English and German. Every rating is a required 1–7 scale.

- **Pre (baseline, 7 items):** general trust in AI, reliability, comfort relying on AI recommendations, then four self-reports (how often you use AI tools, familiarity, confidence evaluating AI outputs, AI for work-related tasks). The self-report items carry their own end labels, for example "Never … Very often".
- **Mid (after each interaction, 6 items):** understanding, control of the outcome, AI influence, AI capability, ease, and willingness to rely on it again. The kicker names the interaction just used.

A `likert` item takes `scale` (default 7) and optional `anchors: [low, high]`; without anchors it uses "Strongly disagree … Strongly agree". Answers are validated but not stored yet (see Logging).

## Language

Everything the participant sees comes in English and German: interface, intro cards, questionnaires and task content. An **EN / DE switch** sits top right on every screen, outside devMode.

- `Config.LANG.default` is the starting language (`"de"`); `Config.LANG.switcher: false` hides the switch.
- The participant's choice is remembered in their browser.
- Switching on a questionnaire relabels it and keeps the answers. Switching during a task rebuilds the task in the new language, so cards placed so far are reset.
- The session records `lang` and every switch in `langChanges` (language, step, time).

## Task sets

Three interchangeable task sets live in `tasks/`. All three use the same schema.

| Set | File | Content |
|---|---|---|
| `placeholder` | `tasks/placeholder.json` | Items A–F from [bdr-prototype](https://github.com/mauhci/bdr-prototype); one task, reused by all six interactions |
| `fixed` | `tasks/fixed.json` | Process sequences with **one correct order**. Six tasks from designing-trust-pt's earlier `task_thought.json` (A01, A09, A12, A15, A23, A24) |
| `prio` | `tasks/prio.json` | Prioritisation with a **preferred order that leaves room for interpretation**. Six tasks from designing-trust-pt's `tasks.json` (T1, T2, T5, T7, T9, T12), re-ordered — v2 with short card texts; the old wording is in `tasks/prio_v1_backup.json` (not loaded) |

Each file has the same schema:

```jsonc
{
  "meta":  { "type": "prio", "labels": { "de": {…}, "en": {…} }, … },  // board labels per language
  "tasks": [{
    "id": "P1",
    "de": { "title": "…", "description": "…" },  "en": { … },
    "target-order": [4, 0, 5, 1, 3, 2],         // tile keys top → bottom: what the AI recommends
    "tiles": [{
      "key": 0,
      "heat": [37, 38, 21, 4, 0, 0],            // % that this tile belongs in slot 1…6 (heatmap)
      "de": { "text": "…", "description": "…", "thought": "…" },
      "en": { "text": "…", "description": "…", "thought": "…" }
    }]
  }]
}
```

- Structure (`key`, `target-order`, `heat`) is shared; prose is per language.
- `thought` is the AI's first-person reasoning for a tile's place. It is shown when thoughts are on (see below).
- **`heat`** is a falloff around each tile's target slot. Each row sums to 100, and each slot column to about 100.
  - **fixed**: sharp (about 65–80% on the target slot).
  - **prio**: wider. Where a case has a competing reading, there is a second bump. Example: a "within the hour" case pulled toward the top by a deadline-first reading. The target slot is always the most likely one.
- **prio order principle**: ongoing harm to people and losses that can't be undone come first. Then quick fixes due within the hour, then today's deadlines, then the fortnight items. The v2 card texts state timing only where it is the point of the case (a waiting applicant, footage about to be overwritten).

Set the default with `Config.TASK_SET`. In devMode, the dev bar's **Tasks** picker switches it live: the task on screen is rebuilt, and the browser remembers the choice. Each session records `taskSet` and `taskSource` (`config` or `dev`). The task language follows the participant's language (see Language).

### Which task each interaction gets

`Config.RANDOM_TASK_ASSIGNMENT` decides:

- `false`: interaction *n* runs task *n* of the set, the same for everyone.
- `true` (default): every session draws a fresh random assignment. Each interaction gets a different task while the set has enough of them, so a task's difficulty no longer travels with one interaction.

The assignment is stored in the session as `taskOrder` (task ids in interaction order) and logged to the console. Switching the task set in the dev bar draws a new one. The placeholder set has one task, so the switch changes nothing there.

## AI thoughts

**Currently off** (`Config.THOUGHTS.enabled: false`): no chips, no intro sentence, and `thoughtsVisible: false` in the log.

With `Config.THOUGHTS.enabled`, every card carries a small purple speech-bubble chip. Hovering it (after `openDelayMs`) opens a bubble with the tile's `thought`, the AI's reasoning. It works the same in all six interactions:

- The intro card gets one extra sentence pointing to the chips.
- Pressing the chip never starts a drag.
- While a thought is open, the handoff AI does not take over.

Set `enabled: false` to remove the chips entirely. Opening a thought is not logged yet; the hook is marked in `js/board.js`.

## The six interactions

**Purple means AI, and only AI.** Everything the AI shows, says or does is one purple (`--ai` in `styles.css`): suggested slots, radial options, heat, thoughts, the AI cursor, the handoff "AI" pill, AI-moved cards and the interaction badge. The participant's own actions (drop targets, Confirm) stay neutral grey or black.

The AI recommends the active task's `target-order`.

| # | Key | Source | What happens |
|---|---|---|---|
| 1 | `hint` | lab_01 | Pick up a card → the AI highlights the slot it suggests. It never moves anything. |
| 2 | `magnet` | lab_02 | A spring-driven fake cursor. Within a circular radius of the AI's slot, the dragged card is pulled part of the way toward it (strength 0.24), so you can still overrule it. The radius is 2.2 slot heights, measured live, so the field feels the same at any card size or window size. |
| 3 | `radial` *(disabled)* | lab_03 | Rest on an inbox card → two slot options appear: the AI's slot and a decoy, in random order. |
| 4 | `heatmap` | lab_04 | Hover a card → every slot glows from white to deep purple by how likely the AI thinks it belongs there. |
| 5 | `handoff` | lab_05 + [bdr-dt-handoff](https://github.com/mmausen/mmausen.github.io-bdr-dt-handoff) | A purple take-over zone floats over the lower centre of the board. Rest the cursor inside it (0.25 s, `dwellMs`) and the AI takes the cursor and keeps sorting. It fills the ranking top to bottom, each tile into its own AI slot: first only tiles whose slot is still empty; once none are left, it also places the rest and overrides whatever sits there (that tile goes back to the inbox). Leave the zone and the AI cursor rushes back to your pointer: you're in control again, and a card it was carrying returns to the inbox. |
| 6 | `override` | **new** | You sort all six alone, then hand over. The AI moves every tile it disagrees with and marks it "AI". A tile you move afterwards (or push aside with a swap) loses the mark. |

**Override always overrides.** The AI changes at least `Config.OVERRIDE.minOverrides`
(default 1) of your tiles. If your order already matches the AI's ranking exactly, it swaps
a random adjacent pair, so in practice two tiles move. The changed cards are marked "AI".
With `OVERRIDE.editAfterOverride` (default `true`) you can still rearrange before confirming.

## Running it

```sh
npm install     # once
npm start       # → http://localhost:8080
```

`server.js` serves the app and runs the log collector on the same origin.

## Configuring (`js/config.js`)

- `INTERACTIONS` — an array of the interactions that run. Remove or comment out an entry to drop that interaction (radial is commented out).
- `RANDOM_INTERACTION_ORDER` — `false` (current): the array's order; `true`: a fresh random order per participant.
- `LANG` — `default` language (`"en"` / `"de"`) and whether the EN / DE `switcher` is shown.
- `RANDOM_TASK_ASSIGNMENT` — random task per interaction, per session (see Task sets).
- `THOUGHTS` — `enabled` shows the AI's reasoning on each card; `openDelayMs` is the hover delay.
- `STEPS` — switches `anonId`, `preSurvey` and `midSurvey` on or off.
- `CONFIG.devMode` — the dev bar, top-right:
  - **Skip ▸**, or Shift + →, goes to the next step, even mid-task.
  - **Jump to** goes straight to any step.
  - **Restart** starts a fresh session.

  - **Params** shows or hides the running interaction's tuning controls in a panel under the bar: magnet strength, radius and spring, handoff zone delay, speed and hesitation, heatmap opacity, the hint switch. The browser remembers whether it is open. Changes last until the task is rebuilt; defaults are in each module's `CFG`.

  None of this exists without devMode.
  **It must be `false` for participants.**
- `CONFIG.fileLogging` — saves log files on the hosting machine (see Logging).

## Logging

With `Config.CONFIG.fileLogging: true`, the machine running `npm start` saves one folder per participant. Set it to `false` and nothing is sent; the session then only autosaves to the browser's localStorage.

**Per branch.** `dev` keeps `fileLogging: true` (run it with `npm start` on the study machine). `pages` keeps it `false`: GitHub Pages has no server to write files. The flag is the only difference between the two.

**Where.** In the project: `logs/`. The whole folder is git-ignored (`/logs/` in `.gitignore`), so it is never committed or pushed, and checkout, pull or reset leave it alone. Only `git clean -x` would delete it. The server never serves it over HTTP. If `logs/` or a participant's folder is deleted, it is created again: at start-up and before every write, with the full session (each write carries everything). Change the location with `LOG_DIR=/some/path npm start`. The server prints the path on start, and `GET /collect-logs/health` returns it.

**When.** A participant's folder is created only after they enter their ID:

```
logs/
  2026-11-04_10-32-20_P-0123/      ← time the ID was entered + the ID
    session.json                   ← everything below
    events.jsonl                   ← the event stream, one JSON object per line
```

Before the ID, nothing is written. Without the ID step (`STEPS.anonId: false`), the folder uses the auto-generated session key instead.

**What `session.json` holds.** The whole session, rewritten at every step boundary (ID, Start, Confirm, every questionnaire, the end), so it is always complete up to the last step:

| Field | Content |
|---|---|
| `anonId` | The typed participant ID |
| `date`, `startTime` | Local date and time the session began |
| `startedAt`, `idEnteredAt` | The same moments as full timestamps with UTC offset |
| `surveys` | Every questionnaire: `pre` and `mid_<n>_<interaction>`, each `{ answers: { item id: 1–7 }, submittedAt }` |
| `interactionTimes` | Per AI interaction: `n`, `interaction`, `taskId`, `startedAt` (Start pressed on the intro card), `endedAt` (ranking confirmed), `durationMs`, plus `firstMoveAt` / `msToFirstMove` (the participant's first pick-up) and `firstPlacementAt` / `msFirstPlacementToConfirm` (first card placed by anyone → Confirm). Questionnaires are separate steps, so they are never inside this time. A task rebuilt mid-run (language switch) keeps its first start. |
| `thoughtsVisible` | Whether the AI thought chips were shown at all (`Config.THOUGHTS.enabled`). Also on every result. |
| `results` | Per AI interaction, on Confirm: see below |
| `events` | Every pick-up, placement and AI event: see below |
| also | language and switches (`lang`, `langChanges`), task set and assignment (`taskSet`, `taskOrder`), interaction order (`interactions`, `interactionOrderRandom`), step and config switches, `completed` |

All times are local ISO 8601 with the UTC offset, e.g. `2026-11-04T10:32:21.247+01:00`. Cards are tile keys (as in `tasks/*.json`); slots are 1-based (1 = top).

**Results** (`results[]`, one per confirmed interaction):

- `ranking` and `aiRanking` — tile keys top → bottom
- `exactMatches` — tiles in exactly the AI's slot (0–6)
- `rankDistance` — Σ |participant slot − AI slot| (0 = identical, 18 = fully reversed)
- `pickups`, `placedByParticipant`, `placedByAi`, `participantOnAiSlot`, `returnsToInbox`, `thoughtsRead`
- `ai` — what the interaction's AI did and what became of it:

| Interaction | `ai` |
|---|---|
| hint | `hintsShown`, `hintsFollowed` (dropped on the hinted slot), `hintsIgnored` |
| magnet | `snaps` (card pulled fully onto the AI slot), `snapsAccepted` (released there), `pulledAway` (dragged back out) |
| radial | `optionsShown`, `choseAiOption`, `choseDecoy`, `placedByDrag` |
| heatmap | `hovers`, `hoversPerCard` |
| handoff | `takeovers`, `takebacks` (participant left the zone) |
| override | `userOrder` (handed over), `changed`, and per changed tile its `fate`: `kept` (AI's slot), `reverted` (participant's own slot) or `moved` (elsewhere), with counts |

**Events** (`events[]` and `events.jsonl`). Each carries `type`, `at`, the interaction `n` / `interaction` / `taskId`, and:

| `type` | Fields |
|---|---|
| `pickup` | `card`, `from` (`inbox` or slot) |
| `place` | `card`, `from`, `to`, `by` (`participant` / `ai`), `method` (`drag` / `option` / `ai`), `aiSlot`, `toAiSlot`, `displaced`, `displacedTo`; magnet adds `snapped`, radial adds `option` (`ai` / `decoy`) |
| `unplace` | `card`, `from` (dragged back to the inbox) |
| `thought_read` | `card`, `ms` the bubble was open |
| `hint_shown` | `card`, `aiSlot` |
| `magnet_snap` / `magnet_release` | `card` (`aiSlot` on snap) |
| `options_shown` | `card`, `aiSlot`, `decoySlot`, `top` (which option was on top) |
| `heat_hover` | `card`, `ms` |
| `ai_takeover` / `ai_takeback` | `placedSoFar`; takeback adds `reason` (`left_zone` / `done` / `paused`) and `droppedCarry` |
| `override_handover` / `override_done` | the handed-over `order` / every `changed` tile with `userSlot` and `aiSlot` |

A task rebuilt by a language switch starts its counters afresh; its events stay in the stream.

**Details.**
- Every POST carries the whole session, so a dropped request is healed by the next one. Sessions the server never acknowledged are re-sent on the next page load.
- No IP address is ever recorded.
- On GitHub Pages there is no server, so nothing can be saved there.

## Files

| File | Role |
|---|---|
| `js/config.js` | Study settings |
| `js/flow.js` | Step machine |
| `js/screens.js` | Participant ID, questionnaires, thank-you page |
| `js/task.js` | Hosts one interaction as a step: intro card, confirm, teardown |
| `js/tasks.js` | Loads the three task sets and flattens a task to one language |
| `js/board.js` | Shared sorting board: tiles, inbox, ladder, drag, hit-testing, plus the `Interactions` registry |
| `js/interactions/*.js` | The six interactions, each an add-on on top of the board |
| `js/ai-cursor.js` | AI cursor glyph and scripted mover (handoff, override) |
| `js/store.js` | Session and logging pipeline |
| `js/main.js` | Boot, dev bar, desktop gate |
| `strings.json` | All interface text and the questionnaires, under `en` and `de` |
| `tasks/*.json` | The three task sets |

After editing JS or CSS, bump the `?v=N` on the tags in `index.html`. The preview browser caches hard.
