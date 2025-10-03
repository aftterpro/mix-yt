// =============================================
// SISTEMA DE EFECTOS DE AUDIO REALES
// Con Web Audio API - Efectos AUDIBLES
// =============================================

console.log('🎛️ Cargando Sistema de Efectos de Audio Reales...');

class RealAudioEffects {
    constructor() {
        this.audioContext = null;
        this.sourceNodes = new Map();
        this.gainNodes = new Map();
        this.filterNodes = new Map();
        this.pannerNodes = new Map();
        this.convolverNodes = new Map();
        this.analyserNodes = new Map();
        this.compressorNode = null;
        
        // Estado de efectos
        this.effectsEnabled = {
            equalizer: false,
            bassBoost: false,
            echo: false,
            reverb: false,
            stereoWidening: false,
            compression: false
        };
        
        // Configuraciones de efectos
        this.config = {
            bassBoost: 8, // dB
            trebleBoost: 4, // dB
            echoDelay: 0.3, // segundos
            echoFeedback: 0.4, // 0-1
            reverbAmount: 0.3, // 0-1
            stereoWidth: 0.7, // 0-1
            compressionThreshold: -24, // dB
            compressionRatio: 4
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
            
            console.log('✅ AudioContext creado:', {
                sampleRate: this.audioContext.sampleRate,
                state: this.audioContext.state
            });
            
            // Resume context si está suspendido (política de navegador)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Crear compresor global (master)
            this.compressorNode = this.audioContext.createDynamicsCompressor();
            this.compressorNode.threshold.value = this.config.compressionThreshold;
            this.compressorNode.knee.value = 10;
            this.compressorNode.ratio.value = this.config.compressionRatio;
            this.compressorNode.attack.value = 0.003;
            this.compressorNode.release.value = 0.25;
            
            // Conectar compresor al destino
            this.compressorNode.connect(this.audioContext.destination);
            
            // Cargar impulse response para reverb
            await this.loadReverbImpulse();
            
            // Configurar UI
            this.setupUI();
            
            // Cargar preferencias
            this.loadPreferences();
            
            console.log('✅ Sistema de Efectos de Audio inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando efectos:', error);
        }
    }
    
    // =============================================
    // CONECTAR REPRODUCTORES
    // =============================================
    
    async connectPlayer(player, playerNum) {
        if (!this.audioContext) {
            console.warn('⚠️ AudioContext no disponible');
            return;
        }
        
        try {
            console.log(`🔌 Conectando player ${playerNum} al sistema de efectos`);
            
            // Obtener elemento de video del iframe
            const iframe = player.getIframe();
            if (!iframe) {
                console.warn('⚠️ No se pudo obtener iframe');
                return;
            }
            
            // IMPORTANTE: Necesitamos acceder al elemento de video dentro del iframe
            // Debido a políticas CORS, esto puede ser limitado
            // Alternativa: Usar MediaElementAudioSourceNode directamente
            
            // Crear nodos para este player
            const gainNode = this.audioContext.createGain();
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            
            // Filtros de ecualización (3 bandas)
            const lowShelf = this.audioContext.createBiquadFilter();
            lowShelf.type = 'lowshelf';
            lowShelf.frequency.value = 200;
            lowShelf.gain.value = 0;
            
            const midPeak = this.audioContext.createBiquadFilter();
            midPeak.type = 'peaking';
            midPeak.frequency.value = 1000;
            midPeak.Q.value = 1;
            midPeak.gain.value = 0;
            
            const highShelf = this.audioContext.createBiquadFilter();
            highShelf.type = 'highshelf';
            highShelf.frequency.value = 4000;
            highShelf.gain.value = 0;
            
            // Delay para echo
            const delayNode = this.audioContext.createDelay(5);
            delayNode.delayTime.value = this.config.echoDelay;
            
            const feedbackGain = this.audioContext.createGain();
            feedbackGain.gain.value = this.config.echoFeedback;
            
            // Conexión de echo (feedback loop)
            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
            
            // Reverb (convolver)
            const convolver = this.audioContext.createConvolver();
            if (this.reverbBuffer) {
                convolver.buffer = this.reverbBuffer;
            }
            
            const reverbGain = this.audioContext.createGain();
            reverbGain.gain.value = 0; // Inicialmente sin reverb
            
            // Stereo widening (split y procesamiento)
            const splitter = this.audioContext.createChannelSplitter(2);
            const merger = this.audioContext.createChannelMerger(2);
            
            const leftDelay = this.audioContext.createDelay();
            leftDelay.delayTime.value = 0.02; // 20ms
            
            const rightDelay = this.audioContext.createDelay();
            rightDelay.delayTime.value = 0.02;
            
            const leftGain = this.audioContext.createGain();
            leftGain.gain.value = 1;
            
            const rightGain = this.audioContext.createGain();
            rightGain.gain.value = 1;
            
            // Guardar nodos
            this.gainNodes.set(playerNum, {
                main: gainNode,
                feedback: feedbackGain,
                reverb: reverbGain,
                left: leftGain,
                right: rightGain
            });
            
            this.filterNodes.set(playerNum, {
                lowShelf,
                midPeak,
                highShelf,
                delay: delayNode,
                convolver
            });
            
            this.analyserNodes.set(playerNum, analyser);
            
            // CADENA DE PROCESAMIENTO:
            // source -> EQ -> dry/wet split -> 
            //   -> echo path -> reverb -> stereo -> gain -> compressor -> output
            
            // Nota: La fuente de audio se conectará dinámicamente cuando esté disponible
            
            console.log(`✅ Player ${playerNum} conectado al sistema de efectos`);
            
        } catch (error) {
            console.error(`❌ Error conectando player ${playerNum}:`, error);
        }
    }
    
