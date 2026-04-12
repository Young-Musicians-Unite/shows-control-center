// One-shot: shift every seatingTables doc's `y` upward by SHIFT.
// Run with: node scripts/shift_seating_y.js [shiftFraction]
// Default shift is 0.05 (5% of canvas height upward).

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'seatingTables';
const SHIFT = parseFloat(process.argv[2] || '0.05');

async function listAll() {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?pageSize=500&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return (data.documents || []).map(d => ({
        name: d.name,
        id: d.name.split('/').pop(),
        label: d.fields && d.fields.label && d.fields.label.stringValue,
        y: d.fields && d.fields.y && parseFloat(d.fields.y.doubleValue || d.fields.y.integerValue || 0)
    }));
}

async function updateY(id, newY) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}/${id}?updateMask.fieldPaths=y&updateMask.fieldPaths=updatedAt&key=${API_KEY}`;
    const body = {
        fields: {
            y: { doubleValue: newY },
            updatedAt: { timestampValue: new Date().toISOString() }
        }
    };
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
}

async function main() {
    console.log(`Shifting all ${COLLECTION} y values by -${SHIFT}…\n`);
    const docs = await listAll();
    let ok = 0, fail = 0;
    for (const d of docs) {
        if (typeof d.y !== 'number' || Number.isNaN(d.y)) { fail++; continue; }
        const newY = Math.max(0, Math.min(1, d.y - SHIFT));
        try {
            await updateY(d.id, newY);
            console.log(`  ✓ ${d.label}: ${d.y.toFixed(3)} → ${newY.toFixed(3)}`);
            ok++;
        } catch (err) {
            console.error(`  ✗ ${d.label}: ${err.message}`);
            fail++;
        }
    }
    console.log(`\nDone. Updated ${ok}, failed ${fail}.`);
}

main();
