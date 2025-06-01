// firebase-init.js (ejemplo con más logs)
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

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
        // Si el usuario es anónimo, asegúrate de que el UID sea persistente
        if (user.isAnonymous && !localStorage.getItem('anonUid')) {
            localStorage.setItem('anonUid', user.uid);
        }
        if (userIdDisplay) {
            userIdDisplay.textContent = `User ID: ${user.uid}`;
        }

        // Aquí es donde llamas a la función de inicialización en app.js
        // Asegúrate de que window.initFirebase esté disponible.
        if (window.initFirebase) {
            console.log('firebase-init.js: Llamando a window.initFirebase...');
            window.initFirebase(db, auth, user);
        } else {
            console.warn('firebase-init.js: window.initFirebase NO ESTÁ DEFINIDO aún.');
            // Esto podría indicar un problema de orden de carga de scripts o de tipo module.
            // Podrías añadir un pequeño retraso o un observador aquí si fuera persistente.
        }
    } else {
        console.log('firebase-init.js: No hay usuario autenticado. Intentando autenticación anónima...');
        // Intenta cargar el UID persistente o autenticar de forma anónima
        const storedUid = localStorage.getItem('anonUid');
        if (storedUid) {
            // Si tienes un UID anónimo almacenado, puedes intentar reusarlo
            // Sin embargo, Firebase Auth maneja la persistencia automáticamente
            // para usuarios anónimos. Si llegan aquí y storedUid existe,
            // significa que la sesión anterior no se ha reestablecido
            // o que la cookie/localstorage fue borrada.
            // Lo más seguro es intentar signInAnonymously.
             console.log('firebase-init.js: UID anónimo almacenado encontrado, intentando usarlo:', storedUid);
        }
        try {
            const credential = await signInAnonymously(auth);
            console.log('firebase-init.js: Autenticación anónima exitosa:', credential.user.uid);
            if (userIdDisplay) {
                userIdDisplay.textContent = `User ID: ${credential.user.uid}`;
            }
             // Esto debería disparar un nuevo onAuthStateChanged con el usuario ya autenticado
             // y luego llamar a window.initFirebase.
        } catch (error) {
            console.error('firebase-init.js: Error en autenticación anónima:', error);
            if (userIdDisplay) {
                userIdDisplay.textContent = `Error User ID: ${error.message}`;
            }
        }
    }
});

console.log('firebase-init.js: Finalizando script de inicialización.');
