//  Manejo del API de YouTube - CORREGIDO
import { AppState } from './config.js';
import { mostrarMensajeFlotante } from './messages.js';

export class YouTubeAPIManager {
    static loadYouTubeAPI() {
        if (AppState.youtubeAPIReady) {
            console.log('API de YouTube ya está lista, inicializando reproductores...');
            YouTubeAPIManager.initializePlayers();
            return;
        }
        
        // Verificar si YT ya está disponible
        if (typeof YT !== 'undefined' && YT.Player) {
            console.log('YT ya está disponible, inicializando directamente...');
            AppState.youtubeAPIReady = true;
            YouTubeAPIManager.initializePlayers();
            return;
        }
        
        console.log('Cargando script de YouTube API...');
        AppState.youtubeAPIReady = true;
        
        // Configurar callback global ANTES de cargar el script
        window.onYouTubeIframeAPIReady = function() {
            console.log('YouTube API lista, inicializando reproductores...');
            YouTubeAPIManager.initializePlayers();
        };
        
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onload = function() {
            console.log('Script de YouTube cargado');
            // Backup: si el callback no se ejecuta en 2 segundos, forzar inicialización
            setTimeout(() => {
                if (!AppState.playersInitialized) {
                    console.log('Forzando inicialización de reproductores...');
                    YouTubeAPIManager.initializePlayers();
                }
            }, 2000);
        };
        document.head.appendChild(script);
    }

    static initializePlayers() {
        // Verificar que los elementos existen
        const player1Element = document.getElementById('player1');
        const player2Element = document.getElementById('player2');
        
        if (!player1Element || !player2Element) {
            console.error('Elementos player1 o player2 no encontrados en el DOM');
            setTimeout(() => YouTubeAPIManager.initializePlayers(), 500);
            return;
        }
        
        if (AppState.player1 && AppState.player2) {
            console.log('Reproductores ya inicializados');
            return;
        }

        console.log('Inicializando reproductores YouTube...');
        console.log('Elemento player1:', player1Element);
        console.log('Elemento player2:', player2Element);

        try {
            AppState.player1 = new YT.Player('player1', {
                height: '315',
                width: '560',
                playerVars: {
                    'playsinline': 1,
                    'controls': 1,
                    'modestbranding': 0,
                    'rel': 0,
                    'showinfo': 1,
                    'enablejsapi': 1,
                    'origin': window.location.origin,
                    'autoplay': 0,
                    'mute': 0
                },
                events: {
                    'onReady': YouTubeAPIManager.onPlayerReady,
                    'onStateChange': YouTubeAPIManager.onPlayerStateChange,
                    'onError': YouTubeAPIManager.onPlayerError
                }
            });

            AppState.player2 = new YT.Player('player2', {
                height: '315',
                width: '560',
                playerVars: {
                    'playsinline': 1,
                    'controls': 1,
                    'modestbranding': 0,
                    'rel': 0,
                    'showinfo': 1,
                    'enablejsapi': 1,
                    'origin': window.location.origin,
                    'autoplay': 0,
                    'mute': 0
                },
                events: {
                    'onReady': YouTubeAPIManager.onPlayerReady,
                    'onStateChange': YouTubeAPIManager.onPlayerStateChange,
                    'onError': YouTubeAPIManager.onPlayerError
                }
            });
            
            console.log('Reproductores creados exitosamente');
            
        } catch (error) {
            console.error('Error creando reproductores:', error);
        }
    }

    static onPlayerReady(event) {
        console.log('onPlayerReady ejecutado para:', event.target.h.id);
        
        // Verificar si AMBOS están listos
        if (AppState.player1 && typeof AppState.player1.getPlayerState === 'function' &&
            AppState.player2 && typeof AppState.player2.getPlayerState === 'function') {
            if (!AppState.playersInitialized) {
                AppState.playersInitialized = true;
                console.log("🎉 AMBOS reproductores listos y funcionando!");
                // Notificar al controlador principal
                window.dispatchEvent(new CustomEvent('playersReady'));
            }
        } else {
            console.log('Esperando a que ambos reproductores estén listos...');
        }

        // Iniciar monitor solo UNA VEZ cuando los players estén listos
        if (AppState.playersInitialized && !AppState.monitorInterval) {
            console.log('Iniciando monitor de reproductores...');
            // Lazy load del PlaybackController para evitar dependencias circulares
            import('./playbackController.js').then(module => {
                if (module.PlaybackController && module.PlaybackController.startMonitoring) {
                    module.PlaybackController.startMonitoring();
                }
            }).catch(error => {
                console.warn('Error cargando PlaybackController:', error);
            });
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
            // Lazy load del PlaybackController
            setTimeout(() => {
                import('./playbackController.js').then(module => {
                    if (module.PlaybackController && module.PlaybackController.playNextVideo) {
                        module.PlaybackController.playNextVideo();
                    }
                }).catch(error => {
                    console.warn('Error cargando PlaybackController para skip:', error);
                });
            }, 500);
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
                // Lazy load del SponsorBlockManager
                import('./sponsorblock.js').then(module => {
                    if (module.SponsorBlockManager && module.SponsorBlockManager.checkAndSkipSegment) {
                        module.SponsorBlockManager.checkAndSkipSegment(event.target, true);
                    }
                }).catch(error => {
                    console.warn('Error cargando SponsorBlockManager:', error);
                });
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
