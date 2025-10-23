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
 * Limpiar datos expirados al iniciar
 */
function cleanupExpiredData() {
    console.log('🧹 Limpiando datos expirados...');
    
    const expiresAt = localStorage.getItem('auth_expires_at');
    const now = Date.now();
    
    if (expiresAt && now > parseInt(expiresAt)) {
        console.log('⏰ Token expirado, limpiando...');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_expires_at');
        window.authStatus = { isAuthenticated: false };
    }
    
    // VERIFICAR que unifiedCore exista antes de actualizar UI
    if (window.unifiedCore) {
        window.updateAuthUI();
    } else {
        console.log('⏳ Esperando inicialización de unifiedCore...');
        // Esperar a que unifiedCore esté disponible
        const checkCore = setInterval(() => {
            if (window.unifiedCore) {
                clearInterval(checkCore);
                window.updateAuthUI();
            }
        }, 100);
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
 * Actualizar UI según estado de autenticación
 */
window.updateAuthUI = function() {
    console.log('🔄 Actualizando UI de autenticación');
    
    // VERIFICAR que unifiedCore exista
    if (!window.unifiedCore) {
        console.warn('⚠️ unifiedCore no disponible aún, reintentando...');
        setTimeout(window.updateAuthUI, 100);
        return;
    }
    
    // Obtener estado actual
    const authState = window.authStatus || { isAuthenticated: false };
    
    // Elementos de UI
    const loginBtn = document.getElementById('loginButton');
    const logoutBtn = document.getElementById('logoutButton');
    const mobileLoginBtn = document.getElementById('mobileLoginButton');
    const mobileLogoutBtn = document.getElementById('mobileLogoutButton');
    const userMenuBtn = document.getElementById('userMenuButton');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');

    if (authState.isAuthenticated && authState.user) {
        // Usuario autenticado - MOSTRAR elementos de usuario
        if (loginBtn) loginBtn.style.display = 'none';
        if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'inline-flex';
        if (userMenuBtn) userMenuBtn.style.display = 'flex';
        
        // Actualizar avatar
        if (userAvatar) {
            if (authState.user.photoURL) {
                userAvatar.src = authState.user.photoURL;
                userAvatar.onerror = () => {
                    userAvatar.src = './electronic.ico';
                };
            } else {
                userAvatar.src = './electronic.ico';
            }
        }
        
        // Actualizar nombre
        if (userName) {
            userName.textContent = authState.user.displayName || authState.user.email || 'Usuario';
        }
        
        // Actualizar email
        if (userEmail) {
            userEmail.textContent = authState.user.email || '';
        }
        
        // Marcar como listo en unifiedCore
        window.unifiedCore.state.authReady = true;
        
        console.log('✅ UI actualizada: Usuario autenticado');
        
    } else {
        // Usuario NO autenticado - MOSTRAR botones de login
        if (loginBtn) loginBtn.style.display = 'inline-flex';
        if (mobileLoginBtn) mobileLoginBtn.style.display = 'inline-flex';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none';
        if (userMenuBtn) userMenuBtn.style.display = 'none';
        
        // Marcar como no listo en unifiedCore
        window.unifiedCore.state.authReady = false;
        
        console.log('✅ UI actualizada: Usuario no autenticado');
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
// CONFIGURACIÓN DE LISTENERS DE AUTENTICACIÓN
// =============================================

/**
 * Configurar todos los event listeners de autenticación
 */
function setupAuthListeners() {
    console.log('🔧 Configurando listeners de autenticación...');
    
    // Botón de Login Desktop
    const loginBtn = document.getElementById('loginButton');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
        console.log('✅ Listener de login desktop configurado');
    } else {
        console.warn('⚠️ Botón loginButton no encontrado');
    }
    
    // Botón de Login Mobile
    const mobileLoginBtn = document.getElementById('mobileLoginButton');
    if (mobileLoginBtn) {
        mobileLoginBtn.addEventListener('click', handleLogin);
        console.log('✅ Listener de login mobile configurado');
    }
    
    // Botón de Logout Desktop
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
        console.log('✅ Listener de logout desktop configurado');
    }
    
    // Botón de Logout Mobile
    const mobileLogoutBtn = document.getElementById('mobileLogoutButton');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', handleLogout);
        console.log('✅ Listener de logout mobile configurado');
    }
    
    // Menu de usuario
    const userMenuBtn = document.getElementById('userMenuButton');
    const userMenu = document.getElementById('userMenu');
    
    if (userMenuBtn && userMenu) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenu.classList.toggle('show');
        });
        
        // Cerrar menu al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userMenu.contains(e.target)) {
                userMenu.classList.remove('show');
            }
        });
        
        console.log('✅ Listeners de menú de usuario configurados');
    }
    
    console.log('✅ Todos los listeners de autenticación configurados');
}

