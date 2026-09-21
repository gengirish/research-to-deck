import { useEffect } from "react";

export interface ToastMessage {
  /** Bumped on every new toast, so re-confirming the same action re-announces it. */
  id: number;
  /** The uppercase eyebrow — a word for the state, since the accent rule is not one. */
  label: string;
  text: string;
}

/**
 * A polite confirmation for something that happened outside the page.
 *
 * Three rules it exists to keep:
 *
 *  - **The dock is always mounted.** `aria-live` only announces changes *within* a
 *    region that was already there; a region that appears together with its own
 *    message is usually announced late or not at all.
 *  - **It never takes focus.** Nothing here calls `focus()`. Someone mid-keyboard
 *    on the thumbnail rail keeps their place; the close button is reachable by Tab
 *    when they want it, and ignorable when they do not.
 *  - **It dismisses itself.** Four seconds, cleared and restarted whenever a new
 *    message arrives, so a second download does not inherit the first's remaining
 *    time.
 *
 * `role` is deliberately absent: `aria-live="polite"` on a plain container is the
 * quietest thing that still announces, and `role="alert"` would be assertive.
 */
export default function ToastDock({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div className="toast-dock" aria-live="polite" aria-atomic="true">
      {toast && (
        <div className="toast" key={toast.id}>
          <span className="toast-body">
            <span className="toast-label">{toast.label}</span>
            <span className="toast-text">{toast.text}</span>
          </span>
          <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss notification">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
