/**
 * Ranking board panel (shared UI component).
 *
 * Ported from Dango Drop's `ui/RankingBoard.ts` (via Dango Tower) with
 * Dango Order's colors, so the family games share one ranking panel.
 * Used by the RankingScene (from the title screen) and by the
 * ResultScene's ranking section — same panel, same behavior, both
 * places.
 *
 * What it draws: a cream rounded panel with a "RANKING" title, a
 * name button at the top right (your current name, or "SET NAME" —
 * tap it to rename right here via the NameOverlay), a "YOU #rank
 * (top N%)" line (always the ALL TIME rank, so the number does not
 * jump around when tabs change), WEEKLY / ALL TIME tabs, the top
 * rows, and — when you are outside the listed rows — your own row
 * under a divider.
 *
 * ★Offline still shows the last board★
 *   The SDK returns the previous cached board with online:false when
 *   the network fails. If there are entries, they are drawn and a
 *   small "offline" note is added, instead of throwing the board
 *   away for an error message.
 */
import Phaser from 'phaser';
import { FONT_BODY, FONT_HEADING } from '../constants/fonts';
import { getSavedDisplayName } from '../leaderboard';
import type { BoardKind, LeaderboardEntry, RankInfo } from '../leaderboard';
import { CURRENCY } from '../systems/EconomyConfig';
import { isRankingEnabled, leaderboard } from '../systems/LeaderboardClient';
import { sound } from '../systems/sound';
import {
  forceCloseNameOverlay,
  nameButtonLabel,
  openNameOverlay,
} from './NameOverlay';

const COLOR = {
  panel: 0xfff7e6,
  border: 0x5a3a28,
  tabActive: 0xe86a7a,
  tabIdle: 0xf3e3c8,
  text: '#5a3a28',
  subText: '#a08060',
  you: '#e86a7a',
  tabActiveText: '#ffffff',
} as const;

const PANEL_RADIUS = 16;

const TAB_HEIGHT = 30;

const TAB_GAP = 8;

const ROW_GAP = 29;

const TITLE_OFFSET = 26;

const MY_RANK_OFFSET = 56;

const TAB_OFFSET = 90;

const FIRST_ROW_OFFSET = 126;

const PADDING_X = 22;

const NAME_OFFSET_X = 78;

const NAME_BUTTON = { width: 112, height: 28 } as const;

export interface RankingBoardLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly maxRows: number;
}

export interface MyRankInfo {
  readonly alltime: RankInfo | null;
  readonly weekly: RankInfo | null;
  readonly score: number;
}

export class RankingBoard {
  private readonly scene: Phaser.Scene;

  private readonly layout: RankingBoardLayout;

  private activeBoard: BoardKind = 'weekly';

  private rows?: Phaser.GameObjects.Container;

  private youRow?: Phaser.GameObjects.Container;

  private myRankText?: Phaser.GameObjects.Text;

  private myRank: MyRankInfo | null = null;

  private pendingBeforeLoad?: Promise<unknown>;

  private tabVisuals: {
    board: BoardKind;
    graphics: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    left: number;
  }[] = [];

  private disposed = false;

