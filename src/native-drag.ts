/**
 * Dragging one of native Canvas's own card-menu buttons to a point of the
 * board, replayed.
 *
 * Every button of that menu - card, note, media, and on a tablet slide and
 * group - makes its item when it is dragged onto the board: it listens for
 * the press on itself, then for the moves and the release on the window, and
 * creates the item where the release was.  Its click makes the item at the
 * middle of the view, which is not where a person means.  Replaying the drag
 * to a point has native Canvas do what it does for a person's own drag - a
 * card open in its editor, the note picker, the media picker - at that
 * point, so the plugin makes nothing of its own and the item is the same
 * native item.
 */

export interface DragPoint {
  readonly x: number;
  readonly y: number;
}

/** A pointer id that no mouse, finger or pen on the screen is given. */
const REPLAY_POINTER_ID = 4242;

/**
 * Presses `button` and drags it to `point`, in the button's own window.
 * Every event is handed to `onEvent` before it is sent, so a caller's own
 * listeners can tell them from a person's.  False when the window cannot
 * send pointer events.
 */
export function replayNativeDrag(button: HTMLElement, point: DragPoint, onEvent?: (event: Event) => void): boolean {
  const view = button.ownerDocument?.defaultView;
  const Pointer = view?.PointerEvent;
  if (view === null || view === undefined || typeof Pointer !== "function") return false;
  const box = button.getBoundingClientRect();
  const from = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const shared = {
    bubbles: true, cancelable: true, composed: true, view,
    pointerId: REPLAY_POINTER_ID, pointerType: "mouse", isPrimary: true, button: 0,
  };
  // A dragged item snaps to its neighbours unless Alt is held (Ctrl on a
  // Mac); the press means this very point, so it is held.
  const unsnapped = { altKey: true, ctrlKey: true };
  const send = (target: EventTarget, type: string, init: PointerEventInit): void => {
    const event = new Pointer(type, { ...shared, ...init });
    onEvent?.(event);
    target.dispatchEvent(event);
  };
  send(button, "pointerdown", { buttons: 1, clientX: from.x, clientY: from.y });
  send(view, "pointermove", { buttons: 1, clientX: point.x, clientY: point.y, ...unsnapped });
  send(view, "pointerup", { buttons: 0, clientX: point.x, clientY: point.y, ...unsnapped });
  return true;
}
