#!/usr/bin/env python3
"""
Section E fixes:
  1. Jazz Collective Backstage 19:49 → 19:46 (so the gap to On Stage at 20:06
     is 20m, matching every other main-stage band).
  2. Add a Backstage row for Fourtune at 18:30 (20m before On Stage 18:50).
     Mirrors the shape of existing Backstage rows: responsible=ALAN VALLADARES,
     production=True, day=Saturday.
"""
import argparse
import firebase_admin
from firebase_admin import credentials, firestore

CRED = '../config/firebase-credentials.json'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(CRED))
    db = firestore.client()

    # 1. Find Jazz Collective Backstage row
    jc_id = None
    for doc in db.collection('timeline').stream():
        d = doc.to_dict() or {}
        if d.get('event') == 'Backstage: Jazz Collective':
            jc_id = doc.id
            jc_data = d
            break

    # 2. Check no Fourtune Backstage already exists
    fourtune_exists = False
    for doc in db.collection('timeline').stream():
        d = doc.to_dict() or {}
        if d.get('event') == 'Backstage: Fourtune':
            fourtune_exists = True
            break

    print('Plan:')
    if jc_id:
        print(f'  UPDATE {jc_id}  Backstage: Jazz Collective')
        print(f'    time: {jc_data.get("time")!r} → "19:46"')
    else:
        print('  ! Jazz Collective Backstage row not found')

    if fourtune_exists:
        print('  ! Fourtune Backstage already exists — skipping create')
    else:
        print('  CREATE  Backstage: Fourtune  @ Saturday 18:30')

    if not args.apply:
        print('\n(Dry run. Pass --apply to write.)')
        return

    batch = db.batch()
    if jc_id:
        batch.update(db.collection('timeline').document(jc_id), {
            'time': '19:46',
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })
    if not fourtune_exists:
        new_ref = db.collection('timeline').document()
        batch.set(new_ref, {
            'day': 'Saturday',
            'time': '18:30',
            'event': 'Backstage: Fourtune',
            'responsible': 'ALAN VALLADARES',
            'production': True,
            'completed': False,
            'status': 'not-started',
            'tag': '',
            'highlightColor': '',
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })
    batch.commit()
    print('\n✓ Committed.')


if __name__ == '__main__':
    main()
