console.log('🔐 Cargando módulo OAUTH .');

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

// NUEVA CONFIGURACIÓN DE PERSISTENCIA
const PERSISTENCE_CONFIG = {
    TOKEN_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 días en millisegundos
    PLAYLISTS_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 días en millisegundos
    STORAGE_KEYS: {
        TOKEN: 'ytcm_google_token',
        PLAYLISTS: 'ytcm_youtube_playlists',
        USER_INFO: 'ytcm_user_info'
    }
};

// Estado de autenticación
let gapiReady = false;
let gisReady = false;
let tokenClient = null;
let isAuthorized = false;
const YOUTUBE_LIBRARY_SOURCE_ID = 'youtube_library';

// =============================================
// FUNCIONES DE PERSISTENCIA MEJORADAS
// =============================================

function saveTokenWithExpiration(tokenData) {
    try {
        const tokenToSave = {
            access_token: tokenData.access_token,
            token_type: tokenData.token_type || 'Bearer',
            expires_in: tokenData.expires_in || 3600,
            scope: tokenData.scope || GOOGLE_CONFIG.SCOPES,
            timestamp: Date.now(),
            // NUEVO: Fecha de expiración personalizada (7 días)
            custom_expiry: Date.now() + PERSISTENCE_CONFIG.TOKEN_DURATION
        };
        
        localStorage.setItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN, JSON.stringify(tokenToSave));
        
        console.log('💾 Token guardado con expiración extendida:', {
            expires_in_hours: tokenData.expires_in / 3600,
            custom_expiry_days: PERSISTENCE_CONFIG.TOKEN_DURATION / (24 * 60 * 60 * 1000),
            saved_at: new Date().toLocaleString()
        });
        
        return true;
    } catch (error) {
        console.error('❌ Error guardando token:', error);
        return false;
    }
}

function savePlaylistsWithExpiration(playlists) {
    try {
        const playlistsToSave = {
            data: playlists,
            timestamp: Date.now(),
            expires_at: Date.now() + PERSISTENCE_CONFIG.PLAYLISTS_DURATION
        };
        
        localStorage.setItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlistsToSave));
        console.log(`💾 ${playlists.length} playlists guardadas con expiración de 7 días`);
        
        return true;
    } catch (error) {
        console.error('❌ Error guardando playlists:', error);
        return false;
    }
}

function getStoredPlaylists() {
    try {
        const storedData = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS);
        if (!storedData) return null;
        
        const parsed = JSON.parse(storedData);
        const now = Date.now();
        
        // Verificar si han expirado
        if (now > parsed.expires_at) {
            console.log('📅 Playlists guardadas han expirado, eliminando...');
            localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS);
            return null;
        }
        
        const daysRemaining = Math.ceil((parsed.expires_at - now) / (24 * 60 * 60 * 1000));
        console.log(`📚 Playlists cargadas desde almacenamiento (${daysRemaining} días restantes)`);
        
        return parsed.data;
    } catch (error) {
        console.error('❌ Error cargando playlists guardadas:', error);
        localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS);
        return null;
    }
}

function saveUserInfo(userInfo) {
    try {
        const userToSave = {
            ...userInfo,
            timestamp: Date.now(),
            expires_at: Date.now() + PERSISTENCE_CONFIG.TOKEN_DURATION
        };
        
        localStorage.setItem(PERSISTENCE_CONFIG.STORAGE_KEYS.USER_INFO, JSON.stringify(userToSave));
        console.log('👤 Información de usuario guardada');
        
        return true;
    } catch (error) {
        console.error('❌ Error guardando info de usuario:', error);
        return false;
    }
}

function getStoredUserInfo() {
    try {
        const storedData = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.USER_INFO);
        if (!storedData) return null;
        
        const parsed = JSON.parse(storedData);
        
        if (Date.now() > parsed.expires_at) {
            localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.USER_INFO);
            return null;
        }
        
        return parsed;
    } catch (error) {
        console.error('❌ Error cargando info de usuario:', error);
        localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.USER_INFO);
        return null;
    }
}

