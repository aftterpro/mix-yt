// auth.js - Sistema de Autenticación Google para YT CrossMix Unificado - CORREGIDO

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
 * Inicializar la API de Google - CORREGIDO
 */
async function gapiInitialize() {
    try {
        console.log('📡 Inicializando Google API...');
        
        // Verificar que gapi esté disponible con reintentos
        if (typeof gapi === 'undefined') {
            console.warn('⚠️ gapi no disponible, esperando...');
            setTimeout(gapiInitialize, 1000);
            return;
        }
        
        // Usar método alternativo sin timeout problemático
        await new Promise((resolve, reject) => {
            // MÉTODO SIMPLIFICADO sin timeout que causa problemas
            gapi.load('client', {
                callback: () => {
                    console.log('✅ gapi.client cargado exitosamente');
                    resolve();
                },
                onerror: (error) => {
                    console.error('❌ Error cargando gapi.client:', error);
                    reject(error);
                }
                // REMOVIDO: timeout y ontimeout que causan problemas
            });
            
            // Timeout manual más confiable
            setTimeout(() => {
                reject(new Error('Timeout manual de Google API'));
            }, 15000);
        });
        
        // Inicializar cliente
        await gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            discoveryDocs: [GOOGLE_CONFIG.DISCOVERY_DOC]
        });
        
        gapiLoaded = true;
        console.log('✅ Google API inicializada correctamente');
        
        // Actualizar estado global
        if (window.ytCrossMixAPIs) {
            window.ytCrossMixAPIs.gapi = true;
        }
        
        updateAuthUI();
        
        // Verificar token guardado
        setTimeout(checkStoredToken, 1000);
        
    } catch (error) {
        console.error('❌ Error inicializando Google API:', error);
        gapiLoaded = false;
        
        // Reintentar una sola vez más
        if (!window._gapiRetryAttempted) {
            window._gapiRetryAttempted = true;
            console.log('🔄 Reintentando inicialización de Google API...');
            setTimeout(() => {
                gapiInitialize();
            }, 3000);
        } else {
            showAuthError('Error persistente con Google API - Verifica tu conexión');
        }
    }
}

/**
 * Inicializar Google Identity Services - CORREGIDO
 */
function gisInitalize() {
    try {
        console.log('🔑 Inicializando Google Identity Services...');
        
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            console.warn('⚠️ Google Identity Services no disponible aún, reintentando...');
            setTimeout(gisInitalize, 1000);
            return;
        }
        
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: handleAuthCallback,
        });
        
        gisLoaded = true;
        console.log('✅ Google Identity Services inicializado');
        
        // Actualizar estado global
        if (window.ytCrossMixAPIs) {
            window.ytCrossMixAPIs.gis = true;
        }
        
        updateAuthUI();
        
    } catch (error) {
        console.error('❌ Error inicializando GIS:', error);
        showAuthError('Error de autenticación Google Identity');
        gisLoaded = false;
        
        // Reintentar después de un tiempo
        setTimeout(() => {
            if (!gisLoaded) {
                console.log('🔄 Reintentando inicialización de Google Identity...');
                gisInitalize();
            }
        }, 3000);
    }
}

/**
 * Callback de autenticación - MEJORADO
 */
function handleAuthCallback(response) {
    console.log('🔐 Callback de autenticación recibido:', response);
    
    if (response.error !== undefined) {
        console.error('❌ Error de autenticación:', response.error);
        showAuthError(`Error en la autenticación: ${response.error}`);
        return;
    }

    if (!response.access_token) {
        console.error('❌ No se recibió token de acceso');
        showAuthError('No se pudo obtener token de acceso');
        return;
    }

    console.log('✅ Autenticación exitosa');
    isAuthorized = true;
    
    // Guardar token con información adicional
    try {
        localStorage.setItem('google_token', JSON.stringify({
            access_token: response.access_token,
            timestamp: Date.now(),
            expires_in: response.expires_in || 3600
        }));
        console.log('💾 Token guardado en localStorage');
    } catch (error) {
        console.warn('⚠️ Error guardando token:', error);
    }

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
 * Iniciar sesión - MEJORADO
 */
function signIn() {
    console.log('🔐 Intentando iniciar sesión...');
    console.log('Estado APIs - GAPI:', gapiLoaded, 'GIS:', gisLoaded);
    
    if (!gapiLoaded) {
        showAuthError('Google API no está disponible. Recarga la página.');
        return;
    }
    
    if (!gisLoaded || !tokenClient) {
        showAuthError('Servicios de autenticación no están listos. Recarga la página.');
        return;
    }

    console.log('🔐 Iniciando proceso de autenticación...');
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Conectando con Google...', 'info');
    }

    try {
        // Solicitar token con configuración específica
        tokenClient.requestAccessToken({
            prompt: 'consent',
            hint: '',
            hd: '' // Para cuentas de dominio específico si es necesario
        });
    } catch (error) {
        console.error('❌ Error solicitando token:', error);
        showAuthError('Error iniciando autenticación');
    }
}

