#!/usr/bin/env python3
"""
One-time fixes to timeline rows per user's review:
  1. Fix malformed time '21:24pm' -> '21:24'
  2. 'YMPA Arrival' -> 'Arrival: YMPA'
  3. 'Homestead Marching Band Arrival' -> 'Arrival: Homestead Marching Band'
     'WLR Arrival' -> 'Arrival: WLR'
  5. 'Host: Intro YMU Jazz Collective' -> 'Host: Intro Jazz Collective'
  6. 'Host: Intro YMPA Jazz' -> 'Host: Intro YMPA Jazz Band'
  7. Normalize cocktail-stage events to 'Performance: <Band> (cocktail stage)':
       'Cocktail Stage: Act 1 Lounge Band' -> 'Performance: Lounge Band (cocktail stage)'
       'Cocktail Stage: Act 2 Fourtune'    -> 'Performance: Fourtune (cocktail stage)'
     Also sets the performer field so these round-trip through the app's
     linking logic like every other performance row.
"""
import argparse
import firebase_admin
from firebase_admin import credentials, firestore

CRED = '../config/firebase-credentials.json'


# List of (match_dict, update_dict, description) tuples.
# match_dict: key/value pairs that identify the row
# update_dict: new fields to set
FIXES = [
    (
        {'event': 'Host: Last Call for Silent Auction & Intro Noah Speech/NYP', 'time': '21:24pm'},
        {'time': '21:24'},
        '#1 fix time 21:24pm -> 21:24'
    ),
    (
        {'event': 'YMPA Arrival '},
        {'event': 'Arrival: YMPA'},
        '#2 rename to Arrival: YMPA'
    ),
    (
        {'event': 'Homestead Marching Band Arrival'},
        {'event': 'Arrival: Homestead Marching Band'},
        '#3a rename to Arrival: Homestead Marching Band'
    ),
    (
        {'event': 'WLR Arrival'},
        {'event': 'Arrival: WLR'},
        '#3b rename to Arrival: WLR'
    ),
    (
        {'event': 'Host: Intro YMU Jazz Collective'},
        {'event': 'Host: Intro Jazz Collective'},
        '#5 drop "YMU" from Jazz Collective intro'
    ),
    (
        {'event': 'Host: Intro YMPA Jazz'},
        {'event': 'Host: Intro YMPA Jazz Band'},
        '#6 add "Band" to YMPA intro'
    ),
    (
        {'event': 'Cocktail Stage: Act 1 Lounge Band'},
        {'event': 'Performance: Lounge Band (cocktail stage)', 'performer': 'Lounge Band'},
        '#7a normalize Lounge Band to Performance: prefix'
    ),
    (
        {'event': 'Cocktail Stage: Act 2 Fourtune'},
        {'event': 'Performance: Fourtune (cocktail stage)', 'performer': 'Fourtune'},
        '#7b normalize Fourtune to Performance: prefix'
    ),
]


def find_matches(db, match):
    """Return list of (doc_id, data) for timeline docs matching all fields in `match`."""
    found = []
    for doc in db.collection('timeline').stream():
        d = doc.to_dict() or {}
        if all(d.get(k) == v for k, v in match.items()):
            found.append((doc.id, d))
    return found


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(CRED))
    db = firestore.client()

    batch = db.batch()
    total = 0

    for match, update, desc in FIXES:
        hits = find_matches(db, match)
        if not hits:
            print(f'  ! NOT FOUND  {desc}   match={match}')
            continue
        if len(hits) > 1:
            print(f'  ! MULTI ({len(hits)})  {desc}   match={match}')
            for h in hits:
                print(f'                -> {h[0]}')
            continue
        doc_id, data = hits[0]
        print(f'  UPDATE {doc_id}  {desc}')
        for k, v in update.items():
            print(f'           {k}: {data.get(k)!r} -> {v!r}')
        batch.update(db.collection('timeline').document(doc_id), {
            **update,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })
        total += 1

    if not args.apply:
        print(f'\n(Dry run. Would update {total} row(s). Pass --apply to write.)')
        return

    batch.commit()
    print(f'\n✓ Wrote {total} update(s).')


if __name__ == '__main__':
    main()
