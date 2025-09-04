// auth.js - Sistema de Autenticación Google para YT CrossMix Unificado

console.log('🔐 Cargando módulo de autenticación...');

// =============================================
// CONFIGURACIÓN DE GOOGLE API
// =============================================
const GOOGLE_CONFIG = {
    CLIENT_ID: '374474688710-p6m4rc6p7s7bp3j8ccns6p9pbtj5p9vl.apps.googleusercontent.com',
    API_KEY: 'AIzaSyDg1EMvKc4D--b6hXTSOhR3ANrLPHsyIH4', 
    DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest',
    SCOPES: 'https://www.googleapis.com/auth/youtube.readonly'
};

// Estado de autenticación
let gapiLoaded = false;
let gisLoaded = false;
let tokenClient = null;
let isAuthorized = false;

// =============================================
// INICIALIZACIÓN DE APIS
// =============================================

/**
 * Inicializar la API de Google
 */
// REEMPLAZAR TODA esta función:
async function gapiInitialize() {
    try {
        console.log('📡 Inicializando Google API...');
        
        // Esperar a que gapi esté disponible
        if (typeof gapi === 'undefined') {
            console.error('❌ gapi no está disponible');
            return;
        }
        
        // Cargar cliente con Promise
        await new Promise((resolve, reject) => {
            gapi.load('client', {
                callback: resolve,
                onerror: reject,
                timeout: 5000
            });
        });
        
        // Inicializar cliente
        await gapi.client.init({
            apiKey: 'AIzaSyDg1EMvKc4D--b6hXTSOhR3ANrLPHsyIH4',
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
        });
        
        window.ytCrossMixAPIs.gapi = true;
        console.log('✅ Google API inicializada correctamente');
        updateAuthUI();
        
    } catch (error) {
        console.error('❌ Error inicializando Google API:', error);
        showAuthError('Error de conexión con Google');
    }
}
/**
 * Inicializar cliente de la API
 */
async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            discoveryDocs: [GOOGLE_CONFIG.DISCOVERY_DOC],
        });
        console.log('✅ Cliente Google API inicializado');
        updateAuthUI();
    } catch (error) {
        console.error('❌ Error inicializando cliente:', error);
        showAuthError('Error configurando autenticación');
    }
}

/**
 * Inicializar Google Identity Services
 */
// REEMPLAZAR TODA esta función:
function gisInitalize() {
    try {
        console.log('🔑 Inicializando Google Identity Services...');
        
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            console.error('❌ Google Identity Services no disponible');
            setTimeout(gisInitalize, 1000); // Reintentar en 1 segundo
            return;
        }
        
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: '374474688710-p6m4rc6p7s7bp3j8ccns6p9pbtj5p9vl.apps.googleusercontent.com',
            scope: 'https://www.googleapis.com/auth/youtube.readonly',
            callback: handleAuthCallback,
        });
        
        window.ytCrossMixAPIs.gis = true;
        console.log('✅ Google Identity Services inicializado');
        updateAuthUI();
        
    } catch (error) {
        console.error('❌ Error inicializando GIS:', error);
        showAuthError('Error de autenticación');
    }
}
/**
 * Callback de autenticación
 */
function handleAuthCallback(response) {
    if (response.error !== undefined) {
        console.error('❌ Error de autenticación:', response.error);
        showAuthError('Error en la autenticación');
        return;
    }

    console.log('✅ Autenticación exitosa');
    isAuthorized = true;
    
    // Guardar token
    localStorage.setItem('google_token', JSON.stringify({
        access_token: gapi.client.getToken().access_token,
        timestamp: Date.now()
    }));

    updateAuthUI();
    loadUserPlaylists();
    
    // Mostrar mensaje de éxito
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('¡Conectado con Google exitosamente!', 'success');
    }
}

// =============================================
// GESTIÓN DE AUTENTICACIÓN
// =============================================

/**
 * Iniciar sesión
 */
function signIn() {
    if (!gapiLoaded || !gisLoaded) {
        showAuthError('Servicios de autenticación no disponibles');
        return;
    }

    console.log('🔐 Iniciando proceso de autenticación...');
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Conectando con Google...', 'info');
    }

    // Solicitar token
    tokenClient.requestAccessToken({prompt: 'consent'});
}

/**
 * Cerrar sesión
 */
