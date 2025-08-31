// ===== CORE.JS - SISTEMA UNIFICADO MEJORADO =====
// Combina las mejores funciones del backup con la arquitectura actual

// ===== CONFIGURACIÓN Y CONSTANTES =====
const CONFIG = {
    CROSSFADE_DURATION: 15, // segundos
    MONITOR_INTERVAL: 300, // ms
    PIPED_INSTANCES: [
        "https://api.piped.private.coffee",
        "https://pipedapi.ducks.party"
    ],
    YOUTUBE_LIBRARY_SOURCE_ID: 'youtube_library',
    SPONSORBLOCK_USER_ID: 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd'
};

// ===== ESTADO UNIFICADO MEJORADO =====
class UnifiedStateManager {
    constructor() {
        this.state = {
            app: {
                // ✅ Del backup: Estados críticos de reproductores
                player1: null,
                player2: null,
                currentPlayer: 1,
                playersInitialized: false,
                youtubeAPIReady: false,
                reproduccionIniciada: false,
                
                // ✅ Del backup: Estados de transición mejorados
                isTransitioning: false,
                isAudioFading: false,
                hasOutroCrossfadeStarted: false,
                crossfadeInProgress: false,
                crossfadeInterval: null,
                monitorInterval: null
            },
            playlist: {
                playlistsData: [],
                currentPlayingInfo: {
                    playlistId: null,
                    videoId: null,
                    flattenedIndex: -1
                }
            },
            search: {
                currentSearchQuery: '',
                nextPageContext: null,
                isLoadingMore: false,
                resultsContainer: null,
                resultsDiv: null
            },
            sponsorBlock: {
                segmentosCache: {},
                lastSeekEndTime: -1,
                lastSeekVideoId: null
            },
            auth: {
                isAuthenticated: false,
                token: null
            },
            ui: {
                currentView: 'home'
            }
        };
        
        this.listeners = new Set();
        this.debug = window.location.hostname === 'localhost';
    }

    get(path) {
        const keys = path.split('.');
        let current = this.state;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return undefined;
            }
        }
        
        return current;
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.state;
        
        for (const key of keys) {
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }
        
        const oldValue = current[lastKey];
        current[lastKey] = value;
        
        // Emit change event
        this.notifyChange(path, value, oldValue);
        
        if (this.debug) {
            console.log(`📊 Estado cambiado: ${path}`, value);
        }
    }

    notifyChange(path, newValue, oldValue) {
        const event = new CustomEvent('ytcrossmix:state:changed', {
            detail: { path, newValue, oldValue }
        });
        window.dispatchEvent(event);
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}

// ===== REPRODUCTORES YOUTUBE MEJORADOS =====
class UnifiedYouTubeManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.apiReady = false;
        this.playersReady = false;
    }

    async initialize() {
        console.log('📺 Inicializando YouTube Manager Unificado...');
        
        // Esperar a que la API esté disponible
        await this.waitForYouTubeAPI();
        
        // Crear reproductores
        this.createPlayers();
    }

    waitForYouTubeAPI() {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                this.apiReady = true;
                resolve();
                return;
            }

            // Setup global callback
            window.onYouTubeIframeAPIReady = () => {
                this.apiReady = true;
                console.log('✅ YouTube API Ready');
                resolve();
            };

            // Load API if not already loading
            if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
                const script = document.createElement('script');
                script.src = 'https://www.youtube.com/iframe_api';
                script.async = true;
                document.head.appendChild(script);
            }
        });
    }

    createPlayers() {
        if (this.playersReady) return;

        console.log('🎮 Creando reproductores YouTube...');

        const player1 = new YT.Player('player1', {
            height: '100%',
            width: '100%',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'showinfo': 0,
                'rel': 0,
                'iv_load_policy': 3
            },
            events: {
                'onReady': (event) => this.onPlayerReady(event, 1),
                'onStateChange': (event) => this.onPlayerStateChange(event, 1),
                'onError': (event) => this.onPlayerError(event, 1)
            }
        });

        const player2 = new YT.Player('player2', {
            height: '100%',
            width: '100%',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'showinfo': 0,
                'rel': 0,
                'iv_load_policy': 3
            },
            events: {
                'onReady': (event) => this.onPlayerReady(event, 2),
                'onStateChange': (event) => this.onPlayerStateChange(event, 2),
                'onError': (event) => this.onPlayerError(event, 2)
            }
        });

        // Guardar en estado
        this.state.set('app.player1', player1);
        this.state.set('app.player2', player2);
    }

    onPlayerReady(event, playerNum) {
        console.log(`✅ Player ${playerNum} listo`);
        
        const player1Ready = this.state.get('app.player1') && 
                           typeof this.state.get('app.player1').getPlayerState === 'function';
        const player2Ready = this.state.get('app.player2') && 
                           typeof this.state.get('app.player2').getPlayerState === 'function';

        if (player1Ready && player2Ready && !this.playersReady) {
            this.playersReady = true;
            this.state.set('app.playersInitialized', true);
            
            console.log('🎉 Ambos reproductores listos');
            
            // Habilitar controles
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.disabled = false;
            }

            // Dispatch event
            document.dispatchEvent(new CustomEvent('playersReady', {
                detail: { player1Ready, player2Ready }
            }));

            // Inicializar PlaylistManager si está disponible
            if (window.PlaylistManager?.initializeManualPlaylist) {
                window.PlaylistManager.initializeManualPlaylist();
            }
        }
    }

    onPlayerStateChange(event, playerNum) {
        const state = event.data;
        const videoData = event.target.getVideoData();
        
        console.log(`🔄 Player ${playerNum} state: ${state} (Video: ${videoData?.video_id})`);

        // ✅ Del backup: Reset flag de outro cuando nuevo video empieza
        if (state === YT.PlayerState.PLAYING) {
            this.state.set('app.hasOutroCrossfadeStarted', false);
            
            // Actualizar info de reproducción
            if (window.PlaylistManager?.updateCurrentPlayingIndex) {
                window.PlaylistManager.updateCurrentPlayingIndex();
            }
        }

        // Dispatch unified event
        document.dispatchEvent(new CustomEvent('unifiedPlayerStateChanged', {
            detail: { 
                playerNum, 
                state, 
                videoId: videoData?.video_id,
                timestamp: Date.now()
            }
        }));
    }

    onPlayerError(event, playerNum) {
        console.error(`❌ Player ${playerNum} error:`, event.data);
        
        window.unifiedMessageManager?.show(
            `Error en reproductor ${playerNum}`, 
            'error'
        );
    }

    // ✅ Del backup: Métodos de utilidad para reproductores
    getActivePlayer() {
        const currentPlayerNum = this.state.get('app.currentPlayer');
        return currentPlayerNum === 1 ? 
               this.state.get('app.player1') : 
               this.state.get('app.player2');
    }

    getInactivePlayer() {
        const currentPlayerNum = this.state.get('app.currentPlayer');
        return currentPlayerNum === 1 ? 
               this.state.get('app.player2') : 
               this.state.get('app.player1');
    }

    // ✅ Del backup: Crossfade mejorado
    async performCrossfade(prevPlayer, nextPlayer) {
        if (this.state.get('app.crossfadeInProgress')) {
            console.log("Crossfade ya en progreso, ignorando nueva llamada.");
            return;
        }
        
        this.state.set('app.crossfadeInProgress', true);
        this.state.set('app.isAudioFading', true);
        
        const DURATION_MS = CONFIG.CROSSFADE_DURATION * 1000;
        const FPS = 60;
        const STEP_MS = 1000 / FPS;
        const STEPS = Math.ceil(DURATION_MS / STEP_MS);

        let step = 0;
        const prevStartVol = this.safeGetVolume(prevPlayer, 100);
        const nextStartVol = this.safeGetVolume(nextPlayer, 0);

        console.log(`🎵 Iniciando crossfade: ${prevStartVol}% → 0% | 0% → 100% (${DURATION_MS}ms)`);

        // Limpiar crossfade anterior
        if (this.state.get('app.crossfadeInterval')) {
            clearInterval(this.state.get('app.crossfadeInterval'));
        }

        const interval = setInterval(() => {
            step++;
            
            const progress = step / STEPS;
            const easedProgress = this.easeInOutCubic(progress);
            
            const prevVol = Math.max(0, Math.round(prevStartVol * (1 - easedProgress)));
            const nextVol = Math.min(100, Math.round(nextStartVol + ((100 - nextStartVol) * easedProgress)));

            this.safeSetVolume(prevPlayer, prevVol);
            this.safeSetVolume(nextPlayer, nextVol);

            if (step % Math.floor(STEPS / 10) === 0 || step === STEPS) {
                console.log(`Crossfade ${Math.round(progress * 100)}%: Prev=${prevVol}%, Next=${nextVol}%`);
            }

            if (step >= STEPS) {
                clearInterval(interval);
                this.state.set('app.crossfadeInterval', null);
                
                // Finalizar crossfade
                this.safeSetVolume(prevPlayer, 0);
                this.safeSetVolume(nextPlayer, 100);
                
                setTimeout(() => {
                    this.safeStopPlayer(prevPlayer);
                }, 100);
                
                this.state.set('app.isAudioFading', false);
                this.state.set('app.crossfadeInProgress', false);
                console.log("✅ Crossfade completado.");
            }
        }, STEP_MS);

        this.state.set('app.crossfadeInterval', interval);
    }

    // ✅ Del backup: Funciones seguras para manejo de players
    safeGetVolume(player, defaultVol = 100) {
        try {
            if (player && typeof player.getVolume === 'function') {
                const vol = player.getVolume();
                return (vol !== null && !isNaN(vol) && vol >= 0) ? vol : defaultVol;
            }
        } catch(e) {
            console.warn("Error obteniendo volumen:", e);
        }
        return defaultVol;
    }

    safeSetVolume(player, volume) {
        try {
            if (player && typeof player.setVolume === 'function') {
                player.setVolume(Math.max(0, Math.min(100, volume)));
            }
        } catch(e) {
            console.warn("Error configurando volumen:", e);
        }
    }

    safeStopPlayer(player) {
        try {
            if (player && typeof player.stopVideo === 'function') {
                const state = player.getPlayerState();
                if (state !== YT.PlayerState.ENDED && state !== YT.PlayerState.UNSTARTED) {
                    player.stopVideo();
                }
            }
        } catch(e) {
            console.warn("Error deteniendo reproductor:", e);
        }
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }
}

