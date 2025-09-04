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
        console.log('📡 [AUTH] Inicializando Google API...');
        
        // Verificar que gapi esté disponible
        if (typeof gapi === 'undefined') {
            console.warn('⚠️ [AUTH] gapi no disponible, esperando...');
            setTimeout(gapiInitialize, 1000);
            return;
        }

        // Verificar si ya está inicializando desde init.js
        if (window.ytCrossMixAPIs && window.ytCrossMixAPIs.gapi) {
            console.log('✅ [AUTH] GAPI ya inicializado por init.js');
            gapiLoaded = true;
            updateAuthUI();
            setTimeout(checkStoredToken, 1000);
            return;
        }
        
        // Si init.js no lo hizo, lo hacemos nosotros
        console.log('🔧 [AUTH] Inicializando GAPI manualmente...');
        
        // Método simplificado SIN timeout problemático
        await new Promise((resolve, reject) => {
            gapi.load('client', resolve);
            
            // Timeout manual
            setTimeout(() => {
                reject(new Error('Timeout cargando gapi.client'));
            }, 10000);
        });
        
        // Inicializar cliente
        await gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            discoveryDocs: [GOOGLE_CONFIG.DISCOVERY_DOC]
        });
        
        gapiLoaded = true;
        console.log('✅ [AUTH] Google API inicializada correctamente');
        
        // Actualizar estado global
        if (window.ytCrossMixAPIs) {
            window.ytCrossMixAPIs.gapi = true;
        }
        
        updateAuthUI();
        setTimeout(checkStoredToken, 1000);
        
    } catch (error) {
        console.error('❌ [AUTH] Error inicializando Google API:', error);
        gapiLoaded = false;
        
        // Reintentar una vez más
        if (!window._authGapiRetryAttempted) {
            window._authGapiRetryAttempted = true;
            console.log('🔄 [AUTH] Reintentando inicialización...');
            setTimeout(gapiInitialize, 3000);
        } else {
            console.error('💥 [AUTH] GAPI falló definitivamente');
            // Continuar sin GAPI pero con mensaje
            updateAuthUI();
        }
    }
}


/**
 * Inicializar Google Identity Services - CORREGIDO
 */