/**
 * Manejar inicio de sesión
 */
async function handleLogin() {
    console.log('🔑 Iniciando proceso de login...');
    
    try {
        // Verificar que unifiedCore exista
        if (!window.unifiedCore) {
            throw new Error('Sistema no inicializado');
        }
        
        // Mostrar mensaje de carga
        if (window.unifiedCore.showMessage) {
            window.unifiedCore.showMessage('Iniciando sesión con Google...', 'info');
        }
        
        // Aquí iría la lógica real de autenticación con Google
        // Por ahora, simulamos una autenticación exitosa
        console.log('🔐 Autenticación en progreso...');
        
        // Llamar a la función de Google Sign-In si está disponible
        if (typeof window.signIn === 'function') {
            window.signIn();
        } else {
            console.error('❌ Función signIn no disponible');
            throw new Error('Sistema de autenticación no disponible');
        }
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        if (window.unifiedCore && window.unifiedCore.showMessage) {
            window.unifiedCore.showMessage(`Error: ${error.message}`, 'error');
        }
    }
}

/**
 * Manejar cierre de sesión
 */
async function handleLogout() {
    console.log('👋 Cerrando sesión...');
    
    try {
        // Mostrar confirmación
        if (!confirm('¿Estás seguro de que quieres cerrar sesión?')) {
            return;
        }
        
        // Limpiar datos locales
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_expires_at');
        
        // Actualizar estado global
        window.authStatus = { isAuthenticated: false };
        
        // Llamar a función de Google Sign-Out si está disponible
        if (typeof window.signOut === 'function') {
            window.signOut();
        }
        
        // Actualizar UI
        window.updateAuthUI();
        
        // Mostrar mensaje
        if (window.unifiedCore && window.unifiedCore.showMessage) {
            window.unifiedCore.showMessage('Sesión cerrada exitosamente', 'success');
        }
        
        console.log('✅ Sesión cerrada exitosamente');
        
    } catch (error) {
        console.error('❌ Error en logout:', error);
        if (window.unifiedCore && window.unifiedCore.showMessage) {
            window.unifiedCore.showMessage(`Error cerrando sesión: ${error.message}`, 'error');
        }
    }
}

/**
 * Verificar estado de autenticación
 */
function checkAuthState() {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    const expiresAt = localStorage.getItem('auth_expires_at');
    
    if (!token || !userStr || !expiresAt) {
        return { isAuthenticated: false };
    }
    
    const now = Date.now();
    if (now > parseInt(expiresAt)) {
        console.log('⏰ Token expirado');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_expires_at');
        return { isAuthenticated: false };
    }
    
    try {
        const user = JSON.parse(userStr);
        return {
            isAuthenticated: true,
            user: user,
            token: token
        };
    } catch (error) {
        console.error('❌ Error parseando usuario:', error);
        return { isAuthenticated: false };
    }
}

/**
 * Guardar estado de autenticación
 */
function saveAuthState(authData) {
    try {
        localStorage.setItem('auth_token', authData.token);
        localStorage.setItem('auth_user', JSON.stringify(authData.user));
        
        // Token válido por 7 días
        const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
        localStorage.setItem('auth_expires_at', expiresAt.toString());
        
        window.authStatus = authData;
        
        console.log('✅ Estado de autenticación guardado');
        return true;
    } catch (error) {
        console.error('❌ Error guardando estado de autenticación:', error);
        return false;
    }
}
// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando sistema de autenticación...');
    
    // Limpiar datos expirados
    cleanupExpiredData();
    
    // Configurar listeners (AHORA EXISTE)
    setupAuthListeners();
    
    // Verificar estado de autenticación
    const authState = checkAuthState();
    if (authState.isAuthenticated) {
        window.authStatus = authState;
        console.log('✅ Usuario autenticado encontrado:', authState.user.email || authState.user.displayName);
    } else {
        window.authStatus = { isAuthenticated: false };
        console.log('ℹ️ No hay sesión activa');
    }
    
    // Actualizar UI cuando unifiedCore esté listo
    if (window.unifiedCore) {
        window.updateAuthUI();
    } else {
        console.log('⏳ Esperando inicialización de unifiedCore...');
        const checkCore = setInterval(() => {
            if (window.unifiedCore) {
                clearInterval(checkCore);
                window.updateAuthUI();
                console.log('✅ UI de autenticación sincronizada con unifiedCore');
            }
        }, 100);
        
        // Timeout de seguridad (10 segundos)
        setTimeout(() => {
            if (!window.unifiedCore) {
                console.error('❌ Timeout: unifiedCore no se inicializó');
                clearInterval(checkCore);
            }
        }, 10000);
    }
    
    console.log('✅ Sistema de autenticación iniciado');
});

console.log('✅ Módulo de autenticación con persistencia de 7 días cargado');
