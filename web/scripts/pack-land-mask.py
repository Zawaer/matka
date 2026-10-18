import json, struct, sys, zlib
src, dst = sys.argv[1], sys.argv[2]
W, H = 5750, 9000
raw = open(src, "rb").read()
assert len(raw) == W * H
try:
    import numpy as np
    bits = np.packbits(np.frombuffer(raw, dtype=np.uint8) & 1).tobytes()
except ImportError:
    # Pure Python: 8 cells per byte, most significant bit first.
    out = bytearray((W * H + 7) // 8)
    for i in range(0, W * H, 8):
        chunk = raw[i:i + 8]
        b = 0
        for k, v in enumerate(chunk):
            if v:
                b |= 0x80 >> k
        out[i // 8] = b
    bits = bytes(out)
meta = {"west": 9, "north": 71, "dlon": 0.004, "dlat": 0.002, "width": W, "height": H,
        "source": "OpenStreetMap land polygons (osmdata.openstreetmap.de), (c) OpenStreetMap contributors, ODbL",
        "encoding": "1 bit per cell, row-major from the north-west corner, MSB first; 1 = land"}
head = json.dumps(meta).encode()
with open(dst, "wb") as f:
    f.write(b"MKLAND1\n")
    f.write(struct.pack(">I", len(head)))
    f.write(head)
    f.write(zlib.compress(bits, 9))
land = sum(bin(b).count("1") for b in bits[: len(bits) // 50]) / (len(bits) // 50 * 8)
print("bytes", len(bits), "->", sum(1 for _ in [0]) and open(dst, "rb").seek(0, 2), "land fraction (first rows)", round(land, 3))
