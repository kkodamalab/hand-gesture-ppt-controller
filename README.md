# Hand Gesture PowerPoint Controller

Webカメラ → MediaPipe Hand Landmarker → Gesture Detector → Trigger Engine → localhost HTTP → Windows SendInput → PowerPoint。

WebとWindows Bridgeを分離した、4操作だけの最小デモです。カメラ映像はブラウザ内で処理し、Bridgeに送るのはActionと重複防止IDだけです。

## 起動

Windows 10/11、Python 3.10以降、デスクトップ版PowerPoint、Webカメラが必要です。Pythonの追加パッケージは不要です。

1. このリポジトリをclone、またはZIPでダウンロードして展開します。
2. `start-controller.bat` をダブルクリックします（`py -3`、なければ`python`を使用）。
3. 表示されたTokenをWebの「Bridge token」に貼り付け、「Bridgeに接続」を押します。トークンは起動ごとに変わり、Webには永続保存しません。
4. Webの「カメラ開始」を押し、カメラとローカルネットワークへのアクセスを許可します。
5. PowerPointでpptxを開き、**PowerPointを最前面**にします。ブラウザは表示を続け、手を1つだけ映してください。
6. 👍を500 ms保持して開始、右へ振って次へ、左へ振って前へ、👌を700 ms保持して終了します。

Bridge終了は端末でCtrl+C。カメラ停止はWebの「停止」。キーは最前面アプリに送られます。PowerPoint専用のプロセス制御や自動フォーカス切替は行いません。PowerPointだけを管理者権限で起動するとWindowsの入力制限で失敗することがあります。

Bridge未接続では **DEMO MODE** です。認識とAction表示まで動作し、キーは送信しません。スマホからWindows PCを操作する設計ではありません。Windows BridgeはWebを開いた同じPCで起動します。

### ローカルWeb

Node.js 22以降で `npm run serve` を実行し、http://127.0.0.1:8000 を開きます。npm installは不要です。`file://`では開かないでください。モデル・WASM・MediaPipeの初回ロードにはインターネット接続が必要です。

```powershell
python bridge/controller.py
python bridge/controller.py --dry-run
```

`--dry-run`はHTTP受信とキーイベント構築まで行い、Windowsへ送信しません。接続表示と送信結果にDRY RUNと表示します。

## 判定アルゴリズム・初期値

| 操作 | 形状・時系列条件 | Action / キー |
|---|---|---|
| 👍 THUMBS UP | 親指関節角度 >150°、先端が上向き、他4指が伸展条件を満たさない。500 ms連続保持 | START_SLIDESHOW / F5 |
| 👉 RIGHT SWIPE | ミラー表示のPalm Xが増加、下記の距離・速度条件 | NEXT_SLIDE / Right Arrow |
| 👈 LEFT SWIPE | ミラー表示のPalm Xが減少、下記の距離・速度条件 | PREVIOUS_SLIDE / Left Arrow |
| 👌 OK | 4–8間距離 / 手サイズ <0.25、中・薬・小指が伸展。700 ms連続保持 | END_SLIDESHOW / Esc |

伸展条件：MCP–PIP–TIP角度 >155°かつ手首からTIPまでの距離 > 手首からPIPの距離×1.12。手サイズはmax(0–9距離, 5–17距離)。距離と角度は映像アスペクト比を補正した座標を使用します。左右の手で同じ幾何条件を使います。

Palm Centerは0,5,9,13,17の平均。Xは`1-x`としてカメラのミラー映像と一致させます。スワイプ履歴は400 ms、最低観測時間100 ms、最小移動0.18（画面幅）、最小速度0.65（画面幅/秒）、最大縦変動0.10（画面高）。縦変動は履歴の最大Y−最小Yで評価します。静的ジェスチャー検出中はSwipeを抑止します。

状態：IDLE → CANDIDATE → TRIGGER → COOLDOWN → RE-ARM → IDLE。静的ジェスチャーのCooldownは1000 ms、Swipeは700 ms。静的形状は一度解除しないと再発火しません。SwipeはCooldown終了後に直近100～180 msのX変動が0.035未満になるか手が見えなくなると再受付します。手の消失や200 ms超のフレーム間隔では保持時間と軌跡を破棄します。左右の手分類が変わった場合も状態をリセットします。

Hold Time 2種とSwipeの5閾値はUIで変更・localStorage保存できます。RESET DEFAULTSで初期化。不正な保存値は補正します。設定変更時は進行中の候補をリセットします。

## Debug UI

GESTURE、CANDIDATE、STATE、HOLD、PALM X/Y、VX/VY、SWIPE DISTANCE、DIRECTION、PINCH DISTANCE、COOLDOWN、BRIDGE STATUS、LAST ACTION、DELIVERYを表示します。21点・Hand Connections・Palm Centerは表示切替可能です。

`SENT`はWindows SendInputが2つのイベントを受け付けたことを意味し、PowerPointによる処理を保証しません。`FAILED`はHTTPまたはSendInput失敗、`DEMO MODE`はキー未送信、`DRY RUN`はBridgeでの模擬実行です。タイムアウト時は送信済みの可能性があるため自動再送しません。

## Bridge API

127.0.0.1:8765のみで待ち受けます。`GET /health`、`POST /action`を提供します。Origin許可リストと`X-Controller-Token`を検証し、JSONは `{"action":"NEXT_SLIDE","id":"unique-id"}` の2項目だけを受け付けます。4 Actionを固定キーにマッピングし、任意キー・任意OSコマンドを受け付けません。重複IDは60秒間拒否し、200 msのレート制限を設けています。

初期Origin: `http://127.0.0.1:8000`、`http://localhost:8000`、`https://kkodamalab.github.io`。別の公開元を使う場合は `--origin https://OWNER.github.io` を追加します。Originにはパスや末尾スラッシュを含めません。

## テスト

```powershell
npm test
python -m unittest discover -s tests -p "test_*.py" -v
```

境界値499/500 ms・699/700 ms、保持連打抑制、再受付、左右Swipe、手振れ・縦移動拒否、Cooldown、追跡途切れ、静的形状との競合を検証します。Pythonテストは実際のlocalhost HTTPサーバーに要求し、4 ActionからWindows INPUTのkeydown/upが構築されSendInput呼び出し境界に届くことを検証します。通常テストではSendInputを差し替え、最前面のアプリにキーを送りません。

GitHub ActionsはWindows上で両テストを実行し、成功後に`web/`だけをGitHub Pagesへ公開します。

## 既知の制約

- 手形は幾何ルールの最小実装です。照明、手の向き、指の隠れ、撮影距離で精度が変わります。実際の手・カメラで閾値調整が必要です。
- 1つの手を対象とします。同じ左右分類の別の手への瞬間的な交代を完全には識別しません。
- 背景タブや最小化でブラウザが映像処理を抑制する場合があります。画面分割または2画面でWebを表示し、PowerPointを最前面にしてください。
- HTTPS Pagesからlocalhostへのアクセスはブラウザのローカルネットワーク許可に依存します。接続できない場合はローカルWebで試してください。Safari等の互換性は未検証です。
- MediaPipeは0.10.21、モデルはfloat16/1に固定。CDN/モデル配信元の障害時は起動できません。
- PowerPoint実機での4操作と、実カメラでの認識精度は未検証です。検証結果の詳細は`VERIFICATION.md`を参照してください。

参考: [MediaPipe Hand Landmarker](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.handlandmarker)、[Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access)。

