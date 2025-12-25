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
    console.log(`🔑 CLIENT_ID detectado para ${hostname}:`, CLIENT_ID);
}

// =============================================
// PERSISTENCIA DE AUTENTICACIÓN
// =============================================

const AUTH_STORAGE_KEY = 'ytcm_auth_data';
const EXPIRATION_DAYS = 7;

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
    console.log('📡 Inicializando GAPI...');
    
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
    // 1. Verificación básica
    if (!accessToken) {
        isAuthorized = false;
        console.log('❌ No hay token de autenticación válido.');
        updateAuthUI();
        return;
    }

    // 2. Establecer credenciales
    gapi.client.setToken({ access_token: accessToken });
    isAuthorized = true;
    saveAuthData(accessToken);
    
    console.log('✅ Usuario autenticado. Token establecido.');
    
    // 3. Actualizar estado del Core (si ya existe)
    if (window.unifiedCore) {
        window.unifiedCore.state.authReady = true;
    }
    
    // 4. Actualizar UI INMEDIATAMENTE (Botones Conectar/Salir)
    updateAuthUI();
    
    // 5. Cargar Playlists en SEGUNDO PLANO (Non-blocking)
    // Usamos .then() en lugar de await para no detener la carga de la página
    waitForSystemReady().then(() => {
        console.log('📡 Sistema listo, iniciando carga de playlists en segundo plano...');
        
        // Llamada asíncrona: La interfaz ya es usable mientras esto ocurre
        window.loadUserPlaylistsAndStore().then(() => {
      console.log('✅ Carga de playlists completada');
    
    // ✅ Actualizar UI después de cargar
    if (window.playlistManager) {
        window.playlistManager.updatePlaylistsUI();
    }
    
}).catch(err => {
    console.error('❌ Error fatal cargando playlists:', err);
    
    // ✅ Notificar al usuario
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Error cargando tus playlists de YouTube', 'error');
    }
    
    // ✅ No romper la app - continuar sin playlists de YouTube
    console.log('⚠️ Continuando sin playlists de YouTube Library');
});

    }).catch(err => {
        console.error('❌ Error esperando sistema:', err);
    });
}

/**
 * ✅ NUEVA FUNCIÓN: Esperar a que el sistema esté completamente listo
 */
function waitForSystemReady() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout esperando sistema'));
        }, 10000);
        
        const checkInterval = setInterval(() => {
            const coreReady = window.unifiedCore?.state?.initialized;
            const managerReady = window.playlistManager !== undefined;
            
            if (coreReady && managerReady) {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                console.log('✅ Sistema completamente listo:', { coreReady, managerReady });
                resolve();
            }
        }, 100);
    });
}

/**
 * Iniciar sesión
 */
function signIn() {
    console.log('🔐 signIn() llamado');
    console.log('Estados:', { 
        gapiReady, 
        gisReady, 
        tokenClient: !!tokenClient,
        CLIENT_ID 
    });
    
    if (!gapiReady) {
        console.error('❌ GAPI no está cargado');
        showError('Google API no disponible. Por favor recarga la página.');
        return;
    }
    
    if (!gisReady || !tokenClient) {
        console.error('❌ GIS no está listo');
        showError('Sistema de autenticación no listo. Por favor recarga la página.');
        return;
    }

    console.log('🚀 Solicitando token de acceso...');
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Abriendo ventana de Google...', 'info');
    }
    
    try {
        tokenClient.requestAccessToken({ 
            prompt: 'consent'
        });
        console.log('✅ Solicitud de token enviada, esperando popup...');
    } catch (error) {
        console.error('❌ Error solicitando token:', error);
        showError('Error solicitando autorización: ' + error.message);
    }
}

/**
 * Cerrar sesión
 */
function signOut() {
    console.log('🚪 Cerrando sesión...');
    gapi.client.setToken('');
    localStorage.removeItem(AUTH_STORAGE_KEY);
    isAuthorized = false;
    updateAuthUI();
    
    if (window.unifiedCore) {
        window.unifiedCore.clearYouTubeLibrary();
    }
    
    // ✅ DISPARAR EVENTO DE LOGOUT
    document.dispatchEvent(new CustomEvent('userLoggedOut'));
}

