// Firebase Configuration
// Sandbox project for the reusable multi-show platform ("Shows Control Center").
// SEPARATE from the production gala project (ymu-gala-2026) — safe to develop against.

const firebaseConfig = {
    apiKey: "AIzaSyDmLpNKt2fT8KDITAQ5U1sHFgNQ2qdbrsw",
    authDomain: "shows-control-center.firebaseapp.com",
    projectId: "shows-control-center",
    storageBucket: "shows-control-center.firebasestorage.app",
    messagingSenderId: "159890194451",
    appId: "1:159890194451:web:219e8ee71b94dfa61dffe6"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase:', error);
}

// Initialize Firestore
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

// Note: offline persistence intentionally disabled — it blocks ALL Firestore operations
// until the IndexedDB lock is acquired, which hangs the hub when multiple tabs compete.

// Top-level events collection for the hub
const eventsCollection = db.collection('events');

// Accounts, roles, and the admin activity/audit log
const usersCollection = db.collection('users');
const activityLogCollection = db.collection('activityLog');

// Per-event collection references — rebuilt by setActiveEvent() in app.js
let collections = {};

// Google Calendar OAuth — replace with your OAuth 2.0 Client ID from
// Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application)
// Authorized JavaScript origins must include: http://localhost:8745 and your GitHub Pages URL
const GOOGLE_CALENDAR_CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
