#!/usr/bin/env python3
"""Build the tunnel provider handoff ZIP from reviewed source files."""

from pathlib import Path
import hashlib
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "START-HERE.md": ROOT / "docs/tunnel-provider-start-here.md",
    "tunnel-provider-basic.json": ROOT / "docs/tunnel-provider-basic.json",
    "check-config.py": ROOT / "scripts/check-tunnel-provider-config.py",
    "technical-notes.md": ROOT / "docs/tunnel-provider-setup.md",
}
OUTPUT = ROOT / "downloads/tunnel-provider-pack.zip"


def add(archive: zipfile.ZipFile, name: str, content: bytes) -> None:
    info = zipfile.ZipInfo(f"tunnel-provider-pack/{name}", (2026, 9, 29, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    checksums = []
    with zipfile.ZipFile(OUTPUT, "w") as archive:
        for name, source in SOURCES.items():
            content = source.read_bytes()
            add(archive, name, content)
            checksums.append(f"{hashlib.sha256(content).hexdigest()}  {name}\n")
        add(archive, "SHA256SUMS", "".join(checksums).encode())
    print(f"{OUTPUT}  sha256={hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