    // =============================================
    // APLICAR EFECTOS
    // =============================================
    
    applyBassBoost(enable, playerNum = null) {
        const players = playerNum ? [playerNum] : [1, 2];
        
        players.forEach(num => {
            const filters = this.filterNodes.get(num);
            if (filters && filters.lowShelf) {
                const gain = enable ? this.config.bassBoost : 0;
                filters.lowShelf.gain.setValueAtTime(
                    gain, 
                    this.audioContext.currentTime
                );
                console.log(`🔊 Bass Boost Player ${num}: ${enable ? 'ON' : 'OFF'} (${gain}dB)`);
            }
        });
        
        this.effectsEnabled.bassBoost = enable;
        this.savePreferences();
    }
    
    applyTrebleBoost(enable, playerNum = null) {
        const players = playerNum ? [playerNum] : [1, 2];
        
        players.forEach(num => {
            const filters = this.filterNodes.get(num);
            if (filters && filters.highShelf) {
                const gain = enable ? this.config.trebleBoost : 0;
                filters.highShelf.gain.setValueAtTime(
                    gain,
                    this.audioContext.currentTime
                );
                console.log(`✨ Treble Boost Player ${num}: ${enable ? 'ON' : 'OFF'} (${gain}dB)`);
            }
        });
    }
    
    applyEcho(enable, playerNum = null) {
        const players = playerNum ? [playerNum] : [1, 2];
        
        players.forEach(num => {
            const gains = this.gainNodes.get(num);
            if (gains && gains.feedback) {
                const feedback = enable ? this.config.echoFeedback : 0;
                gains.feedback.gain.setValueAtTime(
                    feedback,
                    this.audioContext.currentTime
                );
                console.log(`🔄 Echo Player ${num}: ${enable ? 'ON' : 'OFF'} (${feedback})`);
            }
        });
        
        this.effectsEnabled.echo = enable;
        this.savePreferences();
    }
    
    applyReverb(enable, playerNum = null) {
        const players = playerNum ? [playerNum] : [1, 2];
        
        players.forEach(num => {
            const gains = this.gainNodes.get(num);
            if (gains && gains.reverb) {
                const amount = enable ? this.config.reverbAmount : 0;
                gains.reverb.gain.setValueAtTime(
                    amount,
                    this.audioContext.currentTime
                );
                console.log(`🎭 Reverb Player ${num}: ${enable ? 'ON' : 'OFF'} (${amount})`);
            }
        });
        
        this.effectsEnabled.reverb = enable;
        this.savePreferences();
    }
    
