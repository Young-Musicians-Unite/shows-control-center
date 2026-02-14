# Dark Mode Fix & Staff Page Improvements

## ✅ Changes Completed

### 1. **Fixed Dark Mode (Mobile-Only)**

**Problem:** Dark mode was applying to desktop too - you wanted desktop to always be light mode.

**Solution:** Changed dark mode to ONLY apply on mobile devices.

**How it works now:**
- **Desktop (769px+):** Always light mode (ignores system dark mode preference)
- **Mobile (≤768px):** Dark mode when phone is in dark mode, light mode otherwise
- **Automatic:** No toggle needed, works based on device size + system preference

**Technical change:**
```css
/* Before */
@media (prefers-color-scheme: dark) {
    /* Applied to ALL devices */
}

/* After */
@media (max-width: 768px) and (prefers-color-scheme: dark) {
    /* ONLY applies to mobile */
}
```

### 2. **Added Print & Export to Staff Page**

**Added buttons:**
- 🖨️ **Print** - Print staff contact list
- 📊 **Export to Excel** - Download staff as spreadsheet

**Export format:**
```
Name | Role | Responsibilities | Phone | Email
-----|------|------------------|-------|------
Zach Larmer | Event Director | ... | ... | zach@...
Estelle Morales | Production Manager | ... | ... | ...
```

**File name:** `Staff_Contact_List_2026-02-14.xlsx`

## 📋 What Changed

### Files Modified:

**HTML:**
- `index.html` - Added Print and Export buttons to Staff page

**CSS:**
- `css/styles.css` - Changed dark mode to mobile-only

**JavaScript:**
- `js/app.js` - Added `printStaff()` and `exportStaffToExcel()` functions
- Updated `setupExportAndPrint()` to include staff buttons

## 🚀 Deploy Now

```bash
cd ~/Desktop/Gala/gala-management
git add css/styles.css index.html js/app.js DARK_MODE_AND_STAFF_IMPROVEMENTS.md
git commit -m "Fix dark mode for mobile-only and add print/export to staff page"
git push
```

## 🧪 Testing

### Test Dark Mode Fix:

**On Desktop:**
1. Visit site on computer
2. Toggle your system dark mode ON/OFF
3. **Site should ALWAYS stay in light mode** (Havana Nights gold/green theme)
4. Dark mode preference should be ignored

**On Mobile:**
1. Visit site on phone
2. **With phone in light mode:** Site uses light theme
3. **With phone in dark mode:** Site uses dark theme
4. Toggle your phone's dark mode to see it switch automatically

### Test Staff Print & Export:

1. Navigate to Staff page
2. Click **🖨️ Print**
   - Should open print dialog
   - Print preview should show staff cards cleanly
3. Click **📊 Export to Excel**
   - Should download `Staff_Contact_List_YYYY-MM-DD.xlsx`
   - Open file - should have all staff with columns: Name, Role, Responsibilities, Phone, Email
   - Wide columns for easy reading

## 📊 Before vs After

### Dark Mode Behavior

**Before:**
```
Desktop (light mode system) → Light theme ✓
Desktop (dark mode system)  → Dark theme ✗ (unwanted)
Mobile (light mode system)  → Light theme ✓
Mobile (dark mode system)   → Dark theme ✓
```

**After:**
```
Desktop (light mode system) → Light theme ✓
Desktop (dark mode system)  → Light theme ✓ (fixed!)
Mobile (light mode system)  → Light theme ✓
Mobile (dark mode system)   → Dark theme ✓
```

### Staff Page Features

**Before:**
```
Staff page header:
[+ Add Staff Member]
```

**After:**
```
Staff page header:
[🖨️ Print] [📊 Export to Excel] [+ Add Staff Member]
```

## 💡 Why Mobile-Only Dark Mode?

**Reasoning:**
1. **Desktop users** typically work in offices with consistent lighting
2. **Mobile users** switch between different environments (bright outdoors, dark rooms)
3. **Havana Nights theme** looks best in its designed light mode on large screens
4. **Mobile screens** benefit more from dark mode (battery, eye strain in dark environments)

**Result:** Best of both worlds!

## 🎯 Use Cases

### Print Staff List:
- Print emergency contact sheet
- Post backstage for quick reference
- Give to security/check-in staff
- Day-of coordination reference

### Export Staff to Excel:
- Share with team via email
- Import into other systems
- Create backup contact list
- Distribute to venue staff

## 📝 Export Details

### Column Widths (Optimized):
- **Name:** 20 characters
- **Role:** 25 characters
- **Responsibilities:** 50 characters (wide for full descriptions)
- **Phone:** 15 characters
- **Email:** 30 characters

### File Format:
- Standard Excel (.xlsx)
- Single sheet named "Staff"
- Headers in first row
- Auto-sized for readability

## ✨ Summary

**Issue 1: Dark Mode on Desktop**
- **Problem:** Desktop was dark when system preference was dark
- **Solution:** Dark mode now mobile-only
- **Result:** Desktop always light, mobile auto-adjusts

**Issue 2: Staff Page Missing Export/Print**
- **Problem:** No way to print or export staff contacts
- **Solution:** Added Print and Excel export buttons
- **Result:** Consistent with other pages, easy to share contacts

Both improvements are clean, simple, and match existing patterns!
