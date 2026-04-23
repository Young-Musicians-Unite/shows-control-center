#!/usr/bin/env python3
"""
Section G cleanup — typos, casing, and naming-convention normalization.
"""
import argparse
import firebase_admin
from firebase_admin import credentials, firestore

CRED = '../config/firebase-credentials.json'

# (match_event, new_event, note)
FIXES = [
    # G1 — typo
    ('YMU bars close completly',                   'YMU bars close completely',               'G1  completly → completely'),
    # G2 — casing + en/em dash
    ('Zach & Sammy - POWER 20',                    'Zach & Sammy — Power 20',                 'G2  ALL CAPS → Title Case; dash → em'),
    # G3 — ALL CAPS
    ('FULL TEAM BREAKDOWN + CLEANUP',              'Full Team Breakdown + Cleanup',           'G3  ALL CAPS → Title Case'),
    # G4 — ALL CAPS single word
    ('GOODNIGHT',                                  'Goodnight',                               'G4  ALL CAPS → Title Case'),
    # G5–G8 — security handover phrasing (unclear without punctuation)
    ('Event Security Departs overnight arrives',   'Event Security Departs; Overnight Security Arrives', 'G5  phrasing'),
    ('Overnight Security departs new one arrives', 'Overnight Security Departs; New Security Arrives',   'G6  phrasing'),
    ('Security departs Event Security Arrives',    'Security Departs; Event Security Arrives',           'G7  phrasing'),
    ('Security departs and New one Arrives',       'Security Departs; New Security Arrives',             'G8  phrasing'),
    # G9–G11 — normalize to "Arrival: X"
    ('ASA Staff Arrival',                          'Arrival: ASA Staff',                      'G9   normalize to Arrival: prefix'),
    ('Cigar Roller Arrival',                       'Arrival: Cigar Roller',                   'G10  normalize to Arrival: prefix'),
    ('David Sexton Arrival',                       'Arrival: David Sexton',                   'G11  normalize to Arrival: prefix'),
    # G12 — combined arrival+setup
    ('Edlen arrival and Setup',                    'Arrival + Setup: Edlen',                  'G12  normalize to Arrival + Setup:'),
    # G13 — arrival with purpose
    ('Theo + Everlast Arrival for Rigging',        'Arrival: Theo + Everlast (Rigging)',      'G13  normalize; purpose in parens'),
    # G14 — "Arrive" → "Arrival"
    ('Zach and Estelle Arrive',                    'Arrival: Zach and Estelle',               'G14  normalize to Arrival: prefix'),
    # G15 — combined arrival+unload (convention mirrors "Arrival + Setup:")
    ('YMU Production Team Arrival + Unload',       'Arrival + Unload: YMU Production Team',   'G15  normalize to Arrival + Unload:'),
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(CRED))
    db = firestore.client()

    # Load once
    all_docs = [(doc.id, doc.to_dict() or {}) for doc in db.collection('timeline').stream()]
    by_event = {}
    for doc_id, d in all_docs:
        ev = d.get('event')
        if ev is not None:
            by_event.setdefault(ev, []).append((doc_id, d))

    plan = []
    missing = []
    for match_ev, new_ev, note in FIXES:
        hits = by_event.get(match_ev, [])
        if len(hits) == 0:
            missing.append((match_ev, note))
        elif len(hits) > 1:
            print(f'  ! MULTI ({len(hits)}) for {match_ev!r} — {note}')
        else:
            doc_id, _ = hits[0]
            plan.append((doc_id, new_ev, match_ev, note))

    print(f'Updates: {len(plan)}')
    for doc_id, new_ev, old_ev, note in plan:
        print(f'  {doc_id}  [{note}]')
        print(f'      {old_ev!r}')
        print(f'    → {new_ev!r}')

    if missing:
        print(f'\nNot found ({len(missing)}):')
        for match_ev, note in missing:
            print(f'  ! {match_ev!r}  [{note}]')

    if not args.apply:
        print('\n(Dry run. Pass --apply to write.)')
        return

    batch = db.batch()
    for doc_id, new_ev, _, _ in plan:
        batch.update(db.collection('timeline').document(doc_id), {
            'event': new_ev,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })
    batch.commit()
    print(f'\n✓ {len(plan)} update(s) committed.')


if __name__ == '__main__':
    main()
