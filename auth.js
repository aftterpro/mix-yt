console.log('🔐 Cargando módulo de autenticación simple...');

// =============================================
// CONFIGURACIÓN OAUTH CON DETECCIÓN DE DOMINIO
// =============================================

// Función para obtener CLIENT_ID correcto según dominio
function getClientIdForDomain() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const currentOrigin = window.location.origin;
        
    // CLIENT_IDs para diferentes entornos
    const clientIds = {
        // Producción
        'mix-yt.netlify.app': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
        
        // Desarrollo local
        'localhost': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
        '127.0.0.1': '374474688710-p6m4rc6p7s7bp3j8ccns6p9pbtj5p9vl.apps.googleusercontent.com',
        
        // Netlify deploy previews
        'deploy-preview': '374474688710-p6m4rc6p7s7bp3j8ccns6p9pbtj5p9vl.apps.googleusercontent.com'
    };
    
    // Buscar CLIENT_ID para el dominio actual
    let clientId = clientIds[hostname];
    
    // Si es un deploy preview de Netlify
    if (!clientId && hostname.includes('netlify')) {
        clientId = clientIds['deploy-preview'];
    }
    
    // Fallback al CLIENT_ID principal
    if (!clientId) {
        clientId = '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com';
    }
        return clientId;
}

const GOOGLE_CONFIG = {
    CLIENT_ID: getClientIdForDomain(),
    API_KEY: 'AIzaSyDg1EMvKc4D--b6hXTSOhR3ANrLPHsyIH4', 
    DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest',
    SCOPES: 'https://www.googleapis.com/auth/youtube.readonly'
};

// Estado de autenticación
let gapiReady = false;
let gisReady = false;
let tokenClient = null;
let isAuthorized = false;
const YOUTUBE_LIBRARY_SOURCE_ID = 'youtube_library';

// =============================================
// FUNCIÓN DE DEBUGGING OAUTH
// =============================================
window.debugOAuth = function() {    
    const info = {
        currentOrigin: window.location.origin,
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        clientId: GOOGLE_CONFIG.CLIENT_ID,
        apiKey: GOOGLE_CONFIG.API_KEY,
        scopes: GOOGLE_CONFIG.SCOPES
    };
    
   // console.table(info);
    
    // Verificar si el origen está en la lista de permitidos
    const allowedOrigins = [
        'https://mix-yt.netlify.app',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8080'
    ];
    
    const isOriginAllowed = allowedOrigins.some(origin => 
        window.location.origin.includes(origin.replace(/https?:\/\//, ''))
    );
    
    console.log('✅ Origen permitido:', isOriginAllowed);
    
    if (!isOriginAllowed) {
        console.error('❌ PROBLEMA: Tu origen actual no está en la lista de permitidos');
    }
    
    return info;
};

// =============================================
// ESPERAR A QUE LAS APIS ESTÉN DISPONIBLES
// =============================================
function waitForAPIs() {
    return new Promise((resolve) => {
        const checkAPIs = () => {
            const gapiAvailable = typeof gapi !== 'undefined';
            const gisAvailable = typeof google !== 'undefined' && google?.accounts?.oauth2;
            
            console.log('🔍 Verificando APIs:', { gapiAvailable, gisAvailable });
            
            if (gapiAvailable && gisAvailable) {
                resolve();
            } else {
                setTimeout(checkAPIs, 500);
            }
        };
        checkAPIs();
    });
}

// =============================================
// INICIALIZAR GOOGLE APIS
// =============================================
async function initializeGoogleAPIs() {
    try {
        console.log('🚀 Inicializando Google APIs de forma simple...');
        
        // Verificar configuración antes de continuar
        window.debugOAuth();
        
        // Esperar a que estén disponibles
        await waitForAPIs();
        
        // Inicializar GAPI sin timeout problemático
        await new Promise((resolve, reject) => {
            console.log('📡 Cargando gapi.client...');
            gapi.load('client', () => {
                console.log('✅ gapi.client cargado');
                resolve();
            });
            
            // Timeout de seguridad
            setTimeout(() => reject(new Error('Timeout gapi')), 10000);
        });
        
        // Configurar cliente GAPI
        console.log('🔧 Configurando cliente GAPI...');
        await gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            discoveryDocs: [GOOGLE_CONFIG.DISCOVERY_DOC]
        });
        
        console.log('✅ GAPI inicializado');
        gapiReady = true;
        
        // Inicializar GIS con configuración mejorada        
        const tokenClientConfig = {
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: handleAuthResponse,
            // Configuraciones adicionales para evitar errores
            auto_select: false,
            cancel_on_tap_outside: false
        };
        
        console.log('🔑 Config TokenClient:', tokenClientConfig);
        
        tokenClient = google.accounts.oauth2.initTokenClient(tokenClientConfig);
        
        if (!tokenClient) {
            throw new Error('No se pudo crear tokenClient');
        }
        
        console.log('✅ GIS inicializado correctamente');
        gisReady = true;
        
        // Actualizar UI
        updateAuthUI();
        
        // Verificar token guardado
        setTimeout(checkStoredToken, 1000);
        
    } catch (error) {
        console.error('❌ Error inicializando APIs:', error);
        showError('Error cargando Google APIs: ' + error.message);
        
        // Debug adicional para OAuth
        if (error.message.includes('invalid_client') || error.message.includes('401')) {
            console.error('💡 Posible problema de configuración OAuth:');
            console.error('1. Verifica que el CLIENT_ID sea correcto');
            console.error('2. Verifica que el dominio esté autorizado en Google Console');
            console.error('3. Ejecuta window.debugOAuth() para más detalles');
        }
    }
}

