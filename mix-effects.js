// =============================================
// SISTEMA DE EFECTOS MIX - YT CrossMix
// Inspirado en Spotify Mix
// =============================================

console.log('🎚️ Cargando Sistema de Efectos Mix...');

class MixEffectsSystem {
    constructor() {
        this.audioContext = null;
        this.gainNodes = new Map();
        this.analyserNodes = new Map();
        this.currentProfile = 'smooth';
        
        // Perfiles de crossfade
        this.crossfadeProfiles = {
            smooth: { 
                duration: 15, 
                curve: 'ease-in-out',
                description: 'Transición suave y gradual'
            },
            quick: { 
                duration: 5, 
                curve: 'linear',
                description: 'Cambio rápido entre canciones'
            },
            overlap: { 
                duration: 20, 
                curve: 'cubic-bezier(0.4, 0, 0.2, 1)',
                description: 'Superposición larga y musical'
            },
            dj: {
                duration: 8,
                curve: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
                description: 'Estilo DJ profesional'
            }
        };
        
        // Configuración de normalización
        this.normalizationEnabled = true;
        this.targetLoudness = -14; // LUFS (estándar streaming)
        
        this.init();
    }
    
    // =============================================
    // INICIALIZACIÓN
    // =============================================
    
    async init() {
        try {
            // Crear contexto de audio
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✅ Audio Context creado');
            
            // Cargar preferencias guardadas
            this.loadPreferences();
            
            // Configurar UI
            this.setupUI();
            
            console.log('✅ Sistema de Efectos Mix inicializado');
        } catch (error) {
            console.error('❌ Error inicializando Mix Effects:', error);
        }
    }
    
    // =============================================
    // NORMALIZACIÓN DE VOLUMEN
    // =============================================
    
