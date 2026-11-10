// Sheets for logging drugs, traumatic arrest interventions and post-ROSC observations (matches iOS
// ClinicalSheets.swift).
import React, { useEffect, useMemo, useState } from "react";
import { Bandage, Check, CheckCircle2, ChevronDown, Search } from "lucide-react";
import Modal from "./Modal";
import {
  bpEntry,
  destinations,
  drugGroupsFor,
  ECG_RESULTS,
  hhmm,
  observationPlaceholder,
  observationValue,
  ROSC_OBSERVATIONS,
  TRAUMA_EARLY_ACTIONS,
  TRAUMA_GROUPS,
  type DrugGroupKind,
  type ROSCObservation,
} from "@/lib/arrestRecord";
import { repeatMessage, type RepeatCheck } from "@/lib/repeatCheck";

const ROW =
  "w-full text-left px-3 py-2 min-h-11 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-white";
const SECTION = "text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400";
const FIELD =
  "w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-tone-accent";

const Section: React.FC<React.PropsWithChildren<{ title?: string; footer?: string }>> = ({ title, footer, children }) => (
  <div className="space-y-2">
    {title && <h4 className={SECTION}>{title}</h4>}
    <div className="space-y-1.5">{children}</div>
    {footer && <p className="text-xs text-gray-500 dark:text-gray-400">{footer}</p>}
  </div>
);

const FreeText: React.FC<{ placeholder: string; onLog: (text: string) => void }> = ({ placeholder, onLog }) => {
  const [text, setText] = useState("");
  const log = () => {
    const name = text.trim();
    if (!name) return;
    onLog(name);
    setText("");
  };
  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && log()}
        placeholder={placeholder}
        enterKeyHint="done"
        className={FIELD}
      />
      <button
        onClick={log}
        disabled={!text.trim()}
        className="px-4 rounded-xl font-semibold bg-tone-accent text-tone-on-accent disabled:opacity-40"
      >
        Log
      </button>
    </div>
  );
};

// A list row that says when it was last logged, e.g. "Tranexamic acid ... ✓ 14:32" (matches iOS LoggedRowLabel).
const LoggedRowLabel: React.FC<{ title: string; loggedAt: Date | null }> = ({ title, loggedAt }) => (
  <span className="flex items-center justify-between gap-2">
    <span>{title}</span>
    {loggedAt && (
      <span
        className="flex items-center gap-1 text-sm tabular-nums text-gray-500 dark:text-gray-400"
        aria-label={`Logged at ${hhmm(loggedAt)}`}
      >
        <Check size={14} aria-hidden="true" />
        {hhmm(loggedAt)}
      </span>
    )}
  </span>
);

// Something logged again soon after the last one is asked about, so a slip doesn't become a dose.
export const RepeatPromptModal: React.FC<{ message: string; onCancel: () => void; onConfirm: () => void }> = ({
  message,
  onCancel,
  onConfirm,
}) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="repeat-prompt-title"
      aria-describedby="repeat-prompt-message"
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 text-center"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="repeat-prompt-title" className="text-lg font-semibold text-gray-900 dark:text-white">
        Log again?
      </h2>
      <p id="repeat-prompt-message" className="text-gray-700 dark:text-gray-300">
        {message}
      </p>
      <div className="flex gap-3">
        <button
          autoFocus
          onClick={onCancel}
          className="flex-1 min-h-11 rounded-xl font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          Cancel
        </button>
        <button onClick={onConfirm} className="flex-1 min-h-11 rounded-xl font-semibold bg-tone-accent text-tone-on-accent">
          Log again
        </button>
      </div>
    </div>
  </div>
);

// MARK: Other medications

