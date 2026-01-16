console.log('🚀 Iniciando YT CrossMix - Carga de APIs...');

// =============================================
// ESTADO GLOBAL MEJORADO
// =============================================
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
// PROMESAS PARA CADA API
// =============================================

/**
 * Promesa para YouTube IFrame API
 */
const youtubePromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
        console.log('✅ YouTube API ya disponible');
        resolve();
    } else {
        window.onYouTubeIframeAPIReady = () => {
            console.log('✅ YouTube IFrame API cargada');
            window.ytCrossMixAPIs.youtube = true;
            resolve();
        };
    }
});

/**
 * Promesa para Google API Client (gapi)
 */
const gapiPromise = new Promise((resolve) => {
    if (typeof gapi !== 'undefined' && gapi.client) {
        console.log('✅ GAPI ya disponible');
        resolve();
    } else {
        const checkGapi = setInterval(() => {
            if (typeof gapi !== 'undefined') {
                clearInterval(checkGapi);
                console.log('📡 GAPI detectado, cargando client...');
                
                gapi.load('client', () => {
                    console.log('✅ GAPI client cargado');
                    window.ytCrossMixAPIs.gapi = true;
                    resolve();
                });
            }
        }, 100);
        
        // Timeout de seguridad (10 segundos)
        setTimeout(() => {
            clearInterval(checkGapi);
            console.warn('⏰ Timeout esperando GAPI');
            resolve(); // Resolver de todas formas para no bloquear
        }, 10000);
    }
});

/**
 * Promesa para Google Identity Services (GIS)
 */
const gisPromise = new Promise((resolve) => {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        console.log('✅ GIS ya disponible');
        resolve();
    } else {
        const checkGIS = setInterval(() => {
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                clearInterval(checkGIS);
                console.log('✅ GIS detectado');
                window.ytCrossMixAPIs.gis = true;
                resolve();
            }
        }, 100);
        
        // Timeout de seguridad (15 segundos)
        setTimeout(() => {
            clearInterval(checkGIS);
            console.warn('⏰ Timeout esperando GIS');
            resolve(); // Resolver de todas formas
        }, 15000);
    }
});

// =============================================
// FUNCIÓN PRINCIPAL DE INICIALIZACIÓN
// =============================================

async function initializeAPIs() {
    console.log('🚀 Esperando a que todas las APIs estén listas...');
    
    try {
        // ✅ ESPERAR A QUE TODAS LAS PROMESAS SE RESUELVAN
        await Promise.all([youtubePromise, gapiPromise, gisPromise]);
        
        console.log('🎉 Todas las APIs cargadas correctamente');
        
        // Marcar como listo
        window.ytCrossMixAPIs.ready = true;
        
        // ✅ INICIALIZAR GAPI CLIENT
        if (window.ytCrossMixAPIs.gapi && typeof gapi !== 'undefined') {
            await initializeGapiClient();
        }
        
        // ✅ INICIALIZAR GIS TOKEN CLIENT
        if (window.ytCrossMixAPIs.gis && window.gisInitalize_auth) {
            setTimeout(() => {
                window.gisInitalize_auth();
            }, 500);
        }
        
        // ✅ CONFIGURAR YOUTUBE API CON ORIGIN CORRECTO
        if (window.ytCrossMixAPIs.youtube) {
            configureYouTubeAPI();
        }
        
        // Disparar evento global
        document.dispatchEvent(new CustomEvent('ytCrossMixAPIsReady', {
            detail: { 
                gapi: window.ytCrossMixAPIs.gapi,
                gis: window.ytCrossMixAPIs.gis,
                youtube: window.ytCrossMixAPIs.youtube,
                timestamp: Date.now() 
            }
        }));
        
        console.log('✅ Evento ytCrossMixAPIsReady disparado');
        
    } catch (error) {
        console.error('❌ Error cargando APIs:', error);
        window.ytCrossMixAPIs.errors.push(error.message);
        
        // Disparar evento de error
        document.dispatchEvent(new CustomEvent('ytCrossMixAPIsError', {
            detail: { error: error.message }
        }));
    }
}

// =============================================
// INICIALIZAR GAPI CLIENT
// =============================================

async function initializeGapiClient() {
    console.log('📡 Inicializando GAPI client...');
    
    try {
        await gapi.client.init({
            apiKey: 'AIzaSyDg1EMvKc4D--b6hXTSOhR3ANrLPHsyIH4',
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
        });
        
        await gapi.client.load('youtube', 'v3');
        
        console.log('✅ GAPI y YouTube v3 cargados');
        
        // Llamar a auth.js si está disponible
        if (window.gapiInitialize_auth) {
            window.gapiInitialize_auth();
        }
        
    } catch (err) {
        console.error('❌ Error inicializando GAPI:', err);
        window.ytCrossMixAPIs.errors.push('GAPI init failed: ' + err.message);
    }
}

// =============================================
// CONFIGURAR YOUTUBE API CON ORIGIN
// =============================================

