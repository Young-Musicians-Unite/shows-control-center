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

// Enable offline persistence so edits keep working during WiFi drops
// and sync automatically when the connection returns.
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence unavailable: multiple tabs open without synchronizeTabs support.');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence unsupported in this browser.');
    } else {
        console.error('Firestore persistence error:', err);
    }
});

// Top-level events collection for the hub
const eventsCollection = db.collection('events');

// Per-event collection references — rebuilt by setActiveEvent() in app.js
let collections = {};
