/**
 * Font constants (Dango Order).
 *
 * Official fonts, adopted by family decision in Dango Drop (ADR-0003):
 * - Headings: Mochiy Pop One
 * - Body: Zen Maru Gothic
 * Loaded via Google Fonts in index.html and awaited with
 * document.fonts.load() in PreloadScene.
 */

export const FONT_HEADING = '"Mochiy Pop One", "Zen Maru Gothic", sans-serif';
export const FONT_BODY = '"Zen Maru Gothic", sans-serif';

/** How long to wait for web fonts before falling back to system fonts. */
export const FONT_WAIT_TIMEOUT_MS = 3000;
