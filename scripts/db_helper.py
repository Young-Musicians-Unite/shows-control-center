#!/usr/bin/env python3
"""
Database Helper Script for YMU Gala 2026
Provides natural language commands to interact with Firebase Firestore
"""

import firebase_admin
from firebase_admin import credentials, firestore
import sys
import argparse
from datetime import datetime

db = None

def initialize_firebase(cred_path='../config/firebase-credentials.json'):
    """Initialize Firebase Admin SDK"""
    global db
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        return db
    except Exception as e:
        print(f"Error initializing Firebase: {e}")
        sys.exit(1)

def list_vendors(status=None):
    """List all vendors, optionally filtered by status"""
    vendors_ref = db.collection('vendors')

    if status:
        vendors = vendors_ref.where('status', '==', status).stream()
    else:
        vendors = vendors_ref.stream()

    print("\n=== VENDORS ===")
    for vendor in vendors:
        v = vendor.to_dict()
        print(f"\nID: {vendor.id}")
        print(f"Name: {v.get('name', 'N/A')}")
        print(f"Category: {v.get('category', 'N/A')}")
        print(f"Status: {v.get('status', 'N/A')}")
        print(f"Amount: ${v.get('amount', 0):,.2f}")
        print(f"Payment: {v.get('paymentStatus', 'N/A')}")

def update_vendor(vendor_id, **updates):
    """Update a vendor by ID"""
    try:
        updates['updatedAt'] = firestore.SERVER_TIMESTAMP
        db.collection('vendors').document(vendor_id).update(updates)
        print(f"✓ Vendor {vendor_id} updated successfully")
    except Exception as e:
        print(f"✗ Error updating vendor: {e}")

def list_budget_items(category=None):
    """List all budget items, optionally filtered by category"""
    budget_ref = db.collection('budget')

    if category:
        items = budget_ref.where('category', '==', category).stream()
    else:
        items = budget_ref.stream()

    print("\n=== BUDGET ITEMS ===")
    total_budgeted = 0
    total_actual = 0

    for item in items:
        b = item.to_dict()
        budgeted = b.get('budgeted', 0)
        actual = b.get('actual', 0)
        total_budgeted += budgeted
        total_actual += actual

        print(f"\nID: {item.id}")
        print(f"Vendor: {b.get('vendor', 'N/A')}")
        print(f"Category: {b.get('category', 'N/A')}")
        print(f"Budgeted: ${budgeted:,.2f}")
        print(f"Actual: ${actual:,.2f}")
        print(f"Remaining: ${budgeted - actual:,.2f}")

    print(f"\n--- TOTALS ---")
    print(f"Total Budgeted: ${total_budgeted:,.2f}")
    print(f"Total Spent: ${total_actual:,.2f}")
    print(f"Remaining: ${total_budgeted - total_actual:,.2f}")

def update_budget(budget_id, **updates):
    """Update a budget item by ID"""
    try:
        updates['updatedAt'] = firestore.SERVER_TIMESTAMP
        db.collection('budget').document(budget_id).update(updates)
        print(f"✓ Budget item {budget_id} updated successfully")
    except Exception as e:
        print(f"✗ Error updating budget item: {e}")

def list_tasks(status=None):
    """List all timeline tasks, optionally filtered by status"""
    timeline_ref = db.collection('timeline')

    if status:
        tasks = timeline_ref.where('status', '==', status).stream()
    else:
        tasks = timeline_ref.stream()

    print("\n=== TASKS ===")
    for task in tasks:
        t = task.to_dict()
        print(f"\nID: {task.id}")
        print(f"Task: {t.get('task', 'N/A')}")
        print(f"Status: {t.get('status', 'N/A')}")
        print(f"Due: {t.get('dueDate', 'N/A')}")
        print(f"Responsible: {t.get('responsible', 'N/A')}")

def update_task(task_id, **updates):
    """Update a task by ID"""
    try:
        updates['updatedAt'] = firestore.SERVER_TIMESTAMP
        db.collection('timeline').document(task_id).update(updates)
        print(f"✓ Task {task_id} updated successfully")
    except Exception as e:
        print(f"✗ Error updating task: {e}")

def search_vendors(search_term):
    """Search vendors by name"""
    vendors = db.collection('vendors').stream()
    search_term = search_term.lower()

    print(f"\n=== Search Results for '{search_term}' ===")
    found = False

    for vendor in vendors:
        v = vendor.to_dict()
        name = v.get('name', '').lower()
        if search_term in name:
            found = True
            print(f"\nID: {vendor.id}")
            print(f"Name: {v.get('name', 'N/A')}")
            print(f"Category: {v.get('category', 'N/A')}")
            print(f"Status: {v.get('status', 'N/A')}")
            print(f"Contact: {v.get('email', 'N/A')}")

    if not found:
        print("No vendors found matching that search term.")

def main():
    """Main CLI interface"""
    parser = argparse.ArgumentParser(description='YMU Gala Database Helper')
    parser.add_argument('command', help='Command to execute')
    parser.add_argument('args', nargs='*', help='Command arguments')
    parser.add_argument('--status', help='Filter by status')
    parser.add_argument('--category', help='Filter by category')

    args = parser.parse_args()

    initialize_firebase()

    # Handle commands
    if args.command == 'list-vendors':
        list_vendors(status=args.status)

    elif args.command == 'list-budget':
        list_budget_items(category=args.category)

    elif args.command == 'list-tasks':
        list_tasks(status=args.status)

    elif args.command == 'search-vendor':
        if args.args:
            search_vendors(' '.join(args.args))
        else:
            print("Please provide a search term")

    elif args.command == 'update-vendor':
        if len(args.args) < 3:
            print("Usage: update-vendor <vendor-id> <field> <value>")
            return
        vendor_id = args.args[0]
        field = args.args[1]
        value = ' '.join(args.args[2:])
        update_vendor(vendor_id, **{field: value})

    elif args.command == 'update-budget':
        if len(args.args) < 3:
            print("Usage: update-budget <budget-id> <field> <value>")
            return
        budget_id = args.args[0]
        field = args.args[1]
        value = ' '.join(args.args[2:])
        # Try to convert to float if it's a number
        try:
            value = float(value)
        except:
            pass
        update_budget(budget_id, **{field: value})

    elif args.command == 'update-task':
        if len(args.args) < 3:
            print("Usage: update-task <task-id> <field> <value>")
            return
        task_id = args.args[0]
        field = args.args[1]
        value = ' '.join(args.args[2:])
        update_task(task_id, **{field: value})

    elif args.command == 'help':
        print("""
Available Commands:
------------------
list-vendors [--status confirmed|pending|issue]
    List all vendors, optionally filtered by status

list-budget [--category "category name"]
    List all budget items with totals

list-tasks [--status complete|in-progress|not-started]
    List all timeline tasks

search-vendor <search term>
    Search for vendors by name

update-vendor <vendor-id> <field> <value>
    Update a vendor field (e.g., status, amount, paymentStatus)

update-budget <budget-id> <field> <value>
    Update a budget item field

update-task <task-id> <field> <value>
    Update a task field

Examples:
---------
python db_helper.py list-vendors --status confirmed
python db_helper.py list-budget --category "6811a - Talent/Performers & Hosts"
python db_helper.py search-vendor "John"
python db_helper.py update-vendor abc123 status confirmed
python db_helper.py update-budget xyz789 actual 5000
python db_helper.py update-task def456 status complete
        """)

    else:
        print(f"Unknown command: {args.command}")
        print("Run 'python db_helper.py help' for usage information")

if __name__ == '__main__':
    main()
