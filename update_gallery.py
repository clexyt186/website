#!/usr/bin/env python3
"""
CLEXYT — Gallery Manifest Generator
=====================================
Run this script from your website folder whenever you add new photos or videos.
It scans the /images and /videos folders and auto-updates manifest.json.

Usage:
    python3 update_gallery.py

That's it. Then git add . && git commit -m "update gallery" && git push
"""

import os
import json

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'}
VIDEO_EXTENSIONS = {'.mp4', '.webm', '.mov', '.avi'}

script_dir = os.path.dirname(os.path.abspath(__file__))
images_dir = os.path.join(script_dir, 'images')
videos_dir = os.path.join(script_dir, 'videos')
manifest_path = os.path.join(images_dir, 'manifest.json')

images = []
videos = []

# Scan images folder
if os.path.exists(images_dir):
    for f in sorted(os.listdir(images_dir)):
        if os.path.splitext(f)[1].lower() in IMAGE_EXTENSIONS:
            images.append(f)

# Scan videos folder
if os.path.exists(videos_dir):
    for f in sorted(os.listdir(videos_dir)):
        if os.path.splitext(f)[1].lower() in VIDEO_EXTENSIONS:
            videos.append(f)

manifest = {
    "_updated": __import__('datetime').datetime.now().isoformat(),
    "images": images,
    "videos": videos
}

os.makedirs(images_dir, exist_ok=True)
with open(manifest_path, 'w') as fp:
    json.dump(manifest, fp, indent=2)

print(f"✅ Manifest updated!")
print(f"   {len(images)} image(s): {', '.join(images) if images else 'none'}")
print(f"   {len(videos)} video(s): {', '.join(videos) if videos else 'none'}")
print(f"\nNow run:")
print(f"   git add . && git commit -m 'update gallery' && git push")
