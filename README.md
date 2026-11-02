# BDR — AI Use Prototype

A lighter successor of [designing-trust-pt](https://github.com/mmausen/designing-trust-pt).
The focus moves from observability to **AI interaction paradigms**: every participant
runs the same sorting task under six different ways of working with an AI.

There are no AI characters (bold / cautious) and no counterbalanced groups (G1, G2 …):
everyone gets the same interactions in the same order.

## Flow

```
Participant ID → pre-questionnaire
  → AI 1 HINT     → mid-questionnaire
  → AI 2 MAGNET   → mid-questionnaire
  → AI 3 RADIAL   → mid-questionnaire
  → AI 4 HEATMAP  → mid-questionnaire
  → AI 5 HANDOFF  → mid-questionnaire
  → AI 6 OVERRIDE → mid-questionnaire
  → final screener → thank-you page
```

All questionnaires are placeholders (`strings.json` → `surveys.pre` / `mid` / `final`).
Each interaction opens with a short intro card; the ⓘ button in its banner reopens it.

## Task sets

Three interchangeable task sets live in `tasks/`. All three use the same schema. Interaction *n* runs task *n* of the active set.

| Set | File | Content |
|---|---|---|
| `placeholder` | `tasks/placeholder.json` | Items A–F from [bdr-prototype](https://github.com/mauhci/bdr-prototype); one task, reused by all six interactions |
| `fixed` | `tasks/fixed.json` | Process sequences with **one correct order**. Six tasks from designing-trust-pt's earlier `task_thought.json` (A01, A09, A12, A15, A23, A24) |
| `prio` | `tasks/prio.json` | Prioritisation with a **preferred order that leaves room for interpretation**. Six tasks from designing-trust-pt's `tasks.json` (T1, T2, T5, T7, T9, T12), re-ordered |

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
- `thought` is the AI's first-person reasoning for a tile's place. It is not shown yet.
- **`heat`** is a falloff around each tile's target slot. Each row sums to 100, and each slot column to about 100.
  - **fixed**: sharp (about 65–80% on the target slot).
  - **prio**: wider. Where a case has a competing reading, there is a second bump. Example: a "within the hour" case pulled toward the top by a deadline-first reading. The target slot is always the most likely one.
- **prio order principle**: ongoing harm to people and losses that can't be undone come first. Then quick fixes due within the hour, then today's deadlines, then the fortnight items.

Set the default with `Config.TASK_SET` and `Config.TASK_LANG`. In devMode, the dev bar's **Tasks** and **EN/DE** pickers switch both live. The task on screen is rebuilt, and the browser remembers the choice. Each session records `taskSet`, `taskLang` and `taskSource` (`config` or `dev`). Interface text outside the task content (buttons, "remaining", the heatmap legend) is still English only.

## The six interactions

The AI recommends the active task's `target-order`.

| # | Key | Source | What happens |
|---|---|---|---|
| 1 | `hint` | lab_01 | Pick up a card → the AI highlights the slot it suggests. It never moves anything. |
| 2 | `magnet` | lab_02 | A spring-driven fake cursor. Within a circular radius of the AI's slot, the dragged card is pulled part of the way toward it, so you can still overrule it. |
| 3 | `radial` | lab_03 | Rest on an inbox card → two slot options appear: the AI's slot and a decoy, in random order. |
| 4 | `heatmap` | lab_04 | Hover a card → every slot glows hot→cold by how likely the AI thinks it belongs there. |
| 5 | `handoff` | lab_05 | Stop moving for 1 s and the AI takes the cursor and keeps sorting. Move to take back control. |
| 6 | `override` | **new** | You sort all six alone, then hand over. The AI moves every tile it disagrees with. |

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

- `INTERACTIONS` — an array, and its order is the running order. Remove an entry to drop that interaction.
- `STEPS` — switches `anonId`, `preSurvey`, `midSurvey` and `finalSurvey` on or off.
- `CONFIG.devMode` — the dev bar, top-right:
  - **Skip ▸**, or Shift + →, goes to the next step, even mid-task.
  - **Jump to** goes straight to any step.
  - **Restart** starts a fresh session.

  devMode also shows each interaction's tuning controls (dashed yellow box in the footer).
  **It must be `false` for participants.**
- `CONFIG.loggingEnabled` — the master switch for the collector (see below).

## Logging

The logging pipeline from designing-trust-pt is in place, but **no study data is logged yet**:

- `Store` keeps the session in memory and autosaves it to localStorage. A session being
  replaced is archived first.
- `Store.sendRemote()` POSTs the whole session to `/collect-logs` at step boundaries.
  `Store.flush()` sends a `sendBeacon` when the tab closes.
- `server.js` writes one folder per participant: `logs/<participantId>/sessions/<id>.json`
  plus an append-only `events.jsonl`. The `logs/` folder is blocked from HTTP, and no IP
  address is ever recorded.

The session currently holds only its identity: the auto-generated `participantId`, the
typed `anonId`, the step switches and the interaction order. Nothing calls `Store.log()`,
`Store.addResult()` or `Store.setSurvey()` yet. The hook points are marked in `js/task.js`
(`confirm`) and `js/screens.js` (`submitSurvey`).

`loggingEnabled` is `false` by default, so nothing is POSTed until you turn it on.

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
| `strings.json` | All interface text and placeholder questionnaires (English) |
| `tasks/*.json` | The three task sets |

After editing JS or CSS, bump the `?v=N` on the tags in `index.html`. The preview browser caches hard.