// =============================================
// FUNCIÓN DE DEBUGGING OAUTH - ACTUALIZADA
// =============================================
window.debugOAuth = function() {    
    const info = {
        currentOrigin: window.location.origin,
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        clientId: GOOGLE_CONFIG.CLIENT_ID,
        apiKey: GOOGLE_CONFIG.API_KEY,
        scopes: GOOGLE_CONFIG.SCOPES,
        // NUEVO: Info de persistencia
        tokenStored: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN),
        playlistsStored: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS),
        persistenceDays: PERSISTENCE_CONFIG.TOKEN_DURATION / (24 * 60 * 60 * 1000)
    };
    
  //  console.table(info);
    
    // Verificar tokens almacenados
    const storedToken = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN);
    if (storedToken) {
        try {
            const tokenData = JSON.parse(storedToken);
            const timeRemaining = tokenData.custom_expiry - Date.now();
            const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
        
        } catch (e) {
            console.error('❌ Token corrupto:', e);
        }
    }
    
    // Verificar origen permitido
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
// INICIALIZAR GOOGLE APIS - MEJORADO
// =============================================
async function initializeGoogleAPIs() {
    try {
        console.log('🚀 Inicializando Google APIs con persistencia de 7 días...');
        
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
        
        tokenClient = google.accounts.oauth2.initTokenClient(tokenClientConfig);
        
        if (!tokenClient) {
            throw new Error('No se pudo crear tokenClient');
        }
        
        console.log('✅ GIS inicializado correctamente');
        gisReady = true;
        
        // Marcar APIs como listas en el estado global
        if (window.ytCrossMixAPIs) {
            window.ytCrossMixAPIs.gapi = true;
            window.ytCrossMixAPIs.gis = true;
        }
        
        // Actualizar UI
        updateAuthUI();
        
        // MEJORADO: Verificar token guardado Y playlists guardadas
        setTimeout(() => {
            checkStoredToken();
            loadStoredPlaylistsIfAvailable();
        }, 1000);
        
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
// NUEVA FUNCIÓN: CARGAR PLAYLISTS ALMACENADAS
// =============================================
// Función mejorada 
function loadStoredPlaylistsIfAvailable() {
    const storedPlaylists = getStoredPlaylists();
    
    if (!storedPlaylists || !Array.isArray(storedPlaylists) || storedPlaylists.length === 0) {
        return false;
    }

    console.log(`📚 Cargando ${storedPlaylists.length} playlists desde almacenamiento local`);
    
    // Verificar si ya están procesadas
    if (window.playlistsAlreadyProcessed) {
        console.log('⚠️ Playlists ya procesadas anteriormente');
        return true;
    }
    
    // Marcar como procesadas INMEDIATAMENTE
    window.playlistsAlreadyProcessed = true;
    
    // Crear evento personalizado con los datos
    const playlistEvent = new CustomEvent('youtubePlaylistsReady', {
        detail: {
            playlists: storedPlaylists,
            source: 'localStorage',
            timestamp: Date.now()
        }
    });
    
    // Usar requestIdleCallback para no bloquear el hilo principal
    if (window.requestIdleCallback) {
        requestIdleCallback(() => {
            document.dispatchEvent(playlistEvent);
        });
    } else {
        // Fallback para navegadores que no soportan requestIdleCallback
        setTimeout(() => {
            document.dispatchEvent(playlistEvent);
        }, 16); // ~1 frame
    }
    
    console.log('✅ Playlists enviadas via evento youtubePlaylistsReady');
    return true;
}
// =============================================
// MANEJAR RESPUESTA DE AUTENTICACIÓN - MEJORADO
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
        console.log('✅ Token recibido exitosamente - Guardando con expiración extendida');
        isAuthorized = true;
        
        // Configurar el token en gapi.client inmediatamente
        gapi.client.setToken({
            access_token: response.access_token
        });
        
        // MEJORADO: Guardar token con expiración extendida
        const tokenSaved = saveTokenWithExpiration(response);
        
        if (tokenSaved) {
            console.log('💾 Token guardado correctamente con duración de 7 días');
        }
        
        updateAuthUI();
        
        // MEJORADO: Cargar playlists y guardarlas automáticamente
        setTimeout(async () => {
            console.log('🔄 Cargando y guardando playlists del usuario...');
            await loadUserPlaylistsAndStore();
        }, 500);
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('¡Conectado exitosamente por 7 días!', 'success');
        }
        
        // Exponer estado globalmente para otras funciones
        window.isAuthorized = true;
        
        // NUEVO: Obtener y guardar información básica del usuario
        getUserInfoAndStore();
        
    } else {
        console.warn('⚠️ Respuesta sin token:', response);
        showError('No se recibió token de acceso');
    }
}

