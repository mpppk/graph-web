# React Flow (@xyflow/react) 実装ノート

グラフキャンバス（`src/components/graph/`）の実装で過去に踏んだ、React Flow固有の落とし穴をまとめる。新しく踏んだ落とし穴があれば追記すること。

## ダークモードは `colorMode` prop で明示的に切り替える

xyflowのダークモードは `.xy-flow.dark` クラスで制御される。このプロジェクトのダークモードは `<html>` 要素への `.dark` クラス付与で行っているため、xyflowはそれを検知できない。`MutationObserver` で `<html>` の `.dark` クラスの変化を監視し、`ReactFlow` コンポーネントの `colorMode` propにリアルタイムで反映する必要がある（`useColorMode` フック参照）。これを怠るとControls・MiniMap・Backgroundがライトモードのまま固定される。

## デフォルトノードは `width: 150px` 固定CSSを持つ

ノードタイプを `"default"` のままにすると、React Flowの既定CSSで `width: 150px` に固定され、コンテナ幅を動的に変えられない。幅を可変にしたい場合はカスタムノードタイプ（例: `"editableNode"`）を使う。

## カスタムノード/エッジコンポーネントにはpropsを直接渡せない

React Flowはノード/エッジコンポーネントをnodeTypes/edgeTypes経由でReact Flow自身がインスタンス化するため、親から任意のpropsを注入できない。状態を渡したい場合はReact Contextパターンを使う（`NodeTypeContext`、`GraphModeContext` などを参照）。

## グループノード（`extent: "parent"`）には明示的な `width`/`height` が必要

`extent: "parent"` で子ノードを親グループ内にクランプする場合、親ノードに `style` だけでなく明示的な `width`/`height` を設定しないと、React Flowが親サイズを認識できず子ノードが相対座標 `(0,0)` に潰れて重なる。ELKなどでレイアウト計算したバウンディングボックスは、styleとwidth/height両方に反映すること。

## ドラッグ可能なノードのラッパーは余白部分も当たり判定を持つ

`draggable`/`selectable` なノードは、React Flowがラッパー要素（`.react-flow__node`）に `pointer-events: all` を付与するため、ノードのビジュアル領域より大きいバウンディングボックス（例: ELKのpadding分の余白）全体がクリック/ドラッグの当たり判定になる。

特定の子要素（例: グループヘッダ）だけをドラッグハンドルにしたい場合:
1. ノードの `style` に `pointerEvents: "none"` を設定してラッパー全体の当たり判定を無効化する（`node.style` はinline styleとして上書きできる）
2. ドラッグハンドルにしたい子要素にのみ `pointerEvents: "auto"` を設定する（`pointer-events` は継承プロパティなので、子に明示指定しない限り親の `none` を継承する）
3. ノードの `dragHandle` にそのハンドル要素のクラス名を指定する

また `.react-flow__node-group` には既定で `padding` / 暗色 `border` / 背景色が付くため、自前で枠を描画する場合はこれらを無効化しないと二重に見える。

## モバイルのバーチャルキーボードは `window.visualViewport` でのみ検知できる

モバイルでバーチャルキーボードが開いても、レイアウトビューポート（`window.innerHeight` など）は変化せず、縮むのは `window.visualViewport` （ビジュアルビューポート）だけ。キーボードの上にUIを表示したい場合は `visualViewport` の `resize`/`scroll` イベントを購読し、`window.innerHeight - visualViewport.height - visualViewport.offsetTop` でキーボードの高さを算出する（`useKeyboardInset` フック参照）。

ヘッドレスブラウザ（Playwright等）ではバーチャルキーボードは実際には起動しないため、動作確認時は `visualViewport` の値をモックして `resize` イベントを発火させる必要がある。

## nodes/edges はフラットな配列を source of truth として維持する

サブグラフ表示など、ノードの見た目上のグルーピング・階層表示が必要な場合でも、`useNodesState`/`useEdgesState` が持つフラットな `nodes`/`edges` を正とし、グルーピング済みの表示は派生ビューとして都度計算する。派生ビュー側の状態（レイアウト由来の座標など）を誤ってsource of truthに書き戻さないよう注意する。
