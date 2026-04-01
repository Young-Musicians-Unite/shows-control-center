// Populate printedMaterials collection in Firestore
// Run with: node scripts/populate_printed_materials.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'printedMaterials';

// Merged data: main list enriched with SAVQUICK detail where applicable
// Skipped: row 17 "Printing House - Miami" (header), row 18 (storage note),
// row 45 "Other vendors" (header), row 48 "SAVQUICK PRINTING" (header)
const items = [
    {
        name: "Pledge Cards (Updated QR Code)",
        quantity: "700",
        size: "",
        material: "",
        holder: "On Table",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "YMU Staff Only, Do Not Enter",
        quantity: "8",
        size: "11 x 17",
        material: "Matte 100pt paper",
        holder: "Tape on rear bathroom exits",
        vendor: "SavQuick Printing",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Welcome Signs",
        quantity: "2",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Bathroom Signs",
        quantity: "2",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Cocktail Bar Signs",
        quantity: "5",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Mocktails Sign",
        quantity: "1",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Coffee Station Sign",
        quantity: "1",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Photo Lounge Sign",
        quantity: "1",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Guest Check-In Sign",
        quantity: "2",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Silent Auction Sign",
        quantity: "1",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Artist & Vendor Check-In Sign",
        quantity: "2",
        size: "24 x 36",
        material: "",
        holder: "Tall 24x36 Stand",
        vendor: "",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Step and Repeat",
        quantity: "1",
        size: "176.5\" x 97.5\"",
        material: "Matte vinyl, grommets every 1 foot on all sides",
        holder: "Truss from LC Solutions",
        vendor: "SavQuick Printing",
        notes: "Deadline 4/8/2026",
        status: "pending"
    },
    {
        name: "Table Numbers (1-70)",
        quantity: "70",
        size: "5 x 7",
        material: "",
        holder: "",
        vendor: "Deco Productions",
        notes: "",
        status: "pending"
    },
    {
        name: "Seating Chart for Check-In Display",
        quantity: "2",
        size: "24 x 36",
        material: "Foam board",
        holder: "Taped to Check-In table",
        vendor: "SavQuick Printing",
        notes: "",
        status: "pending"
    },
    {
        name: "Seating Chart for Check-In Table",
        quantity: "15",
        size: "11 x 17",
        material: "Laminated",
        holder: "",
        vendor: "SavQuick Printing",
        notes: "Smaller version for check-in staff reference",
        status: "pending"
    },
    {
        name: "Table Menu",
        quantity: "700",
        size: "7.5 x 4.5",
        material: "Thick matte paper, 24pt or up",
        holder: "On Table",
        vendor: "SavQuick Printing",
        notes: "Due 4/14",
        status: "pending"
    },
    {
        name: "Bar Menu",
        quantity: "8",
        size: "8.5 x 11",
        material: "Thick matte paper, 24pt or up",
        holder: "On Table",
        vendor: "SavQuick Printing",
        notes: "Due 4/14",
        status: "pending"
    },
    {
        name: "Mocktail Menu",
        quantity: "15",
        size: "8.5 x 11",
        material: "",
        holder: "Acrylic Stand",
        vendor: "SavQuick Printing",
        notes: "",
        status: "pending"
    },
    {
        name: "Sponsor Roll-Up Banners",
        quantity: "4",
        size: "60 x 80",
        material: "Freestanding roll-up",
        holder: "Freestanding",
        vendor: "SavQuick Printing",
        notes: "Due 4/14. 2 designs: (1) Studio Exec/Platinum/Gold, (2) Silver/Bronze/InKind. 2 of each.",
        status: "pending"
    },
    {
        name: "Dessert Station Sign",
        quantity: "1",
        size: "24 x 36",
        material: "Foam board",
        holder: "Tall 24x36 Stand",
        vendor: "SavQuick Printing",
        notes: "Due 4/21",
        status: "pending"
    },
    {
        name: "Late Night Bites Sign",
        quantity: "1",
        size: "24 x 36",
        material: "Foam board",
        holder: "Tall 24x36 Stand",
        vendor: "SavQuick Printing",
        notes: "Due 4/21",
        status: "pending"
    },
    {
        name: "Programs (Run of Show)",
        quantity: "700",
        size: "8.5 x 11",
        material: "",
        holder: "On Table",
        vendor: "Calev",
        notes: "Due 4/14",
        status: "pending"
    },
    {
        name: "Silent Auction Room Display",
        quantity: "20+",
        size: "11 x 17",
        material: "",
        holder: "",
        vendor: "",
        notes: "",
        status: "pending"
    },
    {
        name: "Silent Auction Certificates",
        quantity: "20",
        size: "4 x 6",
        material: "Thick paper",
        holder: "",
        vendor: "SavQuick Printing",
        notes: "",
        status: "pending"
    },
    {
        name: "Silent Auction Items (Large)",
        quantity: "40 pending",
        size: "8.5 x 11",
        material: "Thick paper",
        holder: "Acrylic Stands",
        vendor: "SavQuick Printing",
        notes: "",
        status: "pending"
    },
    {
        name: "Silent Auction Items (Small)",
        quantity: "20",
        size: "4 x 6",
        material: "Thick paper",
        holder: "",
        vendor: "SavQuick Printing",
        notes: "",
        status: "pending"
    },
    {
        name: "LED Screens",
        quantity: "",
        size: "16x10 ft (small), 24x13 ft (big)",
        material: "Digital",
        holder: "",
        vendor: "",
        notes: "Sponsors, Mayor logo, videos, landmark number, cue sheet",
        status: "pending"
    },
    {
        name: "Numbered Paddles for Auction",
        quantity: "15",
        size: "6 x 8",
        material: "Sticker on plastic surface",
        holder: "",
        vendor: "SavQuick Printing",
        notes: "",
        status: "pending"
    },
    {
        name: "Backdrops for Video",
        quantity: "",
        size: "",
        material: "",
        holder: "",
        vendor: "",
        notes: "TBD",
        status: "pending"
    },
    {
        name: "Buttons",
        quantity: "",
        size: "1.25\"",
        material: "",
        holder: "",
        vendor: "StickerMule",
        notes: "",
        status: "pending"
    },
    {
        name: "Stickers",
        quantity: "",
        size: "2 x 2",
        material: "Matte die-cut",
        holder: "",
        vendor: "StickerMule",
        notes: "",
        status: "pending"
    },
    {
        name: "Video of Band Announcement",
        quantity: "",
        size: "",
        material: "Digital",
        holder: "",
        vendor: "",
        notes: "",
        status: "pending"
    },
    {
        name: "Print Logo for Kunia's Clipboard",
        quantity: "",
        size: "",
        material: "",
        holder: "",
        vendor: "",
        notes: "",
        status: "pending"
    },
    {
        name: "Silver Pens",
        quantity: "1300",
        size: "",
        material: "",
        holder: "",
        vendor: "",
        notes: "",
        status: "pending"
    },
    {
        name: "Bottle Labels (Poppy Jacks)",
        quantity: "1000",
        size: "",
        material: "",
        holder: "",
        vendor: "Poppy Jacks",
        notes: "Deadline 4/1/2026",
        status: "pending"
    },
    {
        name: "Magazines",
        quantity: "1500",
        size: "",
        material: "",
        holder: "Inside Tote Bags",
        vendor: "Calev",
        notes: "",
        status: "pending"
    },
    {
        name: "Envelope Size Certificates",
        quantity: "20",
        size: "",
        material: "",
        holder: "",
        vendor: "SavQuick Printing",
        notes: "",
        status: "pending"
    },
    {
        name: "Flags for Marching Band",
        quantity: "TBD",
        size: "TBD",
        material: "",
        holder: "",
        vendor: "",
        notes: "",
        status: "pending"
    }
];

