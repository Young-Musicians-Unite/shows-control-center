#!/usr/bin/env python3
"""
Collapse the duplicate 'YMPA' performer doc into 'YMPA Jazz Band'.

Copies arrivals + any members from 'YMPA' onto 'YMPA Jazz Band',
then deletes 'YMPA'. Dry-run by default; pass --apply to write.
"""
import argparse
import firebase_admin
from firebase_admin import credentials, firestore

CRED = '../config/firebase-credentials.json'
SOURCE_NAME = 'YMPA'                # the empty one I just created
TARGET_NAME = 'YMPA Jazz Band'      # the real one with existing data


def initialize():
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(CRED))
    return firestore.client()


def find_by_name(db, name):
    key = name.strip().lower()
    for doc in db.collection('setLists').stream():
        d = doc.to_dict() or {}
        if (d.get('performer') or '').strip().lower() == key:
            return doc.id, d
    return None, None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    db = initialize()
    src_id, src = find_by_name(db, SOURCE_NAME)
    tgt_id, tgt = find_by_name(db, TARGET_NAME)

    if not src_id:
        print(f'Source "{SOURCE_NAME}" not found — nothing to do.')
        return
    if not tgt_id:
        print(f'Target "{TARGET_NAME}" not found — cannot merge.')
        return

    print(f'Source: "{SOURCE_NAME}" [{src_id}]')
    print(f'  arrivals: {src.get("arrivals")}')
    print(f'  members: {len(src.get("members") or [])}')
    print(f'Target: "{TARGET_NAME}" [{tgt_id}]')
    print(f'  arrivals: {tgt.get("arrivals")}')
    print(f'  members: {len(tgt.get("members") or [])}')

    merged_arrivals = dict(tgt.get('arrivals') or {})
    for day, val in (src.get('arrivals') or {}).items():
        if val and not merged_arrivals.get(day):
            merged_arrivals[day] = val

    # Union members by name
    tgt_members = list(tgt.get('members') or [])
    seen = {(m.get('name') or '').strip().lower() for m in tgt_members}
    added = 0
    for m in (src.get('members') or []):
        nk = (m.get('name') or '').strip().lower()
        if not nk or nk in seen:
            continue
        tgt_members.append(m)
        seen.add(nk)
        added += 1

    print(f'\nPlan:')
    print(f'  UPDATE {tgt_id}: arrivals → {merged_arrivals}; members +{added}')
    print(f'  DELETE {src_id}')

    if not args.apply:
        print('\n(Dry run. Re-run with --apply.)')
        return

    batch = db.batch()
    batch.update(db.collection('setLists').document(tgt_id), {
        'arrivals': merged_arrivals,
        'members': tgt_members,
        'updatedAt': firestore.SERVER_TIMESTAMP,
    })
    batch.delete(db.collection('setLists').document(src_id))
    batch.commit()
    print('\n✓ Done.')


if __name__ == '__main__':
    main()