export const OtherDrugsSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  newborn?: boolean;
  // Shown first, e.g. "Sedation & RSI" from the post-ROSC screen.
  focus?: DrugGroupKind | null;
  // Drugs already given this arrest, most recent first.
  recent?: string[];
  // When a drug was last logged this arrest, shown as "✓ HH:mm".
  lastGiven?: (drug: string) => Date | null;
  onSelect: (drug: string) => void;
}> = ({ isOpen, onClose, newborn = false, focus = null, recent = [], lastGiven = () => null, onSelect }) => {
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  const groups = useMemo(() => drugGroupsFor(newborn, focus), [newborn, focus]);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...new Set(groups.flatMap((g) => g.drugs))].sort().filter((d) => d.toLowerCase().includes(term));
  }, [groups, search]);

  const row = (drug: string) => (
    <button key={drug} onClick={() => onSelect(drug)} className={ROW}>
      <LoggedRowLabel title={drug} loggedAt={lastGiven(drug)} />
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Medication">
      <div className="space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drugs"
            aria-label="Search drugs"
            className={`${FIELD} pl-9`}
          />
        </div>
        {search.trim() ? (
          <Section>{matches.map(row)}</Section>
        ) : (
          <>
            {recent.length > 0 && <Section title="Given this arrest">{recent.map(row)}</Section>}
            {groups.map((group) => (
              <Section key={group.kind} title={group.title}>
                {group.drugs.map(row)}
              </Section>
            ))}
          </>
        )}
        <Section footer="Arrest doses of adrenaline, amiodarone and lidocaine have their own buttons, so they count towards the timers.">
          <FreeText placeholder="Not listed? Type the drug" onLog={onSelect} />
        </Section>
      </div>
    </Modal>
  );
};

// MARK: Traumatic cardiac arrest

// JRCALC: in traumatic cardiac arrest, treat hypovolaemia, oxygenation, tension pneumothorax and tamponade by
// clinical priority (not in order) before chest compressions and ALS drugs.
export const HOTTCard: React.FC<{ compact?: boolean; onOpen?: () => void; onNotTrauma?: () => void }> = ({
  compact = false,
  onOpen,
  onNotTrauma,
}) => (
  <div className="p-4 rounded-xl bg-tone-tint text-tone-on-tint space-y-2">
    <div className="flex items-center gap-2 font-bold">
      <Bandage size={18} aria-hidden="true" />
      <span>Traumatic arrest: HOTT first</span>
    </div>
    <p className="text-sm font-semibold">Hypovolaemia · Oxygenation · Tension pneumothorax · Tamponade</p>
    {!compact && (
      <p className="text-xs opacity-85">
        By clinical priority, not in order. Give TXA early and request enhanced or critical care. Penetrating trauma: convey
        rapidly and do interventions en route.
      </p>
    )}
    {(onOpen || onNotTrauma) && (
      <div className="flex items-center justify-between pt-1">
        {onOpen ? (
          <button onClick={onOpen} className="min-h-11 text-sm font-bold underline-offset-2 hover:underline">
            Trauma interventions
          </button>
        ) : (
          <span />
        )}
        {onNotTrauma && (
          <button onClick={onNotTrauma} aria-description="Restores drug prompts" className="min-h-11 text-sm">
            Not trauma
          </button>
        )}
      </div>
    )}
  </div>
);

