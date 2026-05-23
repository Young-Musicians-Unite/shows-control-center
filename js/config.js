// Firebase Configuration
// IMPORTANT: Replace these values with your actual Firebase project configuration
// You'll get these from the Firebase Console after creating your project

const firebaseConfig = {
    apiKey: "AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA",
    authDomain: "ymu-gala-2026.firebaseapp.com",
    projectId: "ymu-gala-2026",
    storageBucket: "ymu-gala-2026.firebasestorage.app",
    messagingSenderId: "415474744493",
    appId: "1:415474744493:web:17b8c3dfc5f1e4c2345a24"
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

// Note: offline persistence intentionally disabled — it blocks ALL Firestore operations
// until the IndexedDB lock is acquired, which hangs the hub when multiple tabs compete.

// Top-level events collection for the hub
const eventsCollection = db.collection('events');

// Per-event collection references — rebuilt by setActiveEvent() in app.js
let collections = {};

// Google Calendar OAuth — replace with your OAuth 2.0 Client ID from
// Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application)
// Authorized JavaScript origins must include: http://localhost:8745 and your GitHub Pages URL
const GOOGLE_CALENDAR_CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
