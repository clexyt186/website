# CLEXYT Studio Website

## Folder Structure
```
/
├── index.html          — Main hero with robot + two-panel choice
├── photography.html    — Photography & video services + portfolio
├── consulting.html     — Tech consulting + contact form
├── contact.html        — Contact details
├── booking.html        — Multi-step booking with ZAR prices
├── style.css           — All styles
├── script.js           — Starfield, robot, cursor, stats
├── images/
│   ├── manifest.json   — List your image filenames here
│   └── *.jpg/*.png     — Your portfolio photos
├── videos/
│   └── *.mp4           — Your portfolio videos
└── calendar/
    └── calendar.ics    — Download from Google Calendar weekly
```

## Adding Portfolio Images
1. Drop images into `/images/`
2. Edit `images/manifest.json` and add filenames to the array
3. Push to GitHub

## Calendar Sync
1. Google Calendar → Settings → Export → Download .ics
2. Rename to `calendar.ics`
3. Replace `calendar/calendar.ics`
4. Push to GitHub

## Services & Prices (ZAR)
- Short Photoshoot: R800 (deposit R450)
- Photoshoot + Video: R1,000 (deposit R550)
- Studio Shoot + Video: R1,700 (deposit R1,000)
- Video Shoot Outdoor: R2,200 (deposit R1,200)
- Video Shoot Studio: R3,200 (deposit R1,200)
