// auth.js - Módulo de Autenticación de Google y API de YouTube (Versión con persistencia de sesión)

const CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';

let tokenClient;

let gapiReady = false;
let gisReady = false;

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

function updateUI(isLoggedIn) {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');
    const playlistContainer = document.getElementById('playlistContainer');

    if (isLoggedIn) {
        if (signInButton) signInButton.classList.add('hidden');
        if (signOutButton) signOutButton.classList.remove('hidden');
        if (playlistContainer) playlistContainer.classList.remove('hidden');
    } else {
        if (signInButton) signInButton.classList.remove('hidden');
        if (signOutButton) signOutButton.classList.add('hidden');
    }
}

// --- MODIFICACIÓN: Guardar token en localStorage al iniciar sesión ---
async function tokenResponseCallback(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        gapi.client.setToken(tokenResponse);

        // Guardar token en localStorage
        localStorage.setItem('google_token', JSON.stringify(tokenResponse));

        console.log("Acceso concedido. Token:", tokenResponse.access_token);
        updateUI(true);
        await getPlaylists();
    } else {
        console.error("No se obtuvo el token de acceso o la autenticación fue denegada.");
        updateUI(false);
    }
}

function gisInitalize() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: tokenResponseCallback,
    });
    console.log("GIS client initialized.");
    gisReady = true;
    tryStartApp();
}

function gapiInitialize() {
    gapi.load('client', () => {
        gapi.client.init({}).then(() => {
            return gapi.client.load('https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest');
        }).then(() => {
            console.log("GAPI client for YouTube loaded.");
            gapiReady = true;
            tryStartApp();
        }).catch(err => {
            console.error("Error inicializando GAPI client", err);
        });
    });
}

function tryStartApp() {
    if (gapiReady && gisReady) {
        console.log("Ambas APIs de Google están listas. Comprobando estado de autenticación.");
        checkAuthStatus();
    }
}

// --- MODIFICACIÓN: Revisar localStorage si no hay token en memoria ---
function checkAuthStatus() {
    let token = gapi.client.getToken();
    if (!token) {
        // Intentar recuperar el token guardado
        const savedToken = localStorage.getItem('google_token');
        if (savedToken) {
            try {
                const parsedToken = JSON.parse(savedToken);
                if (parsedToken && parsedToken.access_token) {
                    gapi.client.setToken(parsedToken);
                    token = parsedToken;
                }
            } catch (e) {
                localStorage.removeItem('google_token');
            }
        }
    }
    if (token && token.access_token) {
        console.log("Autenticación verificada: token existente y válido.");
        updateUI(true);
        getPlaylists();
    } else {
        console.log("No hay token activo. Mostrando botón de inicio de sesión.");
        updateUI(false);
    }
}

// --- MODIFICACIÓN: Borrar token de localStorage al cerrar sesión ---
function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            // Eliminar token guardado
            localStorage.removeItem('google_token');
            console.log('Token revocado y sesión cerrada.');
            updateUI(false);
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
        });
    }
}

function handleAuthClick() {
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');

    if (signInButton) {
        signInButton.addEventListener('click', handleAuthClick);
    }
    if (signOutButton) {
        signOutButton.addEventListener('click', handleSignOutClick);
    }
    updateUI(false);
});
