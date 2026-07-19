import json

missing = json.load(open("missing_units.json", encoding="utf-8"))

html = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>欠落機体の手動画像検索ツール</title>
<style>
body { background: #222; color: #eee; font-family: sans-serif; padding: 20px; max-width: 900px; margin: 0 auto; }
.unit-section { border: 1px solid #444; padding: 15px; margin-bottom: 15px; background: #333; border-radius: 8px; display: flex; gap: 15px; align-items: center; }
.info { flex: 1; }
h2 { font-size: 18px; margin: 0 0 10px 0; }
.search-btn { display: inline-block; padding: 6px 12px; background: #2196F3; color: white; text-decoration: none; border-radius: 4px; font-size: 14px; margin-bottom: 10px; }
.search-btn:hover { background: #0b7dda; }
input[type="text"] { width: 100%; padding: 8px; background: #111; color: #fff; border: 1px solid #555; border-radius: 4px; box-sizing: border-box; }
.preview { width: 80px; height: 80px; background: #000; border: 2px dashed #666; display: flex; align-items: center; justify-content: center; border-radius: 4px; overflow: hidden; }
.preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
#panel { position: sticky; top: 0; background: #111; padding: 15px; z-index: 999; border-bottom: 1px solid #444; margin-bottom: 20px; border-radius: 8px; }
button.save-btn { padding: 10px 20px; cursor: pointer; font-size: 16px; background: #4caf50; color: white; border: none; border-radius: 4px; width: 100%; }
button.save-btn:hover { background: #45a049; }
textarea { width: 100%; height: 100px; background: #000; color: #0f0; font-family: monospace; font-size: 12px; margin-top: 10px; box-sizing: border-box; }
</style>
</head>
<body>
<div id="panel">
  <p style="margin-top:0;"><strong>使い方：</strong><br>
  1. 「Google画像検索」ボタンを押して画像を探す<br>
  2. 良い画像を見つけたら右クリック→「画像アドレスをコピー (Copy image link)」<br>
  3. 下の入力欄にペーストする（横にプレビューが出ます）<br>
  4. 最後に「ダウンロード用スクリプトを生成」ボタンを押す</p>
  <button class="save-btn" onclick="generateScript()">ダウンロード用スクリプトを生成してコピー</button>
  <textarea id="output" placeholder="ここにダウンロード実行用のPythonスクリプトが出力されます" readonly></textarea>
</div>
"""

for u in missing:
    query = f"ガンダム {u['name']} ドット絵"
    import urllib.parse
    search_url = f"https://www.google.com/search?tbm=isch&q={urllib.parse.quote(query)}"
    
    html += f'<div class="unit-section" data-file="{u["file"]}">\n'
    html += '  <div class="info">\n'
    html += f'    <h2>{u["name"]} <small style="color:#aaa;">({u["file"]})</small></h2>\n'
    html += f'    <a href="{search_url}" target="_blank" class="search-btn">🔍 Google画像検索を開く</a>\n'
    html += f'    <input type="text" placeholder="ここに画像URLをペースト..." oninput="updatePreview(this)">\n'
    html += '  </div>\n'
    html += '  <div class="preview"><span style="color:#666;font-size:10px;">No Image</span></div>\n'
    html += '</div>\n'

html += """
<script>
function updatePreview(input) {
    let previewDiv = input.closest('.unit-section').querySelector('.preview');
    let url = input.value.trim();
    if (url) {
        previewDiv.innerHTML = `<img src="${url}" onerror="this.parentElement.innerHTML='<span style=\\'color:#f44;font-size:10px;\\'>Error</span>'">`;
    } else {
        previewDiv.innerHTML = '<span style="color:#666;font-size:10px;">No Image</span>';
    }
}

function generateScript() {
    let py = "import os, urllib.request\\n\\n";
    py += "os.makedirs('frontend/public/images/units', exist_ok=True)\\n";
    py += "downloads = {\\n";
    
    let sections = document.querySelectorAll('.unit-section');
    let count = 0;
    sections.forEach(sec => {
        let file = sec.dataset.file;
        let url = sec.querySelector('input').value.trim();
        if (url) {
            py += `    "${file}": "${url}",\\n`;
            count++;
        }
    });
    py += "}\\n\\n";
    
    if(count === 0) {
        alert("URLが一つも入力されていません！");
        return;
    }
    
    py += "for file, url in downloads.items():\\n";
    py += "    path = os.path.join('frontend/public/images/units', file)\\n";
    py += "    print(f'Downloading {file}...')\\n";
    py += "    try:\\n";
    py += "        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})\\n";
    py += "        with urllib.request.urlopen(req, timeout=10) as response, open(path, 'wb') as out_file:\\n";
    py += "            out_file.write(response.read())\\n";
    py += "    except Exception as e:\\n";
    py += "        print(f'Error downloading {file}: {e}')\\n";
    
    document.getElementById('output').value = py;
    document.getElementById('output').select();
    document.execCommand('copy');
    alert(count + '機分のダウンロードスクリプトをコピーしました！\\nターミナルで実行してください。');
}
</script>
</body>
</html>
"""

with open("manual-image-selector.html", "w", encoding="utf-8") as f:
    f.write(html)

print("Created manual-image-selector.html")
