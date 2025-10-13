// =============================================
// MIX-EFFECTS.JS - CONTROL DE AUDIO AVANZADO
// =============================================

console.log('🎵 Cargando sistema de control de audio...');

// Estado del volumen global
let audioState = {
    currentVolume: 100,
    isMuted: false,
    previousVolume: 100,
    masterVolume: 100
};

// =============================================
// INICIALIZACIÓN DE CONTROLES DE AUDIO
// =============================================
function setupAudioControls() {
    console.log('🔊 Configurando controles de audio avanzados...');
    
    const volumeButton = document.getElementById('volumeButton');
    const volumeSlider = document.getElementById('volumeSlider');
    
    if (!volumeButton || !volumeSlider) {
        console.warn('⚠️ Elementos de volumen no encontrados');
        return;
    }
    
    // Cargar volumen guardado
    const savedVolume = localStorage.getItem('ytcm_volume');
    if (savedVolume !== null) {
        audioState.currentVolume = parseInt(savedVolume, 10);
        audioState.masterVolume = audioState.currentVolume;
        updateVolumeUI(audioState.currentVolume);
    }
    
    // =============================================
    // EVENTO: CLICK EN BOTÓN DE VOLUMEN (MUTE/UNMUTE)
    // =============================================
    volumeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        audioState.isMuted = !audioState.isMuted;
        
        if (audioState.isMuted) {
            audioState.previousVolume = audioState.currentVolume;
            audioState.currentVolume = 0;
            volumeButton.querySelector('i').className = 'fas fa-volume-mute';
            console.log('🔇 Volumen muteado');
        } else {
            audioState.currentVolume = audioState.previousVolume > 0 ? audioState.previousVolume : 50;
            updateVolumeIcon(audioState.currentVolume);
            console.log('🔊 Volumen restaurado:', audioState.currentVolume);
        }
        
        updateVolumeUI(audioState.currentVolume);
        applyVolumeToAllPlayers(audioState.currentVolume);
        saveVolume(audioState.currentVolume);
    });
    
    // =============================================
    // EVENTO: HOVER EN SLIDER (MOSTRAR/OCULTAR)
    // =============================================
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
    
    // =============================================
    // EVENTO: CLICK EN SLIDER
    // =============================================
    volumeSlider.addEventListener('click', (e) => {
        const rect = volumeSlider.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const height = rect.height;
        const percentage = Math.max(0, Math.min(100, 100 - (clickY / height * 100)));
        
        audioState.currentVolume = Math.round(percentage);
        audioState.isMuted = false;
        
        updateVolumeUI(audioState.currentVolume);
        applyVolumeToAllPlayers(audioState.currentVolume);
        saveVolume(audioState.currentVolume);
        
        console.log(`🔊 Volumen ajustado: ${audioState.currentVolume}%`);
    });
    
    // =============================================
    // EVENTO: DRAG EN EL SLIDER
    // =============================================
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
            saveVolume(audioState.currentVolume);
        }
    });
    
    function handleVolumeDrag(e) {
        const rect = volumeSlider.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const height = rect.height;
        const percentage = Math.max(0, Math.min(100, 100 - (clickY / height * 100)));
        
        audioState.currentVolume = Math.round(percentage);
        audioState.isMuted = false;
        
        updateVolumeUI(audioState.currentVolume);
        applyVolumeToAllPlayers(audioState.currentVolume);
    }
    
    console.log('✅ Controles de audio configurados');
}

// =============================================
// ACTUALIZAR UI DEL VOLUMEN
// =============================================
function updateVolumeUI(volume) {
    const volumeSlider = document.getElementById('volumeSlider');
    const fill = volumeSlider?.querySelector('.volume-fill');
    
    if (fill) {
        fill.style.height = `${volume}%`;
        fill.style.transition = 'height 0.1s linear';
    }
    
    updateVolumeIcon(volume);
}

