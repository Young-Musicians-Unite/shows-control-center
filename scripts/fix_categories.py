#!/usr/bin/env python3
"""
Fix duplicate budget categories caused by subtle string differences.
Normalizes all budget item categories to match the canonical dropdown values.
"""

import firebase_admin
from firebase_admin import credentials, firestore
import sys
import os

# Canonical categories (from the app dropdown)
CANONICAL_CATEGORIES = [
    "6811a - Talent/Performers & Hosts",
    "6811b - A/V Production",
    "6811c - Venue & Permits",
    "6811d - Food & Beverage",
    "6811e - Staff & Labor",
    "6811f - Marketing, Promotion & Branding",
    "6811g - Decor & Miscellaneous Supplies",
]

def normalize_category(raw):
    """Match a raw category string to its canonical form."""
    if not raw:
        return None
    stripped = raw.strip()
    # Exact match
    if stripped in CANONICAL_CATEGORIES:
        return stripped
    # Case-insensitive / whitespace-collapsed match
    normalized = ' '.join(stripped.lower().split())
    for canon in CANONICAL_CATEGORIES:
        canon_norm = ' '.join(canon.lower().split())
        if normalized == canon_norm:
            return canon
    # Prefix match (e.g. "6811d" -> "6811d - Food & Beverage")
    for canon in CANONICAL_CATEGORIES:
        prefix = canon.split(' - ')[0].strip().lower()
        if normalized.startswith(prefix):
            return canon
    return None

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    cred_path = os.path.join(script_dir, '..', 'config', 'firebase-credentials.json')
    if not os.path.exists(cred_path):
        # Try alternate location
        cred_path = os.path.join(script_dir, '..', 'service-account-key.json')

    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    budget_ref = db.collection('budget')
    items = list(budget_ref.stream())

    print(f"Found {len(items)} budget items\n")

    # First pass: show all unique categories and flag mismatches
    categories = {}
    for item in items:
        data = item.to_dict()
        cat = data.get('category', '')
        if cat not in categories:
            categories[cat] = []
        categories[cat].append((item.id, data.get('vendor', 'N/A')))

    print("=== Current categories ===")
    for cat, members in sorted(categories.items()):
        canon = normalize_category(cat)
        marker = "" if cat in CANONICAL_CATEGORIES else f"  ⚠️  -> would normalize to: {canon or 'UNKNOWN'}"
        print(f"\n[{repr(cat)}]{marker}")
        for doc_id, vendor in members:
            print(f"  - {vendor} ({doc_id})")

    # Find items that need fixing
    to_fix = []
    for item in items:
        data = item.to_dict()
        cat = data.get('category', '')
        if cat not in CANONICAL_CATEGORIES:
            canon = normalize_category(cat)
            if canon:
                to_fix.append((item.id, data.get('vendor', 'N/A'), cat, canon))

    if not to_fix:
        print("\n✅ All categories already match canonical values. Nothing to fix.")
        return

    print(f"\n=== {len(to_fix)} items need fixing ===")
    for doc_id, vendor, old, new in to_fix:
        print(f"  {vendor}: {repr(old)} -> {repr(new)}")

    response = input("\nApply fixes? (yes/no): ")
    if response.lower() != 'yes':
        print("Cancelled.")
        return

    for doc_id, vendor, old, new in to_fix:
        budget_ref.document(doc_id).update({
            'category': new,
            'updatedAt': firestore.SERVER_TIMESTAMP
        })
        print(f"  ✓ Fixed: {vendor}")

    print(f"\n✅ Updated {len(to_fix)} items.")

if __name__ == '__main__':
    main()
