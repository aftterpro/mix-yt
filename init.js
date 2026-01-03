// init.js - Script de Inicialización Unificada
console.log('🚀 Iniciando YT CrossMix - Carga de APIs...');

// Estado global mejorado
window.ytCrossMixAPIs = {
    gapi: false,
    gis: false,
    youtube: false,
    ready: false,
    errors: [],
    retryCount: 0,
    maxRetries: 3
};

// =============================================
// INICIALIZACIÓN DE GOOGLE APIS
// =============================================

/**
 * Función llamada automáticamente cuando gapi se carga
 */
window.gapiInitialize = async function() {
    console.log('📡 [INIT] Iniciando coordinación con auth.js...');
    
    // NO inicializar aquí, dejar que auth.js lo haga
    // Solo marcar como disponible
    if (typeof gapi !== 'undefined') {
        setTimeout(() => {
            if (window.gapiInitialize_auth) {
                console.log('🔄 [INIT] Delegando a auth.js...');
                window.gapiInitialize_auth();
            }
        }, 1000);
    }
};

/**
 * Función llamada automáticamente cuando GIS se carga
 */
window.gisInitalize = function() {
    console.log('🔑 [INIT] GIS disponible, delegando a auth.js...');
    
    // Solo actualizar estado, no inicializar
    if (typeof google !== 'undefined' && google.accounts) {
        window.ytCrossMixAPIs.gis = true;
        
        if (window.gisInitalize_auth) {
            setTimeout(() => {
                window.gisInitalize_auth();
            }, 500);
        }
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
        
        // Notificar al sistema unificado
        if (window.unifiedCore) {
            window.unifiedCore.state.authReady = true;
            window.unifiedCore.updateStatusIndicator('APIs listas', 'success');
        }
        
        // Disparar evento global
        document.dispatchEvent(new CustomEvent('ytCrossMixAPIsReady', {
            detail: { gapi, gis, youtube, timestamp: Date.now() }
        }));
        
        console.log('✅ Evento ytCrossMixAPIsReady disparado');
        
    } else {
        const missing = [];
        if (!gapi) missing.push('GAPI');
        if (!gis) missing.push('GIS');
        if (!youtube) missing.push('YouTube');
        
        console.log(`⏳ Esperando APIs: ${missing.join(', ')}`);
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

function loadYouTubeAPI() {
    if (document.querySelector('script[src*="iframe_api"]')) {
        console.log('📺 YouTube API ya está cargándose...');
        return;
    }
    
    console.log('📺 Cargando YouTube IFrame API...');
    
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    
    // ✅ CRÍTICO: Configurar origin correctamente
    const currentOrigin = window.location.origin;
    script.setAttribute('data-origin', currentOrigin);
    script.async = true;
    
    // ✅ CORRECCIÓN: Manejo de errores de carga
    script.onerror = () => {
        console.error('❌ Error cargando YouTube IFrame API');
        window.ytCrossMixAPIs.errors.push('YouTube API load failed');
        
        // Reintentar si no hemos excedido el límite
        if (window.ytCrossMixAPIs.retryCount < window.ytCrossMixAPIs.maxRetries) {
            window.ytCrossMixAPIs.retryCount++;
            console.log(`🔄 Reintentando carga de YouTube API (${window.ytCrossMixAPIs.retryCount}/${window.ytCrossMixAPIs.maxRetries})...`);
            
            setTimeout(() => {
                // Remover script fallido
                script.remove();
                loadYouTubeAPI();
            }, 2000);
        } else {
            showInitError('Error cargando YouTube API después de múltiples intentos');
        }
    };
    
    script.onload = () => {
        console.log('✅ YouTube API script cargado');
    };
    
    document.head.appendChild(script);
}

/**
 * Configurar players con origin correcto
 */
window.onYouTubeIframeAPIReady = function() {
    try {
        console.log('🎵 YouTube IFrame API lista');
        window.ytCrossMixAPIs.youtube = true;
        
        // ✅ CONFIGURAR ORIGIN CORRECTO
        if (window.YT && window.YT.Player) {
            const currentOrigin = window.location.origin;
            const originalPlayer = window.YT.Player;
            
            // Wrapper para forzar origin
            window.YT.Player = function(elementId, config) {
                config = config || {};
                config.playerVars = config.playerVars || {};
                
                // ✅ FORZAR ORIGIN
                config.playerVars.origin = currentOrigin;
                config.playerVars.widget_referrer = currentOrigin;
                config.playerVars.enablejsapi = 1;
                
                console.log(`🎮 Creando player "${elementId}" con origin: ${currentOrigin}`);
                
                return new originalPlayer(elementId, config);
            };
            
            // Preservar prototipo
            window.YT.Player.prototype = originalPlayer.prototype;
            
            console.log('✅ YouTube API configurada con origin:', currentOrigin);
        }
        
        checkAllAPIsReady();
        
    } catch (error) {
        console.error('❌ Error en onYouTubeIframeAPIReady:', error);
        window.ytCrossMixAPIs.errors.push('YouTube API error: ' + error.message);
        showInitError('Error inicializando YouTube API');
    }
}


// ✅ ASEGURAR QUE SE LLAME A loadYouTubeAPI
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM cargado, verificando APIs...');
        ensureAPIsLoaded();
        loadYouTubeAPI(); // ✅ Llamar explícitamente
    });
} else {
    console.log('📄 DOM ya cargado, verificando APIs...');
    ensureAPIsLoaded();
    loadYouTubeAPI(); // ✅ Llamar explícitamente
}
/**
 * Verificar y cargar APIs faltantes
 */