/**
 * Cerrar sesión - MEJORADO
 */
function signOut() {
    console.log('👋 Cerrando sesión...');
    
    try {
        // Obtener token actual
        const token = gapi.client.getToken();
        
        if (token !== null && token.access_token) {
            // Revocar token
            google.accounts.oauth2.revoke(token.access_token, () => {
                console.log('✅ Token revocado exitosamente');
            });
            
            // Limpiar token del cliente
            gapi.client.setToken('');
        }

        // Limpiar almacenamiento local
        localStorage.removeItem('google_token');
        
        isAuthorized = false;
        updateAuthUI();
        
        // Disparar evento de logout
        document.dispatchEvent(new CustomEvent('userLoggedOut'));
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('Sesión cerrada correctamente', 'success');
        }
        
        console.log('✅ Sesión cerrada correctamente');
        
    } catch (error) {
        console.error('❌ Error cerrando sesión:', error);
        
        // Limpiar forzadamente
        localStorage.removeItem('google_token');
        isAuthorized = false;
        updateAuthUI();
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('Sesión cerrada (con advertencias)', 'warning');
        }
    }
}

/**
 * Verificar token guardado - MEJORADO
 */
function checkStoredToken() {
    const storedToken = localStorage.getItem('google_token');
    if (!storedToken) {
        console.log('📱 No hay token guardado');
        return false;
    }

    try {
        const tokenData = JSON.parse(storedToken);
        const tokenAge = Date.now() - tokenData.timestamp;
        const expirationTime = (tokenData.expires_in || 3600) * 1000; // Convertir a ms
        
        console.log('📱 Token encontrado, edad:', Math.round(tokenAge / 1000 / 60), 'minutos');

        // Verificar si el token ha expirado
        if (tokenAge >= expirationTime) {
            console.log('⏰ Token expirado, eliminando...');
            localStorage.removeItem('google_token');
            return false;
        }

        if (tokenData.access_token && gapiLoaded) {
            console.log('📱 Intentando usar token guardado...');
            
            gapi.client.setToken({
                access_token: tokenData.access_token
            });
            
            // Verificar si el token sigue siendo válido
            return testTokenValidity();
        }
    } catch (error) {
        console.error('❌ Error procesando token guardado:', error);
        localStorage.removeItem('google_token');
        return false;
    }
}

/**
 * Probar validez del token - MEJORADO
 */
async function testTokenValidity() {
    try {
        console.log('🔍 Verificando validez del token...');
        
        // Hacer una llamada simple para verificar el token
        const response = await gapi.client.youtube.channels.list({
            part: ['id'],
            mine: true,
            maxResults: 1
        });
        
        if (response.result) {
            console.log('✅ Token válido, usuario autenticado');
            isAuthorized = true;
            updateAuthUI();
            
            // Cargar playlists automáticamente
            setTimeout(loadUserPlaylists, 1000);
            return true;
        }
    } catch (error) {
        console.log('❌ Token inválido o expirado:', error);
        
        // Limpiar token inválido
        localStorage.removeItem('google_token');
        if (gapi.client.getToken()) {
            gapi.client.setToken('');
        }
        isAuthorized = false;
        updateAuthUI();
        return false;
    }
}

// =============================================
// CARGA DE PLAYLISTS DE USUARIO
// =============================================

/**
 * Cargar playlists del usuario - SIN CAMBIOS SIGNIFICATIVOS
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
 * Obtener todas las playlists del usuario - SIN CAMBIOS
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
 * Obtener videos de una playlist específica - SIN CAMBIOS
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
 * Actualizar interfaz de autenticación - MEJORADO
 */
