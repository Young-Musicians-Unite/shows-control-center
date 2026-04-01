// Populate setLists collection in Firestore
// Run with: node scripts/populate_setlists.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'setLists';

const setLists = [
    {
        performer: "Avalanche",
        stage: "main",
        songs: [
            { title: "La Vida Es Un Carnaval", duration: "", notes: "" },
            { title: "Respect", duration: "", notes: "" },
            { title: "Proud Mary", duration: "", notes: "" },
            { title: "I Will Survive", duration: "", notes: "" }
        ],
        estimatedDuration: "",
        generalNotes: ""
    },
    {
        performer: "Miami Beach Rock Ensemble",
        stage: "main",
        songs: [
            { title: "Smooth", duration: "", notes: "Santana" },
            { title: "La Copa de la Vida", duration: "", notes: "Ricky Martin" },
            { title: "Havana", duration: "", notes: "Camila Cabello" },
            { title: "September", duration: "", notes: "" },
            { title: "Ain't Nobody", duration: "", notes: "" },
            { title: "Get Down Tonight", duration: "", notes: "" },
            { title: "Don't Stop 'Til You Get Enough", duration: "", notes: "" },
            { title: "Groove Is in the Heart", duration: "", notes: "" }
        ],
        estimatedDuration: "",
        generalNotes: ""
    },
    {
        performer: "Undercover",
        stage: "main",
        songs: [
            { title: "Rhythm Is Gonna Get You Down", duration: "", notes: "" },
            { title: "Let's Get Loud", duration: "", notes: "" },
            { title: "Vivir Mi Vida", duration: "", notes: "" },
            { title: "Hips Don't Lie", duration: "", notes: "" },
            { title: "In the Stone", duration: "", notes: "" },
            { title: "Let's Groove", duration: "", notes: "" },
            { title: "P.Y.T.", duration: "", notes: "" },
            { title: "Fame", duration: "", notes: "" },
            { title: "Whenever, Wherever", duration: "", notes: "" },
            { title: "On the Floor", duration: "", notes: "" },
            { title: "I Know You Want Me", duration: "", notes: "" },
            { title: "Give Me Everything", duration: "", notes: "" },
            { title: "24K Magic", duration: "", notes: "" },
            { title: "Uptown Funk Medley", duration: "", notes: "" }
        ],
        estimatedDuration: "",
        generalNotes: ""
    },
    {
        performer: "YMPA Jazz Band",
        stage: "main",
        songs: [
            { title: "Oye Como Va", duration: "", notes: "" },
            { title: "Sir Duke", duration: "", notes: "" }
        ],
        estimatedDuration: "",
        generalNotes: ""
    },
    {
        performer: "Jazz Collective",
        stage: "main",
        songs: [
            { title: "Sway", duration: "", notes: "Michael Bublé version" }
        ],
        estimatedDuration: "",
        generalNotes: ""
    },
    {
        performer: "Not Yet Published",
        stage: "main",
        songs: [
            { title: "Corazón Espinado", duration: "", notes: "Santana & Maná" },
            { title: "It's Raining Men", duration: "", notes: "" },
            { title: "Voulez-Vous", duration: "", notes: "" },
            { title: "You Give Love a Bad Name", duration: "", notes: "" },
            { title: "Bad Girls", duration: "", notes: "" }
        ],
        estimatedDuration: "",
        generalNotes: ""
    }
];

function songToFirestoreMap(song) {
    return {
        mapValue: {
            fields: {
                title: { stringValue: song.title },
                duration: { stringValue: song.duration },
                notes: { stringValue: song.notes }
            }
        }
    };
}

async function deleteAllDocuments() {
    const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}&pageSize=100`;
    const response = await fetch(listUrl);
    const data = await response.json();

    if (!data.documents || data.documents.length === 0) {
        console.log('No existing set lists to delete.');
        return;
    }

    console.log(`Deleting ${data.documents.length} existing set list(s)...`);

    for (const doc of data.documents) {
        const deleteUrl = `https://firestore.googleapis.com/v1/${doc.name}?key=${API_KEY}`;
        const res = await fetch(deleteUrl, { method: 'DELETE' });
        if (!res.ok) {
            console.error(`  ✗ Failed to delete ${doc.name}`);
        } else {
            const docId = doc.name.split('/').pop();
            console.log(`  ✓ Deleted ${docId}`);
        }
    }
}

async function createDocument(item) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}`;
    const now = new Date().toISOString();

    const songsArray = item.songs.map(songToFirestoreMap);

    const fields = {
        performer: { stringValue: item.performer },
        stage: { stringValue: item.stage },
        songs: { arrayValue: { values: songsArray } },
        estimatedDuration: { stringValue: item.estimatedDuration },
        generalNotes: { stringValue: item.generalNotes },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to create ${item.performer}: ${err}`);
    }

    const result = await response.json();
    return result.name.split('/').pop();
}

async function main() {
    // Step 1: Delete all existing set lists
    await deleteAllDocuments();
    console.log('');

    // Step 2: Add new set lists
    console.log(`Adding ${setLists.length} set lists...`);
    for (const item of setLists) {
        try {
            const docId = await createDocument(item);
            console.log(`  ✓ ${item.performer} — ${item.songs.length} song(s) (${docId})`);
        } catch (err) {
            console.error(`  ✗ ${item.performer}: ${err.message}`);
        }
    }

    console.log('');
    console.log('Done!');
}

main();
