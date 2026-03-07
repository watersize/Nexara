from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
icons_dir = root / 'src-tauri' / 'icons'
icons_dir.mkdir(parents=True, exist_ok=True)

size = 512
img = Image.new('RGBA', (size, size), '#f7f4fb')
draw = ImageDraw.Draw(img)

draw.rounded_rectangle((48, 48, 464, 464), radius=108, fill='#7030A0', outline='#160c22', width=14)
draw.rounded_rectangle((82, 82, 430, 430), radius=88, outline='#ffffff', width=10)
draw.arc((132, 128, 290, 340), start=190, end=445, fill='white', width=18)
draw.line((206, 128, 320, 128), fill='white', width=18)
draw.line((318, 128, 358, 92), fill='white', width=18)
draw.line((318, 128, 358, 164), fill='white', width=18)
star = [(362, 84), (372, 108), (396, 114), (374, 128), (380, 154), (362, 140), (342, 154), (348, 128), (326, 114), (352, 108)]
draw.polygon(star, fill='white')

png_path = icons_dir / 'icon.png'
ico_path = icons_dir / 'icon.ico'
img.save(png_path)
img.resize((256, 256), Image.LANCZOS).save(
    ico_path,
    format='ICO',
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    bitmap_format='bmp',
)
