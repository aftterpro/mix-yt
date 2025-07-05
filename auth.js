// auth.js - Módulo de Autenticación de Google y API de YouTube

const CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';

let tokenClient;
let authReady = false; // Flag para saber si GAPI y GIS están listos para la autenticación

// --- Helper para el spinner (Definidas aquí para que auth.js las pueda usar) ---
// Idealmente, estas podrían estar en un archivo de utilidades compartido.
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

// Función para obtener las playlists del usuario
async function getPlaylists() {
    showLoadingSpinner(); // Muestra el spinner al iniciar la carga
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

        // Dispara un evento personalizado para que app.js actualice la UI
        document.dispatchEvent(new CustomEvent('playlistsFetched', { detail: allPlaylists }));

    } catch (err) {
        console.error("Error al obtener playlists de YouTube:", err);
        // Si hay un error, actualiza la UI para reflejar el estado no autenticado
        updateUI(false);
        // Aquí podrías añadir una función para mostrar un mensaje flotante de error
        // por ejemplo: mostrarMensajeFlotante("Error al cargar playlists. Es posible que necesites iniciar sesión de nuevo.");
    } finally {
        hideLoadingSpinner(); // Oculta el spinner al finalizar
    }
}

// Actualiza la visibilidad de los botones de autenticación y el contenido principal
function updateUI(isLoggedIn) {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');
    const mainContentWrapper = document.querySelector('.main-content-wrapper');
    const sidebar = document.querySelector('.sidebar');
    const contentArea = document.querySelector('.content-area');

    if (isLoggedIn) {
        if (signInButton) signInButton.classList.add('hidden');
        if (signOutButton) signOutButton.classList.remove('hidden');
        // Muestra los elementos principales de la interfaz
        if (mainContentWrapper) mainContentWrapper.classList.remove('hidden');
        if (sidebar) sidebar.classList.remove('hidden');
        if (contentArea) contentArea.classList.remove('hidden');
    } else {
        if (signInButton) signInButton.classList.remove('hidden');
        if (signOutButton) signOutButton.classList.add('hidden');
        // Oculta los elementos principales de la interfaz si no estás logueado
        if (mainContentWrapper) mainContentWrapper.classList.add('hidden');
        if (sidebar) sidebar.classList.add('hidden');
        if (contentArea) contentArea.classList.add('hidden');
    }
}


// Callback que se ejecuta cuando se obtiene o se intenta obtener un token
async function tokenResponseCallback(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        gapi.client.setToken(tokenResponse);
        console.log("Acceso concedido. Token:", tokenResponse.access_token);
        updateUI(true); // Actualiza la UI a "logueado"
        await getPlaylists(); // Carga las playlists
    } else {
        console.error("No se obtuvo el token de acceso o la autenticación fue denegada.");
        updateUI(false); // Actualiza la UI a "no logueado"
    }
}


// Función para inicializar Google Identity Services (GIS)
function gisInitalize() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: tokenResponseCallback, // Usa el callback definido arriba
    });
    console.log("GIS client initialized.");
    authReady = true; // Marca GIS como listo
    checkAuthStatus(); // Intenta verificar el estado de autenticación
}

// Función para inicializar Google API Client Library (GAPI)
function gapiInitialize() {
    gapi.load('client', () => {
        gapi.client.init({}).then(() => {
            gapi.client.load('https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest')
                .then(() => {
                    document.getElementById('googleSignInButton').disabled = false;
                    console.log("GAPI client for YouTube loaded.");
                    authReady = true; // Marca GAPI como listo
                    checkAuthStatus(); // Intenta verificar el estado de autenticación
                });
        });
    });
}

// Nueva función central para verificar el estado de autenticación al cargar la página
async function checkAuthStatus() {
    // Solo proceder si ambas APIs están completamente cargadas y listas
    if (!authReady) {
        // console.log("Esperando que ambas APIs de Google estén listas...");
        return;
    }

    const token = gapi.client.getToken();
    if (token && token.access_token) {
        // Ya tenemos un token válido (probablemente de una sesión anterior)
        console.log("Autenticación verificada: token existente y válido.");
        updateUI(true); // Actualiza la UI a "logueado"
        await getPlaylists(); // Carga las playlists
    } else {
        // No hay token o ha expirado. Intentar obtener uno silenciosamente.
        console.log("No hay token activo, intentando re-autenticación silenciosa...");
        tokenClient.requestAccessToken({prompt: 'none'}); // El callback lo maneja tokenResponseCallback
    }
}

// Manejador del clic en el botón de inicio de sesión
function handleAuthClick() {
    // Cuando el usuario hace clic en Iniciar Sesión, siempre pedimos consentimiento explícito
    tokenClient.requestAccessToken({prompt: 'consent'});
}

// Manejador del clic en el botón de cerrar sesión
function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(''); // Limpiar el token en gapi
            console.log('Token revocado y sesión cerrada.');
            updateUI(false); // Actualiza la UI a "no logueado"
            // También limpia la UI de playlists
            document.getElementById('playlistContainer').innerHTML = '';
            // Limpiar los datos de playlists si es necesario
            // playlistsData = []; // Esto está en app.js, app.js limpiará sus datos al recibir el evento
            // Si el estado de currentPlayingInfo es importante, límpialo en app.js
        });
    }
}

// Añadir listeners a los botones solo cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');

    if (signInButton) {
        signInButton.addEventListener('click', handleAuthClick);
        signInButton.disabled = true; // Deshabilitar hasta que GAPI esté listo
    }
    if (signOutButton) {
        signOutButton.addEventListener('click', handleSignOutClick);
    }

    // Al cargar la página, inicializar la UI en estado no logueado por defecto
    // hasta que checkAuthStatus determine lo contrario.
    updateUI(false);
});
// Manejador del clic en el botón de cerrar sesión
function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(''); // Limpiar el token en gapi
            console.log('Token revocado y sesión cerrada.');
            updateUI(false); // Actualiza la UI a "no logueado"
            
            // *** AÑADIR ESTA LÍNEA ***
            // Dispara un evento para que app.js sepa que debe limpiar las playlists de YT.
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
        });
    }
}
