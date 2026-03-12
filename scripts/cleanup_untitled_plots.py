#!/usr/bin/env python3
"""Delete all 'Untitled Plot' stage plots that have no objects (empty canvases)."""

import firebase_admin
from firebase_admin import credentials, firestore

def main():
    if not firebase_admin._apps:
        cred = credentials.Certificate('../config/firebase-credentials.json')
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    plots = db.collection('stagePlots').where('name', '==', 'Untitled Plot').stream()
    plots = list(plots)
    print(f"Found {len(plots)} plots named 'Untitled Plot'")

    deleted = 0
    for plot in plots:
        objects = list(plot.reference.collection('objects').limit(1).stream())
        if len(objects) == 0:
            plot.reference.delete()
            deleted += 1
            print(f"  Deleted empty plot {plot.id}")
        else:
            print(f"  Skipped plot {plot.id} (has objects)")

    print(f"\nDone. Deleted {deleted} empty Untitled Plots.")

if __name__ == '__main__':
    main()
