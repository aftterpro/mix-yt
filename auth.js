console.log('🔐 Cargando módulo OAUTH.');

// =============================================
// CONFIGURACIÓN OAUTH CON DETECCIÓN DE DOMINIO
// =============================================

let CLIENT_ID = null;
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
let isAuthorized = false;
let tokenClient = null; // Para Google Identity Services (GIS)

/**
 * Función para obtener CLIENT_ID correcto según dominio
 */
function getClientIdForDomain() {
    const hostname = window.location.hostname;
    
    // CLIENT_IDs para diferentes entornos
    const clientIds = {
        // CLIENT_ID de Producción principal
        'mix-yt.netlify.app': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
        
        // 🔴 CORRECCIÓN: Agregar el dominio de GitHub Pages/Cloudflare Pages
        'mix-yt.pages.dev': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',

        // Desarrollo local
        'localhost': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
        
        // Client ID secundario/de prueba (para entornos muy específicos como 127.0.0.1)
        '127.0.0.1': '374474688710-p6m4rc6p7s7bp3j8ccns6p9pbtj5p9vl.apps.googleusercontent.com',
    };
    
    // Asignar el CLIENT_ID
    let clientId = clientIds[hostname];
    
    // Fallback: si es un dominio de previsualización (e.g., netlify.app)
    if (!clientId && hostname.includes('netlify.app')) {
         clientId = clientIds['mix-yt.netlify.app']; 
    }
    
    // Fallback por si acaso
    if (!clientId) {
        console.warn('⚠️ CLIENT_ID no encontrado para el dominio actual. Usando fallback de Netlify.');
        clientId = clientIds['mix-yt.netlify.app'];
    }
    
    CLIENT_ID = clientId;
    console.log(`🔑 CLIENT_ID detectado: ${CLIENT_ID}`);
}


// =============================================
// PERSISTENCIA DE AUTENTICACIÓN
// =============================================

const AUTH_STORAGE_KEY = 'ytcm_auth_data';
const EXPIRATION_DAYS = 7; // Token válido por 7 días en localStorage

/**
 * Guarda los datos de autenticación y la fecha de expiración.
 */
function saveAuthData(token) {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + EXPIRATION_DAYS);
    
    const authData = {
        token: token,
        expiry: expirationDate.getTime(),
        timestamp: Date.now()
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
    console.log('💾 Datos de autenticación guardados.');
}

/**
 * Carga los datos de autenticación si no han expirado.
 */
function loadAuthData() {
    const data = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!data) return null;

    try {
        const authData = JSON.parse(data);
        if (Date.now() < authData.expiry) {
            console.log('✅ Token de sesión cargado y válido.');
            return authData.token;
        } else {
            console.log('🗑️ Token de sesión expirado, eliminando...');
            localStorage.removeItem(AUTH_STORAGE_KEY);
            return null;
        }
    } catch (e) {
        console.error('❌ Error al parsear datos de autenticación:', e);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
    }
}

/**
 * Limpieza de datos (para el intervalo periódico).
 */
function cleanupExpiredData() {
    const token = loadAuthData(); // La función loadAuthData se encarga de la limpieza si está expirado
    if (!token) {
        console.log('🧹 No hay datos de autenticación válidos para limpiar.');
        isAuthorized = false;
        updateAuthUI();
    }
}

// =============================================
// INICIALIZACIÓN DE APIS (GAPI Y GIS)
// =============================================

function initializeGoogleAPIs() {
    getClientIdForDomain(); // Obtener el ID antes de inicializar
    
    // GAPI (para gapi.client)
    gapi.load('client', window.gapiInitialize_auth);
    
    // GIS (para google.accounts.oauth2) - Se asume que init.js ya lo marcó como disponible
    if (window.ytCrossMixAPIs?.gis) {
        window.gisInitalize_auth();
    }
}

/**
 * Delegación de init.js: Inicializa gapi.client (YouTube API)
 */
window.gapiInitialize_auth = function() {
    gapi.client.init({
        // No se requiere 'clientId' ni 'scope' si usamos GIS, pero se deja 'apiKey' por si acaso
    }).then(() => {
        return gapi.client.load('youtube', 'v3');
    }).then(() => {
        window.ytCrossMixAPIs.gapi = true;
        console.log('✅ GAPI y YouTube v3 cargados.');
        handleAuthResult(loadAuthData()); // Intentar cargar sesión guardada
    }).catch((err) => {
        console.error('❌ Error cargando GAPI/YouTube API:', err);
    });
};

