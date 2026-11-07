# このフォルダについて（自動コピー・直接編集しないこと）

`dango-leaderboard/client/src/` からコピーしてきたランキングSDKです。

## ★ここのファイルを直接編集しないでください★

修正が必要なときは **`dango-leaderboard` 側を直してからコピーし直します**。
ここで直しても、次の更新で上書きされて消えます。

```bash
cp C:/work/claude/dango-leaderboard/client/src/*.ts C:/work/claude/dango-drop/src/leaderboard/
```

## なぜコピーなのか

npm パッケージにせず、ファイルのコピーで運用しています。

- 外部依存ゼロ・約36KB と小さいのでコピーで十分
- npm 公開すると誰でも見られる（家族プロジェクトは Private 運用）
- ゲーム側のビルド設定を増やさずに済む

## 中身

| ファイル | 役割 |
|---|---|
| `index.ts` | 入口。ゲーム側はここからだけ import する |
| `leaderboard.ts` | API呼び出し本体（失敗しても例外を投げない） |
| `identity.ts` | プレイヤー識別（Poki / CrazyGames / itch の判定） |
| `storage.ts` | localStorage の安全な読み書き |
| `names.ts` | 表示名の入力チェック |
| `types.ts` | 型定義 |

詳しい使い方は `dango-leaderboard/docs/integration.md` を参照してください。