// ===== GESTOR DE REPRODUCCIÓN MEJORADO =====
class UnifiedPlaybackController {
    constructor(stateManager, youtubeManager) {
        this.state = stateManager;
        this.youtube = youtubeManager;
    }

    // ✅ Del backup: Monitoreo optimizado
    startMonitoring() {
        if (!this.state.get('app.monitorInterval')) {
            const interval = setInterval(() => this.monitorPlayers(), CONFIG.MONITOR_INTERVAL);
            this.state.set('app.monitorInterval', interval);
            console.log(`🔍 Monitoreo iniciado (${CONFIG.MONITOR_INTERVAL}ms)`);
        }
    }

    stopMonitoring() {
        const interval = this.state.get('app.monitorInterval');
        if (interval) {
            clearInterval(interval);
            this.state.set('app.monitorInterval', null);
            console.log('⏹️ Monitoreo detenido');
        }
    }

    // ✅ Del backup: Monitor de reproductores robusto
    monitorPlayers() {
        if (!this.state.get('app.playersInitialized') || 
            !this.state.get('app.reproduccionIniciada')) {
            return;
        }

        const activePlayer = this.youtube.getActivePlayer();
        if (!this.validatePlayer(activePlayer)) {
            console.warn("Monitor: Reproductor activo inválido");
            this.stopMonitoring();
            return;
        }

        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoId = activePlayer.getVideoData()?.video_id;

        if (!videoId || isNaN(videoDuration) || videoDuration <= 0) {
            this.checkSponsorBlock(activePlayer);
            return;
        }

        // SponsorBlock check
        this.checkSponsorBlock(activePlayer);

        // ✅ Del backup: Lógica de crossfade mejorada
        const timeRemaining = videoDuration - currentTime;
        
        if (playerState === YT.PlayerState.PLAYING &&
            timeRemaining <= CONFIG.CROSSFADE_DURATION + 0.5 &&
            timeRemaining > 0 &&
            !this.state.get('app.hasOutroCrossfadeStarted') &&
            !this.state.get('app.crossfadeInProgress')) {
            
            console.log(`🎵 Tiempo restante: ${timeRemaining.toFixed(1)}s - Iniciando crossfade`);
            this.playNextVideo();
        }

        // ✅ Del backup: Salvaguarda para reproductores inactivos
        this.checkInactivePlayer();
    }

    validatePlayer(player) {
        return player &&
               typeof player.getPlayerState === 'function' &&
               typeof player.getCurrentTime === 'function' &&
               typeof player.getDuration === 'function' &&
               typeof player.getVideoData === 'function';
    }

    checkInactivePlayer() {
        if (this.state.get('app.crossfadeInProgress')) return;

        const inactivePlayer = this.youtube.getInactivePlayer();
        if (this.validatePlayer(inactivePlayer)) {
            const inactiveState = inactivePlayer.getPlayerState();
            if (inactiveState === YT.PlayerState.PLAYING) {
                console.warn("🛑 Reproductor inactivo detectado reproduciendo - deteniéndolo");
                this.youtube.safeStopPlayer(inactivePlayer);
            }
        }
    }

    checkSponsorBlock(player) {
        if (window.SponsorBlockManager?.checkAndSkipSegment) {
            window.SponsorBlockManager.checkAndSkipSegment(player);
        }
    }

