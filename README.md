# WORLD PULSE / 世界の脈拍

世界のいま話題になっていることを、世界地図の上に「光」と「脈動」として表示するプロトタイプです。

国をホバーすると上位の話題が、クリックすると詳細パネルが開きます。画面下のタイムラインで24時間前まで遡ると、話題の順位と地図の明るさが変化します。

- フレームワーク・ビルド工程なし（HTML / CSS / Vanilla JS のみ）
- 外部APIへの接続なし。表示データはすべて `data/` 内のJSON
- GitHub Pages にそのまま置いて動作します

> **このデータはすべて架空のサンプルです。** 実在の出来事・団体・人物とは関係ありません。

---

## 1. ファイル構成

```
world-pulse/
├─ index.html              画面の骨組みと空のコンテナ
├─ css/
│  ├─ style.css            配色トークン、ヘッダー、パネル、モーダル、タイムライン
│  ├─ map.css              地図のドット、発光、波紋、接続線、ツールチップ
│  └─ responsive.css       1180 / 900 / 640 / 380px のブレイクポイント
├─ js/
│  ├─ app.js               全体の統合。状態を持つのはこのファイルだけ
│  ├─ data.js              data/ の構造を知る唯一のファイル。API化の窓口
│  ├─ map.js               地図の描画・ホバー判定・脈動・波紋・接続線
│  ├─ panel.js             国別詳細パネル / WORLD NOW / トピック詳細モーダル
│  ├─ filters.js           カテゴリーとGLOBAL/LOCALの絞り込み状態
│  ├─ timeline.js          24時間スクラバー
│  └─ i18n.js              日本語・英語の文言辞書
├─ data/
│  ├─ worldgrid.json       世界地図のドット座標（自作。第9節参照）
│  ├─ countries.json       国コード・国名・タイムゾーン・地図上の重心
│  ├─ topics.json          現在（NOW）の話題データ
│  └─ timeline.json        3 / 6 / 12 / 24時間前のスコア履歴
├─ assets/
│  ├─ icons/favicon.svg
│  └─ fonts/               （空。システムフォントで表示しています）
├─ scripts/                実データ取得（Node.js。npmパッケージ不要）
│  ├─ config.js            対象国・分類ルール・共通fetch
│  ├─ fetch-wikimedia.js   Wikipedia閲覧数 → data/live-wikipedia.json
│  ├─ fetch-news.js        ニュース → data/live-news.json
│  └─ build-live-data.js   整形 → live-topics / live-timeline / update-status
├─ .github/workflows/
│  └─ update-data.yml      1時間ごと＋手動実行
└─ README.md
```

`data/` には実データ用のファイルも生成されます。

```text
data/live-wikipedia.json   Wikimediaの取得結果（生）
data/live-news.json        ニュースの取得結果（生）
data/live-topics.json      画面が読む実データ（topics.jsonと同じ形）
data/live-timeline.json    過去24時間のスナップショット
data/update-status.json    取得状態。これだけは最初からリポジトリに入っています
```

`js/` は役割ごとに分けてあります。`app.js` 以外のファイルはお互いを直接呼びません。

---

## 2. 起動方法

**`index.html` をダブルクリックして開くと動きません。** ブラウザが `file://` からのJSON読み込みをブロックするため、「データを読み込めませんでした」と表示されます。簡易サーバー経由で開いてください。

