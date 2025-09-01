// ===== CORE.JS - VERSIÓN COMPLETA CON TODAS LAS FUNCIONES FALTANTES =====
// Sistema unificado optimizado con funciones críticas completadas

// ===== CONFIGURACIÓN GLOBAL =====
const CONFIG = {
    CROSSFADE_DURATION: 15, // segundos
    MONITOR_INTERVAL: 300, // ms
    PIPED_INSTANCES: [
        "https://api.piped.private.coffee",
        "https://pipedapi.ducks.party"
    ],
    SPONSORBLOCK_USER_ID: 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd',
    YOUTUBE_LIBRARY_SOURCE_ID: 'youtube_library'
};

// ===== UTILIDADES COMPARTIDAS =====
class SharedUtils {
    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    static formatDuration(duration) {
        if (!duration || isNaN(duration)) return "0:00";
        const totalSeconds = typeof duration === 'number' ? duration : parseInt(duration, 10);
        if (isNaN(totalSeconds)) return "0:00";
        
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    static parseDuration(durationInput) {
        if (typeof durationInput === 'number') return Math.floor(durationInput);
        if (typeof durationInput !== 'string') return 0;

        // PT0H0M0S format (ISO 8601)
        const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (isoMatch) {
            const hours = parseInt(isoMatch[1] || '0', 10);
            const minutes = parseInt(isoMatch[2] || '0', 10);
            const seconds = parseFloat(isoMatch[3] || '0');
            return Math.floor(hours * 3600 + minutes * 60 + seconds);
        }

        // MM:SS or HH:MM:SS format
        const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
        if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
            return timeParts[0] * 60 + timeParts[1];
        } else if (timeParts.length === 3) {
            return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        }

        const directNumber = parseInt(durationInput, 10);
        return !isNaN(directNumber) ? directNumber : 0;
    }

    static extractVideoId(video) {
        let videoId = video.videoId || video.id;
        if (!videoId && video.url) {
            const match = video.url.match(/(?:watch\?v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            videoId = match ? match[1] : null;
        }
        return videoId;
    }

    static extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            console.error("URL inválida:", url);
            return null;
        }
    }

    static isValidYouTubeUrl(url) {
        return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
    }

    static async fetchWithTimeout(url, options = {}, timeout = 15000) {
        return fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'YTCrossMix/2.0',
                ...options.headers
            },
            signal: AbortSignal.timeout(timeout),
            ...options
        });
    }

    static escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ===== ESTADO UNIFICADO OPTIMIZADO =====
class UnifiedStateManager {
    constructor() {
        this.state = {
            app: {
                player1: null,
                player2: null,
                currentPlayer: 1,
                playersInitialized: false,
                youtubeAPIReady: false,
                reproduccionIniciada: false,
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
        
        this.notifyChange(path, value, oldValue);
        
        if (this.debug && path.includes('currentView') || path.includes('playlistsData') || path.includes('isAuthenticated')) {
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

// ===== REPRODUCTORES YOUTUBE OPTIMIZADO =====
class UnifiedYouTubeManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.apiReady = false;
        this.playersReady = false;
    }

    async initialize() {
        console.log('📺 Inicializando YouTube Manager...');
        await this.waitForYouTubeAPI();
        this.createPlayers();
    }

    waitForYouTubeAPI() {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                this.apiReady = true;
                resolve();
                return;
            }

            window.onYouTubeIframeAPIReady = () => {
                this.apiReady = true;
                console.log('✅ YouTube API Ready');
                resolve();
            };

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
        console.log('🎮 Creando reproductores...');

        const createPlayerConfig = (elementId, playerNum) => ({
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
                'onReady': (event) => this.onPlayerReady(event, playerNum),
                'onStateChange': (event) => this.onPlayerStateChange(event, playerNum),
                'onError': (event) => this.onPlayerError(event, playerNum)
            }
        });

        const player1 = new YT.Player('player1', createPlayerConfig('player1', 1));
        const player2 = new YT.Player('player2', createPlayerConfig('player2', 2));

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
            
            document.getElementById('botonPlay')?.removeAttribute('disabled');
            document.dispatchEvent(new CustomEvent('playersReady', {
                detail: { player1Ready, player2Ready }
            }));

            if (window.PlaylistManager?.initializeManualPlaylist) {
                window.PlaylistManager.initializeManualPlaylist();
            }
        }
    }

