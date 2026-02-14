#!/usr/bin/env python3
"""
Merge vendor data into budget collection
This script merges existing vendor records into budget items with contact fields
"""

import firebase_admin
from firebase_admin import credentials, firestore
import os

# Initialize Firebase Admin
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
cred_path = os.path.join(project_root, 'service-account-key.json')

cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

def merge_vendors_to_budget():
    """Merge vendor data into budget collection"""
    vendors_ref = db.collection('vendors')
    budget_ref = db.collection('budget')

    vendors = vendors_ref.stream()
    merged_count = 0
    skipped_count = 0

    for vendor_doc in vendors:
        vendor = vendor_doc.to_dict()
        vendor_id = vendor_doc.id

        # Check if this vendor already exists in budget by name
        existing = budget_ref.where('vendor', '==', vendor.get('name', '')).limit(1).stream()
        existing_list = list(existing)

        if existing_list:
            # Vendor already exists in budget, update it with vendor contact info
            budget_doc = existing_list[0]
            update_data = {}

            # Only update if budget doesn't have these fields
            budget_data = budget_doc.to_dict()
            if not budget_data.get('contact') and vendor.get('contactPerson'):
                update_data['contact'] = vendor.get('contactPerson', '')
            if not budget_data.get('phone') and vendor.get('phone'):
                update_data['phone'] = vendor.get('phone', '')
            if not budget_data.get('email') and vendor.get('email'):
                update_data['email'] = vendor.get('email', '')

            if update_data:
                budget_ref.document(budget_doc.id).update(update_data)
                print(f"✓ Updated existing budget item: {vendor.get('name', 'Unknown')}")
                merged_count += 1
            else:
                print(f"- Skipped (already complete): {vendor.get('name', 'Unknown')}")
                skipped_count += 1
        else:
            # Vendor doesn't exist in budget, create new budget item
            budget_data = {
                'vendor': vendor.get('name', ''),
                'category': vendor.get('category', ''),
                'contact': vendor.get('contactPerson', ''),
                'phone': vendor.get('phone', ''),
                'email': vendor.get('email', ''),
                'budgeted': vendor.get('amount', 0),
                'actual': 0,
                'paymentStatus': vendor.get('paymentStatus', 'not-paid'),
                'notes': vendor.get('notes', ''),
                'createdAt': firestore.SERVER_TIMESTAMP
            }

            budget_ref.add(budget_data)
            print(f"✓ Created new budget item from vendor: {vendor.get('name', 'Unknown')}")
            merged_count += 1

    return merged_count, skipped_count

def main():
    print("Starting vendor to budget merge...")
    print("This will merge vendor data into budget collection with contact fields.\n")

    # Count existing records
    vendors_count = len(list(db.collection('vendors').stream()))
    budget_count = len(list(db.collection('budget').stream()))

    print(f"Current state:")
    print(f"  Vendors: {vendors_count}")
    print(f"  Budget items: {budget_count}\n")

    if vendors_count == 0:
        print("No vendors to merge. Exiting.")
        return

    # Perform merge
    merged, skipped = merge_vendors_to_budget()

    print(f"\n✅ Merge complete!")
    print(f"  Items merged/updated: {merged}")
    print(f"  Items skipped: {skipped}")
    print(f"\nNext steps:")
    print("1. Verify the data in your app")
    print("2. Once verified, you can safely delete the vendors collection")

if __name__ == '__main__':
    main()
