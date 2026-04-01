// Populate menuItems collection in Firestore
// Run with: node scripts/populate_menu.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'menuItems';

const menuItems = [
    // === PASSED HORS D'OEUVRES ===
    {
        name: "Pineapple Havana Minis",
        description: "Pineapple mostarda",
        category: "Passed Hors d'Oeuvres",
        subcategory: "",
        servingStyle: "passed",
        status: "confirmed",
        quantity: 850,
        dietaryTags: [],
        notes: "Select 3 hors d'oeuvres — all 3 confirmed",
        sortOrder: 0
    },
    {
        name: "Butternut Squash Crispy Rice",
        description: "Truffle agave, wasabi aioli, soy glaze, micro cilantro",
        category: "Passed Hors d'Oeuvres",
        subcategory: "",
        servingStyle: "passed",
        status: "confirmed",
        quantity: 850,
        dietaryTags: ["VG"],
        notes: "Select 3 hors d'oeuvres — all 3 confirmed",
        sortOrder: 1
    },
    {
        name: "Short Rib Empanada",
        description: "Cilantro aioli, served in cigar box",
        category: "Passed Hors d'Oeuvres",
        subcategory: "",
        servingStyle: "passed",
        status: "confirmed",
        quantity: 850,
        dietaryTags: [],
        notes: "Select 3 hors d'oeuvres — all 3 confirmed",
        sortOrder: 2
    },

    // === SEATED DINNER — SALAD ===
    {
        name: "Artisan Romaine Caesar Salad",
        description: "Artisan romaine, fried caper caesar dressing, tomato salad, shaved parmesan, focaccia crostini",
        category: "Seated Dinner",
        subcategory: "Salad",
        servingStyle: "plated",
        status: "confirmed",
        quantity: 850,
        dietaryTags: ["V"],
        notes: "First course, pre-set",
        sortOrder: 0
    },
    {
        name: "Bread Basket",
        description: "Artisan & rustic loaves, Vermont butter",
        category: "Seated Dinner",
        subcategory: "Salad",
        servingStyle: "family-style",
        status: "confirmed",
        quantity: 850,
        dietaryTags: ["V"],
        notes: "Served during salad course",
        sortOrder: 1
    },

    // === SEATED DINNER — MAIN COURSE ===
    {
        name: "Chicken Plancha",
        description: "Organic brined chicken breast, fregola pilaf, asparagus, green chickpeas, eggplant agridulce, yellow tomato vinaigrette",
        category: "Seated Dinner",
        subcategory: "Main Course",
        servingStyle: "plated",
        status: "confirmed",
        quantity: 850,
        dietaryTags: [],
        notes: "",
        sortOrder: 0
    },
    {
        name: "Coconut Crusted Tofu",
        description: "Lemongrass coconut curry sauce, red rice",
        category: "Seated Dinner",
        subcategory: "Main Course",
        servingStyle: "plated",
        status: "confirmed",
        quantity: 0,
        dietaryTags: ["GF", "VG"],
        notes: "Silent course — available upon request only. Do NOT include on printed menu.",
        sortOrder: 1
    },

    // === SEATED DINNER — DESSERT ===
    {
        name: "Dark Chocolate & Burnt Caramel Tart",
        description: "Sea salt",
        category: "Seated Dinner",
        subcategory: "Dessert",
        servingStyle: "passed",
        status: "confirmed",
        quantity: 850,
        dietaryTags: [],
        notes: "Tray passed dessert. Courtesy of Mena Catering.",
        sortOrder: 0
    },
    {
        name: "Guava & Cheese Macarons",
        description: "",
        category: "Seated Dinner",
        subcategory: "Dessert",
        servingStyle: "passed",
        status: "confirmed",
        quantity: 850,
        dietaryTags: [],
        notes: "Tray passed dessert. Courtesy of Mena Catering.",
        sortOrder: 1
    },
    {
        name: "Dipped Cheesecake Bite",
        description: "Dulce de leche, coconut coating",
        category: "Seated Dinner",
        subcategory: "Dessert",
        servingStyle: "passed",
        status: "confirmed",
        quantity: 850,
        dietaryTags: [],
        notes: "Tray passed dessert. Courtesy of Mena Catering.",
        sortOrder: 2
    },

    // === LATE NIGHT BITES ===
    {
        name: "Crispy Fries",
        description: "Parmesan truffle & plain",
        category: "Late Night Bites",
        subcategory: "",
        servingStyle: "passed",
        status: "confirmed",
        quantity: 350,
        dietaryTags: ["V", "GF"],
        notes: "",
        sortOrder: 0
    },
    {
        name: "Crispy Chicken Slider",
        description: "Spiked maple syrup, buttermilk ranch, pickles, brioche bun, maldon salt",
        category: "Late Night Bites",
        subcategory: "",
        servingStyle: "passed",
        status: "confirmed",
        quantity: 350,
        dietaryTags: [],
        notes: "",
        sortOrder: 1
    },

    // === BAR — SIGNATURE COCKTAILS ===
    {
        name: "Veinte Años Sour",
        description: "Mezcal or tequila, pineapple juice, fresh lime juice, agave syrup",
        category: "Bar",
        subcategory: "Signature Cocktails",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: ["Mocktail"],
        notes: "Guest chooses mezcal or tequila. Mocktail available. Rocks, no garnish. Fully batchable. Pineapple juice could be provided by Poppy Jacks.",
        sortOrder: 0
    },
    {
        name: "Hierba Buena Mule",
        description: "Vodka, fresh lime juice, mint-infused simple syrup, ginger beer",
        category: "Bar",
        subcategory: "Signature Cocktails",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: ["Mocktail"],
        notes: "Vodka-based. Mocktail available. Rocks, mint sprig optional. Batch vodka + lime + mint simple; ginger beer added at pour.",
        sortOrder: 1
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
        sortOrder: 2
    },

    // === BAR — SPONSOR FEATURE ===
    {
        name: "Atian Rosé Gin Spritz",
        description: "Atian Rosé Gin, elderflower liqueur, fresh lemon juice, prosecco or soda",
        category: "Bar",
        subcategory: "Sponsor Feature",
        servingStyle: "station",
        status: "confirmed",
        quantity: 0,
        dietaryTags: [],
        notes: "Confirmed sponsor feature. Wine glass with ice, citrus slice optional. Batch gin + elderflower + lemon; top with bubbles at service.",
        sortOrder: 0
    },

    // === BAR — WINE ===
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
    },

    // === BAR — NON-ALCOHOLIC ===
    {
        name: "Non-Alcoholic Beverage Package",
        description: "Soft drinks, sparkling water, still water, mixers, juices, bar fruit, ice",
        category: "Bar",
        subcategory: "Non-Alcoholic",
        servingStyle: "station",
        status: "confirmed",
        quantity: 850,
        dietaryTags: [],
        notes: "Provided by Constellation Culinary Group",
        sortOrder: 0
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
        dietaryTags: { arrayValue: { values: item.dietaryTags.map(t => ({ stringValue: t })) } },
        notes: { stringValue: item.notes },
        sortOrder: { integerValue: String(item.sortOrder) },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now }
    };

    // Handle empty array
    if (item.dietaryTags.length === 0) {
        fields.dietaryTags = { arrayValue: {} };
    }

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
    console.log(`Populating ${menuItems.length} menu items into Firestore...`);
    console.log('');

    for (const item of menuItems) {
        try {
            const docId = await createDocument(item);
            console.log(`  ✓ ${item.category}${item.subcategory ? ' > ' + item.subcategory : ''} — ${item.name} (${docId})`);
        } catch (err) {
            console.error(`  ✗ ${item.name}: ${err.message}`);
        }
    }

    console.log('');
    console.log('Done!');
}

main();