    onPlayerStateChange(event, playerNum) {
        const state = event.data;
        const videoData = event.target.getVideoData();
        
        if (state === YT.PlayerState.PLAYING) {
            this.state.set('app.hasOutroCrossfadeStarted', false);
            if (window.PlaylistManager?.updateCurrentPlayingIndex) {
                window.PlaylistManager.updateCurrentPlayingIndex();
            }
        }

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
        window.unifiedMessageManager?.show(`Error en reproductor ${playerNum}`, 'error');
    }

    // Métodos de utilidad consolidados
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

    // Crossfade optimizado sin duplicación
    async performCrossfade(prevPlayer, nextPlayer) {
        if (this.state.get('app.crossfadeInProgress')) {
            console.log("Crossfade ya en progreso");
            return;
        }
        
        this.state.set('app.crossfadeInProgress', true);
        this.state.set('app.isAudioFading', true);
        
        const DURATION_MS = CONFIG.CROSSFADE_DURATION * 1000;
        const STEPS = 60; // 60 pasos para transición suave
        const STEP_MS = DURATION_MS / STEPS;

        let step = 0;
        const prevStartVol = this.safeGetVolume(prevPlayer, 100);

        console.log(`🎵 Iniciando crossfade (${DURATION_MS}ms)`);

        if (this.state.get('app.crossfadeInterval')) {
            clearInterval(this.state.get('app.crossfadeInterval'));
        }

        const interval = setInterval(() => {
            step++;
            const progress = step / STEPS;
            const easedProgress = this.easeInOutCubic(progress);
            
            const prevVol = Math.max(0, Math.round(prevStartVol * (1 - easedProgress)));
            const nextVol = Math.min(100, Math.round(100 * easedProgress));

            this.safeSetVolume(prevPlayer, prevVol);
            this.safeSetVolume(nextPlayer, nextVol);

            if (step >= STEPS) {
                clearInterval(interval);
                this.finalizeCrossfade(prevPlayer, nextPlayer);
            }
        }, STEP_MS);

        this.state.set('app.crossfadeInterval', interval);
    }

    finalizeCrossfade(prevPlayer, nextPlayer) {
        this.safeSetVolume(prevPlayer, 0);
        this.safeSetVolume(nextPlayer, 100);
        
        setTimeout(() => this.safeStopPlayer(prevPlayer), 100);
        
        this.state.set('app.crossfadeInterval', null);
        this.state.set('app.isAudioFading', false);
        this.state.set('app.crossfadeInProgress', false);
        
        console.log("✅ Crossfade completado");
    }

    // Funciones seguras consolidadas
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

// ===== GESTOR DE REPRODUCCIÓN OPTIMIZADO =====
class UnifiedPlaybackController {
    constructor(stateManager, youtubeManager) {
        this.state = stateManager;
        this.youtube = youtubeManager;
    }

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

        this.checkSponsorBlock(activePlayer);

        const timeRemaining = videoDuration - currentTime;
        
