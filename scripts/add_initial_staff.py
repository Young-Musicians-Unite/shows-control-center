#!/usr/bin/env python3
"""
Add initial staff members to the database
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

def add_initial_staff():
    """Add the 4 core staff members"""
    staff_ref = db.collection('staff')

    # Initial staff members
    staff_members = [
        {
            'name': 'Zach Larmer',
            'role': 'Event Director',
            'responsibilities': 'Overall event planning, coordination, and execution. Primary point of contact for all event-related decisions.',
            'phone': '',
            'email': 'zach@youngmusiciansunite.org'
        },
        {
            'name': 'Estelle Morales',
            'role': 'Production Manager',
            'responsibilities': 'Manages production logistics, vendor coordination, and on-site operations.',
            'phone': '',
            'email': ''
        },
        {
            'name': 'Pedro Diaz',
            'role': 'Student Talent Coordinator',
            'responsibilities': 'Coordinates student performers, manages rehearsals, and handles talent logistics.',
            'phone': '',
            'email': ''
        },
        {
            'name': 'Theo Braun',
            'role': 'Technical Director',
            'responsibilities': 'Oversees all technical aspects including sound, lighting, A/V, and stage setup.',
            'phone': '',
            'email': ''
        }
    ]

    # Check if staff already exist
    existing_staff = staff_ref.stream()
    existing_count = len(list(existing_staff))

    if existing_count > 0:
        print(f"⚠️  Found {existing_count} existing staff members.")
        print("Skipping initial staff creation to avoid duplicates.")
        print("If you want to re-add them, delete the existing staff first.")
        return

    # Add each staff member
    added_count = 0
    for member in staff_members:
        member['createdAt'] = firestore.SERVER_TIMESTAMP
        staff_ref.add(member)
        print(f"✓ Added: {member['name']} - {member['role']}")
        added_count += 1

    print(f"\n✅ Successfully added {added_count} staff members!")
    print("\nYou can now:")
    print("1. Visit the Staff page in your app")
    print("2. Add phone numbers and additional contact info")
    print("3. Update responsibilities as needed")
    print("4. Add more staff members as your team grows")

def main():
    print("Adding initial staff members...\n")
    add_initial_staff()

if __name__ == '__main__':
    main()
