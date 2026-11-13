"""生成托盘图标：一个圆环 + 一道路径波 + 一个暖色点，和面板里的字标同源。
用法：python scripts/make-tray-icon.py
只依赖 Pillow。所有尺寸都在 4x 上画完再降采样，避免 16px 下糊掉。"""

from pathlib import Path
from PIL import Image, ImageDraw

SUPERSAMPLE = 4
SIZES = [16, 24, 32, 48, 64]
# 安装包图标要求 256×256；electron-builder 会把这张 PNG 转成 .ico
APP_SIZE = 256
OUT_DIR = Path(__file__).resolve().parent.parent / "resources"

MINT = (169, 248, 212, 235)
MINT_DEEP = (125, 240, 195, 235)
APRICOT = (255, 198, 154, 255)
RIM = (255, 255, 255, 170)


def wave_points(size: int, steps: int = 96) -> list[tuple[float, float]]:
    """一条两端轻微上扬的波，画在圆的下半部。"""
    pts = []
    x0, x1 = size * 0.20, size * 0.80
    y_mid = size * 0.60
    amp = size * 0.075
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        # 两个半周期，起点略低、终点略高
        y = y_mid - amp * __import__("math").sin(t * 3.14159 * 2) + (t - 0.5) * size * 0.03
        pts.append((x, y))
    return pts


def draw_mark(size: int) -> Image.Image:
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 外环
    pad = s * 0.045
    d.ellipse([pad, pad, s - pad, s - pad], outline=RIM, width=max(1, int(s * 0.028)))

    # 水波：先画一层深色，再叠一层亮色，得到一点厚度
    pts = wave_points(s)
    d.line(pts, fill=MINT_DEEP, width=max(2, int(s * 0.075)), joint="curve")
    d.line(pts, fill=MINT, width=max(1, int(s * 0.048)), joint="curve")

    # 暖色点
    r = s * 0.072
    cx, cy = s * 0.70, s * 0.34
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=APRICOT)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    frames = {size: draw_mark(size) for size in SIZES}

    for size, image in frames.items():
        image.save(OUT_DIR / f"tray-{size}.png")

    # Electron 在 Windows 上优先用 .ico，让系统自己挑尺寸
    frames[64].save(
        OUT_DIR / "tray.ico",
        format="ICO",
        sizes=[(s, s) for s in SIZES],
    )
    frames[32].save(OUT_DIR / "tray.png")

    # 安装包/任务栏用的大图，和托盘同源
    draw_mark(APP_SIZE).save(OUT_DIR / "app-icon.png")
    print(f"写入 {OUT_DIR}：tray.ico + tray.png + tray-*.png + app-icon.png")


if __name__ == "__main__":
    main()

