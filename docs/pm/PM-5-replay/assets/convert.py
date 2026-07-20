from PIL import Image, ImageDraw, ImageFilter
import sys
import os

def remove_background(input_path, output_path, is_turret=False):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    
    # マスク画像の作成 (白背景=255, 機体=0)
    mask = Image.new('L', (width, height), 0)
    
    # 閾値判定用の関数
    def is_bg(pixel):
        if is_turret:
            r, g, b = pixel[:3]
            # RGBがすべて195以上かつ、彩度が低い（max - min <= 12）
            if r >= 195 and g >= 195 and b >= 195:
                if max(r, g, b) - min(r, g, b) <= 12:
                    return True
            return False
        else:
            # 従来通り (threshold=230相当)
            return pixel[0] >= 230 and pixel[1] >= 230 and pixel[2] >= 230
    
    # フラッドフィル (四隅からスタート)
    visited = set()
    stack = [(0,0), (width-1, 0), (0, height-1), (width-1, height-1)]
    pixels = img.load()
    mask_pixels = mask.load()
    
    # ピクセル処理の高速化
    while stack:
        x, y = stack.pop()
        if (x, y) in visited:
            continue
        visited.add((x, y))
        
        if is_bg(pixels[x, y]):
            mask_pixels[x, y] = 255
            if x > 0: stack.append((x-1, y))
            if x < width - 1: stack.append((x+1, y))
            if y > 0: stack.append((x, y-1))
            if y < height - 1: stack.append((x, y+1))
            
    # 機体本体のアルファを確保 (255 - 背景マスク)
    inv_mask = Image.eval(mask, lambda a: 255 - a)
    # エッジのジャギー軽減 (1pxのガウシアンブラー)
    inv_mask = inv_mask.filter(ImageFilter.GaussianBlur(radius=1.0))
    
    # 新しい画像のアルファに設定
    out_img = img.copy()
    out_img.putalpha(inv_mask)
    
    out_img.save(output_path, "PNG")
    
    # 透過画素（alpha < 128）の割合を計算
    transparent_count = sum(1 for p in inv_mask.getdata() if p < 128)
    total_pixels = width * height
    ratio = transparent_count / total_pixels * 100
    
    # 四隅のアルファ値の確認
    out_pixels = out_img.load()
    corners_alpha = [
        out_pixels[0, 0][3],
        out_pixels[width-1, 0][3],
        out_pixels[0, height-1][3],
        out_pixels[width-1, height-1][3]
    ]
    print(f"{os.path.basename(input_path)} -> {os.path.basename(output_path)}: Transparent pixels = {ratio:.2f}%, Corners alpha = {corners_alpha}")

if __name__ == "__main__":
    assets_dir = os.path.dirname(os.path.abspath(__file__))
    files = ["defense-mech.jpg", "attacker-mech.jpg", "turret.jpg"]
    
    for f in files:
        in_path = os.path.join(assets_dir, f)
        out_path = os.path.join(assets_dir, f.replace(".jpg", ".png"))
        if os.path.exists(in_path):
            is_turret = (f == "turret.jpg")
            remove_background(in_path, out_path, is_turret)
        else:
            print(f"File not found: {in_path}")
