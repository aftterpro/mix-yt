// playbackController.js - Control de Reproducción
import { AppState, CONFIG } from './config.js';
import { PlaylistState } from './config.js';
import { PlaylistManager } from './playlistManager.js';
import { UIManager } from './ui.js';
import { mostrarMensajeFlotante } from './ui.js';
import { SponsorBlockManager } from './sponsorblock.js';

export class PlaybackController {
    // Iniciar monitoreo de reproductores
    static startMonitoring() {
        if (!AppState.monitorInterval) {
            AppState.monitorInterval = setInterval(PlaybackController.monitorPlayers, 300);
            console.log('Monitoreo iniciado (intervalo: 300ms).');
        }
    }

    // Detener monitoreo
    static stopMonitoring() {
        if (AppState.monitorInterval) {
            clearInterval(AppState.monitorInterval);
            AppState.monitorInterval = null;
            console.log('Monitoreo detenido.');
        }
    }

    // Monitorear estado de reproductores
    static monitorPlayers() {
        if (!AppState.playersInitialized || !AppState.reproduccionIniciada) return;

        const activePlayer = (AppState.currentPlayer === 1) ? AppState.player1 : AppState.player2;

        if (!activePlayer ||
            typeof activePlayer.getPlayerState !== 'function' ||
            typeof activePlayer.getCurrentTime !== 'function' ||
            typeof activePlayer.getDuration !== 'function' ||
            typeof activePlayer.getVideoData !== 'function') {
            console.warn("Monitor: El reproductor activo es inválido.");
            PlaybackController.stopMonitoring();
            return;
        }

        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoId = activePlayer.getVideoData()?.video_id;

        if (!videoId || isNaN(videoDuration) || videoDuration <= 0) {
            SponsorBlockManager.checkAndSkipSegment(activePlayer);
            return;
        }

        // SponsorBlock: asegurar que los segmentos estén gestionados
        SponsorBlockManager.checkAndSkipSegment(activePlayer);

        // Crossfade basado en tiempo restante
        const timeRemaining = videoDuration - currentTime;

        if (playerState === YT.PlayerState.PLAYING &&
            timeRemaining <= CONFIG.CROSSFADE_DURATION + 0.5 &&
            timeRemaining > 0 &&
            !AppState.hasOutroCrossfadeStarted &&
            !AppState.crossfadeInProgress) {
            console.log(`Monitor: Tiempo restante (${timeRemaining.toFixed(1)}s) dentro de la ventana de crossfade.`);
            PlaybackController.playNextVideo();
        }

        // Salvaguarda: detener reproductor inactivo
        const inactivePlayer = (AppState.currentPlayer === 1) ? AppState.player2 : AppState.player1;
        if (inactivePlayer &&
            typeof inactivePlayer.getPlayerState === 'function' &&
            typeof inactivePlayer.stopVideo === 'function' &&
            !AppState.crossfadeInProgress) {
            const inactiveState = inactivePlayer.getPlayerState();
            if (inactiveState === YT.PlayerState.PLAYING && inactivePlayer !== activePlayer) {
                console.warn("Monitor: Reproductor inactivo detectado aún REPRODUCIENDO. Deteniéndolo.");
                try { 
                    inactivePlayer.stopVideo(); 
                } catch(e) { 
                    console.error("Monitor: Error deteniendo reproductor inactivo:", e); 
                }
            }
        }
    }

