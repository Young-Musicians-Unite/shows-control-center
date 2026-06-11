#!/usr/bin/env python3
"""
Migrate invitees from gala-invite-list-2026 Firebase project
into the gala-management Firebase project.

Each invitee is written to:
  events/{matchedEventId}/invitees/{docId}

Event matching is done by name (case-insensitive). Invitees whose
event name cannot be matched are written to a `_unmatched` document
in the script output so they can be handled manually.

Usage:
  python migrate_invitees.py \
    --src-cred  path/to/gala-invite-list-credentials.json \
    --dest-cred path/to/gala-management-credentials.json  \
    [--dry-run]

Requirements:
  pip install firebase-admin
"""

import argparse
import sys
import json
import re
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("✗  Run: pip install firebase-admin")
    sys.exit(1)


def init_app(cred_path, name):
    try:
        cred = credentials.Certificate(cred_path)
        app = firebase_admin.initialize_app(cred, name=name)
        print(f"✓  Initialized Firebase app '{name}'")
        return firestore.client(app=app)
    except Exception as e:
        print(f"✗  Could not init '{name}': {e}")
        sys.exit(1)


def normalize(s):
    return re.sub(r'\s+', ' ', str(s or '').strip().lower())


def migrate(src_db, dest_db, dry_run=False):
    # ── Load source events (gala-invite-list-2026) ──────────────
    print("\n→ Reading source events…")
    src_events = {}
    for doc in src_db.collection('events').stream():
        d = doc.to_dict()
        src_events[doc.id] = d.get('name', '')
    print(f"  Found {len(src_events)} source events")
    for eid, ename in src_events.items():
        print(f"    {eid}: {ename}")

    # ── Load destination events (gala-management) ───────────────
    print("\n→ Reading destination events…")
    dest_events = {}  # normalised_name → event doc id
    for doc in dest_db.collection('events').stream():
        d = doc.to_dict()
        name = d.get('name', '')
        dest_events[normalize(name)] = doc.id
    print(f"  Found {len(dest_events)} destination events:")
    for k, v in dest_events.items():
        print(f"    {v}: {k}")

    # ── Build event ID mapping ───────────────────────────────────
    event_map = {}   # src_event_id → dest_event_id
    unmatched_events = set()
    for src_id, src_name in src_events.items():
        key = normalize(src_name)
        if key in dest_events:
            event_map[src_id] = dest_events[key]
            print(f"  ✓ Mapped '{src_name}' → {dest_events[key]}")
        else:
            unmatched_events.add(src_id)
            print(f"  ✗ No match for '{src_name}' (id={src_id})")

    # ── Load source invitees ─────────────────────────────────────
    print("\n→ Reading source invitees…")
    invitees = []
    for doc in src_db.collection('invitees').stream():
        d = doc.to_dict()
        d['_src_id'] = doc.id
        invitees.append(d)
    print(f"  Found {len(invitees)} invitees")

    # ── Write to destination ─────────────────────────────────────
    matched = 0
    skipped = 0
    unmatched_invitees = []

    for inv in invitees:
        src_event_id = inv.get('eventId', '')
        if src_event_id not in event_map:
            print(f"  ⚠  Invitee '{inv.get('name','')}' — event not matched, skipping")
            unmatched_invitees.append(inv)
            skipped += 1
            continue

        dest_event_id = event_map[src_event_id]
        dest_ref = dest_db.collection('events').document(dest_event_id) \
                          .collection('invitees').document(inv['_src_id'])

        payload = {
            'name':              inv.get('name', ''),
            'title':             inv.get('title', ''),
            'organization':      inv.get('organization', ''),
            'status':            inv.get('status', 'pending'),
            'seats':             inv.get('seats', ''),
            'tableNumber':       inv.get('tableNumber', ''),
            'invitedBy':         inv.get('invitedBy', ''),
            'interviewPriority': inv.get('interviewPriority', ''),
            'phone':             inv.get('phone', ''),
            'email':             inv.get('email', ''),
            'notes':             inv.get('notes', ''),
            'headshotUrl':       inv.get('headshotUrl', ''),
            'bio':               inv.get('bio', ''),
            'excludeFromFacebook': inv.get('excludeFromFacebook', False),
            'migratedAt':        datetime.utcnow().isoformat(),
        }

        if dry_run:
            print(f"  [DRY] Would write '{payload['name']}' → events/{dest_event_id}/invitees/{inv['_src_id']}")
        else:
            dest_ref.set(payload, merge=True)
            print(f"  ✓  '{payload['name']}' → events/{dest_event_id}/invitees/{inv['_src_id']}")

        matched += 1

    # ── Summary ──────────────────────────────────────────────────
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Summary:")
    print(f"  Migrated : {matched}")
    print(f"  Skipped  : {skipped}")

    if unmatched_invitees:
        out = f"unmatched_invitees_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        with open(out, 'w') as f:
            json.dump(unmatched_invitees, f, indent=2, default=str)
        print(f"\n  ⚠  {len(unmatched_invitees)} unmatched invitees saved to {out}")
        print("     Add them manually or create matching events first.")

    print("\nDone." if not dry_run else "\nDry run complete — no data was written.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Migrate invitees from gala-invite-list-2026 to gala-management')
    parser.add_argument('--src-cred',  required=True, help='Path to gala-invite-list-2026 service account JSON')
    parser.add_argument('--dest-cred', required=True, help='Path to gala-management service account JSON')
    parser.add_argument('--dry-run',   action='store_true', help='Preview without writing')
    args = parser.parse_args()

    src_db  = init_app(args.src_cred,  'src')
    dest_db = init_app(args.dest_cred, 'dest')

    migrate(src_db, dest_db, dry_run=args.dry_run)
