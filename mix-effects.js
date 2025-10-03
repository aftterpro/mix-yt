// =============================================
// MIX EFFECTS - MANIPULACIÓN REAL DE AUDIO
// Usando Web Audio API correctamente
// =============================================

console.log('🎚️ Cargando Real Audio Manipulation System...');

class RealAudioManipulation {
    constructor() {
        this.audioContext = null;
        this.players = new Map(); // Almacena info de cada player
        this.masterGain = null;
        this.initialized = false;
        
        // Configuración de efectos
        this.config = {
            echoEnabled: true,
            eqFadeEnabled: true,
            harmonicEnabled: true,
            echoDelay: 0.4,
            echoFeedback: 0.5,
            eqFadeDuration: 8
        };
        
        this.init();
    }
    
    // =============================================
    // INICIALIZACIÓN
    // =============================================
    
    async init() {
        try {
            // Crear AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✅ AudioContext creado');
            
            // Crear nodo master
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            
            // Cargar preferencias
            this.loadPreferences();
            
            // Integrar con core
            this.integrateWithCore();
            
            // Setup UI
            this.setupUI();
            
            this.initialized = true;
            console.log('✅ Real Audio Manipulation inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando:', error);
        }
    }
    
    // =============================================
    // CAPTURAR AUDIO DE IFRAME
    // =============================================
    
    async capturePlayerAudio(player, playerNum) {
        try {
            console.log(`🎤 Intentando capturar audio del player ${playerNum}...`);
            
            const iframe = player.getIframe();
            if (!iframe) {
                console.warn('⚠️ No se pudo obtener iframe');
                return null;
            }
            
            // MÉTODO 1: Usar MediaElementAudioSourceNode (si iframe lo permite)
            try {
                const videoElement = iframe.contentWindow?.document?.querySelector('video');
                
                if (videoElement) {
                    console.log('✅ Elemento video encontrado en iframe');
                    
                    // Verificar si ya está conectado
                    if (this.players.has(playerNum)) {
                        const existing = this.players.get(playerNum);
                        if (existing.source) {
                            console.log('ℹ️ Player ya conectado, reutilizando');
                            return existing;
                        }
                    }
                    
                    // Crear source del elemento de video
                    const source = this.audioContext.createMediaElementSource(videoElement);
                    
                    // Crear cadena de efectos
                    const nodes = this.createEffectChain(playerNum);
                    
                    // Conectar: source → effects → master → output
                    this.connectNodes(source, nodes);
                    
                    // Guardar
                    const playerData = {
                        source,
                        nodes,
                        videoElement,
                        connected: true
                    };
                    
                    this.players.set(playerNum, playerData);
                    
                    console.log(`✅ Audio del player ${playerNum} capturado y conectado`);
                    return playerData;
                }
            } catch (iframeError) {
                console.warn('⚠️ No se puede acceder al video en iframe (CORS):', iframeError.message);
            }
            
            // MÉTODO 2: Solicitar captura de pestaña (requiere interacción del usuario)
            return await this.requestTabCapture(playerNum);
            
        } catch (error) {
            console.error(`❌ Error capturando audio player ${playerNum}:`, error);
            return null;
        }
    }
    
    // =============================================
    // CREAR CADENA DE EFECTOS
    // =============================================
    
    createEffectChain(playerNum) {
        console.log(`🔧 Creando cadena de efectos para player ${playerNum}`);
        
        // Gain principal
        const gain = this.audioContext.createGain();
        gain.gain.value = 1.0;
        
        // Delay para echo
        const delay = this.audioContext.createDelay(5.0);
        delay.delayTime.value = this.config.echoDelay;
        
        // Feedback gain para echo
        const feedbackGain = this.audioContext.createGain();
        feedbackGain.gain.value = 0; // Inicialmente sin echo
        
        // Crear loop de feedback: delay → feedback → delay
        delay.connect(feedbackGain);
        feedbackGain.connect(delay);
        
        // Filtro low-shelf (para EQ fade de graves)
        const lowShelf = this.audioContext.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 200;
        lowShelf.gain.value = 0;
        
        // Filtro high-shelf (para EQ fade de agudos)
        const highShelf = this.audioContext.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3000;
        highShelf.gain.value = 0;
        
        // Analyser para visualización
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        // Splitter/Merger para stereo widening
        const splitter = this.audioContext.createChannelSplitter(2);
        const merger = this.audioContext.createChannelMerger(2);
        
        const nodes = {
            gain,
            delay,
            feedbackGain,
            lowShelf,
            highShelf,
            analyser,
            splitter,
            merger
        };
        
        console.log(`✅ Cadena de efectos creada para player ${playerNum}`);
        return nodes;
    }
    