    // Reproducir primer video
    static playFirstVideo() {
        if (!AppState.playersInitialized) {
            console.error('Los reproductores no están inicializados.');
            return;
        }
        
        PlaybackController.stopMonitoring();
        AppState.isTransitioning = false;

        const flatList = PlaylistManager.getFlattenedPlaylist();
        if (flatList.length > 0) {
            const firstVideo = flatList[0];
            PlaylistState.currentPlayingInfo.flattenedIndex = 0;
            PlaylistState.currentPlayingInfo.videoId = firstVideo.videoId;
            PlaylistState.currentPlayingInfo.playlistId = firstVideo.sourcePlaylistId;

            console.log('Reproduciendo el primer video:', firstVideo.videoId);

            try {
                if (AppState.player2) AppState.player2.stopVideo();
                AppState.player1.loadVideoById(firstVideo.videoId);
                AppState.player1.setVolume(100);

                document.getElementById('player1').classList.remove('hidden', 'fade-out', 'fade-in');
                document.getElementById('player2').classList.add('hidden');
                AppState.currentPlayer = 1;

                AppState.reproduccionIniciada = true;
                document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>';

                PlaybackController.startMonitoring();
                UIManager.updatePlaylistsUI();
            } catch (e) {
                console.error("Error al iniciar el primer video:", e);
                AppState.reproduccionIniciada = false;
                document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
            }
        } else {
            console.log("No hay videos en la lista para reproducir.");
            mostrarMensajeFlotante("No hay videos en la lista para reproducir.");
            document.getElementById('botonPlay').disabled = true;
            AppState.reproduccionIniciada = false;
        }
    }

    // Reproducir siguiente video
    static async playNextVideo() {
        const currentFlatIndex = PlaylistState.currentPlayingInfo.flattenedIndex;
        const flatList = PlaylistManager.getFlattenedPlaylist();

        console.log(`playNextVideo: Índice actual: ${currentFlatIndex}, isTransitioning=${AppState.isTransitioning}`);
        
        if (AppState.isTransitioning && AppState.crossfadeInProgress) {
            console.log("playNextVideo: Transición y crossfade en progreso, ignorando llamada duplicada.");
            return;
        }
        
        AppState.isTransitioning = true;

        if (flatList.length === 0) {
            PlaybackController.handleEmptyPlaylist();
            return;
        }

        let nextIndex = currentFlatIndex + 1;
        if (nextIndex >= flatList.length) {
            PlaybackController.handleEndOfPlaylist();
            return;
        }

        const previousVideoIdForCleanup = PlaylistState.currentPlayingInfo.videoId;
        let currentPlayerLogicalNum = AppState.currentPlayer;
        let previousPlayerInstance = (currentPlayerLogicalNum === 1) ? AppState.player1 : AppState.player2;
        let nextPlayerInstance = (currentPlayerLogicalNum === 1) ? AppState.player2 : AppState.player1;
        let currentPlayerElement = document.getElementById(`player${currentPlayerLogicalNum}`);
        let nextPlayerElement = document.getElementById(`player${currentPlayerLogicalNum === 1 ? 2 : 1}`);

        try {
            const nextVideo = flatList[nextIndex];
            if (!nextVideo || !nextVideo.videoId) {
                throw new Error(`Video siguiente inválido en el índice aplanado ${nextIndex}.`);
            }

            PlaybackController.validatePlayerInstances(previousPlayerInstance, nextPlayerInstance);

            await PlaybackController.prepareNextPlayer(nextPlayerInstance, nextVideo.videoId, nextPlayerElement);
            PlaybackController.setInitialVolumes(previousPlayerInstance, nextPlayerInstance);

            PlaylistState.currentPlayingInfo = {
                flattenedIndex: nextIndex,
                videoId: nextVideo.videoId,
                playlistId: nextVideo.sourcePlaylistId
            };
            UIManager.updatePlaylistsUI();

            PlaybackController.applyTransitionClasses(currentPlayerElement, nextPlayerElement);

            await PlaybackController.playNextPlayer(nextPlayerInstance, currentPlayerLogicalNum);

            setTimeout(() => {
                try {
                    const nextPlayerState = nextPlayerInstance.getPlayerState();
                    if (nextPlayerState === YT.PlayerState.PLAYING) {
                        PlaybackController.crossfadeAudio(previousPlayerInstance, nextPlayerInstance);
                    } else {
                        console.warn(`El reproductor siguiente no está reproduciendo (Estado: ${nextPlayerState})`);
                        setTimeout(() => PlaybackController.crossfadeAudio(previousPlayerInstance, nextPlayerInstance), 200);
                    }
                } catch(e) {
                    console.error("Error verificando estado del reproductor para crossfade:", e);
                    PlaybackController.crossfadeAudio(previousPlayerInstance, nextPlayerInstance);
                }
            }, 150);

            PlaybackController.setupTransitionEndHandlers(currentPlayerElement, previousPlayerInstance, nextPlayerElement,
                currentPlayerLogicalNum, previousVideoIdForCleanup);

        } catch (error) {
            PlaybackController.handleCriticalError(error, flatList, currentFlatIndex);
        }
    }