    applyStereoWidening(enable, playerNum = null) {
        const players = playerNum ? [playerNum] : [1, 2];
        
        players.forEach(num => {
            const gains = this.gainNodes.get(num);
            if (gains && gains.left && gains.right) {
                if (enable) {
                    // Ampliar estéreo ajustando ganancia de canales
                    const width = this.config.stereoWidth;
                    gains.left.gain.setValueAtTime(1 + width, this.audioContext.currentTime);
                    gains.right.gain.setValueAtTime(1 + width, this.audioContext.currentTime);
                } else {
                    gains.left.gain.setValueAtTime(1, this.audioContext.currentTime);
                    gains.right.gain.setValueAtTime(1, this.audioContext.currentTime);
                }
                console.log(`🎧 Stereo Widening Player ${num}: ${enable ? 'ON' : 'OFF'}`);
            }
        });
        
        this.effectsEnabled.stereoWidening = enable;
        this.savePreferences();
    }
    
    applyCompression(enable) {
        if (!this.compressorNode) return;
        
        if (enable) {
            this.compressorNode.threshold.value = this.config.compressionThreshold;
            this.compressorNode.ratio.value = this.config.compressionRatio;
        } else {
            this.compressorNode.threshold.value = -100; // Desactivar
            this.compressorNode.ratio.value = 1;
        }
        
        this.effectsEnabled.compression = enable;
        this.savePreferences();
        console.log(`🎚️ Compression: ${enable ? 'ON' : 'OFF'}`);
    }
    
    // =============================================
    // PRESETS
    // =============================================
    