    // =============================================
    // CONECTAR NODOS
    // =============================================
    
    connectNodes(source, nodes) {
        // Cadena de audio:
        // source → lowShelf → highShelf → gain → analyser → [split para delay] → master
        
        source
            .connect(nodes.lowShelf)
            .connect(nodes.highShelf)
            .connect(nodes.gain)
            .connect(nodes.analyser);
        
        // Rama principal (dry)
        nodes.analyser.connect(this.masterGain);
        
        // Rama de delay (wet) - se mezcla con la principal
        nodes.analyser.connect(nodes.delay);
        nodes.delay.connect(this.masterGain);
        
        console.log('✅ Nodos conectados en cadena');
    }
    
    // =============================================
    // APLICAR EFECTOS REALES
    // =============================================
    
    applyEchoEffect(playerNum, intensity = 0.5, duration = 8000) {
        const playerData = this.players.get(playerNum);
        if (!playerData || !playerData.connected) {
            console.warn(`⚠️ Player ${playerNum} no está conectado`);
            return;
        }
        
        console.log(`🔄 Aplicando echo REAL al player ${playerNum}`);
        
        const nodes = playerData.nodes;
        const currentTime = this.audioContext.currentTime;
        
        // Rampa de feedback (de 0 a intensity en 0.5s, luego decay)
        nodes.feedbackGain.gain.cancelScheduledValues(currentTime);
        nodes.feedbackGain.gain.setValueAtTime(0, currentTime);
        nodes.feedbackGain.gain.linearRampToValueAtTime(intensity, currentTime + 0.5);
        nodes.feedbackGain.gain.exponentialRampToValueAtTime(0.001, currentTime + (duration / 1000));
        
        console.log(`✅ Echo aplicado con intensidad ${intensity}`);
    }
    
    applyEQFadeOut(playerNum, duration = 8000) {
        const playerData = this.players.get(playerNum);
        if (!playerData || !playerData.connected) {
            console.warn(`⚠️ Player ${playerNum} no está conectado`);
            return;
        }
        
        console.log(`🎚️ Aplicando EQ Fade Out REAL al player ${playerNum}`);
        
        const nodes = playerData.nodes;
        const currentTime = this.audioContext.currentTime;
        const durationSec = duration / 1000;
        
        // Reducir graves primero (low-shelf)
        nodes.lowShelf.gain.cancelScheduledValues(currentTime);
        nodes.lowShelf.gain.setValueAtTime(0, currentTime);
        nodes.lowShelf.gain.linearRampToValueAtTime(-12, currentTime + (durationSec * 0.6));
        
        // Reducir agudos después (high-shelf)
        nodes.highShelf.gain.cancelScheduledValues(currentTime);
        nodes.highShelf.gain.setValueAtTime(0, currentTime + (durationSec * 0.3));
        nodes.highShelf.gain.linearRampToValueAtTime(-8, currentTime + durationSec);
        
        // Fade out de volumen general
        nodes.gain.gain.cancelScheduledValues(currentTime);
        nodes.gain.gain.setValueAtTime(1.0, currentTime);
        nodes.gain.gain.exponentialRampToValueAtTime(0.001, currentTime + durationSec);
        
        console.log(`✅ EQ Fade Out aplicado (${duration}ms)`);
    }
    
