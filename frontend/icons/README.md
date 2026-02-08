# App Icons

Generate these icons from your source logo:
https://res.cloudinary.com/dzmsj6nwv/image/upload/v1770507798/LOGO_j9byqh.png

## Required Icons

| Filename | Size | Purpose |
|----------|------|---------|
| icon-72.png | 72x72 | Android legacy |
| icon-96.png | 96x96 | Android legacy |
| icon-128.png | 128x128 | Chrome Web Store |
| icon-144.png | 144x144 | Windows tile |
| icon-152.png | 152x152 | iPad |
| icon-180.png | 180x180 | Apple Touch Icon (iPhone) |
| icon-192.png | 192x192 | Android home screen |
| icon-384.png | 384x384 | Android splash |
| icon-512.png | 512x512 | PWA install prompt |
| icon-512-maskable.png | 512x512 | Android adaptive icon (needs safe zone) |
| icon-1024.png | 1024x1024 | App Store (NO transparency/alpha) |

## How to Generate

1. Use a tool like https://realfavicongenerator.net or https://www.pwabuilder.com/imageGenerator
2. Upload your source logo
3. Download the generated icon pack
4. Place all icons in this folder

## Apple Touch Icon
The icon-180.png is referenced in all HTML files as the Apple Touch Icon.

## Maskable Icon Note
The maskable icon (icon-512-maskable.png) should have the logo centered with extra padding
(safe zone is the inner 80% circle). This ensures the icon looks good when Android applies
different shaped masks (circle, rounded square, etc).
