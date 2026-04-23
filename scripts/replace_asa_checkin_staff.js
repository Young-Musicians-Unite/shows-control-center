// Replace 12 generic "ASA" placeholders on the "Check In" team with the real
// ASA agency roster from the Nowsta PDF (Saturday, April 25, 2026).
//
// Schedule for all 12: saturday = "4:30pm - 10pm" (matches existing placeholders).
// Role: "Guest Check-In Captain" for (C), "Guest Check-In Staff" for (S).
// Team: "Check In" (unchanged).
// Captain/staff distinction comes from the PDF's (S)/(C) suffixes.
//
// This script PATCHES existing placeholder documents in place (preserves their
// IDs and sortOrder) rather than deleting + recreating. If there are more
// placeholders than roster entries, leftovers are deleted. If there are more
// roster entries than placeholders, new documents are created at the end.
//
// Run: node scripts/replace_asa_checkin_staff.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';

// Roster from ASA Agency Nowsta sheet, in the order listed on the printout.
// type: 'S' = Staff (server-level), 'C' = Captain (lead).
const ROSTER = [
    { name: 'Liss Almonte',            type: 'S' },
    { name: 'Aksen Dalakian',          type: 'C' },
    { name: 'Camila Diaz Lozano',      type: 'S' },
    { name: 'Andrea Figueredo',        type: 'S' },
    { name: 'Valentina Lilly',         type: 'S' },
    { name: 'Lauren Lucho',            type: 'S' },
    { name: 'Svetlana Obradovic',      type: 'S' },
    { name: 'Jenny Perez',             type: 'S' },
    { name: 'Angelina Puccio',         type: 'S' },
    { name: 'Celeste Ruth Rodríguez',  type: 'C' },
    { name: 'Esteban Urizar',          type: 'S' },
    { name: 'Alan Van',                type: 'C' },
];

const SCHEDULE = {
    thursday: null,
    friday:   null,
    saturday: '4:30pm - 10pm',
    sunday:   null,
};

const TEAM = 'Check In';

function readField(f) {
    if (!f) return null;
    if ('stringValue' in f) return f.stringValue;
    if ('booleanValue' in f) return f.booleanValue;
    if ('integerValue' in f) return parseInt(f.integerValue, 10);
    if ('doubleValue' in f) return f.doubleValue;
    if ('nullValue' in f) return null;
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(readField);
    if ('mapValue' in f) {
        const out = {};
        const fields = f.mapValue.fields || {};
        for (const k of Object.keys(fields)) out[k] = readField(fields[k]);
        return out;
    }
    return null;
}

function scheduleFields(schedule) {
    const out = {};
    for (const day of ['thursday', 'friday', 'saturday', 'sunday']) {
        const v = schedule[day];
        out[day] = v === null || v === undefined
            ? { nullValue: null }
            : { stringValue: v };
    }
    return out;
}

function recordFields(item) {
    const now = new Date().toISOString();
    const role = item.type === 'C' ? 'Guest Check-In Captain (ASA)' : 'Guest Check-In Staff (ASA)';
    return {
        name:          { stringValue: item.name },
        role:          { stringValue: role },
        teams:         { arrayValue: { values: [{ stringValue: TEAM }] } },
        schedule:      { mapValue: { fields: scheduleFields(SCHEDULE) } },
        isPlaceholder: { booleanValue: false },
        price:         { nullValue: null },
        sortOrder:     { integerValue: String(item.sortOrder) },
        updatedAt:     { timestampValue: now },
    };
}

async function listStaff() {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/staff?key=${API_KEY}&pageSize=500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`List failed: ${await res.text()}`);
    const data = await res.json();
    return (data.documents || []).map(d => {
        const id = d.name.split('/').pop();
        const fields = d.fields || {};
        const rec = { id };
        for (const k of Object.keys(fields)) rec[k] = readField(fields[k]);
        return rec;
    });
}

async function patchDoc(id, fields) {
    // PATCH with updateMask to only touch the fields we send (createdAt untouched).
    const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/staff/${id}?${mask}&key=${API_KEY}`;
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`Patch ${id} failed: ${await res.text()}`);
}

async function createDoc(fields) {
    const now = new Date().toISOString();
    fields.createdAt = { timestampValue: now };
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/staff?key=${API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`Create failed: ${await res.text()}`);
    const body = await res.json();
    return body.name.split('/').pop();
}

async function deleteDoc(id) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/staff/${id}?key=${API_KEY}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Delete ${id} failed: ${await res.text()}`);
}

async function main() {
    console.log('Reading staff collection...');
    const all = await listStaff();

    // Target placeholders: name starts with "ASA" on the Check In team.
    const placeholders = all
        .filter(r => (r.teams || []).includes(TEAM))
        .filter(r => {
            const n = (r.name || '').trim();
            return n === 'ASA' || n.startsWith('ASA (') || n.startsWith('ASA(');
        })
        .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

    console.log(`Found ${placeholders.length} ASA placeholder(s) on "${TEAM}" team.`);
    console.log(`Roster has ${ROSTER.length} real name(s).`);
    console.log('');

    const pairs = Math.min(placeholders.length, ROSTER.length);
    let patched = 0, created = 0, deleted = 0;

    // 1) Patch in place for the first N pairs.
    for (let i = 0; i < pairs; i++) {
        const ph = placeholders[i];
        const item = { ...ROSTER[i], sortOrder: ph.sortOrder ?? i };
        await patchDoc(ph.id, recordFields(item));
        console.log(`  ✓ PATCH [${ph.id}] ${ph.name!==undefined?ph.name:'(?)'}  ->  ${item.name} (${item.type === 'C' ? 'Captain' : 'Staff'})`);
        patched++;
    }

    // 2) If roster has extras, create new docs.
    if (ROSTER.length > placeholders.length) {
        const maxSort = Math.max(
            -1,
            ...all
                .filter(r => (r.teams || []).includes(TEAM))
                .map(r => r.sortOrder ?? -1)
        );
        for (let i = pairs; i < ROSTER.length; i++) {
            const item = { ...ROSTER[i], sortOrder: maxSort + 1 + (i - pairs) };
            const id = await createDoc(recordFields(item));
            console.log(`  + CREATE [${id}] ${item.name} (${item.type === 'C' ? 'Captain' : 'Staff'})`);
            created++;
        }
    }

    // 3) If placeholders outnumber roster, delete leftovers.
    if (placeholders.length > ROSTER.length) {
        for (let i = pairs; i < placeholders.length; i++) {
            const ph = placeholders[i];
            await deleteDoc(ph.id);
            console.log(`  - DELETE [${ph.id}] leftover placeholder "${ph.name}"`);
            deleted++;
        }
    }

    console.log('');
    console.log(`Done. patched=${patched}, created=${created}, deleted=${deleted}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
