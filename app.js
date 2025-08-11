// Controlador Principal Modular
import { CONFIG, AppState, PlaylistState, SearchState, SponsorBlockState } from './config.js';
import { YouTubeAPIManager } from './youtubeAPI.js';
import { PlaylistManager } from './playlistManager.js';
import { SearchManager } from './searchManager.js';
import { PlaybackController } from './playbackController.js';
import { SponsorBlockManager } from './sponsorblock.js';
import { UIManager, mostrarMensajeFlotante } from './ui.js';
import { Utils } from './utils.js';

class App {
    constructor() {
        this.initialized = false;
        this.authInitialized = false;
        this.setupGlobalReferences();
    }

    // Configurar referencias globales para compatibilidad
    setupGlobalReferences() {
        // Hacer disponibles las clases y estados globalmente para módulos que los necesiten
        window.appState = AppState;
        window.playlistState = PlaylistState;
        window.searchState = SearchState;
        window.sponsorBlockState = SponsorBlockState;
        
        // Referencias globales para funciones que se llaman desde HTML
        window.onYouTubeIframeAPIReady = () => YouTubeAPIManager.initializePlayers();
    }

    // Inicialización principal de la aplicación
    async init() {
        if (this.initialized) {
            console.warn('App already initialized');
            return;
        }

        try {
            console.log('Iniciando YT CrossMix...');
            
            // 1. Inicializar playlist manual si no existe
            this.initializeManualPlaylist();
            
            // 2. Configurar event listeners globales
            this.setupGlobalEventListeners();
            
            // 3. Inicializar módulos
            await this.initializeModules();
            
            // 4. Configurar controles de la interfaz
            this.setupUIControls();
            
            // 5. Cargar API de YouTube
            YouTubeAPIManager.loadYouTubeAPI();
            
            // 6. Mostrar mensaje de bienvenida inicial (opcional)
            this.showWelcomeMessage();
            
            this.initialized = true;
            console.log('YT CrossMix inicializado correctamente');
            
        } catch (error) {
            console.error('Error durante la inicialización:', error);
            mostrarMensajeFlotante('Error al inicializar la aplicación');
        }
    }

    // Inicializar playlist manual por defecto
    initializeManualPlaylist() {
        if (!PlaylistState.playlistsData.some(p => p.id === 'manual')) {
            PlaylistState.playlistsData.push({
                id: 'manual',
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: 'https://mix-yt.netlify.app/electronic.ico',
                videos: [],
                isExpanded: true
            });
            console.log('Playlist manual inicializada');
        }
    }

    // Configurar listeners de eventos globales
    setupGlobalEventListeners() {
        // Event listeners para YouTube Library
        document.addEventListener('playlistsFetched', (event) => {
            console.log("Evento 'playlistsFetched' recibido con", event.detail.length, "playlists");
            PlaylistManager.addYouTubeLibraryPlaylists(event.detail);
        });

        document.addEventListener('userLoggedOut', () => {
            console.log("Evento 'userLoggedOut' recibido");
            PlaylistManager.clearYouTubeLibraryPlaylists();
            mostrarMensajeFlotante("Sesión cerrada. Se eliminaron las playlists de YouTube.");
        });

        // Event listeners para estados de reproductores
        window.addEventListener('playersReady', () => {
            const flatList = PlaylistManager.getFlattenedPlaylist();
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.disabled = flatList.length === 0;
            }
            console.log('Reproductores listos, botón Play configurado');
        });

        window.addEventListener('playerStateChanged', (event) => {
            this.handlePlayerStateChanged(event.detail);
        });

        window.addEventListener('playerEnded', (event) => {
            this.handlePlayerEnded(event.detail);
        });

