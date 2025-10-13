// =============================================
// MIX-EFFECTS.JS - EFECTOS VISUALES Y UI
// =============================================
// Este archivo SOLO maneja:
// - Efectos visuales del crossfade
// - Animaciones UI
// - Estados visuales
// NO manipula directamente los reproductores
// =============================================

console.log('🎨 Cargando sistema de efectos visuales...');

// =============================================
// ESTADO DE EFECTOS
// =============================================
const effectsState = {
    crossfadeDuration: 10,
    isEffectActive: false,
    currentEffect: null,
    effectHistory: []
};

// =============================================
// CONTROLES VISUALES DEL VOLUMEN
// =============================================
function setupVolumeControlsUI() {
    console.log('🔊 Configurando UI de controles de volumen...');
    
    const volumeButton = document.getElementById('volumeButton');
    const volumeSlider = document.getElementById('volumeSlider');
    
    if (!volumeButton || !volumeSlider) {
        console.warn('⚠️ Elementos de volumen no encontrados');
        return;
    }
    
    // =============================================
    // EVENTO: CLICK EN BOTÓN DE VOLUMEN (UI ONLY)
    // =============================================
    volumeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        updateVolumeIconUI(0); // Mostrar visualmente muteado
        console.log('🔇 UI: Mostrar estado muteado');
    });
    
    // =============================================
    // EVENTO: HOVER EN SLIDER (MOSTRAR/OCULTAR)
    // =============================================
    volumeButton.addEventListener('mouseenter', () => {
        volumeSlider.classList.add('show');
        console.log('🔊 UI: Slider visible');
    });
    
    volumeSlider.addEventListener('mouseleave', () => {
        setTimeout(() => {
            if (!volumeSlider.matches(':hover')) {
                volumeSlider.classList.remove('show');
                console.log('🔊 UI: Slider oculto');
            }
        }, 300);
    });
    
    // =============================================
    // EVENTO: CLICK EN SLIDER (UI FEEDBACK)
    // =============================================
    volumeSlider.addEventListener('click', (e) => {
        const rect = volumeSlider.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const height = rect.height;
        const percentage = Math.max(0, Math.min(100, 100 - (clickY / height * 100)));
        
        updateVolumeUIVisually(Math.round(percentage));
        console.log(`🔊 UI: Volumen visual actualizado a ${Math.round(percentage)}%`);
        
        // Emitir evento para que core.js lo capture
        document.dispatchEvent(new CustomEvent('volumeChanged', {
            detail: { volume: Math.round(percentage) }
        }));
    });
    
    // =============================================
    // EVENTO: DRAG EN EL SLIDER (UI FEEDBACK)
    // =============================================
    let isDragging = false;
    
    volumeSlider.addEventListener('mousedown', (e) => {
        isDragging = true;
        volumeSlider.classList.add('dragging');
        handleVolumeDragUI(e);
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleVolumeDragUI(e);
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            volumeSlider.classList.remove('dragging');
        }
    });
    
    function handleVolumeDragUI(e) {
        const rect = volumeSlider.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const height = rect.height;
        const percentage = Math.max(0, Math.min(100, 100 - (clickY / height * 100)));
        
        updateVolumeUIVisually(Math.round(percentage));
        
        // Emitir evento en tiempo real
        document.dispatchEvent(new CustomEvent('volumeChanging', {
            detail: { volume: Math.round(percentage) }
        }));
    }
    
    console.log('✅ UI de controles de volumen configurada');
}

// =============================================
// ACTUALIZAR UI DEL VOLUMEN (VISUAL ONLY)
// =============================================
function updateVolumeUIVisually(volume) {
    const volumeSlider = document.getElementById('volumeSlider');
    const fill = volumeSlider?.querySelector('.volume-fill');
    
    if (fill) {
        fill.style.height = `${volume}%`;
        fill.style.transition = 'height 0.1s linear';
    }
    
    updateVolumeIconUI(volume);
}

