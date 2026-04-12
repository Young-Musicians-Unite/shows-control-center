// Seed synthetic guests for 5 tables' worth (mix of full table buys + GA assignments + a lounge).
// Run with: node scripts/seed_test_guests.js

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const TABLES_COLLECTION = 'seatingTables';
const GUESTS_COLLECTION = 'guests';

// 5 buckets of guests. Each picks a target table by label.
const SEED = [
    {
        targetLabel: 'Table 12',
        party: 'Castellano Family',
        guests: [
            ['Marco', 'Castellano', 'mcastellano@example.com'],
            ['Elena', 'Castellano', 'elena.c@example.com'],
            ['Sofia', 'Castellano', ''],
            ['Luca', 'Castellano', ''],
            ['Isabella', 'Romano', 'isa.romano@example.com'],
            ['Giovanni', 'Romano', ''],
            ['Maria', 'Bianchi', 'maria.b@example.com'],
            ['Antonio', 'Bianchi', ''],
            ['Chiara', 'Russo', 'chiara@example.com'],
            ['Alessandro', 'Russo', '']
        ]
    },
    {
        targetLabel: 'Table 25',
        party: 'Atian Spirits',
        guests: [
            ['James', 'Whitfield', 'jwhitfield@atian.com'],
            ['Olivia', 'Whitfield', ''],
            ['Daniel', 'Park', 'dpark@atian.com'],
            ['Hannah', 'Park', ''],
            ['Marcus', 'Kim', 'mkim@atian.com'],
            ['Jenny', 'Kim', ''],
            ['Robert', 'Chen', 'rchen@atian.com'],
            ['Lisa', 'Chen', ''],
            ['Andrew', 'Patel', 'apatel@atian.com'],
            ['Priya', 'Patel', '']
        ]
    },
    {
        targetLabel: 'Table 46',
        party: '',
        guests: [
            ['Sarah', 'Thompson', 'sthompson@example.com', 'GF'],
            ['David', 'Goldberg', 'dgoldberg@example.com', 'Vegetarian'],
            ['Rachel', 'Hayes', 'rhayes@example.com', ''],
            ['Michael', 'O\'Brien', 'mobrien@example.com', ''],
            ['Amanda', 'Lee', 'amlee@example.com', 'Nut allergy'],
            ['Christopher', 'Nguyen', 'cnguyen@example.com', ''],
            ['Emma', 'Schwartz', 'eschwartz@example.com', 'Vegan'],
            ['Tyler', 'Washington', 'twash@example.com', ''],
            ['Nicole', 'Reyes', 'nreyes@example.com', ''],
            ['Brandon', 'Foster', 'bfoster@example.com', '']
        ]
    },
    {
        targetLabel: 'Table 50',
        party: '',
        guests: [
            ['Jessica', 'Morrison', 'jmorrison@example.com', ''],
            ['Kevin', 'Sullivan', 'ksullivan@example.com', ''],
            ['Megan', 'Carter', 'mcarter@example.com', 'Pescatarian'],
            ['Eric', 'Hoffman', 'ehoffman@example.com', ''],
            ['Lauren', 'Mitchell', 'lmitchell@example.com', ''],
            ['Steven', 'Rodriguez', 'srod@example.com', ''],
            ['Ashley', 'Bennett', 'abennett@example.com', 'GF, Dairy-free'],
            ['Justin', 'Cooper', 'jcooper@example.com', ''],
            ['Rebecca', 'Singh', 'rsingh@example.com', ''],
            ['Nathan', 'Wagner', 'nwagner@example.com', '']
        ]
    },
    {
        targetLabel: 'Lounge 3',
        party: 'YMU Board of Directors',
        guests: [
            ['Patricia', 'Alvarez', 'palvarez@ymu.org'],
            ['Thomas', 'Greenfield', 'tgreen@ymu.org'],
            ['Diane', 'Kowalski', 'dkowalski@ymu.org'],
            ['Charles', 'Adebayo', 'cadebayo@ymu.org'],
            ['Nora', 'Vasquez', 'nvasquez@ymu.org'],
            ['Henry', 'Lindberg', 'hlindberg@ymu.org'],
            ['Yvonne', 'Tanaka', 'ytanaka@ymu.org'],
            ['Edward', 'Brennan', 'ebrennan@ymu.org'],
            ['Sandra', 'Petrov', 'spetrov@ymu.org'],
            ['Jonathan', 'Mensah', 'jmensah@ymu.org'],
            ['Vivian', 'Caldwell', 'vcaldwell@ymu.org'],
            ['Frederick', 'Olsen', 'folsen@ymu.org']
        ]
    }
];

async function listTables() {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${TABLES_COLLECTION}?pageSize=500&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const map = new Map();
    (data.documents || []).forEach(doc => {
        const label = doc.fields && doc.fields.label && doc.fields.label.stringValue;
        const id = doc.name.split('/').pop();
        if (label) map.set(label, id);
    });
    return map;
}

async function createGuest(guest) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${GUESTS_COLLECTION}?key=${API_KEY}`;
    const now = new Date().toISOString();
    const fields = {
        firstName: { stringValue: guest.firstName },
        lastName: { stringValue: guest.lastName },
        party: { stringValue: guest.party },
        tableId: { stringValue: guest.tableId },
        email: { stringValue: guest.email || '' },
        phone: { stringValue: guest.phone || '' },
        dietary: { stringValue: guest.dietary || '' },
        notes: { stringValue: guest.notes || '' },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now }
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) throw new Error(await res.text());
}

async function main() {
    console.log('Loading tables…');
    const tables = await listTables();
    console.log(`Found ${tables.size} tables.\n`);

    let total = 0, ok = 0, fail = 0;
    for (const bucket of SEED) {
        const tableId = tables.get(bucket.targetLabel);
        if (!tableId) {
            console.error(`✗ ${bucket.targetLabel} not found, skipping`);
            continue;
        }
        console.log(`→ ${bucket.targetLabel} (${bucket.guests.length} guests)`);
        for (const row of bucket.guests) {
            const [firstName, lastName, email = '', dietary = ''] = row;
            total++;
            try {
                await createGuest({
                    firstName, lastName, email, dietary,
                    party: bucket.party, tableId
                });
                console.log(`    ✓ ${firstName} ${lastName}`);
                ok++;
            } catch (err) {
                console.error(`    ✗ ${firstName} ${lastName}: ${err.message}`);
                fail++;
            }
        }
    }
    console.log(`\nDone. Created ${ok}/${total} (${fail} failed).`);
}

main();
