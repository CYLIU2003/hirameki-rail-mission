# Hirameki Rail Mission（救援列車ミッション）

祭りのブース向けに作られた「発車標ハッキングゲーム」体験です。
1台の Display と 1～2台の Kiosk（操作端末）をローカルでつなぎ、チャレンジチームが列車を救うためにカードを組み合わせながらゴールを目指します。

- 完全オフライン（ネットワーク不要）：すべて同じマシンのブラウザで完結させるか、ホストPC＋別端末で運用できます。
- 直感的なカード選択：EASY/NORMAL/HARD の条件＋アクションを組み合わせて、列車の状態を改善します。
- ログ出力＋CSVエクスポート：プレイ結果は JSONL で蓄積され、Excelでも開けます。

## 準備
1. Node.js 18 以上をインストール
2. リポジトリをクローン（またはコピー）

```bash
npm install
```

## 実行
```
npm start
```

実行後、サーバーはデフォルトで `http://localhost:8080` をリッスンします。

## アクセスガイド
| 役割 | URL | 備考 |
| --- | --- | --- |
| Kiosk（操作端末） | http://localhost:8080/kiosk.html?kiosk=1&input=touch | タッチ/キーボード入力可能な端末1台目 |
| Kiosk（2台目） | http://localhost:8080/kiosk.html?kiosk=2&input=touch | 2レーン運用での追加端末（`kiosk=2`） |
| Display（観客向け） | http://localhost:8080/display.html | 大画面表示。敵機関車、アラーム、進行状況などを表現 |
| Admin（スタッフ） | http://localhost:8080/admin.html | ログ閲覧・CSV出力・Kiosk追従切替 |

### Admin の便利機能
- 「ディスプレイ追従」をONにすると、最後に操作が動いた Kiosk が自動的に Display 表示されます。
- 「CSV出力」で管理用の表計算ソフトへ取り込み可能。
- `/api/export.csv` に GET すると、サーバー上のログを一括で取得できます。

## ログと記録
プレイごとに `data/results.jsonl` に 1 行 1 セッションでログが追記されます（JSON Lines 形式）。
- 各行には時間、Kiosk ID、ルール（EASY/NORMAL/HARD）、アクション結果、スコアなどが含まれます。
- 管理画面もしくは `npm start` で立ち上げたサーバーに `/api/export.csv` でアクセスすると、全履歴を CSV 形式でダウンロードできます。

## 運用のヒント
1. Display と Kiosk を 1 台の PC で動かす場合は、ブラウザのタブを別々に立ち上げると簡単です。
2. 2 レーン（Kiosk=1 と Kiosk=2）は同じサーバーに接続され、Display は最後に動いた Kiosk を追いかけることも可能です。
3. `data/` フォルダーが存在しない場合は、サーバー起動時に自動作成されます。手動で掃除したい場合は事前に停止してから行ってください。
4. HARD モードでは特定のカード・アクションが制限され、Kiosk がリクエストするとサーバーが強制的に再抽選してバランスを取ります。

## 追加リソース
- `server.js`: session 管理、デッキ（非重複カード）、JSONL/CSV ログ、シミュレーション処理を司るバックエンド
- `public/catalog.js`: 30枚のカード定義、EASY/NORMAL/HARD の条件、HARDで禁止されているアクション定義
- `public/kiosk.js`, `public/display.js`, `public/admin.js`: WebSocket 経由で状態を同期
- `public/assets/*.svg`: UI の装飾用アセット

## トラブルシュート
- `npm start` 後にページが表示されない場合は、ポート 8080 が他プロセスに使われていないか確認。
- `data/results.jsonl` に書き込み権限がないとサーバーがエラーになるので、アクセス権を確認。
- 複数端末を使う場合は、同一ネットワーク内で `http://<ホストIP>:8080/...` にアクセス。

## 今後の展開案（参考）
- より多くのカードやシナリオを `public/catalog.js` に追加して多彩なセッションを提供
- プレイごとにランダムイベントを挿入する機能
- 管理画面にリアルタイムのアラームやランキングを追加
- ログを使ってヒートマップや傾向分析を行うダッシュボード

## ライセンス
このプロジェクトは MIT License です。必要であれば `LICENSE` ファイルを追加してください。