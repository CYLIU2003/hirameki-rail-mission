# Hirameki Rail Mission（救援列車ミッション）

夢祭ブース向け「発車標ハッキングゲーム」ローカルアプリです。  
**ネット不要**で動きます（同一PC二画面 or ホストPC＋操作端末）。

## 必要
- Node.js 18+（Windows/macOS/Linux）
- ブラウザ（Chrome/Edge 推奨）

## セットアップ
```bash
npm install
npm start
```

起動後：
- Kiosk（操作）：http://localhost:8080/kiosk.html?kiosk=1&input=touch
- Display（観客）：http://localhost:8080/display.html
- Admin（スタッフ）：http://localhost:8080/admin.html

## 使い方（当日）
1. Displayを外部モニター(14" 1080p)に全画面表示
2. Kioskを操作端末に全画面表示（タッチ or マウス）
3. カード番号（01〜30）を入力して開始（またはランダム）

## 2レーン運用（混雑時）
- 2台目操作端末で：  
  `http://<host-ip>:8080/kiosk.html?kiosk=2&input=touch`
- Admin画面で、Displayの追従対象をAUTO（推奨）にする

## 物理ボタン（任意）
USB大型ボタンが「Enter」として認識されれば、そのまま発車に使えます。

## 仕様のポイント
- 操作端末は軽量（演出はDisplay側）
- セッションはkiosk単位
- 放置2分で自動リセット（詰まり防止）
