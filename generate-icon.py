#!/usr/bin/env python3
"""Generate Tauri Play app icon and all required sizes."""

from PIL import Image, ImageDraw, ImageFont
import math
import os

SIZE = 1024


def draw_rounded_rect(draw, xy, radius, fill):
    """Draw a rounded rectangle with solid fill (no alpha compositing issues)."""
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=fill)


def create_icon(size=SIZE):
    """Create the Tauri Play icon."""
    # Use RGB mode to avoid alpha compositing issues
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Create the main icon on an opaque layer
    icon_layer = Image.new("RGB", (size, size), (0, 0, 0))
    draw = ImageDraw.Draw(icon_layer)

    margin = int(size * 0.0)
    radius = int(size * 0.18)

    # Solid dark background
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=(12, 12, 18),
    )

    # Subtle gradient - slightly lighter at top
    for y in range(margin + radius, size - margin - radius):
        t = (y - margin) / (size - 2 * margin)
        brightness = int(8 * (1 - t))
        if brightness > 0:
            draw.line(
                [(margin + 2, y), (size - margin - 2, y)],
                fill=(12 + brightness, 12 + brightness, 18 + brightness),
            )

    # --- Waveform bars ---
    bar_count = 40
    bar_region_left = int(size * 0.12)
    bar_region_right = int(size * 0.88)
    bar_region_width = bar_region_right - bar_region_left
    bar_gap = bar_region_width / bar_count
    bar_width = max(int(bar_gap * 0.55), 2)

    wave_cy = int(size * 0.47)

    for i in range(bar_count):
        x = int(bar_region_left + i * bar_gap + bar_gap * 0.22)

        # Bell curve with variation
        t = (i - bar_count / 2) / (bar_count / 2)
        envelope = math.exp(-2.0 * t * t)
        variation = 0.5 + 0.5 * abs(math.sin(i * 1.9 + 0.3))
        bar_h = int(size * 0.20 * envelope * variation)
        bar_h = max(bar_h, int(size * 0.012))

        # Color: blue-violet gradient across bars
        progress = i / bar_count
        r = int(90 + 80 * progress)
        g = int(70 + 30 * progress)
        b = int(200 - 30 * progress)
        alpha_factor = 0.35 + 0.45 * envelope

        cr = int(r * alpha_factor)
        cg = int(g * alpha_factor)
        cb = int(b * alpha_factor)

        # Top bars
        draw.rounded_rectangle(
            [x, wave_cy - bar_h, x + bar_width, wave_cy - 2],
            radius=max(bar_width // 3, 1),
            fill=(cr, cg, cb),
        )
        # Bottom bars (mirror, shorter)
        mirror_h = int(bar_h * 0.45)
        draw.rounded_rectangle(
            [x, wave_cy + 2, x + bar_width, wave_cy + mirror_h],
            radius=max(bar_width // 3, 1),
            fill=(int(cr * 0.7), int(cg * 0.7), int(cb * 0.7)),
        )

    # --- Play button triangle ---
    play_cx = int(size * 0.47)
    play_cy = int(size * 0.45)
    play_r = int(size * 0.18)

    tri_left = play_cx - int(play_r * 0.45)
    tri_right = play_cx + int(play_r * 0.65)
    tri_top = play_cy - int(play_r * 0.55)
    tri_bottom = play_cy + int(play_r * 0.55)

    # Glow layers
    for g in range(8, 0, -1):
        ex = g * int(size * 0.008)
        brightness = int(25 + 12 * (8 - g))
        draw.polygon(
            [
                (tri_left - ex, tri_top - ex),
                (tri_right + ex, play_cy),
                (tri_left - ex, tri_bottom + ex),
            ],
            fill=(brightness, brightness, brightness + 15),
        )

    # Main triangle - bright white
    draw.polygon(
        [
            (tri_left, tri_top),
            (tri_right, play_cy),
            (tri_left, tri_bottom),
        ],
        fill=(235, 237, 250),
    )

    # --- "TAURI PLAY" text ---
    text_y = int(size * 0.73)
    font_size = int(size * 0.058)

    font = None
    font_paths = [
        "/Library/Fonts/SF-Pro-Display-Bold.otf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, font_size)
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default()

    # Draw text
    text = "TAURI PLAY"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    tx = (size - tw) // 2

    # Text shadow
    draw.text((tx, text_y + 2), text, fill=(5, 5, 10), font=font)
    # Main text
    draw.text((tx, text_y), text, fill=(180, 185, 210), font=font)

    # Accent line under text
    line_w = int(size * 0.22)
    line_y = text_y + font_size + int(size * 0.02)
    lx1 = (size - line_w) // 2
    lx2 = lx1 + line_w

    for x in range(lx1, lx2):
        p = (x - lx1) / line_w
        r = int(80 + 120 * p)
        g = int(80 + 40 * p)
        b = int(220 - 50 * p)
        draw.line([(x, line_y), (x, line_y + 2)], fill=(r, g, b))

    # Create mask for rounded corners on the transparent output
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=255,
    )

    # Composite onto transparent background
    img.paste(icon_layer, (0, 0), mask)

    return img


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(base_dir, "src-tauri", "icons")

    print("Generating Tauri Play icon...")
    icon = create_icon(1024)

    # Save main app icon
    app_icon_path = os.path.join(base_dir, "app-icon.png")
    icon.save(app_icon_path, "PNG")
    print(f"  Saved {app_icon_path} (1024x1024)")

    # Generate all required sizes
    sizes = {
        "icon.png": 512,
        "128x128@2x.png": 256,
        "128x128.png": 128,
        "32x32.png": 32,
    }

    for filename, sz in sizes.items():
        resized = icon.resize((sz, sz), Image.LANCZOS)
        path = os.path.join(icons_dir, filename)
        resized.save(path, "PNG")
        print(f"  Saved {path} ({sz}x{sz})")

    print("\nAll icons generated!")


if __name__ == "__main__":
    main()