    // Funciones auxiliares para playNextVideo
    static validatePlayerInstances(prev, next) {
        if (!prev || typeof prev.setVolume !== 'function' || typeof prev.getVolume !== 'function' ||
            !next || typeof next.cueVideoById !== 'function' || typeof next.playVideo !== 'function' ||
            typeof next.setVolume !== 'function' || typeof next.getPlayerState !== 'function') {
            throw new Error("Instancias de reproductores o funciones de API requeridas faltan para el crossfade.");
        }
    }

    static async prepareNextPlayer(nextPlayer, videoId, nextPlayerElement) {
        console.log(`Llamando a cueVideoById('${videoId}')`);
        nextPlayer.cueVideoById(videoId);
        if (nextPlayerElement) {
            nextPlayerElement.classList.remove('hidden', 'fade-out');
        }
    }

    static setInitialVolumes(prev, next) {
        try { prev.setVolume(prev.getVolume() || 100); } catch (e) { prev.setVolume(100); }
        try { next.setVolume(0); } catch (e) { }
    }

    static applyTransitionClasses(currentEl, nextEl) {
        if (currentEl) currentEl.classList.add('fade-out');
        if (nextEl) {
            nextEl.classList.remove('fade-in');
            nextEl.classList.add('fade-in');
        }
    }

    static async playNextPlayer(player, logicalNum) {
        try {
            console.log(`Estado de Player ${logicalNum === 1 ? 2 : 1} ANTES de playVideo(): ${player.getPlayerState()}`);
            if (player && typeof player.playVideo === 'function') {
                player.playVideo();
            } else {
                throw new Error("Fallo al iniciar reproducción en reproductor siguiente.");
            }
            console.log(`Estado de Player ${logicalNum === 1 ? 2 : 1} DESPUÉS de playVideo(): ${player.getPlayerState()}`);
        } catch (e) {
            throw e;
        }
    }

    static setupTransitionEndHandlers(currentEl, prevPlayer, nextEl, logicalNum, prevVideoId) {
        let transitionEndHandler = (event) => {
            if (event.propertyName !== 'opacity' || event.target !== currentEl) return;
            event.target.removeEventListener('transitionend', transitionEndHandler);
            clearTimeout(transitionEndHandler.fallbackTimeoutId);
            PlaybackController.cleanupAfterTransition(prevPlayer, currentEl, nextEl, logicalNum, prevVideoId);
        };

        if (currentEl) {
            currentEl.addEventListener('transitionend', transitionEndHandler);
            const fallbackTimeoutMs = CONFIG.CROSSFADE_DURATION * 1000 + 200;
            const fallbackTimeoutId = setTimeout(() => {
                if (currentEl) currentEl.removeEventListener('transitionend', transitionEndHandler);
                transitionEndHandler({ propertyName: 'opacity', target: currentEl, isFallback: true });
            }, fallbackTimeoutMs);
            transitionEndHandler.fallbackTimeoutId = fallbackTimeoutId;
        } else {
            PlaybackController.cleanupAfterTransition(prevPlayer, currentEl, nextEl, logicalNum, prevVideoId);
        }
    }

