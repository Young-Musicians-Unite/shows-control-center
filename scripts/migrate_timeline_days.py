#!/usr/bin/env python3
"""
Migrate multi-day timeline data from Excel to Firestore
Reads TIMELINE - THURSDAY, TIMELINE - FRIDAY, and TIMELINE - SATURDAY sheets
"""

import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
from datetime import datetime, time
import sys

# Initialize Firebase Admin
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
cred_path = os.path.join(project_root, 'service-account-key.json')

cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

def parse_time(time_val):
    """Convert Excel time to HH:MM string"""
    if pd.isna(time_val):
        return None
    if isinstance(time_val, str):
        return time_val
    if isinstance(time_val, (datetime, pd.Timestamp)):
        return time_val.strftime('%H:%M')
    if isinstance(time_val, time):
        return time_val.strftime('%H:%M')
    return str(time_val)

def migrate_timeline_day(sheet_name, day_name, date_str):
    """Migrate a single day's timeline"""
    excel_path = os.path.join(os.path.dirname(project_root), '13th Gala Run of Show 2026.xlsx')
    df = pd.read_excel(excel_path, sheet_name=sheet_name)

    # Skip header row (row 0 has column labels)
    df = df.iloc[1:].reset_index(drop=True)

    # Determine column indices based on sheet structure
    if 'TIMELINE - THURSDAY' in sheet_name:
        time_col, event_col, responsible_col, staff_col = 0, 1, 2, 3
    else:  # Friday and Saturday have an extra column at start
        time_col, event_col, responsible_col, staff_col = 1, 2, 3, 4

    tasks_ref = db.collection('timeline')
    count = 0

    for idx, row in df.iterrows():
        time_val = row.iloc[time_col]
        event_val = row.iloc[event_col]

        # Skip empty rows
        if pd.isna(time_val) and pd.isna(event_val):
            continue

        time_str = parse_time(time_val)
        if not time_str:
            continue

        task_data = {
            'day': day_name,
            'date': date_str,
            'time': time_str,
            'event': str(event_val) if not pd.isna(event_val) else '',
            'responsible': str(row.iloc[responsible_col]) if not pd.isna(row.iloc[responsible_col]) else '',
            'staff': str(row.iloc[staff_col]) if not pd.isna(row.iloc[staff_col]) else '',
            'completed': False,
            'createdAt': firestore.SERVER_TIMESTAMP
        }

        tasks_ref.add(task_data)
        count += 1

    return count

def main():
    print("Starting multi-day timeline migration...")

    # Clear existing timeline data
    print("\nClearing existing timeline data...")
    timeline_ref = db.collection('timeline')
    docs = timeline_ref.stream()
    deleted = 0
    for doc in docs:
        doc.reference.delete()
        deleted += 1
    print(f"Deleted {deleted} existing timeline items")

    # Migrate each day
    days = [
        ('TIMELINE - THURSDAY', 'Thursday', 'April 23, 2026'),
        ('TIMELINE - FRIDAY', 'Friday', 'April 24, 2026'),
        ('TIMELINE - SATURDAY', 'Saturday', 'April 25, 2026')
    ]

    total = 0
    for sheet, day, date in days:
        count = migrate_timeline_day(sheet, day, date)
        print(f"✓ Migrated {count} items from {day}")
        total += count

    print(f"\n✅ Total timeline items migrated: {total}")

if __name__ == '__main__':
    main()
