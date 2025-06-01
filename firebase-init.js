// firebase-init.js
// Este archivo maneja la inicialización de Firebase y la autenticación.

// Importar las funciones necesarias de Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variables globales proporcionadas por el entorno Canvas (MANDATORIO USAR)
// Estas variables son inyectadas por el entorno de ejecución de Canvas.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserId = null; // Variable para almacenar el UID del usuario actual

// Función para inicializar la autenticación
async function initAuth() {
    try {
        if (initialAuthToken) {
            // Si hay un token de autenticación personalizado, úsalo para iniciar sesión.
            await signInWithCustomToken(auth, initialAuthToken);
            console.log("Firebase: Sesión iniciada con token personalizado.");
        } else {
            // Si no hay token, inicia sesión de forma anónima.
            await signInAnonymously(auth);
            console.log("Firebase: Sesión iniciada anónimamente.");
        }
    } catch (error) {
        console.error("Firebase: Error al iniciar sesión:", error);
        // Aquí podrías mostrar un mensaje al usuario si la autenticación falla.
    }
}

// Listener para el estado de autenticación
// Esto se ejecutará cada vez que el estado de autenticación cambie (inicio de sesión, cierre de sesión).
onAuthStateChanged(auth, (user) => {
    if (user) {
        // El usuario ha iniciado sesión.
        currentUserId = user.uid;
        console.log("Firebase: Usuario autenticado. UID:", currentUserId);
        // Mostrar el UID en la UI (MANDATORIO para apps multi-usuario)
        const userIdDisplay = document.getElementById('userIdDisplay');
        if (userIdDisplay) {
            userIdDisplay.textContent = `User ID: ${currentUserId}`;
        }
        // Notificar a app.js que el usuario está listo para operaciones de Firestore
        // Esto se hará a través de un evento personalizado o simplemente exportando las variables.
        // En este caso, app.js importará db, auth y userId y esperará que userId esté disponible.
    } else {
        // El usuario ha cerrado sesión o no está autenticado.
        currentUserId = null;
        console.log("Firebase: Usuario no autenticado.");
        const userIdDisplay = document.getElementById('userIdDisplay');
        if (userIdDisplay) {
            userIdDisplay.textContent = 'User ID: N/A (Anonymous)';
        }
    }
});

// Iniciar el proceso de autenticación cuando el DOM esté completamente cargado.
document.addEventListener('DOMContentLoaded', initAuth);

// Exportar las instancias de Firestore y Auth para ser usadas en otros módulos.
// También exportamos una función para obtener el userId, asegurando que esté disponible
// después de la autenticación.
export { db, auth };

// Función para obtener el userId, que esperará hasta que esté disponible.
// Esto es útil si otras partes de la aplicación necesitan el userId inmediatamente
// después de la carga, pero la autenticación puede tardar un poco.
export async function getUserId() {
    return new Promise(resolve => {
        if (currentUserId) {
            resolve(currentUserId);
        } else {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                if (user) {
                    unsubscribe(); // Deja de escuchar una vez que el usuario está autenticado
                    resolve(user.uid);
                }
            });
        }
    });
}

/**
 * Reglas de seguridad de Firestore (Ejemplo conceptual):
 *
 * service cloud.firestore {
 * match /databases/{database}/documents {
 *
 * // Datos públicos: accesibles por cualquier usuario autenticado
 * // Colección: /artifacts/{appId}/public/data/{your_collection_name}
 * // Documento: /artifacts/{appId}/public/data/{your_collection_name}/{documentId}
 * match /artifacts/{appId}/public/data/{collection}/{documentId} {
 * allow read, write: if request.auth != null;
 * }
 *
 * // Datos privados: accesibles solo por el propietario
 * // Colección: /artifacts/{appId}/users/{userId}/{your_collection_name}
 * // Documento: /artifacts/{appId}/users/{userId}/{your_collection_name}/{documentId}
 * match /artifacts/{appId}/users/{userId}/{collection}/{documentId} {
 * allow read, write: if request.auth != null && request.auth.uid == userId;
 * }
 * }
 * }
 *
 * Para esta aplicación, las playlists se almacenarán en:
 * /artifacts/{appId}/users/{userId}/playlists/{playlistId}
 */