/**
 * Actualizar UI de autenticación
 */
function updateAuthUI() {
    console.log('🔄 Actualizando UI de autenticación');
    console.log('Estado:', { isAuthorized, gapiReady, gisReady, tokenClient: !!tokenClient });
    
    const signInBtn = document.getElementById('googleSignInButton');
    const signOutBtn = document.getElementById('googleSignOutButton');
    const mobileSignInBtn = document.getElementById('mobileSignInButton');
    
    if (!signInBtn || !signOutBtn) {
        console.warn('⚠️ Botones no encontrados, reintentando en 500ms...');
        setTimeout(updateAuthUI, 500);
        return;
    }
    
    // Limpiar listeners anteriores usando cloneNode
    const newSignInBtn = signInBtn.cloneNode(true);
    const newSignOutBtn = signOutBtn.cloneNode(true);
    signInBtn.parentNode.replaceChild(newSignInBtn, signInBtn);
    signOutBtn.parentNode.replaceChild(newSignOutBtn, signOutBtn);
    
    // Hacer lo mismo con botón móvil si existe
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
        }
    }
    
    if (isAuthorized) {
        newSignInBtn.classList.add('hidden');
        newSignOutBtn.classList.remove('hidden');
        newSignOutBtn.onclick = signOut;
        console.log('✅ UI: Usuario autenticado');
        
    } else if (gapiReady && gisReady && tokenClient) {
        newSignInBtn.classList.remove('hidden');
        newSignOutBtn.classList.add('hidden');
        newSignInBtn.innerHTML = '<i class="fab fa-google"></i><span> Conectar</span>';
        newSignInBtn.disabled = false;
        newSignInBtn.title = 'Conectarse con Google';
        
        newSignInBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🖱️ ¡Click en botón Conectar detectado!');
            signIn();
        };
        
        console.log('✅ Botón Conectar configurado y listo');
        
    } else {
        newSignInBtn.classList.remove('hidden');
        newSignOutBtn.classList.add('hidden');
        
        if (!gapiReady && !gisReady) {
            newSignInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span> Cargando...</span>';
            newSignInBtn.disabled = true;
        } else if (!gapiReady) {
            newSignInBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span> Error API</span>';
            newSignInBtn.disabled = true;
        } else if (!gisReady || !tokenClient) {
            newSignInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span> Preparando...</span>';
            newSignInBtn.disabled = true;
        }
        
        console.log('⏳ UI: Estado de carga');
    }
}

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
            // 1. Obtener lista básica (1 unidad)
            const response = await gapi.client.youtube.playlistItems.list({
                playlistId: playlistId,
                part: 'snippet,contentDetails', // contentDetails aquí solo da el ID, no la duración
                maxResults: 50,
                pageToken: nextPageToken
            });

            const items = response.result.items;
            const videoIds = [];
            
            // Recolectar IDs válidos
            items.forEach(item => {
                const vidId = item.snippet?.resourceId?.videoId;
                if (vidId) videoIds.push(vidId);
            });

            // 2. Obtener duraciones reales (1 unidad extra por cada 50 videos - ¡Muy barato!)
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

            // 3. Unir datos
            items.forEach(item => {
                const vidId = item.snippet?.resourceId?.videoId;
                if (vidId && durationsMap[vidId]) {
                    videos.push({
                        videoId: vidId,
                        title: item.snippet.title,
                        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                        duration: durationsMap[vidId], // ¡Aquí tendrás la duración real!
                        artist: item.snippet.videoOwnerChannelTitle,
                        source: 'youtube_library',
                        playlistId: playlistId
                    });
                }
            });

            nextPageToken = response.result.nextPageToken;
        } while (nextPageToken);

        return videos;
    } catch (error) {
        console.error("Error cargando playlist:", error);
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