    static cleanupAfterTransition(prevPlayer, currentEl, nextEl, logicalNum, prevVideoId) {
        try {
            if (prevPlayer && typeof prevPlayer.stopVideo === 'function' && prevPlayer.getPlayerState() !== YT.PlayerState.ENDED) {
                prevPlayer.stopVideo();
            }
            if (currentEl) {
                currentEl.classList.remove('fade-out', 'fade-in');
                currentEl.classList.add('hidden');
            }
            if (nextEl) nextEl.classList.remove('fade-in');
            
            // Limpiar caché de SponsorBlock
            if (prevVideoId && window.appState?.sponsorBlockState?.segmentosCache[prevVideoId]) {
                delete window.appState.sponsorBlockState.segmentosCache[prevVideoId];
            }
        } catch (cleanupError) {
            console.error("Error durante la limpieza de transitionend:", cleanupError);
            AppState.isAudioFading = false;
        }
    }

    // Manejo de errores y estados especiales
    static handleEmptyPlaylist() {
        console.log("No hay videos en la lista aplanada.");
        
        PlaybackController.cancelCrossfade();
        PlaybackController.stopMonitoring();
        AppState.reproduccionIniciada = false;
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        document.getElementById('botonPlay').disabled = true;
        PlaylistState.currentPlayingInfo = { flattenedIndex: -1, videoId: null, playlistId: null };
        UIManager.updatePlaylistsUI();
        AppState.isTransitioning = false;
    }

    static handleEndOfPlaylist() {
        console.log('Fin de la lista aplanada detectado.');
        PlaybackController.askToRepeatPlaylist();
        AppState.isTransitioning = false;
    }

    static handleCriticalError(error, flatList, currentFlatIndex) {
        console.error("Error CRÍTICO durante playNextVideo:", error);
        
        PlaybackController.cancelCrossfade();
        
        AppState.isTransitioning = false;
        AppState.isAudioFading = false;
        const previousVideo = flatList[currentFlatIndex];
        PlaylistState.currentPlayingInfo.flattenedIndex = currentFlatIndex >= 0 ? currentFlatIndex : -1;
        PlaylistState.currentPlayingInfo.videoId = previousVideo ? previousVideo.videoId : null;
        PlaylistState.currentPlayingInfo.playlistId = previousVideo ? previousVideo.sourcePlaylistId : null;
        
        mostrarMensajeFlotante(`Error cambiando video: ${error.message}`);
        UIManager.updatePlaylistsUI();
        PlaybackController.stopMonitoring();
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        AppState.reproduccionIniciada = false;
    }

    static askToRepeatPlaylist() {
        const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
        if (repeat) {
            PlaylistState.currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
            PlaybackController.playFirstVideo();
        } else {
            PlaybackController.stopMonitoring();
            mostrarMensajeFlotante("Playlist finalizada. Gracias por usar YT CrossMix :)");
            try {
                if(AppState.player1) AppState.player1.stopVideo();
                if(AppState.player2) AppState.player2.stopVideo();
            } catch(e) {}
            document.getElementById('botonPlay').disabled = PlaylistManager.getFlattenedPlaylist().length === 0;
            AppState.reproduccionIniciada = false;
        }
    }

