# eResus session format

This is the JSON both apps exchange when an arrest moves between devices: Firestore transfers (QR / 6-digit code), AirDrop `.eresus` files, and the iOS crash backup. The iOS app and the PWA must both read and write it exactly as described here.

Keep this file and `fixtures/` identical in both repos (`eResus` and `eresus-web`).

## Versions

| `formatVersion` | Written by | Notes |
|---|---|---|
| missing | iOS 1.2 and earlier, PWA before v1.3 | Treat as version 1 |
| `2` | iOS 1.3+, PWA v1.3+ | Adds the fields marked *v2* below |

Version 2 is a superset of version 1: every v1 field keeps its name, type and meaning. That is deliberate, because iOS 1.2 is still installed and decodes this JSON with `JSONDecoder` into `UndoState`. It ignores fields it doesn't know and fails only if a required field is missing or the wrong type.

Rules for future versions:
- Never rename or retype an existing field. Add a new optional field instead.
- New fields must be optional, with a safe default when missing.
- Bump `formatVersion` only when a reader would need to behave differently.

## Encoding

- JSON object, UTF-8.
- Firestore `transfers/{code}`: in field `stateData`, as a string (iOS) or Bytes (PWA). Readers accept both, plus a base64 string or plain JSON from older PWA builds.
- Dates are **seconds since 1 January 2001 UTC** (Apple reference date), as numbers. PWA builds before v1.3 sometimes sent ISO 8601 strings; readers accept both.
- Times within the arrest (`cprCycleStartTime`, event timestamps and so on) are **seconds**, measured on the total-time scale: time since Start plus `timeOffset`. 0 is when the first ambulance resource (crew or CFR) confirmed cardiac arrest, or for a newborn, birth.

## Fields

Required means iOS 1.2 cannot decode the session without it.

### Timing

| Field | Type | Required | Meaning |
|---|---|---|---|
| `startTime` | number (Apple date) or null | | When Start was tapped (shifted forward by any paused time) |
| `masterTime` | number | yes | Seconds since Start at the moment of encoding. Readers recompute from `startTime` |
| `timeOffset` | number | yes | Estimated time between the arrest being confirmed (newborn: birth) and Start, set with +1/+5/+10 or by voice. Counts towards ToR timing. Apps before v1.3 called it downtime and may have included time before arrival |
| `cprTime` | number | yes | Seconds left in the current CPR cycle at encoding |
| `cprCycleStartTime` | number | | Total time at which the current cycle started. If missing, derive: `masterTime + timeOffset - (cycleDuration - cprTime)` |
| `isTimerPaused` | bool | | |
| `pauseStartTime` | number (Apple date) | | |
| `roscTime` | number | | Total time of ROSC |
| `torTime` | number | | *v2, PWA.* Total time of TOR. iOS derives it from the event log |
| `vodTime` | number | | *v2, PWA.* Total time of VOD |

### State

| Field | Type | Required | Values |
|---|---|---|---|
| `arrestState` | string | yes | `PENDING`, `ACTIVE`, `ROSC`, `DECEASED` |
| `arrestType` | string | yes | `GENERAL`, `NEWBORN`. The PWA can't open `NEWBORN` yet and refuses it |
| `isPreterm` | bool | yes | Newborn only |
| `nlsState` | string | yes | `initialAssessment`, `inflationBreaths`, `optimiseAirway`, `advancedAirway`, `ventilation`, `continueVentilation`, `compressions` |
| `nlsCycleDuration` | number | yes | Newborn cycle length (seconds) |
| `uiState` | object | yes | `{"default":{}}`, `{"analyzing":{}}` or `{"shockAdvised":{}}`. Readers also accept the bare string |
| `isRhythmCheckDue` | bool | yes | |
| `rhythmCheckDueAt` | number | | *v2.* Total time at which the current rhythm check fell due, while it is due. iOS moves `cprCycleStartTime` on to the next cycle while a check is overdue, so readers use this to show how late the check is. Missing when no check is due |

### Counts and drugs

