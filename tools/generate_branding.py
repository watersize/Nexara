from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
TAURI_ICONS = ROOT / "src-tauri" / "icons"
PUBLIC_DIR = ROOT / "frontend" / "public"

TAURI_ICONS.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)


def make_icon(size: int = 1024) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    outline = "#241a14"
    green = "#6DA676"
    mint = "#75C9B7"
    blue = "#78A7E6"
    purple = "#8D78D7"
    beige = "#E8C79F"
    peach = "#F2C2A0"
    black = "#18120F"
    white = "#FFF9F0"

    s = size / 1024
    w = max(4, int(8 * s))
    thin = max(3, int(5 * s))

    # Open book
    draw.rounded_rectangle((250 * s, 220 * s, 520 * s, 760 * s), radius=42 * s, outline=outline, width=w, fill=white)
    draw.rounded_rectangle((500 * s, 220 * s, 770 * s, 760 * s), radius=42 * s, outline=outline, width=w, fill=white)
    draw.line((510 * s, 225 * s, 510 * s, 770 * s), fill=outline, width=w)
    draw.arc((370 * s, 690 * s, 650 * s, 870 * s), 200, 340, fill=outline, width=w)

    # Page accents
    draw.rounded_rectangle((555 * s, 305 * s, 655 * s, 505 * s), radius=18 * s, fill=beige)
    draw.rectangle((215 * s, 300 * s, 320 * s, 600 * s), fill=(255, 249, 240, 0))

    # Checklist
    draw.rounded_rectangle((175 * s, 300 * s, 330 * s, 540 * s), radius=24 * s, outline=outline, width=thin, fill=white)
    for y in (360, 410, 460, 510):
        draw.line((220 * s, y * s, 240 * s, (y + 18) * s), fill=green, width=thin)
        draw.line((240 * s, (y + 18) * s, 280 * s, (y - 22) * s), fill=green, width=thin)
        draw.line((300 * s, y * s, 300 * s, y * s), fill=outline, width=thin)

    # Calendar
    draw.rounded_rectangle((180 * s, 560 * s, 470 * s, 800 * s), radius=24 * s, outline=outline, width=w, fill=white)
    draw.rounded_rectangle((180 * s, 560 * s, 470 * s, 640 * s), radius=24 * s, fill=green)
    for x in (180, 275, 370, 470):
        draw.line((x * s, 640 * s, x * s, 800 * s), fill=outline, width=thin)
    for y in (640, 720, 800):
        draw.line((180 * s, y * s, 470 * s, y * s), fill=outline, width=thin)
    draw.rectangle((210 * s, 670 * s, 270 * s, 730 * s), fill=peach)
    draw.rectangle((275 * s, 670 * s, 340 * s, 730 * s), fill=peach)
    draw.rectangle((340 * s, 670 * s, 405 * s, 730 * s), fill=green)

    # Ribbons
    draw.polygon(
        [
            (345 * s, 250 * s), (415 * s, 250 * s), (520 * s, 410 * s), (485 * s, 445 * s),
            (390 * s, 335 * s), (332 * s, 375 * s), (305 * s, 355 * s),
        ],
        fill=blue,
        outline=outline,
    )
    draw.polygon(
        [
            (392 * s, 225 * s), (445 * s, 225 * s), (565 * s, 420 * s), (530 * s, 450 * s),
            (430 * s, 320 * s), (365 * s, 362 * s), (336 * s, 338 * s),
        ],
        fill=mint,
        outline=outline,
    )
    draw.polygon(
        [
            (445 * s, 250 * s), (495 * s, 250 * s), (610 * s, 425 * s), (575 * s, 460 * s),
            (480 * s, 345 * s), (425 * s, 385 * s), (402 * s, 365 * s),
        ],
        fill=purple,
        outline=outline,
    )

    # Bookmarks
    draw.polygon([(370 * s, 180 * s), (440 * s, 180 * s), (440 * s, 310 * s), (405 * s, 280 * s), (370 * s, 310 * s)], fill=green, outline=outline)
    draw.polygon([(560 * s, 180 * s), (630 * s, 180 * s), (630 * s, 310 * s), (595 * s, 280 * s), (560 * s, 310 * s)], fill=purple, outline=outline)
    draw.text((394 * s, 210 * s), "V", fill=white)
    draw.text((586 * s, 210 * s), "A", fill=white)

    # Pencil bubble
    draw.ellipse((595 * s, 250 * s, 875 * s, 530 * s), outline=outline, width=w, fill=white)
    draw.polygon([(625 * s, 500 * s), (675 * s, 460 * s), (655 * s, 540 * s)], outline=outline, fill=white)
    draw.polygon([(720 * s, 320 * s), (785 * s, 385 * s), (710 * s, 460 * s), (645 * s, 395 * s)], fill=beige, outline=outline)
    draw.line((685 * s, 430 * s, 740 * s, 375 * s), fill=outline, width=thin)
    draw.line((735 * s, 325 * s, 785 * s, 375 * s), fill=green, width=thin)

    # Brain circles
    draw.ellipse((700 * s, 610 * s, 820 * s, 730 * s), fill=green, outline=outline, width=thin)
    draw.ellipse((495 * s, 620 * s, 585 * s, 710 * s), fill=white, outline=outline, width=thin)
    for cx, cy, r in [(734, 646, 14), (758, 646, 14), (722, 670, 13), (772, 670, 13)]:
        draw.ellipse(((cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s), outline=outline, width=thin, fill=white)
    for cx, cy, r in [(527, 648, 11), (548, 648, 11), (520, 668, 10), (560, 668, 10)]:
        draw.ellipse(((cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s), outline=outline, width=thin, fill=beige)

    # Badge
    draw.ellipse((620 * s, 700 * s, 860 * s, 940 * s), fill=black)
    draw.text((682 * s, 772 * s), "V.A", fill=white)
    draw.text((735 * s, 836 * s), "I", fill=white)

    return image


def write_svg(path: Path) -> None:
    path.write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
<rect width="256" height="256" fill="none"/>
<path d="M66 62h59c18 0 34 7 47 20 13-13 29-20 47-20h1v131c-18 0-34 7-48 20-13-13-30-20-47-20H66V62Z" fill="#FFF9F0" stroke="#241A14" stroke-width="8" stroke-linejoin="round"/>
<path d="M127 63v150" stroke="#241A14" stroke-width="8"/>
<path d="M45 150h70v55H45z" fill="#FFF9F0" stroke="#241A14" stroke-width="8" stroke-linejoin="round"/>
<path d="M45 150h70v18H45z" fill="#6DA676"/>
<path d="M90 55 138 128 97 152 56 95Z" fill="#78A7E6" stroke="#241A14" stroke-width="6" stroke-linejoin="round"/>
<path d="M107 49 155 124 116 149 74 88Z" fill="#75C9B7" stroke="#241A14" stroke-width="6" stroke-linejoin="round"/>
<path d="M123 57 172 130 134 157 93 100Z" fill="#8D78D7" stroke="#241A14" stroke-width="6" stroke-linejoin="round"/>
<circle cx="198" cy="197" r="38" fill="#18120F"/>
<path d="M176 214c9-10 17-21 22-34 6 12 13 23 22 34" stroke="#6DA676" stroke-width="8" stroke-linecap="round"/>
<path d="M42 82h33v52H42z" fill="#FFF9F0" stroke="#241A14" stroke-width="6" rx="8"/>
<path d="m51 96 6 6 12-15M51 112l6 6 12-15M51 128l6 6 12-15" stroke="#6DA676" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>""",
        encoding="utf-8",
    )


def main() -> None:
    base = make_icon(1024)

    png_path = TAURI_ICONS / "icon.png"
    ico_path = TAURI_ICONS / "icon.ico"
    base.save(png_path)
    base.resize((256, 256), Image.LANCZOS).save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    base.resize((180, 180), Image.LANCZOS).save(PUBLIC_DIR / "apple-icon.png")
    base.resize((32, 32), Image.LANCZOS).save(PUBLIC_DIR / "icon-light-32x32.png")
    base.resize((32, 32), Image.LANCZOS).save(PUBLIC_DIR / "icon-dark-32x32.png")
    write_svg(PUBLIC_DIR / "icon.svg")


if __name__ == "__main__":
    main()