function ensureAPIsLoaded() {
    console.log('🔍 Verificando disponibilidad de APIs...');
    
    // YouTube API
    if (!window.YT && !document.querySelector('script[src*="iframe_api"]')) {
        console.log('📺 Cargando YouTube API...');
        loadYouTubeAPI();
    } else if (window.YT) {
        console.log('✅ YouTube API ya disponible');
        window.ytCrossMixAPIs.youtube = true;
    }
    
    // Google APIs (gapi)
    if (!window.gapi) {
        if (!document.querySelector('script[src*="apis.google.com/js/api.js"]')) {
            console.warn('⚠️ Google API script no encontrado en HTML');
        } else {
            console.log('⏳ Esperando carga de GAPI...');
        }
    } else {
        console.log('✅ GAPI ya disponible');
    }
    
    // Google Identity Services (GIS)
    if (!window.google || !window.google.accounts) {
        if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
            console.warn('⚠️ Google Identity script no encontrado en HTML');
        } else {
            console.log('⏳ Esperando carga de GIS...');
        }
    } else {
        console.log('✅ GIS ya disponible');
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
    loadYouTubeAPI();
    
    setTimeout(setupAudioControls, 1000);
    
    // ✅ TIMEOUT MEJORADO CON REINTENTOS
    let checkAttempts = 0;
    const MAX_ATTEMPTS = 30; // 30 segundos total
    
    const checkAPIsInterval = setInterval(() => {
        checkAttempts++;
        
        const { gapi, gis, youtube } = window.ytCrossMixAPIs;
        
        // ✅ ÉXITO: Todas las APIs cargadas
        if (gapi && gis && youtube) {
            clearInterval(checkAPIsInterval);
            console.log('✅ Todas las APIs verificadas correctamente');
            
            // Disparar evento de éxito
            document.dispatchEvent(new CustomEvent('ytCrossMixAPIsVerified', {
                detail: { success: true, attempts: checkAttempts }
            }));
            return;
        }
        
        // ✅ TIMEOUT: Después de 30 segundos
        if (checkAttempts >= MAX_ATTEMPTS) {
            clearInterval(checkAPIsInterval);
            
            const missing = [];
            if (!gapi) missing.push('GAPI');
            if (!gis) missing.push('GIS');
            if (!youtube) missing.push('YouTube');
            
            console.warn(`⏰ Timeout de APIs después de ${checkAttempts}s. Faltantes: ${missing.join(', ')}`);
            console.log('Estado final:', window.ytCrossMixAPIs);
            
            // ✅ CONTINUAR CON LAS APIs DISPONIBLES
            document.dispatchEvent(new CustomEvent('ytCrossMixAPIsTimeout', {
                detail: { 
                    missing: missing,
                    available: { gapi, gis, youtube },
                    attempts: checkAttempts
                }
            }));
            
            // ✅ MOSTRAR AVISO AL USUARIO (solo si falta YouTube)
            if (!youtube && window.unifiedCore) {
                window.unifiedCore.showMessage(
                    'Algunos servicios tardaron en cargar. Funcionalidad limitada.',
                    'warning'
                );
            }
        }
    }, 1000); // Verificar cada segundo
});
} else {
    console.log('📄 DOM ya cargado, verificando APIs...');
    ensureAPIsLoaded();
    // Detectar scroll en el contenedor correcto
const searchContainer = document.getElementById('searchView'); // O '.content-area'

if (searchContainer) {
    searchContainer.addEventListener('scroll', () => {
        // Verificar si llegamos al final
        if (searchContainer.scrollTop + searchContainer.clientHeight >= searchContainer.scrollHeight - 100) {
            console.log('📜 Final del scroll detectado, cargando más...');
            // Llamar a tu función de búsqueda con el token de paginación
            if (window.unifiedCore && window.unifiedCore.searchNextPage) {
                window.unifiedCore.searchNextPage();
            }
        }
    });
}
}
// =============================================
// CONFIGURACIÓN DE CONTROLES DE AUDIO
// =============================================