  constructor(scene: Phaser.Scene, layout: RankingBoardLayout) {
    this.scene = scene;
    this.layout = layout;
    // When the scene closes, stop writing and close the name overlay.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.disposed = true;
      forceCloseNameOverlay();
      scene.input.enabled = true;
    });
  }

  create(waitFor?: Promise<unknown>): boolean {
    if (!isRankingEnabled()) {
      return false; // No ranking in this build — the panel does not exist.
    }
    this.drawPanel();
    this.drawTitle();
    this.drawNameButton();
    this.drawMyRankLine();
    this.drawTabs();
    this.rows = this.scene.add.container(0, 0);
    this.pendingBeforeLoad = waitFor;
    void this.load('weekly').catch(() => {
      // A malformed reply must not leave "Loading..." up forever.
      this.showMessage('Could not load ranking');
    });
    return true;
  }

  applyMyRank(info: MyRankInfo): void {
    if (this.disposed) {
      return;
    }
    this.myRank = info;
    this.renderMyRankLine();
    this.renderYouRow();
  }

  // ===========================================================================
  // Frame
  // ===========================================================================

  private drawPanel(): void {
    const { x, y, width, height } = this.layout;
    const panel = this.scene.add.graphics();
    panel.fillStyle(COLOR.panel, 0.97);
    panel.fillRoundedRect(x, y, width, height, PANEL_RADIUS);
    panel.lineStyle(3, COLOR.border);
    panel.strokeRoundedRect(x, y, width, height, PANEL_RADIUS);
  }

  private drawTitle(): void {
    this.scene.add
      .text(this.layout.x + PADDING_X, this.layout.y + TITLE_OFFSET, 'RANKING', {
        fontFamily: FONT_HEADING,
        fontSize: '22px',
        color: COLOR.text,
      })
      .setOrigin(0, 0.5);
  }

  private drawNameButton(): void {
    const centerX = this.layout.x + this.layout.width - PADDING_X - NAME_BUTTON.width / 2;
    const centerY = this.layout.y + TITLE_OFFSET;

    const background = this.scene.add
      .rectangle(centerX, centerY, NAME_BUTTON.width, NAME_BUTTON.height, COLOR.tabIdle)
      .setStrokeStyle(2, COLOR.border)
      .setInteractive({ useHandCursor: true });

    const label = this.scene.add
      .text(centerX, centerY, nameButtonLabel(getSavedDisplayName()), {
        fontFamily: FONT_BODY,
        fontSize: '13px',
        color: COLOR.text,
      })
      .setOrigin(0.5);

    background.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() >= 12) return;
      sound.click();
      this.scene.input.enabled = false;
      openNameOverlay({
        onClose: () => {
          this.scene.time.delayedCall(150, () => { this.scene.input.enabled = true; });
        },
        currentName: getSavedDisplayName(),
        onSave: (name) => {
          leaderboard.setDisplayName(name);
          // The scene may have changed while typing (writing to a
          // destroyed label would crash Phaser).
          if (this.disposed) {
            return;
          }
          label.setText(nameButtonLabel(getSavedDisplayName()));
        },
      });
    });
  }

  private drawMyRankLine(): void {
    this.myRankText = this.scene.add
      .text(this.layout.x + this.layout.width / 2, this.layout.y + MY_RANK_OFFSET, '', {
        fontFamily: FONT_HEADING,
        fontSize: '20px',
        color: COLOR.you,
      })
      .setOrigin(0.5);
    this.renderMyRankLine();
  }

  private renderMyRankLine(): void {
    if (this.myRankText === undefined) {
      return;
    }
    // ★Always the ALL TIME rank here★
    //   If the number changed with the tabs, "your rank" would be
    //   hard to read at a glance.
    const info = this.myRank?.alltime ?? null;
    if (info === null || info.rank === null) {
      this.myRankText.setText('');
      return;
    }
    const percentile = info.percentile === null ? '' : ` (top ${String(info.percentile)}%)`;
    this.myRankText.setText(`YOU  #${info.rank.toLocaleString()}${percentile}`);
  }

  private drawTabs(): void {
    const tabs: { label: string; board: BoardKind }[] = [
      { label: 'WEEKLY', board: 'weekly' },
      { label: 'ALL TIME', board: 'alltime' },
    ];
    const centerY = this.layout.y + TAB_OFFSET;
    const tabWidth = this.tabWidth();

    tabs.forEach((tab, index) => {
      const left = this.layout.x + PADDING_X + index * (tabWidth + TAB_GAP);
      const graphics = this.scene.add.graphics();
      const label = this.scene.add
        .text(left + tabWidth / 2, centerY, tab.label, {
          fontFamily: FONT_BODY,
          fontSize: '14px',
          color: COLOR.text,
        })
        .setOrigin(0.5);
      this.tabVisuals.push({ board: tab.board, graphics, label, left });

      this.scene.add
        .rectangle(left + tabWidth / 2, centerY, tabWidth, TAB_HEIGHT, 0xffffff, 0)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
          if (pointer.getDistance() >= 12) return;
          sound.click();
          void this.load(tab.board).catch(() => {
            this.showMessage('Could not load ranking');
          });
        });
    });
    this.paintTabs();
  }

  private tabWidth(): number {
    return (this.layout.width - PADDING_X * 2 - TAB_GAP) / 2;
  }

  private paintTabs(): void {
    const top = this.layout.y + TAB_OFFSET - TAB_HEIGHT / 2;
    const width = this.tabWidth();
    for (const tab of this.tabVisuals) {
      const selected = tab.board === this.activeBoard;
      tab.graphics.clear();
      tab.graphics.fillStyle(selected ? COLOR.tabActive : COLOR.tabIdle);
      tab.graphics.fillRoundedRect(tab.left, top, width, TAB_HEIGHT, 8);
      tab.graphics.lineStyle(2, COLOR.border, selected ? 1 : 0.4);
      tab.graphics.strokeRoundedRect(tab.left, top, width, TAB_HEIGHT, 8);
      tab.label.setColor(selected ? COLOR.tabActiveText : COLOR.subText);
    }
  }

  // ===========================================================================
  // Loading and rows
  // ===========================================================================

  private async load(board: BoardKind): Promise<void> {
    this.activeBoard = board;
    this.paintTabs();
    this.showMessage('Loading...');

    // If a score submission is still in flight, this board should
    // include it — wait for it first (a failed submission still
    // lets the board load; the rank just will not be there).
    const beforeLoad = this.pendingBeforeLoad;
    if (beforeLoad !== undefined) {
      await beforeLoad.catch(() => undefined);
      if (this.disposed || this.activeBoard !== board) {
        return;
      }
    }

    const result = await leaderboard.fetchLeaderboard(board, this.layout.maxRows);

    // The scene closed, or another tab was tapped meanwhile: drop it.
    if (this.disposed || this.activeBoard !== board) {
      return;
    }
    /*
     * ★Offline with a cached board still draws the board★
     *   The SDK hands back the last cached entries with
     *   online:false. Drawing them (with a small "offline" note)
     *   beats an error message on a train.
     */
    if (result.entries.length === 0) {
      this.showMessage(result.online ? 'No scores yet — be the first!' : 'Could not load ranking');
      return;
    }
    this.renderRows(result.entries);
    if (!result.online) {
      this.showOfflineNote();
    }
  }

  private showOfflineNote(): void {
    this.rows?.add(
      this.scene.add
        .text(
          this.layout.x + this.layout.width - PADDING_X,
          this.layout.y + MY_RANK_OFFSET,
          'offline',
          {
            fontFamily: FONT_BODY,
            fontSize: '12px',
            color: COLOR.subText,
          },
        )
        .setOrigin(1, 0.5),
    );
  }

  private showMessage(message: string): void {
    // A reply can arrive after the scene closed (never write then).
    if (this.disposed || this.rows === undefined) {
      return;
    }
    this.rows.removeAll(true);
    this.rows.add(
      this.scene.add
        .text(
          this.layout.x + this.layout.width / 2,
          this.layout.y + FIRST_ROW_OFFSET + ROW_GAP,
          message,
          {
            fontFamily: FONT_BODY,
            fontSize: '15px',
            color: COLOR.subText,
          },
        )
        .setOrigin(0.5),
    );
    this.renderYouRow();
  }

  private renderRows(entries: readonly LeaderboardEntry[]): void {
    const rows = this.rows;
    if (rows === undefined) {
      return;
    }
    rows.removeAll(true);

    entries.slice(0, this.layout.maxRows).forEach((entry, index) => {
      const y = this.layout.y + FIRST_ROW_OFFSET + index * ROW_GAP;
      // Your own row is colored so you can find yourself at a glance.
      const color = entry.is_you === true ? COLOR.you : COLOR.text;
      rows.add(this.buildRow(y, `${entry.rank}`, entry.display_name, entry.score, color));
    });
    this.renderYouRow();
  }

  private buildRow(
    y: number,
    rank: string,
    name: string,
    score: number,
    color: string,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    container.add(
      this.scene.add
        .text(this.layout.x + NAME_OFFSET_X - 12, y, rank, {
          fontFamily: FONT_HEADING,
          fontSize: '16px',
          color,
        })
        .setOrigin(1, 0.5),
    );
    container.add(
      this.scene.add
        .text(this.layout.x + NAME_OFFSET_X, y, name, {
          fontFamily: FONT_BODY,
          fontSize: '16px',
          color,
        })
        .setOrigin(0, 0.5),
    );
    container.add(
      this.scene.add
        .text(
          this.layout.x + this.layout.width - PADDING_X,
          y,
          `${score.toLocaleString()} ${CURRENCY}`,
          {
            fontFamily: FONT_HEADING,
            fontSize: '16px',
            color,
          },
        )
        .setOrigin(1, 0.5),
    );
    return container;
  }

  private renderYouRow(): void {
    this.youRow?.destroy(true);
    this.youRow = undefined;

    // The rank for the tab currently on screen.
    const info = this.activeBoard === 'alltime' ? this.myRank?.alltime : this.myRank?.weekly;
    if (info === undefined || info === null || info.rank === null) {
      return;
    }
    if (info.rank <= this.layout.maxRows) {
      return;
    }

    // Below the last listed row, across a divider.
    const y = this.layout.y + FIRST_ROW_OFFSET + this.layout.maxRows * ROW_GAP + 12;
    const container = this.scene.add.container(0, 0);
    const divider = this.scene.add.graphics();
    divider.lineStyle(1.5, COLOR.border, 0.4);
    divider.lineBetween(
      this.layout.x + PADDING_X,
      y - 16,
      this.layout.x + this.layout.width - PADDING_X,
      y - 16,
    );
    container.add(divider);
    container.add(this.buildRow(y, `${info.rank}`, 'YOU', this.myRank?.score ?? 0, COLOR.you));
    this.youRow = container;
  }
}
