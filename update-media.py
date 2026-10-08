"""
update-media.py - scans the media folders and rebuilds media.js

What it does:
  1. looks in media/<area>/ for images and videos
  2. looks in loading/ for loading animations
  3. updates captions.txt - every file gets a line you can write a message on
     (your existing messages are kept, new files are added at the end)
  4. writes media.js, which the site reads

How to use:
  - drop files into media/products, media/motion+3d or media/graphics+illustrations
  - double-click update-media.bat (or run: python update-media.py)
  - open captions.txt, write a message after the "=" for each file
  - double-click update-media.bat again so the messages go into the site

The order of lines in captions.txt is the order the media shows up in, so
you can move lines around to reorder things.

Don't edit media.js by hand - it gets overwritten every time this runs.
"""

import json
import os
import sys
from urllib.parse import quote

ROOT = os.path.dirname(os.path.abspath(__file__))
MEDIA_DIR = os.path.join(ROOT, "media")
LOADING_DIR = os.path.join(ROOT, "loading")
CAPTIONS = os.path.join(ROOT, "captions.txt")
OUT = os.path.join(ROOT, "media.js")

# folder name -> (id used by the mode switch, label). Order = order on the site.
AREAS = [
    ("motion+3d", "motion-3d", "Motion + 3D"),
    ("products", "products", "Products"),
    ("graphics+illustrations", "graphics-illustrations", "Graphics + Illustrations"),
]

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"}
VIDEO_EXT = {".mp4", ".webm", ".mov", ".m4v"}

HEADER = """\
# ------------------------------------------------------------------
#  captions for the media box
#
#  write a short message after the "=" on each line.
#  move lines up/down to change the order things appear in.
#  after editing, double-click update-media.bat to update the site.
#
#  lines starting with # are ignored.
# ------------------------------------------------------------------
"""


def url(path):
    """Relative path -> URL-safe path (spaces etc. encoded, '/' and '+' kept)."""
    return quote(path.replace(os.sep, "/"), safe="/+()!*'-._~,")


def kind(name):
    ext = os.path.splitext(name)[1].lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    return None


def list_files(folder):
    if not os.path.isdir(folder):
        return []
    return sorted(
        (f for f in os.listdir(folder)
         if os.path.isfile(os.path.join(folder, f)) and kind(f)),
        key=str.lower,
    )


def read_captions():
    """-> {folder: [(filename, message), ...]} in file order."""
    data = {}
    if not os.path.exists(CAPTIONS):
        return data
    section = None
    with open(CAPTIONS, encoding="utf-8-sig") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if s.startswith("[") and s.endswith("]"):
                section = s[1:-1].strip()
                data.setdefault(section, [])
                continue
            if section is None or "=" not in line:
                continue
            name, msg = line.split("=", 1)
            data[section].append((name.strip(), msg.strip()))
    return data


def main():
    old = read_captions()
    areas_out = []
    lines = [HEADER]
    added, removed = [], []

    known = [a[0] for a in AREAS]
    extra = [d for d in sorted(os.listdir(MEDIA_DIR)) if os.path.isdir(os.path.join(MEDIA_DIR, d)) and d not in known] \
        if os.path.isdir(MEDIA_DIR) else []
    areas = AREAS + [(d, d.replace("+", "-").replace(" ", "-").lower(), d) for d in extra]

    for folder, area_id, label in areas:
        files = list_files(os.path.join(MEDIA_DIR, folder))
        present = set(files)
        previous = old.get(folder, [])

        ordered = []   # (filename, message)
        seen = set()
        for name, msg in previous:          # keep your order + messages
            if name in present and name not in seen:
                ordered.append((name, msg))
                seen.add(name)
            elif name not in present:
                removed.append((folder, name, msg))
        for name in files:                  # new files go at the end
            if name not in seen:
                ordered.append((name, ""))
                added.append(folder + "/" + name)

        lines.append("[%s]" % folder)
        for name, msg in ordered:
            lines.append("%s = %s" % (name, msg))
        for f, name, msg in removed:
            if f == folder and msg:         # don't throw away text you wrote
                lines.append("# (file not found) %s = %s" % (name, msg))
        lines.append("")

        areas_out.append({
            "id": area_id,
            "label": label,
            "items": [
                {"type": kind(n), "src": url("media/%s/%s" % (folder, n)), "caption": m}
                for n, m in ordered
            ],
        })

    loaders = [url("loading/" + n) for n in list_files(LOADING_DIR) if kind(n) == "video" or n.lower().endswith(".gif")]

    with open(CAPTIONS, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines))

    js = (
        "/* GENERATED by update-media.py - don't edit by hand, it gets overwritten.\n"
        "   To change captions or order, edit captions.txt and run update-media.bat. */\n\n"
        "window.MEDIA = " + json.dumps({"categories": areas_out, "loaders": loaders}, indent=2, ensure_ascii=False) + ";\n"
    )
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(js)

    total = sum(len(a["items"]) for a in areas_out)
    print("media.js updated: %d files in %d areas, %d loading animations" % (total, len(areas_out), len(loaders)))
    for a in areas_out:
        empty = sum(1 for i in a["items"] if not i["caption"])
        print("  %-26s %3d files  (%d without a caption)" % (a["label"], len(a["items"]), empty))
    if added:
        print("\nnew files added to captions.txt:")
        for n in added:
            print("  + " + n)
    if removed:
        print("\nfiles listed in captions.txt but no longer in the folder:")
        for f, n, m in removed:
            print("  - %s/%s%s" % (f, n, "  (message kept as a comment)" if m else ""))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # keep the window readable when double-clicked
        print("something went wrong:", e)
        sys.exit(1)
