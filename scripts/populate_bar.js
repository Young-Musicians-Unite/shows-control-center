// Populate bar cocktail menu items into Firestore
// Run with: node scripts/populate_bar.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'menuItems';

const barItems = [
    // === SIGNATURE COCKTAILS ===
    {
        name: "Guajirita",
        description: "Blanco tequila, fresh lime juice, agave syrup, orange liqueur",
        category: "Bar",
        subcategory: "Signature Cocktails",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Tequila-based. Rocks, salt rim optional, lime wheel optional. Fully batch + pre-dilute.",
        sortOrder: 0
    },
    {
        name: "Veinte Años Sour",
        description: "Mezcal, pineapple juice, fresh lime juice, agave syrup",
        category: "Bar",
        subcategory: "Signature Cocktails",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Mezcal + pineapple. Rocks, no garnish. Fully batchable. Pineapple juice could be provided by Poppy Jacks.",
        sortOrder: 1
    },
    {
        name: "El Floridita Daiquiri",
        description: "White rum, fresh lime juice, maraschino liqueur, simple syrup",
        category: "Bar",
        subcategory: "Signature Cocktails",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Cuban classic, rum-based. Named after Hemingway's bar. Up or rocks, no garnish. Fully batch + pre-dilute, keep cold.",
        sortOrder: 2
    },
    {
        name: "Hierba Buena Mule",
        description: "Vodka, fresh lime juice, mint-infused simple syrup, ginger beer",
        category: "Bar",
        subcategory: "Signature Cocktails",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Vodka-based. Rocks, mint sprig optional. Batch vodka + lime + mint simple; ginger beer added at pour.",
        sortOrder: 3
    },
    {
        name: "Cachito Old Fashioned",
        description: "Aged rum or bourbon (guest choice), demerara syrup, orange bitters, dry vermouth",
        category: "Bar",
        subcategory: "Signature Cocktails",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Guest chooses bourbon or rum. Large cube if possible, orange peel. Fully batch including dilution.",
        sortOrder: 4
    },

    // === ALTERNATIVE COCKTAILS ===
    {
        name: "Tropicana Club",
        description: "White rum, fresh lime juice, mint-infused simple syrup, soda water",
        category: "Bar",
        subcategory: "Alternative Cocktails",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Rum-based. Rocks, lime wheel optional, no muddling. Batch rum + lime + mint simple; soda added at pour.",
        sortOrder: 0
    },

    // === SPONSOR FEATURE ===
    {
        name: "Atian Rosé Gin Spritz",
        description: "Atian Rosé Gin, elderflower liqueur, fresh lemon juice, prosecco or soda",
        category: "Bar",
        subcategory: "Sponsor Feature",
        servingStyle: "station",
        status: "pending",
        quantity: 0,
        dietaryTags: [],
        notes: "Optional sponsor feature — Sammy to confirm. Wine glass with ice, citrus slice optional. Batch gin + elderflower + lemon; top with bubbles at service.",
        sortOrder: 0
    },

    // === WINE ===
    {
        name: "White Wine",
        description: "",
        category: "Bar",
        subcategory: "Wine",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Provided by SG",
        sortOrder: 0
    },
    {
        name: "Red Wine",
        description: "",
        category: "Bar",
        subcategory: "Wine",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Provided by SG",
        sortOrder: 1
    }
];

async function createDocument(item) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}`;

    const now = new Date().toISOString();

    const fields = {
        name: { stringValue: item.name },
        description: { stringValue: item.description },
        category: { stringValue: item.category },
        subcategory: { stringValue: item.subcategory },
        servingStyle: { stringValue: item.servingStyle },
        status: { stringValue: item.status },
        quantity: { integerValue: String(item.quantity) },
        dietaryTags: { arrayValue: {} },
        notes: { stringValue: item.notes },
        sortOrder: { integerValue: String(item.sortOrder) },
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
        throw new Error(`Failed to create ${item.name}: ${err}`);
    }

    const result = await response.json();
    const docId = result.name.split('/').pop();
    return docId;
}

async function main() {
    console.log(`Populating ${barItems.length} bar items into Firestore...`);
    console.log('');

    for (const item of barItems) {
        try {
            const docId = await createDocument(item);
            console.log(`  ✓ Bar > ${item.subcategory} — ${item.name} (${docId})`);
        } catch (err) {
            console.error(`  ✗ ${item.name}: ${err.message}`);
        }
    }

    console.log('');
    console.log('Done!');
}

main();