    // ✅ Del backup: playFirstVideo robusto
    playFirstVideo() {
        if (!this.state.get('app.playersInitialized')) {
            console.error('❌ Reproductores no inicializados');
            return;
        }

        this.stopMonitoring();
        this.state.set('app.isTransitioning', false);

        const flatList = this.getFlattenedPlaylist();
        if (flatList.length === 0) {
            this.handleEmptyPlaylist();
            return;
        }

        const firstVideo = flatList[0];
        
        // Actualizar estado
        this.state.set('playlist.currentPlayingInfo.flattenedIndex', 0);
        this.state.set('playlist.currentPlayingInfo.videoId', firstVideo.videoId);
        this.state.set('playlist.currentPlayingInfo.playlistId', firstVideo.sourcePlaylistId);

        console.log('▶️ Reproduciendo primer video:', firstVideo.videoId);

        try {
            const player1 = this.state.get('app.player1');
            const player2 = this.state.get('app.player2');
            
            if (player2) this.youtube.safeStopPlayer(player2);
            
            player1.loadVideoById(firstVideo.videoId);
            player1.setVolume(100);

            // UI updates
            document.getElementById('player1')?.classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2')?.classList.add('hidden');
            
            this.state.set('app.currentPlayer', 1);
            this.state.set('app.reproduccionIniciada', true);

            // Update play button
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-pause"></i>';
                playButton.disabled = false;
            }

            this.startMonitoring();

            // Update UI
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }

        } catch (error) {
            console.error("❌ Error iniciando primer video:", error);
            this.handlePlaybackError(error);
        }
    }

    // ✅ Del backup: playNextVideo con lógica mejorada
    async playNextVideo() {
        const currentFlatIndex = this.state.get('playlist.currentPlayingInfo.flattenedIndex');
        const flatList = this.getFlattenedPlaylist();

        console.log(`⏭️ playNextVideo: índice ${currentFlatIndex}, transición=${this.state.get('app.isTransitioning')}`);
        
        if (this.state.get('app.isTransitioning') && this.state.get('app.crossfadeInProgress')) {
            console.log("🔄 Transición en progreso, ignorando llamada duplicada");
            return;
        }
        
        this.state.set('app.isTransitioning', true);

        if (flatList.length === 0) {
            this.handleEmptyPlaylist();
            return;
        }

        let nextIndex = currentFlatIndex + 1;
        if (nextIndex >= flatList.length) {
            this.handleEndOfPlaylist();
            return;
        }

        try {
            const nextVideo = flatList[nextIndex];
            if (!nextVideo?.videoId) {
                throw new Error(`Video siguiente inválido en índice ${nextIndex}`);
            }

            // ✅ Del backup: Preparar transición
            const currentPlayerNum = this.state.get('app.currentPlayer');
            const nextPlayerNum = currentPlayerNum === 1 ? 2 : 1;
            const prevPlayer = this.youtube.getActivePlayer();
            const nextPlayer = this.youtube.getInactivePlayer();

            if (!this.validatePlayer(prevPlayer) || !this.validatePlayer(nextPlayer)) {
                throw new Error("Reproductores inválidos para crossfade");
            }

            // Preparar siguiente video
            console.log(`🎬 Cargando video: ${nextVideo.videoId}`);
            nextPlayer.cueVideoById(nextVideo.videoId);
            
            // Configurar volúmenes iniciales
            this.youtube.safeSetVolume(prevPlayer, this.youtube.safeGetVolume(prevPlayer, 100));
            this.youtube.safeSetVolume(nextPlayer, 0);

            // Actualizar estado de reproducción
            this.state.set('playlist.currentPlayingInfo.flattenedIndex', nextIndex);
            this.state.set('playlist.currentPlayingInfo.videoId', nextVideo.videoId);
            this.state.set('playlist.currentPlayingInfo.playlistId', nextVideo.sourcePlaylistId);

            // Update UI
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }

            // ✅ Del backup: Transiciones visuales
            this.applyVisualTransitions(currentPlayerNum, nextPlayerNum);

            // Iniciar reproducción del siguiente
            await this.playNextPlayer(nextPlayer);

            // ✅ Del backup: Delay antes del crossfade para asegurar reproducción
            setTimeout(() => {
                const nextPlayerState = nextPlayer.getPlayerState();
                if (nextPlayerState === YT.PlayerState.PLAYING) {
                    this.youtube.performCrossfade(prevPlayer, nextPlayer);
                } else {
                    console.warn(`⚠️ Reproductor siguiente no está reproduciendo, retrasando crossfade...`);
                    setTimeout(() => this.youtube.performCrossfade(prevPlayer, nextPlayer), 200);
                }
            }, 150);

            // Configurar limpieza post-transición
            this.setupTransitionCleanup(currentPlayerNum, nextPlayerNum);

        } catch (error) {
            console.error("💥 Error crítico en playNextVideo:", error);
            this.handleCriticalError(error, currentFlatIndex);
        }
    }

    applyVisualTransitions(currentPlayerNum, nextPlayerNum) {
        const currentEl = document.getElementById(`player${currentPlayerNum}`);
        const nextEl = document.getElementById(`player${nextPlayerNum}`);

        if (currentEl) currentEl.classList.add('fade-out');
        if (nextEl) {
            nextEl.classList.remove('hidden', 'fade-out');
            nextEl.classList.add('fade-in');
        }
    }

    async playNextPlayer(nextPlayer) {
        try {
            if (nextPlayer && typeof nextPlayer.playVideo === 'function') {
                nextPlayer.playVideo();
                
                // Actualizar currentPlayer
                const nextPlayerNum = nextPlayer === this.state.get('app.player1') ? 1 : 2;
                this.state.set('app.currentPlayer', nextPlayerNum);
                
                console.log(`✅ Reproductor ${nextPlayerNum} iniciado`);
            } else {
                throw new Error("Fallo al iniciar reproductor siguiente");
            }
        } catch (error) {
            throw error;
        }
    }

    setupTransitionCleanup(currentPlayerNum, nextPlayerNum) {
        const currentEl = document.getElementById(`player${currentPlayerNum}`);
        const prevPlayer = currentPlayerNum === 1 ? 
                          this.state.get('app.player1') : 
                          this.state.get('app.player2');

        if (currentEl) {
            const transitionHandler = (event) => {
                if (event.propertyName !== 'opacity' || event.target !== currentEl) return;
                
                currentEl.removeEventListener('transitionend', transitionHandler);
                this.cleanupAfterTransition(prevPlayer, currentEl);
            };

            currentEl.addEventListener('transitionend', transitionHandler);
            
            // Fallback timeout
            setTimeout(() => {
                currentEl.removeEventListener('transitionend', transitionHandler);
                this.cleanupAfterTransition(prevPlayer, currentEl);
            }, CONFIG.CROSSFADE_DURATION * 1000 + 500);
        }
    }

    cleanupAfterTransition(prevPlayer, currentEl) {
        try {
            this.youtube.safeStopPlayer(prevPlayer);
            
            if (currentEl) {
                currentEl.classList.remove('fade-out', 'fade-in');
                currentEl.classList.add('hidden');
            }

            this.state.set('app.isTransitioning', false);
            console.log('🧹 Limpieza post-transición completada');
            
        } catch (error) {
            console.error("❌ Error en limpieza de transición:", error);
        }
    }

    // ✅ Del backup: Gestión de estados especiales
    handleEmptyPlaylist() {
        console.log("📭 Lista vacía detectada");
        
        this.stopMonitoring();
        this.state.set('app.reproduccionIniciada', false);
        this.state.set('app.isTransitioning', false);
        this.state.set('playlist.currentPlayingInfo.flattenedIndex', -1);
        this.state.set('playlist.currentPlayingInfo.videoId', null);
        this.state.set('playlist.currentPlayingInfo.playlistId', null);

        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.disabled = false;
        }

        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }

        window.unifiedMessageManager?.show(`Error cambiando video: ${error.message}`, 'error');
    }

    handlePlaybackError(error) {
        console.error("❌ Error de reproducción:", error);
        
        this.state.set('app.reproduccionIniciada', false);
        this.state.set('app.isTransitioning', false);
        
        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.disabled = true;
        }
        
        window.unifiedMessageManager?.show('Error de reproducción', 'error');
    }

    // ✅ Del backup: Obtener lista aplanada
    getFlattenedPlaylist() {
        if (window.PlaylistManager?.getFlattenedPlaylist) {
            return window.PlaylistManager.getFlattenedPlaylist();
        }
        
        // Fallback si PlaylistManager no está disponible
        const playlistsData = this.state.get('playlist.playlistsData') || [];
        let flatList = [];
        
        playlistsData.forEach(playlist => {
            if (playlist.videos && Array.isArray(playlist.videos)) {
                playlist.videos.forEach(video => {
                    flatList.push({ ...video, sourcePlaylistId: playlist.id });
                });
            }
        });
        
        return flatList;
    }
}

// ===== GESTOR DE BÚSQUEDA UNIFICADO =====
class UnifiedSearchManager {
    constructor(stateManager) {
        this.state = stateManager;
    }

