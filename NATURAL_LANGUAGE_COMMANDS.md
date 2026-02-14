# Natural Language Commands Guide

The `db_helper.py` script provides command-line access to your gala database. Here's how to use it:

## Installation

Make sure Python and dependencies are installed:

```bash
pip install firebase-admin pandas openpyxl
```

## Basic Command Structure

```bash
python scripts/db_helper.py <command> [arguments] [--flags]
```

## Common Commands

### List Data

**List all vendors:**
```bash
python scripts/db_helper.py list-vendors
```

**List only confirmed vendors:**
```bash
python scripts/db_helper.py list-vendors --status confirmed
```

**List pending vendors:**
```bash
python scripts/db_helper.py list-vendors --status pending
```

**List vendors with issues:**
```bash
python scripts/db_helper.py list-vendors --status issue
```

**List all budget items:**
```bash
python scripts/db_helper.py list-budget
```

**List budget by specific category:**
```bash
python scripts/db_helper.py list-budget --category "6811a - Talent/Performers & Hosts"
```

**List all tasks:**
```bash
python scripts/db_helper.py list-tasks
```

**List only completed tasks:**
```bash
python scripts/db_helper.py list-tasks --status complete
```

**List in-progress tasks:**
```bash
python scripts/db_helper.py list-tasks --status in-progress
```

### Search

**Search for a vendor by name:**
```bash
python scripts/db_helper.py search-vendor "Juan"
```

```bash
python scripts/db_helper.py search-vendor "Kunya Rowley"
```

### Update Data

**Update a vendor's status to confirmed:**
```bash
python scripts/db_helper.py update-vendor abc123xyz status confirmed
```

**Update a vendor's payment status:**
```bash
python scripts/db_helper.py update-vendor abc123xyz paymentStatus paid
```

**Update a vendor's contact email:**
```bash
python scripts/db_helper.py update-vendor abc123xyz email newemail@example.com
```

**Update budget item actual amount:**
```bash
python scripts/db_helper.py update-budget xyz789abc actual 5000
```

**Update budget payment status:**
```bash
python scripts/db_helper.py update-budget xyz789abc paymentStatus paid
```

**Mark a task as complete:**
```bash
python scripts/db_helper.py update-task def456ghi status complete
```

**Update task responsible person:**
```bash
python scripts/db_helper.py update-task def456ghi responsible "John Doe"
```

## Getting Document IDs

To update a document, you need its ID. Get it by listing items:

```bash
# List vendors and note the ID
python scripts/db_helper.py list-vendors

# Output will show:
# ID: abc123xyz
# Name: Juan P
# ...
```

Then use that ID in update commands.

## Real-World Examples

### Scenario 1: Confirm a vendor and mark payment
```bash
# 1. Find the vendor
python scripts/db_helper.py search-vendor "Juan"

# 2. Note the ID (e.g., "abc123xyz")

# 3. Update status
python scripts/db_helper.py update-vendor abc123xyz status confirmed

# 4. Update payment
python scripts/db_helper.py update-vendor abc123xyz paymentStatus paid
```

### Scenario 2: Update budget with actual spending
```bash
# 1. List budget to find item
python scripts/db_helper.py list-budget

# 2. Note the ID for the item you want to update

# 3. Update the actual amount
python scripts/db_helper.py update-budget xyz789abc actual 8500

# 4. Mark as paid
python scripts/db_helper.py update-budget xyz789abc paymentStatus paid
```

### Scenario 3: Complete tasks
```bash
# 1. List all incomplete tasks
python scripts/db_helper.py list-tasks --status not-started

# 2. Mark specific task as in progress
python scripts/db_helper.py update-task def456ghi status in-progress

# 3. Later, mark as complete
python scripts/db_helper.py update-task def456ghi status complete
```

### Scenario 4: Check gala budget status
```bash
# See total budget and spending
python scripts/db_helper.py list-budget

# See spending by category
python scripts/db_helper.py list-budget --category "6811b - A/V Production"
python scripts/db_helper.py list-budget --category "6811d - Food & Beverage"
```

### Scenario 5: Vendor status check
```bash
# How many vendors confirmed?
python scripts/db_helper.py list-vendors --status confirmed

# How many still pending?
python scripts/db_helper.py list-vendors --status pending

# Any issues?
python scripts/db_helper.py list-vendors --status issue
```

## Available Statuses

### Vendor Status
- `confirmed` - Vendor is confirmed
- `pending` - Waiting on confirmation
- `issue` - There's a problem

### Payment Status
- `paid` - Fully paid
- `partial` - Partially paid
- `not-paid` - Not yet paid

### Task Status
- `complete` - Task is done
- `in-progress` - Currently working on it
- `not-started` - Haven't started yet

## Tips

1. **Use quotes for multi-word values:**
   ```bash
   python scripts/db_helper.py update-vendor abc123 name "John Smith Productions"
   ```

2. **Get help anytime:**
   ```bash
   python scripts/db_helper.py help
   ```

3. **Tab completion** - Many terminals support tab completion for file names and paths

4. **Backup before bulk updates** - Use Firebase Console to export data before making many changes

5. **Changes sync immediately** - Any updates you make via command line will instantly appear in the web app!

## Advanced: Bulk Operations

For bulk operations, you can create custom Python scripts using the Firebase Admin SDK. The `db_helper.py` script can serve as a template.

Example: Update all pending vendors to confirmed:

```python
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('config/firebase-credentials.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

vendors = db.collection('vendors').where('status', '==', 'pending').stream()
for vendor in vendors:
    vendor.reference.update({'status': 'confirmed'})
    print(f"Updated {vendor.id}")
```

## Troubleshooting

**"Error initializing Firebase"**
- Check that `config/firebase-credentials.json` exists
- Verify the path is correct (relative to script location)

**"Module not found"**
- Install dependencies: `pip install firebase-admin pandas openpyxl`

**"Document not found"**
- Double-check the document ID
- Use list commands to find correct IDs

---

**Pro tip:** Combine with web app for best experience - use commands for bulk operations and queries, use web app for detailed editing and viewing!
