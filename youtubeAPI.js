//  Manejo del API de YouTube
import { AppState, CONFIG } from './config.js';
import { mostrarMensajeFlotante } from './ui.js';
import { PlaybackController } from './playbackController.js';
import { SponsorBlockManager } from './sponsorblock.js';

export class YouTubeAPIManager {
    static loadYouTubeAPI() {
        if (AppState.youtubeAPIReady) return;
        AppState.youtubeAPIReady = true;
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.head.appendChild(script);
    }

    static initializePlayers() {
        if (AppState.player1 && AppState.player2) return;

        AppState.player1 = new YT.Player('player1', {
            height: '100%',
            width: '100%',
            playerVars: {
                'playsinline': 1
            },
            events: {
                'onReady': YouTubeAPIManager.onPlayerReady,
                'onStateChange': YouTubeAPIManager.onPlayerStateChange,
                'onError': YouTubeAPIManager.onPlayerError
            }
        });

        AppState.player2 = new YT.Player('player2', {
            height: '100%',
            width: '100%',
            playerVars: {
                'playsinline': 1
            },
            events: {
                'onReady': YouTubeAPIManager.onPlayerReady,
                'onStateChange': YouTubeAPIManager.onPlayerStateChange,
                'onError': YouTubeAPIManager.onPlayerError
            }
        });
    }

    static onPlayerReady(event) {
        // Verificar si AMBOS están listos
        if (AppState.player1 && typeof AppState.player1.getPlayerState === 'function' &&
            AppState.player2 && typeof AppState.player2.getPlayerState === 'function') {
            if (!AppState.playersInitialized) {
                AppState.playersInitialized = true;
                console.log("Ambos reproductores listos.");
                // Notificar al controlador principal
                window.dispatchEvent(new CustomEvent('playersReady'));
            }
        }

        // Iniciar monitor solo UNA VEZ cuando los players estén listos
        if (AppState.playersInitialized && !AppState.monitorInterval) {
            PlaybackController.startMonitoring();
        }
    }

    static onPlayerError(event) {
        console.error("Error del reproductor:", event.data, "Player:", event.target === AppState.player1 ? '1' : '2');
        let videoTitle = "este video";
        try {
            const videoData = event.target.getVideoData();
            if (videoData && videoData.title) {
                videoTitle = `"${videoData.title}"`;
            }
        } catch (e) { /* Ignorar si no se puede obtener */ }

        let errorMsg = `Ocurrió un error desconocido (${event.data}) al reproducir ${videoTitle}.`;
        switch (event.data) {
            case 2: errorMsg = `Error: ID de video inválido para ${videoTitle}.`; break;
            case 5: errorMsg = `Error al reproducir ${videoTitle}. (Posible problema de HTML5 o derechos).`; break;
            case 100: errorMsg = `Error: Video ${videoTitle} no encontrado.`; break;
            case 101:
            case 150: errorMsg = `Error: El propietario de ${videoTitle} no permite la reproducción incrustada.`; break;
        }
        mostrarMensajeFlotante(errorMsg);

        // Intentar saltar al siguiente si el error impide la reproducción
        if ([2, 5, 100, 101, 150].includes(event.data)) {
            console.log("Intentando saltar al siguiente video debido a error...");
            setTimeout(() => PlaybackController.playNextVideo(), 500);
        }
    }

    static onPlayerStateChange(event) {
        const playerState = event.data;
        const changedPlayerNum = event.target === AppState.player1 ? 1 : 2;
        const videoId = event.target.getVideoData()?.video_id;
        const playerInstance = event.target;

        if (playerState === YT.PlayerState.PLAYING) {
            console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO. Video: ${videoId || 'Unknown ID'}`);
            
            // Notificar al controlador principal sobre el cambio de estado
            window.dispatchEvent(new CustomEvent('playerStateChanged', {
                detail: {
                    playerNum: changedPlayerNum,
                    state: playerState,
                    videoId: videoId,
                    playerInstance: playerInstance
                }
            }));

            // Resetear flag hasOutroCrossfadeStarted cuando un NUEVO video comienza a reproducir
            AppState.hasOutroCrossfadeStarted = false;

            // Llamar a checkAndSkipSegment con forceCheck=true al entrar en estado PLAYING
            if (videoId) {
                SponsorBlockManager.checkAndSkipSegment(event.target, true);
            }

        } else if (playerState === YT.PlayerState.PAUSED) {
            console.log('onPlayerStateChange: Video pausado en Player', changedPlayerNum);
        } else if (playerState === YT.PlayerState.BUFFERING) {
            console.log(`onPlayerStateChange: Player ${changedPlayerNum} está BUFFERING. Video: ${videoId || 'Unknown ID'}`);
        } else if (playerState === YT.PlayerState.CUED) {
            console.log(`onPlayerStateChange: Player ${changedPlayerNum} está CUED. Video: ${videoId || 'Unknown ID'}`);
            
            // Manejo de reintento para estado CUED inesperado durante transición
            const intendedNextPlayerNum = AppState.currentPlayer === 1 ? 2 : 1;
            if (changedPlayerNum === intendedNextPlayerNum && AppState.isTransitioning) {
                console.warn(`onPlayerStateChange: Reproductor siguiente previsto (${changedPlayerNum}) entró en estado CUED inesperadamente.`);
                setTimeout(() => {
                    try {
                        if (playerInstance && typeof playerInstance.playVideo === 'function' && playerInstance.getPlayerState() === YT.PlayerState.CUED) {
                            console.log(`onPlayerStateChange: Reintentando playVideo() en Player ${changedPlayerNum}`);
                            playerInstance.playVideo();
                        }
                    } catch (e) { 
                        console.error("onPlayerStateChange: Error reintentando playVideo desde estado CUED:", e); 
                    }
                }, 500);
            }

        } else if (playerState === YT.PlayerState.ENDED) {
            console.log(`onPlayerStateChange: Player ${changedPlayerNum} estado ENDED. Video: ${videoId || 'Unknown ID'}`);
            
            // Notificar al controlador principal sobre el final del video
            window.dispatchEvent(new CustomEvent('playerEnded', {
                detail: {
                    playerNum: changedPlayerNum,
                    videoId: videoId
                }
            }));
        }
    }
}

// Función global requerida por la API de YouTube
window.onYouTubeIframeAPIReady = function() {
    YouTubeAPIManager.initializePlayers();
};