// =============================================
// NUEVA FUNCIÓN: OBTENER INFO DE USUARIO
// =============================================
async function getUserInfoAndStore() {
    try {
        const response = await gapi.client.youtube.channels.list({
            part: ['snippet'],
            mine: true
        });
        
        if (response.result.items?.length > 0) {
            const channel = response.result.items[0];
            const userInfo = {
                channelId: channel.id,
                title: channel.snippet.title,
                thumbnail: channel.snippet.thumbnails?.default?.url,
                description: channel.snippet.description
            };
            
            saveUserInfo(userInfo);
            console.log('👤 Información de usuario guardada:', userInfo.title);
        }
    } catch (error) {
        console.error('❌ Error obteniendo info de usuario:', error);
    }
}

// =============================================
// GESTIÓN DE SESIÓN - MEJORADA
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

// Cerrar sesión - MEJORADO
function signOut() {
    console.log('👋 Cerrando sesión y limpiando almacenamiento persistente...');
    
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

        // MEJORADO: Limpiar TODO el almacenamiento persistente
        Object.values(PERSISTENCE_CONFIG.STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        
        // También limpiar cualquier otro dato relacionado
        localStorage.removeItem('google_token'); // Token antiguo
        localStorage.removeItem('ytcm_playlists'); // Playlists del core
        
        console.log('🧹 Almacenamiento completamente limpiado');
        
        isAuthorized = false;
        window.isAuthorized = false;
        updateAuthUI();
        
        // Disparar evento de logout
        document.dispatchEvent(new CustomEvent('userLoggedOut'));
        
if (window.unifiedCore) {
    window.unifiedCore.showMessage('Sesión cerrada completamente', 'success');
    
    // Limpiar playlists de YouTube del sistema unificado
    if (window.playlistManager) {
        window.playlistManager.clearYouTubeLibraryPlaylists();
    }
}
        
    } catch (error) {
        console.error("❌ Error cerrando sesión:", error);
    } finally {
        console.log("🧹 Limpieza de sesión completada");
    }
}

// MEJORADO: Verificar token guardado con validación de expiración extendida
function checkStoredToken() {
    console.log('🔍 Verificando token guardado con persistencia extendida...');
    
    const storedToken = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN);
    if (!storedToken) {
        console.log('📱 No hay token guardado');
        return false;
    }

    try {
        const tokenData = JSON.parse(storedToken);
        const now = Date.now();
        
        // MEJORADO: Verificar expiración personalizada (7 días)
        if (now >= tokenData.custom_expiry) {
            console.log('⏰ Token expirado después de 7 días, eliminando...');
            localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN);
            return false;
        }
        
        const timeRemaining = tokenData.custom_expiry - now;
        const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
        
        console.log('📱 Token válido encontrado:', {
            days_remaining: daysRemaining,
            saved_at: new Date(tokenData.timestamp).toLocaleString()
        });

        if (tokenData.access_token && gapiReady) {
            console.log('📱 Configurando token en gapi.client...');
            
            // Configurar token en gapi.client
            gapi.client.setToken({
                access_token: tokenData.access_token
            });
            
            // Verificar si el token sigue siendo válido con Google
            return testTokenValidity();
        }
    } catch (error) {
        console.error('❌ Error procesando token guardado:', error);
        localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN);
        return false;
    }
}

