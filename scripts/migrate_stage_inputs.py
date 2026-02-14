#!/usr/bin/env python3
"""
Migrate stage input lists from Excel to Firestore
Reads Main Stage INPUT LIST and Cocktail Stage INPUT LIST sheets
"""

import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
import os

# Initialize Firebase Admin
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
cred_path = os.path.join(project_root, 'service-account-key.json')

cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

def migrate_stage_inputs(sheet_name, collection_name, stage_name):
    """Migrate a stage input list"""
    excel_path = os.path.join(os.path.dirname(project_root), '13th Gala Run of Show 2026.xlsx')
    df = pd.read_excel(excel_path, sheet_name=sheet_name)

    # Skip first two rows (empty row + header row)
    df = df.iloc[2:].reset_index(drop=True)

    # Column mapping based on structure
    # Columns: ['Unnamed: 0', 'Title', 'Subsnake', 'Instrument', 'Mics (Preferred)', 'Stands', 'Notes', 'Stage Plot Symbol']
    col_channel = 1  # #
    col_subsnake = 2  # Subsnake
    col_instrument = 3  # Instrument
    col_mics = 4  # Mics (Preferred)
    col_stands = 5  # Stands
    col_notes = 6  # Notes
    col_symbol = 7  # Stage Plot Symbol

    collection_ref = db.collection(collection_name)
    count = 0

    for idx, row in df.iterrows():
        channel = row.iloc[col_channel]

        # Skip empty rows
        if pd.isna(channel):
            continue

        input_data = {
            'stage': stage_name,
            'channel': str(channel) if not pd.isna(channel) else '',
            'subsnake': str(row.iloc[col_subsnake]) if not pd.isna(row.iloc[col_subsnake]) else '',
            'instrument': str(row.iloc[col_instrument]) if not pd.isna(row.iloc[col_instrument]) else '',
            'mics': str(row.iloc[col_mics]) if not pd.isna(row.iloc[col_mics]) else '',
            'stands': str(row.iloc[col_stands]) if not pd.isna(row.iloc[col_stands]) else '',
            'notes': str(row.iloc[col_notes]) if not pd.isna(row.iloc[col_notes]) else '',
            'symbol': str(row.iloc[col_symbol]) if not pd.isna(row.iloc[col_symbol]) else '',
            'createdAt': firestore.SERVER_TIMESTAMP
        }

        collection_ref.add(input_data)
        count += 1

    return count

def main():
    print("Starting stage input lists migration...")

    # Clear existing data
    print("\nClearing existing stage input data...")
    for collection in ['mainStageInputs', 'cocktailStageInputs']:
        docs = db.collection(collection).stream()
        deleted = 0
        for doc in docs:
            doc.reference.delete()
            deleted += 1
        print(f"Deleted {deleted} existing {collection}")

    # Migrate both stages
    main_count = migrate_stage_inputs('Main Stage INPUT LIST', 'mainStageInputs', 'Main Stage')
    print(f"✓ Migrated {main_count} inputs from Main Stage")

    cocktail_count = migrate_stage_inputs('Cocktail Stage INPUT LIST', 'cocktailStageInputs', 'Cocktail Stage')
    print(f"✓ Migrated {cocktail_count} inputs from Cocktail Stage")

    print(f"\n✅ Total stage inputs migrated: {main_count + cocktail_count}")

if __name__ == '__main__':
    main()
