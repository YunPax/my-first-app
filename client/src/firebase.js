import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBvrx8FVLSjNmqq904MfxZ5w0xhnGOIJIo",
  authDomain: "moveset-maker.firebaseapp.com",
  projectId: "moveset-maker",
  storageBucket: "moveset-maker.firebasestorage.app",
  messagingSenderId: "828420975015",
  appId: "1:828420975015:web:2d6eebb6c24495eb7fee82",
  measurementId: "G-CVSVMGBFKG"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
