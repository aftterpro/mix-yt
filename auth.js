console.log('🔐 Cargando módulo OAUTH.');

// =============================================
// CONFIGURACIÓN OAUTH CON DETECCIÓN DE DOMINIO
// =============================================

let CLIENT_ID = null;
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
let isAuthorized = false;
let tokenClient = null;
let gapiReady = false;
let gisReady = false;

/**
 * Función para obtener CLIENT_ID correcto según dominio
 */
function getClientIdForDomain() {
    const hostname = window.location.hostname;
    
    const clientIds = {
        'mix-yt.netlify.app': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
        'mix-yt.pages.dev': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
        'localhost': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
        '127.0.0.1': '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
    };
    
    let clientId = clientIds[hostname];
    
    // Fallback para subdominios de Netlify
    if (!clientId && hostname.includes('netlify.app')) {
         clientId = clientIds['mix-yt.netlify.app']; 
    }
    
    // ✅ NUEVO: Fallback para Cloudflare Pages
    if (!clientId && hostname.includes('pages.dev')) {
         clientId = clientIds['mix-yt.pages.dev']; 
    }
    
    if (!clientId) {
        console.warn('⚠️ CLIENT_ID no encontrado para el dominio actual. Usando fallback.');
        clientId = clientIds['mix-yt.netlify.app'];
    }
    
    CLIENT_ID = clientId;
   // console.log(`🔑 CLIENT_ID detectado para ${hostname}:`, CLIENT_ID);
}

// =============================================
// PERSISTENCIA DE AUTENTICACIÓN
// =============================================

const AUTH_STORAGE_KEY = 'ytcm_auth_data';
const EXPIRATION_DAYS = 7;
const authState = {
    token: null,
    expiry: null,
    timestamp: null
};
function saveAuthData(token) {
    if (!token || typeof token !== 'string') {
        console.error('❌ Token inválido');
        return false;
    }

    // ✅ VALIDAR LONGITUD MÍNIMA
    const trimmedToken = token.trim();
    if (trimmedToken.length < 20) {
        console.error('❌ Token demasiado corto');
        return false;
    }

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);
    
    authState.token = trimmedToken;
    authState.expiry = expirationDate.getTime();
    authState.timestamp = Date.now();
    
    console.log('💾 Token guardado (válido 7 días)');
    return true;
}

function loadAuthData() {
    if (!authState.token || !authState.expiry) {
      //  console.log('📭 No hay datos de autenticación en memoria');
        return null;
    }

    const now = Date.now();
    if (now >= authState.expiry) {
        console.log('🗑️ Token expirado, eliminando...');
        authState.token = null;
        authState.expiry = null;
        return null;
    }

    const daysRemaining = Math.ceil((authState.expiry - now) / (24 * 60 * 60 * 1000));
  //  console.log(`✅ Token válido (${daysRemaining} días restantes)`);
    
    return authState.token;
} 

function clearAuthData() {
    authState.token = null;
    authState.expiry = null;
    authState.timestamp = null;
}
// =============================================
// INICIALIZACIÓN DE APIS
// =============================================

function initializeGoogleAPIs() {
    getClientIdForDomain();
    
    console.log('📡 Iniciando carga de Google APIs...');
    
    // ✅ VERIFICAR Y CARGAR GAPI
    if (typeof gapi !== 'undefined') {
        gapi.load('client', gapiInitialize_auth);
    } else {
        console.warn('⚠️ GAPI no disponible, esperando carga...');
        // Reintentar después de 1 segundo
        setTimeout(() => {
            if (typeof gapi !== 'undefined') {
                gapi.load('client', gapiInitialize_auth);
            } else {
                console.error('❌ GAPI no se cargó correctamente');
            }
        }, 1000);
    }
    
    // ✅ VERIFICAR Y CARGAR GIS (Google Identity Services)
    setTimeout(() => {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            console.log('✅ GIS ya disponible, inicializando...');
            window.gisInitalize_auth();
        } else {
            console.warn('⚠️ GIS no disponible aún, esperando...');
            // Configurar listener para cuando se cargue
            const checkGIS = setInterval(() => {
                if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                    console.log('✅ GIS detectado, inicializando...');
                    clearInterval(checkGIS);
                    window.gisInitalize_auth();
                }
            }, 500);
            
            // Timeout de seguridad (15 segundos)
            setTimeout(() => {
                clearInterval(checkGIS);
                if (!gisReady) {
                    console.error('❌ GIS no se cargó después de 15s');
                    updateAuthUI();
                }
            }, 15000);
        }
    }, 500);
}

/**
 * Inicializa gapi.client (YouTube API)
 */