    async initialize() {
        console.log('🔍 Inicializando Search Manager Unificado...');
        
        const searchResultsElement = document.getElementById('searchResults');
        if (searchResultsElement) {
            this.state.set('search.resultsContainer', searchResultsElement);
            this.state.set('search.resultsDiv', searchResultsElement);
            
            searchResultsElement.addEventListener('scroll', () => this.handleScroll());
            console.log('✅ Search Manager inicializado');
        }
    }

    // ✅ Del backup: Búsqueda con múltiples instancias y retry
    async performSearch(query, nextPage = null) {
        const resultsDiv = this.state.get('search.resultsDiv');
        if (!resultsDiv) return;

        if (!nextPage) {
            console.log(`🔍 Nueva búsqueda: ${query}`);
            this.state.set('search.currentSearchQuery', query);
            this.state.set('search.nextPageContext', null);
            resultsDiv.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i><p>Buscando...</p></div>';
        } else {
            console.log(`📄 Cargando más resultados: ${query}`);
            this.showLoadMoreSpinner();
        }

        this.state.set('search.isLoadingMore', true);

        // ✅ Del backup: Retry con múltiples instancias
        let searchResults = null;
        let lastError = null;

        for (const instance of CONFIG.PIPED_INSTANCES) {
            try {
                console.log(`📡 Intentando: ${instance}`);
                
                const searchUrl = this.buildSearchUrl(instance, query, nextPage);
                const response = await this.fetchWithTimeout(searchUrl, 15000);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                console.log(`✅ Búsqueda exitosa en ${instance}: ${data.items?.length || 0} resultados`);
                
                searchResults = data;
                break;
                
            } catch (error) {
                console.warn(`⚠️ Fallo en ${instance}: ${error.message}`);
                lastError = error;
                continue;
            }
        }

        if (searchResults) {
            this.displaySearchResults(searchResults, !!nextPage);
        } else {
            this.handleSearchError(lastError, !!nextPage);
        }
    }

    buildSearchUrl(instance, query, nextPage) {
        const url = new URL(`${instance}/search`);
        url.searchParams.set('q', query);
        url.searchParams.set('filter', 'videos');
        
        if (nextPage) {
            url.searchParams.set('nextpage', nextPage);
        }
        
        return url.toString();
    }

