"""Generate anti-aliased PNG icons for the PWA. Run once: python generate_icons.py"""
import struct
import zlib

SUPERSAMPLE = 4

def create_png(width, height, bg_color, moon_color, filename):
    sw = width * SUPERSAMPLE
    sh = height * SUPERSAMPLE
    cx, cy = sw // 2, sh // 2
    r1 = int(min(sw, sh) * 0.35)
    r2 = int(r1 * 0.75)
    ox = int(r1 * 0.3)
    oy = -int(r1 * 0.1)
    r1_sq = r1 * r1
    r2_sq = r2 * r2

    hires = []
    for y in range(sh):
        row = []
        dy1 = y - cy
        dy2 = y - (cy + oy)
        dy1_sq = dy1 * dy1
        dy2_sq = dy2 * dy2
        for x in range(sw):
            dx1 = x - cx
            dx2 = x - (cx + ox)
            in_main = (dx1 * dx1 + dy1_sq) <= r1_sq
            in_cut = (dx2 * dx2 + dy2_sq) <= r2_sq
            row.append(1 if in_main and not in_cut else 0)
        hires.append(row)

    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            total = 0
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    total += hires[y * SUPERSAMPLE + sy][x * SUPERSAMPLE + sx]
            alpha = total / (SUPERSAMPLE * SUPERSAMPLE)
            r = int(bg_color[0] * (1 - alpha) + moon_color[0] * alpha)
            g = int(bg_color[1] * (1 - alpha) + moon_color[1] * alpha)
            b = int(bg_color[2] * (1 - alpha) + moon_color[2] * alpha)
            row.extend([r, g, b])
        pixels.append(bytes([0] + row))

    raw = b''.join(pixels)

    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', idat)
    png += chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(png)
    print(f"Created {filename} ({width}x{height})")

bg = [26, 26, 46]
moon = [123, 104, 238]

create_png(192, 192, bg, moon, 'icons/icon-192.png')
create_png(512, 512, bg, moon, 'icons/icon-512.png')
create_png(180, 180, bg, moon, 'icons/apple-touch-icon.png')
