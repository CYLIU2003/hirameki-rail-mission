# Hirameki Rail Mission（救援列車ミッション）

夢祭ブース向け「発車標ハッキングゲーム」ローカルアプリです。  
**ネット不要**で動きます（同一PC二画面 or ホストPC＋操作端末）。

## 必要
- Node.js 18+
- Chrome/Edge 推奨

## 起動
```bash
npm install
npm start
````

## URL

* Kiosk（操作）：[http://localhost:8080/kiosk.html?kiosk=1&input=touch](http://localhost:8080/kiosk.html?kiosk=1&input=touch)
* Display（観客）：[http://localhost:8080/display.html](http://localhost:8080/display.html)
* Admin（スタッフ）：[http://localhost:8080/admin.html](http://localhost:8080/admin.html)

## 2レーン運用

2台目操作端末：
`http://<host-ip>:8080/kiosk.html?kiosk=2&input=touch`

AdminでDisplay追従をAUTOにすると、最後に動いたKioskを自動表示します。

## ログ

* data/results.jsonl に1行1結果で保存
* Adminの「CSV出力」または /api/export.csv でExcelに取り込み可能