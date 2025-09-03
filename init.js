// init.js - Script de Inicialización Unificada
// Este script debe cargarse ANTES de core.js para asegurar que las APIs estén disponibles

console.log('🚀 Iniciando YT CrossMix - Carga de APIs...');

// Estado global de APIs
window.ytCrossMixAPIs = {
    gapi: false,
    gis: false,
    youtube: false,
    ready: false
};

// =============================================
// INICIALIZACIÓN DE GOOGLE APIS
// =============================================

/**
 * Función llamada automáticamente cuando gapi se carga
 */
window.gapiInitialize = async function() {
    try {
        console.log('📡 Inicializando Google API Client...');
        
        await new Promise((resolve, reject) => {
            gapi.load('client', {
                callback: resolve,
                onerror: reject,
                timeout: 10000
            });
        });
        
        await gapi.client.init({
            apiKey: 'AIzaSyBpZ4u-yDUJe1wSxhkGjWJBGvPMIRlKhts',
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
        });
        
        window.ytCrossMixAPIs.gapi = true;
        console.log('✅ Google API Client inicializado');
        
        checkAllAPIsReady();
        
    } catch (error) {
        console.error('❌ Error inicializando Google API:', error);
        showInitError('Error cargando Google API');
    }
};

/**
 * Función llamada automáticamente cuando GIS se carga
 */
window.gisInitalize = function() {
    try {
        console.log('🔑 Inicializando Google Identity Services...');
        
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            console.warn('⚠️ Google Identity Services no disponible aún, reintentando...');
            setTimeout(window.gisInitalize, 500);
            return;
        }
        
        window.ytCrossMixAPIs.gis = true;
        console.log('✅ Google Identity Services disponible');
        
        checkAllAPIsReady();
        
    } catch (error) {
        console.error('❌ Error inicializando GIS:', error);
        showInitError('Error cargando Google Identity');
    }
};

/**
 * Función llamada automáticamente cuando YouTube IFrame API se carga
 */
window.onYouTubeIframeAPIReady = function() {
    try {
        console.log('🎵 YouTube IFrame API cargada');
        window.ytCrossMixAPIs.youtube = true;
        checkAllAPIsReady();
    } catch (error) {
        console.error('❌ Error con YouTube API:', error);
        showInitError('Error cargando YouTube API');
    }
};

/**
 * Verificar si todas las APIs están listas
 */
function checkAllAPIsReady() {
    const { gapi, gis, youtube } = window.ytCrossMixAPIs;
    
    console.log('📊 Estado de APIs:', { gapi, gis, youtube });
    
    if (gapi && gis && youtube) {
        window.ytCrossMixAPIs.ready = true;
        console.log('🎉 ¡Todas las APIs están listas!');
        
        // Notificar al sistema unificado si ya está cargado
        if (window.unifiedCore) {
            window.unifiedCore.state.authReady = true;
            window.unifiedCore.updateStatusIndicator('APIs listas', 'success');
        }
        
        // Disparar evento global
        document.dispatchEvent(new CustomEvent('ytCrossMixAPIsReady', {
            detail: { gapi, gis, youtube }
        }));
        
        // Inicializar autenticación si el módulo está disponible
        if (typeof window.initializeAuth === 'function') {
            window.initializeAuth();
        }
    }
}

/**
 * Mostrar error de inicialización
 */
function showInitError(message) {
    console.error('🔴', message);
    
    // Mostrar en la UI si está disponible
    const statusIndicator = document.getElementById('unifiedStatusIndicator');
    if (statusIndicator) {
        statusIndicator.textContent = message;
        statusIndicator.className = 'unified-status-indicator show error';
    }
    
    // Fallback visual
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => errorDiv.remove(), 5000);
}

// =============================================
// CARGA AUTOMÁTICA DE SCRIPTS
// =============================================

/**
 * Cargar YouTube IFrame API
 */
function loadYouTubeAPI() {
    if (document.querySelector('script[src*="iframe_api"]')) {
        console.log('📺 YouTube API ya está cargándose...');
        return;
    }
    
    console.log('📺 Cargando YouTube IFrame API...');
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
        console.error('❌ Error cargando YouTube IFrame API');
        showInitError('Error cargando YouTube API');
    };
    document.head.appendChild(script);
}

/**
 * Verificar y cargar APIs faltantes
 */
function ensureAPIsLoaded() {
    // YouTube API
    if (!window.YT && !document.querySelector('script[src*="iframe_api"]')) {
        loadYouTubeAPI();
    }
    
    // Google APIs (ya deberían estar en el HTML pero verificamos)
    if (!window.gapi && !document.querySelector('script[src*="apis.google.com/js/api.js"]')) {
        console.warn('⚠️ Google API script no encontrado en HTML');
    }
    
    if (!window.google && !document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
        console.warn('⚠️ Google Identity script no encontrado en HTML');
    }
}

// =============================================
// INICIALIZACIÓN AUTOMÁTICA
// =============================================

// Cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM cargado, verificando APIs...');
        ensureAPIsLoaded();
        
        // Timeout de seguridad para APIs que no respondan
        setTimeout(() => {
            if (!window.ytCrossMixAPIs.ready) {
                console.warn('⏰ Timeout de APIs, algunas pueden no estar disponibles');
                // Continuar sin todas las APIs si es necesario
                document.dispatchEvent(new CustomEvent('ytCrossMixAPIsTimeout'));
            }
        }, 15000); // 15 segundos
    });
} else {
    console.log('📄 DOM ya cargado, verificando APIs...');
    ensureAPIsLoaded();
}

console.log('✅ Script de inicialización cargado');
