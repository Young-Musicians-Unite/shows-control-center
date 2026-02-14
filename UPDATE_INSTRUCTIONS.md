# Gala Management System - Update Instructions

## Updates Completed

I've made three major improvements to your gala management system:

### 1. ✅ Multi-Day Timeline (Thursday, Friday, Saturday)
- Added day tabs to the Timeline page
- Timeline now shows separate data for:
  - Thursday (April 23) - Setup Day
  - Friday (April 24) - Setup Day
  - Saturday (April 25) - Gala Day
- Created migration script to import all three days from Excel

### 2. ✅ Budget Category Sorting
- Added dropdown menu on Budget page to filter by category
- You can now view budget items for a specific category
- Makes it easier to track spending by department

### 3. ✅ Budget Category Dropdown
- Changed "Category" field from text input to dropdown menu
- Ensures consistent category names across all budget items
- Categories match your Excel file exactly

## Files Modified

- `index.html` - Added day tabs, category dropdown, and sort dropdown
- `css/styles.css` - Added styling for day tabs and improved layout
- `js/app.js` - Added timeline filtering, budget sorting logic
- `scripts/migrate_timeline_days.py` - **NEW** script to import multi-day timeline

## Next Steps - Complete on Your Computer

### Step 1: Commit and Push Code Changes

Open Terminal and run:

```bash
cd ~/Desktop/Gala/gala-management

# Remove any git lock files if needed
rm -f .git/index.lock

# Stage all changes
git add .

# Commit the updates
git commit -m "Add multi-day timeline, budget category sorting, and category dropdown"

# Push to GitHub
git push
```

### Step 2: Migrate Timeline Data

The timeline data needs to be imported from your Excel file. Run this command:

```bash
cd ~/Desktop/Gala/gala-management/scripts
python3 migrate_timeline_days.py
```

This script will:
- Clear existing timeline data
- Import timeline from "TIMELINE - THURSDAY" sheet
- Import timeline from "TIMELINE - FRIDAY" sheet
- Import timeline from "TIMELINE - SATURDAY" sheet
- Preserve all fields: time, event, responsible, staff

**Note:** Make sure your `service-account-key.json` file is in the `gala-management` directory.

Expected output:
```
Starting multi-day timeline migration...

Clearing existing timeline data...
Deleted XX existing timeline items
✓ Migrated XX items from Thursday
✓ Migrated XX items from Friday
✓ Migrated XX items from Saturday

✅ Total timeline items migrated: XXX
```

### Step 3: Wait for GitHub Pages Deployment

After pushing, wait 1-2 minutes for GitHub Pages to rebuild.

### Step 4: View Updates

Visit your live site and hard refresh:
- **URL:** https://zach992.github.io/ymu-gala-2026/
- **Hard Refresh:** Cmd+Shift+R

## What You'll See

### Timeline Page
- Three day tabs at the top: Thursday, Friday, Saturday
- Click each tab to view that day's schedule
- Tasks are sorted by time for each day
- Each task shows: time, event, responsible person, staff

### Budget Page
- New "Sort by Category" dropdown in the table header
- Select a category to view only items from that category
- Select "Sort by Category" (blank) to view all items

### Add Budget Item Modal
- "Category" is now a dropdown menu instead of text input
- All 7 categories are pre-populated:
  - Talent/Performers & Hosts
  - A/V Production
  - Venue & Permits
  - Food & Beverage
  - Staff & Labor
  - Marketing, Promotion & Branding
  - Decor & Miscellaneous Supplies

## Troubleshooting

### If timeline data doesn't show after migration:
1. Check the browser console for errors (F12 → Console tab)
2. Verify Firebase security rules allow read/write
3. Check that Excel file path is correct in script

### If git push fails:
```bash
# Check git remote
git remote -v

# Should show: origin https://github.com/zach992/ymu-gala-2026.git

# If not set, add it:
git remote add origin https://github.com/zach992/ymu-gala-2026.git
```

### If migration script fails:
```bash
# Install required Python packages
pip3 install firebase-admin pandas openpyxl

# Verify service account key exists
ls ~/Desktop/Gala/gala-management/service-account-key.json

# Verify Excel file exists
ls ~/Desktop/Gala/"13th Gala Run of Show 2026.xlsx"
```

## Need Help?

If you encounter any issues, let me know and I can help troubleshoot!
