// =============================================
// SOLUCIÓN ALTERNATIVA: PROXY DE AUDIO
// Para efectos 100% funcionales sin limitaciones CORS
// =============================================

/**
 * OPCIÓN 1: Usar Media Session API (Moderno)
 * Compatible con Chrome, Edge, Firefox reciente
 */
class MediaSessionEffects {
    constructor() {
        this.init();
    }
    
    async init() {
        if ('mediaSession' in navigator) {
            console.log('✅ Media Session API disponible');
            
            // Interceptar eventos de reproducción
            navigator.mediaSession.setActionHandler('play', () => {
                console.log('▶️ Play detectado');
                this.applyEffectsToCurrentTrack();
            });
            
            navigator.mediaSession.setActionHandler('pause', () => {
                console.log('⏸️ Pause detectado');
            });
        }
    }
    
    applyEffectsToCurrentTrack() {
        // Aplicar efectos cuando cambia la pista
        if (window.realAudioEffects) {
            window.realAudioEffects.connectPlayer(window.player1, 1);
        }
    }
}

/**
 * OPCIÓN 2: Captura de audio del sistema (Chrome)
 * Requiere permiso del usuario
 */
class SystemAudioCapture {
    async requestCapture() {
        try {
            // Solicitar captura de audio de pestaña
            const stream = await navigator.mediaDevices.getDisplayMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                },
                video: false
            });
            
            // Crear AudioContext y procesar
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            
            // Ahora SÍ podemos aplicar efectos al audio real
            return { audioContext, source };
            
        } catch (error) {
            console.error('❌ Error capturando audio:', error);
            return null;
        }
    }
}

/**
 * OPCIÓN 3: Usar reproductor HTML5 personalizado
 * Obtener stream de audio directo (sin iframe)
 */
class DirectAudioPlayer {
    constructor() {
        this.audioElement = null;
        this.audioContext = null;
        this.source = null;
    }
    
    async loadVideo(videoId) {
        try {
            // Obtener URL de audio directo (usando Piped o similar)
            const audioUrl = await this.getAudioUrl(videoId);
            
            // Crear elemento audio
            if (!this.audioElement) {
                this.audioElement = new Audio();
                document.body.appendChild(this.audioElement);
                this.audioElement.style.display = 'none';
            }
            
            this.audioElement.src = audioUrl;
            
            // Crear contexto de audio
            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }
            
            // Conectar source
            if (!this.source) {
                this.source = this.audioContext.createMediaElementSource(this.audioElement);
            }
            
            console.log('✅ Audio directo cargado, listo para efectos');
            return this.source;
            
        } catch (error) {
            console.error('❌ Error cargando audio directo:', error);
            return null;
        }
    }
    
    async getAudioUrl(videoId) {
        // Usar API de Piped para obtener stream directo
        const pipedUrl = `https://api.piped.private.coffee/streams/${videoId}`;
        
        try {
            const response = await fetch(pipedUrl);
            const data = await response.json();
            
            // Buscar stream de audio
            const audioStream = data.audioStreams?.find(s => 
                s.format === 'M4A' || s.format === 'WEBMA'
            );
            
            if (audioStream) {
                return audioStream.url;
            }
            
            throw new Error('No se encontró stream de audio');
            
        } catch (error) {
            console.error('Error obteniendo URL de audio:', error);
            throw error;
        }
    }
    
    play() {
        if (this.audioElement) {
            this.audioElement.play();
        }
    }
    
    pause() {
        if (this.audioElement) {
            this.audioElement.pause();
        }
    }
    
    setVolume(volume) {
        if (this.audioElement) {
            this.audioElement.volume = volume / 100;
        }
    }
}

/**
 * OPCIÓN 4: Bypass de CORS usando Service Worker
 */
const serviceWorkerCode = `
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Interceptar requests de YouTube
    if (url.hostname.includes('youtube.com') || url.hostname.includes('googlevideo.com')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Modificar headers CORS
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set('Access-Control-Allow-Origin', '*');
                    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                    
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                })
        );
    }
});
`;