// ✅ CORRECCIÓN: setupAudioControls con mejor manejo
function setupAudioControls() {
    console.log('🔊 Configurando controles de audio...');
    
    const volumeButton = document.getElementById('volumeButton');
    const volumeSlider = document.getElementById('volumeSlider');
    
    if (!volumeButton || !volumeSlider) {
        console.warn('⚠️ Elementos de volumen no encontrados, reintentando...');
        setTimeout(setupAudioControls, 1000);
        return;
    }
    
    // Estado inicial
    let currentVolume = 100;
    let isMuted = false;
    let previousVolume = 100;
    
    // ✅ CORRECCIÓN: Cargar volumen guardado con validación
    try {
        const savedVolume = localStorage.getItem('ytcm_volume');
        if (savedVolume !== null) {
            const parsed = parseInt(savedVolume, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                currentVolume = parsed;
                updateVolumeUI(currentVolume);
                console.log(`✅ Volumen restaurado: ${currentVolume}%`);
            }
        }
    } catch (e) {
        console.warn('⚠️ Error cargando volumen guardado:', e);
    }
    
    // Toggle mute
    volumeButton.addEventListener('click', () => {
        isMuted = !isMuted;
        
        if (isMuted) {
            previousVolume = currentVolume;
            currentVolume = 0;
            volumeButton.querySelector('i').className = 'fas fa-volume-mute';
        } else {
            currentVolume = previousVolume > 0 ? previousVolume : 50;
            updateVolumeIcon(currentVolume);
        }
        
        updateVolumeUI(currentVolume);
        applyVolumeToPlayers(currentVolume);
        saveVolume(currentVolume);
        
        console.log(`🔊 ${isMuted ? 'Mute' : 'Unmute'}: ${currentVolume}%`);
    });
    
    // Mostrar slider
    volumeButton.addEventListener('mouseenter', () => {
        volumeSlider.classList.add('show');
    });
    
    volumeSlider.addEventListener('mouseleave', () => {
        setTimeout(() => {
            if (!volumeSlider.matches(':hover')) {
                volumeSlider.classList.remove('show');
            }
        }, 300);
    });
    
    // Click en slider
    volumeSlider.addEventListener('click', (e) => {
        const rect = volumeSlider.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const height = rect.height;
        const percentage = Math.max(0, Math.min(100, 100 - (clickY / height * 100)));
        
        currentVolume = Math.round(percentage);
        isMuted = false;
        
        updateVolumeUI(currentVolume);
        applyVolumeToPlayers(currentVolume);
        saveVolume(currentVolume);
    });
    
    // Drag en slider
    let isDragging = false;
    
    volumeSlider.addEventListener('mousedown', (e) => {
        isDragging = true;
        volumeSlider.classList.add('dragging');
        handleVolumeDrag(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) handleVolumeDrag(e);
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            volumeSlider.classList.remove('dragging');
        }
    });
    
    function handleVolumeDrag(e) {
        const rect = volumeSlider.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const height = rect.height;
        const percentage = Math.max(0, Math.min(100, 100 - (clickY / height * 100)));
        
        currentVolume = Math.round(percentage);
        isMuted = false;
        
        updateVolumeUI(currentVolume);
        applyVolumeToPlayers(currentVolume);
    }
    
    function updateVolumeUI(volume) {
        const fill = volumeSlider.querySelector('.volume-fill');
        if (fill) fill.style.height = `${volume}%`;
        updateVolumeIcon(volume);
    }
    
    function updateVolumeIcon(volume) {
        const icon = volumeButton.querySelector('i');
        if (!icon) return;
        
        if (volume === 0) {
            icon.className = 'fas fa-volume-mute';
        } else if (volume < 30) {
            icon.className = 'fas fa-volume-off';
        } else if (volume < 70) {
            icon.className = 'fas fa-volume-down';
        } else {
            icon.className = 'fas fa-volume-up';
        }
    }
    
    function applyVolumeToPlayers(volume) {
        try {
            if (window.player1 && typeof window.player1.setVolume === 'function') {
                window.player1.setVolume(volume);
            }
            if (window.player2 && typeof window.player2.setVolume === 'function') {
                window.player2.setVolume(volume);
            }
        } catch (error) {
            console.error('❌ Error aplicando volumen:', error);
        }
    }
    
    function saveVolume(volume) {
        try {
            localStorage.setItem('ytcm_volume', volume.toString());
        } catch (e) {
            console.warn('⚠️ No se pudo guardar volumen:', e);
        }
    }
    
    // Aplicar volumen inicial a players cuando estén listos
    const checkPlayers = setInterval(() => {
        if (window.player1 || window.player2) {
            applyVolumeToPlayers(currentVolume);
            clearInterval(checkPlayers);
            console.log(`✅ Volumen inicial aplicado: ${currentVolume}%`);
        }
    }, 500);
    
    setTimeout(() => clearInterval(checkPlayers), 10000);
    
    console.log('✅ Controles de audio configurados');
}


