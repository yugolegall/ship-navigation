# 日本の船マップ（GitHub で動かす版）

GitHub が5分ごとに AIS を受信して、全船の最新位置を保存します。公開ページはその保存分を読むだけなので、開いた瞬間に船が出ます。APIキーは GitHub の秘密欄に置くので、ページには入りません。

## 設置の手順（約15分）

1. **新しい APIキーを作る**
   aisstream.io にログインして、新しいキーを作ります。以前チャットに貼ったキーは使わず、古いキーは削除してください。

2. **GitHub にリポジトリを作る**
   github.com で「New repository」を押します。名前は自由です（例: `japan-ship-map`）。**Public（公開）** にしてください。非公開だと、無料では Pages が使えません。

3. **キーを秘密欄に入れる**
   リポジトリの Settings → Secrets and variables → Actions → New repository secret
   - Name: `AISSTREAM_API_KEY`
   - Secret: 手順1で作った新しいキー

4. **この一式をアップロードする**
   リポジトリの「Add file」→「Upload files」で、zip を展開した中身（`.github`、`collector`、`docs`、`README.md`）をすべてドラッグします。
   Mac では `.github` フォルダが Finder で隠れます。Finder で Command + Shift + .（ピリオド）を押すと見えます。

5. **最初の1回を手動で動かす**
   リポジトリの Actions タブ → `collect` → Run workflow。成功（緑）になるまで数分待ちます。

6. **公開ページを有効にする**
   Settings → Pages → Source を「Deploy from a branch」にして、Branch を `gh-pages`、フォルダを `/ (root)` にして Save。
   数分後、`https://（あなたのGitHub名）.github.io/（リポジトリ名）/` で開けます。

以後は5分ごとに自動で更新されます。

## 知っておくこと

- 更新は5分ごと程度です。GitHub の定期実行は、混むと遅れることがあります。
- 船の数は、aisstream.io の日本の受信局が拾えた範囲です。
- 公開ページで他の人にデータを見せてよいか、aisstream.io の利用規約を確認してください。
- 60日間リポジトリに動きがないと、定期実行が止まることがあります。止まったら Actions タブで `collect` を再度有効にしてください。
- 船が増えるまでは数時間かかります。船の種類や行き先は、船が数分おきに送る別の信号から、だんだん埋まります。
