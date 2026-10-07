# Twemoji artwork attribution

Emoji artwork is by Twitter, Inc. and other contributors to Twemoji, maintained by the jdecked/twemoji project: https://github.com/jdecked/twemoji.

The original SVG graphics under this directory are licensed under Creative Commons Attribution 4.0 International (CC-BY 4.0): https://creativecommons.org/licenses/by/4.0/. The full license is included in `TWEMOJI_LICENSE.txt` at the repository root. Artwork is provided without warranties under that license.

`emoji-sprites.mjs` converts these SVG graphics into resized, compressed RGBA bitmap sprites for the public UNO table. These changes consist of rasterization, resizing, compression and placement with game decorations. No endorsement is implied. Runtime graphics attribution also appears in the personal settings panel.

Rebuild with `python scripts/build-emoji-sprites.py` (PyMuPDF and Pillow).
