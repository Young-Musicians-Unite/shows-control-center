// One-off: set description for White Wine / Red Wine menu items.
// Run with: node scripts/update_wine_descriptions.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'menuItems';

const updates = {
    'White Wine': 'Tribute Chardonnay',
    'Red Wine': 'Kenwood Cabernet'
};

async function listDocs() {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}&pageSize=300`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`List failed: ${await res.text()}`);
    const data = await res.json();
    return data.documents || [];
}

async function patchDescription(docName, description) {
    const docId = docName.split('/').pop();
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}/${docId}?key=${API_KEY}&updateMask.fieldPaths=description&updateMask.fieldPaths=updatedAt`;
    const body = {
        fields: {
            description: { stringValue: description },
            updatedAt: { timestampValue: new Date().toISOString() }
        }
    };
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Patch failed for ${docId}: ${await res.text()}`);
    return docId;
}

async function main() {
    const docs = await listDocs();
    const matches = docs.filter(d => {
        const name = d.fields?.name?.stringValue;
        const subcat = d.fields?.subcategory?.stringValue;
        const cat = d.fields?.category?.stringValue;
        return cat === 'Bar' && subcat === 'Wine' && updates[name] !== undefined;
    });

    if (matches.length === 0) {
        console.log('No matching White Wine / Red Wine docs found.');
        return;
    }

    for (const doc of matches) {
        const name = doc.fields.name.stringValue;
        const desc = updates[name];
        const id = await patchDescription(doc.name, desc);
        console.log(`  ✓ ${name} → "${desc}" (${id})`);
    }
    console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
