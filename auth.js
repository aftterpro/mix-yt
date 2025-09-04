// auth_simple.js - VERSIÓN LIMPIA SIN CONFLICTOS
console.log('🔐 Cargando módulo de autenticación simple...');

const GOOGLE_CONFIG = {
    CLIENT_ID: '374474688710-p6m4rc6p7s7bp3j8ccns6p9pbtj5p9vl.apps.googleusercontent.com',
    API_KEY: 'AIzaSyDg1EMvKc4D--b6hXTSOhR3ANrLPHsyIH4', 
    DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest',
    SCOPES: 'https://www.googleapis.com/auth/youtube.readonly'
};

let gapiReady = false;
let gisReady = false;
let tokenClient = null;
let isAuthorized = false;

// Esperar a que las APIs estén disponibles
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

// Inicializar Google APIs
async function initializeGoogleAPIs() {
    try {
        console.log('🚀 Inicializando Google APIs de forma simple...');
        
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
        
        // Configurar cliente
        await gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            discoveryDocs: [GOOGLE_CONFIG.DISCOVERY_DOC]
        });
        
        console.log('✅ GAPI inicializado');
        gapiReady = true;
        
        // Inicializar GIS
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: handleAuthResponse
        });
        
        console.log('✅ GIS inicializado');
        gisReady = true;
        
        // Actualizar UI
        updateAuthUI();
        
    } catch (error) {
        console.error('❌ Error inicializando APIs:', error);
        showError('Error cargando Google APIs: ' + error.message);
    }
}

// Manejar respuesta de autenticación
function handleAuthResponse(response) {
    console.log('🔐 Respuesta de auth:', response);
    
    if (response.error) {
        console.error('❌ Error de auth:', response.error);
        showError('Error de autenticación: ' + response.error);
        return;
    }
    
    if (response.access_token) {
        console.log('✅ Token recibido');
        isAuthorized = true;
        
        // Guardar token
        try {
            localStorage.setItem('google_token', JSON.stringify({
                access_token: response.access_token,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('No se pudo guardar token:', e);
        }
        
        updateAuthUI();
        loadUserPlaylists();
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('¡Conectado exitosamente!', 'success');
        }
    }
}

// Iniciar sesión
function signIn() {
    console.log('🔐 Iniciando sign in...');
    
    if (!gapiReady || !gisReady || !tokenClient) {
        console.error('❌ APIs no están listas');
        showError('APIs no están listas');
        return;
    }
    
    console.log('🚀 Solicitando token...');
    
    try {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
        console.error('❌ Error solicitando token:', error);
        showError('Error solicitando autorización');
    }
}

// Cerrar sesión
function signOut() {
    console.log('👋 Cerrando sesión...');
    
    if (gapi.client.getToken()) {
        const token = gapi.client.getToken();
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
    }
    
    localStorage.removeItem('google_token');
    isAuthorized = false;
    updateAuthUI();
    
    document.dispatchEvent(new CustomEvent('userLoggedOut'));
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Sesión cerrada', 'info');
    }
}

// Actualizar UI
function updateAuthUI() {
    const signInBtn = document.getElementById('googleSignInButton');
    const signOutBtn = document.getElementById('googleSignOutButton');
    
    console.log('🔄 Actualizando UI auth:', { gapiReady, gisReady, isAuthorized });
    
    if (!signInBtn || !signOutBtn) {
        setTimeout(updateAuthUI, 1000);
        return;
    }
    
    if (isAuthorized) {
        signInBtn.classList.add('hidden');
        signOutBtn.classList.remove('hidden');
        signOutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Cerrar Sesión';
        signOutBtn.onclick = signOut;
    } else if (gapiReady && gisReady) {
        signInBtn.classList.remove('hidden');
        signOutBtn.classList.add('hidden');
        signInBtn.innerHTML = '<i class="fab fa-google"></i> Conectar con Google';
        signInBtn.disabled = false;
        signInBtn.onclick = signIn;
        console.log('✅ Botón listo para auth');
    } else {
        signInBtn.classList.remove('hidden');
        signOutBtn.classList.add('hidden');
        signInBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
        signInBtn.disabled = true;
    }
}

// Cargar playlists del usuario
async function loadUserPlaylists() {
    if (!isAuthorized) return;
    
    console.log('📁 Cargando playlists...');
    
    try {
        const response = await gapi.client.youtube.playlists.list({
            part: ['snippet', 'contentDetails'],
            mine: true,
            maxResults: 50
        });
        
        if (response.result.items) {
            const playlists = response.result.items.filter(p => 
                p.snippet?.title && p.contentDetails?.itemCount > 0
            );
            
            console.log(`📚 ${playlists.length} playlists encontradas`);
            
            document.dispatchEvent(new CustomEvent('playlistsFetched', {
                detail: playlists
            }));
        }
    } catch (error) {
        console.error('❌ Error cargando playlists:', error);
        showError('Error cargando playlists');
    }
}

// Mostrar error
function showError(message) {
    console.error('🔴', message);
    if (window.unifiedCore) {
        window.unifiedCore.showMessage(message, 'error');
    }
}

// Testing
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
    }
};

// Auto-inicializar
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM listo para auth simple');
    
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 2000);
});

// Exports globales
window.signIn = signIn;
window.signOut = signOut;