// =============================================
// ACTUALIZAR ICONO DE VOLUMEN
// =============================================
function updateVolumeIcon(volume) {
    const volumeButton = document.getElementById('volumeButton');
    const icon = volumeButton?.querySelector('i');
    
    if (!icon) return;
    
    if (volume === 0 || audioState.isMuted) {
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
// APLICAR VOLUMEN A TODOS LOS PLAYERS
// =============================================
function applyVolumeToAllPlayers(volume) {
    try {
        // Acceder a los players globales
        if (typeof window.player1 !== 'undefined' && window.player1) {
            if (typeof window.player1.setVolume === 'function') {
                window.player1.setVolume(volume);
                console.log(`📻 Player 1: Volumen ${volume}%`);
            }
        }
        
        if (typeof window.player2 !== 'undefined' && window.player2) {
            if (typeof window.player2.setVolume === 'function') {
                window.player2.setVolume(volume);
                console.log(`📻 Player 2: Volumen ${volume}%`);
            }
        }
        
        audioState.masterVolume = volume;
        
    } catch (error) {
        console.error('❌ Error aplicando volumen:', error);
    }
}

// =============================================
// GUARDAR VOLUMEN EN LOCALSTORAGE
// =============================================
function saveVolume(volume) {
    try {
        localStorage.setItem('ytcm_volume', volume.toString());
        console.log(`💾 Volumen guardado: ${volume}%`);
    } catch (error) {
        console.warn('⚠️ No se pudo guardar volumen:', error);
    }
}

// =============================================
// CONTROL DE VOLUMEN DURANTE CROSSFADE
// =============================================
function applyVolumeForCrossfade(player, targetVolume, duration = 1000) {
    if (!player || typeof player.setVolume !== 'function') {
        console.warn('⚠️ Player inválido para crossfade');
        return;
    }
    
    const steps = 30;
    const stepTime = duration / steps;
    const startVolume = player.getVolume();
    let step = 0;
    
    const interval = setInterval(() => {
        step++;
        const progress = step / steps;
        
        // Transición logarítmica para mejor sonoridad
        const easeVolume = Math.pow(progress, 1.5);
        const currentVolume = Math.round(startVolume + (targetVolume - startVolume) * easeVolume);
        
        try {
            player.setVolume(currentVolume);
        } catch (e) {
            console.warn('⚠️ Error configurando volumen en crossfade:', e);
        }
        
        if (step >= steps) {
            clearInterval(interval);
            try {
                player.setVolume(targetVolume);
            } catch (e) {
                console.error('❌ Error final de volumen:', e);
            }
        }
    }, stepTime);
}

// =============================================
// SINCRONIZAR VOLUMEN ENTRE REPRODUCTORES
// =============================================
function syncVolumeBetweenPlayers() {
    try {
        if (window.player1 && window.player2) {
            const player1Volume = window.player1.getVolume?.() || audioState.masterVolume;
            window.player2.setVolume(player1Volume);
            console.log(`🔀 Volumen sincronizado: ${player1Volume}%`);
        }
    } catch (error) {
        console.warn('⚠️ No se pudo sincronizar volumen:', error);
    }
}

// =============================================
// OBTENER VOLUMEN ACTUAL
// =============================================
function getCurrentVolume() {
    return audioState.currentVolume;
}

// =============================================
// ESTABLECER VOLUMEN
// =============================================
function setVolume(volume) {
    const validVolume = Math.max(0, Math.min(100, volume));
    
    audioState.currentVolume = validVolume;
    audioState.isMuted = false;
    
    updateVolumeUI(validVolume);
    applyVolumeToAllPlayers(validVolume);
    saveVolume(validVolume);
    
    console.log(`🔊 Volumen establecido a: ${validVolume}%`);
}

// =============================================
// AUMENTAR VOLUMEN
// =============================================
function increaseVolume(step = 5) {
    const newVolume = Math.min(100, audioState.currentVolume + step);
    setVolume(newVolume);
}

// =============================================
// DISMINUIR VOLUMEN
// =============================================
function decreaseVolume(step = 5) {
    const newVolume = Math.max(0, audioState.currentVolume - step);
    setVolume(newVolume);
}

// =============================================
// TOGGLE MUTE
// =============================================
function toggleMute() {
    if (audioState.isMuted) {
        audioState.currentVolume = audioState.previousVolume > 0 ? audioState.previousVolume : 50;
        audioState.isMuted = false;
    } else {
        audioState.previousVolume = audioState.currentVolume;
        audioState.currentVolume = 0;
        audioState.isMuted = true;
    }
    
    updateVolumeUI(audioState.currentVolume);
    applyVolumeToAllPlayers(audioState.currentVolume);
    saveVolume(audioState.currentVolume);
}

// =============================================
// CONTROL DE VOLUMEN ADAPTATIVO
// =============================================
function getAdaptiveVolume(videoQuality) {
    // Ajustar volumen según calidad de video
    switch(videoQuality) {
        case 'low':
            return Math.min(100, audioState.masterVolume * 1.1); // +10%
        case 'medium':
            return audioState.masterVolume;
        case 'high':
            return Math.max(0, audioState.masterVolume * 0.9); // -10%
        default:
            return audioState.masterVolume;
    }
}

// =============================================
// MONITOREAR CAMBIOS DE VOLUMEN EN PLAYERS
// =============================================
function monitorPlayerVolume() {
    setInterval(() => {
        try {
            if (window.player1 && typeof window.player1.getVolume === 'function') {
                const player1Vol = window.player1.getVolume();
                
                // Si el volumen cambió (ej: usuario ajustó directamente), actualizar estado
                if (player1Vol !== audioState.masterVolume) {
                    audioState.currentVolume = player1Vol;
                    audioState.masterVolume = player1Vol;
                    updateVolumeUI(player1Vol);
                }
            }
        } catch (error) {
            // Silenciar errores de monitoreo
        }
    }, 500);
}

// =============================================
// ECUALIZADOR BÁSICO (OPCIONAL)
// =============================================
function applyEqualizerPreset(preset) {
    // Bass, Mid, Treble adjustments (simulado via volumen)
    const presets = {
        'bass': { boost: 1.2, label: 'Bajos Reforzados' },
        'treble': { boost: 0.8, label: 'Agudos Reforzados' },
        'balanced': { boost: 1.0, label: 'Balanceado' },
        'quiet': { boost: 0.6, label: 'Modo Tranquilo' },
        'loud': { boost: 1.5, label: 'Modo Fuerte' }
    };
    
    if (presets[preset]) {
        const adjustedVolume = Math.min(100, audioState.masterVolume * presets[preset].boost);
        console.log(`🎚️ Preset: ${presets[preset].label}`);
        setVolume(adjustedVolume);
    }
}

// =============================================
// INICIALIZACIÓN AUTOMÁTICA
// =============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM cargado, inicializando audio...');
        setupAudioControls();
        
        // Iniciar monitoreo después de que los players estén listos
        setTimeout(() => {
            monitorPlayerVolume();
            applyVolumeToAllPlayers(audioState.currentVolume);
        }, 2000);
    });
} else {
    console.log('📄 DOM ya cargado, inicializando audio...');
    setupAudioControls();
    
    setTimeout(() => {
        monitorPlayerVolume();
        applyVolumeToAllPlayers(audioState.currentVolume);
    }, 2000);
}

// =============================================
// EXPONER FUNCIONES GLOBALMENTE
// =============================================
window.setupAudioControls = setupAudioControls;
window.setVolume = setVolume;
window.getCurrentVolume = getCurrentVolume;
window.increaseVolume = increaseVolume;
window.decreaseVolume = decreaseVolume;
window.toggleMute = toggleMute;
window.applyVolumeToAllPlayers = applyVolumeToAllPlayers;
window.applyVolumeForCrossfade = applyVolumeForCrossfade;
window.syncVolumeBetweenPlayers = syncVolumeBetweenPlayers;
window.applyEqualizerPreset = applyEqualizerPreset;
window.audioState = audioState;

console.log('✅ Sistema de audio avanzado cargado');