// MEJORADO: Probar validez del token
async function testTokenValidity() {
    try {
        console.log('🔍 Verificando validez del token con Google...');
        
        // Hacer una llamada simple para verificar el token
        const response = await gapi.client.youtube.channels.list({
            part: ['id'],
            mine: true,
            maxResults: 1
        });
        
        if (response.result) {
            console.log('✅ Token válido, usuario autenticado persistentemente');
            isAuthorized = true;
            window.isAuthorized = true;
            updateAuthUI();
            
            // MEJORADO: Cargar playlists guardadas O obtenerlas de nuevo
            setTimeout(async () => {
                const playlistsLoaded = loadStoredPlaylistsIfAvailable();
                
                if (!playlistsLoaded) {
                    console.log('🔄 No hay playlists guardadas, obteniendo de YouTube...');
                    await loadUserPlaylistsAndStore();
                }
            }, 1000);
            
            return true;
        }
    } catch (error) {
        console.log('❌ Token inválido o expirado en Google:', error.result?.error || error);
        
        // Limpiar token inválido
        Object.values(PERSISTENCE_CONFIG.STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        
        if (gapi.client.getToken()) {
            gapi.client.setToken('');
        }
        isAuthorized = false;
        window.isAuthorized = false;
        updateAuthUI();
        return false;
    }
}

// =============================================
// ACTUALIZAR INTERFAZ DE USUARIO - MEJORADA
// =============================================
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

// NUEVA FUNCIÓN: Sincronizar botones móviles
function syncMobileAuthButtons() {
    const mobileAuthElements = {
        mobileSignIn: document.querySelector('.mobile-user-actions .auth-btn:not(.hidden)'),
        mobileSignOut: document.querySelector('.mobile-user-actions .auth-btn.hidden')
    };

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
            const storedToken = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN);
            let statusText = 'Sistema: ✅ Conectado a Google';
            
            if (storedToken) {
                try {
                    const tokenData = JSON.parse(storedToken);
                    const daysRemaining = Math.ceil((tokenData.custom_expiry - Date.now()) / (24 * 60 * 60 * 1000));
                    statusText += ` (${daysRemaining} días)`;
                } catch (e) {
                    statusText += ' (persistente)';
                } 
            }
            
            authStatus.textContent = statusText;
        } else if (gapiReady && gisReady) {
            authStatus.textContent = 'Sistema: ⏸️ No conectado';
        } else {
            authStatus.textContent = 'Sistema: 🔄 Inicializando...';
        }
    }
}

// =============================================
// CARGAR PLAYLISTS DEL USUARIO Y ALMACENAR - NUEVA
// =============================================
async function loadUserPlaylistsAndStore() {
    if (!isAuthorized) {
        console.warn('⚠️ No autorizado para cargar playlists');
        return;
    }
    
    // Verificar que gapi.client tenga el token configurado
    const currentToken = gapi.client.getToken();
    if (!currentToken || !currentToken.access_token) {
        console.warn('⚠️ No hay token configurado en gapi.client');
        return;
    }
    
    console.log('📁 Cargando playlists del usuario y guardando...');
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Sincronizando tu biblioteca...', 'info');
    }
    
    try {
        const playlists = await fetchAllPlaylists();
        
        if (playlists.length > 0) {
            console.log(`📚 ${playlists.length} playlists encontradas`);
            
            // NUEVO: Guardar playlists en almacenamiento persistente
            const playlistsSaved = savePlaylistsWithExpiration(playlists);
            
            if (playlistsSaved) {
                console.log('💾 Playlists guardadas en almacenamiento persistente');
            }
            
            // Disparar evento con las playlists
const event = new CustomEvent('playlistsFetched', {
    detail: playlists
});

// AGREGAR DEBUGGING:
console.log("🔥 DISPARANDO EVENTO playlistsFetched:", {
    playlistCount: playlists.length,
    unifiedCoreExists: !!window.unifiedCore,
    playlistManagerExists: !!window.playlistManager
});

document.dispatchEvent(event);

// AGREGAR: Verificación inmediata
setTimeout(() => {
    const playlistsGrid = document.getElementById('playlistsGrid');
    if (playlistsGrid) {
        console.log("📋 Estado actual de playlistsGrid:", playlistsGrid.innerHTML.substring(0, 100));
    }
}, 1000);
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage(`${playlists.length} playlists sincronizadas y guardadas`, 'success');
            }
        } else {
            console.log('📭 No se encontraron playlists');
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('No se encontraron playlists en tu biblioteca', 'info');
            }
        }
    } catch (error) {
        console.error('❌ Error cargando playlists:', error);
        
        // Si es error de autorización, limpiar token
        if (error.result?.error?.code === 401 || error.result?.error?.code === 403) {
            console.log('🔄 Token expirado, limpiando almacenamiento...');
            Object.values(PERSISTENCE_CONFIG.STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            isAuthorized = false;
            window.isAuthorized = false;
            gapi.client.setToken('');
            updateAuthUI();
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('Sesión expirada. Vuelve a conectarte.', 'warning');
            }
        } else {
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('Error sincronizando biblioteca de YouTube', 'error');
            }
        }
    }
}