// Inicializar controles cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM cargado, verificando APIs...');
        ensureAPIsLoaded();
        loadYouTubeAPI();
        
        setTimeout(setupAudioControls, 1000);
        
        // Timeout de seguridad
        setTimeout(() => {
            if (!window.ytCrossMixAPIs.ready) {
                console.warn('⏰ Timeout de APIs (10s), algunas pueden no estar disponibles');
                console.log('Estado final:', window.ytCrossMixAPIs);
                document.dispatchEvent(new CustomEvent('ytCrossMixAPIsTimeout'));
            }
        }, 10000);
    });
} else {
    console.log('📄 DOM ya cargado, verificando APIs...');
    ensureAPIsLoaded();
    loadYouTubeAPI();
    setTimeout(setupAudioControls, 1000);
}

console.log('✅ Sistema de inicialización cargado');
// =============================================
// LISTENER PARA MANEJAR TIMEOUT
// =============================================
document.addEventListener('ytCrossMixAPIsTimeout', (e) => {
    const { missing, available } = e.detail;
    
    console.log('🔄 Manejando timeout de APIs...');
    
    // Si YouTube está disponible, continuar
    if (available.youtube) {
        console.log('✅ YouTube API disponible, continuando...');
        
        if (window.unifiedCore && !window.unifiedCore.state.initialized) {
            window.unifiedCore.init();
        }
    }
    
    // Si GAPI/GIS están disponibles, inicializar auth
    if (available.gapi && available.gis) {
        console.log('✅ Auth APIs disponibles');
        
        if (window.gapiInitialize_auth) {
            window.gapiInitialize_auth();
        }
        if (window.gisInitalize_auth) {
            window.gisInitalize_auth();
        }
    }
});
