// auth.js - Módulo de Autenticación de Google y API de YouTube

const CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';

let tokenClient;

function gisInitalize() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: tokenResponseCallback,
    });
    // Intenta iniciar sesión silenciosamente si el usuario ya ha dado permiso antes.
    // Esto NO ejecutará el callback si no hay sesión previa activa.
    // Si hay una sesión previa, setToken ya se habrá llamado.
    // Lo que necesitamos es saber si estamos autenticados al cargar la página.
    checkAuth(); // Llama a una función para verificar el estado de autenticación al inicio
}
async function checkAuth() {
    const token = gapi.client.getToken();
    if (token) {
        console.log("Ya autenticado con token existente.");
        updateUI(true);
        // Si ya estamos autenticados, cargar las playlists
        await getPlaylists(); // <--- IMPORTANTE: Llama getPlaylists aquí también
    } else {
        console.log("No autenticado o token expirado.");
        updateUI(false);
    }
}
function gapiInitialize() {
    gapi.load('client', () => {
        gapi.client.init({}).then(() => {
            gapi.client.load('https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest')
                .then(() => {
                    document.getElementById('googleSignInButton').disabled = false;
                    console.log("GAPI client for YouTube loaded.");
                });
        });
    });
}

function handleAuthClick() {
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

async function tokenResponseCallback(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        gapi.client.setToken(tokenResponse);
        console.log("Acceso concedido. Token:", tokenResponse.access_token);
        updateUI(true);
        // DESPUÉS de un inicio de sesión exitoso, cargar las playlists del usuario
        await getPlaylists(); // <--- ASEGÚRATE DE QUE ESTA LLAMADA ESTÉ AQUÍ
    } else {
        console.error("No se obtuvo el token de acceso.");
        updateUI(false);
    }
}

function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            updateUI(false);
            document.dispatchEvent(new CustomEvent('userSignedOut'));
        });
    }
}

async function fetchUserPlaylists() {
    try {
        let allPlaylists = [];
        let nextPageToken = undefined;

        showLoadingSpinner();
        
        do {
            const response = await gapi.client.youtube.playlists.list({
                part: 'snippet,contentDetails',
                mine: true,
                maxResults: 50,
                pageToken: nextPageToken,
            });

            if (response.result.items) {
                allPlaylists = allPlaylists.concat(response.result.items);
            }
            nextPageToken = response.result.nextPageToken;
        } while (nextPageToken);
        
        document.dispatchEvent(new CustomEvent('playlistsFetched', { detail: allPlaylists }));

    } catch (err) {
        console.error("Error al obtener playlists de YouTube:", err);
    } finally {
        hideLoadingSpinner();
    }
}

function updateUI(isLoggedIn) {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');

    if (isLoggedIn) {
        signInButton.classList.add('hidden');
        signOutButton.classList.remove('hidden');
    } else {
        signInButton.classList.remove('hidden');
        signOutButton.classList.add('hidden');
    }
}

// Helper para el spinner
function showLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) loadingSpinner.classList.remove('hidden');
}

function hideLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) loadingSpinner.classList.add('hidden');
}

// Añadir listeners a los botones en auth.js
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('googleSignInButton').addEventListener('click', handleAuthClick);
    document.getElementById('googleSignOutButton').addEventListener('click', handleSignOutClick);
});
