# ユニット画像の量産ドライバ。
# manifest.csv を読み、pending の機体を agy で生成 → 回収 → rembg 透過化 → 自動検査。
# 中断はいつでも可(manifest に状態が残る)。再実行すると pending/retry のものだけ続きから処理する。
#
# 使い方: python produce.py [最大処理数]
import csv, subprocess, sys, time, re
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import remove, new_session

ROOT = Path(r"C:\Users\nakam\g-tactics")
PROD = ROOT / "tmp-unit-images" / "production"
REFS = PROD / "refs"
RAW = PROD / "raw"        # agy生成の原本(マゼンタ背景jpg)
OUT = PROD / "out"        # 透過PNG(検査済み)
MANIFEST = PROD / "manifest.csv"
STYLE_REF = ROOT / "tmp-unit-images" / "style-samples" / "style-B-srpg-FA-78-1.png"
UNITS_DIR = ROOT / "frontend" / "public" / "images" / "units"
MAX_ATTEMPTS = 3

SESSION = new_session("isnet-anime")

PROMPT = (
    "画像生成タスクです。プラン提示や確認は不要で、この依頼文をもって承認済みです。"
    "generate_image ツールを直ちに実行してください。コマンド実行・ファイルのコピーや移動は一切しないこと。"
    "参照画像1: {ref} (ゲーム用の低解像度ドット絵のメカ)。"
    "参照画像2: {style} (完成イメージの画風見本。この見本の機体の形状・頭部・顔・装備は一切取り入れないこと)。"
    "参照画像1のメカのデザイン・配色・装備・頭部の形状を忠実に維持したまま、"
    "参照画像2と同じ画風・タッチ・塗りで描き直してください。"
    "特に頭部と顔は参照画像1のものを厳密に再現すること。モノアイ機はモノアイのまま。"
    "ガンダム型の顔（ツインアイ・V字アンテナ）への置き換えは禁止。"
    "{pose}"
    "参照画像1に脚・歩行装置が描かれていない場合、絶対に脚を新設しないこと。"
    "その場合は地面に接地させず、宙に浮いている構図で描くこと。"
    "参照画像1にない腕・翼・脚などの部位を想像で補わないこと。"
    "構図の絶対条件: 機体はキャンバス中央の60%の領域に完全に収めて小さめに描くこと。"
    "機体のどの部位もキャンバスの四辺に触れてはならない。"
    "背景は必ず純マゼンタ(#FF00FF)の単色で塗りつぶすこと。"
    "文字・署名・ロゴ・地面の影は入れない。"
    "生成が終わったら、自動保存された画像ファイルのフルパスだけを報告してください。"
    "エラーが発生した場合は、エラーメッセージを要約せず一字一句そのまま全文報告してください。"
)
POSE_ROBOT = "少しだけ煽り気味の勇ましい立ちポーズ、向きは参照画像1と同じ。縦長キャンバス。"
POSE_VEHICLE = "構図と向きは参照画像1と同じ。横長キャンバス。"


def pose_for(row) -> str:
    """kind ではなく元スプライトの縦横比でポーズを選ぶ(横長=艦船/MA/乗り物とみなす)。
    旧スプライトが無い機体(設定画組)は ref2 の画像で判定する。"""
    src = UNITS_DIR / row["image"]
    if not src.exists():
        src = PROD / "ref2" / (row["image"].rsplit(".", 1)[0] + ".png")
    im = Image.open(src)
    if row["kind"] == "vehicle" or im.width > im.height * 1.15:
        return POSE_VEHICLE
    return POSE_ROBOT


def ensure_ref(image_name: str) -> Path:
    """参考PNGを用意する。旧画像があれば4倍拡大(小サイズの場合)、無ければ ref2(ユーザー収集の設定画)を使う"""
    stem = image_name.rsplit(".", 1)[0]
    ref = REFS / f"{stem}-x4.png"
    if ref.exists():
        return ref
    old = UNITS_DIR / image_name
    if old.exists():
        im = Image.open(old).convert("RGBA")
        if im.width < 200:
            im = im.resize((im.width * 4, im.height * 4), Image.NEAREST)
        im.save(ref)
        return ref
    ref2 = PROD / "ref2" / f"{stem}.png"
    if ref2.exists():
        return ref2
    raise FileNotFoundError(f"参考画像なし {image_name}")


class QuotaExceeded(Exception):
    def __init__(self, wait_seconds: float):
        self.wait_seconds = wait_seconds

