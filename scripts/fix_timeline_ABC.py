#!/usr/bin/env python3
"""
Timeline cleanup — sections A (time format), B (whitespace), C (prefix
inconsistencies) from the audit.

A: Strip 'pm'/'am' suffix from any 24h-formatted time; delete empty Sunday row.
B: Collapse runs of whitespace to a single space and .strip() every event
   string (affects ~24 rows with trailing spaces or double-spaces).
C: Rename 'Soundcheck:' → 'Sound Check:' and 'Host Intro:' → 'Host: Intro'.
"""
import argparse
import re
import firebase_admin
from firebase_admin import credentials, firestore

CRED = '../config/firebase-credentials.json'


def initialize():
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(CRED))
    return firestore.client()


def fix_time(t):
    """Strip 'am'/'pm' suffix from a 24h time if stuck on the end."""
    if not isinstance(t, str):
        return t, False
    m = re.fullmatch(r'(\d{1,2}:\d{2})\s*[apAP][mM]', t)
    if m:
        return m.group(1), True
    return t, False


def fix_event(e):
    """Normalize whitespace + prefix variations."""
    if not isinstance(e, str):
        return e, []

    changes = []
    original = e

    # B: whitespace — collapse internal runs, strip ends
    collapsed = re.sub(r'\s+', ' ', e).strip()
    if collapsed != e:
        changes.append('whitespace')
        e = collapsed

    # C: prefix normalization (case-insensitive match on the prefix only)
    if re.match(r'^Soundcheck:', e, flags=re.IGNORECASE):
        e = re.sub(r'^Soundcheck:\s*', 'Sound Check: ', e, count=1, flags=re.IGNORECASE)
        changes.append('prefix:Soundcheck→Sound Check')

    if re.match(r'^Host Intro:', e):
        # "Host Intro: X" → "Host: Intro X"
        rest = e[len('Host Intro:'):].lstrip()
        e = f'Host: Intro {rest}'
        changes.append('prefix:Host Intro:→Host: Intro')

    return e, changes


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()

    db = initialize()

    plan_updates = []  # (doc_id, data_patch, summary)
    plan_deletes = []  # (doc_id, reason)

    for doc in db.collection('timeline').stream():
        d = doc.to_dict() or {}
        ev = d.get('event')
        tm = d.get('time')
        day = d.get('day')

        # A3: delete empty orphan (event is falsy AND time is falsy)
        if (not ev) and (not tm):
            plan_deletes.append((doc.id, f'empty row (day={day!r})'))
            continue

        patch = {}
        summary = []

        new_tm, tm_changed = fix_time(tm)
        if tm_changed:
            patch['time'] = new_tm
            summary.append(f'time {tm!r}→{new_tm!r}')

        new_ev, ev_changes = fix_event(ev)
        if ev_changes:
            patch['event'] = new_ev
            summary.append(f'event {ev!r}→{new_ev!r}  ({",".join(ev_changes)})')

        if patch:
            plan_updates.append((doc.id, patch, summary))

    print(f'Updates: {len(plan_updates)}')
    for doc_id, patch, summary in plan_updates:
        print(f'  {doc_id}')
        for line in summary:
            print(f'    {line}')

    print(f'\nDeletes: {len(plan_deletes)}')
    for doc_id, reason in plan_deletes:
        print(f'  {doc_id}  — {reason}')

    if not args.apply:
        print('\n(Dry run. Pass --apply to write.)')
        return

    # Firestore batch limit is 500; we're well under
    batch = db.batch()
    for doc_id, patch, _ in plan_updates:
        patch['updatedAt'] = firestore.SERVER_TIMESTAMP
        batch.update(db.collection('timeline').document(doc_id), patch)
    for doc_id, _ in plan_deletes:
        batch.delete(db.collection('timeline').document(doc_id))
    batch.commit()
    print(f'\n✓ {len(plan_updates)} updates + {len(plan_deletes)} deletes committed.')


if __name__ == '__main__':
    main()
