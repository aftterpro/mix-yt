// =============================================
// MIX EFFECTS - MANIPULACIÓN REAL DE AUDIO
// Usando Web Audio API correctamente
// =============================================

console.log('🎚️ Cargando Real Audio Manipulation System...');

class RealAudioManipulation {
    constructor() {
        this.audioContext = null;
        this.players = new Map();
        this.masterGain = null;
        this.initialized = false;
        
        this.config = {
            echoEnabled: true,
            eqFadeEnabled: true,
            echoDelay: 0.4,
            echoFeedback: 0.5,
            eqFadeDuration: 8
        };
        
        this.init();
    }
    
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✅ AudioContext creado');
            
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            
            this.loadPreferences();
            this.integrateWithCore();
            this.setupUI();
            
            this.initialized = true;
            console.log('✅ Real Audio Manipulation inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando:', error);
        }
    }
    
async capturePlayerAudio(player, playerNum) {
    try {
        console.log(`🎤 Intentando capturar audio del player ${playerNum}...`);
        
        // CORRECCIÓN: Obtener iframe correctamente
        const iframe = document.getElementById(`player${playerNum}`);
        if (!iframe) {
            console.warn('⚠️ No se pudo obtener iframe');
            return null;
        }
        
        try {
            // Intentar acceder al elemento video dentro del iframe
            const videoElement = iframe.querySelector('video');
            
            if (videoElement) {
                console.log('✅ Elemento video encontrado');
                
                if (this.players.has(playerNum)) {
                    const existing = this.players.get(playerNum);
                    if (existing.source) {
                        console.log('ℹ️ Player ya conectado, reutilizando');
                        return existing;
                    }
                }
                
                const source = this.audioContext.createMediaElementSource(videoElement);
                const nodes = this.createEffectChain(playerNum);
                this.connectNodes(source, nodes);
                
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
            console.warn('⚠️ No se puede acceder al video (CORS):', iframeError.message);
        }
        
        // Si falla, intentar tab capture
        return await this.requestTabCapture(playerNum);
        
    } catch (error) {
        console.error(`❌ Error capturando audio player ${playerNum}:`, error);
        return null;
    }
}
    
    createEffectChain(playerNum) {
        console.log(`🔧 Creando cadena de efectos para player ${playerNum}`);
        
        const gain = this.audioContext.createGain();
        gain.gain.value = 1.0;
        
        const delay = this.audioContext.createDelay(5.0);
        delay.delayTime.value = this.config.echoDelay;
        
        const feedbackGain = this.audioContext.createGain();
        feedbackGain.gain.value = 0;
        
        delay.connect(feedbackGain);
        feedbackGain.connect(delay);
        
        const lowShelf = this.audioContext.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 200;
        lowShelf.gain.value = 0;
        
        const highShelf = this.audioContext.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3000;
        highShelf.gain.value = 0;
        
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        const nodes = {
            gain,
            delay,
            feedbackGain,
            lowShelf,
            highShelf,
            analyser
        };
        
        console.log(`✅ Cadena de efectos creada para player ${playerNum}`);
        return nodes;
    }
    
    connectNodes(source, nodes) {
        source
            .connect(nodes.lowShelf)
            .connect(nodes.highShelf)
            .connect(nodes.gain)
            .connect(nodes.analyser);
        
        nodes.analyser.connect(this.masterGain);
        nodes.analyser.connect(nodes.delay);
        nodes.delay.connect(this.masterGain);
        
        console.log('✅ Nodos conectados en cadena');
    }
    
    applyEchoEffect(playerNum, intensity = 0.5, duration = 8000) {
        const playerData = this.players.get(playerNum);
        if (!playerData || !playerData.connected) {
            console.warn(`⚠️ Player ${playerNum} no está conectado`);
            return;
        }
        
        console.log(`🔄 Aplicando echo REAL al player ${playerNum}`);
        
        const nodes = playerData.nodes;
        const currentTime = this.audioContext.currentTime;
        
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
        
        nodes.lowShelf.gain.cancelScheduledValues(currentTime);
        nodes.lowShelf.gain.setValueAtTime(0, currentTime);
        nodes.lowShelf.gain.linearRampToValueAtTime(-12, currentTime + (durationSec * 0.6));
        
        nodes.highShelf.gain.cancelScheduledValues(currentTime);
        nodes.highShelf.gain.setValueAtTime(0, currentTime + (durationSec * 0.3));
        nodes.highShelf.gain.linearRampToValueAtTime(-8, currentTime + durationSec);
        
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
        
        nodes.lowShelf.gain.cancelScheduledValues(currentTime);
        nodes.lowShelf.gain.setValueAtTime(0, currentTime);
        nodes.lowShelf.gain.linearRampToValueAtTime(3, currentTime + (durationSec * 0.4));
        nodes.lowShelf.gain.linearRampToValueAtTime(0, currentTime + durationSec);
        
        nodes.highShelf.gain.cancelScheduledValues(currentTime);
        nodes.highShelf.gain.setValueAtTime(-12, currentTime);
        nodes.highShelf.gain.linearRampToValueAtTime(0, currentTime + durationSec);
        
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
    
    integrateWithCore() {
        console.log('🔗 Integrando con core.js...');
        
        const checkCore = setInterval(() => {
            if (window.unifiedCore && window.UnifiedCore) {
                clearInterval(checkCore);
                this.hookPlayNextVideo();
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
            const result = originalOnReady.call(this, event);
            
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
            
            const outgoingPlayerNum = window.currentPlayer;
            const incomingPlayerNum = window.currentPlayer === 1 ? 2 : 1;
            
            console.log(`🔄 Transición: Player ${outgoingPlayerNum} → Player ${incomingPlayerNum}`);
            
            if (self.config.echoEnabled) {
                self.applyEchoEffect(outgoingPlayerNum, self.config.echoFeedback, 8000);
            }
            
            if (self.config.eqFadeEnabled) {
                const duration = self.config.eqFadeDuration * 1000;
                self.applyEQFadeOut(outgoingPlayerNum, duration);
                
                setTimeout(() => {
                    self.applyEQFadeIn(incomingPlayerNum, duration);
                }, 100);
            }
            
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
            
            return originalPlayNext.call(this);
        };
        
        console.log('✅ playNextVideo hooked con audio real');
    }
    
    async requestTabCapture(playerNum) {
        console.log('🎤 Solicitando captura de pestaña...');
        
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
        
        this.addDialogStyles();
        document.body.appendChild(dialog);
        
        return new Promise((resolve) => {
            dialog.querySelector('#allowAudioCapture').addEventListener('click', async () => {
                try {
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
                    
                    const source = this.audioContext.createMediaStreamSource(stream);
                    const nodes = this.createEffectChain(playerNum);
                    this.connectNodes(source, nodes);
                    
                    const playerData = {
                        source,
                        nodes,
                        stream,
                        connected: true
                    };
                    
                    this.players.set(playerNum, playerData);
                    dialog.remove();
                    
                    if (window.unifiedCore) {
                        window.unifiedCore.showMessage('✅ Efectos de audio activados', 'success');
                    }
                    
                    resolve(playerData);
                    
                } catch (error) {
                    console.error('❌ Error capturando audio:', error);
                    dialog.remove();
                    
                    if (window.unifiedCore) {
                        window.unifiedCore.showMessage('⚠️ Captura cancelada - Efectos limitados', 'warning');
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
    
    addDialogStyles() {
        if (document.getElementById('audio-dialog-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'audio-dialog-styles';
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
    }
    
    setupUI() {
        // UI básico - puede expandirse según necesidades
        console.log('✅ UI de audio effects configurada');
    }
    
    loadPreferences() {
        try {
            const saved = localStorage.getItem('ytcm_mix_effects');
            if (saved) {
                const prefs = JSON.parse(saved);
                this.config = { ...this.config, ...prefs.config };
                console.log('📂 Preferencias de audio cargadas');
            }
        } catch (e) {
            console.warn('Error cargando preferencias:', e);
        }
    }
    
    savePreferences() {
        const prefs = {
            config: this.config
        };
        
        localStorage.setItem('ytcm_mix_effects', JSON.stringify(prefs));
        console.log('💾 Preferencias de audio guardadas');
    }
}

// Crear instancia global
window.realAudioManipulation = new RealAudioManipulation();

// Funciones globales de utilidad
window.toggleAudioEffect = function(effectName, enabled) {
    if (!window.realAudioManipulation) return;
    
    switch(effectName) {
        case 'echo':
            window.realAudioManipulation.config.echoEnabled = enabled;
            break;
        case 'eqfade':
            window.realAudioManipulation.config.eqFadeEnabled = enabled;
            break;
    }
    
    window.realAudioManipulation.savePreferences();
    console.log(`✅ ${effectName}: ${enabled ? 'ON' : 'OFF'}`);
};

window.debugAudioEffects = function() {
    if (!window.realAudioManipulation) {
        console.log('❌ Real Audio Manipulation no inicializado');
        return;
    }
    
    console.log('🎛️ Estado de Audio Effects:', {
        initialized: window.realAudioManipulation.initialized,
        config: window.realAudioManipulation.config,
        playersConnected: window.realAudioManipulation.players.size,
        coreIntegrated: !!(window.unifiedCore && window.UnifiedCore)
    });
};

console.log('✅ Real Audio Manipulation System cargado');
console.log('📝 Comandos disponibles:');
console.log('  window.debugAudioEffects()');
console.log('  window.toggleAudioEffect("echo", true/false)');
console.log('  window.toggleAudioEffect("eqfade", true/false)');
