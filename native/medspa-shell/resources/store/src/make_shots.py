"""MedSpa App Play Store screenshots: 1080x1920, champagne background, caption, phone frame."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SP = os.path.dirname(os.path.abspath(__file__))
CAPS = os.path.join(SP, "caps")
OUT = r"C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP\Claude outputs\medspa-play-store"
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1920
INK = (43, 38, 34)
SUB = (122, 111, 100)
GOLD = (176, 141, 87)
LIGHT_GOLD = (201, 174, 132)
SEMI = os.path.join(SP, "hanken-semibold.ttf")
REG = os.path.join(SP, "hanken-regular.ttf")

BIG = [(50, 19), [(53, 41), (59, 47), (81, 50)], [(59, 53), (53, 59), (50, 81)], [(47, 59), (41, 53), (19, 50)], [(41, 47), (47, 41), (50, 19)]]
SMALL = [(74, 24), [(75, 30), (76, 31), (82, 32)], [(76, 33), (75, 34), (74, 40)], [(73, 34), (72, 33), (66, 32)], [(72, 31), (73, 30), (74, 24)]]


def bez(path, s, ox, oy):
    p0 = path[0]; out = []
    for c1, c2, p3 in path[1:]:
        for i in range(40):
            t = i / 40; u = 1 - t
            out.append((ox + s * (u**3*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t**3*p3[0]),
                        oy + s * (u**3*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t**3*p3[1])))
        p0 = p3
    return out


def sparkle(img, cx, cy, size, big=GOLD, small=LIGHT_GOLD, only_big=False):
    S = 4
    layer = Image.new("RGBA", (img.width * S, img.height * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    s = size * S / 62  # artwork spans ~62 units
    ox, oy = cx * S - 50 * s, cy * S - 50 * s
    d.polygon(bez(BIG, s, ox, oy), fill=big + (255,) if len(big) == 3 else big)
    if not only_big:
        d.polygon(bez(SMALL, s, ox, oy), fill=small + (255,) if len(small) == 3 else small)
    img.alpha_composite(layer.resize(img.size, Image.LANCZOS))


def background():
    bg = Image.new("RGBA", (W, H))
    top, bot = (248, 243, 235), (236, 226, 210)
    px = bg.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(top[i] * (1 - t) + bot[i] * t) for i in range(3)) + (255,)
        for x in range(W):
            px[x, y] = c
    sparkle(bg, 1010, 1480, 520, big=(232, 220, 200), small=(238, 228, 212))
    sparkle(bg, 70, 980, 260, big=(238, 228, 212), small=(241, 233, 220))
    return bg


def clean_status(shot):
    """Replace the captured status bar with a clean one (9:41, wifi, full battery)."""
    shot = shot.convert("RGBA")
    bar_h = 140
    col = shot.getpixel((540, bar_h + 6))
    d = ImageDraw.Draw(shot)
    d.rectangle([0, 0, shot.width, bar_h], fill=col)
    dark = sum(col[:3]) < 300
    fg = (255, 255, 255) if dark else (24, 22, 20)
    f = ImageFont.truetype(SEMI, 40)
    d.text((70, 52), "9:41", font=f, fill=fg)
    # battery
    x, y = 930, 60
    d.rounded_rectangle([x, y, x + 62, y + 30], radius=8, fill=fg)
    d.rounded_rectangle([x + 64, y + 9, x + 69, y + 21], radius=2, fill=fg)
    # wifi wedge
    wx, wy = 875, 88
    for r, a in [(34, 255), (24, 255), (12, 255)]:
        d.pieslice([wx - r, wy - r, wx + r, wy + r], 225, 315, fill=fg)
        d.pieslice([wx - r + 7, wy - r + 7, wx + r - 7, wy + r - 7], 225, 315, fill=col) if r > 12 else None
    return shot


def phone(screen, width=820):
    """Rounded phone frame around a screen image; returns RGBA with shadow margin."""
    bezel = 22
    sw = width - 2 * bezel
    sh = round(screen.height * sw / screen.width)
    scr = screen.resize((sw, sh), Image.LANCZOS)
    pw, ph = width, sh + 2 * bezel
    m = 80
    out = Image.new("RGBA", (pw + 2 * m, ph + 2 * m), (0, 0, 0, 0))
    sh_l = Image.new("L", out.size, 0)
    ImageDraw.Draw(sh_l).rounded_rectangle([m + 10, m + 40, m + pw - 10, m + ph], radius=110, fill=120)
    sh_l = sh_l.filter(ImageFilter.GaussianBlur(38))
    out.paste((60, 42, 20, 255), (0, 0), sh_l)
    body = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=108, fill=(28, 26, 24, 255))
    ImageDraw.Draw(body).rounded_rectangle([3, 3, pw - 4, ph - 4], radius=105, outline=(70, 66, 60, 255), width=3)
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw - 1, sh - 1], radius=88, fill=255)
    body.paste(scr, (bezel, bezel), mask)
    cam = 18
    ImageDraw.Draw(body).ellipse([pw / 2 - cam, bezel + 26, pw / 2 + cam, bezel + 26 + 2 * cam], fill=(12, 12, 12, 255))
    out.alpha_composite(body, (m, m))
    return out


def wrap(text, font, maxw, d):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= maxw: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur)
    return lines


def compose(name, headline, sub, screen):
    img = background()
    d = ImageDraw.Draw(img)
    sparkle(img, W / 2, 120, 54, only_big=False)
    size = 80
    while d.textlength(headline, font=ImageFont.truetype(SEMI, size)) > 960: size -= 2
    d.text((W / 2, 190), headline, font=ImageFont.truetype(SEMI, size), fill=INK, anchor="ma")
    fs = ImageFont.truetype(REG, 42)
    d.text((W / 2, 300), sub, font=fs, fill=SUB, anchor="ma")
    ph = phone(screen)
    img.alpha_composite(ph, ((W - ph.width) // 2, 330))
    img.convert("RGB").save(os.path.join(OUT, name), quality=95)
    return os.path.join(OUT, name)


def notification_screen():
    base = clean_status(Image.open(os.path.join(CAPS, "demo.png")))
    dim = base.filter(ImageFilter.GaussianBlur(18))
    dim = Image.alpha_composite(dim, Image.new("RGBA", dim.size, (30, 24, 18, 120)))
    n = Image.open(os.path.join(CAPS, "notif.png")).convert("RGBA")
    card = n.crop((42, 624, 1038, 945))
    m = Image.new("L", card.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, card.width - 1, card.height - 1], radius=64, fill=255)
    dim.paste(card, (42, 470), m)
    d = ImageDraw.Draw(dim)
    f = ImageFont.truetype(SEMI, 150)
    d.text((540, 150 + 40), "9:41", font=f, fill=(255, 255, 255), anchor="ma")
    return dim


shots = [
    ("01-home.png", "Your spa, in your pocket", "Points, gifts and offers in one app", clean_status(Image.open(os.path.join(CAPS, "demo.png")))),
    ("02-rewards.png", "Earn points every visit", "Unlock rewards from your spa", clean_status(Image.open(os.path.join(CAPS, "sbb_rewards.png")))),
    ("03-gifts.png", "Gifts, just for you", "Unwrap a welcome gift when you join", clean_status(Image.open(os.path.join(CAPS, "demo_gift.png")))),
    ("04-memberships.png", "Memberships made simple", "Join and manage your plan in the app", clean_status(Image.open(os.path.join(CAPS, "demo_shop_membership_pl_glow.png")))),
    ("05-notifications.png", "Never miss a reward", "Get a heads-up when something's waiting", notification_screen()),
    ("06-find.png", "Find your spa in seconds", "Search by name or scan the QR code", clean_status(Image.open(os.path.join(CAPS, "find.png")))),
]
for n, h, s, scr in shots:
    print(compose(n, h, s, scr))
