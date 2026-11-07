/**
 * Options overlay (player name + sound), as an HTML layer.
 *
 * Ported from Dango Drop's `systems/OptionsOverlay.ts` with Dango
 * Tower's colors, so the family games share one way of doing this.
 *
 * ★Why HTML★
 *   Phaser's canvas has no text input. Drawing a custom keyboard
 *   would break Japanese IME, prediction and paste on phones, so a
 *   real <input> is layered over the canvas. The overlay covers the
 *   whole screen, so no Scale.FIT coordinate conversion is needed.
 *
 * ★The only way back is the BACK button★
 *   Tapping the dimmed background does not close it — one obvious
 *   exit, the same rule as the How to Play screen.
 *
 * ★Name entry is optional★
 *   The game must be playable with no name at all; when empty, the
 *   server calls the player "Player".
 */
import { checkDisplayName, MAX_DISPLAY_NAME_LENGTH } from '../leaderboard';

/** The one open overlay, if any (never open two). */
let activeOverlay: HTMLDivElement | null = null;

const BUTTON = {
  background: '#e86a7a',
  text: '#ffffff',
} as const;

/** On-screen wording (English — the game ships worldwide). */
const TEXT = {
  title: 'OPTIONS',
  nameLabel: 'YOUR NAME',
  nameNote: `Up to ${MAX_DISPLAY_NAME_LENGTH} characters. You can leave it empty.`,
  placeholder: 'Player',
  soundLabel: 'SOUND',
  soundOn: 'ON',
  soundOff: 'OFF',
  close: 'BACK TO TITLE',
  privacy: 'Privacy Policy',
} as const;

/**
 * Privacy policy location (absolute URL).
 * ★Never a relative path★ — embedded on another site (itch.io etc.)
 * a relative /privacy/ would resolve on the host's domain.
 */
const PRIVACY_URL = 'https://drecry.com/privacy/';

/** Settings the options screen reads and changes. */
export interface OptionsHandlers {
  /** The saved display name (null when unset). */
  currentName: string | null;
  /** Whether sound is currently muted. */
  muted: boolean;
  /** Called when the name changes (empty string = no name). */
  onNameChange: (name: string) => void;
  /** Called to toggle sound; returns the new muted state. */
  onToggleSound: () => boolean;
  /** Called when the overlay closes (optional). */
  onClose?: () => void;
}

const applyStyle = (
  element: HTMLElement,
  styles: Record<string, string>,
): void => {
  for (const [key, value] of Object.entries(styles)) {
    element.style.setProperty(key, value);
  }
};

/** A chunky game-style button. */
const makeButton = (
  label: string,
  background: string,
  color: string,
  extra: Record<string, string> = {},
): HTMLButtonElement => {
  const button = document.createElement('button');
  button.textContent = label;
  applyStyle(button, {
    padding: '10px 24px',
    'font-family': "'Mochiy Pop One', sans-serif",
    'font-size': '16px',
    color,
    background,
    border: '3px solid #5a3a28',
    'border-radius': '12px',
    'box-shadow': '0 5px 0 rgba(0,0,0,.34)',
    cursor: 'pointer',
    ...extra,
  });
  return button;
};

