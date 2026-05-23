import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyALenyx9KTCccGSKPDtLeKU7TvikUvfow0",
  authDomain: "mantexa-db.firebaseapp.com",
  projectId: "mantexa-db",
  storageBucket: "mantexa-db.firebasestorage.app",
  messagingSenderId: "888179293900",
  appId: "1:888179293900:web:2c236da14b9062caabcc69"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);