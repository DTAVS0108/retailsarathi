"""
Prefer: node scripts/render-brand-icons.mjs (clean SVG render).

This script is a fallback that strips baked light-gray mattes from an old PNG
without eating the white logo glyph (edge-connected flood fill only).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    script = ROOT / "scripts" / "render-brand-icons.mjs"
    print("Rendering brand icons from SVG via resvg…")
    subprocess.check_call(["node", str(script)], cwd=str(ROOT))
    print("Regenerate Android/iOS launchers from apps/mobile:")
    print("  dart run flutter_launcher_icons")


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError:
        print("node not found — install Node.js, then: npm i @resvg/resvg-js", file=sys.stderr)
        sys.exit(1)
