import os
import csv
import json
import urllib.request
from pathlib import Path
from PIL import Image

def main():
    # ユーザーが用意したJSONファイル（手動画像URLのマッピング）
    # 形式: { "MS-21C.gif": "https://example.com/image.jpg" }
    mapping_file = Path("manual_refs_urls.json")
    if not mapping_file.exists():
        print(f"URLマッピングファイルが見つかりません: {mapping_file}")
        print("例: { \"MS-21C.gif\": \"https://example.com/image.jpg\" } のようなJSONを作成してください。")
        return

    urls = json.loads(mapping_file.read_text(encoding="utf-8"))
    if not urls:
        print("URLが設定されていません。")
        return

    # ディレクトリ準備
    PROD = Path(__file__).parent
    REF2 = PROD / "ref2"
    REFS = PROD / "refs"
    OUT = PROD / "out"
    MANIFEST = PROD / "manifest.csv"
    
    REF2.mkdir(exist_ok=True)
    REFS.mkdir(exist_ok=True)

    print(f"--- {len(urls)} 件の手動画像処理を開始 ---")
    
    # マニフェストの読み込み
    if MANIFEST.exists():
        rows = list(csv.DictReader(open(MANIFEST, encoding="utf-8")))
    else:
        print(f"エラー: {MANIFEST} が見つかりません。")
        return

    processed_files = []

    for image_name, url in urls.items():
        stem = image_name.rsplit(".", 1)[0]
        ref2_path = REF2 / f"{stem}.png"
        ref4x_path = REFS / f"{stem}-x4.png"
        out_path = OUT / f"{stem}.png"

        print(f"[{image_name}] 画像をダウンロード中...")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as response, open(ref2_path, 'wb') as out_file:
                out_file.write(response.read())
        except Exception as e:
            print(f"ダウンロードエラー {image_name}: {e}")
            continue

        print(f"[{image_name}] 見切れ防止のためのパディング（余白追加）処理を実行中...")
        try:
            # DLした画像をRGBA化し、2倍のサイズの透明キャンバスの中央に配置する
            img = Image.open(ref2_path).convert('RGBA')
            new_w, new_h = img.width * 2, img.height * 2
            padded = Image.new('RGBA', (new_w, new_h), (0, 0, 0, 0))
            offset_x = (new_w - img.width) // 2
            offset_y = (new_h - img.height) // 2
            padded.paste(img, (offset_x, offset_y))
            padded.save(ref4x_path)
        except Exception as e:
            print(f"画像処理エラー {image_name}: {e}")
            continue

        # 前回の出力(失敗作)があれば削除
        if out_path.exists():
            out_path.unlink()

        processed_files.append(image_name)
        print(f"[{image_name}] 処理完了。")

    if not processed_files:
        print("処理に成功したファイルがありませんでした。")
        return

    print("--- マニフェスト(manifest.csv)のステータスをリセット中 ---")
    reset_count = 0
    for row in rows:
        if row["image"] in processed_files:
            row["status"] = ""
            row["attempts"] = "0"
            reset_count += 1

    with open(MANIFEST, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"完了しました！ {reset_count} 機体のステータスをリセットしました。")
    print("`python produce.py 999` を実行して再生成を開始してください。")

if __name__ == "__main__":
    main()