// =============================================
// MANEJAR RESPUESTA DE AUTENTICACIÓN
// =============================================
function handleAuthResponse(response) {
    console.log('🔐 Respuesta completa de auth:', response);
    
    if (response.error) {
        console.error('❌ Error de auth completo:', response);
        
        let errorMessage = 'Error de autenticación';
        
        switch(response.error) {
            case 'invalid_client':
                errorMessage = 'Cliente OAuth inválido. Verifica configuración en Google Console.';
                console.error('💡 Verifica que el dominio esté autorizado:', window.location.origin);
                break;
            case 'access_denied':
                errorMessage = 'Acceso denegado por el usuario.';
                break;
            case 'popup_blocked':
                errorMessage = 'Popup bloqueado. Permite popups para este sitio.';
                break;
            case 'popup_closed_by_user':
                errorMessage = 'Popup cerrado por el usuario.';
                break;
            default:
                errorMessage = `Error: ${response.error} - ${response.error_description || 'Sin descripción'}`;
        }
        
        showError(errorMessage);
        return;
    }
    
    if (response.access_token) {
        console.log('✅ Token recibido exitosamente');
        isAuthorized = true;
        
        // Guardar token
        try {
            localStorage.setItem('google_token', JSON.stringify({
                access_token: response.access_token,
                timestamp: Date.now(),
                expires_in: response.expires_in || 3600
            }));
            console.log('💾 Token guardado');
        } catch (e) {
            console.warn('⚠️ No se pudo guardar token:', e);
        }
        
        updateAuthUI();
        loadUserPlaylists();
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('¡Conectado exitosamente!', 'success');
        }
    } else {
        console.warn('⚠️ Respuesta sin token:', response);
        showError('No se recibió token de acceso');
    }
}

// =============================================
// GESTIÓN DE SESIÓN
// =============================================

// Iniciar sesión
function signIn() {
    console.log('🔐 Iniciando sign in...');
    console.log('Estados:', { gapiReady, gisReady, tokenClient: !!tokenClient });
    
    if (!gapiReady) {
        console.error('❌ GAPI no está cargado');
        showError('Google API no disponible');
        return;
    }
    
    if (!gisReady || !tokenClient) {
        console.error('❌ GIS no está listo');
        showError('Sistema de autenticación no listo');
        return;
    }

    console.log('🚀 Solicitando token...');
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Abriendo ventana de Google...', 'info');
    }
    
    try {
        // Esto DEBERÍA abrir el popup de Google
        tokenClient.requestAccessToken({ 
            prompt: 'consent' 
        });
        console.log('🚀 Token solicitado, esperando popup...');
    } catch (error) {
        console.error('❌ Error solicitando token:', error);
        showError('Error solicitando autorización: ' + error.message);
    }
}

// Cerrar sesión
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

