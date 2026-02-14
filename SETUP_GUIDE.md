# Complete Setup Guide - YMU Gala 2026 Management System

Follow these steps carefully to get your gala management system up and running!

## Prerequisites

- GitHub account (you already have this ✓)
- Firebase account (Google account) - you'll create this
- Python 3.7+ installed on your computer
- Basic command line knowledge

## Part 1: Firebase Setup (15 minutes)

### Step 1: Create Firebase Project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Sign in with your Google account (use zach@youngmusiciansunite.org)
3. Click **"Create a project"** or **"Add project"**
4. Enter project name: **`ymu-gala-2026`**
5. Click Continue
6. **Disable** Google Analytics (we don't need it)
7. Click **"Create project"**
8. Wait for setup to complete (30 seconds)
9. Click **"Continue"**

### Step 2: Enable Firestore Database

1. In left sidebar, click **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in production mode"**
4. Click Next
5. Select location: **`us-central`** (or closest to you)
6. Click **"Enable"**
7. Wait for database creation (1 minute)

### Step 3: Set Firestore Rules (Public Access)

1. Click **"Rules"** tab at top
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

3. Click **"Publish"**

⚠️ **Note**: This makes the database public. Only share the app URL with your team!

### Step 4: Enable Storage

1. In left sidebar, click **"Storage"**
2. Click **"Get started"**
3. Click **"Next"** (use default rules)
4. Select same location as Firestore: **`us-central`**
5. Click **"Done"**

### Step 5: Get Web App Configuration

1. Click the **gear icon ⚙️** next to "Project Overview" at top
2. Select **"Project settings"**
3. Scroll down to **"Your apps"** section
4. Click the **web icon** `</>`
5. App nickname: **`gala-management`**
6. **Do NOT** check "Firebase Hosting"
7. Click **"Register app"**
8. You'll see a code snippet with `firebaseConfig`
9. **Copy the entire firebaseConfig object** - it looks like:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "ymu-gala-2026.firebaseapp.com",
  projectId: "ymu-gala-2026",
  storageBucket: "ymu-gala-2026.appspot.com",
  messagingSenderId: "123...",
  appId: "1:123..."
};
```

10. Keep this tab open - you'll need these values!

### Step 6: Get Service Account Key

1. Stay in **Project Settings**
2. Click **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Click **"Generate key"** in popup
5. A JSON file downloads automatically
6. **Save this file** - you'll need it for data migration

## Part 2: Configure the Application (5 minutes)

### Step 7: Update Firebase Configuration

1. Open the file: `public/js/config.js`
2. Replace the placeholder values with your Firebase config from Step 5
3. **IMPORTANT**: Keep the exact format! Just replace the values.

Before:
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    // ...
};
```

