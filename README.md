# YMU Gala 2026 Management App

Web application for managing the 2026 Young Musicians Unite Gala event.

**🌐 Live Site:** https://zach992.github.io/ymu-gala-2026/

## Tech Stack
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Database:** Firebase Firestore (Project: ymu-gala-2026)
- **Hosting:** GitHub Pages (auto-deploys from main branch)
- **Canvas:** Fabric.js for venue map builder

## Quick Deployment
```bash
cd ~/Desktop/Gala/gala-management
./deploy.sh "Your commit message"
```

Or manually:
```bash
git add -A
git commit -m "Your message"
git push origin main
```

GitHub Pages automatically deploys changes within 1-2 minutes.

## Features
### 📊 Dashboard
Event countdown to April 25, 2026, budget overview, vendor status summary

### 🏢 Vendors
Manage vendor contacts, contracts, and payment tracking

### 💰 Budget
Track expenses across categories with visual progress indicators

### 📅 Timeline
Event schedule organized by day (Thursday-Sunday) with task management

### 🎤 Input Lists
Stage-specific equipment lists for Main Stage and Cocktail Stage

### 👥 Staff
Staff assignments and role management

## Project Structure
```
~/Desktop/Gala/
├── [spreadsheets]              # Original data files
└── gala-management/            # Web application
    ├── index.html              # Main application
    ├── css/styles.css          # All styling (~3200 lines)
    ├── js/app.js               # Application logic (~3500 lines)
    ├── deploy.sh               # Quick deployment script
    └── README.md               # This file
```

## Local Development
```bash
cd ~/Desktop/Gala/gala-management
open index.html
```

No build process needed - pure vanilla JavaScript!

## Firebase Configuration
- **Project ID:** ymu-gala-2026
- **Database:** Firestore
- **Collections:** vendors, budget, timeline, mainStageInputs, cocktailStageInputs, staff, stagePlots
- **Config location:** `js/app.js` (lines 40-50)

## Known Issues & Fixes
**Git lock files persist:**
```bash
rm -f .git/index.lock .git/HEAD.lock
```

## Repository
- **GitHub:** https://github.com/zach992/ymu-gala-2026
- **Pages URL:** https://zach992.github.io/ymu-gala-2026/

## Event Details
- **Date:** April 25, 2026, 6:00 PM
- **Organization:** Young Musicians Unite
- **Venue:** TBD

---

**🎵 13th Annual YMU Gala**
