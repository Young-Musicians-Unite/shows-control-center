// Populate the seatingTables collection with 8 lounges + 72 tables.
// Idempotent: existing tables (matched by label) are skipped.
// Run with: node scripts/populate_seating_tables.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'seatingTables';

// Approximate (x, y) fractions over the seating-map.png background.
// These are placeholders — the user can drag markers in the app to refine.
//
// Lounges form 2 rows of 4, framing the dance floor in the upper third.
const LOUNGE_X = [0.13, 0.30, 0.70, 0.87];
const LOUNGE_Y = [0.08, 0.22];

// Tables 9-78 form 7 rows of 10 columns (3 left + 3 middle + 4 right).
const TABLE_X = [
    0.08, 0.18, 0.28,           // left group cols 1-3
    0.40, 0.50, 0.60,           // middle group cols 4-6
    0.71, 0.79, 0.87, 0.95      // right group cols 7-10
];
const TABLE_Y = [0.37, 0.45, 0.52, 0.58, 0.66, 0.72, 0.78];

// Tables 79 and 80 sit in a final row beneath the grid.
const EXTRA_TABLES = [
    { number: 79, x: 0.18, y: 0.84 },
    { number: 80, x: 0.79, y: 0.84 }
];

function buildTableDocs() {
    const docs = [];

    // Lounges 1-8
    for (let i = 0; i < 8; i++) {
        const number = i + 1;
        const col = i % 4;
        const row = Math.floor(i / 4);
        docs.push({
            label: `Lounge ${number}`,
            kind: 'lounge',
            number,
            capacity: 12,
            x: LOUNGE_X[col],
            y: LOUNGE_Y[row]
        });
    }

    // Tables 9-78 (70 tables in 7 rows × 10 cols)
    for (let i = 0; i < 70; i++) {
        const number = 9 + i;
        const col = i % 10;
        const row = Math.floor(i / 10);
        docs.push({
            label: `Table ${number}`,
            kind: 'table',
            number,
            capacity: 10,
            x: TABLE_X[col],
            y: TABLE_Y[row]
        });
    }

    // Tables 79, 80
    EXTRA_TABLES.forEach(({ number, x, y }) => {
        docs.push({
            label: `Table ${number}`,
            kind: 'table',
            number,
            capacity: 10,
            x,
            y
        });
    });

    return docs;
}

async function listExistingLabels() {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?pageSize=500&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to list ${COLLECTION}: ${err}`);
    }
    const data = await res.json();
    const labels = new Set();
    (data.documents || []).forEach(doc => {
        const label = doc.fields && doc.fields.label && doc.fields.label.stringValue;
        if (label) labels.add(label);
    });
    return labels;
}

async function createDocument(item) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}`;
    const now = new Date().toISOString();
    const fields = {
        label: { stringValue: item.label },
        kind: { stringValue: item.kind },
        number: { integerValue: String(item.number) },
        capacity: { integerValue: String(item.capacity) },
        x: { doubleValue: item.x },
        y: { doubleValue: item.y },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now }
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to create ${item.label}: ${err}`);
    }
    const result = await res.json();
    return result.name.split('/').pop();
}

async function main() {
    const docs = buildTableDocs();
    console.log(`Seeding ${docs.length} seating tables (8 lounges + 72 tables)…\n`);

    let existing;
    try {
        existing = await listExistingLabels();
        if (existing.size > 0) console.log(`Found ${existing.size} existing — will skip those.\n`);
    } catch (err) {
        console.error('Could not list existing tables:', err.message);
        existing = new Set();
    }

    let created = 0, skipped = 0, failed = 0;
    for (const item of docs) {
        if (existing.has(item.label)) {
            console.log(`  ↷ ${item.label} (already exists)`);
            skipped++;
            continue;
        }
        try {
            const id = await createDocument(item);
            console.log(`  ✓ ${item.label} (${id})`);
            created++;
        } catch (err) {
            console.error(`  ✗ ${item.label}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\nDone. Created ${created}, skipped ${skipped}, failed ${failed}.`);
}

main();