function configureYouTubeAPI() {
    console.log('🎮 Configurando YouTube API con origin correcto...');
    
    if (!window.YT || !window.YT.Player) {
        console.warn('⚠️ YT.Player no disponible');
        return;
    }
    
    const currentOrigin = window.location.origin;
    const originalPlayer = window.YT.Player;
    
    // Wrapper para forzar origin
    window.YT.Player = function(elementId, config) {
        config = config || {};
        config.playerVars = config.playerVars || {};
        
        // ✅ FORZAR ORIGIN Y CONFIGURACIONES
        config.playerVars.origin = currentOrigin;
        config.playerVars.widget_referrer = currentOrigin;
        config.playerVars.enablejsapi = 1;
        
        console.log(`🎮 Creando player "${elementId}" con origin: ${currentOrigin}`);
        
        return new originalPlayer(elementId, config);
    };
    
    // Preservar prototipo
    window.YT.Player.prototype = originalPlayer.prototype;
    
    console.log('✅ YouTube API configurada correctamente');
}

// =============================================
// CARGA AUTOMÁTICA DE YOUTUBE API
// =============================================

function loadYouTubeAPI() {
    // Verificar si ya está cargándose
    if (document.querySelector('script[src*="iframe_api"]')) {
        console.log('📺 YouTube API ya está cargándose...');
        return;
    }
    
    console.log('📺 Cargando YouTube IFrame API...');
    
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    
    // Configurar origin
    const currentOrigin = window.location.origin;
    script.setAttribute('data-origin', currentOrigin);
    
    // ✅ MANEJO DE ERRORES DE CARGA
    script.onerror = () => {
        console.error('❌ Error cargando YouTube IFrame API');
        window.ytCrossMixAPIs.errors.push('YouTube API load failed');
        
        // Reintentar si no hemos excedido el límite
        if (window.ytCrossMixAPIs.retryCount < window.ytCrossMixAPIs.maxRetries) {
            window.ytCrossMixAPIs.retryCount++;
            console.log(`🔄 Reintentando carga de YouTube API (${window.ytCrossMixAPIs.retryCount}/${window.ytCrossMixAPIs.maxRetries})...`);
            
            setTimeout(() => {
                script.remove();
                loadYouTubeAPI();
            }, 2000);
        } else {
            console.error('❌ Error cargando YouTube API después de múltiples intentos');
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage(
                    'Error cargando YouTube. Recarga la página.',
                    'error'
                );
            }
        }
    };
    
    script.onload = () => {
        console.log('✅ YouTube API script cargado');
    };
    
    document.head.appendChild(script);
}

// =============================================
// CONFIGURACIÓN DE CONTROLES DE AUDIO
// =============================================

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
    
    // ✅ CARGAR VOLUMEN GUARDADO
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

// =============================================
// LISTENER PARA TIMEOUT DE APIS
// =============================================

document.addEventListener('ytCrossMixAPIsTimeout', (e) => {
    const detail = e?.detail || {};
    const missing = detail.missing || [];
    const available = detail.available || {};
    
    console.log('🔄 Manejando timeout de APIs...');
    console.log('APIs disponibles:', available);
    console.log('APIs faltantes:', missing);
    
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
    
    // Mostrar advertencia si falta algo crítico
    if (missing.length > 0 && window.unifiedCore) {
        window.unifiedCore.showMessage(
            `Algunas funciones pueden estar limitadas (${missing.join(', ')})`,
            'warning'
        );
    }
});

// =============================================
// LISTENER PARA APIS LISTAS
// =============================================

document.addEventListener('ytCrossMixAPIsReady', (e) => {
    console.log('🎉 Todas las APIs listas:', e.detail);
    
    // Inicializar sistema si está disponible
    if (window.unifiedCore && !window.unifiedCore.state.initialized) {
        console.log('🚀 Inicializando UnifiedCore...');
        // El core se inicializa automáticamente en su constructor
    }
});

// =============================================
// INICIALIZACIÓN AUTOMÁTICA AL CARGAR DOM
// =============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM cargado, iniciando APIs...');
        
        // Cargar YouTube API
        loadYouTubeAPI();
        
        // Inicializar todas las APIs
        initializeAPIs();
        
        // Configurar controles de audio
        setTimeout(setupAudioControls, 1000);
    });
} else {
    console.log('📄 DOM ya cargado, iniciando APIs...');
    
    // Cargar YouTube API
    loadYouTubeAPI();
    
    // Inicializar todas las APIs
    initializeAPIs();
    
    // Configurar controles de audio
    setTimeout(setupAudioControls, 1000);
}

// =============================================
// FUNCIONES GLOBALES DE DEBUG
// =============================================

window.debugAPIs = function() {
    console.group('🐛 Estado de APIs');
    console.log('Estado:', window.ytCrossMixAPIs);
    console.log('GAPI disponible:', typeof gapi !== 'undefined');
    console.log('GIS disponible:', typeof google !== 'undefined' && google.accounts);
    console.log('YouTube disponible:', typeof YT !== 'undefined' && YT.Player);
    console.groupEnd();
};

window.forceReloadAPIs = async function() {
    console.log('🔄 Forzando recarga de APIs...');
    
    window.ytCrossMixAPIs = {
        gapi: false,
        gis: false,
        youtube: false,
        ready: false,
        errors: [],
        retryCount: 0,
        maxRetries: 3
    };
    
    await initializeAPIs();
};

console.log('✅ Sistema de inicialización cargado con promesas');