/**
 * Delegación de init.js: Inicializa el cliente de token GIS
 */
window.gisInitalize_auth = function() {
    if (!CLIENT_ID) return;
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse.error) {
                throw (tokenResponse.error);
            }
            // Llamar al manejador con el token de acceso
            handleAuthResult(tokenResponse.access_token);
        },
    });
    window.ytCrossMixAPIs.gis = true;
    console.log('✅ GIS Token Client inicializado.');
};

// =============================================
// MANEJO DE ESTADO DE AUTENTICACIÓN
// =============================================

/**
 * Maneja la respuesta de autenticación (ya sea desde GIS o localStorage).
 */
function handleAuthResult(accessToken) {
    if (!accessToken) {
        isAuthorized = false;
        console.log('❌ No hay token de autenticación válido.');
        updateAuthUI();
        return;
    }

    // Setear el token para gapi.client
    gapi.client.setToken({ access_token: accessToken });
    isAuthorized = true;
    saveAuthData(accessToken); // Persistir el token (con la nueva fecha de expiración)
    
    console.log('✅ Usuario autenticado. Token establecido.');
    window.unifiedCore.state.authReady = true;
    updateAuthUI();
    loadUserPlaylistsAndStore();
}

/**
 * Actualiza la interfaz de usuario para reflejar el estado de autenticación.
 */
window.updateAuthUI = function() {
    const authElements = document.querySelectorAll('.auth-required');
    const authStatus = document.getElementById('authStatus');
    const signInBtn = document.getElementById('signInButton');
    const signOutBtn = document.getElementById('signOutButton');
    
    if (isAuthorized) {
        authElements.forEach(el => el.classList.remove('disabled'));
        if (authStatus) authStatus.textContent = '✅ Autorizado';
        if (signInBtn) signInBtn.style.display = 'none';
        if (signOutBtn) signOutBtn.style.display = 'block';
        window.unifiedCore?.enablePlayButton();
    } else {
        authElements.forEach(el => el.classList.add('disabled'));
        if (authStatus) authStatus.textContent = '❌ No Autorizado';
        if (signInBtn) signInBtn.style.display = 'block';
        if (signOutBtn) signOutBtn.style.display = 'none';
        window.unifiedCore.state.authReady = false;
    }
};

// =============================================
// ACCIONES DE USUARIO
// =============================================

/**
 * Inicia el flujo de autenticación.
 */
window.signIn = function() {
    if (!tokenClient) {
        console.error('❌ GIS Token Client no inicializado.');
        return;
    }
    
    // Pide el token de acceso
    tokenClient.requestAccessToken();
};

/**
 * Cierra la sesión y limpia los datos.
 */
window.signOut = function() {
    console.log('🚪 Cerrando sesión...');
    gapi.client.setToken(''); // Limpiar token de GAPI
    localStorage.removeItem(AUTH_STORAGE_KEY); // Limpiar persistencia
    isAuthorized = false;
    updateAuthUI();
    
    // Notificar al core para limpiar la biblioteca
    if (window.unifiedCore) {
        window.unifiedCore.clearYouTubeLibrary();
    }
};


// =============================================
// ACCESO A DATOS DE YOUTUBE
// =============================================

/**
 * Carga los ítems de una playlist, usando paginación.
 */
async function getYouTubeLibraryPlaylistItems(playlistId) {
    if (!isAuthorized) {
        console.error('❌ Debe iniciar sesión para cargar la biblioteca.');
        return [];
    }

    const videos = [];
    let nextPageToken = null;
    let pageCount = 0;

    console.log(`📡 Iniciando carga de playlist: ${playlistId}`);

    try {
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                playlistId: playlistId,
                part: 'snippet,contentDetails',
                maxResults: 50,
                pageToken: nextPageToken
            });

            const items = response.result.items;
            items.forEach(item => {
                // Asegurar que solo videos válidos sean añadidos
                if (item.snippet.resourceId.videoId) {
                    videos.push({
                        videoId: item.snippet.resourceId.videoId,
                        title: item.snippet.title,
                        uploaderName: item.snippet.channelTitle,
                        duration: 0, // No disponible en esta API, core puede manejar esto
                        thumbnail: item.snippet.thumbnails.default.url,
                        source: 'youtube_library',
                        playlistId: playlistId,
                        dateAdded: Date.now()
                    });
                }
            });

            nextPageToken = response.result.nextPageToken;
            pageCount++;
        } while (nextPageToken && pageCount < 5); // Limitar a 5 páginas (250 videos) por seguridad/rendimiento

        console.log(`✅ Carga de playlist ${playlistId} completa. Total videos: ${videos.length}`);
        return videos;

    } catch (error) {
        console.error(`❌ Error al cargar la playlist ${playlistId}:`, error);
        return [];
    }
}

