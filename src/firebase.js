import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCpXQCKYbc5fm7dhR0kvjFiKZIaI3R_e7A",
  authDomain: "wrg2026-4d291.firebaseapp.com",
  projectId: "wrg2026-4d291",
  storageBucket: "wrg2026-4d291.firebasestorage.app",
  messagingSenderId: "425132697799",
  appId: "1:425132697799:web:ff121ec86ba575a21b76e2",
  measurementId: "G-6QL1M2BENX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
