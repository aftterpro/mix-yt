// ===== 4. PLAYBACKCONTROLLER.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// playbackController.js - Versión adaptada al sistema unificado

export class PlaybackController {
    
    static startMonitoring() {
        // ✅ Usar estado unificado
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        if (!state.app.monitorInterval) {
            state.app.monitorInterval = setInterval(PlaybackController.monitorPlayers, 300);
            console.log('Monitoreo iniciado con estado unificado (intervalo: 300ms).');
        }
    }

    static stopMonitoring() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        if (state.app.monitorInterval) {
            clearInterval(state.app.monitorInterval);
            state.app.monitorInterval = null;
            console.log('Monitoreo detenido.');
        }
    }

    static monitorPlayers() {
        const state = window.unifiedStateManager?.state;
        if (!state || !state.app.playersInitialized || !state.app.reproduccionIniciada) return;

        const activePlayer = (state.app.currentPlayer === 1) ? state.app.player1 : state.app.player2;

        if (!activePlayer || typeof activePlayer.getPlayerState !== 'function') {
            console.warn("Monitor: El reproductor activo es inválido.");
            PlaybackController.stopMonitoring();
            return;
        }

        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoId = activePlayer.getVideoData()?.video_id;

        if (!videoId || isNaN(videoDuration) || videoDuration <= 0) {
            // ✅ Usar SponsorBlock unificado
            if (window.SponsorBlockManager) {
                window.SponsorBlockManager.checkAndSkipSegment(activePlayer);
            }
            return;
        }

        // SponsorBlock check
        if (window.SponsorBlockManager) {
            window.SponsorBlockManager.checkAndSkipSegment(activePlayer);
        }

        // Crossfade logic usando CONFIG unificado
        const CROSSFADE_DURATION = 15; // Hardcoded por ahora
        const timeRemaining = videoDuration - currentTime;

        if (playerState === YT.PlayerState.PLAYING &&
            timeRemaining <= CROSSFADE_DURATION + 0.5 &&
            timeRemaining > 0 &&
            !state.app.hasOutroCrossfadeStarted &&
            !state.app.crossfadeInProgress) {
            
            console.log(`Monitor: Tiempo restante (${timeRemaining.toFixed(1)}s) dentro de la ventana de crossfade.`);
            PlaybackController.playNextVideo();
        }
    }

    static playFirstVideo() {
        const state = window.unifiedStateManager?.state;
        if (!state || !state.app.playersInitialized) {
            console.error('Los reproductores no están inicializados.');
            return;
        }
        
        PlaybackController.stopMonitoring();
        state.app.isTransitioning = false;

        // ✅ Usar PlaylistManager unificado
        const flatList = window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist() : [];
        
        if (flatList.length > 0) {
            const firstVideo = flatList[0];
            
            // ✅ Actualizar estado unificado
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', 0);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', firstVideo.videoId);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', firstVideo.sourcePlaylistId);

            console.log('Reproduciendo el primer video:', firstVideo.videoId);

            try {
                if (state.app.player2) state.app.player2.stopVideo();
                state.app.player1.loadVideoById(firstVideo.videoId);
                state.app.player1.setVolume(100);

                document.getElementById('player1')?.classList.remove('hidden', 'fade-out', 'fade-in');
                document.getElementById('player2')?.classList.add('hidden');
                
                window.unifiedStateManager.set('app.currentPlayer', 1);
                window.unifiedStateManager.set('app.reproduccionIniciada', true);

                const playButton = document.getElementById('botonPlay');
                if (playButton) playButton.innerHTML = '<i class="fas fa-pause"></i>';

                PlaybackController.startMonitoring();
                
                // ✅ Usar UIManager unificado
                if (window.UIManager?.updatePlaylistsUI) {
                    window.UIManager.updatePlaylistsUI();
                }
            } catch (e) {
                console.error("Error al iniciar el primer video:", e);
                window.unifiedStateManager.set('app.reproduccionIniciada', false);
                const playButton = document.getElementById('botonPlay');
                if (playButton) playButton.innerHTML = '<i class="fas fa-play"></i>';
            }
        } else {
            console.log("No hay videos en la lista para reproducir.");
            // ✅ Usar sistema de mensajes unificado
            window.unifiedMessageManager?.show("No hay videos en la lista para reproducir.", 'warning');
            
            const playButton = document.getElementById('botonPlay');
            if (playButton) playButton.disabled = true;
            
            window.unifiedStateManager.set('app.reproduccionIniciada', false);
        }
    }

    static async playNextVideo() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const currentFlatIndex = state.playlist.currentPlayingInfo.flattenedIndex;
        const flatList = window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist() : [];

        console.log(`playNextVideo: Índice actual: ${currentFlatIndex}, isTransitioning=${state.app.isTransitioning}`);
        
        if (state.app.isTransitioning && state.app.crossfadeInProgress) {
            console.log("playNextVideo: Transición en progreso, ignorando llamada duplicada.");
            return;
        }
        
        window.unifiedStateManager.set('app.isTransitioning', true);

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
                throw new Error(`Video siguiente inválido en el índice ${nextIndex}.`);
            }

            // Actualizar estado de reproducción actual
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', nextIndex);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', nextVideo.videoId);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', nextVideo.sourcePlaylistId);

            // Lógica de crossfade (simplificada)
            const currentPlayerNum = state.app.currentPlayer;
            const nextPlayerNum = currentPlayerNum === 1 ? 2 : 1;
            const nextPlayer = nextPlayerNum === 1 ? state.app.player1 : state.app.player2;

            if (nextPlayer) {
                nextPlayer.cueVideoById(nextVideo.videoId);
                setTimeout(() => {
                    nextPlayer.playVideo();
                    window.unifiedStateManager.set('app.currentPlayer', nextPlayerNum);
                }, 500);
            }

            // ✅ Actualizar UI
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }

        } catch (error) {
            console.error("Error CRÍTICO durante playNextVideo:", error);
            window.unifiedStateManager.set('app.isTransitioning', false);
            // ✅ Usar sistema de mensajes unificado
            window.unifiedMessageManager?.show(`Error cambiando video: ${error.message}`, 'error');
        }
    }

    static handleEmptyPlaylist() {
        console.log("No hay videos en la lista.");
        
        PlaybackController.stopMonitoring();
        const state = window.unifiedStateManager?.state;
        if (state) {
            window.unifiedStateManager.set('app.reproduccionIniciada', false);
            window.unifiedStateManager.set('app.isTransitioning', false);
            
            // Reset current playing info
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
    }

    static handleEndOfPlaylist() {
        console.log('Fin de la lista detectado.');
        const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
        
        if (repeat) {
            // Reset y reiniciar
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            
            PlaybackController.playFirstVideo();
        } else {
            PlaybackController.stopMonitoring();
            // ✅ Usar sistema de mensajes unificado
            window.unifiedMessageManager?.show("Playlist finalizada. Gracias por usar YT CrossMix :)", 'info');
            
            const state = window.unifiedStateManager?.state;
            if (state) {
                try {
                    if(state.app.player1) state.app.player1.stopVideo();
                    if(state.app.player2) state.app.player2.stopVideo();
                } catch(e) {}
                
                const flatList = window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist() : [];
                const playButton = document.getElementById('botonPlay');
                if (playButton) playButton.disabled = flatList.length === 0;
                
                window.unifiedStateManager.set('app.reproduccionIniciada', false);
            }
        }
        
        window.unifiedStateManager.set('app.isTransitioning', false);
    }
}