// =============================================
// ACTUALIZAR ICONO DE VOLUMEN (VISUAL ONLY)
// =============================================
function updateVolumeIconUI(volume) {
    const volumeButton = document.getElementById('volumeButton');
    const icon = volumeButton?.querySelector('i');
    
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

// =============================================
// EFECTOS VISUALES DEL CROSSFADE
// =============================================
function applyCrossfadeVisualEffect() {
    console.log('🎨 Aplicando efecto visual de crossfade...');
    
    effectsState.isEffectActive = true;
    effectsState.currentEffect = 'crossfade';
    effectsState.effectHistory.push({
        effect: 'crossfade',
        timestamp: Date.now(),
        duration: effectsState.crossfadeDuration
    });
    
    const prevElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
    const nextElement = document.getElementById(`player${currentPlayer}`);
    
    // ✅ SOLO ANIMAR, NO MANIPULAR PLAYERS
    if (nextElement) {
        nextElement.classList.add('crossfade-enter');
        nextElement.style.transition = `opacity ${effectsState.crossfadeDuration}s cubic-bezier(0.25, 0.8, 0.25, 1)`;
    }
    
    if (prevElement) {
        prevElement.classList.add('crossfade-exit');
        prevElement.style.transition = `opacity ${effectsState.crossfadeDuration}s cubic-bezier(0.25, 0.8, 0.25, 1)`;
    }
    
    // Limpiar después del efecto
    setTimeout(() => {
        effectsState.isEffectActive = false;
        effectsState.currentEffect = null;
        
        if (prevElement) {
            prevElement.classList.remove('crossfade-exit');
            prevElement.classList.add('hidden');
        }
        if (nextElement) {
            nextElement.classList.remove('crossfade-enter');
        }
        
        console.log('✅ Efecto visual de crossfade completado');
    }, effectsState.crossfadeDuration * 1000);
}

// =============================================
// EFECTO DE FADE IN PARA NEXT PLAYER
// =============================================
function applyFadeInEffect(playerId) {
    console.log(`🎨 Fade-in para player${playerId}`);
    
    const element = document.getElementById(`player${playerId}`);
    if (!element) return;
    
    element.classList.remove('hidden', 'fade-out');
    element.classList.add('fade-in');
    element.style.opacity = '1';
}

// =============================================
// EFECTO DE FADE OUT PARA CURRENT PLAYER
// =============================================
function applyFadeOutEffect(playerId) {
    console.log(`🎨 Fade-out para player${playerId}`);
    
    const element = document.getElementById(`player${playerId}`);
    if (!element) return;
    
    element.classList.remove('fade-in');
    element.classList.add('fade-out');
    element.style.opacity = '0';
}

// =============================================
// EFECTO DE PULSACIÓN PARA INDICAR CAMBIO
// =============================================
function applyPulseEffect(elementId) {
    console.log(`🎨 Pulse para ${elementId}`);
    
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.style.animation = 'subtlePulse 2s infinite alternate';
    
    setTimeout(() => {
        element.style.animation = 'none';
    }, 2000);
}

// =============================================
// EFECTO DE CAMBIO DE ESTADO EN UI
// =============================================
function updatePlayerStatusUI(status) {
    const statusElements = document.querySelectorAll('[data-player-status]');
    
    statusElements.forEach(el => {
        el.textContent = status;
        el.classList.add('status-update');
        
        setTimeout(() => {
            el.classList.remove('status-update');
        }, 300);
    });
    
    console.log(`📊 UI Estado: ${status}`);
}

// =============================================
// MOSTRAR INDICADOR VISUAL DE CROSSFADE
// =============================================
function showCrossfadeIndicator() {
    console.log('🎨 Mostrando indicador de crossfade');
    
    let indicator = document.querySelector('.crossfade-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'crossfade-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            padding: 10px 15px;
            background: linear-gradient(135deg, #ff6b35, #ff8a65);
            color: white;
            border-radius: 20px;
            font-size: 12px;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        indicator.textContent = '🎨 Crossfade activo...';
        document.body.appendChild(indicator);
    }
    
    setTimeout(() => {
        indicator.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => indicator.remove(), 300);
    }, effectsState.crossfadeDuration * 1000);
}

// =============================================
// ANIMAR CAMBIO DE VOLUMEN EN UI
// =============================================
function animateVolumeChange(fromVolume, toVolume, duration = 300) {
    console.log(`🎚️ Animando volumen: ${fromVolume}% → ${toVolume}%`);
    
    const steps = 20;
    const stepTime = duration / steps;
    let step = 0;
    
    const interval = setInterval(() => {
        step++;
        const progress = step / steps;
        const currentVolume = Math.round(fromVolume + (toVolume - fromVolume) * progress);
        
        updateVolumeUIVisually(currentVolume);
        
        if (step >= steps) {
            clearInterval(interval);
            updateVolumeUIVisually(toVolume);
        }
    }, stepTime);
}

// =============================================
// EFECTO DE ERROR EN UI
// =============================================
function showErrorEffectUI(message) {
    console.log(`❌ Efecto de error: ${message}`);
    
    let errorContainer = document.querySelector('.error-effect');
    
    if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.className = 'error-effect';
        errorContainer.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            padding: 10px 15px;
            background: linear-gradient(135deg, #f44336, #d32f2f);
            color: white;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            animation: shake 0.5s ease-in-out;
        `;
        document.body.appendChild(errorContainer);
    }
    
    errorContainer.textContent = message;
    
    setTimeout(() => {
        errorContainer.remove();
    }, 3000);
}

// =============================================
// OBTENER ESTADO DE EFECTOS
// =============================================
function getEffectsState() {
    return {
        isActive: effectsState.isEffectActive,
        currentEffect: effectsState.currentEffect,
        duration: effectsState.crossfadeDuration,
        history: effectsState.effectHistory
    };
}

// =============================================
// LIMPIAR HISTORIAL DE EFECTOS
// =============================================
function clearEffectsHistory() {
    effectsState.effectHistory = [];
    console.log('🧹 Historial de efectos limpiado');
}

// =============================================
// ESCUCHAR EVENTOS DE CORE.JS
// =============================================
document.addEventListener('crossfadeStarted', () => {
    applyCrossfadeVisualEffect();
    showCrossfadeIndicator();
});

document.addEventListener('crossfadeCompleted', () => {
    console.log('✅ Crossfade completado');
});

document.addEventListener('playerStateChanged', (e) => {
    const { state, playerId } = e.detail;
    updatePlayerStatusUI(`Player ${playerId}: ${state}`);
});

// =============================================
// INICIALIZACIÓN AUTOMÁTICA
// =============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM cargado, inicializando efectos...');
        setupVolumeControlsUI();
    });
} else {
    console.log('📄 DOM ya cargado, inicializando efectos...');
    setupVolumeControlsUI();
}

// =============================================
// EXPONER FUNCIONES GLOBALMENTE
// =============================================
window.effectsState = effectsState;
window.setupVolumeControlsUI = setupVolumeControlsUI;
window.updateVolumeUIVisually = updateVolumeUIVisually;
window.updateVolumeIconUI = updateVolumeIconUI;
window.applyCrossfadeVisualEffect = applyCrossfadeVisualEffect;
window.applyFadeInEffect = applyFadeInEffect;
window.applyFadeOutEffect = applyFadeOutEffect;
window.applyPulseEffect = applyPulseEffect;
window.animateVolumeChange = animateVolumeChange;
window.showCrossfadeIndicator = showCrossfadeIndicator;
window.showErrorEffectUI = showErrorEffectUI;
window.getEffectsState = getEffectsState;

console.log('✅ Sistema de efectos visuales cargado');
