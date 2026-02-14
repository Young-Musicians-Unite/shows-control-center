# Staff Roles Page - Setup Guide

## ✅ What I Built

A simple, clean Staff Roles page for your core event team with:
- **Card grid layout** - easy to scan
- **Essential contact info** - name, role, responsibilities, phone, email
- **Clickable contacts** - tap phone to call, tap email to send message
- **Add/Edit functionality** - modal form like vendors/budget
- **Mobile-friendly** - cards stack nicely on phones
- **Dark mode support** - looks good in dark mode too

## 📋 Initial Staff Members

I've prepared your 4 core staff to be added:

1. **Zach Larmer** - Event Director
2. **Estelle Morales** - Production Manager
3. **Pedro Diaz** - Student Talent Coordinator
4. **Theo Braun** - Technical Director

## 🚀 Quick Start

### Step 1: Deploy the Page

```bash
cd ~/Desktop/Gala/gala-management
git add .
git commit -m "Add Staff Roles page with contact information"
git push
```

### Step 2: Add Initial Staff Members

```bash
cd ~/Desktop/Gala/gala-management/scripts
python3 add_initial_staff.py
```

Expected output:
```
Adding initial staff members...

✓ Added: Zach Larmer - Event Director
✓ Added: Estelle Morales - Production Manager
✓ Added: Pedro Diaz - Student Talent Coordinator
✓ Added: Theo Braun - Technical Director

✅ Successfully added 4 staff members!
```

### Step 3: View the Page

1. Wait 1-2 minutes for GitHub Pages
2. Visit: https://zach992.github.io/ymu-gala-2026/
3. Click **Staff** in navigation
4. You'll see your 4 core team members

## 📱 How It Works

### Card Layout

Each staff member shows as a clean card:

```
┌─────────────────────────────┐
│ Zach Larmer                 │ ← Name
│ Event Director              │ ← Role
├─────────────────────────────┤
│ Overall event planning,     │ ← Responsibilities
│ coordination, and execution │
│                             │
│ 📞 (555) 123-4567 ← Click  │ ← Phone (clickable)
│ ✉️  zach@ymu.org  ← Click  │ ← Email (clickable)
│                             │
│ [Edit] [Delete]             │ ← Actions
└─────────────────────────────┘
```

### Click to Contact

- **Phone numbers** - Tap to call (opens phone app on mobile)
- **Email addresses** - Tap to email (opens email app)

Perfect for contractors who need to reach someone quickly!

## ✏️ Adding/Editing Staff

### Add New Staff Member

1. Go to Staff page
2. Click **+ Add Staff Member**
3. Fill in the form:
   - **Name** (required)
   - **Role/Title** (required)
   - **Responsibilities** (optional but recommended)
   - **Phone** (optional)
   - **Email** (optional)
4. Click **Save Staff Member**

### Edit Existing Staff

1. Click **Edit** on any staff card
2. Update information
3. Click **Save Staff Member**

### Delete Staff Member

1. Click **Delete** on any staff card
2. Confirm deletion

## 📝 Recommended Info to Add

For each staff member, I suggest adding:

### Responsibilities Examples:
- **Event Director**: "Overall event planning, final decision-maker, primary VIP contact"
- **Production Manager**: "Vendor coordination, logistics, day-of operations"
- **Student Talent Coordinator**: "Student performers, rehearsals, talent scheduling"
- **Technical Director**: "Sound, lighting, A/V, stage setup, technical troubleshooting"
- **Catering Manager**: "Food service, dietary needs, timing coordination"
- **Volunteer Coordinator**: "Volunteer assignments, check-in, staff support"

### Contact Information:
- **Phone**: Direct cell number for day-of coordination
- **Email**: Best email for planning communications

## 🎯 Use Cases

### For Contractors:
**Scenario**: Sound engineer arrives and equipment isn't working
- Opens Staff page on phone
- Finds **Theo Braun - Technical Director**
- Taps phone number → instant call

### For Team Members:
**Scenario**: Need to coordinate with student performers
- Find **Pedro Diaz - Student Talent Coordinator**
- Tap email to send message
- Or tap phone to call directly

### For Vendors:
**Scenario**: Caterer has question about timeline
- Find **Estelle Morales - Production Manager**
- Quick call to coordinate

## 📱 Mobile Experience

On phones, the page is optimized:
- Cards stack vertically (full width)
- Large touch targets for phone/email
- Easy scrolling
- Hamburger menu saves space

## 🎨 What It Looks Like

### Desktop
```
┌────────────────────────────────────────────────────────────┐
│ STAFF ROLES                          [+ Add Staff Member]  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ Zach L.     │  │ Estelle M.  │  │ Pedro D.    │       │
│  │ Event Dir.  │  │ Prod. Mgr.  │  │ Talent Coord│       │
│  │ ...         │  │ ...         │  │ ...         │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                            │
│  ┌─────────────┐                                          │
│  │ Theo B.     │                                          │
│  │ Tech Dir.   │                                          │
│  │ ...         │                                          │
│  └─────────────┘                                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Mobile
```
┌──────────────────────────┐
│ ☰  STAFF ROLES          │
├──────────────────────────┤
│                          │
│ ┌──────────────────────┐ │
│ │ Zach Larmer          │ │
│ │ Event Director       │ │
│ │ 📞 555-1234 (tap)    │ │
│ │ ✉️  zach@ymu.org     │ │
│ │ [Edit] [Delete]      │ │
│ └──────────────────────┘ │
│                          │
│ ┌──────────────────────┐ │
│ │ Estelle Morales      │ │
│ │ Production Manager   │ │
│ │ ...                  │ │
│ └──────────────────────┘ │
│                          │
└──────────────────────────┘
```

## 🔧 Technical Details

### Files Created/Modified:

**HTML:**
- Added Staff page
- Added Staff modal form

**CSS:**
- `.staff-grid` - responsive card grid
- `.staff-card` - clean card design
- Mobile-optimized layout
- Dark mode support

**JavaScript:**
- `loadStaff()` - Firebase real-time sync
- `renderStaff()` - Display staff cards
- `openStaffModal()` - Add/edit form
- `handleStaffSubmit()` - Save to database
- `deleteStaff()` - Remove staff member

**Database:**
- New `staff` collection in Firestore

### Data Structure:
```javascript
{
  name: "Zach Larmer",
  role: "Event Director",
  responsibilities: "Overall event planning...",
  phone: "(555) 123-4567",
  email: "zach@ymu.org",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

## 💡 Future Enhancements (Optional)

If you need them later, easy to add:
- Photos/avatars
- Emergency contact flag
- On-duty days (Thu/Fri/Sat)
- Department/team grouping
- Export to PDF contact sheet
- Print-friendly layout

## ✨ Benefits

**For Your Team:**
- Clear org structure
- Quick contact lookup
- Mobile-friendly

**For Contractors:**
- Know who to call
- Instant contact info
- No searching for numbers

**For Coordination:**
- Everyone knows their role
- Clear responsibilities
- Professional presentation

## 🎯 Next Steps

1. **Deploy** (git push)
2. **Add initial staff** (run Python script)
3. **Update contact info** (add phone numbers via Edit button)
4. **Add more staff** as team grows
5. **Share link** with contractors: "Check Staff page for contacts"

Simple, clean, and exactly what you need for contractor coordination!
