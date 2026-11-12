// The arrest summary, for a live arrest and for the logbook (matches iOS SummaryView.swift).
import React, { useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import Modal from "./Modal";
import { buildSummary, type ArrestSummary, type SummaryInput } from "@/lib/arrestSummary";

const CARD = "p-4 rounded-xl bg-gray-50 dark:bg-gray-700 space-y-2.5";
const HEADING = "text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400";

const OUTCOME_CLASSES: Record<ArrestSummary["outcome"]["kind"], string> = {
  rosc: "bg-tone-positive text-tone-on-positive",
  stopped: "bg-tone-danger text-tone-on-danger",
  inProgress: "bg-tone-slate text-tone-on-slate",
};

const Row: React.FC<{ label: string; value: string; emphasis?: string }> = ({ label, value, emphasis }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-gray-500 dark:text-gray-400">{label}</span>
    <span className={`font-mono font-semibold ${emphasis ?? "text-gray-900 dark:text-white"}`}>{value}</span>
  </div>
);

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex-1 text-center">
    <div className="font-mono text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</div>
  </div>
);

const SummaryView: React.FC<
  SummaryInput & { isOpen: boolean; onClose: () => void; typeColour?: (type: string) => string }
> = ({ isOpen, onClose, typeColour, ...input }) => {
  const [copied, setCopied] = useState(false);
  const s = useMemo(
    () => buildSummary(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input.events, input.totalTime, input.startTime, input.shockCount, input.adrenalineCount, input.amiodaroneCount,
      input.lidocaineCount, input.patientAge, input.patientGender],
  );
  if (!isOpen) return null;

  const copy = () => {
    navigator.clipboard
      .writeText(s.copyText)
      .then(() => {
        navigator.vibrate?.(15);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error("Failed to copy summary: ", err));
  };

  const timed = (event: ArrestSummary["events"][number] | undefined) => (event ? `${s.time(event)}  ${s.minutesIn(event)}` : null);
  const keyTimes: [string, string | null][] = [
    ["Initial rhythm", s.initialRhythm],
    ["First shock", timed(s.firstShock)],
    ["First adrenaline", timed(s.firstAdrenaline)],
    ["First IV / IO", timed(s.firstAccess)],
    ["First airway", timed(s.firstAirway)],
    ...(s.destination ? [[s.destination.message.slice("Conveying to: ".length), s.time(s.destination)] as [string, string]] : []),
    ["Pre-alert", s.preAlert ? s.time(s.preAlert) : null],
  ];
  const shownKeyTimes = keyTimes.filter((row): row is [string, string] => row[1] !== null);
  const outcomeEmphasis = s.outcome.kind === "rosc" ? "text-tone-positive" : "text-tone-danger";

  return (
    <Modal isOpen onClose={onClose} title="Summary">
      <div className="space-y-4">
        <div className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                {input.startTime
                  ? input.startTime.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                  : "Unknown date"}
              </h3>
              {s.demographics && <p className="text-sm text-gray-500 dark:text-gray-400">{s.demographics}</p>}
            </div>
            <span className={`px-2 py-1 rounded-lg text-xs font-black uppercase ${OUTCOME_CLASSES[s.outcome.kind]}`}>
              {s.outcomeLabel}
            </span>
          </div>
          <hr className="border-gray-200 dark:border-gray-600" />
          {s.confirmedEvent && <Row label="Arrest confirmed" value={`${s.time(s.confirmedEvent)} est`} />}
          {s.startedEvent && <Row label="eResus started" value={s.time(s.startedEvent)} />}
          {s.reArrests.length > 0 && s.firstROSC && <Row label="First ROSC" value={s.time(s.firstROSC)} />}
          {s.reArrests.map((event, i) => (
            <Row key={i} label="Re-arrest" value={s.time(event)} />
          ))}
          {s.outcome.event && (
            <Row
              label={s.outcome.kind === "rosc" ? "ROSC" : "Resuscitation stopped"}
              value={s.time(s.outcome.event)}
              emphasis={outcomeEmphasis}
            />
          )}
          {s.vod && <Row label="Death verified" value={s.time(s.vod)} />}
          <Row label={`Time from ${s.timedFrom}`} value={s.format(input.totalTime)} />
        </div>

        <div className={`${CARD} flex`}>
          <Stat label="Shocks" value={input.shockCount} />
          <Stat label="Adrenaline" value={input.adrenalineCount} />
          <Stat label={s.antiarrhythmic.name} value={s.antiarrhythmic.count} />
        </div>

        {shownKeyTimes.length > 0 && (
          <div className={CARD}>
            <h4 className={HEADING}>Key times</h4>
            {shownKeyTimes.map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
            {s.hasEstimates && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Times marked ~ or (estimated) were entered after the fact.
              </p>
            )}
          </div>
        )}

        <div className={CARD}>
          <div className={`flex justify-between ${HEADING}`}>
            <span>Timeline</span>
            <span>Clock · Arrest</span>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-600">
            {s.events.map((event, i) => (
              <div key={i} className="flex gap-3 py-1.5">
                <div className="w-16 flex-shrink-0 font-mono">
                  <div className={`text-sm font-semibold ${typeColour?.(event.type) ?? "text-gray-900 dark:text-white"}`}>
                    {s.time(event)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{s.format(event.timestamp)}</div>
                </div>
                <span
                  className={`text-sm ${event.message.includes("(estimated)") ? "text-gray-500 dark:text-gray-400" : "text-gray-800 dark:text-gray-200"}`}
                >
                  {event.message}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          eResus is a scribe aid. Check the record against your ePR.
        </p>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-12 rounded-xl font-semibold bg-tone-tint text-tone-on-tint">
            Done
          </button>
          <button
            onClick={copy}
            aria-description="Copies the summary and timeline as plain text"
            className={`flex-1 h-12 rounded-xl font-semibold flex items-center justify-center gap-2 ${
              copied ? "bg-tone-positive text-tone-on-positive" : "bg-tone-accent text-tone-on-accent"
            }`}
          >
            {copied ? <Check size={18} /> : <Clipboard size={18} />}
            <span>{copied ? "Copied" : "Copy for ePR"}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SummaryView;