window.gapiInitialize_auth = function() {
 //   console.log('📡 Inicializando GAPI...');
    
    gapi.client.init({
        apiKey: 'AIzaSyDg1EMvKc4D--b6hXTSOhR3ANrLPHsyIH4',
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
    }).then(() => {
        return gapi.client.load('youtube', 'v3');
    }).then(() => {
        gapiReady = true;
        console.log('✅ GAPI y YouTube v3 cargados.');
        checkAndUpdateUI();
        handleAuthResult(loadAuthData());
    }).catch((err) => {
        console.error('❌ Error cargando GAPI/YouTube API:', err);
        gapiReady = false;
        updateAuthUI();
    });
};

/**
 * ✅ CORREGIDO: Inicializa el cliente de token GIS
 */
window.gisInitalize_auth = function() {
    console.log('🔑 gisInitalize_auth llamado');
    
    if (!CLIENT_ID) {
        console.error('❌ CLIENT_ID no disponible');
        return;
    }
    
    // ✅ VERIFICAR QUE GOOGLE.ACCOUNTS ESTÉ DISPONIBLE
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        console.error('❌ google.accounts.oauth2 no disponible');
        setTimeout(() => window.gisInitalize_auth(), 500);
        return;
    }
    
    console.log('🔑 Inicializando GIS Token Client...');
    console.log('CLIENT_ID:', CLIENT_ID);
    
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                console.log('🎉 Respuesta de token recibida:', tokenResponse);
                
                if (tokenResponse.error) {
                    console.error('❌ Error en token:', tokenResponse.error);
                    showError('Error de autenticación: ' + tokenResponse.error);
                    return;
                }
                
                handleAuthResult(tokenResponse.access_token);
            },
        });
        
        gisReady = true;
        console.log('✅ GIS Token Client inicializado correctamente');
        checkAndUpdateUI();
        
    } catch (error) {
        console.error('❌ Error inicializando GIS:', error);
        console.error('Error completo:', error);
        gisReady = false;
        updateAuthUI();
    }
};

/**
 * Verificar estado y actualizar UI
 */
function checkAndUpdateUI() {
    console.log('🔍 Verificando estado de APIs:', { gapiReady, gisReady, tokenClient: !!tokenClient });
    
    if (gapiReady && gisReady && tokenClient) {
        console.log('✅ Todas las APIs listas, configurando botones...');
        updateAuthUI();
    }
}

// =============================================
// MANEJO DE ESTADO DE AUTENTICACIÓN
// =============================================

function handleAuthResult(accessToken) {
    // ✅ VALIDACIÓN MEJORADA
    if (!accessToken) {
        isAuthorized = false;
        console.log('❌ Token no proporcionado');
        updateAuthUI();
        return;
    }
    
    if (typeof accessToken !== 'string') {
        console.error('❌ Token no es string:', typeof accessToken);
        isAuthorized = false;
        updateAuthUI();
        return;
    }
    
    const trimmedToken = accessToken.trim();
    if (trimmedToken === '') {
        console.error('❌ Token vacío después de trim');
        isAuthorized = false;
        updateAuthUI();
        return;
    }
    
    // ✅ VALIDAR FORMATO BÁSICO (debe ser un JWT o token válido)
    if (trimmedToken.length < 20) {
        console.error('❌ Token demasiado corto:', trimmedToken.length);
        isAuthorized = false;
        updateAuthUI();
        return;
    }

    try {
        // 2. Establecer credenciales
        gapi.client.setToken({ access_token: trimmedToken });
        isAuthorized = true;
        
        // 3. Guardar token
        const saved = saveAuthData(trimmedToken);
        if (!saved) {
            console.warn('⚠️ Token no se pudo guardar, pero sesión activa');
        }
        
        console.log('✅ Usuario autenticado correctamente');
        
        // 4. Actualizar estado del Core
        if (window.unifiedCore) {
            window.unifiedCore.state.authReady = true;
        }
        
        // 5. Actualizar UI INMEDIATAMENTE
        updateAuthUI();
        
        // 6. Cargar Playlists en segundo plano (non-blocking)
        setTimeout(() => {
            loadPlaylistsInBackground();
        }, 500);
        
    } catch (error) {
        console.error('❌ Error en handleAuthResult:', error);
        isAuthorized = false;
        updateAuthUI();
        showError('Error configurando autenticación: ' + error.message);
    }
}
async function loadPlaylistsInBackground() {
    try {
        // Esperar a que el sistema esté listo
        await waitForSystemReady();
        
      //  console.log('📡 Cargando playlists de YouTube en segundo plano...');
        
        const playlists = await window.loadUserPlaylistsAndStore();
        
        if (playlists) {
            console.log('✅ Playlists cargadas correctamente');
        }
        
    } catch (error) {
        console.error('❌ Error cargando playlists:', error);
        
        // No mostrar error al usuario si ya está usando la app
        if (window.unifiedCore) {
            window.unifiedCore.showMessage(
                'Las playlists de YouTube no se pudieron cargar', 
                'warning'
            );
        }
    }
}

