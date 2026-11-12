import React, { useEffect, useState } from "react";
import { BriefcaseMedical, Hand, Smartphone, Syringe, Timer } from "lucide-react";

// Bump when the pages change, so the tour shows once more after an update (matches iOS WhatsNewView).
export const WHATS_NEW_VERSION = "1.3";
export const WHATS_NEW_KEY = "eResusLastSeenWhatsNew";

export const hasSeenWhatsNew = (): boolean => {
  try {
    return localStorage.getItem(WHATS_NEW_KEY) === WHATS_NEW_VERSION;
  } catch {
    return true;
  }
};

export const markWhatsNewSeen = () => {
  try {
    localStorage.setItem(WHATS_NEW_KEY, WHATS_NEW_VERSION);
  } catch {
    // Private browsing: the tour may show again, which is harmless.
  }
};

interface Page {
  icon: React.ReactNode;
  title: string;
  lines: string[];
}

// A short tour of what changed. It never stands between the crew and Start: Skip is always in reach, and it
// isn't shown while an arrest is running.
const WhatsNewView: React.FC<{ isOpen: boolean; onClose: () => void; voiceCommandsEnabled?: boolean }> = ({
  isOpen,
  onClose,
  voiceCommandsEnabled = false,
}) => {
  const [page, setPage] = useState(0);
  // Escape skips, like the Skip button.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        markWhatsNewSeen();
        setPage(0);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  const pages: Page[] = [
    {
      icon: <Hand size={40} />,
      title: "Still one tap to start",
      lines: [
        "Start Arrest begins the clock straight away. Nothing to fill in first.",
        "Arrived after the arrest was confirmed? +1, +5 and +10 add that time, and it counts towards ToR timing.",
        "Shocks or drugs given before eResus: tap the counters under the clock.",
      ],
    },
    {
      icon: <Syringe size={40} />,
      title: "Drugs show when they're due",
      lines: [
        "The adrenaline and amiodarone buttons turn amber and count down to the next dose.",
        "A quick double tap logs one dose, not two. Logging the same drug again soon asks first.",
        "Other Meds has fluids, blood, sedation and the rest, with the time each was last given.",
      ],
    },
    {
      icon: <Timer size={40} />,
      title: "The ring keeps time",
      lines: [
        "When a rhythm check is due the header turns red, and the next cycle carries on counting so you can see how late it is.",
        "Spoken prompts say when a check or a drug is due. Mute them for a case with the speaker button.",
        voiceCommandsEnabled
          ? "Hold the ring and speak to log by voice: “adrenaline 1 mg”, “rhythm check VF, shock delivered”."
          : "Voice commands can be switched on in Settings: hold the ring and speak to log.",
      ],
    },
    {
      icon: <BriefcaseMedical size={40} />,
      title: "Trauma, ROSC and handover",
      lines: [
        "Trauma logs HOTT interventions. Traumatic arrest mode pauses drug reminders while HOTT comes first.",
        "After ROSC the screen switches to post-ROSC care: observations, targets and conveyance.",
        "Transfer moves the whole arrest, timers included, to another phone with a code or QR.",
      ],
    },
    {
      icon: <Smartphone size={40} />,
      title: "Works offline",
      lines: [
        "Add eResus to your home screen and it opens like an app, with or without signal.",
        "On iPhone, the eResus app also shows the arrest clock on the Lock Screen and in the Dynamic Island.",
      ],
    },
  ];

  const finish = () => {
    markWhatsNewSeen();
    setPage(0);
    onClose();
  };
  const isLast = page === pages.length - 1;
  const current = pages[page];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label="What's New">
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="font-semibold text-muted-foreground">What's New</span>
        {/* Big enough to find without looking, for anyone who opens the app mid-job. */}
        <button autoFocus onClick={finish} className="min-h-11 px-5 rounded-full bg-tone-tint text-tone-on-tint font-semibold">
          Skip
        </button>
      </div>

      <div className="flex-grow overflow-y-auto px-7 max-w-lg w-full mx-auto">
        <div className="mt-6 w-20 h-20 rounded-[22px] bg-tone-tint text-tone-on-tint flex items-center justify-center" aria-hidden="true">
          {current.icon}
        </div>
        <h2 className="mt-5 text-3xl font-bold text-foreground">{current.title}</h2>
        <ul className="mt-5 space-y-3.5">
          {current.lines.map((line) => (
            <li key={line} className="flex gap-2.5 text-base text-foreground">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-tone-accent shrink-0" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-center gap-2 py-4" aria-hidden="true">
        {pages.map((_, index) => (
          <span
            key={index}
            className={`h-2 rounded-full transition-all ${index === page ? "w-5 bg-tone-accent" : "w-2 bg-muted-foreground/30"}`}
          />
        ))}
      </div>

      <div className="px-6 pb-6 max-w-lg w-full mx-auto">
        <button
          onClick={() => (isLast ? finish() : setPage(page + 1))}
          className="w-full min-h-[54px] rounded-2xl bg-tone-accent text-white font-semibold text-lg active:scale-[0.99] transition-transform"
        >
          {isLast ? "Done" : "Next"}
        </button>
        {page > 0 && (
          <button onClick={() => setPage(page - 1)} className="w-full min-h-11 mt-1 text-sm font-medium text-muted-foreground">
            Back
          </button>
        )}
      </div>
    </div>
  );
};

export default WhatsNewView;
