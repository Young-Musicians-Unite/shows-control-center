// Populate staff collection in Firestore
// Run with: node scripts/populate_staff.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'staff';

const fs = require('fs');
const path = require('path');

const CSV_PATH = '/Users/zachlarmer/Downloads/13th Gala Run of Show 2026.xlsx - Staffing List (1).csv';

function parseScheduleValue(val) {
    if (!val) return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed === 'N/A') return null;
    if (trimmed.toLowerCase() === 'already there') return null;
    return trimmed;
}

function parsePrice(val) {
    if (!val) return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    const stripped = trimmed.replace(/[^0-9.]/g, '');
    if (!stripped) return null;
    const num = parseFloat(stripped);
    return isNaN(num) ? null : num;
}

function isPlaceholder(name) {
    const n = name.trim();
    return n === 'ASA' || n === '?' || n.startsWith('ASA (') || n.startsWith('ASA(');
}

function parseCSV(content) {
    const lines = content.split('\n');
    const rows = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        // Simple CSV parse — split by comma, handle quoted fields
        const fields = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
                fields.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        fields.push(cur);
        rows.push(fields);
    }
    return rows;
}

function buildStaffRecords(csvContent) {
    const rows = parseCSV(csvContent);

    // Skip header row (index 0)
    const dataRows = rows.slice(1);

    // Map: normalized name -> record (for non-placeholders)
    const byName = new Map();
    // Placeholder entries (separate per row)
    const placeholders = [];

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (row.length < 8) continue;

        const team = (row[0] || '').trim();
        const name = (row[1] || '').trim();
        const role = (row[2] || '').trim();
        const priceCol3 = (row[3] || '').trim(); // unused price column
        const thursdayRaw = (row[4] || '').trim();
        const fridayRaw = (row[5] || '').trim();
        const saturdayRaw = (row[6] || '').trim();
        const sundayRaw = (row[7] || '').trim();
        const priceCol8 = row.length > 8 ? (row[8] || '').trim() : '';

        if (!name) continue;

        const schedule = {
            thursday: parseScheduleValue(thursdayRaw),
            friday: parseScheduleValue(fridayRaw),
            saturday: parseScheduleValue(saturdayRaw),
            sunday: parseScheduleValue(sundayRaw)
        };

        const price = parsePrice(priceCol8) || parsePrice(priceCol3);

        if (isPlaceholder(name)) {
            placeholders.push({
                name,
                role,
                teams: [team],
                schedule,
                isPlaceholder: true,
                price,
                sortOrder: placeholders.length
            });
        } else {
            const key = name.toLowerCase().replace(/\s+/g, ' ');
            if (byName.has(key)) {
                // Merge: add team if not already present
                const existing = byName.get(key);
                if (!existing.teams.includes(team)) {
                    existing.teams.push(team);
                }
                // Merge schedule: keep non-null values, prefer existing if both non-null
                for (const day of ['thursday', 'friday', 'saturday', 'sunday']) {
                    if (!existing.schedule[day] && schedule[day]) {
                        existing.schedule[day] = schedule[day];
                    }
                }
                // Merge price
                if (!existing.price && price) {
                    existing.price = price;
                }
            } else {
                byName.set(key, {
                    name,
                    role,
                    teams: [team],
                    schedule,
                    isPlaceholder: false,
                    price,
                    sortOrder: byName.size
                });
            }
        }
    }

    // Combine: named staff first (in insertion order), then placeholders
    const named = Array.from(byName.values());
    return [...named, ...placeholders];
}

async function deleteAllDocuments() {
    console.log('Deleting existing staff documents...');

    // List all documents
    const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}&pageSize=300`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) {
        const err = await listRes.text();
        throw new Error(`Failed to list documents: ${err}`);
    }
    const listData = await listRes.json();
    const docs = listData.documents || [];

    console.log(`  Found ${docs.length} existing documents to delete.`);

    for (const doc of docs) {
        const docName = doc.name;
        const deleteUrl = `https://firestore.googleapis.com/v1/${docName}?key=${API_KEY}`;
        const delRes = await fetch(deleteUrl, { method: 'DELETE' });
        if (!delRes.ok) {
            const err = await delRes.text();
            console.warn(`  Warning: failed to delete ${docName}: ${err}`);
        }
    }

    console.log('  Deletion complete.');
}

function buildFirestoreFields(item) {
    const now = new Date().toISOString();

    const scheduleFields = {};
    for (const day of ['thursday', 'friday', 'saturday', 'sunday']) {
        if (item.schedule[day] === null) {
            scheduleFields[day] = { nullValue: null };
        } else {
            scheduleFields[day] = { stringValue: item.schedule[day] };
        }
    }

    return {
        name: { stringValue: item.name },
        role: { stringValue: item.role },
        teams: {
            arrayValue: {
                values: item.teams.map(t => ({ stringValue: t }))
            }
        },
        schedule: {
            mapValue: {
                fields: scheduleFields
            }
        },
        isPlaceholder: { booleanValue: item.isPlaceholder },
        price: item.price !== null ? { doubleValue: item.price } : { nullValue: null },
        sortOrder: { integerValue: String(item.sortOrder) },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now }
    };
}

async function createDocument(item) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}`;

    const fields = buildFirestoreFields(item);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to create ${item.name}: ${err}`);
    }

    const result = await response.json();
    const docId = result.name.split('/').pop();
    return docId;
}

async function main() {
    // Read CSV
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`CSV file not found: ${CSV_PATH}`);
        process.exit(1);
    }

    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const staffRecords = buildStaffRecords(csvContent);

    console.log(`Parsed ${staffRecords.length} staff records from CSV.`);
    console.log('');

    // Delete existing docs
    await deleteAllDocuments();
    console.log('');

    // Insert new docs
    console.log(`Populating ${staffRecords.length} staff records into Firestore...`);
    console.log('');

    let successCount = 0;
    let errorCount = 0;

    for (const item of staffRecords) {
        try {
            const docId = await createDocument(item);
            const teamLabel = item.teams.join(', ');
            console.log(`  ✓ [${teamLabel}] ${item.name} — ${item.role} (${docId})`);
            successCount++;
        } catch (err) {
            console.error(`  ✗ ${item.name}: ${err.message}`);
            errorCount++;
        }
    }

    console.log('');
    console.log(`Done! ${successCount} created, ${errorCount} errors.`);
}

main();
