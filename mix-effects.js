// =============================================
// MIX EFFECTS - Sistema de Transiciones Musicales
// Inspirado en técnicas DJ profesionales
// =============================================

console.log('🎚️ Cargando Mix Effects System...');

class MixEffectsSystem {
    constructor() {
        this.currentEffects = {
            outgoingEcho: false,
            harmonicMix: false,
            beatSync: false,
            eqFade: false
        };
        
        this.config = {
            // Echo en salida
            echoEnabled: true,
            echoDelay: 0.35, // segundos
            echoDecay: 0.6, // 0-1
            
            // Harmonic mixing
            harmonicEnabled: false,
            keyDetection: false,
            
            // Beat sync
            beatSyncEnabled: false,
            bpmTolerance: 5, // ±5 BPM
            
            // EQ Fade
            eqFadeEnabled: true,
            eqFadeDuration: 8, // segundos
            
            // Crossfade mejorado
            crossfadeProfile: 'dj-style'
        };
        
        // BPM detectados (cache)
        this.detectedBPMs = new Map();
        
        // Tonalidades detectadas (cache)
        this.detectedKeys = new Map();
        
        this.init();
    }
    
    // =============================================
    // INICIALIZACIÓN
    // =============================================
    
    init() {
        console.log('✅ Mix Effects System inicializado');
        this.loadPreferences();
        this.setupUI();
        this.integrateWithCore();
    }
    
    // =============================================
    // INTEGRACIÓN CON CORE.JS
    // =============================================
    
    integrateWithCore() {
        console.log('🔗 Integrando con core.js...');
        
        // Esperar a que UnifiedCore esté disponible
        const checkCore = setInterval(() => {
            if (window.unifiedCore && window.UnifiedCore) {
                clearInterval(checkCore);
                
                // HOOK 1: Interceptar playNextVideo
                this.hookPlayNextVideo();
                
                // HOOK 2: Interceptar startCrossfade
                this.hookStartCrossfade();
                
                console.log('✅ Mix Effects integrado con core');
            }
        }, 500);
        
        // Timeout de seguridad
        setTimeout(() => clearInterval(checkCore), 10000);
    }
    
    hookPlayNextVideo() {
        const originalPlayNext = window.UnifiedCore.prototype.playNextVideo;
        const self = this;
        
        window.UnifiedCore.prototype.playNextVideo = async function() {
            console.log('🎵 playNextVideo interceptado por Mix Effects');
            
            // Obtener información de videos
            const currentIndex = this.currentPlayingInfo?.flattenedIndex || 0;
            const flatList = this.getFlattenedPlaylist();
            const currentVideo = flatList[currentIndex];
            const nextVideo = flatList[currentIndex + 1];
            
            if (currentVideo && nextVideo) {
                // APLICAR EFECTOS ANTES DEL CAMBIO
                await self.applyTransitionEffects(currentVideo, nextVideo, currentPlayer);
            }
            
            // Llamar a la función original
            return originalPlayNext.call(this);
        };
        
        console.log('✅ playNextVideo hooked');
    }
    
    hookStartCrossfade() {
        const originalCrossfade = window.UnifiedCore.prototype.startCrossfade;
        const self = this;
        
        window.UnifiedCore.prototype.startCrossfade = function(prevPlayer, nextPlayer) {
            console.log('🎨 startCrossfade interceptado por Mix Effects');
            
            // APLICAR CROSSFADE MEJORADO
            if (self.config.eqFadeEnabled) {
                self.applyEQFadeCrossfade(prevPlayer, nextPlayer);
            } else {
                // Crossfade original
                originalCrossfade.call(this, prevPlayer, nextPlayer);
            }
        };
        
        console.log('✅ startCrossfade hooked');
    }
    
    // =============================================
    // EFECTO 1: ECO AL PLAYER SALIENTE
    // =============================================
    