    applyEQFadeIn(playerNum, duration = 8000) {
        const playerData = this.players.get(playerNum);
        if (!playerData || !playerData.connected) {
            console.warn(`⚠️ Player ${playerNum} no está conectado`);
            return;
        }
        
        console.log(`🎚️ Aplicando EQ Fade In REAL al player ${playerNum}`);
        
        const nodes = playerData.nodes;
        const currentTime = this.audioContext.currentTime;
        const durationSec = duration / 1000;
        
        // Entrar con graves primero (low-shelf normal → boost)
        nodes.lowShelf.gain.cancelScheduledValues(currentTime);
        nodes.lowShelf.gain.setValueAtTime(0, currentTime);
        nodes.lowShelf.gain.linearRampToValueAtTime(3, currentTime + (durationSec * 0.4));
        nodes.lowShelf.gain.linearRampToValueAtTime(0, currentTime + durationSec);
        
        // Agudos entran más lento (high-shelf)
        nodes.highShelf.gain.cancelScheduledValues(currentTime);
        nodes.highShelf.gain.setValueAtTime(-12, currentTime);
        nodes.highShelf.gain.linearRampToValueAtTime(0, currentTime + durationSec);
        
        // Fade in de volumen general
        nodes.gain.gain.cancelScheduledValues(currentTime);
        nodes.gain.gain.setValueAtTime(0.001, currentTime);
        nodes.gain.gain.exponentialRampToValueAtTime(1.0, currentTime + durationSec);
        
        console.log(`✅ EQ Fade In aplicado (${duration}ms)`);
    }
    
    resetEffects(playerNum) {
        const playerData = this.players.get(playerNum);
        if (!playerData || !playerData.connected) return;
        
        const nodes = playerData.nodes;
        const currentTime = this.audioContext.currentTime;
        
        // Reset todos los valores a neutral
        nodes.gain.gain.cancelScheduledValues(currentTime);
        nodes.gain.gain.setValueAtTime(1.0, currentTime);
        
        nodes.feedbackGain.gain.cancelScheduledValues(currentTime);
        nodes.feedbackGain.gain.setValueAtTime(0, currentTime);
        
        nodes.lowShelf.gain.cancelScheduledValues(currentTime);
        nodes.lowShelf.gain.setValueAtTime(0, currentTime);
        
        nodes.highShelf.gain.cancelScheduledValues(currentTime);
        nodes.highShelf.gain.setValueAtTime(0, currentTime);
        
        console.log(`🔄 Efectos reseteados para player ${playerNum}`);
    }
    
    // =============================================
    // INTEGRACIÓN CON CORE.JS
    // =============================================
    
    integrateWithCore() {
        console.log('🔗 Integrando con core.js...');
        
        const checkCore = setInterval(() => {
            if (window.unifiedCore && window.UnifiedCore) {
                clearInterval(checkCore);
                
                // Hook playNextVideo
                this.hookPlayNextVideo();
                
                // Hook onPlayerReady para capturar audio
                this.hookPlayerReady();
                
                console.log('✅ Integrado con core.js');
            }
        }, 500);
        
        setTimeout(() => clearInterval(checkCore), 10000);
    }
    
    hookPlayerReady() {
        const originalOnReady = window.UnifiedCore.prototype.onPlayerReady;
        const self = this;
        
        window.UnifiedCore.prototype.onPlayerReady = function(event) {
            console.log('🎮 onPlayerReady interceptado');
            
            // Llamar original
            const result = originalOnReady.call(this, event);
            
            // Esperar un momento y capturar audio
            setTimeout(async () => {
                if (window.player1) {
                    await self.capturePlayerAudio(window.player1, 1);
                }
                if (window.player2) {
                    await self.capturePlayerAudio(window.player2, 2);
                }
            }, 2000);
            
            return result;
        };
        
        console.log('✅ onPlayerReady hooked');
    }
    
    hookPlayNextVideo() {
        const originalPlayNext = window.UnifiedCore.prototype.playNextVideo;
        const self = this;
        
        window.UnifiedCore.prototype.playNextVideo = async function() {
            console.log('🎵 playNextVideo interceptado por Real Audio');
            
            const outgoingPlayerNum = currentPlayer;
            const incomingPlayerNum = currentPlayer === 1 ? 2 : 1;
            
            console.log(`🔄 Transición: Player ${outgoingPlayerNum} → Player ${incomingPlayerNum}`);
            
            // APLICAR EFECTOS REALES
            if (self.config.echoEnabled) {
                self.applyEchoEffect(outgoingPlayerNum, self.config.echoFeedback, 8000);
            }
            
            if (self.config.eqFadeEnabled) {
                const duration = self.config.eqFadeDuration * 1000;
                self.applyEQFadeOut(outgoingPlayerNum, duration);
                
                // Programar fade in del entrante
                setTimeout(() => {
                    self.applyEQFadeIn(incomingPlayerNum, duration);
                }, 100);
            }
            
            // Notificar
            if (window.unifiedCore) {
                const effects = [];
                if (self.config.echoEnabled) effects.push('Echo');
                if (self.config.eqFadeEnabled) effects.push('EQ Fade');
                
                if (effects.length > 0) {
                    window.unifiedCore.showMessage(
                        `🎛️ ${effects.join(' + ')} aplicados`,
                        'info',
                        2000
                    );
                }
            }
            
            // Llamar a la función original
            return originalPlayNext.call(this);
        };
        
        console.log('✅ playNextVideo hooked con audio real');
    }
    