function waitForSystemReady() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            clearInterval(checkInterval);
            console.warn('⏰ Timeout esperando sistema (10s)');
            reject(new Error('Timeout esperando sistema'));
        }, 10000);
        
        const checkInterval = setInterval(() => {
            const coreReady = window.unifiedCore?.state?.initialized;
            const managerReady = window.playlistManager !== undefined;
            
            if (coreReady && managerReady) {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                console.log('✅ Sistema listo:', { coreReady, managerReady });
                resolve();
            }
        }, 100);
    });
}

/**
 * Iniciar sesión
 */
function signIn() {
    console.log('🔐 Iniciando proceso de login...');
    
    // Validar estado de las APIs
    const status = {
        gapiReady,
        gisReady,
        tokenClient: !!tokenClient,
        CLIENT_ID: !!CLIENT_ID
    };
    
    console.log('📊 Estado de APIs:', status);
    
    // Validaciones
    if (!gapiReady) {
        showError('Google API no está lista. Recarga la página.');
        return;
    }
    
    if (!gisReady || !tokenClient) {
        showError('Sistema de autenticación no listo. Recarga la página.');
        return;
    }

    if (!CLIENT_ID) {
        showError('Configuración incompleta. Contacta al administrador.');
        return;
    }

   // console.log('🚀 Solicitando token de acceso...');
    
    // Mostrar mensaje al usuario
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Abriendo ventana de Google...', 'info');
    }
    
    try {
        // Solicitar autorización
        tokenClient.requestAccessToken({ 
            prompt: 'consent' // Forzar consentimiento para refresh
        });
        
        console.log('✅ Solicitud enviada, esperando respuesta del usuario...');
        
    } catch (error) {
        console.error('❌ Error solicitando token:', error);
        showError('Error al iniciar sesión: ' + error.message);
    }
}


/**
 * Cerrar sesión
 */
function signOut() {
    console.log('🚪 Cerrando sesión...');
    
    try {
        // Revocar token en Google
        if (gapi?.client?.getToken()) {
            const token = gapi.client.getToken();
            if (token && token.access_token) {
                // Intentar revocar (no bloqueante)
                fetch(`https://oauth2.googleapis.com/revoke?token=${token.access_token}`, {
                    method: 'POST'
                }).catch(e => console.warn('⚠️ No se pudo revocar token:', e));
            }
        }
        
        // Limpiar token local
        gapi.client.setToken('');
        
        // Limpiar storage
        localStorage.removeItem(AUTH_STORAGE_KEY);
        
        // Actualizar estado
        isAuthorized = false;
        updateAuthUI();
        
        // Limpiar biblioteca de YouTube
        if (window.unifiedCore) {
            window.unifiedCore.clearYouTubeLibrary();
        }
        
        // Disparar evento de logout
        document.dispatchEvent(new CustomEvent('userLoggedOut'));
        
        console.log('✅ Sesión cerrada correctamente');
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('Sesión cerrada', 'success');
        }
        
    } catch (error) {
        console.error('❌ Error cerrando sesión:', error);
        // Forzar limpieza incluso si hay error
        localStorage.removeItem(AUTH_STORAGE_KEY);
        isAuthorized = false;
        updateAuthUI();
    }
}


/**
 * Actualizar UI de autenticación
 */