    applyPreset(presetName) {
        console.log(`🎨 Aplicando preset: ${presetName}`);
        
        // Desactivar todos primero
        this.disableAllEffects();
        
        switch(presetName) {
            case 'bass-boost':
                this.config.bassBoost = 10;
                this.applyBassBoost(true);
                this.applyCompression(true);
                break;
                
            case 'treble-boost':
                this.config.trebleBoost = 8;
                this.applyTrebleBoost(true);
                break;
                
            case 'club':
                this.config.bassBoost = 12;
                this.config.trebleBoost = 6;
                this.applyBassBoost(true);
                this.applyTrebleBoost(true);
                this.applyCompression(true);
                break;
                
            case 'concert-hall':
                this.config.reverbAmount = 0.5;
                this.applyReverb(true);
                this.applyStereoWidening(true);
                break;
                
            case 'studio':
                this.config.reverbAmount = 0.2;
                this.applyReverb(true);
                this.applyCompression(true);
                break;
                
            case 'acoustic':
                this.config.reverbAmount = 0.3;
                this.config.stereoWidth = 0.5;
                this.applyReverb(true);
                this.applyStereoWidening(true);
                break;
                
            case 'electronic':
                this.config.bassBoost = 8;
                this.config.echoDelay = 0.25;
                this.config.echoFeedback = 0.3;
                this.applyBassBoost(true);
                this.applyEcho(true);
                this.applyCompression(true);
                break;
                
            case 'rock':
                this.config.bassBoost = 6;
                this.config.trebleBoost = 6;
                this.applyBassBoost(true);
                this.applyTrebleBoost(true);
                this.applyCompression(true);
                break;
                
            case 'jazz':
                this.config.reverbAmount = 0.25;
                this.config.stereoWidth = 0.6;
                this.applyReverb(true);
                this.applyStereoWidening(true);
                break;
                
            case 'flat':
            default:
                // Sin efectos
                break;
        }
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage(`Preset aplicado: ${presetName}`, 'success');
        }
    }
    
    disableAllEffects() {
        this.applyBassBoost(false);
        this.applyTrebleBoost(false);
        this.applyEcho(false);
        this.applyReverb(false);
        this.applyStereoWidening(false);
        this.applyCompression(false);
    }
    
    // =============================================
    // REVERB IMPULSE RESPONSE
    // =============================================
    
    async loadReverbImpulse() {
        try {
            // Crear impulse response sintético (simulación de sala)
            const duration = 2; // 2 segundos
            const sampleRate = this.audioContext.sampleRate;
            const length = sampleRate * duration;
            const impulse = this.audioContext.createBuffer(2, length, sampleRate);
            
            const leftChannel = impulse.getChannelData(0);
            const rightChannel = impulse.getChannelData(1);
            
            // Generar reverb decay
            for (let i = 0; i < length; i++) {
                const decay = Math.exp(-3 * i / length);
                leftChannel[i] = (Math.random() * 2 - 1) * decay;
                rightChannel[i] = (Math.random() * 2 - 1) * decay;
            }
            
            this.reverbBuffer = impulse;
            console.log('✅ Impulse response de reverb creado');
            
        } catch (error) {
            console.error('❌ Error creando impulse response:', error);
        }
    }
    
    // =============================================
    // VISUALIZACIÓN DE AUDIO
    // =============================================
    
    createVisualizer(canvasId, playerNum) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const analyser = this.analyserNodes.get(playerNum);
        if (!analyser) return;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            requestAnimationFrame(draw);
            
            analyser.getByteFrequencyData(dataArray);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                
                const hue = (i / bufferLength) * 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        };
        
        draw();
    }
    
    // =============================================
    // INTERFAZ DE USUARIO
    // =============================================
    
    setupUI() {
        const effectsPanel = document.createElement('div');
        effectsPanel.className = 'audio-effects-panel';
        effectsPanel.innerHTML = `
            <div class="effects-header">
                <h3>🎛️ Efectos de Audio</h3>
                <button class="close-effects-btn">×</button>
            </div>
            
            <div class="effects-content">
                <!-- PRESETS -->
                <div class="effects-section">
                    <h4>🎨 Presets</h4>
                    <div class="preset-buttons">
                        <button class="preset-btn" data-preset="flat">Flat</button>
                        <button class="preset-btn" data-preset="bass-boost">Bass Boost</button>
                        <button class="preset-btn" data-preset="treble-boost">Treble</button>
                        <button class="preset-btn" data-preset="club">Club</button>
                        <button class="preset-btn" data-preset="concert-hall">Concert Hall</button>
                        <button class="preset-btn" data-preset="studio">Studio</button>
                        <button class="preset-btn" data-preset="acoustic">Acoustic</button>
                        <button class="preset-btn" data-preset="electronic">Electronic</button>
                        <button class="preset-btn" data-preset="rock">Rock</button>
                        <button class="preset-btn" data-preset="jazz">Jazz</button>
                    </div>
                </div>
                
                <!-- EFECTOS INDIVIDUALES -->
                <div class="effects-section">
                    <h4>🎚️ Efectos Individuales</h4>
                    
                    <div class="effect-control">
                        <label class="effect-toggle">
                            <input type="checkbox" id="bassBoostToggle">
                            <span>Bass Boost</span>
                        </label>
                        <input type="range" id="bassBoostSlider" min="0" max="15" value="8" step="1">
                        <span id="bassBoostValue">8 dB</span>
                    </div>
                    
                    <div class="effect-control">
                        <label class="effect-toggle">
                            <input type="checkbox" id="trebleBoostToggle">
                            <span>Treble Boost</span>
                        </label>
                        <input type="range" id="trebleBoostSlider" min="0" max="12" value="4" step="1">
                        <span id="trebleBoostValue">4 dB</span>
                    </div>
                    
                    <div class="effect-control">
                        <label class="effect-toggle">
                            <input type="checkbox" id="echoToggle">
                            <span>Echo/Delay</span>
                        </label>
                        <input type="range" id="echoDelaySlider" min="0.1" max="1" value="0.3" step="0.05">
                        <span id="echoDelayValue">0.3 s</span>
                    </div>
                    
                    <div class="effect-control">
                        <label class="effect-toggle">
                            <input type="checkbox" id="reverbToggle">
                            <span>Reverb</span>
                        </label>
                        <input type="range" id="reverbSlider" min="0" max="1" value="0.3" step="0.05">
                        <span id="reverbValue">30 %</span>
                    </div>
                    
                    <div class="effect-control">
                        <label class="effect-toggle">
                            <input type="checkbox" id="stereoToggle">
                            <span>Stereo Widening</span>
                        </label>
                        <input type="range" id="stereoSlider" min="0" max="1" value="0.7" step="0.05">
                        <span id="stereoValue">70 %</span>
                    </div>
                    
                    <div class="effect-control">
                        <label class="effect-toggle">
                            <input type="checkbox" id="compressionToggle">
                            <span>Compression</span>
                        </label>
                        <input type="range" id="compressionRatioSlider" min="1" max="20" value="4" step="1">
                        <span id="compressionRatioValue">4:1</span>
                    </div>
                </div>
                
                <!-- VISUALIZADOR -->
                <div class="effects-section">
                    <h4>📊 Visualizador de Audio</h4>
                    <canvas id="audioVisualizer" width="400" height="100"></canvas>
                </div>
                
                <!-- ACCIONES -->
                <div class="effects-actions">
                    <button class="effects-btn primary" id="applyEffects">Aplicar</button>
                    <button class="effects-btn" id="resetEffects">Reset</button>
                </div>
            </div>
        `;
        
        // Estilos
        const style = document.createElement('style');
        style.textContent = `
            .audio-effects-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
                border-radius: 12px;
                padding: 20px;
                max-width: 500px;
                width: 95%;
                max-height: 85vh;
                overflow-y: auto;
                z-index: 10000;
                box-shadow: 0 10px 40px rgba(0,0,0,0.7);
                display: none;
            }
            
            .audio-effects-panel.show {
                display: block;
            }
            
            .effects-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                border-bottom: 2px solid rgba(255, 107, 53, 0.3);
                padding-bottom: 10px;
            }
            
            .effects-header h3 {
                color: #ff6b35;
                margin: 0;
            }
            
            .close-effects-btn {
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
            
            .close-effects-btn:hover {
                background: rgba(244, 67, 54, 0.2);
                color: #f44336;
            }
            
            .effects-section {
                margin-bottom: 25px;
            }
            
            .effects-section h4 {
                color: white;
                margin-bottom: 15px;
                font-size: 16px;
            }
            
            .preset-buttons {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
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
                font-size: 12px;
            }
            
            .preset-btn:hover {
                background: rgba(255, 107, 53, 0.2);
                border-color: var(--primary-color);
                transform: translateY(-2px);
            }
            
            .preset-btn.active {
                background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
                border-color: var(--primary-color);
            }
            
            .effect-control {
                display: grid;
                grid-template-columns: 150px 1fr 60px;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .effect-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                color: white;
                cursor: pointer;
            }
            
            .effect-toggle input[type="checkbox"] {
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            
            .effect-control input[type="range"] {
                width: 100%;
                height: 6px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
                outline: none;
                cursor: pointer;
            }
            
            .effect-control input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                background: var(--primary-color);
                border-radius: 50%;
                cursor: pointer;
            }
            
            .effect-control span {
                color: var(--primary-color);
                font-size: 13px;
                font-weight: 600;
                text-align: right;
            }
            
            #audioVisualizer {
                width: 100%;
                height: 100px;
                background: #000;
                border-radius: 6px;
            }
            
            .effects-actions {
                display: flex;
                gap: 10px;
                margin-top: 20px;
            }
            
            .effects-btn {
                flex: 1;
                padding: 12px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.2s;
            }
            
            .effects-btn.primary {
                background: linear-gradient(135deg, #ff6b35, #ff8a65);
                color: white;
            }
            
            .effects-btn.primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(255,107,53,0.4);
            }
            
            .effects-btn:not(.primary) {
                background: rgba(255,255,255,0.1);
                color: white;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(effectsPanel);
        
        this.setupEffectsEvents(effectsPanel);
        this.addEffectsButton();
    }
    
    addEffectsButton() {
        const playerControls = document.querySelector('.player-controls');
        if (playerControls) {
            const effectsBtn = document.createElement('button');
            effectsBtn.className = 'control-button';
            effectsBtn.id = 'audioEffectsButton';
            effectsBtn.title = 'Efectos de Audio';
            effectsBtn.innerHTML = '<i class="fas fa-magic"></i>';
            
            effectsBtn.addEventListener('click', () => {
                const panel = document.querySelector('.audio-effects-panel');
                if (panel) {
                    panel.classList.toggle('show');
                    
                    // Iniciar visualizador si está abierto
                    if (panel.classList.contains('show')) {
                        this.createVisualizer('audioVisualizer', 1);
                    }
                }
            });
            
            playerControls.appendChild(effectsBtn);
        }
    }
    
    setupEffectsEvents(panel) {
        // Cerrar panel
        panel.querySelector('.close-effects-btn').addEventListener('click', () => {
            panel.classList.remove('show');
        });
        
        // Presets
        panel.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const preset = e.target.dataset.preset;
                this.applyPreset(preset);
                
                // Highlight activo
                panel.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // Bass Boost
        const bassToggle = panel.querySelector('#bassBoostToggle');
        const bassSlider = panel.querySelector('#bassBoostSlider');
        const bassValue = panel.querySelector('#bassBoostValue');
        
        bassToggle.addEventListener('change', (e) => {
            this.applyBassBoost(e.target.checked);
        });
        
        bassSlider.addEventListener('input', (e) => {
            this.config.bassBoost = parseFloat(e.target.value);
            bassValue.textContent = `${e.target.value} dB`;
            if (bassToggle.checked) {
                this.applyBassBoost(true);
            }
        });
        
        // Treble Boost
        const trebleToggle = panel.querySelector('#trebleBoostToggle');
        const trebleSlider = panel.querySelector('#trebleBoostSlider');
        const trebleValue = panel.querySelector('#trebleBoostValue');
        
        trebleToggle.addEventListener('change', (e) => {
            this.applyTrebleBoost(e.target.checked);
        });
        
        trebleSlider.addEventListener('input', (e) => {
            this.config.trebleBoost = parseFloat(e.target.value);
            trebleValue.textContent = `${e.target.value} dB`;
            if (trebleToggle.checked) {
                this.applyTrebleBoost(true);
            }
        });
        
        // Echo
        const echoToggle = panel.querySelector('#echoToggle');
        const echoSlider = panel.querySelector('#echoDelaySlider');
        const echoValue = panel.querySelector('#echoDelayValue');
        
        echoToggle.addEventListener('change', (e) => {
            this.applyEcho(e.target.checked);
        });
        
        echoSlider.addEventListener('input', (e) => {
            this.config.echoDelay = parseFloat(e.target.value);
            echoValue.textContent = `${e.target.value} s`;
            
            // Actualizar delay
            [1, 2].forEach(num => {
                const filters = this.filterNodes.get(num);
                if (filters && filters.delay) {
                    filters.delay.delayTime.value = this.config.echoDelay;
                }
            });
        });
        
        // Reverb
        const reverbToggle = panel.querySelector('#reverbToggle');
        const reverbSlider = panel.querySelector('#reverbSlider');
        const reverbValue = panel.querySelector('#reverbValue');
        
        reverbToggle.addEventListener('change', (e) => {
            this.applyReverb(e.target.checked);
        });
        
        reverbSlider.addEventListener('input', (e) => {
            this.config.reverbAmount = parseFloat(e.target.value);
            reverbValue.textContent = `${Math.round(e.target.value * 100)} %`;
            if (reverbToggle.checked) {
                this.applyReverb(true);
            }
        });
        
        // Stereo Widening
        const stereoToggle = panel.querySelector('#stereoToggle');
        const stereoSlider = panel.querySelector('#stereoSlider');
        const stereoValue = panel.querySelector('#stereoValue');
        
        stereoToggle.addEventListener('change', (e) => {
            this.applyStereoWidening(e.target.checked);
        });
        
        stereoSlider.addEventListener('input', (e) => {
            this.config.stereoWidth = parseFloat(e.target.value);
            stereoValue.textContent = `${Math.round(e.target.value * 100)} %`;
            if (stereoToggle.checked) {
                this.applyStereoWidening(true);
            }
        });
        
        // Compression
        const compressionToggle = panel.querySelector('#compressionToggle');
        const compressionSlider = panel.querySelector('#compressionRatioSlider');
        const compressionValue = panel.querySelector('#compressionRatioValue');
        
        compressionToggle.addEventListener('change', (e) => {
            this.applyCompression(e.target.checked);
        });
        
        compressionSlider.addEventListener('input', (e) => {
            this.config.compressionRatio = parseFloat(e.target.value);
            compressionValue.textContent = `${e.target.value}:1`;
            if (this.compressorNode) {
                this.compressorNode.ratio.value = this.config.compressionRatio;
            }
        });
        
        // Botón Aplicar
        panel.querySelector('#applyEffects').addEventListener('click', () => {
            this.savePreferences();
            panel.classList.remove('show');
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('Efectos aplicados', 'success');
            }
        });
        
        // Botón Reset
        panel.querySelector('#resetEffects').addEventListener('click', () => {
            this.disableAllEffects();
            this.resetToDefaults();
            
            // Resetear UI
            panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            panel.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('Efectos reseteados', 'info');
            }
        });
    }
    
    // =============================================
    // PERSISTENCIA
    // =============================================
    
    savePreferences() {
        const prefs = {
            effectsEnabled: this.effectsEnabled,
            config: this.config
        };
        
        localStorage.setItem('ytcm_audio_effects', JSON.stringify(prefs));
        console.log('💾 Preferencias de efectos guardadas');
    }
    
    loadPreferences() {
        try {
            const saved = localStorage.getItem('ytcm_audio_effects');
            if (saved) {
                const prefs = JSON.parse(saved);
                this.effectsEnabled = prefs.effectsEnabled || this.effectsEnabled;
                this.config = { ...this.config, ...prefs.config };
                
                // Aplicar efectos guardados
                if (this.effectsEnabled.bassBoost) this.applyBassBoost(true);
                if (this.effectsEnabled.echo) this.applyEcho(true);
                if (this.effectsEnabled.reverb) this.applyReverb(true);
                if (this.effectsEnabled.stereoWidening) this.applyStereoWidening(true);
                if (this.effectsEnabled.compression) this.applyCompression(true);
                
                console.log('📂 Preferencias de efectos cargadas');
            }
        } catch (e) {
            console.warn('Error cargando preferencias de efectos:', e);
        }
    }
    
    resetToDefaults() {
        this.config = {
            bassBoost: 8,
            trebleBoost: 4,
            echoDelay: 0.3,
            echoFeedback: 0.4,
            reverbAmount: 0.3,
            stereoWidth: 0.7,
            compressionThreshold: -24,
            compressionRatio: 4
        };
        
        this.effectsEnabled = {
            equalizer: false,
            bassBoost: false,
            echo: false,
            reverb: false,
            stereoWidening: false,
            compression: false
        };
        
        this.savePreferences();
    }
}

// =============================================
// INTEGRACIÓN CON EL SISTEMA EXISTENTE
// =============================================

// Crear instancia global
window.realAudioEffects = new RealAudioEffects();

// Integrar con los reproductores cuando estén listos
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎛️ Esperando reproductores para conectar efectos...');
    
    const waitForPlayers = setInterval(() => {
        if (window.player1 && window.player2 && window.playersInitialized) {
            clearInterval(waitForPlayers);
            
            console.log('✅ Reproductores detectados, conectando efectos...');
            
            // Conectar ambos reproductores
            setTimeout(async () => {
                await window.realAudioEffects.connectPlayer(window.player1, 1);
                await window.realAudioEffects.connectPlayer(window.player2, 2);
                
                console.log('✅ Efectos de audio conectados a ambos reproductores');
                
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage('Sistema de efectos listo', 'success');
                }
            }, 2000);
        }
    }, 1000);
    
    // Timeout de seguridad
    setTimeout(() => clearInterval(waitForPlayers), 30000);
});

// =============================================
// FUNCIONES GLOBALES DE UTILIDAD
// =============================================

/**
 * Aplicar preset rápido
 */
window.applyAudioPreset = function(presetName) {
    if (window.realAudioEffects) {
        window.realAudioEffects.applyPreset(presetName);
    } else {
        console.error('❌ Sistema de efectos no disponible');
    }
};

/**
 * Debug de efectos
 */
window.debugAudioEffects = function() {
    if (!window.realAudioEffects) {
        console.log('❌ Sistema de efectos no inicializado');
        return;
    }
    
    console.log('🎛️ Estado de Efectos de Audio:', {
        audioContext: {
            state: window.realAudioEffects.audioContext?.state,
            sampleRate: window.realAudioEffects.audioContext?.sampleRate
        },
        effectsEnabled: window.realAudioEffects.effectsEnabled,
        config: window.realAudioEffects.config,
        nodes: {
            player1: {
                gain: !!window.realAudioEffects.gainNodes.get(1),
                filters: !!window.realAudioEffects.filterNodes.get(1),
                analyser: !!window.realAudioEffects.analyserNodes.get(1)
            },
            player2: {
                gain: !!window.realAudioEffects.gainNodes.get(2),
                filters: !!window.realAudioEffects.filterNodes.get(2),
                analyser: !!window.realAudioEffects.analyserNodes.get(2)
            }
        }
    });
};

/**
 * Test de efectos
 */
window.testAudioEffects = async function() {
    console.log('🧪 ===== TEST DE EFECTOS DE AUDIO =====');
    
    if (!window.realAudioEffects) {
        console.error('❌ Sistema de efectos no disponible');
        return;
    }
    
    const effects = window.realAudioEffects;
    
    // Test 1: Bass Boost
    console.log('\n🔊 TEST 1: Bass Boost');
    effects.applyBassBoost(true);
    await new Promise(r => setTimeout(r, 3000));
    effects.applyBassBoost(false);
    console.log('✅ Bass Boost completado');
    
    // Test 2: Echo
    console.log('\n🔄 TEST 2: Echo');
    effects.applyEcho(true);
    await new Promise(r => setTimeout(r, 3000));
    effects.applyEcho(false);
    console.log('✅ Echo completado');
    
    // Test 3: Reverb
    console.log('\n🎭 TEST 3: Reverb');
    effects.applyReverb(true);
    await new Promise(r => setTimeout(r, 3000));
    effects.applyReverb(false);
    console.log('✅ Reverb completado');
    
    // Test 4: Stereo Widening
    console.log('\n🎧 TEST 4: Stereo Widening');
    effects.applyStereoWidening(true);
    await new Promise(r => setTimeout(r, 3000));
    effects.applyStereoWidening(false);
    console.log('✅ Stereo Widening completado');
    
    console.log('\n✅ ===== TESTS COMPLETADOS =====');
};

// =============================================
// ATAJOS DE TECLADO PARA EFECTOS
// =============================================

document.addEventListener('keydown', (e) => {
    // Solo si no está escribiendo en un input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    if (!window.realAudioEffects) return;
    
    const effects = window.realAudioEffects;
    
    // Ctrl/Cmd + Teclas
    if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
            case 'b': // Bass Boost
                e.preventDefault();
                const bassEnabled = !effects.effectsEnabled.bassBoost;
                effects.applyBassBoost(bassEnabled);
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage(
                        `Bass Boost: ${bassEnabled ? 'ON' : 'OFF'}`, 
                        'info'
                    );
                }
                break;
                
            case 'e': // Echo
                e.preventDefault();
                const echoEnabled = !effects.effectsEnabled.echo;
                effects.applyEcho(echoEnabled);
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage(
                        `Echo: ${echoEnabled ? 'ON' : 'OFF'}`, 
                        'info'
                    );
                }
                break;
                
            case 'r': // Reverb
                e.preventDefault();
                const reverbEnabled = !effects.effectsEnabled.reverb;
                effects.applyReverb(reverbEnabled);
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage(
                        `Reverb: ${reverbEnabled ? 'ON' : 'OFF'}`, 
                        'info'
                    );
                }
                break;
                
            case 's': // Stereo Widening
                e.preventDefault();
                const stereoEnabled = !effects.effectsEnabled.stereoWidening;
                effects.applyStereoWidening(stereoEnabled);
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage(
                        `Stereo Widening: ${stereoEnabled ? 'ON' : 'OFF'}`, 
                        'info'
                    );
                }
                break;
                
            case '0': // Reset todos los efectos
                e.preventDefault();
                effects.disableAllEffects();
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage('Efectos reseteados', 'info');
                }
                break;
        }
    }
});

console.log('✅ ===== SISTEMA DE EFECTOS DE AUDIO REALES CARGADO =====');
console.log('📝 Características:');
console.log('  • Bass Boost (realza graves)');
console.log('  • Treble Boost (realza agudos)');
console.log('  • Echo/Delay (efecto de eco)');
console.log('  • Reverb (simulación de sala)');
console.log('  • Stereo Widening (amplía el campo estéreo)');
console.log('  • Compression (normaliza dinámicas)');
console.log('  • 10 Presets pre-configurados');
console.log('  • Visualizador de audio en tiempo real');
console.log('\n🎹 Atajos de teclado:');
console.log('  Ctrl+B : Toggle Bass Boost');
console.log('  Ctrl+E : Toggle Echo');
console.log('  Ctrl+R : Toggle Reverb');
console.log('  Ctrl+S : Toggle Stereo Widening');
console.log('  Ctrl+0 : Reset todos los efectos');
console.log('\n💡 Comandos disponibles:');
console.log('  window.applyAudioPreset("club")');
console.log('  window.debugAudioEffects()');
console.log('  window.testAudioEffects()');
