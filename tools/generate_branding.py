from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / 'src-tauri' / 'icons'
PUBLIC_DIR = ROOT / 'frontend' / 'public'

SIZE = 1024
BG = (0, 0, 0, 0)
OUTLINE = '#2d241d'
CREAM = '#f7f4eb'
PEACH = '#dcc7a6'
GREEN = '#7b9276'
GREEN_DARK = '#647b5f'
GRID = '#ece5d6'
BLACK = '#221a15'


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_icon(size=SIZE):
    image = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(image)
    scale = size / 1024

    panel = [84 * scale, 96 * scale, 890 * scale, 892 * scale]
    rounded(draw, panel, int(88 * scale), fill=CREAM, outline=OUTLINE, width=int(8 * scale))

    # Checklist card
    rounded(draw, [34 * scale, 180 * scale, 252 * scale, 520 * scale], int(38 * scale), fill=CREAM, outline=OUTLINE, width=int(7 * scale))
    for idx in range(4):
        y = (230 + idx * 62) * scale
        draw.line([(78 * scale, y), (122 * scale, y + 24 * scale), (164 * scale, y - 22 * scale)], fill=GREEN_DARK, width=int(8 * scale))
        draw.line([(188 * scale, y), (234 * scale, y)], fill=BLACK, width=int(6 * scale))

    # Main dark note/book shape
    draw.rounded_rectangle([140 * scale, 170 * scale, 650 * scale, 736 * scale], radius=int(90 * scale), fill=BLACK, outline=OUTLINE, width=int(8 * scale))
    draw.rounded_rectangle([400 * scale, 150 * scale, 840 * scale, 760 * scale], radius=int(110 * scale), fill=CREAM, outline=OUTLINE, width=int(8 * scale))
    draw.rectangle([400 * scale, 150 * scale, 540 * scale, 760 * scale], fill=CREAM)
    draw.rounded_rectangle([448 * scale, 212 * scale, 706 * scale, 548 * scale], radius=int(34 * scale), fill=PEACH)
    for idx in range(4):
        y = (144 + idx * 24) * scale
        draw.arc([298 * scale, y, 832 * scale, y + 130 * scale], start=205, end=335, fill=OUTLINE, width=int(5 * scale))

    # Calendar card
    rounded(draw, [52 * scale, 612 * scale, 410 * scale, 934 * scale], int(42 * scale), fill=CREAM, outline=OUTLINE, width=int(8 * scale))
    draw.rectangle([52 * scale, 612 * scale, 410 * scale, 734 * scale], fill=GREEN)
    for idx in range(4):
        x = (88 + idx * 78) * scale
        draw.line([(x, 612 * scale), (x, 934 * scale)], fill=OUTLINE, width=int(5 * scale))
    for idx in range(1, 4):
        y = (734 + idx * 66) * scale
        draw.line([(52 * scale, y), (410 * scale, y)], fill=OUTLINE, width=int(5 * scale))
    draw.rectangle([186 * scale, 734 * scale, 264 * scale, 800 * scale], fill='#f1c8aa')
    draw.rectangle([264 * scale, 800 * scale, 342 * scale, 866 * scale], fill=GREEN)
    for idx in range(4):
        x = (82 + idx * 82) * scale
        draw.line([(x, 672 * scale), (x + 34 * scale, 672 * scale)], fill=CREAM, width=int(6 * scale))

    # Speech bubble
    draw.ellipse([588 * scale, 176 * scale, 980 * scale, 566 * scale], fill=CREAM, outline=OUTLINE, width=int(7 * scale))
    draw.polygon([(650 * scale, 510 * scale), (606 * scale, 642 * scale), (748 * scale, 548 * scale)], fill=CREAM, outline=OUTLINE)
    for idx in range(3):
        cx = (720 + idx * 70) * scale
        cy = 342 * scale
        draw.ellipse([cx - 16 * scale, cy - 16 * scale, cx + 16 * scale, cy + 16 * scale], fill=BLACK)

    # Small brain node
    draw.ellipse([772 * scale, 450 * scale, 952 * scale, 630 * scale], fill=CREAM, outline=OUTLINE, width=int(7 * scale))
    draw.arc([810 * scale, 486 * scale, 906 * scale, 584 * scale], start=200, end=340, fill=OUTLINE, width=int(6 * scale))
    draw.arc([818 * scale, 470 * scale, 884 * scale, 560 * scale], start=180, end=360, fill=OUTLINE, width=int(6 * scale))
    for idx in range(5):
        y = (366 + idx * 34) * scale
        draw.ellipse([868 * scale, y, 876 * scale, y + 8 * scale], fill=BLACK)

    # Badge
    draw.ellipse([670 * scale, 692 * scale, 956 * scale, 978 * scale], fill=BLACK)
    draw.rectangle([802 * scale, 924 * scale, 820 * scale, 1024 * scale], fill=GREEN)
    font_big = ImageFont.truetype('arial.ttf', int(118 * scale)) if Path('C:/Windows/Fonts/arial.ttf').exists() else ImageFont.load_default()
    font_small = ImageFont.truetype('arial.ttf', int(70 * scale)) if Path('C:/Windows/Fonts/arial.ttf').exists() else ImageFont.load_default()
    draw.text((724 * scale, 738 * scale), 'V', fill=CREAM, font=font_big)
    draw.text((802 * scale, 816 * scale), 'a', fill=CREAM, font=font_small)
    draw.text((852 * scale, 838 * scale), 'i', fill=CREAM, font=font_small)

    return image


def save_outputs(image):
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    icon_png = ICON_DIR / 'icon.png'
    icon_ico = ICON_DIR / 'icon.ico'
    icon_svg = PUBLIC_DIR / 'icon.svg'
    apple_icon = PUBLIC_DIR / 'apple-icon.png'
    light_icon = PUBLIC_DIR / 'icon-light-32x32.png'
    dark_icon = PUBLIC_DIR / 'icon-dark-32x32.png'

    image.save(icon_png)
    image.save(icon_ico, sizes=[(16, 16), (32, 32), (48, 48), (128, 128), (256, 256)])
    image.resize((180, 180), Image.LANCZOS).save(apple_icon)
    image.resize((32, 32), Image.LANCZOS).save(light_icon)
    image.resize((32, 32), Image.LANCZOS).save(dark_icon)
    icon_svg.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}"><image href="icon.png" width="{SIZE}" height="{SIZE}"/></svg>',
        encoding='utf-8',
    )


if __name__ == '__main__':
    save_outputs(draw_icon())
