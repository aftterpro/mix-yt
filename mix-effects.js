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