// FUNCIÓN ORIGINAL: Cargar playlists (mantener por compatibilidad)
async function loadUserPlaylists() {
    return await loadUserPlaylistsAndStore();
}

// Obtener todas las playlists del usuario
async function fetchAllPlaylists() {
    const allPlaylists = [];
    let nextPageToken = '';

    try {
        do {
            console.log(`📄 Obteniendo página de playlists... ${nextPageToken ? `(token: ${nextPageToken.substring(0, 10)}...)` : '(primera página)'}`);
            
            const response = await gapi.client.youtube.playlists.list({
                part: ['snippet', 'contentDetails'],
                mine: true,
                maxResults: 50,
                pageToken: nextPageToken
            });

            console.log(`✅ Respuesta recibida:`, {
                items: response.result.items?.length || 0,
                nextPageToken: response.result.nextPageToken ? 'Sí' : 'No'
            });

            if (response.result.items) {
                // Filtrar playlists válidas
                const validPlaylists = response.result.items.filter(playlist => {
                    const isValid = playlist.snippet &&
                                   playlist.snippet.title &&
                                   playlist.contentDetails &&
                                   playlist.contentDetails.itemCount > 0;
                    
                    if (!isValid) {
                        console.log(`⚠️ Playlist omitida: ${playlist.snippet?.title || 'Sin título'} (${playlist.contentDetails?.itemCount || 0} videos)`);
                    }
                    
                    return isValid;
                });

                console.log(`📊 ${validPlaylists.length} playlists válidas de ${response.result.items.length} total`);
                allPlaylists.push(...validPlaylists);
            }

            nextPageToken = response.result.nextPageToken || '';
            
        } while (nextPageToken);

        console.log(`📊 Total de playlists válidas obtenidas: ${allPlaylists.length}`);
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

    // Verificar token antes de hacer la llamada
    const currentToken = gapi.client.getToken();
    if (!currentToken || !currentToken.access_token) {
        throw new Error('Token no configurado');
    }

    console.log(`🎵 Cargando videos de playlist: ${playlistId}`);
    
    try {
        let allVideos = [];
        let nextPageToken = null;

        do {
            console.log(`📄 Obteniendo videos... ${nextPageToken ? `(página siguiente)` : '(primera página)'}`);
            
            const response = await gapi.client.youtube.playlistItems.list({
                'part': ['snippet', 'contentDetails'],
                'playlistId': playlistId,
                'maxResults': 50,
                'pageToken': nextPageToken
            });

            const result = response.result;
            console.log(`✅ Respuesta de videos:`, {
                items: result.items?.length || 0,
                nextPageToken: result.nextPageToken ? 'Sí' : 'No'
            });

            if (result.items) {
                const formattedVideos = result.items
                    .map(item => {
                        const thumbnails = item?.snippet?.thumbnails;
                        const videoId = item?.contentDetails?.videoId;
                        const title = item?.snippet?.title;
                        const highThumb = thumbnails?.high?.url;
                        const defaultThumb = thumbnails?.default?.url;
                        const mediumThumb = thumbnails?.medium?.url;
                        
                        if (!videoId || (!highThumb && !defaultThumb && !mediumThumb)) {
                            console.warn('Item omitido por falta de datos:', {
                                title: title?.substring(0, 50),
                                videoId,
                                hasThumbnail: !!(highThumb || defaultThumb || mediumThumb)
                            });
                            return null;
                        }
                        
                        return {
                            videoId,
                            title: title || 'Sin título',
                            thumbnail: highThumb || mediumThumb || defaultThumb,
                            duration: 0, // YouTube API v3 no proporciona duración en playlistItems
                        };
                    })
                    .filter(v => v !== null && v.videoId);

                console.log(`📊 ${formattedVideos.length} videos válidos de ${result.items.length} items`);
                allVideos = allVideos.concat(formattedVideos);
            }
            nextPageToken = result.nextPageToken;
        } while (nextPageToken);

        console.log(`✅ Total: ${allVideos.length} videos cargados de playlist ${playlistId}`);
        return allVideos;

    } catch (error) {
        console.error(`❌ Error cargando videos de playlist ${playlistId}:`, error);
        
        // Manejar errores específicos
        if (error.result?.error?.code === 404) {
            throw new Error("Playlist no encontrada");
        } else if (error.result?.error?.code === 403) {
            throw new Error("Sin permisos para acceder a esta playlist");
        } else if (error.result?.error?.code === 401) {
            throw new Error("Token expirado. Vuelve a conectarte.");
        }
        
        throw new Error(error.result?.error?.message || "No se pudieron cargar los videos");
    }
}

// =============================================
// FUNCIONES DE LIMPIEZA Y MANTENIMIENTO
// =============================================

// NUEVA: Limpiar datos expirados automáticamente
function cleanupExpiredData() {
    try {
        const keysToCheck = Object.values(PERSISTENCE_CONFIG.STORAGE_KEYS);
        let cleanedItems = 0;
        
        keysToCheck.forEach(key => {
            const storedData = localStorage.getItem(key);
            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    const now = Date.now();
                    
                    // Verificar diferentes tipos de expiración
                    let isExpired = false;
                    
                    if (parsed.custom_expiry && now >= parsed.custom_expiry) {
                        isExpired = true;
                    } else if (parsed.expires_at && now >= parsed.expires_at) {
                        isExpired = true;
                    }
                    
                    if (isExpired) {
                        localStorage.removeItem(key);
                        cleanedItems++;
                        console.log(`🧹 Datos expirados eliminados: ${key}`);
                    }
                } catch (e) {
                    // Si no se puede parsear, eliminar
                    localStorage.removeItem(key);
                    cleanedItems++;
                    console.log(`🧹 Datos corruptos eliminados: ${key}`);
                }
            }
        });
        
        if (cleanedItems > 0) {
            console.log(`🧹 Limpieza completada: ${cleanedItems} items eliminados`);
        }
        
    } catch (error) {
        console.error('❌ Error en limpieza automática:', error);
    }
}