function updateAuthUI() {
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');

    console.log('🔄 Actualizando UI auth. Estados:', { 
        isAuthorized, 
        gapiLoaded, 
        gisLoaded,
        signInButton: !!signInButton,
        signOutButton: !!signOutButton 
    });

    if (!signInButton || !signOutButton) {
        console.warn('⚠️ Botones de autenticación no encontrados en DOM');
        return;
    }

    // LIMPIAR listeners anteriores
    signInButton.onclick = null;
    signOutButton.onclick = null;

    if (isAuthorized && gapiLoaded && gisLoaded) {
        // Usuario autenticado
        signInButton.classList.add('hidden');
        signOutButton.classList.remove('hidden');
        
        signOutButton.innerHTML = '<i class="fas fa-sign-out-alt"></i> Cerrar Sesión';
        signOutButton.disabled = false;
        
        // Asignar listener de cerrar sesión
        signOutButton.onclick = (e) => {
            e.preventDefault();
            console.log('🔐 Click en cerrar sesión');
            signOut();
        };
        
    } else if (gapiLoaded && gisLoaded) {
        // APIs cargadas pero no autenticado
        signInButton.classList.remove('hidden');
        signOutButton.classList.add('hidden');
        
        signInButton.innerHTML = '<i class="fab fa-google"></i> Conectar';
        signInButton.disabled = false;
        
        // ASIGNAR LISTENER DE CONEXIÓN - ESTO ES CRÍTICO
        signInButton.onclick = (e) => {
            e.preventDefault();
            console.log('🔐 Click en botón conectar');
            signIn();
        };
        
        console.log('✅ Listener de conexión asignado al botón');
        
    } else {
        // APIs aún cargando
        signInButton.classList.remove('hidden');
        signOutButton.classList.add('hidden');
        
        signInButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando APIs...';
        signInButton.disabled = true;
        signInButton.onclick = null;
    }

    // Actualizar estado en overview
    updateOverviewAuthStatus();
}

/**
 * Actualizar estado de auth en overview - SIN CAMBIOS
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
 * Mostrar error de autenticación - SIN CAMBIOS
 */
function showAuthError(message) {
    console.error('🔴 Error de autenticación:', message);
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage(message, 'error');
    }
}

// =============================================
// EXPORTAR FUNCIONES GLOBALES Y AUTO-INIT
// =============================================

// Hacer funciones disponibles globalmente
window.gapiInitialize = gapiInitialize;
window.gisInitalize = gisInitalize;
window.signIn = signIn;
window.signOut = signOut;

// Auto-inicialización mejorada cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM listo para autenticación');
    
    // Resetear flag de reintentos
    window._gapiRetryAttempted = false;
    
    // Función para verificar e inicializar APIs
    const checkAndInitAPIs = () => {
        console.log('🔍 Verificando disponibilidad de APIs...');
        
        let gapiAvailable = typeof gapi !== 'undefined';
        let gisAvailable = typeof google !== 'undefined' && google.accounts;
        
        console.log('📊 Estado APIs:', { gapiAvailable, gisAvailable });
        
        // Inicializar GAPI si está disponible
        if (gapiAvailable && !gapiLoaded) {
            console.log('📡 GAPI disponible, inicializando...');
            gapiInitialize();
        }
        
        // Inicializar GIS si está disponible
        if (gisAvailable && !gisLoaded) {
            console.log('🔑 Google Identity disponible, inicializando...');
            gisInitalize();
        }
        
        // Si no están disponibles, reintentar
        if (!gapiAvailable || !gisAvailable) {
            console.log('⏳ Algunas APIs no disponibles, reintentando en 1s...');
            setTimeout(checkAndInitAPIs, 1000);
        }
    };
    
    // Iniciar verificación después de que el DOM esté listo
    setTimeout(checkAndInitAPIs, 500);
    
    // Timeout final de seguridad
    setTimeout(() => {
        if (!gapiLoaded || !gisLoaded) {
            console.error('⏰ Timeout final - APIs no cargadas después de 20s');
            console.log('Estado final:', { gapiLoaded, gisLoaded });
            
            // Intentar habilitar botón con lo que tengamos
            updateAuthUI();
            
            if (!gapiLoaded) {
                showAuthError('Google API no pudo cargarse - Verifica tu conexión a internet');
            }
        }
    }, 20000);
});
