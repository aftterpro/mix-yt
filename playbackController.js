// ===== PLAYBACKCONTROLLER.JS - CORREGIDO E INTEGRADO =====
// Versión que delega funciones principales al core unificado y mantiene funciones específicas

export class PlaybackController {
    
    // ✅ DELEGACIÓN AL CORE UNIFICADO
    static playFirstVideo() {
        if (window.unifiedCore?.playbackController?.playFirstVideo) {
            return window.unifiedCore.playbackController.playFirstVideo();
        } else {
            console.warn('⚠️ Core unificado no disponible, usando fallback');
            return PlaybackController.fallbackPlayFirstVideo();
        }
    }
    
    static async playNextVideo() {
        if (window.unifiedCore?.playbackController?.playNextVideo) {
            return window.unifiedCore.playbackController.playNextVideo();
        } else {
            console.warn('⚠️ Core unificado no disponible, usando fallback');
            return PlaybackController.fallbackPlayNextVideo();
        }
    }
    
    static startMonitoring() {
        if (window.unifiedCore?.playbackController?.startMonitoring) {
            return window.unifiedCore.playbackController.startMonitoring();
        } else {
            console.warn('⚠️ Core unificado no disponible para monitoreo');
        }
    }

    static stopMonitoring() {
        if (window.unifiedCore?.playbackController?.stopMonitoring) {
            return window.unifiedCore.playbackController.stopMonitoring();
        } else {
            console.warn('⚠️ Core unificado no disponible para detener monitoreo');
        }
    }

    // ✅ MÉTODOS ESPECÍFICOS (mantener para compatibilidad y casos especiales)
    static monitorPlayers() {
        // Delegar al core pero mantener para compatibilidad
        if (window.unifiedCore?.playbackController?.monitorPlayers) {
            return window.unifiedCore.playbackController.monitorPlayers();
        }
        
        // Fallback básico
        const state = window.unifiedStateManager?.state;
        if (!state || !state.app.playersInitialized || !state.app.reproduccionIniciada) return;

        const activePlayer = (state.app.currentPlayer === 1) ? state.app.player1 : state.app.player2;

        if (!activePlayer || typeof activePlayer.getPlayerState !== 'function') {
            console.warn("Monitor fallback: Reproductor activo inválido");
            return;
        }

        // SponsorBlock check básico
        if (window.SponsorBlockManager?.checkAndSkipSegment) {
            window.SponsorBlockManager.checkAndSkipSegment(activePlayer);
        }
    }

    // ✅ FALLBACKS PARA COMPATIBILIDAD
    static fallbackPlayFirstVideo() {
        console.log('🔄 Usando fallback para playFirstVideo');
        
        const state = window.unifiedStateManager?.state;
        if (!state?.app.playersInitialized) {
            console.error('❌ Reproductores no inicializados');
            window.unifiedMessageManager?.show('Reproductores no están listos', 'error');
            return;
        }

        const flatList = window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist() : [];
        
        if (flatList.length === 0) {
            console.log('📭 No hay videos para reproducir');
            window.unifiedMessageManager?.show('No hay videos en la cola', 'warning');
            return;
        }

        const firstVideo = flatList[0];
        
        try {
            // Actualizar estado
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', 0);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', firstVideo.videoId);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', firstVideo.sourcePlaylistId);
                window.unifiedStateManager.set('app.reproduccionIniciada', true);
                window.unifiedStateManager.set('app.currentPlayer', 1);
            }

            // Configurar reproductores
            if (state.app.player2) {
                try { state.app.player2.stopVideo(); } catch(e) {}
            }
            
            state.app.player1.loadVideoById(firstVideo.videoId);
            state.app.player1.setVolume(100);