// NUEVA: Obtener estadísticas de almacenamiento
window.getStorageStats = function() {
    const stats = {
        token: null,
        playlists: null,
        userInfo: null,
        totalSize: 0
    };
    
    try {
        // Token
        const tokenData = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN);
        if (tokenData) {
            const parsed = JSON.parse(tokenData);
            const timeRemaining = Math.max(0, parsed.custom_expiry - Date.now());
            stats.token = {
                exists: true,
                daysRemaining: Math.ceil(timeRemaining / (24 * 60 * 60 * 1000)),
                size: tokenData.length
            };
        }
        
        // Playlists
        const playlistsData = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS);
        if (playlistsData) {
            const parsed = JSON.parse(playlistsData);
            const timeRemaining = Math.max(0, parsed.expires_at - Date.now());
            stats.playlists = {
                exists: true,
                count: parsed.data?.length || 0,
                daysRemaining: Math.ceil(timeRemaining / (24 * 60 * 60 * 1000)),
                size: playlistsData.length
            };
        }
        
        // User Info
        const userInfoData = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.USER_INFO);
        if (userInfoData) {
            const parsed = JSON.parse(userInfoData);
            const timeRemaining = Math.max(0, parsed.expires_at - Date.now());
            stats.userInfo = {
                exists: true,
                daysRemaining: Math.ceil(timeRemaining / (24 * 60 * 60 * 1000)),
                size: userInfoData.length,
                userName: parsed.title
            };
        }
        
        stats.totalSize = (stats.token?.size || 0) + (stats.playlists?.size || 0) + (stats.userInfo?.size || 0);
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
    }
    
    console.table(stats);
    return stats;
};

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
// FUNCIONES DE TESTING Y DEBUG - MEJORADAS
// =============================================

