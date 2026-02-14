#!/usr/bin/env python3
"""
Data Migration Script for YMU Gala 2026
Imports data from Excel spreadsheets into Firebase Firestore
"""

import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore
import sys
import json
from datetime import datetime

# Initialize Firebase
def initialize_firebase(cred_path='../config/firebase-credentials.json'):
    """Initialize Firebase Admin SDK"""
    try:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print("✓ Firebase initialized successfully")
        return firestore.client()
    except Exception as e:
        print(f"✗ Error initializing Firebase: {e}")
        print("\nMake sure you have:")
        print("1. Created your Firebase project")
        print("2. Downloaded the service account JSON file")
        print(f"3. Placed it at: {cred_path}")
        sys.exit(1)

def clean_value(value):
    """Clean pandas values (handle NaN, etc.)"""
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return str(value).strip()

def migrate_budget_data(db, budget_file):
    """Migrate budget data from Excel to Firestore"""
    print("\n=== Migrating Budget Data ===")

    try:
        df = pd.read_excel(budget_file, sheet_name='2026 Budget')
        print(f"Found {len(df)} budget rows")

        budget_ref = db.collection('budget')
        count = 0

        for idx, row in df.iterrows():
            vendor_name = clean_value(row.get('Vendor/Name'))
            description = clean_value(row.get('Description/Role'))

            # Skip empty rows
            if not vendor_name and not description:
                continue

            # Parse budget and actuals
            budgeted = clean_value(row.get('2026 Budget')) or 0
            actual = clean_value(row.get('2026 Actuals')) or 0

            # Determine payment status
            payment_status = 'not-paid'
            if actual > 0:
                if actual >= budgeted:
                    payment_status = 'paid'
                else:
                    payment_status = 'partial'

            budget_item = {
                'vendor': vendor_name or description or 'Unknown',
                'description': description,
                'category': clean_value(row.get('Code')) or 'Uncategorized',
                'budgeted': float(budgeted),
                'actual': float(actual),
                'paymentStatus': payment_status,
                'confirmed': bool(clean_value(row.get('Confirmed'))),
                'owner': clean_value(row.get('Owner of Vendor Relationship')),
                'contactPhone': clean_value(row.get("This year's Contact Phone")),
                'contactEmail': clean_value(row.get("This year's Contact Email")),
                'notes': clean_value(row.get('Notes')),
                'w9OnFile': clean_value(row.get('W-9 on File?')),
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP
            }

            # Remove None values
            budget_item = {k: v for k, v in budget_item.items() if v is not None}

            budget_ref.add(budget_item)
            count += 1

        print(f"✓ Migrated {count} budget items")

    except Exception as e:
        print(f"✗ Error migrating budget data: {e}")
        raise

def migrate_vendors_from_budget(db, budget_file):
    """Create vendor records from budget data"""
    print("\n=== Creating Vendor Records ===")

    try:
        df = pd.read_excel(budget_file, sheet_name='2026 Budget')
        vendors_ref = db.collection('vendors')
        count = 0

        for idx, row in df.iterrows():
            vendor_name = clean_value(row.get('Vendor/Name'))
            if not vendor_name:
                continue

            confirmed = clean_value(row.get('Confirmed'))
            status = 'confirmed' if confirmed == 1.0 else 'pending'

            budgeted = clean_value(row.get('2026 Budget')) or 0
            actual = clean_value(row.get('2026 Actuals')) or 0

            payment_status = 'not-paid'
            if actual > 0:
                if actual >= budgeted:
                    payment_status = 'paid'
                else:
                    payment_status = 'partial'

            vendor = {
                'name': vendor_name,
                'category': clean_value(row.get('Code')) or 'Uncategorized',
                'contactPerson': clean_value(row.get('Owner of Vendor Relationship')),
                'phone': clean_value(row.get("This year's Contact Phone")),
                'email': clean_value(row.get("This year's Contact Email")),
                'amount': float(budgeted),
                'status': status,
                'paymentStatus': payment_status,
                'notes': clean_value(row.get('Notes')),
                'description': clean_value(row.get('Description/Role')),
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP
            }

            # Remove None values
            vendor = {k: v for k, v in vendor.items() if v is not None}

            vendors_ref.add(vendor)
            count += 1

        print(f"✓ Created {count} vendor records")

    except Exception as e:
        print(f"✗ Error creating vendors: {e}")
        raise