function updateAuthUI() {
    console.log('🔄 Actualizando UI de autenticación');
    
    const status = {
        isAuthorized,
        gapiReady,
        gisReady,
        tokenClient: !!tokenClient
    };
    
    console.log('📊 Estado:', status);
    
    const signInBtn = document.getElementById('googleSignInButton');
    const signOutBtn = document.getElementById('googleSignOutButton');
    const mobileSignInBtn = document.getElementById('mobileSignInButton');
    
    if (!signInBtn || !signOutBtn) {
        console.warn('⚠️ Botones no encontrados, reintentando en 500ms...');
        setTimeout(updateAuthUI, 500);
        return;
    }
    
    // ✅ CORRECCIÓN: Limpiar listeners con cloneNode
    const newSignInBtn = signInBtn.cloneNode(true);
    const newSignOutBtn = signOutBtn.cloneNode(true);
    signInBtn.parentNode.replaceChild(newSignInBtn, signInBtn);
    signOutBtn.parentNode.replaceChild(newSignOutBtn, signOutBtn);
    
    // Botón móvil
    if (mobileSignInBtn) {
        const newMobileBtn = mobileSignInBtn.cloneNode(true);
        mobileSignInBtn.parentNode.replaceChild(newMobileBtn, mobileSignInBtn);
        
        if (isAuthorized) {
            newMobileBtn.style.display = 'none';
        } else if (gapiReady && gisReady && tokenClient) {
            newMobileBtn.style.display = 'inline-flex';
            newMobileBtn.disabled = false;
            newMobileBtn.onclick = signIn;
        } else {
            newMobileBtn.style.display = 'inline-flex';
            newMobileBtn.disabled = true;
            newMobileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
        }
    }
    
    // Estado: Usuario autenticado
    if (isAuthorized) {
        newSignInBtn.classList.add('hidden');
        newSignOutBtn.classList.remove('hidden');
        newSignOutBtn.onclick = signOut;
        console.log('✅ UI: Usuario autenticado');
        
    // Estado: Listo para login
    } else if (gapiReady && gisReady && tokenClient) {
        newSignInBtn.classList.remove('hidden');
        newSignOutBtn.classList.add('hidden');
        newSignInBtn.innerHTML = '<i class="fab fa-google"></i><span> Conectar</span>';
        newSignInBtn.disabled = false;
        newSignInBtn.title = 'Conectarse con Google';
        
        newSignInBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🖱️ Click en Conectar detectado');
            signIn();
        };
        
        console.log('✅ Botón Conectar configurado');
        
    // Estado: Cargando
    } else {
        newSignInBtn.classList.remove('hidden');
        newSignOutBtn.classList.add('hidden');
        
        if (!gapiReady && !gisReady) {
            newSignInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span> Cargando...</span>';
            newSignInBtn.disabled = true;
        } else if (!gapiReady) {
            newSignInBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span> Error API</span>';
            newSignInBtn.disabled = true;
            newSignInBtn.title = 'Error cargando Google API';
        } else if (!gisReady || !tokenClient) {
            newSignInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span> Preparando...</span>';
            newSignInBtn.disabled = true;
        }
        
        console.log('⏳ UI: Estado de carga');
    }
}

function startTokenValidation() {
    // Validar token cada 5 minutos
    const validationInterval = setInterval(() => {
        if (!isAuthorized) {
            clearInterval(validationInterval);
            return;
        }
        
        const savedToken = loadAuthData();
        
        if (!savedToken) {
            console.warn('⚠️ Token expirado detectado');
            
            // Limpiar estado
            isAuthorized = false;
            
            // Limpiar UI
            updateAuthUI();
            
            // Limpiar biblioteca
            if (window.unifiedCore) {
                window.unifiedCore.clearYouTubeLibrary();
            }
            
            // Disparar evento
            document.dispatchEvent(new CustomEvent('tokenExpired'));
            
            // Mostrar mensaje al usuario
            if (window.unifiedCore) {
                window.unifiedCore.showMessage(
                    'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
                    'warning'
                );
            }
            
            clearInterval(validationInterval);
        }
    }, 5 * 60 * 1000); // 5 minutos
    
    console.log('✅ Validación automática de token iniciada');
}
//  LISTENER PARA TOKEN EXPIRADO
document.addEventListener('tokenExpired', () => {
    console.log('🔒 Token expirado - Limpiando datos de usuario');
    
    // Limpiar playlists de YouTube Library
    if (window.playlistManager && window.playlistManager.clearYouTubeLibraryPlaylists) {
        window.playlistManager.clearYouTubeLibraryPlaylists();
    }
    
    // Actualizar UI
    if (window.unifiedCore) {
        window.unifiedCore.updatePlaylistsUI();
    }
});
/**
 * Mostrar error
 */
function showError(message) {
    console.error('🔴', message);
    if (window.unifiedCore && window.unifiedCore.showMessage) {
        window.unifiedCore.showMessage(message, 'error');
    } else {
        alert(message);
    }
}

