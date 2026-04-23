#!/usr/bin/env python3
"""
Two cleanup passes on timeline.responsible:

1. CATEGORY OWNERSHIP — pin all rows in a category to one owner:
   Performance:     → ANDRES
   Host: Intro X    → ANDRES
   Host: (other)    → ANDRES
   Speech:          → ANDRES
   Video:           → THEO

2. NAME CASING — normalize duplicate spellings (skipping Juan/Lui/Tasha):
   ANDI / Andi / ANDI LIPTON  → ANDI LIPTON
   ESTELLE / Estelle / ESTELLE MORALES → ESTELLE MORALES
   PEDRO DIAZ / Pedro          → PEDRO DIAZ
   ALAN / ALAN VALLADARES      → ALAN VALLADARES
"""
import argparse
import firebase_admin
from firebase_admin import credentials, firestore

CRED = '../config/firebase-credentials.json'

# Category ownership (event prefix → new responsible).
# Ordered: more-specific prefix first so 'Host: Intro' beats 'Host:'.
CATEGORY_OWNERS = [
    ('Performance:',    'ANDRES'),
    ('Host: Intro',     'ANDRES'),
    ('Host:',           'ANDRES'),
    ('Speech:',         'ANDRES'),
    ('Video:',          'THEO'),
]

# Name normalization — case-insensitive keys (all lowercase, trimmed)
NAME_MAP = {
    'andi':                'ANDI LIPTON',
    'andi lipton':         'ANDI LIPTON',
    'estelle':             'ESTELLE MORALES',
    'estelle morales':     'ESTELLE MORALES',
    'pedro':               'PEDRO DIAZ',
    'pedro diaz':          'PEDRO DIAZ',
    'alan':                'ALAN VALLADARES',
    'alan valladares':     'ALAN VALLADARES',
}


def pick_new_responsible(event, current_resp):
    """Return new responsible string, or None if no change."""
    ev = event or ''
    # 1. Category ownership takes precedence
    for prefix, owner in CATEGORY_OWNERS:
        if ev.startswith(prefix):
            return owner if current_resp != owner else None
    # 2. Name normalization
    key = (current_resp or '').strip().lower()
    if key in NAME_MAP and NAME_MAP[key] != current_resp:
        return NAME_MAP[key]
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(CRED))
    db = firestore.client()

    plan = []
    for doc in db.collection('timeline').stream():
        d = doc.to_dict() or {}
        cur = d.get('responsible') or ''
        ev = d.get('event') or ''
        new = pick_new_responsible(ev, cur)
        if new is not None:
            plan.append((doc.id, ev, cur, new))

    # Group by reason for clearer reporting
    from collections import defaultdict
    by_reason = defaultdict(list)
    for doc_id, ev, cur, new in plan:
        # Determine which rule fired
        reason = None
        for prefix, owner in CATEGORY_OWNERS:
            if ev.startswith(prefix):
                reason = f'CATEGORY {prefix}→{owner}'
                break
        if reason is None:
            reason = f'NAME {cur}→{new}'
        by_reason[reason].append((doc_id, ev, cur, new))

    for reason, items in sorted(by_reason.items()):
        print(f'\n[{reason}]  ({len(items)})')
        for doc_id, ev, cur, new in items:
            print(f'  {doc_id}  {cur!r:22s} → {new!r:22s}  {ev!r}')

    print(f'\nTotal updates: {len(plan)}')
    if not args.apply:
        print('(Dry run. Pass --apply to write.)')
        return

    batch = db.batch()
    for doc_id, _, _, new in plan:
        batch.update(db.collection('timeline').document(doc_id), {
            'responsible': new,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })
    batch.commit()
    print('✓ Committed.')


if __name__ == '__main__':
    main()