function gisInitalize() {
    try {
        console.log('🔑 [AUTH] Inicializando Google Identity Services...');
        
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            console.warn('⚠️ [AUTH] GIS no disponible aún, reintentando...');
            setTimeout(gisInitalize, 1000);
            return;
        }

        // Verificar si ya está inicializado desde init.js
        if (window.ytCrossMixAPIs && window.ytCrossMixAPIs.gis) {
            console.log('✅ [AUTH] GIS ya inicializado por init.js');
            gisLoaded = true;
            updateAuthUI();
            return;
        }
        
        console.log('🔧 [AUTH] Inicializando GIS manualmente...');
        
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: handleAuthCallback,
        });
        
        gisLoaded = true;
        console.log('✅ [AUTH] Google Identity Services inicializado');
        
        // Actualizar estado global
        if (window.ytCrossMixAPIs) {
            window.ytCrossMixAPIs.gis = true;
        }
        
        updateAuthUI();
        
    } catch (error) {
        console.error('❌ [AUTH] Error inicializando GIS:', error);
        gisLoaded = false;
        
        setTimeout(() => {
            if (!gisLoaded) {
                console.log('🔄 [AUTH] Reintentando GIS...');
                gisInitalize();
            }
        }, 2000);
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
    console.log('🔐 [AUTH] === INICIO DE SIGN IN ===');
    console.log('Estados:', { gapiLoaded, gisLoaded, tokenClient: !!tokenClient });
    
    if (!gapiLoaded) {
        console.error('❌ [AUTH] GAPI no está cargado');
        showAuthError('Google API no disponible');
        return;
    }
    
    if (!gisLoaded || !tokenClient) {
        console.error('❌ [AUTH] GIS no está listo');
        showAuthError('Sistema de autenticación no listo');
        return;
    }

    console.log('🔐 [AUTH] Solicitando token de acceso...');
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Abriendo ventana de Google...', 'info');
    }

    try {
        // Esto DEBERÍA abrir el popup de Google
        tokenClient.requestAccessToken({
            prompt: 'consent'
        });
        console.log('🚀 [AUTH] Token solicitado, esperando popup...');
    } catch (error) {
        console.error('❌ [AUTH] Error solicitando token:', error);
        showAuthError('Error iniciando autenticación con Google');
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

    console.log('🔄 [AUTH] Actualizando UI. Estados:', { 
        isAuthorized, 
        gapiLoaded, 
        gisLoaded,
        signInButton: !!signInButton,
        signOutButton: !!signOutButton,
        ytAPIs: window.ytCrossMixAPIs
    });

    if (!signInButton || !signOutButton) {
        console.warn('⚠️ [AUTH] Botones no encontrados, reintentando...');
        setTimeout(updateAuthUI, 1000);
        return;
    }

    // Limpiar listeners anteriores
    signInButton.onclick = null;
    signOutButton.onclick = null;
    signInButton.removeAttribute('disabled');

    if (isAuthorized) {
        // Usuario YA autenticado
        signInButton.classList.add('hidden');
        signOutButton.classList.remove('hidden');
        signOutButton.innerHTML = '<i class="fas fa-sign-out-alt"></i> Cerrar Sesión';
        signOutButton.onclick = signOut;
        
    } else if (gapiLoaded && gisLoaded && tokenClient) {
        // TODO listo para autenticar
        signInButton.classList.remove('hidden');
        signOutButton.classList.add('hidden');
        signInButton.innerHTML = '<i class="fab fa-google"></i> Conectar con Google';
        signInButton.disabled = false;
        
        // ASIGNAR EL LISTENER CRÍTICO
        signInButton.onclick = function(e) {
            e.preventDefault();
            console.log('🚀 [AUTH] ¡Click en conectar detectado!');
            signIn();
        };
        
        console.log('✅ [AUTH] Botón LISTO para autenticación');
        
    } else {
        // Aún cargando o error
        signInButton.classList.remove('hidden');
        signOutButton.classList.add('hidden');
        
        if (!gapiLoaded && !gisLoaded) {
            signInButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando Google APIs...';
            signInButton.disabled = true;
        } else if (!gapiLoaded) {
            signInButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error Google API';
            signInButton.disabled = true;
        } else if (!gisLoaded) {
            signInButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando Identity...';
            signInButton.disabled = true;
        } else if (!tokenClient) {
            signInButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error Token Client';
            signInButton.disabled = true;
        }
    }

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
    console.log('🎯 [AUTH] DOM listo, iniciando verificación coordinada...');
    
    // Esperar un poco a que init.js haga su trabajo
    setTimeout(() => {
        console.log('🔍 [AUTH] Verificando estado después de init.js...');
        
        // Si init.js ya inicializó las APIs, usar esas
        if (window.ytCrossMixAPIs) {
            if (window.ytCrossMixAPIs.gapi) {
                console.log('✅ [AUTH] Usando GAPI de init.js');
                gapiLoaded = true;
            }
            if (window.ytCrossMixAPIs.gis) {
                console.log('✅ [AUTH] Usando GIS de init.js');
                gisLoaded = true;
                // Pero aún necesitamos crear el tokenClient
                gisInitalize();
            }
        }
        
        // Si no, intentar inicializar nosotros
        if (!gapiLoaded && typeof gapi !== 'undefined') {
            console.log('🔧 [AUTH] Init.js no inicializó GAPI, haciéndolo nosotros...');
            gapiInitialize();
        }
        
        if (!gisLoaded && typeof google !== 'undefined' && google.accounts) {
            console.log('🔧 [AUTH] Init.js no inicializó GIS, haciéndolo nosotros...');
            gisInitalize();
        }
        
        // Actualizar UI inicialmente
        updateAuthUI();
        
        // Verificar cada 2 segundos si algo cambió
        const checkInterval = setInterval(() => {
            if (gapiLoaded && gisLoaded) {
                clearInterval(checkInterval);
                console.log('✅ [AUTH] Todas las APIs listas, actualizando UI final');
                updateAuthUI();
            }
        }, 2000);
        
        // Timeout final
        setTimeout(() => {
            clearInterval(checkInterval);
            console.log('⏰ [AUTH] Timeout final, estado:', { gapiLoaded, gisLoaded });
            updateAuthUI();
        }, 15000);
        
    }, 2000); // Esperar 2 segundos a que init.js termine
});
// Función de testing
window.testAuthButton = function() {
    console.log('🧪 [TEST] === TEST BOTÓN AUTH ===');
    const btn = document.getElementById('googleSignInButton');
    
    const state = {
        buttonExists: !!btn,
        buttonVisible: btn ? !btn.classList.contains('hidden') : false,
        buttonDisabled: btn ? btn.disabled : false,
        buttonText: btn ? btn.innerHTML : 'N/A',
        hasOnclick: btn ? !!btn.onclick : false,
        gapiLoaded,
        gisLoaded,
        tokenClient: !!tokenClient,
        isAuthorized,
        ytAPIs: window.ytCrossMixAPIs
    };
    
    console.table(state);
    
    if (btn && !btn.disabled && !btn.classList.contains('hidden') && btn.onclick) {
        console.log('✅ [TEST] Botón parece funcional, haciendo click...');
        btn.click();
    } else {
        console.log('❌ [TEST] Botón no funcional. Intentando forzar actualización...');
        updateAuthUI();
        
        setTimeout(() => {
            console.log('🔄 [TEST] Estado después de actualización:');
            window.testAuthButton();
        }, 1000);
    }
};

// Debug de estado completo
window.debugAuth = function() {
    console.log('🐛 [DEBUG] === ESTADO COMPLETO AUTH ===');
    console.log('Variables globales:', {
        gapiLoaded,
        gisLoaded,
        tokenClient: !!tokenClient,
        isAuthorized,
        GOOGLE_CONFIG
    });
    console.log('Window objects:', {
        gapi: typeof gapi,
        google: typeof google,
        ytCrossMixAPIs: window.ytCrossMixAPIs
    });
    console.log('DOM elements:', {
        signInBtn: !!document.getElementById('googleSignInButton'),
        signOutBtn: !!document.getElementById('googleSignOutButton')
    });
};