/** Open the options overlay. */
export const openOptions = (handlers: OptionsHandlers): void => {
  if (activeOverlay !== null) {
    return;
  }

  const overlay = document.createElement('div');
  applyStyle(overlay, {
    position: 'fixed',
    inset: '0',
    'z-index': '10000',
    display: 'flex',
    'flex-direction': 'column',
    'justify-content': 'center',
    'align-items': 'center',
    gap: '14px',
    background: 'rgba(43, 28, 18, 0.92)',
    padding: '24px',
    'box-sizing': 'border-box',
    'font-family':
      "'Zen Maru Gothic', 'Hiragino Sans', 'Yu Gothic UI', sans-serif",
  });

  const title = document.createElement('div');
  title.textContent = TEXT.title;
  applyStyle(title, {
    'font-family': "'Mochiy Pop One', sans-serif",
    'font-size': '24px',
    color: '#fff5e2',
    '-webkit-text-stroke': '5px #5a3a28',
    'paint-order': 'stroke fill',
    'letter-spacing': '2px',
    'margin-bottom': '6px',
  });

  // ---- name ----
  const nameLabel = document.createElement('div');
  nameLabel.textContent = TEXT.nameLabel;
  applyStyle(nameLabel, {
    'font-family': "'Mochiy Pop One', sans-serif",
    'font-size': '13px',
    color: '#ffcf87',
    'letter-spacing': '2px',
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.value = handlers.currentName ?? '';
  input.placeholder = TEXT.placeholder;
  // maxLength can count an emoji as 2; leave headroom and let
  // checkDisplayName be the real judge.
  input.maxLength = MAX_DISPLAY_NAME_LENGTH * 2;
  applyStyle(input, {
    width: 'min(300px, 80vw)',
    padding: '12px 14px',
    'font-size': '20px',
    'text-align': 'center',
    border: '3px solid #5a3a28',
    'border-radius': '12px',
    background: '#fdf6e8',
    color: '#44301e',
    outline: 'none',
    // index.html sets user-select: none on the body (so game text is
    // never selected mid-play); the input must opt back in or some
    // phones will not place a cursor in it.
    'user-select': 'text',
    '-webkit-user-select': 'text',
  });

  const note = document.createElement('div');
  note.textContent = TEXT.nameNote;
  applyStyle(note, {
    'font-size': '12px',
    'font-weight': 'bold',
    color: 'rgba(255, 242, 216, 0.7)',
    'text-align': 'center',
  });

  // Shown only when the name cannot be used.
  const error = document.createElement('div');
  applyStyle(error, {
    'font-size': '12px',
    'font-weight': 'bold',
    color: '#ff9d9d',
    'min-height': '16px',
  });

  // ---- sound ----
  const soundRow = document.createElement('div');
  applyStyle(soundRow, {
    display: 'flex',
    'align-items': 'center',
    gap: '14px',
    'margin-top': '8px',
  });

  const soundLabel = document.createElement('div');
  soundLabel.textContent = TEXT.soundLabel;
  applyStyle(soundLabel, {
    'font-family': "'Mochiy Pop One', sans-serif",
    'font-size': '13px',
    color: '#ffcf87',
    'letter-spacing': '2px',
  });

  const soundButton = makeButton('', '#f6a8b8', '#ffffff');
  const refreshSound = (muted: boolean): void => {
    soundButton.textContent = muted ? TEXT.soundOff : TEXT.soundOn;
    soundButton.style.setProperty('background', muted ? '#7d6a58' : '#f6a8b8');
  };
  refreshSound(handlers.muted);
  soundButton.addEventListener('click', () => {
    refreshSound(handlers.onToggleSound());
  });
  soundRow.append(soundLabel, soundButton);

  // ---- back ----
  const closeButton = makeButton(TEXT.close, BUTTON.background, BUTTON.text, {
    'font-size': '19px',
    'letter-spacing': '1.5px',
    'min-width': '230px',
    'margin-top': '10px',
  });

  // ---- privacy policy ----
  const privacyLink = document.createElement('a');
  privacyLink.textContent = TEXT.privacy;
  privacyLink.href = PRIVACY_URL;
  // Always a new tab: embedded, opening here would erase the game.
  privacyLink.target = '_blank';
  privacyLink.rel = 'noopener noreferrer';
  applyStyle(privacyLink, {
    'font-size': '12px',
    'font-weight': 'bold',
    color: 'rgba(255, 242, 216, 0.72)',
    'text-decoration': 'underline',
    'text-underline-offset': '3px',
    'margin-top': '4px',
  });

  const close = (): void => {
    overlay.remove();
    activeOverlay = null;
    handlers.onClose?.();
  };

  /** Validate + save the name, then close (only when it is usable). */
  const submitAndClose = (): void => {
    const value = input.value.trim();
    const check = checkDisplayName(value);
    if (!check.ok) {
      error.textContent = check.reason ?? 'Please choose another name';
      return;
    }
    handlers.onNameChange(value);
    close();
  };

  closeButton.addEventListener('click', submitAndClose);
  // Enter (or the keyboard's Done/Go) only closes the keyboard —
  // leaving is the BACK button's job alone.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });

  overlay.append(
    title,
    nameLabel,
    input,
    note,
    error,
    soundRow,
    closeButton,
    privacyLink,
  );
  document.body.append(overlay);
  activeOverlay = overlay;

  // Do NOT focus the input on open: that would pop the phone keyboard
  // up over half the screen for someone who only came for the sound.
};