// =============================================
// ACCESO A DATOS DE YOUTUBE
// =============================================
async function getYouTubeLibraryPlaylistItems(playlistId) {
    if (!isAuthorized) return [];

    let videos = [];
    let nextPageToken = null;

    try {
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                playlistId: playlistId,
                part: 'snippet,contentDetails',
                maxResults: 50,
                pageToken: nextPageToken
            });

            const items = response.result.items;
            const videoIds = items.map(item => item.snippet?.resourceId?.videoId).filter(Boolean);

            // 1. Obtener duraciones reales
            let durationsMap = {};
            if (videoIds.length > 0) {
                const videosResponse = await gapi.client.youtube.videos.list({
                    part: 'contentDetails',
                    id: videoIds.join(',')
                });
                videosResponse.result.items.forEach(v => {
                    durationsMap[v.id] = parseDuration(v.contentDetails.duration);
                });
            }

            // 2. Unir datos con LIMPIEZA DE ARTISTA
            items.forEach(item => {
                const vidId = item.snippet?.resourceId?.videoId;
                const title = item.snippet.title;
                
                if (vidId && durationsMap[vidId]) {
                    let rawArtist = item.snippet.videoOwnerChannelTitle || '';
                    let cleanArtist = rawArtist.replace(/\s*-\s*Topic$/i, '').trim();

                    if (!cleanArtist || 
                        cleanArtist.toLowerCase() === 'youtube' || 
                        cleanArtist.toLowerCase() === 'youtube music') {
                        
                        if (title.includes(' - ')) {
                            cleanArtist = title.split(' - ')[0].trim();
                        } else {
                            cleanArtist = 'Artista Desconocido';
                        }
                    }

                    videos.push({
                        videoId: vidId,
                        title: title,
                        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                        duration: durationsMap[vidId],
                        artist: cleanArtist, 
                        source: 'youtube_library',
                        playlistId: playlistId
                    });
                }
            });

            nextPageToken = response.result.nextPageToken;
        } while (nextPageToken);

        return videos;
    } catch (error) {
        console.error("❌ Error cargando playlist de YouTube:", error);
        return [];
    }
}

// Función auxiliar para convertir ISO 8601 (PT3M20S) a segundos
function parseDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
}

window.loadUserPlaylists = async function() {
    if (!isAuthorized) {
        console.error('❌ Usuario no autorizado.');
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
 * ✅ CORREGIDO: Ahora espera al sistema y dispara evento correcto
 */
window.loadUserPlaylistsAndStore = async function() {
    if (!isAuthorized) {
        console.log('❌ No autorizado.');
        return;
    }

    // ✅ ESPERAR A QUE EL SISTEMA ESTÉ LISTO
    try {
        await waitForSystemReady();
    } catch (error) {
        console.error('❌ Sistema no listo después de timeout:', error);
        return;
    }

    console.log('📡 Cargando playlists de YouTube...');
    
    const playlistsMetadata = await window.loadUserPlaylists();
    
    if (playlistsMetadata.length === 0) {
        console.log('📭 No hay playlists para sincronizar');
        if (window.playlistManager) {
            window.playlistManager.clearYouTubeLibraryPlaylists();
        }
        return;
    }
    
    // Cargar videos de cada playlist
    const loadPromises = playlistsMetadata.map(async (playlist) => {
        const videos = await getYouTubeLibraryPlaylistItems(playlist.id);
        return {
            ...playlist,
            videos: videos,
            dateSynced: Date.now()
        };
    });

    const detailedPlaylists = await Promise.all(loadPromises);
    
    console.log(`✅ ${detailedPlaylists.length} playlists cargadas con videos`);
    
    // ✅ DISPARAR EVENTO UNIFICADO
    document.dispatchEvent(new CustomEvent('youtubePlaylistsReady', {
        detail: {
            playlists: detailedPlaylists,
            source: 'sync'
        }
    }));
    
    console.log('✅ Evento youtubePlaylistsReady disparado');
};

// =============================================
// EXPORTAR FUNCIONES GLOBALES
// =============================================
window.signIn = signIn;
window.signOut = signOut;
window.getYouTubeLibraryPlaylistItems = getYouTubeLibraryPlaylistItems;
window.isAuthorized = () => isAuthorized;

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM cargado, inicializando auth...');
    
    initializeGoogleAPIs();
    
    const savedToken = loadAuthData();
    if (savedToken) {
        console.log('🔑 Token guardado encontrado, intentando restaurar sesión...');
    }
    
    console.log('✅ Sistema de autenticación iniciado');
});
// Iniciar validación automática
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTokenValidation);
} else {
    startTokenValidation();
}
// =============================================
// FUNCIÓN DE DEBUG
// =============================================
window.debugYouTubeSync = function() {
    console.log('🐛 Estado de sincronización:', {
        isAuthorized,
        gapiReady,
        gisReady,
        coreReady: window.unifiedCore?.state?.initialized,
        playlistManagerReady: !!window.playlistManager
    });
};

console.log('✅ Módulo de autenticación cargado');
