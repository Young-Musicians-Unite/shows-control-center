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

// Collection references
const collections = {
    vendors: db.collection('vendors'),
    budget: db.collection('budget'),
    timeline: db.collection('timeline'),
    mainStageInputs: db.collection('mainStageInputs'),
    cocktailStageInputs: db.collection('cocktailStageInputs'),
    staff: db.collection('staff'),
    eventInfo: db.collection('event-info'),
    stagePlots: db.collection('stagePlots'),
    venueMapLayers: db.collection('venueMapLayers'),
    setLists: db.collection('setLists'),
    packingList: db.collection('packingList'),
    menuItems: db.collection('menuItems'),
    printedMaterials: db.collection('printedMaterials')
};