def order_agy(ref: Path, row: dict) -> str | None:
    """agy に1機発注し、生成物のパスを返す。クォータ超過は QuotaExceeded、他の失敗は None"""
    pose = pose_for(row)
    prompt = PROMPT.format(ref=ref, style=STYLE_REF, pose=pose)
    # --- 個別プロンプトの注入（設定ファイルから読み込み） ---
    # 例: custom_prompts.json に { "unit_01.gif": "【超重要】絶対に脚を描画しないでください。" } のように定義する想定
    custom_prompts_file = PROD / "custom_prompts.json"
    if custom_prompts_file.exists():
        import json
        try:
            custom_prompts = json.loads(custom_prompts_file.read_text(encoding="utf-8"))
            if row["image"] in custom_prompts:
                prompt += custom_prompts[row["image"]]
        except Exception:
            pass

    # (旧) ハードコードされていた個別プロンプトのサンプル
    # if row["image"] == "sample_unit.png":
    #     prompt += "【超重要】この機体は人間型の顔ではありません。無機質なバイザーのみを描画してください。"
    # elif row["image"] == "sample_vehicle.png":
    #     prompt += "【超重要】機体がキャンバスの端にはみ出さないよう、機体全体をかなり小さく描画してください。"

    r = subprocess.run(
        ["agy", "--print", prompt, "--model", "Gemini 3.1 Pro (High)",
         "--mode", "accept-edits", "--print-timeout", "10m"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=PROD, timeout=900,
    )
    out = r.stdout or ""
    m = re.findall(r"C:[^\s`'\"]+?\.(?:jpg|png)", out)
    if m:
        return m[-1]
    if "429" in out or "クォータ" in out or "Too Many Requests" in out or "利用制限" in out:
        # エラー本文の retryDelay / quotaResetDelay からリセットまでの秒数を取る
        wait = 240.0  # 見つからなければ4分
        m = re.search(r'retryDelay"?\s*[:：]\s*"?([\d.]+)s', out)
        if m:
            wait = float(m.group(1))
        else:
            m = re.search(r'(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s', out)
            if m and (m.group(1) or m.group(2)):
                wait = int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + float(m.group(3))
        raise QuotaExceeded(wait)
    return None


def inspect(png: Image.Image) -> list[str]:
    """透過PNGの自動検査。問題のリストを返す(空=合格)"""
    problems = []
    arr = np.array(png.getchannel("A"))
    if max(arr[:2].max(), arr[-2:].max(), arr[:, :2].max(), arr[:, -2:].max()) > 16:
        problems.append("edge-clip")
    opaque = (arr > 240).mean()
    if opaque < 0.05:
        problems.append("almost-empty")
    if opaque > 0.90:
        problems.append("no-background")
    rgb = np.array(png.convert("RGB"), dtype=np.int16)
    mask = arr > 128
    if mask.any():
        r, g, b = rgb[..., 0][mask], rgb[..., 1][mask], rgb[..., 2][mask]
        magenta = ((r > 200) & (b > 200) & (g < 80)).mean()
        if magenta > 0.02:
            problems.append("magenta-leak")
    return problems


def process(row: dict) -> str:
    stem = row["image"].rsplit(".", 1)[0]
    ref = ensure_ref(row["image"])
    src = order_agy(ref, row)
    if not src:
        return "agy-no-output"
    raw_path = RAW / f"{stem}.jpg"
    Path(src).replace(raw_path) if False else None  # brain側は残す
    import shutil
    shutil.copy(src, raw_path)
    png = remove(Image.open(raw_path), session=SESSION)
    problems = inspect(png)
    if problems:
        return ",".join(problems)
    png.save(OUT / f"{stem}.png")
    return "ok"


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    for d in (REFS, RAW, OUT):
        d.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(open(MANIFEST, encoding="utf-8")))
    done = 0
    i = 0
    while i < len(rows):
        row = rows[i]
        if done >= limit:
            break
        if row["status"] == "ok" or int(row.get("attempts") or 0) >= MAX_ATTEMPTS:
            i += 1
            continue
        t0 = time.time()
        try:
            result = process(row)
        except QuotaExceeded as q:
            # クォータは attempts に数えない。エラー本文のリセット時刻+60秒まで眠る
            wake = time.strftime("%H:%M", time.localtime(time.time() + q.wait_seconds + 60))
            print(f"QUOTA: 容量切れ。{wake} に再開予定 (待ち {q.wait_seconds/60:.0f}分) at {row['image']}", flush=True)
            time.sleep(q.wait_seconds + 60)
            continue
        except Exception as e:
            # 原因調査のためエラーメッセージ本文も残す(manifestのnote列とログ)
            msg = str(e).replace("\n", " ")[:200]
            row["note"] = msg
            print(f"ERROR-DETAIL {row['image']}: {type(e).__name__}: {msg}", flush=True)
            result = f"error:{type(e).__name__}"
        row["attempts"] = str(int(row.get("attempts") or 0) + 1)
        row["status"] = result
        done += 1
        i += 1
        print(f"{row['image']}\t{result}\t{time.time()-t0:.0f}s\t(attempt {row['attempts']})", flush=True)
        # 毎機体ごとに manifest を保存(中断への備え)
        # out/ の実ファイルを正として自己修復する:
        #  - 並走ツールが ok にしたものを巻き戻さない
        #  - 検収で out-rejected/ へ退避されたものは pending に戻して作り直す
        for r2 in rows:
            stem2 = r2["image"].rsplit(".", 1)[0]
            has_png = (OUT / f"{stem2}.png").exists()
            if r2["status"] != "ok" and has_png:
                r2["status"] = "ok"
            elif r2["status"] == "ok" and not has_png:
                r2["status"] = "pending"
                r2["attempts"] = "0"
        with open(MANIFEST, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader(); w.writerows(rows)
    ok = sum(1 for r in rows if r["status"] == "ok")
    print(f"BATCH_DONE processed={done} total_ok={ok}/{len(rows)}")
    return done


if __name__ == "__main__":
    # 残作業がある限り周回する(1周で終了→手動再起動、を無くす)
    while True:
        processed = main()
        rows = list(csv.DictReader(open(MANIFEST, encoding="utf-8")))
        remaining = sum(1 for r in rows if r["status"] != "ok" and int(r["attempts"] or 0) < MAX_ATTEMPTS)
        if remaining == 0:
            print("ALL_WORK_DONE", flush=True)
            break
        if processed == 0:
            # 何も処理できないのに残がある(異常)。無限ループ防止に10分待つ
            time.sleep(600)