// Testing específico para OAuth con persistencia
window.testOAuthConfig = function() {
    console.log('🧪 === TEST CONFIGURACIÓN OAUTH CON PERSISTENCIA ===');
    
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
    
    // Test 3: Verificar datos persistentes
    const persistentData = {
        tokenStored: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN),
        playlistsStored: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS),
        userInfoStored: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.USER_INFO)
    };
    
    console.log('Datos persistentes:', persistentData);
    
    // Test 4: Detalles de expiración
    if (persistentData.tokenStored) {
        try {
            const tokenData = JSON.parse(localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN));
            const timeRemaining = tokenData.custom_expiry - Date.now();
            const daysRemaining = Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
            
            console.log('🔐 Estado del token:', {
                valid: timeRemaining > 0,
                daysRemaining: Math.max(0, daysRemaining),
                savedAt: new Date(tokenData.timestamp).toLocaleString(),
                expiresAt: new Date(tokenData.custom_expiry).toLocaleString()
            });
        } catch (e) {
            console.log('❌ Token corrupto');
        }
    }
    
    // Test 5: Simular click si todo está listo
    if (gapiReady && gisReady && tokenClient) {
        console.log('🚀 Todo listo, probando autenticación...');
        
        const btn = document.getElementById('googleSignInButton');
        if (btn && !btn.disabled) {
            btn.click();
        }
    } else {
        console.log('❌ No está listo para autenticación');
    }
    
    return { config, apis: apisAvailable, persistence: persistentData };
};

// Testing simple del botón
window.testAuthSimple = function() {
    console.log('🧪 Test auth simple:', {
        gapiReady,
        gisReady,
        tokenClient: !!tokenClient,
        isAuthorized,
        button: !!document.getElementById('googleSignInButton'),
        persistentToken: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN)
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
    console.log('🐛 === ESTADO COMPLETO AUTH CON PERSISTENCIA ===');
    console.log('Variables globales:', {
        gapiReady,
        gisReady,
        tokenClient: !!tokenClient,
        isAuthorized,
        GOOGLE_CONFIG,
        PERSISTENCE_CONFIG
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
    
    // Estado de persistencia
    console.log('Estado de persistencia:', {
        tokenStored: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.TOKEN),
        playlistsStored: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS),
        userInfoStored: !!localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.USER_INFO),
        gapiToken: !!gapi?.client?.getToken?.()?.access_token,
        globalAuth: window.isAuthorized
    });
    
    // Mostrar estadísticas detalladas
    window.getStorageStats();
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
window.loadUserPlaylistsAndStore = loadUserPlaylistsAndStore; // NUEVA

// =============================================
// AUTO-INICIALIZACIÓN CON LIMPIEZA AUTOMÁTICA
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM listo para auth con persistencia');
    
    // Limpiar datos expirados al inicio
    cleanupExpiredData();
    
    // Esperar un poco para que los scripts de Google se carguen
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 2000);
    
    // Limpieza automática cada hora
    setInterval(cleanupExpiredData, 60 * 60 * 1000);
});

console.log('✅ Módulo de autenticación con persistencia de 7 días cargado');
