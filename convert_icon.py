"""
Convert icon.ico to icon.png for Linux distribution.

This script is called from build_linux_alt.bat inside the Docker build
container after Pillow is installed. It produces a 48x48 PNG suitable
for use as a desktop application icon on ALT Linux.

Usage (inside Docker container):
    python3 /app/convert_icon.py
"""

from PIL import Image

img = Image.open('/app/icon.ico')
img = img.convert('RGBA')
img.thumbnail((48, 48))
img.save('/app/dist/linux/icon.png', 'PNG')
print('icon.png written')
