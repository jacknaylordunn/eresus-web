import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase configuration - these should be set as environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyApZm9LsylboePKP85bKe8x6RayZKbWneI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "eresus-6e65e.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "eresus-6e65e",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "eresus-6e65e.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "118352301751",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:118352301751:web:22d9d6d5cae48b979e8732",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-H2H7SMTZK7"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