    async fetchWithTimeout(url, timeout = 15000) {
        return fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'YTCrossMix/2.0'
            },
            signal: AbortSignal.timeout(timeout)
        });
    }

    // ✅ Del backup: Display results mejorado
    displaySearchResults(results, append = false) {
        const resultsDiv = this.state.get('search.resultsDiv');
        if (!resultsDiv) return;
        
        if (!append) {
            resultsDiv.innerHTML = '';
        }
        
        const items = results.items || results.relatedStreams || [];
        
        if (!items || items.length === 0) {
            if (!append) {
                resultsDiv.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-search"></i>
                        <p>No se encontraron resultados para "${this.state.get('search.currentSearchQuery')}"</p>
                    </div>
                `;
            }
            this.state.set('search.nextPageContext', results?.nextpage || null);
            this.state.set('search.isLoadingMore', false);
            this.hideLoadMoreSpinner();
            return;
        }

        this.state.set('search.nextPageContext', results.nextpage || null);

        items.forEach(video => {
            const videoId = this.extractVideoId(video);
            if (!videoId) return;

            // Evitar duplicados en append
            if (append && resultsDiv.querySelector(`.video-result[data-video-id="${videoId}"]`)) {
                return;
            }

            const videoDiv = this.createVideoResultElement(video, videoId);
            resultsDiv.appendChild(videoDiv);
        });

        if (append) {
            this.hideLoadMoreSpinner();
        }
        
        this.state.set('search.isLoadingMore', false);
        console.log(`✅ ${items.length} resultados mostrados (${append ? 'append' : 'nuevo'})`);
    }

    // ✅ Del backup: Crear elemento de resultado mejorado
    createVideoResultElement(video, videoId) {
        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');
        
        const thumbnail = document.createElement('img');
        thumbnail.src = video.thumbnail || video.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        thumbnail.alt = video.title || 'Video';
        thumbnail.classList.add('thumbnail');
        thumbnail.loading = "lazy";
        
        thumbnail.onerror = function() {
            this.src = `https://img.youtube.com/vi/${videoId}/default.jpg`;
            this.onerror = function() {
                this.src = 'https://via.placeholder.com/320x180/333333/ffffff?text=Video';
            };
        };
        
        thumbnailContainer.appendChild(thumbnail);
        
        if (video.duration && video.duration > 0) {
            const durationSpan = document.createElement('span');
            durationSpan.textContent = this.formatDuration(video.duration);
            durationSpan.classList.add('duration');
            thumbnailContainer.appendChild(durationSpan);
        }
        
        videoDiv.appendChild(thumbnailContainer);

        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('video-details');
        
        const title = document.createElement('h3');
        title.textContent = video.title || 'Título no disponible';
        title.classList.add('video-title');
        detailsDiv.appendChild(title);
        
        const author = document.createElement('p');
        author.textContent = video.uploaderName || video.channelTitle || video.author || 'Autor Desconocido';
        author.classList.add('video-author');
        detailsDiv.appendChild(author);

        // ✅ Del backup: Botón mejorado con feedback visual
        const addButton = document.createElement('button');
        addButton.innerHTML = '<i class="fa-solid fa-arrow-right-to-line"></i><span class="add-text"> Reproducir Después</span>';
        addButton.classList.add('search-result-add-button');
        
        addButton.dataset.videoId = videoId;
        addButton.dataset.videoTitle = video.title || 'Título no disponible';
        addButton.dataset.videoThumbnail = thumbnail.src;
        addButton.dataset.videoDuration = this.parseDuration(video.duration);
        addButton.dataset.videoChannelTitle = video.uploaderName || video.channelTitle || 'Desconocido';
        
        addButton.addEventListener('click', (event) => {
            this.handleSearchResultAdd(event, {
                videoId: addButton.dataset.videoId,
                title: addButton.dataset.videoTitle,
                thumbnail: addButton.dataset.videoThumbnail,
                duration: parseInt(addButton.dataset.videoDuration, 10),
                channelTitle: addButton.dataset.videoChannelTitle
            });
        });
      
        detailsDiv.appendChild(addButton);
        videoDiv.appendChild(detailsDiv);
        
        return videoDiv;
    }

    // ✅ Del backup: Handle add con lógica inteligente
    handleSearchResultAdd(event, videoData) {
        event.preventDefault();
        event.stopPropagation();

        console.log("➕ Añadiendo desde búsqueda:", videoData.title);
        
        // ✅ Del backup: Lógica inteligente de añadir
        const playlistsData = this.state.get('playlist.playlistsData') || [];
        const userLoadedPlaylists = playlistsData.filter(p => 
            p.id !== 'manual' || (p.videos && p.videos.length > 0)
        );

        if (userLoadedPlaylists.length === 0) {
            // Añadir directamente a manual
            console.log("📋 No hay playlists, añadiendo a cola directamente");
            this.addToManualPlaylist(videoData);
        } else {
            // ✅ Mostrar selector de playlist (implementar después)
            console.log("📋 Múltiples playlists disponibles, añadiendo a cola por defecto");
            this.addToManualPlaylist(videoData);
        }

        // ✅ Del backup: Feedback visual en botón
        this.provideFeedback(event.currentTarget, videoData.title);
    }

    addToManualPlaylist(videoData) {
        if (window.PlaylistManager?.addVideoToManualPlaylist) {
            const result = window.PlaylistManager.addVideoToManualPlaylist(videoData);
            
            if (result) {
                window.unifiedMessageManager?.show(`♪ "${videoData.title}" añadido a la cola`, 'success', 2000);
                
                // Habilitar play button si es necesario
                this.checkAndEnablePlayButton();
            }
        }
    }

    provideFeedback(button, title) {
        const originalContent = button.innerHTML;
        const originalBg = button.style.background;
        
        button.innerHTML = '<i class="fas fa-check"></i> Añadido';
        button.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
        button.disabled = true;
        
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.style.background = originalBg;
            button.disabled = false;
        }, 2500);
    }

    checkAndEnablePlayButton() {
        const flatList = this.getFlattenedPlaylist();
        const playersReady = this.state.get('app.playersInitialized');
        
        const playButton = document.getElementById('botonPlay');
        if (playButton && flatList.length > 0 && playersReady) {
            playButton.disabled = false;
        }
    }

    // ✅ Utilidades del backup
    extractVideoId(video) {
        let videoId = video.videoId || video.id;
        
        if (!videoId && video.url) {
            const match = video.url.match(/(?:watch\?v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            videoId = match ? match[1] : null;
        }
        
        return videoId;
    }

    formatDuration(duration) {
        if (!duration || isNaN(duration)) return "0:00";
        
        if (typeof duration === 'string' && duration.includes(':')) {
            return duration;
        }
        
        const totalSeconds = typeof duration === 'number' ? duration : parseInt(duration, 10);
        if (isNaN(totalSeconds)) return "0:00";
        
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    parseDuration(duration) {
        if (typeof duration === 'number') {
            return Math.floor(duration);
        }
        
        if (typeof duration === 'string') {
            if (duration.includes(':')) {
                const parts = duration.split(':').map(p => parseInt(p, 10));
                if (parts.length === 2) {
                    return parts[0] * 60 + parts[1];
                } else if (parts.length === 3) {
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
            }
            
            const numDuration = parseInt(duration, 10);
            if (!isNaN(numDuration)) {
                return numDuration;
            }
        }
        
        return 0;
    }

    getFlattenedPlaylist() {
        if (window.PlaylistManager?.getFlattenedPlaylist) {
            return window.PlaylistManager.getFlattenedPlaylist();
        }
        return [];
    }

    handleScroll() {
        const searchState = this.state.get('search');
        
        if (searchState.isLoadingMore || 
            !searchState.nextPageContext || 
            !searchState.currentSearchQuery) {
            return;
        }
        
        const container = searchState.resultsContainer;
        if (!container) return;
        
        const scrollThreshold = 200;
        const scrollPosition = container.scrollTop + container.clientHeight;
        const totalHeight = container.scrollHeight;
        const bottomReached = scrollPosition >= totalHeight - scrollThreshold;
        
        if (bottomReached) {
            console.log("📄 Scroll cerca del final, cargando más...");
            this.performSearch(searchState.currentSearchQuery, searchState.nextPageContext);
        }
    }

    showLoadMoreSpinner() {
        const container = this.state.get('search.resultsContainer');
        if (!container) return;

        const existingSpinner = document.getElementById('search-more-spinner');
        if (existingSpinner) return;

        const spinner = document.createElement('div');
        spinner.id = 'search-more-spinner';
        spinner.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; padding: 20px; gap: 8px; color: #aaa;">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Cargando más resultados...</span>
            </div>
        `;
        
        container.appendChild(spinner);
    }

    hideLoadMoreSpinner() {
        const spinner = document.getElementById('search-more-spinner');
        if (spinner) {
            spinner.remove();
        }
    }

    handleSearchError(error, isLoadMore) {
        console.error("❌ Error en búsqueda:", error);
        
        const errorMessage = `Error de búsqueda: ${error?.message || 'Todas las instancias fallaron'}`;
        
        if (!isLoadMore) {
            const resultsDiv = this.state.get('search.resultsDiv');
            if (resultsDiv) {
                resultsDiv.innerHTML = `
                    <div class="search-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${errorMessage}</p>
                        <button onclick="window.unifiedCore.searchManager.performSearch('${this.state.get('search.currentSearchQuery')}')" 
                                class="retry-search-btn">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                    </div>
                `;
            }
        } else {
            window.unifiedMessageManager?.show(errorMessage, 'error');
            this.hideLoadMoreSpinner();
        }
        
        this.state.set('search.isLoadingMore', false);
    }
}

// ===== GESTOR DE PLAYLIST UNIFICADO =====
class UnifiedPlaylistManager {
    constructor(stateManager) {
        this.state = stateManager;
    }

    initialize() {
        console.log('📋 Inicializando Playlist Manager Unificado...');
        this.initializeManualPlaylist();
    }

    // ✅ Del backup: Inicializar playlist manual
    initializeManualPlaylist() {
        const playlistsData = this.state.get('playlist.playlistsData') || [];
        
        const existingManual = playlistsData.find(p => p.id === 'manual');
        
        if (!existingManual) {
            const manualPlaylist = {
                id: 'manual',
                name: 'Cola de Reproducción',
                thumbnailUrl: '/electronic.ico',
                videos: [],
                isExpanded: false,
                source: 'manual',
                isLoaded: true,
                itemCount: 0
            };
            
            const updatedPlaylists = [manualPlaylist, ...playlistsData];
            this.state.set('playlist.playlistsData', updatedPlaylists);
            console.log('✅ Cola de reproducción inicializada');
        }
    }

    // ✅ Del backup: Obtener lista aplanada mejorada
    getFlattenedPlaylist() {
        const playlistsData = this.state.get('playlist.playlistsData') || [];
        let flatList = [];
        
        // Solo incluir playlist manual para reproducción
        const manualPlaylist = playlistsData.find(p => p.id === 'manual');
        
        if (manualPlaylist && manualPlaylist.videos && Array.isArray(manualPlaylist.videos)) {
            manualPlaylist.videos.forEach(video => {
                flatList.push({ 
                    ...video, 
                    sourcePlaylistId: 'manual'
                });
            });
        }
        
        return flatList;
    }

    // ✅ Del backup: Añadir video con validación de duplicados
    addVideoToManualPlaylist(videoData) {
        const playlistsData = [...this.state.get('playlist.playlistsData')];
        let manualPlaylist = playlistsData.find(p => p.id === 'manual');

        if (!manualPlaylist) {
            this.initializeManualPlaylist();
            manualPlaylist = this.state.get('playlist.playlistsData').find(p => p.id === 'manual');
        }

        // ✅ Del backup: Verificar duplicados
        const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
        if (isDuplicate) {
            console.log('⚠️ Video duplicado:', videoData.title);
            window.unifiedMessageManager?.show(`"${videoData.title}" ya está en la cola`, 'warning');
            return null;
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || `https://img.youtube.com/vi/${videoData.videoId}/default.jpg`,
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || 'Desconocido',
            addedAt: Date.now()
        };

        // Actualizar playlist
        const updatedPlaylistsData = [...this.state.get('playlist.playlistsData')];
        const manualIndex = updatedPlaylistsData.findIndex(p => p.id === 'manual');
        
        if (manualIndex !== -1) {
            updatedPlaylistsData[manualIndex] = {
                ...updatedPlaylistsData[manualIndex],
                videos: [...updatedPlaylistsData[manualIndex].videos, videoObject],
                itemCount: updatedPlaylistsData[manualIndex].videos.length + 1
            };
            
            this.state.set('playlist.playlistsData', updatedPlaylistsData);
            
            console.log(`✅ Video añadido: "${videoObject.title}"`);
            return videoObject;
        }

        return null;
    }

    // ✅ Del backup: Actualizar índice de reproducción
    updateCurrentPlayingIndex() {
        const flatList = this.getFlattenedPlaylist();
        let playingVideoId = null;
        let activePlayerNum = null;

        try {
            const player1 = this.state.get('app.player1');
            const player2 = this.state.get('app.player2');
            
            if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = player1.getVideoData()?.video_id;
                activePlayerNum = 1;
            } else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = player2.getVideoData()?.video_id;
                activePlayerNum = 2;
            }
        } catch (e) {
            console.error("Error obteniendo datos de video:", e);
        }
        
        if (playingVideoId) {
            const currentInfo = this.state.get('playlist.currentPlayingInfo');
            if (currentInfo.videoId !== playingVideoId || currentInfo.flattenedIndex < 0) {
                const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
                if (newFlatIndex !== -1) {
                    this.state.set('playlist.currentPlayingInfo.videoId', playingVideoId);
                    this.state.set('playlist.currentPlayingInfo.playlistId', 'manual');
                    this.state.set('playlist.currentPlayingInfo.flattenedIndex', newFlatIndex);
                    
                    console.log(`🎵 Índice actualizado: ${newFlatIndex}`);
                    
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                }
            }

            if (activePlayerNum && this.state.get('app.currentPlayer') !== activePlayerNum) {
                this.state.set('app.currentPlayer', activePlayerNum);
            }
        } else {
            const currentInfo = this.state.get('playlist.currentPlayingInfo');
            if (currentInfo.flattenedIndex !== -1) {
                this.state.set('playlist.currentPlayingInfo.videoId', null);
                this.state.set('playlist.currentPlayingInfo.playlistId', null);
                this.state.set('playlist.currentPlayingInfo.flattenedIndex', -1);
                
                if (window.UIManager?.updatePlaylistsUI) {
                    window.UIManager.updatePlaylistsUI();
                }
            }
        }
    }
}

