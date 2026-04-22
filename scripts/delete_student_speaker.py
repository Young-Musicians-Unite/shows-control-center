#!/usr/bin/env python3
"""One-time cleanup: delete the 'Student Speaker' performer doc."""
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

    target = None
    for doc in db.collection('setLists').stream():
        d = doc.to_dict() or {}
        if (d.get('performer') or '').strip().lower() == 'student speaker':
            target = (doc.id, d)
            break
    if not target:
        print('No "Student Speaker" doc found.')
        return
    tid, td = target
    print(f'Would DELETE {tid}: {td}')
    if args.apply:
        db.collection('setLists').document(tid).delete()
        print('✓ Deleted.')
    else:
        print('(Dry run.)')


if __name__ == '__main__':
    main()
