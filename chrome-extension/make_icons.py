import zlib, struct, os

def make_icon(size, path):
    # Simple flat emerald square with a white "L" bar motif
    w = h = size
    rows = []
    radius = size // 8
    for y in range(h):
        row = bytearray([0])  # filter type 0
        for x in range(w):
            # rounded corner alpha
            dx = max(0, radius - x, x - (w - 1 - radius))
            dy = max(0, radius - y, y - (h - 1 - radius))
            dist = (dx * dx + dy * dy) ** 0.5
            if dist > radius:
                r = g = b = a = 0
            else:
                # emerald #059669 background
                r, g, b = 0x05, 0x96, 0x69
                a = 255
            # draw white bars (simple "L": vertical bar + horizontal bar)
            cx = x - w // 2
            cy = y - h // 2
            bar_w = max(3, w // 14)
            gap = w // 10
            if a == 255:
                if -w // 3 <= cx <= -gap and -h // 4 <= cy <= h // 4:
                    r = g = b = 255
                if -h // 4 <= cy <= -gap and -w // 3 <= cx <= w // 3:
                    r = g = b = 255
            row += bytes((r, g, b, a))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print('wrote', path)

base = os.path.dirname(os.path.abspath(__file__))
for s in (16, 48, 128):
    make_icon(s, os.path.join(base, f'icon{s}.png'))
