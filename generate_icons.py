"""Generate simple PNG icons for the PWA. Run once: python generate_icons.py"""
import struct
import zlib

def create_png(width, height, bg_color, circle_color, filename):
    """Create a minimal PNG with a moon crescent icon."""
    pixels = []
    cx, cy = width // 2, height // 2
    r1 = int(min(width, height) * 0.35)
    r2 = int(r1 * 0.75)
    offset_x = int(r1 * 0.3)

    for y in range(height):
        row = []
        for x in range(width):
            dx1, dy1 = x - cx, y - cy
            dx2, dy2 = x - (cx + offset_x), y - (cy - int(r1 * 0.1))
            in_main = (dx1 * dx1 + dy1 * dy1) <= r1 * r1
            in_cut = (dx2 * dx2 + dy2 * dy2) <= r2 * r2
            if in_main and not in_cut:
                row.extend(circle_color)
            else:
                row.extend(bg_color)
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