// ===== SISTEMA UNIFICADO PRINCIPAL =====
class YTCrossMixUnified {
    constructor() {
        this.initialized = false;
        this.stateManager = new UnifiedStateManager();
        this.youtubeManager = new UnifiedYouTubeManager(this.stateManager);
        this.playbackController = new UnifiedPlaybackController(this.stateManager, this.youtubeManager);
        this.searchManager = new UnifiedSearchManager(this.stateManager);
        this.playlistManager = new UnifiedPlaylistManager(this.stateManager);
        
        this.moduleLoader = null;
        this.setupGlobalReferences();
    }

    async initialize() {
        try {
            console.log('🚀 Inicializando YT CrossMix Sistema Unificado...');
            
            // Inicializar managers
            await this.youtubeManager.initialize();
            await this.searchManager.initialize();
            this.playlistManager.initialize();
            
            // Configurar controles
            this.setupControls();
            
            // Configurar búsqueda
            this.setupSearch();
            
            // Configurar playlist URL
            this.setupPlaylistURL();
            
            // Cargar otros módulos
            await this.loadModules();
            
            this.initialized = true;
            
            // Dispatch ready event
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:ready', {
                detail: { 
                    timestamp: Date.now(),
                    modules: this.getLoadedModules()
                }
            }));
            
            console.log('✅ Sistema Unificado inicializado exitosamente');
            
        } catch (error) {
            console.error('💥 Error inicializando sistema unificado:', error);
            
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:error', {
                detail: { error: error.message, timestamp: Date.now() }
            }));
            
            throw error;
        }
    }

    setupGlobalReferences() {
        // Referencias globales para compatibilidad
        window.unifiedStateManager = this.stateManager;
        window.unifiedYouTubeManager = this.youtubeManager;
        window.PlaybackController = this.playbackController;
        window.ytCrossMixUnified = this;
        
        // ✅ CONFIG global
        window.CONFIG = CONFIG;
        
        console.log('🔗 Referencias globales configuradas');
    }

    setupControls() {
        // ✅ Del backup: Setup botón play/pause con lógica robusta
        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.addEventListener('click', () => {
                const activePlayer = this.youtubeManager.getActivePlayer();
                const reproduccionIniciada = this.stateManager.get('app.reproduccionIniciada');
                
                if (!this.stateManager.get('app.playersInitialized') || !activePlayer) {
                    window.unifiedMessageManager?.show("Reproductores no están listos", 'warning');
                    return;
                }

                if (!reproduccionIniciada) {
                    // Primer play
                    const flatList = this.playlistManager.getFlattenedPlaylist();
                    if (flatList.length > 0) {
                        this.stateManager.set('app.reproduccionIniciada', true);
                        this.playbackController.playFirstVideo();
                        playButton.innerHTML = '<i class="fas fa-pause"></i>';
                    } else {
                        window.unifiedMessageManager?.show("No hay videos en la cola", 'warning');
                    }
                } else {
                    // Play/Pause
                    const playerState = activePlayer.getPlayerState();
                    if (playerState === YT.PlayerState.PLAYING) {
                        activePlayer.pauseVideo();
                        playButton.innerHTML = '<i class="fas fa-play"></i>';
                        this.playbackController.stopMonitoring();
                    } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
                        activePlayer.playVideo();
                        playButton.innerHTML = '<i class="fas fa-pause"></i>';
                        this.playbackController.startMonitoring();
                    }
                }
            });
        }

        // ✅ Botón Next
        const nextButton = document.getElementById('botonNext');
        if (nextButton) {
            nextButton.addEventListener('click', () => {
                if (!this.stateManager.get('app.reproduccionIniciada')) {
                    window.unifiedMessageManager?.show("Inicia la reproducción primero", 'warning');
                    return;
                }
                
                console.log("⏭️ Botón Next presionado");
                this.playbackController.stopMonitoring();
                this.playbackController.playNextVideo();
                setTimeout(() => this.playbackController.startMonitoring(), 500);
            });
        }

        console.log('🎮 Controles configurados');
    }

    // ✅ Del backup: Setup búsqueda con debounce
    setupSearch() {
        const searchInputs = [
            'sidebarSearchInput',
            'mobileSearchInput', 
            'searchInput'
        ];

        const debouncedSearch = this.debounce((query) => {
            if (query.length > 2) {
                this.searchManager.performSearch(query);
                
                // Switch to search view
                if (window.UIManager?.switchView) {
                    window.UIManager.switchView('search');
                }
            }
        }, 500);

        searchInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', (event) => {
                    const query = event.target.value.trim();
                    if (query.length > 2) {
                        debouncedSearch(query);
                    }
                });

                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        const query = event.target.value.trim();
                        if (query.length > 0) {
                            this.searchManager.performSearch(query);
                            
                            if (window.UIManager?.switchView) {
                                window.UIManager.switchView('search');
                            }
                        }
                    }
                });

                console.log(`✅ Input búsqueda configurado: ${inputId}`);
            }
        });
    }

    // ✅ Del backup: Setup playlist URL con validación
    setupPlaylistURL() {
        const urlButton = document.getElementById('añadirUrlButton');
        const urlInput = document.getElementById('searchInput2');
        
        if (urlButton && urlInput) {
            urlButton.addEventListener('click', () => {
                this.handlePlaylistUrlAdd();
            });

            urlInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    this.handlePlaylistUrlAdd();
                }
            });
            
            console.log('✅ Playlist URL configurado');
        }
    }

    // ✅ Del backup: Manejar URL de playlist con validación
    async handlePlaylistUrlAdd() {
        const input = document.getElementById('searchInput2');
        if (!input) return;
        
        const url = input.value.trim();
        if (!url) {
            window.unifiedMessageManager?.show('Ingresa una URL válida', 'warning');
            return;
        }
        
        // ✅ Del backup: Validación de URL
        const isYouTubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
        if (!isYouTubeUrl) {
            window.unifiedMessageManager?.show('URL de YouTube no válida', 'error');
            return;
        }
        
        const playlistId = this.extractPlaylistId(url);
        if (!playlistId) {
            window.unifiedMessageManager?.show('URL no contiene una playlist válida', 'error');
            return;
        }
        
        console.log('🔗 Cargando playlist:', playlistId);
        input.value = '';
        
        try {
            window.unifiedLoadingManager?.show('playlist-load', {
                type: 'overlay',
                message: 'Cargando playlist...'
            });
            
            const playlistInfo = await this.getPlaylistInfo(playlistId);
            if (playlistInfo) {
                playlistInfo.id = playlistId;
                await this.handlePlaylistLoaded(playlistInfo);
                
                if (window.UIManager?.switchView) {
                    window.UIManager.switchView('library');
                }
            }
            
        } catch (error) {
            console.error('❌ Error cargando playlist:', error);
            window.unifiedMessageManager?.show('Error cargando playlist', 'error');
        } finally {
            window.unifiedLoadingManager?.hide('playlist-load');
        }
    }

    // ✅ Del backup: Obtener info de playlist con retry
    async getPlaylistInfo(playlistId) {
        let lastError = null;
        
        for (const instance of CONFIG.PIPED_INSTANCES) {
            try {
                const url = `${instance}/playlists/${playlistId}`;
                const response = await this.fetchDataWithRetry(url, {}, 2, 800);
                
                if (!response.relatedStreams) {
                    throw new Error("Respuesta no contiene videos válidos");
                }
                
                console.log(`✅ Playlist cargada desde ${instance}`);
                return response;
                
            } catch (error) {
                console.warn(`⚠️ Fallo en ${instance}:`, error.message);
                lastError = error;
                continue;
            }
        }
        
        throw lastError || new Error("Todas las instancias fallaron");
    }

    // ✅ Del backup: Fetch con retry
    async fetchDataWithRetry(url, options = {}, maxRetries = 2, retryDelay = 800) {
        let retries = 0;
        
        while (retries <= maxRetries) {
            try {
                console.log(`🔄 Intento ${retries + 1} para ${url}`);
                const response = await fetch(url, options);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                return await response.json();
                
            } catch (error) {
                console.error(`❌ Error fetch intento ${retries + 1}:`, error.message);
                retries++;
                
                if (retries <= maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
                } else {
                    throw error;
                }
            }
        }
    }

    // ✅ Del backup: Manejar playlist cargada
    async handlePlaylistLoaded(playlistInfo) {
        console.log('📥 Procesando playlist:', playlistInfo.name || playlistInfo.id);

        if (!playlistInfo?.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
            throw new Error("No se encontraron videos válidos en la playlist");
        }

        const playlistId = playlistInfo.id || `playlist_${Date.now()}`;
        const playlistsData = this.stateManager.get('playlist.playlistsData') || [];

        // Verificar duplicados
        if (playlistsData.some(p => p.id === playlistId)) {
            window.unifiedMessageManager?.show(`Playlist "${playlistInfo.name || playlistId}" ya está cargada`, 'warning');
            return;
        }

        // ✅ Del backup: Procesar videos con filtrado
        const loadedVideos = playlistInfo.relatedStreams
            .filter(video => video.title && video.title !== 'Private video' && video.title !== 'Deleted video')
            .map(video => ({
                videoId: video.url?.split('v=')[1] || video.url?.split('/').pop(),
                title: video.title || "Título Desconocido",
                thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.url?.split('v=')[1]}/default.jpg`,
                duration: this.parseDuration(video.duration) || 0,
                channelTitle: video.uploaderName || 'Desconocido',
                uploaderUrl: video.uploaderUrl || ''
            }))
            .filter(v => v.videoId);

        if (loadedVideos.length === 0) {
            throw new Error("La playlist no contiene videos válidos");
        }

        // Crear nueva playlist
        const newPlaylist = {
            id: playlistId,
            name: playlistInfo.name || "Playlist Sin Nombre",
            thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || '',
            videos: loadedVideos,
            isExpanded: false,
            source: 'external',
            isLoaded: true,
            itemCount: loadedVideos.length,
            loadedAt: Date.now()
        };

        // ✅ Del backup: Lógica de ordenamiento
        const updatedPlaylists = [...playlistsData];
        const manualIndex = updatedPlaylists.findIndex(p => p.id === 'manual');
        
        if (manualIndex !== -1) {
            updatedPlaylists.splice(manualIndex + 1, 0, newPlaylist);
        } else {
            updatedPlaylists.push(newPlaylist);
        }
        
        this.stateManager.set('playlist.playlistsData', updatedPlaylists);

        console.log(`✅ Playlist "${newPlaylist.name}" añadida con ${loadedVideos.length} videos`);
        window.unifiedMessageManager?.show(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos)`, 'success');
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
    }

    async loadModules() {
        console.log('📦 Cargando módulos adicionales...');
        
        try {
            // Load messaging system
            const { default: messageManager } = await import('./messages.js');
            window.unifiedMessageManager = messageManager;
            
            // Load other managers if they exist
            if (window.PlaylistManager) {
                console.log('✅ PlaylistManager ya disponible');
            }
            
            if (window.UIManager) {
                console.log('✅ UIManager ya disponible');
            }
            
            if (window.SponsorBlockManager) {
                console.log('✅ SponsorBlockManager ya disponible');
            }
            
            console.log('✅ Módulos adicionales cargados');
            
        } catch (error) {
            console.warn('⚠️ Error cargando algunos módulos:', error);
        }
    }

    getLoadedModules() {
        return {
            stateManager: !!this.stateManager,
            youtubeManager: !!this.youtubeManager,
            playbackController: !!this.playbackController,
            searchManager: !!this.searchManager,
            playlistManager: !!this.playlistManager,
            uiManager: !!window.UIManager,
            sponsorBlockManager: !!window.SponsorBlockManager,
            messageManager: !!window.unifiedMessageManager
        };
    }

    performHealthCheck() {
        const health = {
            initialized: this.initialized,
            youtubeAPI: this.youtubeManager.apiReady,
            players: this.stateManager.get('app.playersInitialized'),
            stateManager: !!this.stateManager,
            playlistCount: this.stateManager.get('playlist.playlistsData')?.length || 0,
            queueCount: this.playlistManager.getFlattenedPlaylist().length,
            currentView: this.stateManager.get('ui.currentView'),
            reproduction: this.stateManager.get('app.reproduccionIniciada'),
            errors: []
        };

        // Verificar integridad
        if (!health.initialized) health.errors.push('Sistema no inicializado');
        if (!health.youtubeAPI) health.errors.push('YouTube API no lista');
        if (!health.players) health.errors.push('Reproductores no listos');

        return health;
    }

    // ✅ Utilidades del backup
    debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    parseDuration(durationInput) {
        if (typeof durationInput === 'number') {
            return Math.floor(durationInput);
        }
        
        if (typeof durationInput !== 'string') return 0;

        // ✅ Del backup: Formato PT0H0M0S
        const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (isoMatch) {
            const hours = parseInt(isoMatch[1] || '0', 10);
            const minutes = parseInt(isoMatch[2] || '0', 10);
            const seconds = parseFloat(isoMatch[3] || '0');
            return Math.floor(hours * 3600 + minutes * 60 + seconds);
        }

        // ✅ Del backup: Formato MM:SS o HH:MM:SS
        const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
        if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
            return timeParts[0] * 60 + timeParts[1];
        } else if (timeParts.length === 3) {
            return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        }

        const directNumber = parseInt(durationInput, 10);
        if (!isNaN(directNumber)) {
            return directNumber;
        }

        return 0;
    }

    extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            console.error("URL inválida:", url);
            return null;
        }
    }

    // ✅ Debug y utilidades
    getDebugInfo() {
        const health = this.performHealthCheck();
        const state = this.stateManager.state;
        
        return {
            health,
            state: {
                app: state.app,
                playlist: {
                    count: state.playlist.playlistsData?.length || 0,
                    currentPlaying: state.playlist.currentPlayingInfo
                },
                search: {
                    query: state.search.currentSearchQuery,
                    loading: state.search.isLoadingMore
                },
                auth: state.auth
            },
            modules: this.getLoadedModules(),
            timestamp: Date.now()
        };
    }

    reset() {
        console.log('🔄 Reseteando sistema unificado...');
        
        try {
            // Detener monitoreo
            this.playbackController.stopMonitoring();
            
            // Detener reproductores
            const player1 = this.stateManager.get('app.player1');
            const player2 = this.stateManager.get('app.player2');
            
            if (player1) this.youtubeManager.safeStopPlayer(player1);
            if (player2) this.youtubeManager.safeStopPlayer(player2);
            
            // Limpiar crossfade
            const crossfadeInterval = this.stateManager.get('app.crossfadeInterval');
            if (crossfadeInterval) {
                clearInterval(crossfadeInterval);
                this.stateManager.set('app.crossfadeInterval', null);
            }
            
            // Reset estado
            this.stateManager.set('app.reproduccionIniciada', false);
            this.stateManager.set('app.isTransitioning', false);
            this.stateManager.set('app.crossfadeInProgress', false);
            this.stateManager.set('app.hasOutroCrossfadeStarted', false);
            
            // Reset current playing
            this.stateManager.set('playlist.currentPlayingInfo.videoId', null);
            this.stateManager.set('playlist.currentPlayingInfo.playlistId', null);
            this.stateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            
            // Reset UI
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-play"></i>';
                playButton.disabled = true;
            }
            
            // Reset players visually
            document.getElementById('player1')?.classList.remove('fade-out', 'fade-in');
            document.getElementById('player2')?.classList.add('hidden');
            
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }
            
            console.log('✅ Sistema reseteado exitosamente');
            window.unifiedMessageManager?.show('Sistema reiniciado', 'success');
            
        } catch (error) {
            console.error('❌ Error reseteando sistema:', error);
            window.unifiedMessageManager?.show('Error reiniciando sistema', 'error');
        }
    }
}

