#!/usr/bin/env python3
"""
One-time: set explicit Saturday performance times as manual overrides on
each performer doc. Also wipes any other-day perf overrides so the Sat
value doesn't accidentally bleed. Times are in 24h format matching the
rest of the timeline (the UI formats with formatTime12Hour).
"""
import argparse
import firebase_admin
from firebase_admin import credentials, firestore

CRED = '../config/firebase-credentials.json'

# performer doc name → Saturday performance time (24h)
OVERRIDES = {
    'Lounge Band':                                    '18:20',   # 6:20 PM
    'Fourtune':                                       '18:50',   # 6:50 PM
    'Miami Beach Rock Ensemble (Set 1)':              '19:39',   # 7:39 PM
    'YMPA Jazz Band':                                 '19:52',   # 7:52 PM
    'Jazz Collective':                                '20:12',   # 8:12 PM
    'West Little River K-8 + Homestead Senior High Flagettes Marching Band': '20:53',  # 8:53 PM
    'Avalanche':                                      '21:05',   # 9:05 PM
    'Not Yet Published':                              '21:28',   # 9:28 PM
    'Miami Beach Rock Ensemble (Set 2)':              '21:49',   # 9:49 PM
    'Undercover':                                     '22:14',   # 10:14 PM
}

ALL_DAYS = ['thursday', 'friday', 'saturday', 'sunday']


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(CRED))
    db = firestore.client()

    by_name = {}
    for doc in db.collection('setLists').stream():
        d = doc.to_dict() or {}
        name = (d.get('performer') or '').strip()
        if name:
            by_name[name.lower()] = (doc.id, d)

    batch = db.batch()
    plan = []
    for name, time_str in OVERRIDES.items():
        entry = by_name.get(name.lower())
        if not entry:
            plan.append(('MISSING', name, time_str, None))
            continue
        doc_id, data = entry
        existing = data.get('performanceOverrides') or {}
        new_overrides = {d: existing.get(d, '') for d in ALL_DAYS}
        new_overrides['saturday'] = time_str
        plan.append(('UPDATE', name, time_str, doc_id))
        batch.update(db.collection('setLists').document(doc_id), {
            'performanceOverrides': new_overrides,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })

    for action, name, time_str, doc_id in plan:
        if action == 'MISSING':
            print(f'! NOT FOUND: {name}')
        else:
            print(f'  UPDATE {name:55s}  Sat {time_str}  [{doc_id}]')

    missing = sum(1 for p in plan if p[0] == 'MISSING')
    if missing:
        print(f'\n{missing} performer(s) not found — skipped.')

    if not args.apply:
        print('\n(Dry run. Pass --apply to write.)')
        return

    batch.commit()
    print(f'\n✓ Wrote {len(plan) - missing} override(s).')


if __name__ == '__main__':
    main()
