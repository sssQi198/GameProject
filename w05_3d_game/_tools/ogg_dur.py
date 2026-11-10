"""读 Ogg Vorbis 的时长（不依赖第三方库）。

Windows 自带的 WMP 不解 ogg，本机也没有 ffmpeg / soundfile，
所以直接解析 Ogg 容器：identification header 里取采样率，
最后一页的 granule position 就是总采样数。

用法：python ogg_dur.py <目录或文件> [...]
"""

import sys
from pathlib import Path


def ogg_duration(path: Path) -> float | None:
    data = path.read_bytes()
    pos = data.find(b"\x01vorbis")
    if pos < 0:
        return None
    head = data[pos + 7 :]
    if len(head) < 12:
        return None
    # 版本 u32, 声道 u8, 采样率 u32
    rate = int.from_bytes(head[5:9], "little")
    if not rate:
        return None
    granule = 0
    i = data.rfind(b"OggS")
    while i >= 0:
        if i + 14 <= len(data):
            page = data[i + 6 : i + 14]
            if len(page) == 8:
                granule = int.from_bytes(page, "little", signed=True)
                if granule > 0:
                    break
        i = data.rfind(b"OggS", 0, i)
    if granule <= 0:
        return None
    return granule / rate


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    targets: list[Path] = []
    for arg in argv:
        p = Path(arg)
        if p.is_dir():
            targets.extend(sorted(p.rglob("*.ogg")))
        elif p.suffix.lower() == ".ogg":
            targets.append(p)
    for p in targets:
        try:
            d = ogg_duration(p)
        except OSError as exc:
            print(f"{p.name}|ERR {exc}")
            continue
        if d is None:
            print(f"{p.name}|?")
        else:
            print(f"{p.name}|{d:.2f}s|{p.stat().st_size}B")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))