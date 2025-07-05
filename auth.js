// auth.js - Módulo de Autenticación de Google y API de YouTube (Versión Corregida)

const CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';

let tokenClient;

// --- CORRECCIÓN 1: Flags para controlar la carga de las APIs ---
// Usaremos estos flags para asegurarnos de que ambas librerías están listas
// antes de intentar usarlas. Esto soluciona la "condición de carrera".
let gapiReady = false;
let gisReady = false;

// --- Helper para el spinner (sin cambios) ---
function showLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.classList.remove('hidden');
    }
}

function hideLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.classList.add('hidden');
    }
}


// --- FUNCIONES PRINCIPALES ---

async function getPlaylists() {
    showLoadingSpinner();
    try {
        let allPlaylists = [];
        let nextPageToken = null;
        do {
            const response = await gapi.client.youtube.playlists.list({
                'part': ['snippet', 'contentDetails'],
                'mine': true,
                'maxResults': 50,
                'pageToken': nextPageToken
            });
            if (response.result.items) {
                allPlaylists = allPlaylists.concat(response.result.items);
            }
            nextPageToken = response.result.nextPageToken;
        } while (nextPageToken);

        document.dispatchEvent(new CustomEvent('playlistsFetched', { detail: allPlaylists }));

    } catch (err) {
        console.error("Error al obtener playlists de YouTube:", err);
        updateUI(false);
    } finally {
        hideLoadingSpinner();
    }
}

// --- CORRECCIÓN 2: Modificar updateUI para no ocultar toda la sidebar ---
// Ahora solo ocultará/mostrará los botones y el contenedor de la playlist,
// pero la sidebar y el botón de login siempre estarán visibles cuando no estás logueado.
function updateUI(isLoggedIn) {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');
    const playlistContainer = document.getElementById('playlistContainer'); // El contenedor de las listas

    if (isLoggedIn) {
        if (signInButton) signInButton.classList.add('hidden');
        if (signOutButton) signOutButton.classList.remove('hidden');
        if (playlistContainer) playlistContainer.classList.remove('hidden'); // Muestra las playlists
    } else {
        if (signInButton) signInButton.classList.remove('hidden');
        if (signOutButton) signOutButton.classList.add('hidden');
        // No ocultamos toda la sidebar, solo limpiamos el contenedor de playlists si es necesario.
        // La limpieza se hará desde app.js al recibir el evento de logout.
    }
}


// Callback que se ejecuta cuando se obtiene un token (sin cambios)
async function tokenResponseCallback(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        gapi.client.setToken(tokenResponse);
        console.log("Acceso concedido. Token:", tokenResponse.access_token);
        updateUI(true);
        await getPlaylists();
    } else {
        console.error("No se obtuvo el token de acceso o la autenticación fue denegada.");
        updateUI(false);
    }
}

// Función de inicialización de GIS (Google Identity Services)
function gisInitalize() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: tokenResponseCallback,
    });
    console.log("GIS client initialized.");
    gisReady = true; // Marcar GIS como listo
    tryStartApp(); // Intentar arrancar la app
}

// Función de inicialización de GAPI (Google API Client)
function gapiInitialize() {
    gapi.load('client', () => {
        gapi.client.init({}).then(() => {
            return gapi.client.load('https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest');
        }).then(() => {
            console.log("GAPI client for YouTube loaded.");
            gapiReady = true; // Marcar GAPI como listo
            tryStartApp(); // Intentar arrancar la app
        }).catch(err => {
            console.error("Error inicializando GAPI client", err);
        });
    });
}

// --- CORRECCIÓN 3: Nueva función para arrancar la app de forma segura ---
// Esta función solo se ejecutará cuando AMBAS librerías (GAPI y GIS) estén listas.
function tryStartApp() {
    if (gapiReady && gisReady) {
        console.log("Ambas APIs de Google están listas. Comprobando estado de autenticación.");
        // Ahora que sabemos que todo está listo, podemos llamar a checkAuthStatus
        checkAuthStatus();
    }
}


// --- CORRECCIÓN 4: Modificar checkAuthStatus para NO iniciar login automático ---
// Esta función ahora solo comprobará si ya existe un token. No intentará loguear al usuario.
function checkAuthStatus() {
    // gapi.client.getToken() ya no dará error porque esta función solo se llama
    // desde tryStartApp(), que garantiza que gapi.client está inicializado.
    const token = gapi.client.getToken();
    if (token && token.access_token) {
        // Si ya tenemos un token, actualizamos la UI y cargamos las playlists
        console.log("Autenticación verificada: token existente y válido.");
        updateUI(true);
        getPlaylists();
    } else {
        // Si NO hay token, simplemente actualizamos la UI al estado "no logueado".
        // Ya NO intentamos la re-autenticación silenciosa.
        console.log("No hay token activo. Mostrando botón de inicio de sesión.");
        updateUI(false);
    }
}

// Manejador del clic en el botón de inicio de sesión (sin cambios)
// Este es ahora el ÚNICO lugar que inicia el popup de login.
function handleAuthClick() {
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
}

// Manejador del clic en el botón de cerrar sesión (sin cambios)
function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            console.log('Token revocado y sesión cerrada.');
            updateUI(false);
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
        });
    }
}

// Añadir listeners a los botones (sin cambios)
document.addEventListener('DOMContentLoaded', () => {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');

    if (signInButton) {
        signInButton.addEventListener('click', handleAuthClick);
    }
    if (signOutButton) {
        signOutButton.addEventListener('click', handleSignOutClick);
    }
    
    // Al inicio, la UI se muestra en estado "no logueado" por defecto.
    // checkAuthStatus() se encargará de cambiarla si encuentra un token.
    updateUI(false);
});