        if (playerState === YT.PlayerState.PLAYING &&
            timeRemaining <= CONFIG.CROSSFADE_DURATION + 0.5 &&
            timeRemaining > 0 &&
            !this.state.get('app.hasOutroCrossfadeStarted') &&
            !this.state.get('app.crossfadeInProgress')) {
            
            console.log(`🎵 Tiempo restante: ${timeRemaining.toFixed(1)}s - Iniciando crossfade`);
            this.playNextVideo();
        }

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
                console.warn("🛑 Reproductor inactivo detectado - deteniéndolo");
                this.youtube.safeStopPlayer(inactivePlayer);
            }
        }
    }

    checkSponsorBlock(player) {
        if (window.SponsorBlockManager?.checkAndSkipSegment) {
            window.SponsorBlockManager.checkAndSkipSegment(player);
        }
    }

    getFlattenedPlaylist() {
        const state = this.state.state;
        if (!state?.playlist?.playlistsData) return [];
        
        // Get manual playlist videos first (priority)
        const manualPlaylist = state.playlist.playlistsData.find(p => p.id === 'manual');
        let allVideos = [];
        
        if (manualPlaylist?.videos?.length > 0) {
            allVideos = manualPlaylist.videos.map(video => ({
                ...video,
                sourcePlaylistId: 'manual'
            }));
        }
        
        // Add videos from other playlists that are expanded and loaded
        const otherPlaylists = state.playlist.playlistsData.filter(p => 
            p.id !== 'manual' && 
            p.isExpanded && 
            p.videos?.length > 0
        );
        
        otherPlaylists.forEach(playlist => {
            const playlistVideos = playlist.videos.map(video => ({
                ...video,
                sourcePlaylistId: playlist.id
            }));
            allVideos = allVideos.concat(playlistVideos);
        });
        
        return allVideos;
    }

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

            document.getElementById('player1')?.classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2')?.classList.add('hidden');
            
            this.state.set('app.currentPlayer', 1);
            this.state.set('app.reproduccionIniciada', true);

            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-pause"></i>';
                playButton.disabled = false;
            }

            this.startMonitoring();

            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }

        } catch (error) {
            console.error("❌ Error iniciando primer video:", error);
            this.handlePlaybackError(error);
        }
    }

    async playNextVideo() {
        const currentFlatIndex = this.state.get('playlist.currentPlayingInfo.flattenedIndex');
        const flatList = this.getFlattenedPlaylist();

        console.log(`⏭️ playNextVideo: índice ${currentFlatIndex}`);
        
        if (this.state.get('app.isTransitioning') && this.state.get('app.crossfadeInProgress')) {
            console.log("🔄 Transición en progreso");
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

            const currentPlayerNum = this.state.get('app.currentPlayer');
            const nextPlayerNum = currentPlayerNum === 1 ? 2 : 1;
            const prevPlayer = this.youtube.getActivePlayer();
            const nextPlayer = this.youtube.getInactivePlayer();

            if (!this.validatePlayer(prevPlayer) || !this.validatePlayer(nextPlayer)) {
                throw new Error("Reproductores inválidos para crossfade");
            }

            console.log(`🎬 Cargando video: ${nextVideo.videoId}`);
            nextPlayer.cueVideoById(nextVideo.videoId);
            
            this.youtube.safeSetVolume(prevPlayer, this.youtube.safeGetVolume(prevPlayer, 100));
            this.youtube.safeSetVolume(nextPlayer, 0);

            this.state.set('playlist.currentPlayingInfo.flattenedIndex', nextIndex);
            this.state.set('playlist.currentPlayingInfo.videoId', nextVideo.videoId);
            this.state.set('playlist.currentPlayingInfo.playlistId', nextVideo.sourcePlaylistId);

            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }

            this.applyVisualTransitions(currentPlayerNum, nextPlayerNum);
            await this.playNextPlayer(nextPlayer);

            setTimeout(() => {
                const nextPlayerState = nextPlayer.getPlayerState();
                if (nextPlayerState === YT.PlayerState.PLAYING) {
                    this.youtube.performCrossfade(prevPlayer, nextPlayer);
                } else {
                    console.warn(`⚠️ Reproductor siguiente no está reproduciendo`);
                    setTimeout(() => this.youtube.performCrossfade(prevPlayer, nextPlayer), 200);
                }
            }, 150);

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

        window.unifiedMessageManager?.show('No hay videos en la cola para reproducir', 'warning');
    }

    handleEndOfPlaylist() {
        console.log('🔚 Fin de playlist detectado');
        
        const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
        
        if (repeat) {
            this.state.set('playlist.currentPlayingInfo.playlistId', null);
            this.state.set('playlist.currentPlayingInfo.videoId', null);
            this.state.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            this.playFirstVideo();
        } else {
            this.stopMonitoring();
            window.unifiedMessageManager?.show("Playlist finalizada. ¡Gracias por usar YT CrossMix! 🎵", 'info');
            
            const state = this.state.state;
            try {
                if (state.app.player1) state.app.player1.stopVideo();
                if (state.app.player2) state.app.player2.stopVideo();
            } catch(e) {
                console.warn("Error deteniendo players:", e);
            }
            
            this.state.set('app.reproduccionIniciada', false);
            
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                const flatList = this.getFlattenedPlaylist();
                playButton.disabled = flatList.length === 0;
                playButton.innerHTML = '<i class="fas fa-play"></i>';
            }
        }
        
        this.state.set('app.isTransitioning', false);
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
        
        window.unifiedMessageManager?.show(`Error de reproducción: ${error.message}`, 'error');
    }

    handleCriticalError(error, currentIndex) {
        console.error("💥 Error crítico:", error);
        this.handlePlaybackError(error);
    }
}