    // =============================================
    // SOLICITAR CAPTURA DE PESTAÑA
    // =============================================
    
    async requestTabCapture(playerNum) {
        console.log('🎤 Solicitando captura de pestaña...');
        
        // Crear dialog para explicar al usuario
        const dialog = document.createElement('div');
        dialog.className = 'audio-capture-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>🎚️ Activar Efectos de Audio</h3>
                <p>Para que los efectos funcionen perfectamente, necesitamos acceso al audio de la pestaña.</p>
                <div class="dialog-steps">
                    <div class="step">
                        <span class="step-number">1</span>
                        <span>Click en "Permitir"</span>
                    </div>
                    <div class="step">
                        <span class="step-number">2</span>
                        <span>Selecciona "Esta pestaña"</span>
                    </div>
                    <div class="step">
                        <span class="step-number">3</span>
                        <span>Activa "Compartir audio de la pestaña"</span>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button id="allowAudioCapture" class="btn-primary">
                        <i class="fas fa-check"></i> Permitir
                    </button>
                    <button id="cancelAudioCapture" class="btn-secondary">
                        Cancelar
                    </button>
                </div>
                <p class="dialog-note">
                    <i class="fas fa-info-circle"></i>
                    Esto solo captura audio, no video ni datos personales
                </p>
            </div>
        `;
        
        // Estilos
        const style = document.createElement('style');
        style.textContent = `
            .audio-capture-dialog {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
                backdrop-filter: blur(10px);
            }
            
            .dialog-content {
                background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
                border-radius: 16px;
                padding: 30px;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.8);
                border: 2px solid rgba(255, 107, 53, 0.3);
            }
            
            .dialog-content h3 {
                color: #ff6b35;
                margin: 0 0 15px 0;
                font-size: 24px;
            }
            
            .dialog-content p {
                color: white;
                line-height: 1.6;
                margin-bottom: 20px;
            }
            
            .dialog-steps {
                background: rgba(255, 107, 53, 0.1);
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
            }
            
            .step {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 10px 0;
                color: white;
            }
            
            .step-number {
                background: linear-gradient(135deg, #ff6b35, #ff8a65);
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
            }
            
            .dialog-actions {
                display: flex;
                gap: 10px;
                margin-top: 20px;
            }
            
            .btn-primary, .btn-secondary {
                flex: 1;
                padding: 12px 20px;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #ff6b35, #ff8a65);
                color: white;
            }
            
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(255,107,53,0.4);
            }
            
            .btn-secondary {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            
            .dialog-note {
                margin-top: 20px;
                font-size: 13px;
                color: #999;
                text-align: center;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(dialog);
        
        return new Promise((resolve) => {
            dialog.querySelector('#allowAudioCapture').addEventListener('click', async () => {
                try {
                    // Solicitar captura de pestaña con audio
                    const stream = await navigator.mediaDevices.getDisplayMedia({
                        video: false,
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false,
                            sampleRate: 48000
                        }
                    });
                    
                    console.log('✅ Stream de audio capturado');
                    
                    // Crear source del stream
                    const source = this.audioContext.createMediaStreamSource(stream);
                    
                    // Crear cadena de efectos
                    const nodes = this.createEffectChain(playerNum);
                    
                    // Conectar
                    this.connectNodes(source, nodes);
                    
                    // Guardar
                    const playerData = {
                        source,
                        nodes,
                        stream,
                        connected: true
                    };
                    
                    this.players.set(playerNum, playerData);
                    
                    dialog.remove();
                    
                    if (window.unifiedCore) {
                        window.unifiedCore.showMessage(
                            '✅ Efectos de audio activados',
                            'success'
                        );
                    }
                    
                    resolve(playerData);
                    
                } catch (error) {
                    console.error('❌ Error capturando audio:', error);
                    dialog.remove();
                    
                    if (window.unifiedCore) {
                        window.unifiedCore.showMessage(
                            '⚠️ Captura cancelada - Efectos limitados',
                            'warning'
                        );
                    }
                    
                    resolve(null);
                }
            });
            
            dialog.querySelector('#cancelAudioCapture').addEventListener('click', () => {
                dialog.remove();
                resolve(null);
            });
        });
    }
    
