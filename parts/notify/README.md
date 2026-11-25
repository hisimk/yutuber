# 通知の部品（Notify）

スマホの画面の上に出る「メッセージアプリの通知」を出す部品です。
『幽tuber』から取り出しました。ほかのゲームやページでも、そのまま使えます。

- 差出人・文・アイコンを渡すと、1通出ます
- 上から出てきて、横か上へスワイプすると消えます。さわらなければ、決めた秒数で消えます
- 消えた時（スワイプ・時間切れなど）を、使う側で知ることができます
- 色・大きさ・出る位置・消えるまでの時間は、使う側で変えられます

お試しページ：`demo.html`（このフォルダをそのまま置いて開く）

## フォルダの中身

```
parts/notify/
  notify.js      部品の本体（これ1つを読み込めば動く）
  icons/         アイコン画像（msg・photo・point・dating・eng）
  demo.html      お試しページ
  README.md      このメモ
```

## いちばん短い使い方（1通出す）

```html
<script src="parts/notify/notify.js"></script>
<script>
  const n = Notify.create();
  n.show({ name: 'おかあさん', text: '明日の歯医者忘れないでね', icon: Notify.icon('msg') });
</script>
```

- `Notify.icon('msg')` は、部品に入っているアイコンの場所です。自分の画像のURLを渡してもかまいません
- 1通出ている時に次の `show` を呼ぶと、前の通知と入れかわります

## 消えた時を知る

```js
const n = Notify.create({
  onShow(note) { console.log('出た', note.name); },
  onHide(note, why) { console.log('消えた', note.name, why); }
});
```

`why`（消えた理由）は次のどれかです。

| why | いつ |
|---|---|
| `swipe` | 横か上へスワイプして消した |
| `timeout` | さわらずに時間がたって消えた |
| `replace` | 次の通知が来て入れかわった |
| `clear` | `n.clear()` で消した |

今出ている通知は `n.active` で分かります（何も出ていない時は `null`）。

## 1通ごとに変えられること（show に渡す）

| 名前 | 意味 | ふだん |
|---|---|---|
| `name` | 差出人 | |
| `text` | 文（長い時は2行まで。入らない分は「…」） | |
| `icon` | アイコン画像のURL | |
| `life` | さわらなければ消えるまでの秒数 | 6 |
| `swipeOnly` | `true` なら、スワイプするまで消えない（`maxLife` 秒で消える） | false |
| `data` | 好きな値を持たせておける（`onHide` の `note.data` で受け取れる） | |

## 見た目・動きを変える（create に渡す）

| 名前 | 意味 | ふだん |
|---|---|---|
| `life` | 消えるまでの秒数（全部の通知） | 6 |
| `maxLife` | `swipeOnly` の通知が消えるまでの秒数 | 20 |
| `slideIn` | 出てくるまでの秒数 | 0.25 |
| `width` | 画面の幅に対する通知の幅 | 0.92 |
| `maxWidth` | 通知の幅の上限（px） | 520 |
| `heightRatio` | 幅に対する高さ | 0.24 |
| `top` | 上からの位置（px の数字か、`(画面の高さ, 幅) => px`） | 高さの12%（64px以上） |
| `bg` / `bgDom` | 背景の色（キャンバス／画面の表示） | 薄い灰色 |
| `nameColor` / `timeColor` / `textColor` | 文字の色 | |
| `radius` | 角の丸さ | 18 |
| `font` | 文字の種類 | |
| `timeLabel` | 右上の「今」の文字（文字か、`note => '…'`） | 今 |
| `sound` | 出た時に鳴らす音のURL | なし |
| `vibrate` | 出た時にふるわせる長さ（ミリ秒） | 0 |
| `zIndex` | 重なりの順番 | 34 |
| `root` | 表示を入れる要素 | document.body |
| `geo` | 大きさと位置を自分で決める関数（下を参照） | |

例：右上に小さめ、3秒で消える、黒っぽい通知

```js
const n = Notify.create({ width: 0.6, maxWidth: 360, top: 20, life: 3, bgDom: 'rgba(30,30,34,.95)', nameColor: '#fff', textColor: '#ddd' });
```

## ゲームの画面（WebGL）に重ねたい時・録画に入れたい時

ふつうは部品が自分で動いて、画面にHTMLで表示します。
ゲームのループに合わせて動かしたい時（一時停止で止めたい、録画に入れたいなど）は、`auto: false` にして、毎フレーム次を呼びます。

```js
const n = Notify.create({ auto: false, geo: () => ({ W, H, w, h, top, left, ox, oy }) });
// 毎フレーム
n.tick(dt);            // 時間を進める（一時停止中は呼ばない）
const G = n.geo();
n.layout(G);           // 画面のHTMLを今の位置に
const f = n.frame(G);  // { visible, dx, dy, opacity, x, y, w, h } … WebGLの板をこの位置に置く
// n.canvas に同じ絵が描いてある（描き直した時に onDraw が呼ばれる）
```

『幽tuber』はこの使い方で、録画用の絵（キャンバス）と画面のHTMLを両方使っています。

## 注意
- `notify.js` を置いた場所から `icons/` を探します。フォルダの形は変えないでください
- 画面の表示は `position: fixed` です。スクロールするページでも、画面の上に出ます
