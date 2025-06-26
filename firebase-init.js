// app.js
let googleApiClientReady = false;

function handleCredentialResponse(response) {
    console.log("Encoded JWT ID token: " + response.credential);
    // Aquí puedes enviar el response.credential (JWT) a tu backend para verificación si tuvieras uno,
    // o decodificarlo directamente en el frontend para obtener el ID de usuario de Google.
    // Para este caso, lo usaremos para inicializar gapi con el token.
    const decodedToken = parseJwt(response.credential);
    console.log("Decoded Token:", decodedToken);

    if (decodedToken && decodedToken.sub) {
        // Asumiendo que `gapi` ya está cargado y disponible
        // Esto es solo para propósitos de demostración. gapi.client.youtube necesita un token de acceso, no un ID token.
        // Para obtener playlists, necesitarás un token de acceso, que el nuevo GSI no te da directamente.
        // Revertiremos a la forma antigua de gapi.auth2 para obtener el token de acceso.
        initGoogleAPIClient(response.credential); // Usaremos esta función para procesar el token y autenticar gapi
    }
}

// Función para decodificar JWT (necesaria si usas el nuevo GSI para inspeccionar el token)
function parseJwt (token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Error decoding JWT:", e);
        return null;
    }
};


function initGoogleAuth() {
    // Usaremos la API gapi.auth2 para obtener el token de acceso necesario para la YouTube Data API
    gapi.load('client:auth2', () => {
        gapi.client.init({
            apiKey: 'TU_API_KEY_DE_YOUTUBE_DATA_API', // Tu API Key si la usas para acceso público (no necesaria para datos de usuario logueado)
            clientId: 'TU_CLIENT_ID_DE_GOOGLE', // ¡Este es tu CLIENT ID de OAuth 2.0!
            scope: 'https://www.googleapis.com/auth/youtube.readonly', // Scope para leer playlists y videos
            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest"]
        }).then(() => {
            googleApiClientReady = true;
            console.log('Google API client and Auth2 initialized.');

            // Agrega un listener para el estado de autenticación
            gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
            updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());

        }, (error) => {
            console.error('Error initializing Google API client:', error);
        });
    });
}


function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        console.log('Usuario ha iniciado sesión.');
        // Muestra la interfaz de usuario de playlists
        document.getElementById('authorize-button').style.display = 'none';
        document.getElementById('signout-button').style.display = 'block';
        // Llama a la función para cargar las playlists del usuario
        loadUserPlaylists();
    } else {
        console.log('Usuario no ha iniciado sesión.');
        // Muestra el botón de inicio de sesión
        document.getElementById('authorize-button').style.display = 'block';
        document.getElementById('signout-button').style.display = 'none';
        // Oculta las playlists del usuario
        document.getElementById('user-playlists-section').innerHTML = '<p>Inicia sesión con Google para ver tus playlists.</p>';
    }
}

// Función para iniciar sesión (se llama al hacer clic en el botón de "Iniciar sesión con Google")
function handleAuthClick() {
    if (googleApiClientReady) {
        gapi.auth2.getAuthInstance().signIn();
    } else {
        console.error('Google API client not ready yet.');
        showFloatingMessage('Error: Google API no está lista. Inténtalo de nuevo.', 'error');
    }
}

// Función para cerrar sesión
function handleSignoutClick() {
    if (googleApiClientReady) {
        gapi.auth2.getAuthInstance().signOut();
        playlistsData = []; // Limpia las playlists
        document.getElementById('playlists-container').innerHTML = ''; // Limpia la visualización
        showFloatingMessage('Sesión cerrada.', 'info');
    } else {
        console.error('Google API client not ready yet.');
    }
}

// Cargar las APIs de Google cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    initGoogleAuth();
});

// Configurar el botón de inicio de sesión
const authorizeButton = document.getElementById('authorize-button');
if (authorizeButton) {
    authorizeButton.addEventListener('click', handleAuthClick);
}

// Configurar el botón de cerrar sesión
const signoutButton = document.getElementById('signout-button');
if (signoutButton) {
    signoutButton.addEventListener('click', handleSignoutClick);
}
