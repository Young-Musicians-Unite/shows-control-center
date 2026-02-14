# YMU Gala 2026 Management Application

Complete web-based management system for the Young Musicians Unite Fundraising Gala on April 25, 2026.

## Features

- **Dashboard**: Real-time countdown, budget overview, vendor status, and upcoming deadlines
- **Vendors**: Manage all vendor contacts, contracts, and payment status
- **Budget**: Track budgeted vs actual expenses by category with visual progress
- **Timeline**: Task management with deadlines and completion tracking
- **Real-time Sync**: All data syncs instantly across devices using Firebase Firestore
- **Mobile Responsive**: Works seamlessly on phones, tablets, and desktop

## Quick Start

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Project name: `ymu-gala-2026` (or your choice)
4. Disable Google Analytics (optional)
5. Click "Create project"

### 2. Enable Firestore Database

1. In Firebase Console, click "Firestore Database" in left sidebar
2. Click "Create database"
3. Choose "Start in production mode" (we'll add rules later)
4. Select a location close to you (e.g., `us-central`)
5. Click "Enable"

### 3. Enable Storage (for document uploads)

1. Click "Storage" in left sidebar
2. Click "Get started"
3. Use default security rules
4. Click "Done"

### 4. Get Firebase Configuration

1. Click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. Click the web icon `</>`
5. Register app with nickname: `gala-management`
6. Copy the `firebaseConfig` object

### 5. Update Configuration

Edit `public/js/config.js` and replace the placeholder values with your Firebase config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
```

### 6. Get Service Account Credentials (for data migration)

1. In Firebase Console, go to Project Settings
2. Click "Service accounts" tab
3. Click "Generate new private key"
4. Save the JSON file as `config/firebase-credentials.json`

⚠️ **IMPORTANT**: Never commit this file to Git! It's already in `.gitignore`.

### 7. Run Data Migration

Install Python dependencies:

```bash
pip install firebase-admin pandas openpyxl
```

Run the migration script:

```bash
cd scripts
python migrate_data.py
```

This will import all data from your Excel spreadsheets into Firebase.

### 8. Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push this code:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ymu-gala-2026.git
git push -u origin main
```

3. Enable GitHub Pages:
   - Go to repository Settings
   - Click "Pages" in left sidebar
   - Source: "GitHub Actions"
   - The site will deploy automatically!

4. Your app will be live at: `https://YOUR_USERNAME.github.io/ymu-gala-2026/`

## Project Structure

```
gala-management/
├── public/
│   ├── index.html          # Main application HTML
│   ├── css/
│   │   └── styles.css      # All styling
│   └── js/
│       ├── config.js       # Firebase configuration
│       └── app.js          # Application logic
├── scripts/
│   ├── migrate_data.py     # Import spreadsheet data to Firebase
│   └── db_helper.py        # Database helper commands
├── config/
│   └── firebase-credentials.json  # Service account (DO NOT COMMIT)
├── documents/
│   ├── contracts/          # Store vendor contracts
│   ├── invoices/           # Store invoices
│   └── misc/              # Other documents
└── README.md
```

## Using the Application

### Dashboard
- View countdown to event day
- See budget summary and spending progress
- Check vendor status overview
- View upcoming deadlines

### Vendors Page
- Click "+ Add Vendor" to create new vendor
- Search vendors by name, contact, or email
- Filter by category or status
- Click "Edit" to update vendor details
- Track contract status: Pending, Confirmed, Issue
- Track payment status: Not Paid, Partial, Paid

### Budget Page
- View budget breakdown by category
- See budgeted vs actual spending
- Track payment status for each item
- Visual progress bars show spending by category
- Click "+ Add Item" to add new budget entry

### Timeline Page
- View all tasks with due dates
- Check boxes to mark tasks complete
- Filter by status: Not Started, In Progress, Complete
- Overdue tasks highlighted in red
- Click "+ Add Task" to create new task

## Database Helper Scripts

Use the `db_helper.py` script for command-line database operations:

```bash
# List all vendors
python scripts/db_helper.py list-vendors

# List confirmed vendors only
python scripts/db_helper.py list-vendors --status confirmed

# List budget items
python scripts/db_helper.py list-budget

# List budget by category
python scripts/db_helper.py list-budget --category "6811a - Talent/Performers & Hosts"

# Search for a vendor
python scripts/db_helper.py search-vendor "John"

# Update a vendor's status
python scripts/db_helper.py update-vendor VENDOR_ID status confirmed

# Update budget actual amount
python scripts/db_helper.py update-budget BUDGET_ID actual 5000

# Mark a task complete
python scripts/db_helper.py update-task TASK_ID status complete

# Show all commands
python scripts/db_helper.py help
```

## Uploading Documents

Documents (contracts, invoices, etc.) can be uploaded to Firebase Storage:

1. Use the Firebase Console:
   - Go to Storage in Firebase Console
   - Create folders: `contracts/`, `invoices/`, `misc/`
   - Upload files directly

2. Or use the staging folder:
   - Place files in `documents/contracts/`, `documents/invoices/`, or `documents/misc/`
   - Use Firebase CLI or write a custom upload script

## Security Considerations

Since this is set to "public (no login)" as requested:

- Anyone with the URL can view and edit data
- Share the URL only with your small team (2-5 people)
- For better security, consider adding Firebase Authentication later

## Firestore Security Rules (Optional)

To make the database public (as requested), set these rules in Firebase Console:

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

## Customization

### Change Event Date
Edit `public/js/app.js`, line 7:
```javascript
const eventDate = new Date('April 25, 2026 18:00:00');
```

### Change Colors
Edit `public/css/styles.css` to customize the color scheme.

### Add More Fields
1. Add form fields in `index.html`
2. Update form handlers in `app.js`
3. Update Firestore structure as needed

## Data Backup

To backup your Firestore data:

1. Go to Firebase Console
2. Firestore Database → Import/Export
3. Export to Google Cloud Storage

Or use the Firebase Admin SDK to export data programmatically.

## Troubleshooting

### App shows "Firebase initialization failed"
- Check that `config.js` has correct Firebase configuration
- Ensure Firestore is enabled in Firebase Console

### Data not loading
- Check browser console for errors (F12 → Console)
- Verify Firestore security rules allow read/write
- Check that data migration completed successfully

### Migration script fails
- Ensure `firebase-credentials.json` is in `config/` folder
- Check that Python dependencies are installed
- Verify Excel file paths are correct

## Support

For questions or issues:
- Check Firebase Console for errors
- Review browser console logs
- Ensure all setup steps were completed

## License

This project is for internal use by Young Musicians Unite.

---

**Created for the 13th Annual YMU Gala - April 25, 2026** 🎵
