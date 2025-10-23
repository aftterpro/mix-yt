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

// Exponer globalmente
window.signIn = signIn;

function updateAuthUI() {
    const signInBtn = document.getElementById('googleSignInButton');
    const signOutBtn = document.getElementById('googleSignOutButton');
    
    // ✅ AGREGAR BOTÓN MÓVIL
    const mobileSignInBtn = document.getElementById('mobileSignInButton');
    
    if (!signInBtn || !signOutBtn) {
        console.warn('⚠️ Botones desktop no encontrados, reintentando...');
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
        
        // NUEVO: Mostrar información de persistencia
        const storedToken = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN);
        if (storedToken) {
            try {
                const tokenData = JSON.parse(storedToken);
                const daysRemaining = Math.ceil((tokenData.custom_expiry - Date.now()) / (24 * 60 * 60 * 1000));
                signOutBtn.title = `Conectado por ${daysRemaining} días más`;
            } catch (e) {
                signOutBtn.title = 'Conectado';
            }
        }
        
    } else if (gapiReady && gisReady && tokenClient) {
        // TODO listo para autenticar
        signInBtn.classList.remove('hidden');
        signOutBtn.classList.add('hidden');
        signInBtn.innerHTML = '<i class="fab fa-google"></i><span> Conectar</span>';
        signInBtn.disabled = false;
        signInBtn.title = 'Conectarse y mantener sesión por 7 días';
        
        // ASIGNAR EL LISTENER CRÍTICO
        signInBtn.onclick = function(e) {
            e.preventDefault();
            console.log('🚀 ¡Click en conectar detectado!');
            signIn();
        };
        
        console.log('✅ Botón listo para autenticación');
    } else {
        // Estados de carga
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
    
    // Sincronizar botones móviles
    syncMobileAuthButtons();
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
    
    // Elementos de UI (usar los IDs correctos)
    const loginBtn = document.getElementById('googleSignInButton');
    const logoutBtn = document.getElementById('googleSignOutButton');
    const mobileLoginBtn = document.getElementById('mobileSignInButton');
    const mobileLogoutBtn = document.getElementById('mobileSignOutButton');
    const userMenuBtn = document.getElementById('userMenuButton');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');

    if (authState.isAuthenticated && authState.user) {
        // Usuario autenticado
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
        // Usuario NO autenticado
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
function setupAuthListeners() {
    console.log('🔧 Configurando listeners de autenticación...');
    
    // Botón de Login Desktop
    const loginBtn = document.getElementById('googleSignInButton');
    if (loginBtn) {
        // IMPORTANTE: Remover listeners previos
        const newLoginBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
        
        newLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🚀 Click en botón de login detectado');
            handleLogin();
        });
        console.log('✅ Listener de login desktop configurado');
    }
    
    // Botón de Login Mobile
    const mobileLoginBtn = document.getElementById('mobileSignInButton');
    if (mobileLoginBtn) {
        const newMobileBtn = mobileLoginBtn.cloneNode(true);
        mobileLoginBtn.parentNode.replaceChild(newMobileBtn, mobileLoginBtn);
        
        newMobileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLogin();
        });
        console.log('✅ Listener de login mobile configurado');
    }
}

/**
 * Manejar inicio de sesión
 */
async function handleLogin() {
    console.log('🔑 Iniciando proceso de login...');
    
    if (!gapiReady || !gisReady || !tokenClient) {
        console.error('❌ APIs no están listas:', { gapiReady, gisReady, tokenClient: !!tokenClient });
        alert('Sistema de autenticación no está listo. Por favor recarga la página.');
        return;
    }
    
    try {
        console.log('🚀 Solicitando autorización de Google...');
        
        // CRÍTICO: Usar requestAccessToken correctamente
        tokenClient.requestAccessToken({ 
            prompt: 'consent',
            hint: '', // Dejar vacío para forzar selector de cuenta
        });
        
        console.log('✅ Popup de Google debería aparecer ahora');
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        alert(`Error al iniciar sesión: ${error.message}`);
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
    
    // NO llamar a setupAuthListeners si updateAuthUI ya configura los botones
    // setupAuthListeners(); // COMENTAR O ELIMINAR ESTA LÍNEA
    
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
                // La función updateAuthUI del auth.js original ya configura los botones
                if (typeof updateAuthUI === 'function') {
                    updateAuthUI();
                }
                console.log('✅ UI de autenticación sincronizada');
            }
        }, 100);
        
        // Timeout de seguridad
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
