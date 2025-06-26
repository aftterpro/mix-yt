// auth.js - Módulo de Autenticación de Google y API de YouTube

// --- Configuración ---
const CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';

let tokenClient;

// --- Funciones de Inicialización ---

// Se llama cuando la biblioteca de Google Identity Services (GIS) está lista.
function gisInitalize() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: tokenResponseCallback, // Se llamará después de que el usuario autorice
    });
    checkToken(); // Comprueba si ya hay un token válido al cargar la página
}

// Se llama cuando la biblioteca Google API (gapi) está lista.
function gapiInitialize() {
    gapi.client.load('youtube', 'v3', () => {
        // La API de YouTube ya está cargada.
        // Habilitamos el botón de login.
        document.getElementById('googleSignInButton').disabled = false;
        console.log("GAPI client for YouTube loaded.");
    });
}

// --- Flujo de Autenticación ---

// 1. Inicia el flujo de login cuando el usuario hace clic.
function handleAuthClick() {
    if (gapi.client.getToken() === null) {
        // Pedir token de acceso.
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // El token ya existe, forzar una nueva solicitud para refrescarlo.
        tokenClient.requestAccessToken({prompt: ''});
    }
}

// 2. Callback que se ejecuta después de que el usuario autoriza y se recibe un token.
async function tokenResponseCallback(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        console.log("Token de acceso obtenido.");
        gapi.client.setToken(tokenResponse);
        updateUI(true); // Actualizar la UI para mostrar estado de "logueado"
        await fetchUserPlaylists(); // Obtener las playlists del usuario
    } else {
        console.error("No se pudo obtener el token de acceso.");
        updateUI(false);
    }
}

// 3. Maneja el cierre de sesión.
function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            console.log('Token revocado. Sesión cerrada.');
            updateUI(false); // Actualizar UI
            // Opcional: limpiar las playlists de la UI
            document.dispatchEvent(new CustomEvent('userSignedOut'));
        });
    }
}

// 4. Comprueba si ya existe un token al cargar la página.
function checkToken() {
    const token = gapi.client.getToken();
    if(token) {
        updateUI(true);
        fetchUserPlaylists();
    } else {
        updateUI(false);
    }
}

// --- Interacción con la API de YouTube ---

async function fetchUserPlaylists() {
    try {
        let allPlaylists = [];
        let nextPageToken = null;

        showLoadingSpinner(); // Muestra el spinner de carga
        console.log("Fetching user playlists...");

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

        console.log(`Total playlists fetched: ${allPlaylists.length}`);
        
        // Dispara un evento personalizado con las playlists para que app.js las reciba.
        document.dispatchEvent(new CustomEvent('playlistsFetched', { detail: allPlaylists }));

    } catch (err) {
        console.error("Error al obtener playlists de YouTube:", err);
        alert("Error al obtener tus playlists. Intenta iniciar sesión de nuevo.");
        handleSignOutClick();
    } finally {
        hideLoadingSpinner(); // Oculta el spinner de carga
    }
}


// --- Actualización de la Interfaz ---

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