// ===== INICIALIZACIÓN Y SETUP GLOBAL =====
async function initializeUnifiedSystem() {
    try {
        console.log('🎬 Iniciando YT CrossMix Sistema Unificado...');
        
        // Crear instancia principal
        const unifiedSystem = new YTCrossMixUnified();
        
        // Setup funciones globales de debug
        window.debugUnified = () => {
            console.log('🔧 DEBUG UNIFICADO:');
            console.table(unifiedSystem.getDebugInfo());
            
            const debugPanel = document.getElementById('unifiedDebugPanel');
            if (debugPanel) {
                debugPanel.classList.toggle('show');
            }
        };
        
        window.resetUnified = () => {
            if (confirm('¿Reiniciar el sistema completo?')) {
                unifiedSystem.reset();
            }
        };
        
        window.toggleUnifiedDebug = () => {
            const debugPanel = document.getElementById('unifiedDebugPanel');
            const stateDebug = document.getElementById('unifiedStateDebug');
            
            if (debugPanel) debugPanel.classList.toggle('show');
            if (stateDebug) stateDebug.classList.toggle('show');
        };
        
        // ✅ Referencias globales adicionales del backup
        window.unifiedCore = unifiedSystem;
        window.getFlattenedPlaylist = () => unifiedSystem.playlistManager.getFlattenedPlaylist();
        window.playFirstVideo = () => unifiedSystem.playbackController.playFirstVideo();
        window.playNextVideo = () => unifiedSystem.playbackController.playNextVideo();
        
        // Inicializar sistema
        await unifiedSystem.initialize();
        
        console.log('🎉 Sistema Unificado inicializado exitosamente');
        
        return unifiedSystem;
        
    } catch (error) {
        console.error('💥 Error fatal inicializando sistema unificado:', error);
        
        // Mostrar error en UI
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #f44336; color: white; padding: 20px; border-radius: 8px;
            text-align: center; z-index: 10000; max-width: 400px;
        `;
        errorDiv.innerHTML = `
            <h3>Error del Sistema</h3>
            <p>${error.message}</p>
            <button onclick="location.reload()" style="
                background: white; color: #f44336; border: none; padding: 8px 16px;
                border-radius: 4px; margin-top: 10px; cursor: pointer;
            ">Recargar Página</button>
        `;
        document.body.appendChild(errorDiv);
        
        throw error;
    }
}

// ===== AUTO-INICIALIZACIÓN =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUnifiedSystem);
} else {
    initializeUnifiedSystem();
}

// ===== EXPORTS =====
export { 
    YTCrossMixUnified, 
    UnifiedStateManager, 
    UnifiedYouTubeManager, 
    UnifiedPlaybackController,
    UnifiedSearchManager,
    UnifiedPlaylistManager,
    CONFIG 
};

console.log('✅ Core Unificado cargado - Versión mejorada con funciones del backup');Button) {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.disabled = true;
        }

        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }

        window.unifiedMessageManager?.show("No hay videos en la cola para reproducir", 'warning');
    }

    handleEndOfPlaylist() {
        console.log('🔚 Fin de playlist detectado');
        
        const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
        
        if (repeat) {
            // Reset y reiniciar
            this.state.set('playlist.currentPlayingInfo.playlistId', null);
            this.state.set('playlist.currentPlayingInfo.videoId', null);
            this.state.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            
            this.playFirstVideo();
        } else {
            this.stopMonitoring();
            window.unifiedMessageManager?.show("Playlist finalizada. ¡Gracias por usar YT CrossMix! 🎵", 'info');
            
            // Detener ambos players
            const player1 = this.state.get('app.player1');
            const player2 = this.state.get('app.player2');
            
            try {
                if (player1) this.youtube.safeStopPlayer(player1);
                if (player2) this.youtube.safeStopPlayer(player2);
            } catch(e) {
                console.warn("Error deteniendo players:", e);
            }
            
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.disabled = this.getFlattenedPlaylist().length === 0;
                playButton.innerHTML = '<i class="fas fa-play"></i>';
            }
            
            this.state.set('app.reproduccionIniciada', false);
        }
        
        this.state.set('app.isTransitioning', false);
    }

    handleCriticalError(error, currentFlatIndex) {
        console.error("💥 Error crítico en reproducción:", error);
        
        // Cancelar crossfade si está en progreso
        const crossfadeInterval = this.state.get('app.crossfadeInterval');
        if (crossfadeInterval) {
            clearInterval(crossfadeInterval);
            this.state.set('app.crossfadeInterval', null);
            this.state.set('app.crossfadeInProgress', false);
            this.state.set('app.isAudioFading', false);
        }
        
        // Revertir estado
        this.state.set('app.isTransitioning', false);
        
        const flatList = this.getFlattenedPlaylist();
        const previousVideo = flatList[currentFlatIndex];
        
        this.state.set('playlist.currentPlayingInfo.flattenedIndex', currentFlatIndex >= 0 ? currentFlatIndex : -1);
        this.state.set('playlist.currentPlayingInfo.videoId', previousVideo ? previousVideo.videoId : null);
        this.state.set('playlist.currentPlayingInfo.playlistId', previousVideo ? previousVideo.sourcePlaylistId : null);

        this.stopMonitoring();
        this.state.set('app.reproduccionIniciada', false);

        const playButton = document.getElementById('botonPlay');
        if (play