    async applyOutgoingEcho(player, duration = 8000) {
        if (!this.config.echoEnabled) return;
        
        console.log('🔄 Aplicando eco al player saliente...');
        
        try {
            const iframe = player.getIframe();
            if (!iframe) return;
            
            // SIMULACIÓN DE ECO mediante volumen pulsante
            const startVolume = player.getVolume();
            const steps = 40;
            const stepTime = duration / steps;
            let currentStep = 0;
            
            const echoInterval = setInterval(() => {
                currentStep++;
                const progress = currentStep / steps;
                
                // Crear efecto de "eco" con volumen oscilante
                const oscillation = Math.sin(progress * Math.PI * 6) * 0.3;
                const decay = 1 - progress;
                const volume = Math.max(0, (startVolume * decay) + (oscillation * 20));
                
                try {
                    player.setVolume(Math.round(volume));
                } catch (e) {
                    console.warn('Error ajustando volumen:', e);
                }
                
                if (currentStep >= steps) {
                    clearInterval(echoInterval);
                    console.log('✅ Eco completado');
                }
            }, stepTime);
            
            // Mostrar feedback al usuario
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('🔄 Transición con eco...', 'info', 2000);
            }
            
        } catch (error) {
            console.error('❌ Error aplicando eco:', error);
        }
    }
    
    // =============================================
    // EFECTO 2: HARMONIC MIXING (BPM)
    // =============================================
    
    async detectBPM(videoId) {
        // Verificar caché
        if (this.detectedBPMs.has(videoId)) {
            return this.detectedBPMs.get(videoId);
        }
        
        // Estimación basada en título y género
        // (En producción real, usarías API como AcoustID, Last.fm, Spotify)
        const estimatedBPM = this.estimateBPMFromContext(videoId);
        
        this.detectedBPMs.set(videoId, estimatedBPM);
        console.log(`🎵 BPM estimado para ${videoId}: ${estimatedBPM}`);
        
        return estimatedBPM;
    }
    
    estimateBPMFromContext(videoId) {
        // BPMs típicos por género
        const genreBPMs = {
            house: 128,
            techno: 135,
            dubstep: 140,
            trap: 145,
            pop: 120,
            rock: 110,
            hiphop: 90,
            reggaeton: 95,
            salsa: 180,
            bachata: 120
        };
        
        // Retornar BPM promedio para música electrónica
        return genreBPMs.house;
    }
    
    async applyBPMMatching(currentBPM, nextBPM, nextPlayer) {
        if (!this.config.harmonicEnabled) return;
        
        console.log(`🎼 Matching BPM: ${currentBPM} → ${nextBPM}`);
        
        const bpmDiff = Math.abs(currentBPM - nextBPM);
        
        if (bpmDiff <= this.config.bpmTolerance) {
            console.log('✅ BPMs compatibles, transición suave');
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage(
                    `🎼 BPM Match: ${currentBPM} ≈ ${nextBPM}`, 
                    'success', 
                    2000
                );
            }
        } else {
            console.log(`⚠️ BPMs diferentes: ${bpmDiff} BPM de diferencia`);
            
            // Ajustar tempo de entrada (simulado con fade más rápido/lento)
            const speedRatio = currentBPM / nextBPM;
            
            if (speedRatio > 1.1) {
                console.log('📉 Ralentizando entrada...');
                // Crossfade más lento
                window.CROSSFADE_DURATION = 15;
            } else if (speedRatio < 0.9) {
                console.log('📈 Acelerando entrada...');
                // Crossfade más rápido
                window.CROSSFADE_DURATION = 7;
            }
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage(
                    `🎼 Ajustando tempo: ${Math.round(speedRatio * 100)}%`, 
                    'info', 
                    2000
                );
            }
        }
    }
    
    // =============================================
    // EFECTO 3: EQ FADE (Filtro de Frecuencias)
    // =============================================
    
    async applyEQFadeCrossfade(prevPlayer, nextPlayer) {
        console.log('🎚️ Aplicando EQ Fade crossfade...');
        
        const duration = this.config.eqFadeDuration * 1000;
        const steps = 60;
        const stepTime = duration / steps;
        let currentStep = 0;
        
        const eqFadeInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;
            
            // SALIDA: Perder graves primero (efecto "high-pass")
            const prevVolume = Math.max(0, Math.round(100 * (1 - progress)));
            
            // Simulación de pérdida de graves mediante volumen escalonado
            let adjustedPrevVolume = prevVolume;
            if (progress > 0.3) {
                // Después del 30%, reducir más rápido (simula pérdida de graves)
                adjustedPrevVolume = Math.round(prevVolume * (1 - (progress - 0.3) * 0.5));
            }
            
            // ENTRADA: Aparecer con graves primero (efecto "low-pass fade in")
            let nextVolume = Math.min(100, Math.round(100 * progress));
            if (progress < 0.7) {
                // Primero entran los graves (volumen más bajo al inicio)
                nextVolume = Math.round(nextVolume * 0.7);
            }
            
            try {
                prevPlayer.setVolume(adjustedPrevVolume);
                nextPlayer.setVolume(nextVolume);
            } catch (e) {
                console.warn('Error ajustando volúmenes:', e);
            }
            
            if (currentStep >= steps) {
                clearInterval(eqFadeInterval);
                console.log('✅ EQ Fade completado');
                
                // Limpieza
                setTimeout(() => {
                    try {
                        prevPlayer.stopVideo();
                        const prevElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
                        if (prevElement) {
                            prevElement.classList.add('hidden');
                        }
                    } catch (e) {}
                }, 500);
            }
        }, stepTime);
        
        // Aplicar efectos visuales
        this.applyVisualEffects(prevPlayer, nextPlayer);
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('🎚️ Transición con EQ Fade', 'info', 2000);
        }
    }
    
    // =============================================
    // EFECTOS VISUALES
    // =============================================
    
    applyVisualEffects(prevPlayer, nextPlayer) {
        const prevElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
        const nextElement = document.getElementById(`player${currentPlayer}`);
        
        if (prevElement) {
            prevElement.classList.remove('fade-in', 'hidden');
            prevElement.classList.add('fade-out', 'eq-fade-out');
        }
        
        if (nextElement) {
            nextElement.classList.remove('hidden', 'fade-out');
            nextElement.classList.add('fade-in', 'eq-fade-in');
            nextElement.style.zIndex = '3';
        }
        
        console.log('✅ Efectos visuales aplicados');
    }
    
    // =============================================
    // FLUJO COMPLETO DE TRANSICIÓN
    // =============================================
    
    async applyTransitionEffects(currentVideo, nextVideo, playerNum) {
        console.log('🎭 Aplicando efectos de transición completos...');
        
        const currentPlayer = playerNum === 1 ? player1 : player2;
        
        try {
            // 1. Detectar BPMs
            const currentBPM = await this.detectBPM(currentVideo.videoId);
            const nextBPM = await this.detectBPM(nextVideo.videoId);
            
            console.log(`🎵 BPMs: ${currentBPM} → ${nextBPM}`);
            
            // 2. Aplicar eco al saliente
            if (this.config.echoEnabled) {
                this.applyOutgoingEcho(currentPlayer, 8000);
            }
            
            // 3. Ajustar BPM si está habilitado
            if (this.config.harmonicEnabled) {
                await this.applyBPMMatching(currentBPM, nextBPM, null);
            }
            
            // 4. Notificar usuario
            const effectsApplied = [];
            if (this.config.echoEnabled) effectsApplied.push('Echo');
            if (this.config.harmonicEnabled) effectsApplied.push('BPM Match');
            if (this.config.eqFadeEnabled) effectsApplied.push('EQ Fade');
            
            if (effectsApplied.length > 0 && window.unifiedCore) {
                window.unifiedCore.showMessage(
                    `🎛️ Efectos: ${effectsApplied.join(' + ')}`, 
                    'info', 
                    3000
                );
            }
            
        } catch (error) {
            console.error('❌ Error en transición:', error);
        }
    }
    
    // =============================================
    // INTERFAZ DE USUARIO
    // =============================================
    
    setupUI() {
        const panel = document.createElement('div');
        panel.className = 'mix-effects-panel';
        panel.innerHTML = `
            <div class="mix-effects-header">
                <h3>🎚️ Mix Effects</h3>
                <button class="close-mix-btn">×</button>
            </div>
            
            <div class="mix-effects-content">
                <div class="effect-section">
                    <h4>🔄 Efectos de Transición</h4>
                    
                    <label class="effect-toggle">
                        <input type="checkbox" id="echoToggle" 
                               ${this.config.echoEnabled ? 'checked' : ''}>
                        <span>Echo en Salida</span>
                        <p class="effect-description">
                            Aplica efecto de eco al video que está terminando
                        </p>
                    </label>
                    
                    <label class="effect-toggle">
                        <input type="checkbox" id="eqFadeToggle" 
                               ${this.config.eqFadeEnabled ? 'checked' : ''}>
                        <span>EQ Fade</span>
                        <p class="effect-description">
                            Transición con filtrado de frecuencias (estilo DJ)
                        </p>
                    </label>
                    
                    <label class="effect-toggle">
                        <input type="checkbox" id="harmonicToggle" 
                               ${this.config.harmonicEnabled ? 'checked' : ''}>
                        <span>Harmonic Mixing (BPM)</span>
                        <p class="effect-description">
                            Ajusta tempo para transiciones más naturales
                        </p>
                    </label>
                </div>
                
                <div class="effect-section">
                    <h4>⚙️ Configuración</h4>
                    
                    <div class="config-group">
                        <label>Duración EQ Fade</label>
                        <input type="range" id="eqFadeDuration" 
                               min="5" max="15" value="${this.config.eqFadeDuration}" step="1">
                        <span id="eqFadeDurationValue">${this.config.eqFadeDuration}s</span>
                    </div>
                    
                    <div class="config-group">
                        <label>Intensidad Echo</label>
                        <input type="range" id="echoDecay" 
                               min="0" max="1" value="${this.config.echoDecay}" step="0.1">
                        <span id="echoDecayValue">${Math.round(this.config.echoDecay * 100)}%</span>
                    </div>
                </div>
                
                <div class="effect-section">
                    <h4>🎨 Presets Rápidos</h4>
                    <div class="preset-buttons">
                        <button class="preset-btn" data-preset="off">Sin Efectos</button>
                        <button class="preset-btn" data-preset="light">Ligero</button>
                        <button class="preset-btn" data-preset="medium">Medio</button>
                        <button class="preset-btn" data-preset="heavy">Intenso</button>
                        <button class="preset-btn" data-preset="dj">DJ Pro</button>
                    </div>
                </div>
                
                <div class="mix-effects-actions">
                    <button class="mix-btn primary" id="applyMixEffects">Aplicar</button>
                    <button class="mix-btn" id="testMixEffects">Probar Ahora</button>
                </div>
            </div>
        `;
        
        // Estilos
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