| Field | Type | Required | Meaning |
|---|---|---|---|
| `shockCount` | int | yes | Shocks actually delivered, including all three of a stacked set |
| `stackedShockExtra` | int | | *v2.* `2` if the first shocks were three stacked shocks, otherwise `0` or missing. Drug timing uses `shockCount - stackedShockExtra` (RCUK: stacked shocks count as the first shock) |
| `adrenalineCount`, `amiodaroneCount`, `lidocaineCount` | int | yes | |
| `lastAdrenalineTime` | number | | Total time of the last adrenaline dose |
| `antiarrhythmicGiven` | string | yes | `none`, `amiodarone`, `lidocaine` |
| `shockCountForAmiodarone1` | int | | `shockCount` when the first amiodarone dose was given |
| `hideAdrenalinePrompt`, `hideAmiodaronePrompt`, `hideAdrenalineDueWarning`, `lastRhythmNonShockable` | bool | | Prompt state |

### Procedures and patient

| Field | Type | Required | Meaning |
|---|---|---|---|
| `airwayPlaced` | bool | yes | |
| `airwayAdjunct` | string | | `sga`, `ett`, `unspecified` |
| `patientAgeCategory` | string | | One of the age bands, e.g. `≥12 years / Adult`, `6 years`, `At birth` (identical strings in both apps) |
| `patientAgeStr`, `patientGenderStr` | string | | |
| `initialRhythm` | string | | e.g. `VF`, `Asystole` |

### Checklists

`reversibleCauses`, `postROSCTasks`, `postMortemTasks`, `nlsPretermTasks` (all required arrays) of:

```json
{ "id": "UUID string", "name": "Hypoxia", "isCompleted": false, "hypothermiaStatus": "none" }
```

`id` must be a valid UUID string for iOS. `hypothermiaStatus` is `none`, `severe`, `moderate` or `normothermic`.

`vodChecklist` and `vodConfirmed` are *v2, PWA* and use the same item shape.

### Events

`eventsData` (required): base64 of a JSON array, newest first:

```json
{ "id": "UUID string", "timestamp": 640.0, "message": "Shock 2 Delivered", "type": "shock" }
```

`type` is one of `status`, `cpr`, `shock`, `analysis`, `rhythm`, `drug`, `airway`, `etco2`, `cause`. Writers map anything else (such as the PWA's `vascularAccess`) to `status`.

`clock` (optional, *v2*): when the entry happened, as **seconds since 1 January 1970 UTC** (Unix time, unlike the Apple dates above), e.g. `"clock": 1793887200.5`. The arrest clock stops while paused, so real times can't be worked out from `timestamp` afterwards; summaries use `clock` when present and otherwise derive the time from `startTime`. Writers include it for every entry that has one; entries from older builds have none. Back-dated entries carry the real time they refer to.

A message containing `(estimated)` was logged after the fact: back-dated by voice, or given before eResus was started (those sit at the moment of Start, `timestamp` = `timeOffset`, and say "times unknown"). The text is the record, so there is no separate field; research uploads add `estimated` derived from it.

When `timeOffset` > 0 there is one `status` event at 0 starting "Cardiac arrest confirmed ~" (newborn: "Born ~"), giving the estimate in whole minutes. Writers replace it rather than adding another when the estimate changes, and move every other timestamp by the same amount.

## Fixtures

`fixtures/` holds sample sessions that both apps' tests decode:

- `session-ios-v1.json`: as written by iOS 1.2. No `formatVersion` or `cprCycleStartTime`; the cycle start must be derived as 640.
- `session-v2.json`: three stacked shocks plus one more (`shockCount` 4, `stackedShockExtra` 2, so 2 for drug timing), one adrenaline dose, cycle start 630.
- `session-v2-from-pwa.json`: written by the PWA encoder (`src/lib/sessionFormat.ts`) from `session-v2.json`, with a PWA-only event type and non-UUID checklist ids, so iOS tests prove a PWA-to-iOS transfer decodes. Regenerate it if the encoder changes.
