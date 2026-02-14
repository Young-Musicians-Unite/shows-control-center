# Gala Management System - February 2026 Updates

## Updates Completed

I've made two major improvements to your gala management system:

### 1. ✅ Consolidated Input Lists Page

**What Changed:**
- Merged "Main Stage" and "Cocktail Stage" pages into a single "Input Lists" page
- Added stage tabs (like the Timeline page) to switch between Main and Cocktail stages
- Consolidated export function to export both stages to a single Excel file with 2 sheets

**Benefits:**
- Cleaner navigation with 5 links instead of 6
- Easier to switch between stages without changing pages
- Single Excel export contains both stages for easier distribution

### 2. ✅ Merged Vendor & Budget Data

**What Changed:**
- Added contact fields to budget items: Contact Person, Phone, Email
- Vendor page now reads from the budget collection (single source of truth)
- Changes made in Budget page automatically appear in Vendor page and vice versa
- Created migration script to merge existing vendor data into budget

**Benefits:**
- No more duplicate data entry
- Changes sync in real-time between Budget and Vendor views
- Contact information stored with budget items
- Single database collection to maintain

## Files Modified

### Frontend Files
- `index.html` - Consolidated stage pages, added contact fields to budget form, updated vendor table headers
- `css/styles.css` - No changes needed (day-tabs styling works for stage tabs)
- `js/app.js` - Added stage tab switching, merged vendor/budget rendering, updated form handlers
- `js/config.js` - No changes needed

### Backend Files
- `scripts/merge_vendors_to_budget.py` - **NEW** script to merge vendor data into budget collection

## Next Steps - Complete on Your Computer

### Step 1: Commit and Push Code Changes

Open Terminal and run:

```bash
cd ~/Desktop/Gala/gala-management

# Stage all changes
git add .

# Commit the updates
git commit -m "Consolidate stage pages and merge vendor/budget data"

# Push to GitHub
git push
```

### Step 2: Merge Vendor Data into Budget

Run the migration script to merge existing vendor data:

```bash
cd ~/Desktop/Gala/gala-management/scripts
python3 merge_vendors_to_budget.py
```

This script will:
- Check for existing vendors
- Merge vendor contact info into matching budget items
- Create new budget items for vendors not in budget
- Preserve all existing data

Expected output:
```
Starting vendor to budget merge...
This will merge vendor data into budget collection with contact fields.

Current state:
  Vendors: XX
  Budget items: XX

✓ Updated existing budget item: [Vendor Name]
✓ Created new budget item from vendor: [Vendor Name]

✅ Merge complete!
  Items merged/updated: XX
  Items skipped: XX

Next steps:
1. Verify the data in your app
2. Once verified, you can safely delete the vendors collection
```

**Important:** Review your data in the app before proceeding to Step 3.

### Step 3: Wait for GitHub Pages Deployment

After pushing, wait 1-2 minutes for GitHub Pages to rebuild.

### Step 4: View Updates

Visit your live site and hard refresh:
- **URL:** https://zach992.github.io/ymu-gala-2026/
- **Hard Refresh:** Cmd+Shift+R

### Step 5: Verify the Changes

**Input Lists Page:**
1. Click "Input Lists" in navigation
2. You should see two tabs: "Main Stage" | "Cocktail Stage"
3. Click each tab to view that stage's inputs
4. Click "📊 Export to Excel" to download both stages in one file
5. The Excel file should have 2 sheets: "Main Stage" and "Cocktail Stage"

**Budget Page:**
1. Click "Add Budget Item"
2. You should see new fields: Contact Person, Phone, Email
3. Add or edit a budget item with contact information
4. Save the item

**Vendor Page:**
1. Navigate to Vendors page
2. You should see the same budget items with contact information
3. The data should match what you entered in Budget page
4. Edit a vendor - it opens the same budget modal
5. Changes should sync between Budget and Vendor pages in real-time

### Step 6: Optional Cleanup (After Verification)

Once you've verified that vendor and budget data are syncing correctly, you can optionally remove the old vendors collection from Firebase:

**⚠️ ONLY DO THIS AFTER VERIFYING EVERYTHING WORKS!**

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project: ymu-gala-2026
3. Go to Firestore Database
4. Find the "vendors" collection
5. Click the three dots → Delete collection

This is optional because the old collection won't interfere with anything - it's just not being used anymore.

## What You'll See

### Input Lists Page
- Single page with "Main Stage" and "Cocktail Stage" tabs at the top
- Click tabs to switch between stages (like Timeline)
- Export button creates single Excel file with both stages
- Inline editing still works (double-click to edit)

### Budget Page
- New fields when adding/editing items:
  - Contact Person
  - Phone
  - Email
- All other functionality remains the same
- Collapsible categories still work
- Inline editing still works

### Vendor Page
- Shows same data as budget items
- Displays contact information (person, phone, email)
- Edit/Delete buttons open budget modal
- Changes sync with Budget page in real-time
- Search and filters still work

## Technical Details

### Data Sync
- Both Vendor and Budget pages read from the same `budget` collection
- Real-time Firebase listeners ensure changes appear immediately
- No manual refresh needed - updates are instant

### Data Structure
Budget items now include:
```javascript
{
  vendor: "Vendor Name",
  category: "6811a - Category Name",
  contact: "Contact Person Name",
  phone: "(555) 123-4567",
  email: "contact@vendor.com",
  budgeted: 1000.00,
  actual: 950.00,
  paymentStatus: "paid",
  notes: "Additional notes"
}
```

### Migration Safety
The merge script:
- Only adds contact info if budget item doesn't have it
- Never deletes data
- Creates new budget items for vendors not in budget
- Safe to run multiple times (idempotent)

## Troubleshooting

### If stage tabs don't appear:
1. Hard refresh: Cmd+Shift+R
2. Check browser console for errors (F12 → Console)
3. Verify navigation shows "Input Lists" (not "Main Stage" and "Cocktail Stage")

### If contact fields don't show in budget form:
1. Hard refresh: Cmd+Shift+R
2. Try adding a new budget item (not editing existing)
3. Check that you're using the latest version from GitHub

### If vendor and budget data don't sync:
1. Run the migration script again
2. Check Firebase Console to verify budget collection has contact fields
3. Hard refresh the page
4. Check browser console for errors

### If migration script fails:
```bash
# Make sure dependencies are installed
pip3 install firebase-admin --break-system-packages

# Verify service account key exists
ls ~/Desktop/Gala/gala-management/service-account-key.json

# Verify Firebase Admin SDK can connect
python3 -c "import firebase_admin; print('Firebase Admin installed')"
```

### If git push fails:
```bash
# Check git remote
git remote -v

# Should show: origin https://github.com/zach992/ymu-gala-2026.git

# If not set, add it:
git remote add origin https://github.com/zach992/ymu-gala-2026.git
```

## Need Help?

If you encounter any issues, let me know and I can help troubleshoot!

## Summary of Changes

**Removed:**
- Separate "Main Stage" and "Cocktail Stage" pages
- Separate vendor form and vendor collection (now uses budget)

**Added:**
- Single "Input Lists" page with stage tabs
- Contact fields in budget items (contact, phone, email)
- Migration script to merge vendor data

**Updated:**
- Vendor page now reads from budget collection
- Export stage inputs creates single file with 2 sheets
- Budget form includes contact information

**Result:**
- Cleaner navigation (5 links instead of 6)
- Single source of truth for vendor/budget data
- Real-time sync between Budget and Vendor views
- More comprehensive contact information