        // Cerrar menús al hacer click fuera
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.delete-menu')) {
                UIManager.closeAllContextMenus();
            }
            if (!event.target.closest('.playlist-selection-popup-menu')) {
                UIManager.closePlaylistSelectionPopups();
            }
        }, true);

        // Listener para cuando la página esté completamente cargada
        window.addEventListener('load', () => {
            this.checkGoogleTokenOnLoad();
        });

        // Listener personalizado para errores de autenticación
        document.addEventListener('authError', (event) => {
            console.error('Error de autenticación:', event.detail);
            mostrarMensajeFlotante('Error de autenticación: ' + event.detail.message);
        });

        // Listener para cambios en el estado de autenticación
        document.addEventListener('authStatusChanged', (event) => {
            const isAuthenticated = event.detail.isAuthenticated;
            console.log('Estado de autenticación cambió:', isAuthenticated);
            
            if (isAuthenticated) {
                mostrarMensajeFlotante('Autenticación exitosa');
            }
        });
    }

    // Inicializar módulos individuales
    async initializeModules() {
        try {
            // Inicializar búsqueda
            if (window.SearchManager) {
                SearchManager.initialize();
                console.log('SearchManager inicializado');
            } else {
                console.warn('SearchManager no disponible');
            }

            // Renderizar UI inicial de playlists
            UIManager.updatePlaylistsUI();
            console.log('UI inicial renderizada');

        } catch (error) {
            console.error('Error inicializando módulos:', error);
            throw error;
        }
    }

    // Configurar controles de interfaz
    setupUIControls() {
        this.setupPlayButton();
        this.setupNextButton();
        this.setupSearchInput();
        this.setupPlaylistUrlInput();
    }

    // Configurar botón Play/Pause principal
    setupPlayButton() {
        const botonPlay = document.getElementById("botonPlay");
        if (!botonPlay) {
            console.error('Botón Play no encontrado');
            return;
        }

        botonPlay.disabled = true;
        botonPlay.addEventListener('click', () => {
            const activePlayer = AppState.currentPlayer === 1 ? AppState.player1 : AppState.player2;
            
            if (!AppState.playersInitialized || !activePlayer) {
                mostrarMensajeFlotante("El reproductor no está listo.");
                return;
            }

            const playerState = activePlayer.getPlayerState();

            if (!AppState.reproduccionIniciada) {
                // Primer Play
                const flatList = PlaylistManager.getFlattenedPlaylist();
                if (flatList.length > 0) {
                    AppState.reproduccionIniciada = true;
                    if (window.PlaybackController) {
                        PlaybackController.playFirstVideo();
                    }
                    botonPlay.innerHTML = '<i class="fas fa-pause"></i>';
                } else {
                    mostrarMensajeFlotante("No hay videos en la lista para reproducir.");
                }
            } else {
                // Play/Pause después del inicio
                if (playerState === YT.PlayerState.PLAYING) {
                    activePlayer.pauseVideo();
                    botonPlay.innerHTML = '<i class="fas fa-play"></i>';
                    if (window.PlaybackController) {
                        PlaybackController.stopMonitoring();
                    }
                } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
                    activePlayer.playVideo();
                    botonPlay.innerHTML = '<i class="fas fa-pause"></i>';
                    if (window.PlaybackController) {
                        PlaybackController.startMonitoring();
                    }
                }
            }
        });
    }

    // Configurar botón Next
    setupNextButton() {
        const botonNext = document.getElementById('botonNext');
        if (!botonNext) {
            console.error('Botón Next no encontrado');
            return;
        }

        botonNext.addEventListener('click', () => {
            if (!AppState.reproduccionIniciada) {
                mostrarMensajeFlotante("Inicia la reproducción primero con el botón Play.");
                return;
            }
            console.log("Botón Mix/Next presionado.");
            if (window.PlaybackController) {
                PlaybackController.stopMonitoring();
                PlaybackController.playNextVideo();
                setTimeout(() => PlaybackController.startMonitoring(), 500);
            }
        });
    }

    // Configurar entrada de búsqueda
    setupSearchInput() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) {
            console.error('Input de búsqueda no encontrado');
            return;
        }

        if (!window.SearchManager) {
            console.error('SearchManager no disponible');
            return;
        }

        const debouncedSearch = SearchManager.createDebouncedSearch(500);

        searchInput.addEventListener('input', (event) => {
            const query = event.target.value.trim();
            if (query.length > 2) {
                debouncedSearch(query);
            } else {
                if (SearchState.resultsDiv) {
                    SearchState.resultsDiv.innerHTML = '';
                }
                SearchState.currentSearchQuery = '';
                SearchState.nextPageContext = null;
                SearchState.isLoadingMore = false;
                if (SearchManager.hideLoadMoreSpinner) {
                    SearchManager.hideLoadMoreSpinner();
                }
            }
        });
    }

    // Configurar entrada de URL de playlist
    setupPlaylistUrlInput() {
        const añadirUrlButton = document.getElementById('añadirUrlButton');
        const searchInput2 = document.getElementById('searchInput2');
        
        if (!añadirUrlButton || !searchInput2) {
            console.error('Controles de URL de playlist no encontrados');
            return;
        }

        añadirUrlButton.addEventListener('click', async () => {
            const url = searchInput2.value.trim();
            const playlistIdFromUrl = Utils.extractPlaylistId(url);

            if (!playlistIdFromUrl) {
                mostrarMensajeFlotante('URL de la playlist no válida.');
                return;
            }
            
            searchInput2.value = '';

            try {
                console.log('Cargando playlist...');
                const playlistInfo = await Utils.getPlaylistInfo(playlistIdFromUrl);
                if (playlistInfo) {
                    playlistInfo.id = playlistIdFromUrl;
                    await PlaylistManager.handlePlaylistLoaded(playlistInfo);
                }
            } catch (error) {
                console.error("Error en proceso de añadir URL:", error);
                mostrarMensajeFlotante('Error al cargar la playlist. Verifica la URL.');
            }
        });

        // Permitir presionar Enter para añadir playlist
        searchInput2.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                añadirUrlButton.click();
            }
        });
    }

    // Manejar cambios de estado del reproductor
    handlePlayerStateChanged(detail) {
        const { playerNum, state, videoId, playerInstance } = detail;
        
        if (state === YT.PlayerState.PLAYING) {
            const flatList = PlaylistManager.getFlattenedPlaylist();
            const playingVideoIndex = flatList.findIndex(v => v.videoId === videoId);

            if (videoId && playingVideoIndex !== -1) {
                const playingVideoObject = flatList[playingVideoIndex];
                PlaylistState.currentPlayingInfo.videoId = videoId;
                PlaylistState.currentPlayingInfo.playlistId = playingVideoObject.sourcePlaylistId;
                PlaylistState.currentPlayingInfo.flattenedIndex = playingVideoIndex;
                
                console.log(`Información de reproducción actualizada: índice ${playingVideoIndex} (Video: ${videoId})`);
                UIManager.updatePlaylistsUI();

                if (AppState.currentPlayer !== playerNum) {
                    console.log(`Estableciendo currentPlayer a ${playerNum}.`);
                    AppState.currentPlayer = playerNum;
                }

                if (AppState.isTransitioning) {
                    console.log(`Video conocido (${videoId}) comenzó a reproducir. Reseteando flag isTransitioning.`);
                    AppState.isTransitioning = false;
                }

                AppState.hasOutroCrossfadeStarted = false;

            } else if (videoId && playingVideoIndex === -1) {
                console.warn(`Video desconocido (${videoId}) comenzó a reproducir en Player ${playerNum}.`);
                PlaylistState.currentPlayingInfo.videoId = videoId;
                PlaylistState.currentPlayingInfo.playlistId = null;
                PlaylistState.currentPlayingInfo.flattenedIndex = -1;
                UIManager.updatePlaylistsUI();
                
                if (AppState.currentPlayer !== playerNum) {
                    AppState.currentPlayer = playerNum;
                }
                AppState.hasOutroCrossfadeStarted = false;
            }
        }
    }

    // Manejar final de reproducción
    handlePlayerEnded(detail) {
        const { playerNum, videoId } = detail;
        const endedVideoMatchesCurrent = (videoId && PlaylistState.currentPlayingInfo.videoId === videoId);

        if (endedVideoMatchesCurrent && !AppState.isTransitioning && !AppState.isAudioFading) {
            console.log(`Video actual (${videoId}) terminó inesperadamente. Intentando playNextVideo.`);
            if (window.PlaybackController) {
                PlaybackController.playNextVideo();
            }
        } else if (playerNum !== AppState.currentPlayer) {
            console.log(`Otro player ${playerNum} estado ENDED. Video: ${videoId}. (No es el reproductor activo actual)`);
        }
    }

    // Verificar token de Google al cargar
    checkGoogleTokenOnLoad() {
        const token = localStorage.getItem('google_token');
        if (token) {
            console.log('Token encontrado en localStorage al cargar la página');
            // La autenticación se maneja en auth.js
        } else {
            console.log('No hay token de Google disponible al cargar');
        }
    }

    // Mostrar mensaje de bienvenida
    showWelcomeMessage() {
        // Mostrar solo si no hay playlists cargadas (excepto la manual vacía)
        const hasLoadedPlaylists = PlaylistState.playlistsData.some(p => 
            p.id !== 'manual' || p.videos.length > 0
        );
        
        if (!hasLoadedPlaylists) {
            setTimeout(() => {
                mostrarMensajeFlotante("¡Bienvenido! Puedes añadir playlists de YouTube o cargar tu biblioteca personal.");
            }, 2000);
        }
    }

    // Método para reiniciar la aplicación
    reset() {
        console.log('Reiniciando aplicación...');
        
        // Detener reproducción
        if (window.PlaybackController) {
            PlaybackController.stopMonitoring();
        }
        
        if (AppState.player1) {
            try { AppState.player1.stopVideo(); } catch(e) { console.warn('Error deteniendo player1:', e); }
        }
        if (AppState.player2) {
            try { AppState.player2.stopVideo(); } catch(e) { console.warn('Error deteniendo player2:', e); }
        }

        // Limpiar estados
        AppState.reproduccionIniciada = false;
        AppState.isTransitioning = false;
        AppState.isAudioFading = false;
        AppState.hasOutroCrossfadeStarted = false;
        AppState.currentPlayer = 1;

        PlaylistState.currentPlayingInfo = {
            playlistId: null,
            videoId: null,
            flattenedIndex: -1
        };

        // Limpiar caché de SponsorBlock si está disponible
        if (window.SponsorBlockManager) {
            SponsorBlockManager.clearAllSegmentCache();
        }

        // Actualizar UI
        UIManager.updatePlaylistsUI();
        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.disabled = PlaylistManager.getFlattenedPlaylist().length === 0;
        }
        
        mostrarMensajeFlotante('Aplicación reiniciada correctamente');
        console.log('Aplicación reiniciada');
    }

    // Obtener estadísticas de la aplicación
    getStats() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        const playlistStats = PlaylistManager.getPlaylistStats();
        
        let sponsorBlockStats = {};
        if (window.SponsorBlockManager) {
            sponsorBlockStats = SponsorBlockManager.getCacheStats();
        }
        
        return {
            playlists: PlaylistState.playlistsData.length,
            totalVideos: flatList.length,
            currentVideo: PlaylistState.currentPlayingInfo.videoId,
            currentIndex: PlaylistState.currentPlayingInfo.flattenedIndex,
            isPlaying: AppState.reproduccionIniciada,
            playersInitialized: AppState.playersInitialized,
            youtubeAPIReady: AppState.youtubeAPIReady,
            playlistStats: playlistStats,
            sponsorBlock: sponsorBlockStats,
            authStatus: window.authManager?.getDebugInfo() || 'Not available'
        };
    }

    // Método para debugging
    debug() {
        console.log('=== YT CROSSMIX DEBUG INFO ===');
        console.log('App State:', AppState);
        console.log('Playlist State:', PlaylistState);
        console.log('Search State:', SearchState);
        console.log('SponsorBlock State:', SponsorBlockState);
        console.log('Comprehensive Stats:', this.getStats());
        
        if (window.authManager) {
            console.log('Auth Manager Debug:', window.authManager.getDebugInfo());
        }
        
        console.log('Available Global Objects:', {
            YouTubeAPIManager: !!window.YouTubeAPIManager,
            PlaylistManager: !!window.PlaylistManager,
            SearchManager: !!window.SearchManager,
            PlaybackController: !!window.PlaybackController,
            SponsorBlockManager: !!window.SponsorBlockManager,
            UIManager: !!window.UIManager,
            Utils: !!window.Utils,
            authManager: !!window.authManager
        });
        
        console.log('==============================');
        
        // Mostrar información también en la UI
        const stats = this.getStats();
        mostrarMensajeFlotante(`Debug: ${stats.playlists} playlists, ${stats.totalVideos} videos totales. Ver consola para más detalles.`);
    }

    // Método para obtener información de salud del sistema
    getHealthCheck() {
        const health = {
            app: {
                initialized: this.initialized,
                authInitialized: this.authInitialized
            },
            youtube: {
                apiReady: AppState.youtubeAPIReady,
                playersInitialized: AppState.playersInitialized,
                player1Ready: !!AppState.player1,
                player2Ready: !!AppState.player2
            },
            data: {
                playlists: PlaylistState.playlistsData.length,
                videos: PlaylistManager.getFlattenedPlaylist().length,
                currentPlaying: !!PlaylistState.currentPlayingInfo.videoId
            },
            modules: {
                YouTubeAPIManager: typeof YouTubeAPIManager !== 'undefined',
                PlaylistManager: typeof PlaylistManager !== 'undefined',
                SearchManager: typeof window.SearchManager !== 'undefined',
                PlaybackController: typeof window.PlaybackController !== 'undefined',
                SponsorBlockManager: typeof window.SponsorBlockManager !== 'undefined',
                UIManager: typeof UIManager !== 'undefined',
                Utils: typeof Utils !== 'undefined'
            },
            auth: window.authManager?.getDebugInfo() || null
        };

        return health;
    }
}

// Crear instancia global de la aplicación
const app = new App();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    app.init().catch(error => {
        console.error('Error fatal inicializando la aplicación:', error);
        mostrarMensajeFlotante('Error fatal al inicializar. Recarga la página.');
    });
});

// Exportar para uso global si es necesario
window.YTCrossMixApp = app;

// Funciones globales para compatibilidad con HTML existente
window.mostrarMensajeFlotante = mostrarMensajeFlotante;

// Exportar módulos principales para uso externo
export {
    App,
    YouTubeAPIManager,
    PlaylistManager,
    SearchManager,
    PlaybackController,
    SponsorBlockManager,
    UIManager,
    Utils
};