    async normalizeVolume(player, playerNum) {
        if (!this.normalizationEnabled || !this.audioContext) return;
        
        try {
            // Crear nodos si no existen
            if (!this.gainNodes.has(playerNum)) {
                const gainNode = this.audioContext.createGain();
                const analyser = this.audioContext.createAnalyser();
                
                analyser.fftSize = 2048;
                gainNode.connect(this.audioContext.destination);
                
                this.gainNodes.set(playerNum, gainNode);
                this.analyserNodes.set(playerNum, analyser);
            }
            
            const analyser = this.analyserNodes.get(playerNum);
            const gainNode = this.gainNodes.get(playerNum);
            
            // Analizar nivel de audio
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            
            // Calcular RMS (Root Mean Square)
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sum / dataArray.length);
            
            // Convertir a dB
            const db = 20 * Math.log10(rms / 255);
            
            // Calcular ajuste de ganancia
            const gainAdjustment = this.targetLoudness - db;
            const linearGain = Math.pow(10, gainAdjustment / 20);
            
            // Aplicar con límites de seguridad
            const finalGain = Math.min(Math.max(linearGain, 0.3), 2.5);
            gainNode.gain.setValueAtTime(finalGain, this.audioContext.currentTime);
            
            console.log(`🔊 Volumen normalizado Player ${playerNum}: ${finalGain.toFixed(2)}x`);
            
        } catch (error) {
            console.warn('⚠️ Error normalizando volumen:', error);
        }
    }
    
    // =============================================
    // CROSSFADE MEJORADO
    // =============================================
    
    async enhancedCrossfade(player1, player2, profile = null) {
        const activeProfile = profile || this.crossfadeProfiles[this.currentProfile];
        const duration = activeProfile.duration;
        
        console.log(`🎚️ Crossfade ${activeProfile.description} (${duration}s)`);
        
        // Normalizar volúmenes antes del crossfade
        if (this.normalizationEnabled) {
            await this.normalizeVolume(player1, 1);
            await this.normalizeVolume(player2, 2);
        }
        
        // Aplicar curva de crossfade personalizada
        const steps = 60;
        const stepTime = (duration * 1000) / steps;
        let currentStep = 0;
        
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                currentStep++;
                const progress = currentStep / steps;
                
                // Aplicar curva personalizada
                let fadeProgress;
                switch (activeProfile.curve) {
                    case 'ease-in-out':
                        fadeProgress = this.easeInOutCurve(progress);
                        break;
                    case 'cubic-bezier(0.4, 0, 0.2, 1)':
                        fadeProgress = this.cubicBezierCurve(progress, 0.4, 0, 0.2, 1);
                        break;
                    case 'cubic-bezier(0.25, 0.1, 0.25, 1)':
                        fadeProgress = this.cubicBezierCurve(progress, 0.25, 0.1, 0.25, 1);
                        break;
                    default:
                        fadeProgress = progress;
                }
                
                // Calcular volúmenes
                const vol1 = Math.max(0, Math.round(100 * (1 - fadeProgress)));
                const vol2 = Math.min(100, Math.round(100 * fadeProgress));
                
                // Aplicar volúmenes
                try {
                    player1.setVolume(vol1);
                    player2.setVolume(vol2);
                } catch (e) {
                    console.warn('Error ajustando volumen:', e);
                }
                
                // Finalizar
                if (currentStep >= steps) {
                    clearInterval(interval);
                    resolve();
                    console.log('✅ Crossfade completado');
                }
            }, stepTime);
        });
    }
    
    // =============================================
    // CURVAS DE TRANSICIÓN
    // =============================================
    
    easeInOutCurve(t) {
        return t < 0.5 
            ? 4 * t * t * t 
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    cubicBezierCurve(t, p1x, p1y, p2x, p2y) {
        // Aproximación simplificada de cubic-bezier
        const cx = 3 * p1x;
        const bx = 3 * (p2x - p1x) - cx;
        const ax = 1 - cx - bx;
        
        const cy = 3 * p1y;
        const by = 3 * (p2y - p1y) - cy;
        const ay = 1 - cy - by;
        
        const cuberoot = t => t < 0 ? -Math.pow(-t, 1/3) : Math.pow(t, 1/3);
        const sampleCurveX = t => ((ax * t + bx) * t + cx) * t;
        const sampleCurveY = t => ((ay * t + by) * t + cy) * t;
        
        return sampleCurveY(t);
    }
    
    // =============================================
    // DETECCIÓN DE BPM (SIMPLIFICADA)
    // =============================================
    
    async detectBPM(videoId) {
        // Simulación - en producción usar Essentia.js o API externa
        // Por ahora retornar BPM promedio para música electrónica
        const estimatedBPMs = {
            house: 128,
            techno: 135,
            dubstep: 140,
            trap: 145,
            pop: 120,
            rock: 110,
            hiphop: 90
        };
        
        // Retornar BPM promedio
        return estimatedBPMs.house;
    }
    
    // =============================================
    // ANÁLISIS DE ENERGÍA
    // =============================================
    
    async analyzeEnergy(player, playerNum) {
        if (!this.audioContext) return 0.5;
        
        const analyser = this.analyserNodes.get(playerNum);
        if (!analyser) return 0.5;
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        // Calcular energía total
        const totalEnergy = dataArray.reduce((sum, val) => sum + val, 0);
        const normalizedEnergy = totalEnergy / (dataArray.length * 255);
        
        return normalizedEnergy;
    }
    
    // =============================================
    // RECOMENDACIÓN DE CROSSFADE INTELIGENTE
    // =============================================
    
    async recommendCrossfade(currentVideo, nextVideo) {
        // Analizar características de ambos videos
        const currentEnergy = await this.analyzeEnergy(player1, 1);
        const nextEnergy = await this.analyzeEnergy(player2, 2);
        
        const energyDiff = Math.abs(currentEnergy - nextEnergy);
        
        // Recomendar perfil según diferencia de energía
        if (energyDiff < 0.2) {
            return 'smooth'; // Canciones similares
        } else if (energyDiff < 0.4) {
            return 'dj'; // Diferencia moderada
        } else if (energyDiff < 0.6) {
            return 'overlap'; // Mayor diferencia
        } else {
            return 'quick'; // Muy diferentes
        }
    }
    
    // =============================================
    // INTERFAZ DE USUARIO
    // =============================================
    
    setupUI() {
        // Crear panel de configuración
        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'mix-effects-settings';
        settingsPanel.innerHTML = `
            <div class="mix-settings-header">
                <h3>🎚️ Efectos Mix</h3>
                <button class="close-settings-btn">×</button>
            </div>
            
            <div class="mix-settings-content">
                <div class="setting-group">
                    <label>Perfil de Crossfade</label>
                    <select id="crossfadeProfileSelect" class="mix-select">
                        ${Object.entries(this.crossfadeProfiles).map(([key, profile]) => `
                            <option value="${key}" ${key === this.currentProfile ? 'selected' : ''}>
                                ${profile.description} (${profile.duration}s)
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="setting-group">
                    <label>
                        <input type="checkbox" id="normalizationToggle" 
                               ${this.normalizationEnabled ? 'checked' : ''}>
                        Normalización de Volumen
                    </label>
                    <p class="setting-description">
                        Iguala el volumen entre canciones para una experiencia consistente
                    </p>
                </div>
                
                <div class="setting-group">
                    <label>Duración Custom (segundos)</label>
                    <input type="range" id="customDuration" 
                           min="3" max="30" value="15" step="1">
                    <span id="durationValue">15s</span>
                </div>
                
                <div class="setting-actions">
                    <button class="mix-btn primary" id="applyMixSettings">
                        Aplicar Cambios
                    </button>
                    <button class="mix-btn" id="resetMixSettings">
                        Restaurar Predeterminados
                    </button>
                </div>
            </div>
        `;
        
        // Agregar estilos inline para el panel
        const style = document.createElement('style');
        style.textContent = `
            .mix-effects-settings {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
                border-radius: 12px;
                padding: 20px;
                max-width: 400px;
                width: 90%;
                z-index: 10000;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                display: none;
            }
            
            .mix-effects-settings.show {
                display: block;
            }
            
            .mix-settings-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .mix-settings-header h3 {
                color: #ff6b35;
                margin: 0;
            }
            
            .close-settings-btn {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
            }
            
            .setting-group {
                margin-bottom: 20px;
            }
            
            .setting-group label {
                color: white;
                display: block;
                margin-bottom: 8px;
                font-weight: 500;
            }
            
            .mix-select {
                width: 100%;
                padding: 10px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 6px;
                color: white;
                font-size: 14px;
            }
            
            .setting-description {
                color: #999;
                font-size: 12px;
                margin-top: 5px;
            }
            
            .setting-actions {
                display: flex;
                gap: 10px;
                margin-top: 20px;
            }
            
            .mix-btn {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
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
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(settingsPanel);
        
        // Event listeners
        this.setupSettingsEvents(settingsPanel);
        
        // Agregar botón para abrir settings en la UI principal
        this.addSettingsButton();
    }
    
    addSettingsButton() {
        // Agregar botón a los controles de reproducción
        const playerControls = document.querySelector('.player-controls');
        if (playerControls) {
            const mixBtn = document.createElement('button');
            mixBtn.className = 'control-button';
            mixBtn.id = 'mixEffectsButton';
            mixBtn.title = 'Configurar Efectos Mix';
            mixBtn.innerHTML = '<i class="fas fa-sliders-h"></i>';
            
            mixBtn.addEventListener('click', () => {
                const panel = document.querySelector('.mix-effects-settings');
                if (panel) {
                    panel.classList.toggle('show');
                }
            });
            
            playerControls.appendChild(mixBtn);
        }
    }
    
    setupSettingsEvents(panel) {
        // Cerrar panel
        panel.querySelector('.close-settings-btn').addEventListener('click', () => {
            panel.classList.remove('show');
        });
        
        // Cambio de perfil
        const profileSelect = panel.querySelector('#crossfadeProfileSelect');
        profileSelect.addEventListener('change', (e) => {
            this.currentProfile = e.target.value;
            console.log('🎚️ Perfil cambiado a:', this.currentProfile);
        });
        
        // Toggle normalización
        const normToggle = panel.querySelector('#normalizationToggle');
        normToggle.addEventListener('change', (e) => {
            this.normalizationEnabled = e.target.checked;
            console.log('🔊 Normalización:', this.normalizationEnabled);
        });
        
        // Duración custom
        const durationSlider = panel.querySelector('#customDuration');
        const durationValue = panel.querySelector('#durationValue');
        durationSlider.addEventListener('input', (e) => {
            durationValue.textContent = `${e.target.value}s`;
        });
        
        // Aplicar cambios
        panel.querySelector('#applyMixSettings').addEventListener('click', () => {
            this.savePreferences();
            panel.classList.remove('show');
            
            if (window.unifiedCore) {
                window.unifiedCore.showMessage('Configuración guardada', 'success');
            }
        });
        
        // Reset
        panel.querySelector('#resetMixSettings').addEventListener('click', () => {
            this.resetToDefaults();
            panel.classList.remove('show');
        });
    }
    
    // =============================================
    // PERSISTENCIA
    // =============================================
    
    savePreferences() {
        const prefs = {
            profile: this.currentProfile,
            normalization: this.normalizationEnabled
        };
        
        localStorage.setItem('ytcm_mix_effects', JSON.stringify(prefs));
        console.log('💾 Preferencias de Mix guardadas');
    }
    
    loadPreferences() {
        try {
            const saved = localStorage.getItem('ytcm_mix_effects');
            if (saved) {
                const prefs = JSON.parse(saved);
                this.currentProfile = prefs.profile || 'smooth';
                this.normalizationEnabled = prefs.normalization !== false;
                console.log('📂 Preferencias de Mix cargadas');
            }
        } catch (e) {
            console.warn('Error cargando preferencias:', e);
        }
    }
    
    resetToDefaults() {
        this.currentProfile = 'smooth';
        this.normalizationEnabled = true;
        this.savePreferences();
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('Configuración restaurada', 'success');
        }
    }
}

// =============================================
// INTEGRACIÓN CON EL SISTEMA EXISTENTE
// =============================================

// Crear instancia global
window.mixEffects = new MixEffectsSystem();

// Integrar con el crossfade existente en core.js
if (window.unifiedCore) {
    // Sobreescribir función de crossfade original
    const originalCrossfade = window.unifiedCore.startCrossfade;
    
    window.unifiedCore.startCrossfade = async function(prevPlayer, nextPlayer) {
        // Usar sistema de efectos mejorado si está disponible
        if (window.mixEffects && window.mixEffects.audioContext) {
            await window.mixEffects.enhancedCrossfade(prevPlayer, nextPlayer);
        } else {
            // Fallback a crossfade original
            originalCrossfade.call(this, prevPlayer, nextPlayer);
        }
    };
}

console.log('✅ Sistema de Efectos Mix cargado y listo');