function signOut() {
    if (!gapi.client.getToken()) {
        console.log('👋 No hay sesión activa');
        return;
    }

    console.log('👋 Cerrando sesión...');
    
    // Revocar token
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
    }

    // Limpiar almacenamiento local
    localStorage.removeItem('google_token');
    
    isAuthorized = false;
    updateAuthUI();
    
    // Disparar evento de logout
    document.dispatchEvent(new CustomEvent('userLoggedOut'));
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Sesión cerrada', 'info');
    }
}

/**
 * Verificar token guardado
 */
function checkStoredToken() {
    const storedToken = localStorage.getItem('google_token');
    if (!storedToken) return false;

    try {
        const tokenData = JSON.parse(storedToken);
        const tokenAge = Date.now() - tokenData.timestamp;
        const oneHour = 60 * 60 * 1000;

        // Si el token tiene menos de 1 hora, intentar usarlo
        if (tokenAge < oneHour && tokenData.access_token) {
            console.log('📱 Token guardado encontrado, verificando...');
            
            gapi.client.setToken({
                access_token: tokenData.access_token
            });
            
            // Verificar si el token sigue siendo válido
            return testTokenValidity();
        } else {
            console.log('⏰ Token expirado, eliminando...');
            localStorage.removeItem('google_token');
            return false;
        }
    } catch (error) {
        console.error('❌ Error procesando token guardado:', error);
        localStorage.removeItem('google_token');
        return false;
    }
}

/**
 * Probar validez del token
 */
async function testTokenValidity() {
    try {
        // Hacer una llamada simple para verificar el token
        await gapi.client.youtube.channels.list({
            part: ['id'],
            mine: true,
            maxResults: 1
        });
        
        console.log('✅ Token válido');
        isAuthorized = true;
        updateAuthUI();
        loadUserPlaylists();
        return true;
    } catch (error) {
        console.log('❌ Token inválido:', error);
        localStorage.removeItem('google_token');
        gapi.client.setToken('');
        isAuthorized = false;
        updateAuthUI();
        return false;
    }
}

// =============================================
// CARGA DE PLAYLISTS DE USUARIO
// =============================================

/**
 * Cargar playlists del usuario
 */
async function loadUserPlaylists() {
    if (!isAuthorized) {
        console.warn('⚠️ No autorizado para cargar playlists');
        return;
    }

    console.log('📁 Cargando playlists del usuario...');
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Cargando tu biblioteca...', 'info');
    }

    try {
        const playlists = await fetchAllPlaylists();
        
        if (playlists.length > 0) {
            console.log(`📚 ${playlists.length} playlists encontradas`);
            
            // Disparar evento con las playlists
            const event = new CustomEvent('playlistsFetched', {
                detail: playlists
            });
            document.dispatchEvent(event);
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage(`${playlists.length} playlists cargadas`, 'success');
            }
        } else {
            console.log('📭 No se encontraron playlists');
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('No se encontraron playlists en tu biblioteca', 'info');
            }
        }
    } catch (error) {
        console.error('❌ Error cargando playlists:', error);
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('Error cargando biblioteca de YouTube', 'error');
        }
    }
}

/**
 * Obtener todas las playlists del usuario
 */
async function fetchAllPlaylists() {
    const allPlaylists = [];
    let nextPageToken = '';

    try {
        do {
            const response = await gapi.client.youtube.playlists.list({
                part: ['snippet', 'contentDetails'],
                mine: true,
                maxResults: 50,
                pageToken: nextPageToken
            });

            if (response.result.items) {
                // Filtrar playlists válidas
                const validPlaylists = response.result.items.filter(playlist => {
                    return playlist.snippet &&
                           playlist.snippet.title &&
                           playlist.contentDetails &&
                           playlist.contentDetails.itemCount > 0;
                });

                allPlaylists.push(...validPlaylists);
            }

            nextPageToken = response.result.nextPageToken || '';
            
        } while (nextPageToken);

        console.log(`📊 Total de playlists válidas: ${allPlaylists.length}`);
        return allPlaylists;

    } catch (error) {
        console.error('❌ Error en fetchAllPlaylists:', error);
        throw error;
    }
}

/**
 * Obtener videos de una playlist específica (para carga bajo demanda)
 */
