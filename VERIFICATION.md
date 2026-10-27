# 検証記録

実施日: 2026-10-27 (JST)

- ローカル自動テスト: JavaScript 17/17、Python 8/8成功（計25件）。GitHub ActionsのWindows runnerでも両テストとPagesデプロイ成功。
- 公開URL: https://kkodamalab.github.io/hand-gesture-ppt-controller/ （HTTP 200確認）。`app.js`もHTTP 200。
- 公開ページを実ブラウザで開き、DEMO MODE、7設定項目、保持時間500→600 ms変更、再読み込み後の保持、RESET DEFAULTSで500 ms復帰を確認。

- JavaScript: 保持時間境界、再発火防止、左右スワイプ、ノイズ拒否、追跡途切れ、ミラー座標、手形の左右反転・スケール変化を自動テスト。
- Python: localhost HTTPで4 Action受信からWindows INPUT構築・SendInput呼び出し境界までを検証。任意Action・不正token・不正Origin・重複要求・過密要求を拒否。失敗応答とDRY RUNも検証。
- Windows x64 INPUT構造体サイズ40 byteを確認。
- MediaPipe 0.10.21のES module、WASM、float16/1モデルの配信HTTP 200を確認。
- 実カメラでの認識精度、実際のWindowsへのキー投入、PowerPointの開始・次・前・終了は未検証。HTTP統合テストではOS送信関数を記録用関数に差し替えています。

## 実機確認手順

1. 3枚以上のスライドを含むpptxをPowerPointで開く。
2. Bridgeを起動してWebにtokenを入力し、CONNECTEDを確認する。
3. カメラを開始し、PowerPointを最前面、ブラウザを表示状態にする。
4. 👍を499 ms以内で解除すると無反応、500 ms以上で最初のスライドから開始することを確認する。
5. 👍を保持しても再開始しないことを確認する。
6. 右Swipeで次、左Swipeで前へ、それぞれ1回だけ移動することを確認する。
7. 👌を700 ms以上保持して終了し、保持継続でEscが連打されないことを確認する。
8. Bridge停止後は送信失敗が表示され、以後DEMO MODEで認識を継続することを確認する。

SENTはOSがイベントを受け付けたことだけを示します。PowerPoint操作成功はスライドの変化を目視して確認してください。