def migrate_timeline_data(db, run_of_show_file):
    """Migrate timeline/checklist data from Excel to Firestore"""
    print("\n=== Migrating Timeline Data ===")

    try:
        df = pd.read_excel(run_of_show_file, sheet_name='EVENT CHECKLIST')
        print(f"Found {len(df)} timeline rows")

        timeline_ref = db.collection('timeline')
        count = 0

        for idx, row in df.iterrows():
            task = clean_value(row.get('Task'))
            if not task or task == 'Task':  # Skip header rows
                continue

            # Parse due date
            due_date = clean_value(row.get('Due Date'))
            if due_date and due_date != 'Due Date':
                try:
                    if isinstance(due_date, datetime):
                        due_date = due_date.strftime('%Y-%m-%d')
                    else:
                        # Try to parse various date formats
                        due_date = pd.to_datetime(due_date).strftime('%Y-%m-%d')
                except:
                    due_date = None

            # Determine status
            status_val = clean_value(row.get('Status'))
            if status_val:
                status = 'complete'
            else:
                status = 'not-started'

            timeline_item = {
                'task': task,
                'phase': clean_value(row.get('Phase')),
                'department': clean_value(row.get('Department')),
                'responsible': clean_value(row.get('Responsible')),
                'accountable': clean_value(row.get('Accountable')),
                'consulted': clean_value(row.get('Consulted')),
                'informed': clean_value(row.get('Informed')),
                'dueDate': due_date,
                'status': status,
                'notes': clean_value(row.get('Info/Directions')),
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP
            }

            # Remove None values
            timeline_item = {k: v for k, v in timeline_item.items() if v is not None}

            timeline_ref.add(timeline_item)
            count += 1

        print(f"✓ Migrated {count} timeline items")

    except Exception as e:
        print(f"✗ Error migrating timeline data: {e}")
        raise

def create_event_info(db):
    """Create the main event info document"""
    print("\n=== Creating Event Info ===")

    try:
        event_ref = db.collection('event-info').document('gala-2026')
        event_ref.set({
            'name': 'Young Musicians Unite Fundraising Gala',
            'date': '2026-04-25',
            'time': '18:00',
            'venue': 'TBD',
            'expectedAttendance': 0,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        })
        print("✓ Event info created")

    except Exception as e:
        print(f"✗ Error creating event info: {e}")
        raise

def clear_existing_data(db):
    """Clear existing data from Firestore collections"""
    print("\n=== Clearing Existing Data ===")

    collections_to_clear = ['vendors', 'budget', 'timeline']

    for collection_name in collections_to_clear:
        try:
            docs = db.collection(collection_name).stream()
            count = 0
            for doc in docs:
                doc.reference.delete()
                count += 1
            if count > 0:
                print(f"✓ Cleared {count} documents from '{collection_name}'")
        except Exception as e:
            print(f"✗ Error clearing '{collection_name}': {e}")

def main():
    """Main migration function"""
    print("=" * 60)
    print("YMU Gala 2026 - Data Migration Script")
    print("=" * 60)

    # File paths (adjust as needed)
    budget_file = '../../13th Gala Budget.xlsx'
    run_of_show_file = '../../13th Gala Run of Show 2026.xlsx'

    # Check if files exist
    import os
    if not os.path.exists(budget_file):
        print(f"✗ Budget file not found: {budget_file}")
        sys.exit(1)
    if not os.path.exists(run_of_show_file):
        print(f"✗ Run of Show file not found: {run_of_show_file}")
        sys.exit(1)

    # Initialize Firebase
    db = initialize_firebase()

    # Ask for confirmation
    print("\n⚠️  This will CLEAR all existing data and import from Excel.")
    response = input("Continue? (yes/no): ")

    if response.lower() != 'yes':
        print("Migration cancelled.")
        sys.exit(0)

    try:
        # Clear existing data
        clear_existing_data(db)

        # Migrate data
        migrate_budget_data(db, budget_file)
        migrate_vendors_from_budget(db, budget_file)
        migrate_timeline_data(db, run_of_show_file)
        create_event_info(db)

        print("\n" + "=" * 60)
        print("✓ Migration completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