async function registerServiceWorkerForAudio() {
    if ('serviceWorker' in navigator) {
        try {
            // Crear blob del código
            const blob = new Blob([serviceWorkerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            
            // Registrar
            const registration = await navigator.serviceWorker.register(workerUrl);
            console.log('✅ Service Worker registrado para bypass CORS');
            
            return registration;
            
        } catch (error) {
            console.error('❌ Error registrando Service Worker:', error);
            return null;
        }
    }
}

// =============================================
// IMPLEMENTACIÓN HÍBRIDA (Recomendada)
// =============================================

class HybridAudioSystem {
    constructor() {
        this.mode = 'iframe'; // o 'direct'
        this.directPlayer = null;
        this.init();
    }
    
    async init() {
        console.log('🔧 Inicializando sistema híbrido de audio...');
        
        // Intentar modo directo primero
        const useDirectAudio = await this.checkDirectAudioAvailable();
        
        if (useDirectAudio) {
            console.log('✅ Usando modo DIRECT AUDIO (efectos 100% funcionales)');
            this.mode = 'direct';
            this.directPlayer = new DirectAudioPlayer();
        } else {
            console.log('ℹ️ Usando modo IFRAME (efectos limitados)');
            this.mode = 'iframe';
        }
    }
    
    async checkDirectAudioAvailable() {
        // Verificar si el usuario acepta usar audio directo
        const saved = localStorage.getItem('ytcm_use_direct_audio');
        
        if (saved === 'true') {
            return true;
        }
        
        if (saved === 'false') {
            return false;
        }
        
        // Preguntar al usuario
        return await this.askUserForDirectAudio();
    }
    
    async askUserForDirectAudio() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'audio-mode-dialog';
            dialog.innerHTML = `
                <div class="dialog-content">
                    <h3>🎛️ Modo de Audio Mejorado</h3>
                    <p>Para que los efectos de audio funcionen al 100%, podemos usar audio directo.</p>
                    <p><strong>Ventajas:</strong></p>
                    <ul>
                        <li>✅ Todos los efectos funcionan perfectamente</li>
                        <li>✅ Mayor control de audio</li>
                        <li>✅ Mejor calidad de procesamiento</li>
                    </ul>
                    <p><strong>Desventajas:</strong></p>
                    <ul>
                        <li>⚠️ Sin video visible (solo audio)</li>
                        <li>⚠️ Puede usar más datos</li>
                    </ul>
                    <div class="dialog-actions">
                        <button id="useDirectAudio" class="btn-primary">
                            Usar Audio Directo (Recomendado)
                        </button>
                        <button id="useIframeAudio" class="btn-secondary">
                            Seguir con Iframe (Limitado)
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            dialog.querySelector('#useDirectAudio').addEventListener('click', () => {
                localStorage.setItem('ytcm_use_direct_audio', 'true');
                dialog.remove();
                resolve(true);
            });
            
            dialog.querySelector('#useIframeAudio').addEventListener('click', () => {
                localStorage.setItem('ytcm_use_direct_audio', 'false');
                dialog.remove();
                resolve(false);
            });
        });
    }
    
    async loadVideo(videoId) {
        if (this.mode === 'direct' && this.directPlayer) {
            const source = await this.directPlayer.loadVideo(videoId);
            
            // Conectar efectos al source directo
            if (source && window.realAudioEffects) {
                this.connectEffectsToSource(source);
            }
            
            return source;
        } else {
            // Usar iframe normal
            return null;
        }
    }
    
    connectEffectsToSource(source) {
        // Aquí los efectos funcionarán 100%
        const effects = window.realAudioEffects;
        
        if (!effects || !effects.audioContext) return;
        
        // Conectar cadena de efectos
        const filters = effects.filterNodes.get(1);
        const gains = effects.gainNodes.get(1);
        
        if (filters && gains) {
            // Source -> Filters -> Gains -> Destination
            source
                .connect(filters.lowShelf)
                .connect(filters.midPeak)
                .connect(filters.highShelf)
                .connect(gains.main)
                .connect(effects.compressorNode);
            
            console.log('✅ Efectos conectados a source directo');
        }
    }
}

// Exponer globalmente
window.hybridAudioSystem = new HybridAudioSystem();

console.log('✅ Sistema Híbrido de Audio cargado');
console.log('💡 Para efectos 100% funcionales, usa modo Direct Audio');
