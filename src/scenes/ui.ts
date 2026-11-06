/**
 * Shared UI helpers for the menu scenes (Dango Order).
 * Small rounded buttons and text styles, kept consistent across
 * Title / How to Play / Meet the Dango / Result.
 */
import Phaser from 'phaser';
import { FONT_BODY, FONT_HEADING } from '../constants/fonts';
import { sound } from '../systems/sound';

export const COLOR_TEXT = '#5a3a28';
export const COLOR_ACCENT = '#e86a7a';
export const COLOR_BUTTON = '#f6a8b8';
export const COLOR_BUTTON_TEXT = '#ffffff';
export const COLOR_PANEL = '#fff7e6';

/** A big rounded menu button with a press animation + click sound. */
export const makeButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
  fontSize = 26,
): Phaser.GameObjects.Container => {
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, width, height, 0xf6a8b8, 1);
  bg.setStrokeStyle(3, 0xe86a7a);
  bg.setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONT_HEADING,
      fontSize: `${fontSize}px`,
      color: '#ffffff',
    })
    .setOrigin(0.5);
  container.add([bg, text]);
  bg.on('pointerdown', () => {
    sound.unlock();
    sound.click();
    container.setScale(0.95);
  });
  bg.on('pointerup', () => {
    container.setScale(1);
    onClick();
  });
  bg.on('pointerout', () => {
    container.setScale(1);
  });
  return container;
};

/** A small round icon button (sound, pause, back). */
export const makeIconButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Container => {
  const container = scene.add.container(x, y);
  const bg = scene.add.circle(0, 0, 24, 0xfff7e6, 1);
  bg.setStrokeStyle(2, 0xc89b6a);
  bg.setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(0, -1, label, {
      fontFamily: FONT_BODY,
      fontSize: '22px',
      fontStyle: 'bold',
      color: COLOR_TEXT,
    })
    .setOrigin(0.5);
  container.add([bg, text]);
  bg.on('pointerdown', () => {
    sound.unlock();
    sound.click();
    container.setScale(0.92);
  });
  bg.on('pointerup', () => {
    container.setScale(1);
    onClick();
  });
  bg.on('pointerout', () => {
    container.setScale(1);
  });
  return container;
};

export const headingText = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  fontSize = 44,
): Phaser.GameObjects.Text =>
  scene.add
    .text(x, y, label, {
      fontFamily: FONT_HEADING,
      fontSize: `${fontSize}px`,
      color: COLOR_TEXT,
    })
    .setOrigin(0.5);

export const bodyText = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  fontSize = 20,
  wrapWidth = 460,
): Phaser.GameObjects.Text =>
  scene.add
    .text(x, y, label, {
      fontFamily: FONT_BODY,
      fontSize: `${fontSize}px`,
      color: COLOR_TEXT,
      wordWrap: { width: wrapWidth },
      align: 'center',
      lineSpacing: 6,
    })
    .setOrigin(0.5, 0);
