// init.js - Script de Inicialización Unificada
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
 Cargar YouTube API con origin correcto
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
    
    // ✅ CORRECCIÓN: Agregar atributos para evitar error de postMessage
    script.setAttribute('data-origin', window.location.origin);
    
    script.onerror = () => {
        console.error('❌ Error cargando YouTube IFrame API');
        showInitError('Error cargando YouTube API');
    };
    
    document.head.appendChild(script);
}
/**
 * Configurar players con origin correcto
 */
window.onYouTubeIframeAPIReady = function() {
    try {
        console.log('🎵 YouTube IFrame API cargada');
        window.ytCrossMixAPIs.youtube = true;
        
        // ✅ CONFIGURAR ORIGIN PARA EVITAR ERROR DE POSTMESSAGE
        if (window.YT && window.YT.Player) {
            // Configurar origin global para todos los players
            const originalPlayer = window.YT.Player;
            window.YT.Player = function(elementId, config) {
                // Asegurar que playerVars tenga origin correcto
                config = config || {};
                config.playerVars = config.playerVars || {};
                config.playerVars.origin = window.location.origin;
                
                // Llamar al constructor original
                return new originalPlayer(elementId, config);
            };
            
            // Preservar el prototipo
            window.YT.Player.prototype = originalPlayer.prototype;
            
            console.log('✅ YouTube API configurada con origin:', window.location.origin);
        }
        
        checkAllAPIsReady();
    } catch (error) {
        console.error('❌ Error con YouTube API:', error);
        showInitError('Error cargando YouTube API');
    }
};

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
        }, 10000); // 10 segundos
    });
} else {
    console.log('📄 DOM ya cargado, verificando APIs...');
    ensureAPIsLoaded();
}
// =============================================
// CONFIGURACIÓN DE CONTROLES DE AUDIO
// =============================================

function setupAudioControls() {
    console.log('🔊 Configurando controles de audio...');
    
    const volumeButton = document.getElementById('volumeButton');
    const volumeSlider = document.getElementById('volumeSlider');
    
    if (!volumeButton || !volumeSlider) {
        console.warn('⚠️ Elementos de volumen no encontrados');
        return;
    }
    
    // Estado inicial
    let currentVolume = 100;
    let isMuted = false;
    let previousVolume = 100;
    
    // Cargar volumen guardado
    const savedVolume = localStorage.getItem('ytcm_volume');
    if (savedVolume !== null) {
        currentVolume = parseInt(savedVolume, 10);
        updateVolumeUI(currentVolume);
    }
    
    // Toggle mute con click en botón
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
    
    // Mostrar slider al pasar el mouse
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
    
    // Control del slider
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
        
        console.log(`🔊 Volumen ajustado: ${currentVolume}%`);
    });
    
    // Drag en el slider
    let isDragging = false;
    
    volumeSlider.addEventListener('mousedown', (e) => {
        isDragging = true;
        volumeSlider.classList.add('dragging');
        handleVolumeDrag(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleVolumeDrag(e);
        }
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
        if (fill) {
            fill.style.height = `${volume}%`;
        }
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
        localStorage.setItem('ytcm_volume', volume.toString());
    }
    
    // Aplicar volumen inicial a los players cuando estén listos
    const checkPlayers = setInterval(() => {
        if (window.player1 || window.player2) {
            applyVolumeToPlayers(currentVolume);
            clearInterval(checkPlayers);
            console.log(`✅ Volumen inicial aplicado: ${currentVolume}%`);
        }
    }, 500);
    
    // Timeout de seguridad
    setTimeout(() => clearInterval(checkPlayers), 10000);
    
    console.log('✅ Controles de audio configurados');
}

// Inicializar controles cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAudioControls);
} else {
    setupAudioControls();
}

// Exponer función globalmente
window.setupAudioControls = setupAudioControls;
console.log('✅ Script y audio de inicialización cargado');