// Firestore REST API helpers
async function deleteAllDocs() {
    const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}&pageSize=300`;
    const resp = await fetch(listUrl);
    const data = await resp.json();
    if (data.documents) {
        for (const doc of data.documents) {
            const delUrl = `https://firestore.googleapis.com/v1/${doc.name}?key=${API_KEY}`;
            await fetch(delUrl, { method: 'DELETE' });
        }
        console.log(`  Deleted ${data.documents.length} existing documents`);
    } else {
        console.log('  Collection empty, nothing to delete');
    }
}

async function createDocument(item, index) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}`;

    const fields = {
        name: { stringValue: item.name },
        quantity: { stringValue: item.quantity },
        size: { stringValue: item.size },
        material: { stringValue: item.material },
        holder: { stringValue: item.holder },
        vendor: { stringValue: item.vendor },
        fileLink: { stringValue: '' },
        notes: { stringValue: item.notes },
        status: { stringValue: item.status },
        sortOrder: { integerValue: String(index) }
    };

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
    return result.name.split('/').pop();
}

async function main() {
    console.log(`Importing ${items.length} printed materials into Firestore...`);
    console.log('');

    console.log('Clearing existing collection...');
    await deleteAllDocs();
    console.log('');

    console.log('Populating items...');
    for (let i = 0; i < items.length; i++) {
        try {
            const docId = await createDocument(items[i], i);
            const vendor = items[i].vendor ? ` [${items[i].vendor}]` : '';
            console.log(`  ✓ ${items[i].name}${vendor} (${docId})`);
        } catch (err) {
            console.error(`  ✗ ${items[i].name}: ${err.message}`);
        }
    }

    console.log('');
    console.log('Done!');
}

main();