export const TraumaSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  isTrauma: boolean;
  onSetTrauma: (isTrauma: boolean) => void;
  onLogProcedure: (procedure: string) => void;
  // Whether logging this now would be a double tap or a repeat to ask about.
  repeatCheckFor: (name: string) => RepeatCheck;
  loggedAt: (name: string) => Date | null;
  // Drugs go through the usual dose prompt, so they're handed back to the arrest screen.
  onDrug: (drug: string) => void;
  onFluids: () => void;
}> = ({ isOpen, onClose, isTrauma, onSetTrauma, onLogProcedure, repeatCheckFor, loggedAt, onDrug, onFluids }) => {
  const [repeatPrompt, setRepeatPrompt] = useState<{ message: string; proceed: () => void } | null>(null);
  useEffect(() => {
    if (!isOpen) setRepeatPrompt(null);
  }, [isOpen]);
  // A double tap is dropped and a repeat within a minute is asked about, as on the drug buttons.
  const log = (procedure: string) => {
    const proceed = () => {
      onLogProcedure(procedure);
      onClose();
    };
    const check = repeatCheckFor(procedure);
    if (check.kind === "new") proceed();
    else if (check.kind === "confirm") setRepeatPrompt({ message: repeatMessage(procedure, check.ago, check.at), proceed });
  };
  // Turned on first, so the drug is logged as part of a traumatic arrest.
  const pick = (action: () => void) => {
    onSetTrauma(true);
    onClose();
    action();
  };
  const row = (procedure: string) => (
    <button key={procedure} onClick={() => log(procedure)} className={ROW}>
      <LoggedRowLabel title={procedure} loggedAt={loggedAt(procedure)} />
    </button>
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Trauma">
        <div className="space-y-4">
          <HOTTCard />
          <Section footer="Quietens the drug prompts so HOTT comes first; drug buttons still work. Logging any intervention below turns this on. If the cause is medical (with injuries), switch it off and follow ALS.">
            <label className="flex items-center justify-between min-h-11 px-3 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
              <span>Traumatic cardiac arrest</span>
              <input
                type="checkbox"
                role="switch"
                checked={isTrauma}
                onChange={(e) => onSetTrauma(e.target.checked)}
                className="w-5 h-5 accent-[rgb(var(--tone-accent))]"
              />
            </label>
          </Section>
          <Section title="Early actions">
            {TRAUMA_EARLY_ACTIONS.map(row)}
            <button onClick={() => pick(() => onDrug("Tranexamic acid"))} className={ROW}>
              <LoggedRowLabel title="Tranexamic acid" loggedAt={loggedAt("Tranexamic acid")} />
            </button>
            <button onClick={() => pick(onFluids)} className={ROW}>
              Fluids & blood…
            </button>
          </Section>
          {TRAUMA_GROUPS.map((group) => (
            <Section key={group.title} title={group.title}>
              {group.procedures.map(row)}
            </Section>
          ))}
          <FreeText placeholder="Other intervention" onLog={log} />
        </div>
      </Modal>
      {isOpen && repeatPrompt && (
        <RepeatPromptModal
          message={repeatPrompt.message}
          onCancel={() => setRepeatPrompt(null)}
          onConfirm={() => {
            const { proceed } = repeatPrompt;
            setRepeatPrompt(null);
            proceed();
          }}
        />
      )}
    </>
  );
};