```bash
cd world-pulse
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開きます。

Node.js をお使いの場合は `npx serve` でも、VS Code をお使いの場合は Live Server 拡張でも同じです。

動作確認は Chrome / Firefox / Edge / Safari の最新版を想定しています（開発中の検証は Chromium のみで行いました）。

---

## 3. GitHub Pages で公開する

ビルド工程がないため、リポジトリに置くだけで公開できます。

1. `world-pulse/` の中身をリポジトリの直下に置いて push する
2. GitHub の **Settings → Pages** を開く
3. **Source** を `Deploy from a branch` にする
4. **Branch** を `main` / `(root)` にして Save

数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。

サブディレクトリに置いた場合も、パスはすべて相対指定なのでそのまま動きます。

---

## 4. データを編集する

### 話題を書き換える

`data/topics.json` を編集します。`countries` は国ごとの配列です。

```json
{
  "code": "JP",
  "activityScore": 86,
  "risingCount": 5,
  "topics": [
    {
      "id": "g-ai-model",
      "title":   { "ja": "生成AIの新モデル", "en": "New generative AI model" },
      "summary": { "ja": "各国で同時に検索と報道が増えています。",
                   "en": "Search and coverage are climbing in several countries at once." },
      "category": "TECH",
      "scope": "GLOBAL",
      "score": 92,
      "change": 33.3,
      "status": "rising",
      "origin": "US",
      "relatedCountries": ["US", "JP", "IN"],
      "startedAt": "2026-07-26T17:00:00Z",
      "durationHours": 6,
      "keywords": ["AI", "model", "research"],
      "sources": ["NEWS", "WIKIPEDIA", "SEARCH"]
    }
  ]
}
```

| フィールド | 内容 |
|---|---|
| `id` | 話題の識別子。GLOBALな話題は複数の国で**同じidを使ってください**（接続線とモーダルの「注目している国」がこれで繋がります） |
| `scope` | `GLOBAL`（複数国で同時に注目）または `LOCAL`（その国特有） |
| `score` | 0〜100。地図の明るさと並び順に使われます |
| `change` | 直前フレームからの変化率（%）。マイナス可 |
| `status` | `emerging` / `rising` / `peak` / `stable` / `declining` |
| `origin` | 話題が始まった国。接続線の起点になります |
| `relatedCountries` | 注目している国。接続線の終点になります |
| `sources` | `NEWS` / `WIKIPEDIA` / `SEARCH` / `SOCIAL` のうち該当するもの |

`activityScore` は国の総合的な活発度（0〜100）で、地図の発光の強さになります。ただしカテゴリーで絞り込んでいるときは、表示中の話題から自動的に再計算されます。

`updatedAt` はパネルの「データ更新時刻」に表示されます。

### 履歴を書き換える

`data/timeline.json` は `offsetHours` が `0 / 3 / 6 / 12 / 24` の5フレームを持ちます。各フレームは国コードをキーにした辞書です。

```json
{
  "offsetHours": 3,
  "label": { "ja": "3時間前", "en": "3H ago" },
  "shortLabel": "3H",
  "countries": {
    "JP": {
      "activityScore": 84,
      "risingCount": 5,
      "topics": { "g-ai-model": { "score": 88, "change": 12.5 } }
    }
  }
}
```

**`offsetHours: 0` のフレームは表示に使われません。** NOW の表示は常に `topics.json` を正としています（両者がずれると混乱するため）。0のフレームは形式を揃えるために残してあります。

話題のタイトルや要約は `topics.json` にしかありません。`timeline.json` はスコアの履歴だけを持ちます。

### 一部の国のデータが欠けても止まりません

必須フィールド（`id` / `title` / `category` / `scope` / `score`）が欠けた話題は読み飛ばされ、コンソールに警告が出るだけです。その国だけが「現在表示できるデータはありません」になり、他の国の表示は続きます。

---

## 5. 国を追加する

対象国は現在12か国（JP / US / GB / FR / DE / IT / ES / KR / CN / IN / BR / AU）です。地図自体は85か国分のドットを持っているので、たとえばカナダ（CA）を追加する場合：

1. `data/countries.json` の `targets` 配列に `"CA"` を足す
2. 同ファイルの `countries` 配列から `CA` の項目を探し、`hasData` を `true` にする
3. `data/topics.json` の `countries` 配列に `{"code": "CA", "activityScore": …, "topics": [ … ]}` を足す
4. `data/timeline.json` の各フレームの `countries` に `"CA"` を足す（省略した場合、その時刻では「データなし」の扱いになります）

地図に存在しない国を足したい場合は、`data/worldgrid.json` の `cells` に `[列, 行, "国コード"]` を追加します。座標系は第9節を参照してください。`countries.json` の `centroid`（`{x, y}` = 列・行）は、ツールチップと接続線の位置に使われるので合わせて設定します。

**国名の翻訳を忘れないでください。** `countries.json` の `name` に `ja` と `en` の両方が必要です。

---

## 6. カテゴリーを追加する

現在は `WORLD` / `TECH` / `CULTURE` / `SPORTS` / `SCIENCE` / `ENTERTAINMENT` / `POLITICS` / `BUSINESS` / `WEATHER` の9つ（＋ `ALL`）です。

1. `js/filters.js` の `CATEGORIES` 配列に追加する
2. `js/i18n.js` の `DICT` に `'cat.〇〇': { ja: '…', en: '…' }` の行を追加する（既存の `'cat.TECH'` などと同じ形式）
3. `data/topics.json` の話題の `category` にその値を使う

3か所とも必要です。1だけだとチップは出ますが名前が空になります。

---

## 7. 実データ取得（GitHub Actions）

APIキーは不要です。GitHub Secretsの設定もいりません。

### 使用しているデータ元

| 種類 | 取得元 | 備考 |
|---|---|---|
| Wikipedia | Wikimedia Pageviews API | `top-per-country` を優先し、失敗時は言語版の `top` に切り替えます |
| ニュース | GDELT DOC 2.0 API | 媒体のURL・ドメイン・言語・日時をそのまま利用します |

言語版にフォールバックした国では、パネルに「このデータは国別ではなく、言語版Wikipediaの閲覧傾向です」と表示されます。

### 実行方法

リポジトリの **Actions → Update WORLD PULSE data → Run workflow** で手動実行できます。以降は毎時7分に自動実行されます。

処理の流れは Wikimedia取得 → ニュース取得 → 整形 → 変化があった場合のみコミット、です。前2つは `continue-on-error` にしてあるので、片方が落ちてももう片方の結果で更新されます。取得できなかった国はスキップされ、`data/update-status.json` に記録されます。

**内容が前回と同一の場合は1バイトも書き込みません。** 無意味なコミットが毎時積み上がるのを防ぐためです。

### 対象国を増やす

`scripts/config.js` の `COUNTRIES` に1行足すだけです。

```js
{ code: 'IT', wiki: 'it.wikipedia', gdelt: 'IT', lang: 'italian' },
```

`gdelt` はFIPS 10-4の国コード（GDELTの `sourcecountry` が使う体系）で、ISOコードとは違うものがあります（イギリス=UK、ドイツ=GM、韓国=KS など）。地図側は `data/countries.json` が85か国分のコードを持っているので、そちらの変更は不要です。

### 表示の優先順位

```text
1. 最新の実データ            → LIVE DATA
2. 3時間以上前の実データ      → LAST AVAILABLE DATA
3. 実データが一度もない場合    → DEMO DATA（サンプルデータ）
```

取得に失敗しても、前回正常に取得したJSONは削除も上書きもされません。

### ローカルでの実行

```bash
node scripts/fetch-wikimedia.js
node scripts/fetch-news.js
node scripts/build-live-data.js
```

Node.js 18以降（標準の `fetch` を使うため）が必要です。npm installは不要です。

---

## 8. 実APIに接続するときの変更箇所

変更するのは **`js/data.js` の2つの関数だけ**です。描画側（`map.js` / `panel.js` / `timeline.js`）は触りません。

### `fetchTrendData()`

現在は `data/` の4ファイルを読んでいます。ここをAPI呼び出しに差し替えます。戻り値のキー（`grid` / `countries` / `topics` / `timeline`）は維持してください。

```js
export async function fetchTrendData() {
  const res = await fetch('/api/pulse');   // ← 自前のサーバー
  const payload = await res.json();
  return { grid: payload.grid, countries: payload.countries,
           topics: payload.topics, timeline: payload.timeline };
}
```

地図の形状（`grid`）は動かないデータなので、APIに載せず `data/worldgrid.json` のままにしておくのが現実的です。

### `normalizeTrendData()`

APIのレスポンス形式が上記のサンプルと違う場合、その差をここだけで吸収します。この関数が返す形さえ変わらなければ、画面側は一切変更不要です。

### APIキーについて

**フロントエンドにAPIキーを書かないでください。** このプロトタイプは静的サイトなので、JS内に書いたキーは閲覧者全員に見えます。

トレンド系APIを使う場合は、キーを持つ中継サーバー（Cloudflare Workers、Vercel Functions、自前のサーバーなど）を立てて、そこ経由で呼び出してください。GitHub Pages は静的ホスティングのみなので、中継サーバーは別のサービスに置くことになります。

### 更新間隔

現在は起動時に一度読むだけです。定期更新したい場合は `js/app.js` の `render()` を `setInterval` から呼びますが、APIのレート制限にご注意ください。

---

## 9. 主な関数

| 関数 | 場所 | 役割 |
|---|---|---|
| `fetchTrendData()` | data.js | データの取得（API化の窓口） |
| `normalizeTrendData()` | data.js | 形式の正規化・欠損の吸収 |
| `getFrameState()` | data.js | 指定時刻のスコアを取り出す |
| `renderWorldMap()` | map.js | 地図の生成（初回のみ）。以降は戻り値の `update()` |
| `createPanel().renderCountry()` | panel.js | 国別詳細パネルの描画 |
| `createPanel().renderWorld()` | panel.js | WORLD NOW パネルの描画 |
| `renderTimeline()` | timeline.js | タイムラインの描画 |

`createPanel()` / `createModal()` はDOMを1度だけ組み立て、描画用の関数をまとめて返します。仕様書の `renderCountryPanel()` に相当するのが `renderCountry()` です。

---

## 10. 地図データについて

**この地図は本プロジェクトのために自作した近似データです。第三者の地図データセットに由来しません。**

制作環境が外部ネットワークに接続できなかったため、Natural Earth などの既存GeoJSONを使わず、緯度経度で手書きした大陸の輪郭をラスタライズして作りました。

- 正距円筒図法（equirectangular）
- 3度四方のセル、120列 × 48行
- 範囲は北緯84度から南緯60度（南極大陸は含みません）
- 陸地1,674セル、うち1,641セルに85か国のISOコードを割り当て
- `cells` の形式は `[列, 行, "国コード"]`。列は西端（-180度）から、行は北端（84度）から数えます

### 精度の限界

かなり粗い近似です。実用に耐える精度ではありません。

- 韓国は3セル、オランダやベルギーのような小国は1〜2セルしかありません
- 国境は緯度経度の矩形で割り当てているため、境界付近のセルは実際の国と食い違う箇所があります
- 島嶼国の多くは表現されていません

**正確な地図が必要な場合は、[Natural Earth](https://www.naturalearthdata.com/)（パブリックドメイン）などのデータに差し替えてください。** その場合の変更範囲は `data/worldgrid.json` と `js/map.js` の描画部分のみです。`map.js` は「セルの集合を描く」以外の前提を持っていないので、ポリゴン描画に変えるのであればこのファイルを書き換えることになります。

---

## 11. 既知の制約

- **国旗の絵文字は Windows では表示されません。** Windows は国旗絵文字のグリフを持たないため、Chrome / Edge では「JP」のような2文字の箱に見えます（Mac / iOS / Android / Firefox では正しく表示されます）。SVGアイコンへの差し替えを検討してください
- Safari / iOS 実機での確認は行っていません
- スマートフォンでは横長の地図を縦画面に収めるため、地図の上下に余白が出ます
- サンプルデータ表示中は記事へのリンクがありません（実データでは元記事が開きます）
- 実データのカテゴリー分類はタイトルのキーワード照合のみで、外れることがあります。判定できないものは OTHER になります
- 記事の要約・本文は取得していません（転載を避けるため、タイトルと公開情報のみ）
- 地図のズーム・パンはできません
- ブラウザストレージ（localStorage 等）は使用していません。表示言語は毎回ブラウザの設定から判定します

---

## 12. アクセシビリティ

- Tab キーで国を選択できます（フォーカス位置には破線が表示されます）
- Esc でパネルとモーダルが閉じます
- 話題の状態は色だけでなく記号（`◦ 出現` / `▲ 上昇` / `◆ 頂点` / `— 安定` / `▽ 下降`）とテキストでも示しています
- OSで「視差効果を減らす」を有効にしている場合（`prefers-reduced-motion`）、脈動・波紋・スライドは停止します

---

## 13. ライセンス

コードと地図データ（`data/worldgrid.json`）はご自由にお使いください。

`data/` 内の話題データはすべて架空のサンプルであり、実在の出来事とは関係ありません。実データに差し替える際は、利用するAPIやデータソースの利用規約をご確認ください。

国旗は Unicode の絵文字を使用しており、画像アセットは含みません。
