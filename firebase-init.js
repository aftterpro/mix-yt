// firebase-init.js
// Importaciones de Firebase desde CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';


  const firebaseConfig = {
    apiKey: "AIzaSyBR4S1h0RJX42Ki4xgzPJDrbl-Lp094kFU",
    authDomain: "yt-crossmix-app.firebaseapp.com",
    projectId: "yt-crossmix-app",
    storageBucket: "yt-crossmix-app.firebasestorage.app",
    messagingSenderId: "697969666949",
    appId: "1:697969666949:web:e49bfec9ffef531264f2ec",
    measurementId: "G-DNC74HF2MD"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const userIdDisplay = document.getElementById('userIdDisplay');

console.log('firebase-init.js: Iniciando monitoreo de estado de autenticación...');
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log('firebase-init.js: Usuario autenticado:', user.uid);
        if (user.isAnonymous && !localStorage.getItem('anonUid')) {
            localStorage.setItem('anonUid', user.uid);
        }
        if (userIdDisplay) {
            userIdDisplay.textContent = `User ID: ${user.uid}`;
        }

        if (window.initFirebase) {
            console.log('firebase-init.js: Llamando a window.initFirebase...');
            window.initFirebase(db, auth, user);
        } else {
            console.warn('firebase-init.js: window.initFirebase NO ESTÁ DEFINIDO aún.');
        }
    } else {
        console.log('firebase-init.js: No hay usuario autenticado. Intentando autenticación anónima...');
        try {
            const credential = await signInAnonymously(auth);
            console.log('firebase-init.js: Autenticación anónima exitosa:', credential.user.uid);
            if (userIdDisplay) {
                userIdDisplay.textContent = `User ID: ${credential.user.uid}`;
            }
        } catch (error) {
            console.error('firebase-init.js: Error en autenticación anónima:', error);
            if (userIdDisplay) {
                userIdDisplay.textContent = `Error User ID: ${error.message}`;
            }
        }
    }
});

console.log('firebase-init.js: Finalizando script de inicialización.');