After (with YOUR values):
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyAbc123...",
    authDomain: "ymu-gala-2026.firebaseapp.com",
    // ...
};
```

4. Save the file

### Step 8: Add Service Account Credentials

1. Rename the downloaded JSON file to: `firebase-credentials.json`
2. Move it to the `config/` folder in your project
3. **Verify** the path is: `config/firebase-credentials.json`

⚠️ **CRITICAL**: Do NOT commit this file to GitHub! It's already in `.gitignore`.

## Part 3: Import Your Data (10 minutes)

### Step 9: Install Python Dependencies

Open terminal/command prompt in the project folder:

```bash
pip install firebase-admin pandas openpyxl
```

If you get permission errors, try:
```bash
pip install --user firebase-admin pandas openpyxl
```

### Step 10: Run Data Migration

```bash
cd scripts
python migrate_data.py
```

You'll see:
```
=== YMU Gala 2026 - Data Migration Script ===
⚠️  This will CLEAR all existing data and import from Excel.
Continue? (yes/no):
```

Type **`yes`** and press Enter.

The script will:
- Clear any existing data
- Import budget data (80 items)
- Create vendor records from budget
- Import timeline/checklist tasks (159 items)
- Create event info

You should see:
```
✓ Migrated 80 budget items
✓ Created 80 vendor records
✓ Migrated 159 timeline items
✓ Event info created
✓ Migration completed successfully!
```

### Step 11: Verify Data in Firebase

1. Go back to Firebase Console
2. Click **"Firestore Database"**
3. You should see collections:
   - `budget` (80 documents)
   - `vendors` (80 documents)
   - `timeline` (159 documents)
   - `event-info` (1 document)

Click on any collection to see the data!

## Part 4: Test Locally (5 minutes)

### Step 12: Test the Application

1. Open `public/index.html` in your web browser
   - You can double-click the file, or
   - Right-click → Open With → Chrome/Firefox

2. You should see:
   - ✓ Countdown to April 25, 2026
   - ✓ Budget stats ($711,300 budgeted, $110,083 spent)
   - ✓ Vendor counts
   - ✓ Navigation working

3. Test each page:
   - Click **Vendors** - should show 80 vendors
   - Click **Budget** - should show budget breakdown
   - Click **Timeline** - should show 159 tasks

4. Test adding data:
   - Click **"+ Add Vendor"**
   - Fill in form
   - Click **"Save Vendor"**
   - Vendor should appear in list instantly!

If everything works, you're ready to deploy! 🎉

## Part 5: Deploy to GitHub Pages (10 minutes)

### Step 13: Create GitHub Repository

1. Go to [github.com](https://github.com)
2. Click **"+"** → **"New repository"**
3. Repository name: **`ymu-gala-2026`**
4. Description: **"YMU Fundraising Gala Management System"**
5. **Private** (recommended) or Public
6. **Do NOT** initialize with README
7. Click **"Create repository"**

### Step 14: Push Code to GitHub

Open terminal in your project folder:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Make first commit
git commit -m "Initial commit - YMU Gala 2026 Management System"

# Add your GitHub repository as remote
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/ymu-gala-2026.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 15: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **"Settings"** tab
3. Click **"Pages"** in left sidebar
4. Under **"Source"**, select: **"GitHub Actions"**
5. The site will deploy automatically!

### Step 16: Get Your Live URL

1. Wait 2-3 minutes for deployment
2. Go to **Settings → Pages**
3. You'll see: **"Your site is live at: `https://YOUR_USERNAME.github.io/ymu-gala-2026/`"**
4. Click the link to open your live app!

**🎉 Congratulations! Your gala management system is live!**

## Part 6: Share with Team

### Step 17: Share the URL

Share this URL with your team (2-5 people):
```
https://YOUR_USERNAME.github.io/ymu-gala-2026/
```

Everyone can:
- View real-time data
- Add/edit vendors
- Update budget
- Manage timeline
- Changes sync instantly for everyone!

## Quick Reference

### Your URLs

- **Live App**: `https://YOUR_USERNAME.github.io/ymu-gala-2026/`
- **GitHub Repo**: `https://github.com/YOUR_USERNAME/ymu-gala-2026`
- **Firebase Console**: [console.firebase.google.com](https://console.firebase.google.com/)

### Key Files

- `public/js/config.js` - Firebase configuration (safe to commit)
- `config/firebase-credentials.json` - Service account key (NEVER commit!)

### Useful Commands

```bash
# List all vendors
python scripts/db_helper.py list-vendors

# List budget items
python scripts/db_helper.py list-budget

# Search for vendor
python scripts/db_helper.py search-vendor "name"

# Update vendor status
python scripts/db_helper.py update-vendor VENDOR_ID status confirmed

# Show all commands
python scripts/db_helper.py help
```

## Troubleshooting

### "Firebase initialization failed"
- Check `config.js` has correct values
- Make sure there are no typos in the config

### Data not showing
- Open browser console (F12 → Console)
- Check for error messages
- Verify Firestore rules are published

### Migration script fails
- Ensure `firebase-credentials.json` is in `config/` folder
- Check Python dependencies are installed
- Verify Excel files are in correct location

### Can't push to GitHub
- Make sure you replaced `YOUR_USERNAME` with actual username
- Check you have permission to the repository
- Try `git remote -v` to see if remote is set correctly

## Next Steps

1. **Bookmark the live URL** - share with your team
2. **Test with team** - have someone else try adding a vendor
3. **Backup Firebase credentials** - store the JSON file safely
4. **Explore the app** - try all features!

## Need Help?

- Check Firebase Console for data
- Look at browser console (F12) for errors
- Review the main README.md for more details

---

**You're all set! Good luck with the gala! 🎵🎉**
