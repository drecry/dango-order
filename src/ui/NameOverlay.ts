/**
 * Name-only editing overlay (HTML layer), opened from the ranking
 * board's name button.
 *
 * Ported from Dango Drop's `ui/NameOverlay.ts` (via Dango Tower) with
 * Dango Order's colors, so the family games share one way of doing
 * this.
 *
 * ★Why HTML★
 *   Phaser's canvas has no text input. A real <input> keeps Japanese
 *   IME, prediction and paste working on phones.
 *
 * ★Why a separate overlay from OPTIONS★
 *   The ranking board is where your name is SEEN (next to your rank),
 *   so it is also where you should be able to fix it — without leaving
 *   the board. OPTIONS keeps its own name field too; both write
 *   through the same leaderboard identity storage.
 *
 * ★Save / Cancel, not save-on-close★
 *   Unlike OPTIONS (which saves on BACK), this overlay has explicit
 *   SAVE / CANCEL buttons, the Dango Drop way: a typo can be backed
 *   out of, and a rejected name keeps the overlay open with the
 *   reason shown.
 */
import { checkDisplayName, MAX_DISPLAY_NAME_LENGTH } from '../leaderboard';

let activeOverlay: HTMLDivElement | null = null;

const TEXT = {
  title: 'YOUR NAME',
  note: `Up to ${MAX_DISPLAY_NAME_LENGTH} characters. You can leave it empty.`,
  applyNote: 'Your new name appears from your next play.',
  placeholder: 'Player',
  save: 'SAVE',
  cancel: 'CANCEL',
} as const;

const COLOR = {
  backdrop: 'rgba(52, 32, 20, 0.72)',
  panel: '#fff7e6',
  border: '#5a3a28',
  text: '#5a3a28',
  subText: '#a08060',
  accent: '#e86a7a',
  accentText: '#ffffff',
  error: '#d93a2b',
} as const;

/** How many characters of the name the ranking board's button shows. */
const NAME_BUTTON_MAX_CHARS = 8;

/**
 * Label for the ranking board's name button: the saved name, or
 * "SET NAME" when there is none; long names are clipped with "…".
 * Pure, so it can be unit-tested without Phaser or the DOM.
 */
export const nameButtonLabel = (savedName: string | null): string => {
  if (savedName === null || savedName.length === 0) {
    return 'SET NAME';
  }
  return savedName.length > NAME_BUTTON_MAX_CHARS
    ? `${savedName.slice(0, NAME_BUTTON_MAX_CHARS)}…`
    : savedName;
};

export interface NameOverlayHandlers {
  readonly currentName: string | null;
  readonly onSave: (name: string) => void;
  readonly onClose?: () => void;
}

const applyStyle = (element: HTMLElement, styles: Record<string, string>): void => {
  for (const [key, value] of Object.entries(styles)) {
    element.style.setProperty(key, value);
  }
};

const makeButton = (label: string, background: string, color: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.textContent = label;
  applyStyle(button, {
    padding: '10px 22px',
    'font-family': "'Mochiy Pop One', sans-serif",
    'font-size': '15px',
    color,
    background,
    border: `3px solid ${COLOR.border}`,
    'border-radius': '12px',
    'box-shadow': '0 4px 0 rgba(0,0,0,.28)',
    cursor: 'pointer',
  });
  return button;
};

const closeOverlay = (): void => {
  activeOverlay?.remove();
  activeOverlay = null;
};

export const openNameOverlay = (handlers: NameOverlayHandlers): void => {
  if (activeOverlay !== null) {
    return;
  }

  const overlay = document.createElement('div');
  applyStyle(overlay, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    background: COLOR.backdrop,
    // In front of the game canvas (same layer as the options overlay).
    'z-index': '10000',
    padding: '16px',
  });

  const panel = document.createElement('div');
  applyStyle(panel, {
    width: 'min(360px, 90vw)',
    background: COLOR.panel,
    border: `4px solid ${COLOR.border}`,
    'border-radius': '18px',
    padding: '20px',
    display: 'flex',
    'flex-direction': 'column',
    gap: '10px',
    'text-align': 'center',
    'box-shadow': '0 8px 0 rgba(0,0,0,.28)',
  });

  const title = document.createElement('div');
  title.textContent = TEXT.title;
  applyStyle(title, {
    'font-family': "'Mochiy Pop One', sans-serif",
    'font-size': '20px',
    color: COLOR.text,
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-label', TEXT.title);
  input.value = handlers.currentName ?? '';
  input.placeholder = TEXT.placeholder;
  // The input itself carries the limit too (stops paste overflows).
  input.maxLength = MAX_DISPLAY_NAME_LENGTH;
  applyStyle(input, {
    'font-family': "'Zen Maru Gothic', sans-serif",
    // ★Under 16px iOS Safari auto-zooms into the field★
    'font-size': '16px',
    padding: '10px',
    color: COLOR.text,
    background: '#ffffff',
    border: `3px solid ${COLOR.border}`,
    'border-radius': '10px',
    'text-align': 'center',
    // index.html sets user-select: none on the body; the input must
    // opt back in or some phones will not place a cursor in it.
    'user-select': 'text',
    '-webkit-user-select': 'text',
  });

  const note = document.createElement('div');
  note.textContent = TEXT.note;
  applyStyle(note, {
    'font-family': "'Zen Maru Gothic', sans-serif",
    'font-size': '11px',
    color: COLOR.subText,
  });

  const applyNote = document.createElement('div');
  applyNote.textContent = TEXT.applyNote;
  applyStyle(applyNote, {
    'font-family': "'Zen Maru Gothic', sans-serif",
    'font-size': '11px',
    color: COLOR.subText,
  });

  const error = document.createElement('div');
  applyStyle(error, {
    'font-family': "'Zen Maru Gothic', sans-serif",
    'font-size': '12px',
    'min-height': '16px',
    color: COLOR.error,
  });

  const buttonRow = document.createElement('div');
  applyStyle(buttonRow, {
    display: 'flex',
    gap: '10px',
    'justify-content': 'center',
    'margin-top': '4px',
  });

  const saveButton = makeButton(TEXT.save, COLOR.accent, COLOR.accentText);
  const cancelButton = makeButton(TEXT.cancel, COLOR.panel, COLOR.text);

  const finish = (): void => {
    closeOverlay();
    handlers.onClose?.();
  };

  saveButton.addEventListener('click', () => {
    const value = input.value.trim();
    const check = checkDisplayName(value);
    if (!check.ok) {
      // Show why, and stay open so the name can be fixed.
      error.textContent = check.reason ?? '';
      return;
    }
    handlers.onSave(value);
    finish();
  });
  cancelButton.addEventListener('click', finish);

  // Typing again clears the old error (no scolding after a fix).
  input.addEventListener('input', () => {
    error.textContent = '';
  });

  buttonRow.append(cancelButton, saveButton);
  panel.append(title, input, note, applyNote, error, buttonRow);
  overlay.append(panel);
  document.body.append(overlay);
  activeOverlay = overlay;

  // Focus right away so typing (and the phone keyboard) starts at once.
  input.focus();
};

export const forceCloseNameOverlay = (): void => {
  closeOverlay();
};