    // Crossfade de audio
    static crossfadeAudio(prevPlayer, nextPlayer) {
        if (AppState.crossfadeInProgress) {
            console.log("Crossfade ya en progreso, ignorando nueva llamada.");
            return;
        }
        
        AppState.crossfadeInProgress = true;
        const DURATION_MS = (typeof CONFIG.CROSSFADE_DURATION === 'number' && CONFIG.CROSSFADE_DURATION > 0)
            ? Math.floor(CONFIG.CROSSFADE_DURATION * 1000)
            : 15000;
        
        const FPS = 60;
        const STEP_MS = 1000 / FPS;
        const STEPS = Math.ceil(DURATION_MS / STEP_MS);

        let step = 0;
        AppState.isAudioFading = true;

        let prevStartVol = 100;
        let nextStartVol = 0;
        
        try {
            if (prevPlayer && typeof prevPlayer.getVolume === 'function') {
                const vol = prevPlayer.getVolume();
                prevStartVol = (vol !== null && !isNaN(vol) && vol >= 0) ? vol : 100;
            }
        } catch(e) { 
            console.warn("Error obteniendo volumen del reproductor anterior:", e);
            prevStartVol = 100; 
        }

        console.log(`Iniciando crossfade: ${prevStartVol}% → 0% | 0% → 100% durante ${DURATION_MS}ms`);

        if (DURATION_MS === 0 || prevStartVol === 0) {
            try {
                if (prevPlayer && typeof prevPlayer.setVolume === 'function') prevPlayer.setVolume(0);
                if (nextPlayer && typeof nextPlayer.setVolume === 'function') nextPlayer.setVolume(100);
                if (prevPlayer && typeof prevPlayer.stopVideo === 'function') prevPlayer.stopVideo();
            } catch(e) { console.error("Error en crossfade instantáneo:", e); }
            
            AppState.isAudioFading = false;
            AppState.crossfadeInProgress = false;
            return;
        }

        if (AppState.crossfadeInterval) {
            clearInterval(AppState.crossfadeInterval);
            AppState.crossfadeInterval = null;
        }

        AppState.crossfadeInterval = setInterval(() => {
            step++;
            
            const progress = step / STEPS;
            const easedProgress = PlaybackController.easeInOutCubic(progress);
            
            const prevVol = Math.max(0, Math.round(prevStartVol * (1 - easedProgress)));
            const nextVol = Math.min(100, Math.round(nextStartVol + ((100 - nextStartVol) * easedProgress)));

            try {
                if (prevPlayer && typeof prevPlayer.setVolume === 'function') {
                    const prevState = prevPlayer.getPlayerState();
                    if (prevState === YT.PlayerState.PLAYING || prevState === YT.PlayerState.BUFFERING) {
                        prevPlayer.setVolume(prevVol);
                    }
                }
            } catch(e) {
                console.warn("Error configurando volumen del reproductor anterior:", e);
            }
            
            try {
                if (nextPlayer && typeof nextPlayer.setVolume === 'function') {
                    nextPlayer.setVolume(nextVol);
                }
            } catch(e) {
                console.warn("Error configurando volumen del reproductor siguiente:", e);
            }

            if (step % Math.floor(STEPS / 10) === 0 || step === STEPS) {
                console.log(`Crossfade ${Math.round(progress * 100)}%: Prev=${prevVol}%, Next=${nextVol}%`);
            }

            if (step >= STEPS) {
                clearInterval(AppState.crossfadeInterval);
                AppState.crossfadeInterval = null;
                
                try {
                    if (prevPlayer && typeof prevPlayer.setVolume === 'function') prevPlayer.setVolume(0);
                    if (nextPlayer && typeof nextPlayer.setVolume === 'function') nextPlayer.setVolume(100);
                    
                    setTimeout(() => {
                        try {
                            if (prevPlayer && typeof prevPlayer.stopVideo === 'function') {
                                const prevState = prevPlayer.getPlayerState();
                                if (prevState !== YT.PlayerState.ENDED && prevState !== YT.PlayerState.UNSTARTED) {
                                    prevPlayer.stopVideo();
                                    console.log("Reproductor anterior detenido después del crossfade.");
                                }
                            }
                        } catch(e) {
                            console.error("Error deteniendo reproductor anterior:", e);
                        }
                    }, 100);
                    
                } catch(e) {
                    console.error("Error en finalización del crossfade:", e);
                }
                
                AppState.isAudioFading = false;
                AppState.crossfadeInProgress = false;
                console.log("Crossfade completado.");
            }
        }, STEP_MS);
    }

    // Función de easing para crossfade más suave
    static easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    // Cancelar crossfade en caso de emergencia
    static cancelCrossfade() {
        if (AppState.crossfadeInterval) {
            clearInterval(AppState.crossfadeInterval);
            AppState.crossfadeInterval = null;
            AppState.crossfadeInProgress = false;
            AppState.isAudioFading = false;
            console.log("Crossfade cancelado.");
        }
    }
}