// Verificar token guardado
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

        if (tokenData.access_token && gapiReady) {
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

// Probar validez del token
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
// ACTUALIZAR INTERFAZ DE USUARIO
// =============================================
function updateAuthUI() {
    const signInBtn = document.getElementById('googleSignInButton');
    const signOutBtn = document.getElementById('googleSignOutButton');
    
    console.log('🔄 Actualizando UI auth:', { 
        gapiReady, 
        gisReady, 
        isAuthorized,
        signInButton: !!signInBtn,
        signOutButton: !!signOutBtn
    });
    
    if (!signInBtn || !signOutBtn) {
        console.warn('⚠️ Botones no encontrados, reintentando...');
        setTimeout(updateAuthUI, 1000);
        return;
    }
    
    // Limpiar listeners anteriores
    signInBtn.onclick = null;
    signOutBtn.onclick = null;
    signInBtn.removeAttribute('disabled');
    
if (isAuthorized) {
    // Usuario YA autenticado
    signInBtn.classList.add('hidden');
    signOutBtn.classList.remove('hidden');
    signOutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i><span> Cerrar Sesión</span>';
    signOutBtn.onclick = signOut;
    
} else if (gapiReady && gisReady && tokenClient) {
    // TODO listo para autenticar
    signInBtn.classList.remove('hidden');
    signOutBtn.classList.add('hidden');
    signInBtn.innerHTML = '<i class="fab fa-google"></i><span> Conectar</span>';
    signInBtn.disabled = false;
    
    // ASIGNAR EL LISTENER CRÍTICO
    signInBtn.onclick = function(e) {
        e.preventDefault();
        console.log('🚀 ¡Click en conectar detectado!');
        signIn();
    };
    
    console.log('✅ Botón listo para autenticación');
} else {
    // Estados de carga mejorados
    signInBtn.classList.remove('hidden');
    signOutBtn.classList.add('hidden');
    
    if (!gapiReady && !gisReady) {
        signInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span> Cargando...</span>';
        signInBtn.disabled = true;
       } else if (!gapiReady) {
            signInBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error Google API';
            signInBtn.disabled = true;
        } else if (!gisReady) {
            signInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando Identity...';
            signInBtn.disabled = true;
        } else if (!tokenClient) {
            signInBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error Token Client';
            signInBtn.disabled = true;
        }
    }

    // Actualizar estado en overview
    updateOverviewAuthStatus();
// ARREGLO MÓVIL: Asegurar que los botones móviles también se actualicen
const mobileAuthElements = {
    mobileSignIn: document.querySelector('.mobile-user-actions .auth-btn'),
    mobileSignOut: document.querySelector('.mobile-user-actions .auth-btn.hidden')
};

// Si hay elementos móviles, sincronizar con desktop
if (mobileAuthElements.mobileSignIn || mobileAuthElements.mobileSignOut) {
    if (isAuthorized) {
        if (mobileAuthElements.mobileSignIn) {
            mobileAuthElements.mobileSignIn.classList.add('hidden');
        }
        if (mobileAuthElements.mobileSignOut) {
            mobileAuthElements.mobileSignOut.classList.remove('hidden');
            mobileAuthElements.mobileSignOut.onclick = signOut;
        }
    } else if (gapiReady && gisReady && tokenClient) {
        if (mobileAuthElements.mobileSignIn) {
            mobileAuthElements.mobileSignIn.classList.remove('hidden');
            mobileAuthElements.mobileSignIn.onclick = signIn;
            mobileAuthElements.mobileSignIn.disabled = false;
        }
        if (mobileAuthElements.mobileSignOut) {
            mobileAuthElements.mobileSignOut.classList.add('hidden');
        }
    }
  }
}
// Actualizar estado de auth en overview
function updateOverviewAuthStatus() {
    const authStatus = document.getElementById('unifiedSystemStatus');
    if (authStatus) {
        if (isAuthorized) {
            authStatus.textContent = 'Sistema: ✅ Conectado a Google';
        } else if (gapiReady && gisReady) {
            authStatus.textContent = 'Sistema: ⏸️ No conectado';
        } else {
            authStatus.textContent = 'Sistema: 🔄 Inicializando...';
        }
    }
}

// =============================================
// CARGAR PLAYLISTS DEL USUARIO
// =============================================
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

// Obtener todas las playlists del usuario
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

// Obtener videos de una playlist específica
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
// UTILIDADES
// =============================================

// Mostrar error
function showError(message) {
    console.error('🔴', message);
    if (window.unifiedCore) {
        window.unifiedCore.showMessage(message, 'error');
    }
}

// =============================================
// FUNCIONES DE TESTING Y DEBUG
// =============================================

// Testing específico para OAuth
window.testOAuthConfig = function() {
    console.log('🧪 === TEST CONFIGURACIÓN OAUTH ===');
    
    // Test 1: Verificar configuración
    const config = window.debugOAuth();
    
    // Test 2: Verificar disponibilidad de APIs
    const apisAvailable = {
        gapi: typeof gapi !== 'undefined' && !!gapi.client,
        google: typeof google !== 'undefined' && !!google.accounts,
        gapiReady,
        gisReady,
        tokenClient: !!tokenClient
    };
    
    console.log('APIs:', apisAvailable);
    
    // Test 3: Simular click si todo está listo
    if (gapiReady && gisReady && tokenClient) {
        console.log('🚀 Todo listo, probando autenticación...');
        
        const btn = document.getElementById('googleSignInButton');
        if (btn && !btn.disabled) {
            btn.click();
        }
    } else {
        console.log('❌ No está listo para autenticación');
    }
    
    return { config, apis: apisAvailable };
};

// Testing simple del botón
window.testAuthSimple = function() {
    console.log('🧪 Test auth simple:', {
        gapiReady,
        gisReady,
        tokenClient: !!tokenClient,
        isAuthorized,
        button: !!document.getElementById('googleSignInButton')
    });
    
    const btn = document.getElementById('googleSignInButton');
    if (btn && !btn.disabled) {
        console.log('✅ Probando click...');
        btn.click();
    } else {
        console.log('❌ Botón no disponible');
        updateAuthUI();
    }
};

// Debug completo del estado de autenticación
window.debugAuth = function() {
    console.log('🐛 === ESTADO COMPLETO AUTH ===');
    console.log('Variables globales:', {
        gapiReady,
        gisReady,
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

// =============================================
// EXPORTAR FUNCIONES GLOBALES
// =============================================
window.signIn = signIn;
window.signOut = signOut;
window.getYouTubeLibraryPlaylistItems = getYouTubeLibraryPlaylistItems;

// =============================================
// AUTO-INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM listo para auth simple');
    
    // Esperar un poco para que los scripts de Google se carguen
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 2000);
});

console.log('✅ Módulo de autenticación simple cargado');