            // UI updates
            document.getElementById('player1')?.classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2')?.classList.add('hidden');

            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-pause"></i>';
                playButton.disabled = false;
            }

            // Iniciar monitoreo básico
            PlaybackController.startBasicMonitoring();

            console.log('✅ Reproducción iniciada (fallback)');
            
        } catch (error) {
            console.error('❌ Error en fallback playFirstVideo:', error);
            window.unifiedMessageManager?.show('Error iniciando reproducción', 'error');
        }
    }

    static async fallbackPlayNextVideo() {
        console.log('🔄 Usando fallback para playNextVideo');
        
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const currentFlatIndex = state.playlist.currentPlayingInfo.flattenedIndex;
        const flatList = window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist() : [];

        if (flatList.length === 0) {
            PlaybackController.handleEmptyPlaylist();
            return;
        }

        let nextIndex = currentFlatIndex + 1;
        if (nextIndex >= flatList.length) {
            PlaybackController.handleEndOfPlaylist();
            return;
        }

        try {
            const nextVideo = flatList[nextIndex];
            if (!nextVideo?.videoId) {
                throw new Error(`Video siguiente inválido en índice ${nextIndex}`);
            }

            // Actualizar estado
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', nextIndex);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', nextVideo.videoId);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', nextVideo.sourcePlaylistId);

            // Cambio simple de reproductor (sin crossfade complejo)
            const currentPlayerNum = state.app.currentPlayer;
            const nextPlayerNum = currentPlayerNum === 1 ? 2 : 1;
            const nextPlayer = nextPlayerNum === 1 ? state.app.player1 : state.app.player2;

            if (nextPlayer) {
                nextPlayer.cueVideoById(nextVideo.videoId);
                setTimeout(() => {
                    nextPlayer.playVideo();
                    window.unifiedStateManager.set('app.currentPlayer', nextPlayerNum);
                    
                    // Actualizar UI
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                }, 500);
            }

        } catch (error) {
            console.error("❌ Error en fallback playNextVideo:", error);
            window.unifiedMessageManager?.show(`Error cambiando video: ${error.message}`, 'error');
        }
    }

    // ✅ MONITOREO BÁSICO PARA FALLBACK
    static startBasicMonitoring() {
        const state = window.unifiedStateManager?.state;
        if (!state || state.app.monitorInterval) return;

        const interval = setInterval(() => {
            PlaybackController.monitorPlayers();
        }, 300);

        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('app.monitorInterval', interval);
        }
        
        console.log('🔍 Monitoreo básico iniciado');
    }

    // ✅ MANEJO DE ESTADOS ESPECIALES
    static handleEmptyPlaylist() {
        console.log("📭 Lista vacía detectada");
        
        PlaybackController.stopMonitoring();
        
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('app.reproduccionIniciada', false);
            window.unifiedStateManager.set('app.isTransitioning', false);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
        }

        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.disabled = true;
        }

        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }

        window.unifiedMessageManager?.show("No hay videos en la cola para reproducir", 'warning');
    }

    static handleEndOfPlaylist() {
        console.log('🔚 Fin de playlist detectado');
        
        const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
        
        if (repeat) {
            // Reset y reiniciar
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            }
            
            PlaybackController.playFirstVideo();
        } else {
            PlaybackController.stopMonitoring();
            window.unifiedMessageManager?.show("Playlist finalizada. ¡Gracias por usar YT CrossMix! 🎵", 'info');
            
            // Detener reproductores
            const state = window.unifiedStateManager?.state;
            if (state) {
                try {
                    if (state.app.player1) state.app.player1.stopVideo();
                    if (state.app.player2) state.app.player2.stopVideo();
                } catch(e) {
                    console.warn("Error deteniendo players:", e);
                }
                
                window.unifiedStateManager.set('app.reproduccionIniciada', false);
            }
            
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                const flatList = window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist() : [];
                playButton.disabled = flatList.length === 0;
                playButton.innerHTML = '<i class="fas fa-play"></i>';
            }
        }
        
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('app.isTransitioning', false);
        }
    }

    // ✅ UTILIDADES ESPECÍFICAS
    static getDebugInfo() {
        const state = window.unifiedStateManager?.state;
        if (!state) return { error: 'Estado no disponible' };
        
        return {
            reproduccionIniciada: state.app.reproduccionIniciada,
            currentPlayer: state.app.currentPlayer,
            isTransitioning: state.app.isTransitioning,
            crossfadeInProgress: state.app.crossfadeInProgress,
            currentPlayingInfo: state.playlist.currentPlayingInfo,
            flatListCount: window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist().length : 0,
            playersInitialized: state.app.playersInitialized,
            monitoringActive: !!state.app.monitorInterval
        };
    }

    // ✅ FUNCIÓN DE COMPATIBILIDAD PARA MIGRACIÓN GRADUAL
    static checkCoreAvailability() {
        return {
            coreAvailable: !!window.unifiedCore,
            coreInitialized: window.unifiedCore?.initialized || false,
            playbackControllerAvailable: !!window.unifiedCore?.playbackController,
            fallbackRequired: !window.unifiedCore?.initialized
        };
    }
}

// ✅ SETUP AUTOMÁTICO
document.addEventListener('DOMContentLoaded', () => {
    // Verificar disponibilidad del core
    const coreCheck = setInterval(() => {
        if (window.unifiedCore?.initialized) {
            console.log('✅ PlaybackController: Core unificado disponible');
            clearInterval(coreCheck);
            
            // Setup adicional si es necesario
            if (window.PlaylistManager?.checkAndEnablePlayButton) {
                window.PlaylistManager.checkAndEnablePlayButton();
            }
        }
    }, 100);
    
    // Timeout para fallback
    setTimeout(() => {
        clearInterval(coreCheck);
        if (!window.unifiedCore?.initialized) {
            console.warn('⚠️ PlaybackController: Timeout esperando core, usando modo fallback');
        }
    }, 10000);
});

// ✅ REFERENCIAS GLOBALES Y DEBUG
if (typeof window !== 'undefined') {
    window.PlaybackController = PlaybackController;
    
    // Debug helpers específicos
    window.PlaybackDebug = {
        getInfo: () => PlaybackController.getDebugInfo(),
        checkCore: () => PlaybackController.checkCoreAvailability(),
        playFirst: () => PlaybackController.playFirstVideo(),
        playNext: () => PlaybackController.playNextVideo(),
        startMonitor: () => PlaybackController.startMonitoring(),
        stopMonitor: () => PlaybackController.stopMonitoring(),
        testFallback: () => {
            // Temporary disable core for testing
            const originalCore = window.unifiedCore;
            window.unifiedCore = null;
            PlaybackController.playFirstVideo();
            setTimeout(() => {
                window.unifiedCore = originalCore;
            }, 5000);
        }
    };
}

console.log('✅ PlaybackController cargado - VERSIÓN INTEGRADA CON CORE UNIFICADO');