// JRCALC conditions unequivocally associated with death. They apply to all arrests and are met more often in
// traumatic arrest, so the section opens by itself then.
export const SomaticCriteriaSection: React.FC<{ isPaediatric: boolean; initiallyExpanded: boolean }> = ({
  isPaediatric,
  initiallyExpanded,
}) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between text-left text-sm font-bold text-gray-900 dark:text-white min-h-11"
      >
        <span>Conditions unequivocally associated with death</span>
        <ChevronDown size={18} className={`flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="space-y-2.5 pt-2 text-xs text-gray-800 dark:text-gray-200">
          <p>Resuscitation is not indicated, or can be stopped, if any of these are present:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Decapitation</li>
            <li>Massive cranial and cerebral destruction (far beyond a simple depressed skull fracture)</li>
            <li>Hemicorporectomy or similar massive injury</li>
            <li>Over 95% full-thickness burns, or incineration clearly incompatible with life</li>
            <li>Decomposition or putrefaction</li>
            <li>Prolonged submersion (see Drowning)</li>
            <li>Post-mortem hypostasis</li>
            <li>Rigor mortis (not rigidity at the moment of arrest)</li>
          </ul>
          {isPaediatric && (
            <p className="p-2 rounded-lg font-semibold bg-tone-tint text-tone-on-tint">
              Children: hypostasis or rigor mortis alone is not enough. All three of hypostasis, rigor mortis and asystole must
              be present. Foetal maceration also applies to newborns.
            </p>
          )}
          <p className="text-gray-500 dark:text-gray-400">
            Never use a single sign in isolation: interpret it with the history and circumstances.
          </p>
        </div>
      )}
    </div>
  );
};

// MARK: Post-ROSC observations

export const ObservationButton: React.FC<{
  observation: ROSCObservation;
  latest: { value: string; time: number } | null;
  now: number;
  onClick: () => void;
}> = ({ observation, latest, now, onClick }) => {
  const { title } = ROSC_OBSERVATIONS[observation];
  const minutes = latest ? Math.floor(Math.max(0, now - latest.time) / 60) : 0;
  const age = minutes === 0 ? "now" : `${minutes} min`;
  return (
    <button
      onClick={onClick}
      aria-label={latest ? `${title}, last ${latest.value}, ${age} ago` : `Log ${title}`}
      className="flex flex-col items-center justify-center min-h-14 px-1.5 py-1 rounded-xl bg-tone-tint text-tone-on-tint active:scale-95 transition-transform"
    >
      <span className="flex items-center gap-1.5 font-semibold">
        {latest && <CheckCircle2 size={16} aria-hidden="true" />}
        <span className="truncate">{title}</span>
      </span>
      {latest && (
        <span className="text-xs font-mono opacity-80 truncate max-w-full">
          {latest.value} · {age}
        </span>
      )}
    </button>
  );
};

export const ObservationSheet: React.FC<{
  observation: ROSCObservation | null;
  onClose: () => void;
  onConfirm: (value: string) => void;
}> = ({ observation, onClose, onConfirm }) => {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  useEffect(() => {
    setFirst("");
    setSecond("");
  }, [observation]);
  if (!observation) return null;

  const confirm = (value: string) => {
    onConfirm(value);
    onClose();
  };
  const bp = observation === "bp" ? bpEntry(first, second) : null;
  const single = observationValue(observation, first);
  const numberField = (placeholder: string, value: string, set: (v: string) => void, autoFocus = false) => (
    <input
      type="text"
      inputMode={observation === "bp" || observation === "spo2" ? "numeric" : "decimal"}
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      autoFocus={autoFocus}
      className={`${FIELD} text-center text-2xl font-mono font-bold`}
    />
  );
  const logButton = (enabled: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={!enabled}
      className="w-full h-12 rounded-xl font-semibold bg-tone-accent text-tone-on-accent disabled:opacity-40"
    >
      Log
    </button>
  );

  return (
    <Modal isOpen onClose={onClose} title={`Log ${ROSC_OBSERVATIONS[observation].title}`}>
      <div className="space-y-4">
        {observation === "ecg" &&
          ECG_RESULTS.map((result) => (
            <button
              key={result}
              onClick={() => confirm(result)}
              className={`w-full h-14 rounded-xl font-semibold ${
                result === "STEMI" ? "bg-tone-slate text-tone-on-slate" : "bg-tone-tint text-tone-on-tint"
              }`}
            >
              {result}
            </button>
          ))}
        {observation === "bp" && (
          <>
            <div className="flex items-center gap-3">
              {numberField("Systolic", first, setFirst, true)}
              <span className="text-2xl text-gray-500">/</span>
              {numberField("Diastolic", second, setSecond)}
            </div>
            {bp && (
              <p className="text-center font-mono font-semibold text-gray-500 dark:text-gray-400">
                MAP {bp.map} mmHg
              </p>
            )}
            {logButton(bp !== null, () => bp && confirm(bp.value))}
          </>
        )}
        {observation !== "ecg" && observation !== "bp" && (
          <>
            {numberField(observationPlaceholder[observation] ?? "", first, setFirst, true)}
            {single && "error" in single && <p className="text-sm text-tone-danger">{single.error}</p>}
            {logButton(!!single && "value" in single, () => single && "value" in single && confirm(single.value))}
          </>
        )}
      </div>
    </Modal>
  );
};

export const DestinationSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  traumatic: boolean;
  onConfirm: (text: string) => void;
}> = ({ isOpen, onClose, traumatic, onConfirm }) => {
  const confirm = (text: string) => {
    onConfirm(text);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Conveyance">
      <div className="space-y-4">
        <Section
          footer={
            traumatic
              ? "After a traumatic arrest, convey to an MTC unless the airway, ventilation or haemorrhage can't be safely managed."
              : undefined
          }
        >
          {destinations(traumatic).map((place) => (
            <button key={place} onClick={() => confirm(`Conveying to: ${place}`)} className={ROW}>
              {place}
            </button>
          ))}
        </Section>
        <Section>
          <button onClick={() => confirm("Pre-alert given")} className={ROW}>
            Pre-alert given
          </button>
          <button onClick={() => confirm("Left scene")} className={ROW}>
            Left scene
          </button>
        </Section>
      </div>
    </Modal>
  );
};