async function getYouTubeLibraryPlaylistItems(playlistId) {
    if (!isAuthorized) {
        throw new Error('No autorizado para acceder a la biblioteca');
    }

    console.log(`🎵 Cargando videos de playlist: ${playlistId}`);
    
    try {
        let allVideos = [];
        let nextPageToken = null;

        do {
            const response = await gapi.client.youtube.playlistItems.list({
                'part': ['snippet', 'contentDetails'],
                'playlistId': playlistId,
                'maxResults': 50,
                'pageToken': nextPageToken
            });

            const result = response.result;
            if (result.items) {
                const formattedVideos = result.items
                    .map(item => {
                        const thumbnails = item?.snippet?.thumbnails;
                        const videoId = item?.contentDetails?.videoId;
                        const title = item?.snippet?.title;
                        const highThumb = thumbnails?.high?.url;
                        const defaultThumb = thumbnails?.default?.url;
                        
                        if (!videoId || (!highThumb && !defaultThumb)) {
                            console.warn('Item omitido por falta de datos:', item);
                            return null;
                        }
                        
                        return {
                            videoId,
                            title: title || 'Sin título',
                            thumbnail: highThumb || defaultThumb,
                            duration: 0, // YouTube API v3 no proporciona duración en playlistItems
                        };
                    })
                    .filter(v => v !== null && v.videoId);

                allVideos = allVideos.concat(formattedVideos);
            }
            nextPageToken = result.nextPageToken;
        } while (nextPageToken);

        console.log(`✅ ${allVideos.length} videos cargados de playlist ${playlistId}`);
        return allVideos;

    } catch (error) {
        console.error(`❌ Error cargando videos de playlist ${playlistId}:`, error);
        throw new Error(error.result?.error?.message || "No se pudieron cargar los videos");
    }
}

// =============================================
// GESTIÓN DE UI
// =============================================

/**
 * Actualizar interfaz de autenticación
 */
function updateAuthUI() {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');

    if (!signInButton || !signOutButton) {
        console.warn('⚠️ Botones de autenticación no encontrados en DOM');
        return;
    }

    if (isAuthorized && gapiLoaded && gisLoaded) {
        // Usuario autenticado
        signInButton.classList.add('hidden');
        signOutButton.classList.remove('hidden');
        
        // Actualizar texto del botón
        signOutButton.innerHTML = '<i class="fas fa-sign-out-alt"></i> Cerrar Sesión';
        
    } else if (gapiLoaded && gisLoaded) {
        // APIs cargadas pero no autenticado
        signInButton.classList.remove('hidden');
        signOutButton.classList.add('hidden');
        
        // Actualizar texto del botón
        signInButton.innerHTML = '<i class="fab fa-google"></i> Conectar';
        signInButton.disabled = false;
        
    } else {
        // APIs aún cargando
        signInButton.classList.remove('hidden');
        signOutButton.classList.add('hidden');
        
        signInButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
        signInButton.disabled = true;
    }

    // Actualizar estado en overview si existe
    updateOverviewAuthStatus();
}

/**
 * Actualizar estado de auth en overview
 */
function updateOverviewAuthStatus() {
    const authStatus = document.getElementById('unifiedSystemStatus');
    if (authStatus) {
        if (isAuthorized) {
            authStatus.textContent = 'Sistema: ✅ Conectado a Google';
        } else if (gapiLoaded && gisLoaded) {
            authStatus.textContent = 'Sistema: ⏸️ No conectado';
        } else {
            authStatus.textContent = 'Sistema: 🔄 Inicializando...';
        }
    }
}

/**
 * Mostrar error de autenticación
 */
function showAuthError(message) {
    console.error('🔴 Error de autenticación:', message);
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage(message, 'error');
    } else {
        // Fallback si el sistema unificado no está disponible
    }
}
// Hacer funciones disponibles globalmente
window.gapiInitialize = gapiInitialize;
window.gisInitalize = gisInitalize;

// Auto-inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM listo, inicializando APIs...');
    
    // Esperar un poco a que los scripts se carguen
    setTimeout(() => {
        if (typeof gapi !== 'undefined') {
            console.log('📡 GAPI disponible, inicializando...');
            gapiInitialize();
        } else {
            console.warn('⚠️ GAPI no disponible');
        }
        
        if (typeof google !== 'undefined' && google.accounts) {
            console.log('🔑 Google Identity disponible, inicializando...');
            gisInitalize();
        } else {
            console.warn('⚠️ Google Identity no disponible');
        }
    }, 1000);
});