// ===== CORE UNIFICADO PRINCIPAL =====
class YTCrossMixUnified {
    constructor() {
        this.initialized = false;
        this.moduleLoader = {
            loaded: new Set(),
            required: new Set(['stateManager', 'youtubeManager', 'playbackController', 'messageManager', 'loadingManager'])
        };
        
        this.stateManager = null;
        this.youtubeManager = null;
        this.playbackController = null;
        
        // Core utilities
        this.playlistManager = null;
        this.searchManager = null;
    }

    async initialize() {
        console.log('🚀 Inicializando YT CrossMix Sistema Unificado...');
        
        try {
            await this.setupManagers();
            await this.setupPlaylistManager();
            await this.setupSearchManager();
            await this.waitForDOM();
            
            this.initialized = true;
            this.moduleLoader.loaded.add('core');
            
            console.log('✅ YT CrossMix Sistema Unificado inicializado');
            
            // Dispatch ready event
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:ready', {
                detail: {
                    initialized: true,
                    modules: Array.from(this.moduleLoader.loaded),
                    timestamp: Date.now()
                }
            }));
            
        } catch (error) {
            console.error('💥 Error inicializando sistema unificado:', error);
            
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:error', {
                detail: { error: error.message, timestamp: Date.now() }
            }));
            
            throw error;
        }
    }

    async setupManagers() {
        // State Manager
        this.stateManager = new UnifiedStateManager();
        window.unifiedStateManager = this.stateManager;
        this.moduleLoader.loaded.add('stateManager');
        
        // YouTube Manager
        this.youtubeManager = new UnifiedYouTubeManager(this.stateManager);
        window.unifiedYouTubeManager = this.youtubeManager;
        this.moduleLoader.loaded.add('youtubeManager');
        
        // Playback Controller
        this.playbackController = new UnifiedPlaybackController(this.stateManager, this.youtubeManager);
        window.unifiedPlaybackController = this.playbackController;
        this.moduleLoader.loaded.add('playbackController');
        
        // Initialize YouTube Manager
        await this.youtubeManager.initialize();
        
        console.log('✅ Managers principales configurados');
    }

    async setupPlaylistManager() {
        // Core playlist functionality
        this.playlistManager = {
            initialize: () => {
                const state = this.stateManager.state;
                const playlistsData = state.playlist.playlistsData || [];
                
                if (!playlistsData.find(p => p.id === 'manual')) {
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
                    
                    this.stateManager.set('playlist.playlistsData', [manualPlaylist, ...playlistsData]);
                }
            },
            
            getFlattenedPlaylist: () => {
                return this.playbackController.getFlattenedPlaylist();
            },
            
            addVideoToManualPlaylist: (videoData) => {
                const state = this.stateManager.state;
                const playlistsData = [...state.playlist.playlistsData];
                const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
                
                if (manualIndex === -1) {
                    this.playlistManager.initialize();
                    return this.playlistManager.addVideoToManualPlaylist(videoData);
                }

                const manualPlaylist = playlistsData[manualIndex];

                // Check duplicates
                if (manualPlaylist.videos?.some(video => video.videoId === videoData.videoId)) {
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

                playlistsData[manualIndex] = {
                    ...manualPlaylist,
                    videos: [...(manualPlaylist.videos || []), videoObject],
                    itemCount: (manualPlaylist.videos?.length || 0) + 1
                };
                
                this.stateManager.set('playlist.playlistsData', playlistsData);
                this.checkAndEnablePlayButton();
                
                return videoObject;
            },

            updateCurrentPlayingIndex: () => {
                // Update UI based on current playing info
                if (window.UIManager?.updatePlaylistsUI) {
                    window.UIManager.updatePlaylistsUI();
                }
            }
        };
        
        this.moduleLoader.loaded.add('playlistManager');
    }

    async setupSearchManager() {
        this.searchManager = {
            performSearch: async (query, nextPage = null) => {
                const searchResultsElement = document.getElementById('searchResults');
                if (!searchResultsElement) return;

                if (!nextPage) {
                    searchResultsElement.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i><p>Buscando...</p></div>';
                }

                try {
                    const searchResults = await this.tryMultipleInstances(CONFIG.PIPED_INSTANCES, query, nextPage);
                    this.displaySearchResults(searchResults, !!nextPage);
                } catch (error) {
                    this.handleSearchError(error, !!nextPage, query);
                }
            },

            tryMultipleInstances: async (instances, query, nextPage) => {
                for (const instance of instances) {
                    try {
                        const url = new URL(`${instance}/search`);
                        url.searchParams.set('q', query);
                        url.searchParams.set('filter', 'videos');
                        if (nextPage) url.searchParams.set('nextpage', nextPage);

                        const response = await SharedUtils.fetchWithTimeout(url.toString(), {}, 15000);
                        
                        if (response.ok) {
                            const data = await response.json();
                            console.log(`✅ Búsqueda exitosa en ${instance}`);
                            return data;
                        }
                    } catch (error) {
                        console.warn(`⚠️ Fallo en ${instance}:`, error.message);
                        continue;
                    }
                }
                
                throw new Error('Todas las instancias fallaron');
            },

            displaySearchResults: (results, append = false) => {
                const searchResultsElement = document.getElementById('searchResults');
                if (!searchResultsElement) return;
                
                if (!append) searchResultsElement.innerHTML = '';
                
                const items = results.items || results.relatedStreams || [];
                
                if (!items?.length) {
                    if (!append) {
                        searchResultsElement.innerHTML = `
                            <div class="search-placeholder">
                                <i class="fas fa-search"></i>
                                <p>No se encontraron resultados</p>
                            </div>
                        `;
                    }
                    return;
                }

                const fragment = document.createDocumentFragment();

                items.forEach(video => {
                    const videoId = SharedUtils.extractVideoId(video);
                    if (!videoId || (append && searchResultsElement.querySelector(`[data-video-id="${videoId}"]`))) {
                        return;
                    }

                    const videoDiv = this.createVideoResultElement(video, videoId);
                    fragment.appendChild(videoDiv);
                });

                searchResultsElement.appendChild(fragment);
                console.log(`✅ ${items.length} resultados mostrados`);
            },

            createVideoResultElement: (video, videoId) => {
                const videoDiv = document.createElement('div');
                videoDiv.classList.add('video-result');
                videoDiv.dataset.videoId = videoId;

                const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                const duration = SharedUtils.formatDuration(video.duration);
                const title = SharedUtils.escapeHtml(video.title || 'Título no disponible');
                const author = SharedUtils.escapeHtml(video.uploaderName || video.channelTitle || 'Desconocido');

                videoDiv.innerHTML = `
                    <div class="thumbnail-container">
                        <img src="${thumbnailUrl}" alt="${title}" class="thumbnail" loading="lazy">
                        ${duration ? `<span class="duration">${duration}</span>` : ''}
                    </div>
                    <div class="video-details">
                        <h3 class="video-title">${title}</h3>
                        <p class="video-author">${author}</p>
                        <button class="search-result-add-button" data-video-data='${JSON.stringify({
                            videoId,
                            title: video.title || 'Título no disponible',
                            thumbnail: thumbnailUrl,
                            duration: SharedUtils.parseDuration(video.duration),
                            channelTitle: author
                        })}'>
                            <i class="fa-solid fa-arrow-right-to-line"></i>
                            <span class="add-text">Reproducir Después</span>
                        </button>
                    </div>
                `;
                
                return videoDiv;
            },

            handleSearchError: (error, isLoadMore, query) => {
                console.error("❌ Error en búsqueda:", error);
                
                if (!isLoadMore) {
                    const resultsDiv = document.getElementById('searchResults');
                    if (resultsDiv) {
                        resultsDiv.innerHTML = `
                            <div class="search-error">
                                <i class="fas fa-exclamation-triangle"></i>
                                <p>Error de búsqueda: ${error?.message || 'Instancias no disponibles'}</p>
                                <button onclick="window.unifiedCore?.searchManager?.performSearch('${query || ''}')" class="retry-search-btn">
                                    <i class="fas fa-redo"></i> Reintentar
                                </button>
                            </div>
                        `;
                    }
                } else {
                    window.unifiedMessageManager?.show('Error cargando más resultados', 'error');
                }
            },

            initialize: () => {
                const searchResultsElement = document.getElementById('searchResults');
                if (searchResultsElement) {
                    searchResultsElement.addEventListener('scroll', SharedUtils.debounce(() => {
                        // Handle scroll for infinite loading
                    }, 100));
                }
            }
        };
        
        this.moduleLoader.loaded.add('searchManager');
    }

    async waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                resolve();
            } else {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            }
        });
    }

    checkAndEnablePlayButton() {
        const flatList = this.playlistManager.getFlattenedPlaylist();
        const playersReady = this.stateManager?.state?.app?.playersInitialized;
        
        ['botonPlay', 'botonNext', 'prevButton'].forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.disabled = !(flatList.length > 0 && playersReady);
            }
        });
    }

    // Helper methods
    switchView(viewName) {
        if (window.UIManager?.switchView) {
            window.UIManager.switchView(viewName);
        } else {
            this.stateManager?.set('ui.currentView', viewName);
        }
    }

    handlePlaylistUrlAdd() {
        const input = document.getElementById('searchInput2');
        if (!input) return;
        
        const url = input.value.trim();
        if (!url) {
            window.unifiedMessageManager?.show('Ingresa una URL válida', 'warning');
            return;
        }
        
        if (!SharedUtils.isValidYouTubeUrl(url)) {
            window.unifiedMessageManager?.show('URL de YouTube no válida', 'error');
            return;
        }
        
        const playlistId = SharedUtils.extractPlaylistId(url);
        if (!playlistId) {
            window.unifiedMessageManager?.show('URL no contiene una playlist válida', 'error');
            return;
        }
        
        input.value = '';
        window.unifiedMessageManager?.show('Función en desarrollo: Añadir playlist desde URL', 'info');
    }

    performHealthCheck() {
        return {
            initialized: this.initialized,
            stateManager: !!this.stateManager,
            youtubeManager: !!this.youtubeManager,
            playbackController: !!this.playbackController,
            playlistManager: !!this.playlistManager,
            searchManager: !!this.searchManager,
            youtubeAPIReady: !!(window.YT && window.YT.Player),
            playersReady: this.youtubeManager?.playersReady || false,
            modulesLoaded: Array.from(this.moduleLoader.loaded),
            requiredModules: Array.from(this.moduleLoader.required),
            timestamp: Date.now()
        };
    }

    getDebugInfo() {
        const health = this.performHealthCheck();
        const state = this.stateManager?.state;
        
        return {
            ...health,
            stateSnapshot: {
                playlistCount: state?.playlist?.playlistsData?.length || 0,
                currentView: state?.ui?.currentView,
                isPlaying: state?.app?.reproduccionIniciada,
                currentPlayer: state?.app?.currentPlayer,
                currentVideoId: state?.playlist?.currentPlayingInfo?.videoId
            }
        };
    }
}

// ===== INITIALIZATION =====
// Create global instance
window.ytCrossMixUnified = new YTCrossMixUnified();
window.unifiedCore = window.ytCrossMixUnified;

// Global utilities
window.SharedUtils = SharedUtils;
window.CONFIG = CONFIG;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ytCrossMixUnified.initialize().catch(error => {
            console.error('Error durante inicialización:', error);
        });
    });
} else {
    window.ytCrossMixUnified.initialize().catch(error => {
        console.error('Error durante inicialización:', error);
    });
}

console.log('✅ Core Unificado cargado - Sistema preparado para inicialización');