/**
 * Carga TODAS las playlists del usuario (incluyendo "Ver más tarde" y "Videos que me gustan").
 */
window.loadUserPlaylists = async function() {
    if (!isAuthorized) {
        console.error('❌ Usuario no autorizado. No se puede cargar la biblioteca.');
        return [];
    }
    
    console.log('📡 Cargando lista de playlists del usuario...');

    try {
        const response = await gapi.client.youtube.playlists.list({
            part: 'snippet,contentDetails',
            mine: true,
            maxResults: 50
        });

        const playlists = response.result.items.map(p => ({
            id: p.id,
            title: p.snippet.title,
            count: p.contentDetails.itemCount,
            thumbnail: p.snippet.thumbnails?.default?.url || null,
            source: 'youtube_library',
            dateSynced: Date.now()
        }));

        console.log(`✅ ${playlists.length} playlists de YouTube cargadas.`);
        return playlists;

    } catch (error) {
        console.error('❌ Error al cargar la lista de playlists:', error);
        return [];
    }
};

/**
 * Carga las playlists Y las almacena en el core.
 */
window.loadUserPlaylistsAndStore = async function() {
    if (!isAuthorized || !window.unifiedCore) {
        console.log('❌ No autorizado o Core no disponible para sincronizar.');
        return;
    }

    const playlistsMetadata = await window.loadUserPlaylists();
    if (playlistsMetadata.length === 0) {
        window.unifiedCore.clearYouTubeLibrary();
        return;
    }
    
    // Crear una lista de promesas para cargar los items de cada playlist
    const loadPromises = playlistsMetadata.map(async (playlist) => {
        const videos = await getYouTubeLibraryPlaylistItems(playlist.id);
        return {
            ...playlist,
            videos: videos,
            dateSynced: Date.now()
        };
    });

    const detailedPlaylists = await Promise.all(loadPromises);
    
    // Actualizar el core con la nueva data
    window.unifiedCore.syncYouTubeLibrary(detailedPlaylists);
    console.log('✅ Sincronización de biblioteca de YouTube finalizada.');
};

// NUEVA: Función para forzar sincronización
window.forceSyncLibrary = function() {
    if (!isAuthorized) {
        console.log('❌ No autorizado para sincronizar');
        return;
    }
    
    console.log('🔄 Forzando sincronización de biblioteca...');
    loadUserPlaylistsAndStore();
};

// NUEVA: Función para limpiar solo datos expirados
window.cleanExpiredData = function() {
    cleanupExpiredData();
    console.log('🧹 Limpieza de datos expirados completada');
};

// =============================================
// EXPORTAR FUNCIONES GLOBALES
// =============================================
window.signIn = signIn;
window.signOut = signOut;
window.getYouTubeLibraryPlaylistItems = getYouTubeLibraryPlaylistItems;
window.loadUserPlaylists = loadUserPlaylists;
window.loadUserPlaylistsAndStore = loadUserPlaylistsAndStore;


// =============================================
// AUTO-INICIALIZACIÓN CON LIMPIEZA AUTOMÁTICA
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM listo para auth con persistencia');
    
    // 1. Limpiar datos expirados al inicio
    cleanupExpiredData();
    
    // 2. Esperar un poco para que los scripts de Google se carguen
    // init.js se encarga de llamar a initializeGoogleAPIs cuando detecta gapi y gis
    if (window.gapiInitialize) {
        console.log('⏳ Esperando gapi/gis en init.js...');
    } else {
        // Fallback si init.js no existe/no se carga bien
         setTimeout(() => {
            if (typeof gapi !== 'undefined') {
                initializeGoogleAPIs();
            }
        }, 2000);
    }
    
    // 3. Limpieza automática cada hora
    setInterval(cleanupExpiredData, 60 * 60 * 1000);
});

console.log('✅ Módulo de autenticación con persistencia de 7 días cargado');