    // =============================================
    // INTERFAZ DE USUARIO
    // =============================================
    
    setupUI() {
        // Crear panel de control
        const panel = document.createElement('div');
        panel.className = 'real-audio-panel';
        panel.innerHTML = `
            <div class="audio-panel-header">
                <h3>🎚️ Real Audio Effects</h3>
                <button class="close-panel-btn">×</button>
            </div>
            
            <div class="audio-panel-content">
                <div class="connection-status">
                    <div class="status-indicator" id="player1Status">
                        <span class="status-dot"></span>
                        Player 1: <span class="status-text">Desconectado</span>
                    </div>
                    <div class="status-indicator" id="player2Status">
                        <span class="status-dot"></span>
                        Player 2: <span class="status-text">Desconectado</span>
                    </div>
                </div>
                
                <div class="audio-section">
                    <h4>🔄 Efectos Activos</h4>
                    
                    <label class="audio-toggle">
                        <input type="checkbox" id="realEchoToggle" 
                               ${this.config.echoEnabled ? 'checked' : ''}>
                        <span>Echo Real (Delay + Feedback)</span>
                    </label>
                    
                    <label class="audio-toggle">
                        <input type="checkbox" id="realEQToggle" 
                               ${this.config.eqFadeEnabled ? 'checked' : ''}>
                        <span>EQ Fade (Filtros Reales)</span>
                    </label>
                </div>
                
                <div class="audio-section">
                    <h4>⚙️ Configuración</h4>
                    
                    <div class="config-row">
                        <label>Feedback Echo</label>
                        <input type="range" id="echoFeedbackSlider" 
                               min="0" max="1" value="${this.config.echoFeedback}" step="0.05">
                        <span id="echoFeedbackValue">${Math.round(this.config.echoFeedback * 100)}%</span>
                    </div>
                    
                    <div class="config-row">
                        <label>Delay Time</label>
                        <input type="range" id="echoDelaySlider" 
                               min="0.1" max="1" value="${this.config.echoDelay}" step="0.05">
                        <span id="echoDelayValue">${this.config.echoDelay}s</span>
                    </div>
                </div>
                
                <div class="audio-actions">
                    <button class="audio-btn primary" id="connectAudioBtn">
                        <i class="fas fa-link"></i> Conectar Audio
                    </button>
                    <button class="audio-btn" id="testRealEffects">
                        <i class="fas fa-flask"></i> Probar Ahora
                    </button>
                </div>
            </div>
        `;
        
        // Estilos inline
        const style = document.createElement('style');
        style.textContent = `
            .mix-effects-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
                border-radius: 12px;
                padding: 20px;
                max-width: 450px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                z-index: 10000;
                box-shadow: 0 10px 40px rgba(0,0,0,0.7);
                display: none;
            }
            
            .mix-effects-panel.show {
                display: block;
                animation: slideIn 0.3s ease-out;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translate(-50%, -45%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }
            
            .mix-effects-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                border-bottom: 2px solid rgba(255, 107, 53, 0.3);
                padding-bottom: 10px;
            }
            
            .mix-effects-header h3 {
                color: #ff6b35;
                margin: 0;
                font-size: 20px;
            }
            
            .close-mix-btn {
                background: none;
                border: none;
                color: white;
                font-size: 28px;
                cursor: pointer;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
            }
            
            .close-mix-btn:hover {
                background: rgba(244, 67, 54, 0.2);
                color: #f44336;
            }
            
            .effect-section {
                margin-bottom: 25px;
            }
            
            .effect-section h4 {
                color: white;
                margin-bottom: 15px;
                font-size: 16px;
            }
            
            .effect-toggle {
                display: flex;
                flex-direction: column;
                gap: 5px;
                margin-bottom: 15px;
                padding: 12px;
                background: rgba(255, 107, 53, 0.05);
                border-radius: 8px;
                border: 1px solid rgba(255, 107, 53, 0.2);
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .effect-toggle:hover {
                background: rgba(255, 107, 53, 0.1);
                border-color: rgba(255, 107, 53, 0.4);
            }
            
            .effect-toggle input[type="checkbox"] {
                width: 20px;
                height: 20px;
                cursor: pointer;
                margin-right: 10px;
            }
            
            .effect-toggle > span {
                color: white;
                font-weight: 600;
                display: flex;
                align-items: center;
            }
            
            .effect-description {
                color: #999;
                font-size: 12px;
                margin: 5px 0 0 30px;
                line-height: 1.4;
            }
            
            .config-group {
                display: grid;
                grid-template-columns: 120px 1fr 60px;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .config-group label {
                color: white;
                font-size: 14px;
            }
            
            .config-group input[type="range"] {
                width: 100%;
            }
            
            .config-group span {
                color: var(--primary-color);
                font-weight: 600;
                text-align: right;
                font-size: 13px;
            }
            
            .preset-buttons {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
                gap: 8px;
            }
            
            .preset-btn {
                padding: 10px;
                background: rgba(255, 107, 53, 0.1);
                border: 1px solid rgba(255, 107, 53, 0.3);
                border-radius: 6px;
                color: white;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 13px;
            }
            
            .preset-btn:hover {
                background: rgba(255, 107, 53, 0.2);
                transform: translateY(-2px);
            }
            
            .preset-btn.active {
                background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
                border-color: var(--primary-color);
            }
            
            .mix-effects-actions {
                display: flex;
                gap: 10px;
                margin-top: 20px;
            }
            
            .mix-btn {
                flex: 1;
                padding: 12px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.2s;
            }
            
            .mix-btn.primary {
                background: linear-gradient(135deg, #ff6b35, #ff8a65);
                color: white;
            }
            
            .mix-btn.primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(255,107,53,0.4);
            }
            
            .mix-btn:not(.primary) {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            
            /* Efectos visuales para players */
            .eq-fade-out {
                filter: brightness(0.7) saturate(0.6) !important;
            }
            
            .eq-fade-in {
                filter: brightness(1.2) saturate(1.3) contrast(1.1) !important;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(panel);
        
        this.setupPanelEvents(panel);
        this.addMixEffectsButton();
    }
    
    addMixEffectsButton() {
        const playerControls = document.querySelector('.player-controls');
        if (playerControls) {
            const mixBtn = document.createElement('button');
            mixBtn.className = 'control-button';
            mixBtn.id = 'mixEffectsButton';
            mixBtn.title = 'Mix Effects (Transiciones DJ)';
            mixBtn.innerHTML = '<i class="fas fa-sliders-h"></i>';
            
            mixBtn.addEventListener('click', () => {
                const panel = document.querySelector('.mix-effects-panel');
                if (panel) {
                    panel.classList.toggle('show');
                }
            });
            
            playerControls.appendChild(mixBtn);
            console.log('✅ Botón Mix Effects agregado');
        }
    }
    
    setupPanelEvents(panel) {
        // Cerrar
        panel.querySelector('.close-mix-btn').addEventListener('click', () => {
            panel.classList.remove('show');
        });
        
        // Toggles
        panel.querySelector('#echoToggle').addEventListener('change', (e) => {
            this.config.echoEnabled = e.target.checked;
            console.log(`🔄 Echo: ${e.target.checked ? 'ON' : 'OFF'}`);
        });
        
        panel.querySelector('#eqFadeToggle').addEventListener('change', (e) => {
            this.config.eqFadeEnabled = e.target.checked;
            console.log(`🎚️ EQ Fade: ${e.target.checked ? 'ON' : 'OFF'}`);
        });
        
        panel.querySelector('#harmonicToggle').addEventListener('change', (e) => {
            this.config.harmonicEnabled = e.target.checked;
            console.log(`🎼 Harmonic Mix: ${e.target.checked ? 'ON' : 'OFF'}`);
        });
        
        // Sliders
        const eqSlider = panel.querySelector('#eqFadeDuration');
        const eqValue = panel.querySelector('#eqFadeDurationValue');
        eqSlider.addEventListener('input', (e) => {
            this.config.eqFadeDuration = parseInt(e.target.value);
            eqValue.textContent = `${e.target.value}s`;
        });
        
        const echoSlider = panel.querySelector('#echoDecay');
        const echoValue = panel.querySelector('#echoDecayValue');
        echoSlider.addEventListener('input', (e) => {
            this.config.echoDecay = parseFloat(e.target.value);
            echoValue.textContent = `${Math.round(e.target.value * 100)}%`;
        });
        
        // Presets
        panel.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.applyPreset(e.target.dataset.preset);
                panel.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // Aplicar
        panel.querySelector('#applyMixEffects').addEventListener('click', () => {
            this.savePreferences();
            panel.classList.remove('show');
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('✅ Mix Effects aplicados', 'success');
            }
        });
        
        // Test
        panel.querySelector('#testMixEffects').addEventListener('click', () => {
            this.testEffects();
        });
    }
    
    // =============================================
    // PRESETS
    // =============================================
    
    applyPreset(preset) {
        console.log(`🎨 Aplicando preset: ${preset}`);
        
        switch(preset) {
            case 'off':
                this.config.echoEnabled = false;
                this.config.eqFadeEnabled = false;
                this.config.harmonicEnabled = false;
                break;
                
            case 'light':
                this.config.echoEnabled = false;
                this.config.eqFadeEnabled = true;
                this.config.harmonicEnabled = false;
                this.config.eqFadeDuration = 10;
                break;
                
            case 'medium':
                this.config.echoEnabled = true;
                this.config.eqFadeEnabled = true;
                this.config.harmonicEnabled = false;
                this.config.echoDecay = 0.5;
                this.config.eqFadeDuration = 8;
                break;
                
            case 'heavy':
                this.config.echoEnabled = true;
                this.config.eqFadeEnabled = true;
                this.config.harmonicEnabled = true;
                this.config.echoDecay = 0.7;
                this.config.eqFadeDuration = 8;
                break;
                
            case 'dj':
                this.config.echoEnabled = true;
                this.config.eqFadeEnabled = true;
                this.config.harmonicEnabled = true;
                this.config.echoDecay = 0.6;
                this.config.eqFadeDuration = 6;
                break;
        }
        
        this.savePreferences();
        
        // Actualizar UI
        const panel = document.querySelector('.mix-effects-panel');
        if (panel) {
            panel.querySelector('#echoToggle').checked = this.config.echoEnabled;
            panel.querySelector('#eqFadeToggle').checked = this.config.eqFadeEnabled;
            panel.querySelector('#harmonicToggle').checked = this.config.harmonicEnabled;
            panel.querySelector('#eqFadeDuration').value = this.config.eqFadeDuration;
            panel.querySelector('#eqFadeDurationValue').textContent = `${this.config.eqFadeDuration}s`;
            panel.querySelector('#echoDecay').value = this.config.echoDecay;
            panel.querySelector('#echoDecayValue').textContent = `${Math.round(this.config.echoDecay * 100)}%`;
        }
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage(`🎨 Preset "${preset}" activado`, 'success');
        }
    }
    
    // =============================================
    // TEST DE EFECTOS
    // =============================================
    
    async testEffects() {
        console.log('🧪 Testeando efectos...');
        
        if (!window.player1 || !window.reproduccionIniciada) {
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('⚠️ Reproduce música primero para probar efectos', 'warning');
            }
            return;
        }
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('🧪 Probando efectos en 3s...', 'info');
        }
        
        setTimeout(async () => {
            // Simular transición
            const flatList = window.unifiedCore?.getFlattenedPlaylist() || [];
            const currentIndex = window.unifiedCore?.currentPlayingInfo?.flattenedIndex || 0;
            
            if (flatList.length > currentIndex + 1) {
                const current = flatList[currentIndex];
                const next = flatList[currentIndex + 1];
                
                await this.applyTransitionEffects(current, next, currentPlayer);
                
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage('✅ Efectos aplicados! Escucha la diferencia', 'success');
                }
            }
        }, 3000);
    }
    
    // =============================================
    // PERSISTENCIA
    // =============================================
    
    savePreferences() {
        const prefs = {
            config: this.config
        };
        
        localStorage.setItem('ytcm_mix_effects', JSON.stringify(prefs));
        console.log('💾 Mix Effects guardado');
    }
    
    loadPreferences() {
        try {
            const saved = localStorage.getItem('ytcm_mix_effects');
            if (saved) {
                const prefs = JSON.parse(saved);
                this.config = { ...this.config, ...prefs.config };
                console.log('📂 Mix Effects cargado');
            }
        } catch (e) {
            console.warn('Error cargando preferencias:', e);
        }
    }
}

// =============================================
// INICIALIZACIÓN AUTOMÁTICA
// =============================================

// Crear instancia global
window.mixEffects = new MixEffectsSystem();

// Funciones globales de utilidad
window.toggleMixEffects = function(effectName, enabled) {
    if (!window.mixEffects) return;
    
    switch(effectName) {
        case 'echo':
            window.mixEffects.config.echoEnabled = enabled;
            break;
        case 'eqfade':
            window.mixEffects.config.eqFadeEnabled = enabled;
            break;
        case 'harmonic':
            window.mixEffects.config.harmonicEnabled = enabled;
            break;
    }
    
    window.mixEffects.savePreferences();
    console.log(`✅ ${effectName}: ${enabled ? 'ON' : 'OFF'}`);
};

window.debugMixEffects = function() {
    if (!window.mixEffects) {
        console.log('❌ Mix Effects no inicializado');
        return;
    }
    
    console.log('🎛️ Estado Mix Effects:', {
        config: window.mixEffects.config,
        coreIntegrated: !!(window.unifiedCore && window.UnifiedCore),
        detectedBPMs: window.mixEffects.detectedBPMs.size,
        detectedKeys: window.mixEffects.detectedKeys.size
    });
};

window.testMixEffectsNow = function() {
    if (window.mixEffects) {
        window.mixEffects.testEffects();
    }
};

// Atajos de teclado
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    // Alt + M: Toggle Mix Effects panel
    if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const panel = document.querySelector('.mix-effects-panel');
        if (panel) {
            panel.classList.toggle('show');
        }
    }
    
    // Alt + E: Toggle Echo
    if (e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (window.mixEffects) {
            window.mixEffects.config.echoEnabled = !window.mixEffects.config.echoEnabled;
            window.mixEffects.savePreferences();
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage(
                    `🔄 Echo: ${window.mixEffects.config.echoEnabled ? 'ON' : 'OFF'}`,
                    'info'
                );
            }
        }
    }
    
    // Alt + Q: Toggle EQ Fade
    if (e.altKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        if (window.mixEffects) {
            window.mixEffects.config.eqFadeEnabled = !window.mixEffects.config.eqFadeEnabled;
            window.mixEffects.savePreferences();
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage(
                    `🎚️ EQ Fade: ${window.mixEffects.config.eqFadeEnabled ? 'ON' : 'OFF'}`,
                    'info'
                );
            }
        }
    }
});

console.log('✅ ===== MIX EFFECTS SYSTEM CARGADO =====');
console.log('📝 Características:');
console.log('  🔄 Echo en player saliente');
console.log('  🎚️ EQ Fade (filtrado de frecuencias)');
console.log('  🎼 Harmonic Mixing (ajuste BPM)');
console.log('  🎨 5 Presets rápidos');
console.log('');
console.log('🎹 Atajos de teclado:');
console.log('  Alt+M : Abrir panel Mix Effects');
console.log('  Alt+E : Toggle Echo');
console.log('  Alt+Q : Toggle EQ Fade');
console.log('');
console.log('💡 Comandos disponibles:');
console.log('  window.debugMixEffects()');
console.log('  window.testMixEffectsNow()');
console.log('  window.toggleMixEffects("echo", true)');
console.log('');
console.log('🔗 Integrado con core.js:');
console.log('  ✅ Hook en playNextVideo()');
console.log('  ✅ Hook en startCrossfade()');
console.log('  ✅ Efectos aplicados automáticamente en transiciones');
