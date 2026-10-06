// "Last action" undo (delete/hide/status) — one slot, most-recent action
// only, the Gmail "Undo Send" model, not a full history stack.
//
// Takes setEditSavedAt as a parameter rather than owning it: a reverted
// item might be the one currently open in Item Profile, which manages its
// own optimistic local state and won't otherwise notice the change — this
// reuses that "an authoritative external change just landed" signal.
//
// pushUndoAction is called from App.jsx's own delete/hide/status handlers
// (which capture the item-mutation revert/commit closures) — this hook
// only owns the timer/display mechanism.
import { useRef, useState, useCallback } from "react";
import { UNDO_WINDOW_MS } from "../tokens.js";

export function useUndoAction(setEditSavedAt) {
  // undoActionRef (not state) holds the actual revert/commit closures so
  // pushUndoAction can read the *current* pending action synchronously;
  // undoDisplay is what the toast renders (label + a fresh key per action,
  // restarting its countdown animation on remount).
  const undoActionRef = useRef(null);
  const undoTimerRef  = useRef(null);
  const [undoDisplay, setUndoDisplay] = useState(null);

  const clearUndoTimer = () => {
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
  };

  // Runs when the window expires OR a new action replaces this one — either
  // way, whatever was pending needs to happen exactly once (a delayed
  // delete's real DB removal; hide/status commits are a no-op).
  const finalizeCurrentUndo = useCallback(() => {
    clearUndoTimer();
    const action = undoActionRef.current;
    undoActionRef.current = null;
    setUndoDisplay(null);
    action?.commit?.();
  }, []);

  const pushUndoAction = useCallback((label, { revert, commit }) => {
    const previous = undoActionRef.current;
    clearUndoTimer();
    undoActionRef.current = { revert, commit };
    setUndoDisplay({ label, key: Date.now() });
    undoTimerRef.current = setTimeout(finalizeCurrentUndo, UNDO_WINDOW_MS);
    // Finalize (not revert) whatever this one is replacing.
    previous?.commit?.();
  }, [finalizeCurrentUndo]);

  const handleUndoClick = useCallback(async () => {
    clearUndoTimer();
    const action = undoActionRef.current;
    undoActionRef.current = null;
    setUndoDisplay(null);
    // Awaited (status's revert is async) so the items array updates before
    // the resync signal below fires — bumping it first would resync Item
    // Profile against the still-stale item prop.
    await action?.revert?.();
    setEditSavedAt(Date.now());
  }, [setEditSavedAt]);

  return { undoDisplay, pushUndoAction, handleUndoClick };
}
