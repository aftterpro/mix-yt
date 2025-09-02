// ===== CORE.JS - VERSIÓN UNIFICADA CON CORRECCIONES INTEGRADAS =====
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
        if (!duration) return '';
        
        if (typeof duration === 'number') {
            const totalSeconds = Math.floor(duration);
            if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
            
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = Math.floor(totalSeconds % 60);
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (typeof duration === 'string') {
            // PT format (ISO 8601)
            const ptMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
            if (ptMatch) {
                const hours = parseInt(ptMatch[1] || '0');
                const minutes = parseInt(ptMatch[2] || '0'); 
                const seconds = parseFloat(ptMatch[3] || '0');
                const totalSeconds = Math.floor(hours * 3600 + minutes * 60 + seconds);
                return SharedUtils.formatDuration(totalSeconds);
            }
            
            // Already formatted MM:SS or HH:MM:SS
            if (/^\d+:\d{2}(:\d{2})?$/.test(duration)) {
                return duration;
            }
        }
        
        return "0:00";
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
        } else if (timeParts.length === 3 && timeParts.every(part => !isNaN(part))) {
            return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        }

        const directNumber = parseInt(durationInput, 10);
        return !isNaN(directNumber) ? directNumber : 0;
    }

    static extractVideoId(video) {
        if (video.videoId) return video.videoId;
        if (video.id) return video.id;
        if (video.url) {
            const match = video.url.match(/(?:watch\?v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            return match ? match[1] : null;
        }
        return null;
    }

    static extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
            return match ? match[1] : null;
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

// ===== ESTADO UNIFICADO MEJORADO =====
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
        
        if (this.debug && (path.includes('currentView') || path.includes('playlistsData') || path.includes('isAuthenticated'))) {
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

// ===== AUTH MANAGER FIX INTEGRADO =====
class UnifiedAuthManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
        this.SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
        this.tokenClient = null;
        this.gapiReady = false;
        this.gisReady = false;
        this.isAuthenticated = false;
        this.authStatusCallback = null;
        this.isInitializing = false;
        this.initPromise = null;
        
        // Inicializar después de un delay
        setTimeout(() => this.initialize(), 500);
    }

    async initialize() {
        console.log('🔐 Inicializando AuthManager unificado...');
        
        if (this.isInitializing) {
            return this.initPromise;
        }
        
        this.isInitializing = true;
        this.initPromise = this.performInitialization();
        return this.initPromise;
    }

    async performInitialization() {
        try {
            // Esperar a GAPI con timeout extendido
            await this.waitForGAPI();
            
            // Inicializar GAPI
            await new Promise((resolve, reject) => {
                if (window.gapi) {
                    gapi.load('client', {
                        callback: resolve,
                        onerror: (error) => {
                            console.error('❌ Error cargando GAPI client:', error);
                            resolve(); // Continuar de todos modos
                        }
                    });
                } else {
                    resolve(); // No hay GAPI disponible
                }
            });
            
            if (window.gapi?.client) {
                await gapi.client.init({
                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
                });
                this.gapiReady = true;
            }
            
            // Configurar GIS
            if (window.google?.accounts) {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.CLIENT_ID,
                    scope: this.SCOPES,
                    callback: (tokenResponse) => {
                        this.tokenResponseCallback(tokenResponse);
                    }
                });
                this.gisReady = true;
            }
            
            // Setup botones
            this.setupButtonListeners();
            
            // Verificar token existente
            await this.checkExistingToken();
            
            console.log('✅ AuthManager unificado inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando AuthManager:', error);
            this.createFallbackAuth();
        } finally {
            this.isInitializing = false;
        }
    }

    waitForGAPI() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 60; // 30 segundos
            
            const checkGAPI = () => {
                attempts++;
                
                if (window.gapi) {
                    console.log('✅ GAPI disponible');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    console.warn('⚠️ Timeout esperando GAPI');
                    resolve(); // Continuar sin GAPI
                } else {
                    setTimeout(checkGAPI, 500);
                }
            };
            
            checkGAPI();
        });
    }

    async checkExistingToken() {
        const savedToken = localStorage.getItem('google_token');
        if (savedToken) {
            try {
                const tokenData = JSON.parse(savedToken);
                const now = Date.now();
                const tokenAge = now - tokenData.timestamp;
                
                // Token válido por 1 hora
                if (tokenAge < 3600000 && window.gapi?.client) {
                    gapi.client.setToken(tokenData);
                    this.isAuthenticated = true;
                    this.updateUI(true);
                    this.state.set('auth.isAuthenticated', true);
                    this.state.set('auth.token', tokenData);
                    
                    console.log('✅ Token existente válido');
                    
                    // Auto-load playlists después de un delay
                    setTimeout(() => {
                        if (this.gapiReady) {
                            this.getPlaylists();
                        }
                    }, 2000);
                } else {
                    localStorage.removeItem('google_token');
                }
            } catch (e) {
                localStorage.removeItem('google_token');
            }
        }
    }

    createFallbackAuth() {
        console.log('🔄 Creando AuthManager fallback...');
        
        this.handleAuthClick = () => {
            window.unifiedMessageManager?.show('Cargando sistema de autenticación...', 'info');
            
            setTimeout(() => {
                if (this.gapiReady && this.gisReady && this.tokenClient) {
                    this.tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    window.unifiedMessageManager?.show('Sistema de Google no disponible', 'error');
                }
            }, 1000);
        };
        
        this.handleSignOutClick = () => {
            this.performSignOut();
        };
    }

    handleAuthClick() {
        console.log('🔑 Procesando login de Google...');
        
        if (!this.gapiReady || !this.gisReady) {
            window.unifiedMessageManager?.show('APIs de Google no están listas', 'warning');
            
            // Intentar reinicializar
            this.initialize().then(() => {
                if (this.gapiReady && this.gisReady) {
                    this.handleAuthClick();
                }
            });
            return;
        }
        
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            window.unifiedMessageManager?.show('Cliente OAuth no disponible', 'error');
        }
    }

    async tokenResponseCallback(tokenResponse) {
        if (tokenResponse && tokenResponse.access_token) {
            try {
                if (window.gapi?.client) {
                    gapi.client.setToken(tokenResponse);
                }
                
                const tokenData = {
                    ...tokenResponse,
                    timestamp: Date.now()
                };
                localStorage.setItem('google_token', JSON.stringify(tokenData));
                
                console.log("✅ Acceso concedido. Token guardado.");
                this.isAuthenticated = true;
                this.updateUI(true);
                
                // Actualizar estado unificado
                this.state.set('auth.isAuthenticated', true);
                this.state.set('auth.token', tokenData);
                
                await this.getPlaylists();
                
                if (this.authStatusCallback) {
                    this.authStatusCallback(true);
                }
                
                window.unifiedMessageManager?.show("Autenticación exitosa. Cargando tus playlists...", 'success');
                
            } catch (error) {
                console.error("❌ Error procesando token:", error);
                window.unifiedMessageManager?.show("Error al procesar la autenticación.", 'error');
            }
        } else {
            console.error("❌ No se obtuvo el token de acceso.");
            this.isAuthenticated = false;
            this.updateUI(false);
            
            this.state.set('auth.isAuthenticated', false);
            
            if (this.authStatusCallback) {
                this.authStatusCallback(false);
            }
            
            window.unifiedMessageManager?.show("Autenticación denegada o fallida.", 'error');
        }
    }

    async getPlaylists() {
        if (!this.isAuthenticated || !this.gapiReady) {
            console.error('❌ No autenticado o GAPI no está listo');
            return;
        }

        window.unifiedLoadingManager?.show('youtube-playlists', {
            type: 'overlay',
            message: 'Cargando playlists de YouTube...'
        });
        
        try {
            let allPlaylists = [];
            let nextPageToken = null;
            
            do {
                const response = await gapi.client.youtube.playlists.list({
                    'part': ['snippet', 'contentDetails'],
                    'mine': true,
                    'maxResults': 50,
                    'pageToken': nextPageToken
                });
                
                if (response.result && response.result.items) {
                    allPlaylists = allPlaylists.concat(response.result.items);
                }
                
                nextPageToken = response.result?.nextPageToken;
            } while (nextPageToken);
            
            console.log(`✅ Se obtuvieron ${allPlaylists.length} playlists de YouTube`);
            
            if (allPlaylists.length === 0) {
                window.unifiedMessageManager?.show("No se encontraron playlists en tu biblioteca de YouTube.", 'warning');
                return;
            }
            
            // Procesar playlists para formato unificado
            const processedPlaylists = allPlaylists.map(playlist => ({
                id: playlist.id,
                name: playlist.snippet?.title || 'Playlist Sin Nombre',
                thumbnailUrl: playlist.snippet?.thumbnails?.medium?.url || 
                             playlist.snippet?.thumbnails?.default?.url || '',
                videos: null, // Se cargarán bajo demanda
                isExpanded: false,
                source: 'youtube_library',
                isLoaded: false,
                itemCount: playlist.contentDetails?.itemCount || 0,
                originalData: playlist // Para referencia
            }));

            // Actualizar estado unificado
            this.state.set('playlist.playlistsData', processedPlaylists);

            // Disparar eventos
            document.dispatchEvent(new CustomEvent('playlistsFetched', { 
                detail: processedPlaylists 
            }));

            document.dispatchEvent(new CustomEvent('playlists-loaded', { 
                detail: { 
                    playlists: processedPlaylists, 
                    source: 'youtube_library',
                    count: processedPlaylists.length
                } 
            }));
                        
        } catch (err) {
            console.error("❌ Error al obtener playlists de YouTube:", err);
            window.unifiedMessageManager?.show("Error al cargar las playlists de YouTube.", 'error');
            
            if (err.status === 401) {
                this.performSignOut();
            }
        } finally {
            window.unifiedLoadingManager?.hide('youtube-playlists');
        }
    }

    async getPlaylistVideos(playlistId) {
        if (!this.isAuthenticated || !this.gapiReady) {
            console.error('❌ No autenticado o GAPI no está listo');
            throw new Error('No autenticado');
        }

        console.log(`📹 Obteniendo videos de playlist: ${playlistId}`);
        
        try {
            let allVideos = [];
            let nextPageToken = null;
            
            do {
                const response = await gapi.client.youtube.playlistItems.list({
                    'part': ['snippet', 'contentDetails'],
                    'playlistId': playlistId,
                    'maxResults': 50,
                    'pageToken': nextPageToken
                });
                
                if (response.result && response.result.items) {
                    const videos = response.result.items
                        .filter(item => item.snippet.title !== 'Private video' && item.snippet.title !== 'Deleted video')
                        .map(item => ({
                            videoId: item.snippet.resourceId.videoId,
                            title: item.snippet.title,
                            thumbnail: item.snippet.thumbnails?.medium?.url || 
                                      item.snippet.thumbnails?.default?.url || '',
                            channelTitle: item.snippet.channelTitle,
                            duration: 0, // Se podría obtener con una llamada adicional a la API
                            publishedAt: item.snippet.publishedAt
                        }));
                    
                    allVideos = allVideos.concat(videos);
                }
                
                nextPageToken = response.result?.nextPageToken;
            } while (nextPageToken);
            
            console.log(`✅ ${allVideos.length} videos obtenidos de playlist ${playlistId}`);
            return allVideos;
            
        } catch (error) {
            console.error(`❌ Error obteniendo videos de playlist ${playlistId}:`, error);
            throw error;
        }
    }

    handleSignOutClick() {
        this.performSignOut();
    }

    performSignOut() {
        try {
            if (window.gapi?.client) {
                const token = gapi.client.getToken();
                
                if (token && token.access_token) {
                    google.accounts.oauth2.revoke(token.access_token, () => {
                        console.log('✅ Token revocado exitosamente.');
                    });
                    gapi.client.setToken('');
                }
            }
            
            localStorage.removeItem('google_token');
            
            console.log('✅ Sesión cerrada.');
            this.isAuthenticated = false;
            this.updateUI(false);
            
            // Actualizar estado unificado
            this.state.set('auth.isAuthenticated', false);
            this.state.set('auth.token', null);
            
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
            
            window.unifiedMessageManager?.show("Sesión cerrada exitosamente.", 'success');
            
        } catch (error) {
            console.error('❌ Error al cerrar sesión:', error);
            
            // Forzar limpieza local
            localStorage.removeItem('google_token');
            this.isAuthenticated = false;
            this.updateUI(false);
            
            this.state.set('auth.isAuthenticated', false);
            
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
        }
    }

    updateUI(isLoggedIn) {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (isLoggedIn) {
            if (signInButton) {
                signInButton.classList.add('hidden');
                signInButton.disabled = false;
            }
            if (signOutButton) {
                signOutButton.classList.remove('hidden');
                signOutButton.disabled = false;
            }
        } else {
            if (signInButton) {
                signInButton.classList.remove('hidden');
                signInButton.disabled = false;
            }
            if (signOutButton) {
                signOutButton.classList.add('hidden');
                signOutButton.disabled = false;
            }
        }
    }

    setupButtonListeners() {
        // Esperar a que el DOM esté listo
        const setupButtons = () => {
            const signInButton = document.getElementById('googleSignInButton');
            const signOutButton = document.getElementById('googleSignOutButton');
            
            if (signInButton) {
                // Remover listeners existentes
                const newSignInButton = signInButton.cloneNode(true);
                signInButton.parentNode.replaceChild(newSignInButton, signInButton);
                
                newSignInButton.addEventListener('click', () => {
                    console.log('👤 Click en botón de iniciar sesión');
                    this.handleAuthClick();
                });
            }
            
            if (signOutButton) {
                // Remover listeners existentes
                const newSignOutButton = signOutButton.cloneNode(true);
                signOutButton.parentNode.replaceChild(newSignOutButton, signOutButton);
                
                newSignOutButton.addEventListener('click', () => {
                    console.log('👤 Click en botón de cerrar sesión');
                    this.handleSignOutClick();
                });
            }
            
            // Estado inicial
            this.updateUI(false);
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupButtons);
        } else {
            setupButtons();
        }
    }

    onAuthStatusChange(callback) {
        this.authStatusCallback = callback;
    }

    isUserAuthenticated() {
        return this.isAuthenticated && this.gapiReady;
    }

    async forceTokenRefresh() {
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken({ prompt: '' });
        }
    }

    getDebugInfo() {
        return {
            isAuthenticated: this.isAuthenticated,
            gapiReady: this.gapiReady,
            gisReady: this.gisReady,
            hasToken: !!(window.gapi?.client?.getToken()),
            tokenClient: !!this.tokenClient
        };
    }
}

// ===== REPRODUCTORES YOUTUBE MEJORADO =====
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

            // Initialize manual playlist if needed
            this.initializeManualPlaylist();
        }
    }

    onPlayerStateChange(event, playerNum) {
        const state = event.data;
        const videoData = event.target.getVideoData();
        
        if (state === YT.PlayerState.PLAYING) {
            this.state.set('app.hasOutroCrossfadeStarted', false);
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
        if (window.unifiedMessageManager) {
            window.unifiedMessageManager.show(`Error en reproductor ${playerNum}`, 'error');
        }
    }

    initializeManualPlaylist() {
        const playlistsData = this.state.get('playlist.playlistsData') || [];
        
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
            
            this.state.set('playlist.playlistsData', [manualPlaylist, ...playlistsData]);
            console.log('✅ Playlist manual inicializada');
        }
    }

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

    // Crossfade optimizado
    async performCrossfade(prevPlayer, nextPlayer) {
        if (this.state.get('app.crossfadeInProgress')) {
            console.log("Crossfade ya en progreso");
            return;
        }
        
        this.state.set('app.crossfadeInProgress', true);
        this.state.set('app.isAudioFading', true);
        
        const DURATION_MS = CONFIG.CROSSFADE_DURATION * 1000;
        const STEPS = 60;
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

// ===== GESTOR DE NAVEGACIÓN INTEGRADO =====
class UnifiedNavigationManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('click', (event) => {
            const navItem = event.target.closest('[data-view]');
            if (navItem) {
                event.preventDefault();
                const view = navItem.dataset.view;
                this.switchView(view);
            }
        });
    }

    switchView(viewName) {
        console.log(`📄 Cambiando a vista: ${viewName}`);
        
        // Actualizar estado
        this.state.set('ui.currentView', viewName);
        
        // Ocultar todas las vistas
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        // Mostrar vista objetivo
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
            
            // Actualizar navegación
            this.updateNavigation(viewName);
            
            // Acciones específicas por vista
            if (viewName === 'library') {
                setTimeout(() => this.updateLibraryView(), 100);
            } else if (viewName === 'search') {
                this.focusSearchInput();
            } else if (viewName === 'playing') {
                this.updatePlayingView();
            }
            
            console.log(`✅ Vista cambiada a: ${viewName}`);
        } else {
            console.error(`❌ Vista no encontrada: ${viewName}View`);
        }
    }

    updateNavigation(activeView) {
        document.querySelectorAll('[data-view]').forEach(item => {
            if (item.dataset.view === activeView) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    updateLibraryView() {
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        } else {
            this.renderLibraryFallback();
        }
    }

    renderLibraryFallback() {
        const container = document.getElementById('playlistsGrid');
        if (!container) return;

        const playlists = this.state.get('playlist.playlistsData') || [];
        
        if (playlists.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-music"></i>
                    <h3>¡Conecta tu cuenta de Google!</h3>
                    <p>Ve tus playlists de YouTube y crea mezclas increíbles</p>
                </div>
            `;
        } else {
            // Render playlists simple
            container.innerHTML = playlists.map(playlist => `
                <div class="playlist-card-expandable" data-playlist-id="${playlist.id}">
                    <div class="playlist-card-header">
                        <div class="playlist-card-image">
                            <img src="${playlist.thumbnailUrl}" alt="${SharedUtils.escapeHtml(playlist.name)}" loading="lazy">
                        </div>
                        <div class="playlist-card-info">
                            <h3 class="playlist-card-title">${SharedUtils.escapeHtml(playlist.name)}</h3>
                            <p class="playlist-card-meta">${playlist.videos?.length || playlist.itemCount || 0} videos</p>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    focusSearchInput() {
        const searchInput = document.getElementById('sidebarSearchInput') || 
                           document.getElementById('mobileSearchInput');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    updatePlayingView() {
        const currentInfo = this.state.get('playlist.currentPlayingInfo');
        const titleEl = document.getElementById('nowPlayingTitle');
        const artistEl = document.getElementById('nowPlayingArtist');
        
        if (currentInfo.videoId && titleEl && artistEl) {
            const flatList = this.getFlattenedPlaylist();
            const currentVideo = flatList[currentInfo.flattenedIndex];
            
            if (currentVideo) {
                titleEl.textContent = currentVideo.title;
                artistEl.textContent = currentVideo.channelTitle || 'YouTube';
            }
        }
    }

    getFlattenedPlaylist() {
        const playlists = this.state.get('playlist.playlistsData') || [];
        let flatList = [];
        
        playlists.forEach(playlist => {
            if (playlist.videos?.length > 0) {
                playlist.videos.forEach(video => {
                    flatList.push({ ...video, sourcePlaylistId: playlist.id });
                });
            }
        });
        
        return flatList;
    }
}

// ===== GESTOR DE BÚSQUEDA INTEGRADO =====
class UnifiedSearchManager {
    constructor(stateManager, navigationManager) {
        this.state = stateManager;
        this.navigation = navigationManager;
        this.setupSearchListeners();
    }

    setupSearchListeners() {
        const searchInputs = ['sidebarSearchInput', 'mobileSearchInput', 'searchInput'];
        
        searchInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                // Búsqueda al presionar Enter
                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        const query = input.value.trim();
                        if (query.length > 0) {
                            this.performSearch(query);
                        }
                    }
                });
                
                // Búsqueda con delay
                let searchTimeout;
                input.addEventListener('input', (event) => {
                    clearTimeout(searchTimeout);
                    const query = event.target.value.trim();
                    
                    if (query.length > 2) {
                        searchTimeout = setTimeout(() => {
                            this.performSearch(query);
                        }, 500);
                    }
                });
            }
        });
    }

    async performSearch(query) {
        console.log(`🔍 Iniciando búsqueda: ${query}`);
        
        // Cambiar a vista de búsqueda
        this.navigation.switchView('search');
        
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) {
            console.error('❌ Contenedor de resultados no encontrado');
            return;
        }
        
        // Mostrar loading
        searchResults.innerHTML = `
            <div class="search-loading" style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-color);"></i>
                <p style="margin-top: 16px; color: var(--text-secondary);">Buscando...</p>
            </div>
        `;
        
        try {
            let searchData = null;
            
            // Intentar con múltiples instancias
            for (const instance of CONFIG.PIPED_INSTANCES) {
                try {
                    console.log(`🔗 Probando instancia: ${instance}`);
                    
                    const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
                    const response = await SharedUtils.fetchWithTimeout(url, {}, 10000);
                    
                    if (response.ok) {
                        searchData = await response.json();
                        console.log(`✅ Búsqueda exitosa en: ${instance}`);
                        break;
                    }
                } catch (error) {
                    console.warn(`⚠️ Falló instancia ${instance}:`, error.message);
                    continue;
                }
            }
            
            if (!searchData) {
                throw new Error('Todas las instancias de búsqueda fallaron');
            }
            
            this.displaySearchResults(searchData);
            
        } catch (error) {
            console.error('❌ Error en búsqueda:', error);
            this.displaySearchError(error, query);
        }
    }

    displaySearchResults(data) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        const items = data.items || data.relatedStreams || [];
        
        if (!items || items.length === 0) {
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>No se encontraron resultados</p>
                </div>
            `;
            return;
        }
        
        searchResults.innerHTML = '';
        
        items.forEach(video => {
            const videoId = SharedUtils.extractVideoId(video);
            if (!videoId) return;
            
            const videoElement = this.createVideoResultElement(video, videoId);
            searchResults.appendChild(videoElement);
        });
        
        console.log(`✅ ${items.length} resultados mostrados`);
    }

    createVideoResultElement(video, videoId) {
        const videoDiv = document.createElement('div');
        videoDiv.className = 'video-result';
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
                <button class="search-result-add-button" onclick="window.unifiedCore.addVideoToQueue('${videoId}', '${title.replace(/'/g, "\\'")}', '${thumbnailUrl}', '${author.replace(/'/g, "\\'")}')">
                    <i class="fa-solid fa-arrow-right-to-line"></i>
                    <span class="add-text">Reproducir Después</span>
                </button>
            </div>
        `;
        
        return videoDiv;
    }

    displaySearchError(error, query) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        searchResults.innerHTML = `
            <div class="search-error" style="text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #f44336; margin-bottom: 16px;"></i>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">Error de búsqueda: ${error.message}</p>
                <button onclick="window.unifiedCore.searchManager.performSearch('${query}')" style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }
}

// ===== GESTOR DE PLAYLIST INTEGRADO =====
class UnifiedPlaylistManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.setupPlaylistUrlListener();
    }

    setupPlaylistUrlListener() {
        // Configurar listener del botón
        const addButton = document.getElementById('añadirUrlButton');
        if (addButton) {
            addButton.addEventListener('click', () => this.handlePlaylistUrlAdd());
        }
        
        // Configurar listener del input (Enter key)
        const urlInput = document.getElementById('searchInput2');
        if (urlInput) {
            urlInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    this.handlePlaylistUrlAdd();
                }
            });
        }
    }

    handlePlaylistUrlAdd() {
        const input = document.getElementById('searchInput2');
        if (!input) return;
        
        const url = input.value.trim();
        if (!url) {
            this.showMessage('Ingresa una URL válida', 'warning');
            return;
        }
        
        console.log(`🔗 Procesando URL: ${url}`);
        
        // Validar URL de YouTube
        if (!SharedUtils.isValidYouTubeUrl(url)) {
            this.showMessage('URL de YouTube no válida', 'error');
            return;
        }
        
        // Extraer playlist ID
        const playlistId = SharedUtils.extractPlaylistId(url);
        if (!playlistId) {
            this.showMessage('URL no contiene una playlist válida', 'error');
            return;
        }
        
        console.log(`📋 ID de playlist extraído: ${playlistId}`);
        
        // Limpiar input
        input.value = '';
        
        // Procesar playlist
        this.loadPlaylistFromUrl(playlistId, url);
    }

    async loadPlaylistFromUrl(playlistId, originalUrl) {
        this.showMessage('Cargando playlist...', 'info');
        
        try {
            let playlistData = null;
            
            for (const instance of CONFIG.PIPED_INSTANCES) {
                try {
                    console.log(`🔗 Intentando cargar playlist desde: ${instance}`);
                    
                    const response = await SharedUtils.fetchWithTimeout(`${instance}/playlists/${playlistId}`, {}, 15000);
                    
                    if (response.ok) {
                        playlistData = await response.json();
                        console.log(`✅ Playlist cargada desde: ${instance}`);
                        break;
                    }
                } catch (error) {
                    console.warn(`⚠️ Error en instancia ${instance}:`, error.message);
                    continue;
                }
            }
            
            if (!playlistData) {
                throw new Error('No se pudo cargar la playlist desde ninguna instancia');
            }
            
            // Procesar datos de la playlist
            const processedPlaylist = {
                id: playlistId,
                name: playlistData.name || 'Playlist Sin Nombre',
                thumbnailUrl: playlistData.thumbnailUrl || 'https://via.placeholder.com/320x180/333333/ffffff?text=Playlist',
                videos: [],
                isExpanded: true,
                source: 'external',
                isLoaded: true,
                itemCount: 0
            };
            
            // Procesar videos
            if (playlistData.relatedStreams && Array.isArray(playlistData.relatedStreams)) {
                processedPlaylist.videos = playlistData.relatedStreams
                    .filter(video => video && SharedUtils.extractVideoId(video))
                    .map(video => ({
                        videoId: SharedUtils.extractVideoId(video),
                        title: video.title || 'Título Desconocido',
                        thumbnail: video.thumbnail || `https://img.youtube.com/vi/${SharedUtils.extractVideoId(video)}/default.jpg`,
                        duration: SharedUtils.parseDuration(video.duration) || 0,
                        channelTitle: video.uploaderName || 'YouTube'
                    }));
                
                processedPlaylist.itemCount = processedPlaylist.videos.length;
            }
            
            if (processedPlaylist.videos.length === 0) {
                throw new Error('La playlist no contiene videos válidos');
            }
            
            // Añadir playlist al estado
            this.addPlaylistToState(processedPlaylist);
            
            this.showMessage(`Playlist "${processedPlaylist.name}" cargada (${processedPlaylist.videos.length} videos)`, 'success');
            
            // Cambiar a vista de biblioteca
            if (window.unifiedCore?.navigationManager) {
                window.unifiedCore.navigationManager.switchView('library');
            }
            
        } catch (error) {
            console.error('❌ Error cargando playlist:', error);
            this.showMessage(`Error cargando playlist: ${error.message}`, 'error');
        }
    }

    addPlaylistToState(playlist) {
        const currentPlaylists = this.state.get('playlist.playlistsData') || [];
        
        // Verificar duplicados
        if (currentPlaylists.some(p => p.id === playlist.id)) {
            this.showMessage('Esta playlist ya está cargada', 'warning');
            return;
        }
        
        const updatedPlaylists = [...currentPlaylists, playlist];
        this.state.set('playlist.playlistsData', updatedPlaylists);
        
        console.log(`✅ Playlist añadida: ${playlist.name} (${playlist.videos.length} videos)`);
    }

    addVideoToManualPlaylist(videoData) {
        const playlistsData = this.state.get('playlist.playlistsData') || [];
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        
        if (manualIndex === -1) {
            // Crear playlist manual si no existe
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
            
            const newPlaylistsData = [manualPlaylist, ...playlistsData];
            this.state.set('playlist.playlistsData', newPlaylistsData);
            
            // Recursively call with updated state
            return this.addVideoToManualPlaylist(videoData);
        }

        const manualPlaylist = playlistsData[manualIndex];

        // Check duplicates
        if (manualPlaylist.videos?.some(video => video.videoId === videoData.videoId)) {
            this.showMessage(`"${videoData.title}" ya está en la cola`, 'warning');
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

        const updatedPlaylistsData = [...playlistsData];
        updatedPlaylistsData[manualIndex] = {
            ...manualPlaylist,
            videos: [...(manualPlaylist.videos || []), videoObject],
            itemCount: (manualPlaylist.videos?.length || 0) + 1
        };
        
        this.state.set('playlist.playlistsData', updatedPlaylistsData);
        this.checkAndEnablePlayButton();
        
        console.log(`✅ Video añadido a cola: ${videoObject.title}`);
        return videoObject;
    }

    checkAndEnablePlayButton() {
        const flatList = this.getFlattenedPlaylist();
        const playersReady = this.state.get('app.playersInitialized');
        
        ['botonPlay', 'botonNext', 'prevButton'].forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.disabled = !(flatList.length > 0 && playersReady);
            }
        });
    }

    getFlattenedPlaylist() {
        const playlists = this.state.get('playlist.playlistsData') || [];
        let flatList = [];
        
        playlists.forEach(playlist => {
            if (playlist.videos?.length > 0) {
                playlist.videos.forEach(video => {
                    flatList.push({ ...video, sourcePlaylistId: playlist.id });
                });
            }
        });
        
        return flatList;
    }

    showMessage(message, type = 'info', duration = 3000) {
        if (window.unifiedMessageManager?.show) {
            return window.unifiedMessageManager.show(message, type, duration);
        }
        
        // Fallback simple
        console.log(`💬 [${type.toUpperCase()}]: ${message}`);
        
        // Create simple floating message
        const messageDiv = document.createElement('div');
        messageDiv.className = `floating-message ${type} show`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
            background: var(--background-elevated); color: var(--text-primary);
            padding: 12px 16px; border-radius: 8px; z-index: 3000;
            font-size: 14px; text-align: center; box-shadow: var(--shadow-medium);
            transition: all 0.3s ease; cursor: pointer; max-width: 400px;
        `;
        
        // Type-specific styling
        const typeStyles = {
            success: 'background: rgba(76, 175, 80, 0.9); color: white;',
            error: 'background: rgba(244, 67, 54, 0.9); color: white;',
            warning: 'background: rgba(255, 193, 7, 0.9); color: black;',
            info: 'background: rgba(33, 150, 243, 0.9); color: white;'
        };
        
        if (typeStyles[type]) {
            messageDiv.style.cssText += typeStyles[type];
        }
        
        document.body.appendChild(messageDiv);
        
        const remove = () => {
            messageDiv.style.opacity = '0';
            setTimeout(() => messageDiv.remove(), 300);
        };
        
        messageDiv.addEventListener('click', remove);
        setTimeout(remove, duration);
        
        return messageDiv;
    }
}

// ===== GESTOR DE REPRODUCCIÓN SIMPLIFICADO =====
class UnifiedPlaybackController {
    constructor(stateManager, youtubeManager, playlistManager) {
        this.state = stateManager;
        this.youtube = youtubeManager;
        this.playlistManager = playlistManager;
        this.setupPlaybackListeners();
    }

    setupPlaybackListeners() {
        // Configurar botón de play
        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.addEventListener('click', () => this.handlePlayButtonClick());
        }

        // Configurar botón next
        const nextButton = document.getElementById('botonNext');
        if (nextButton) {
            nextButton.addEventListener('click', () => this.playNextVideo());
        }
    }

    handlePlayButtonClick() {
        const playersReady = this.state.get('app.playersInitialized');
        if (!playersReady) {
            this.showMessage("Reproductores no están listos", 'warning');
            return;
        }

        const isPlaying = this.state.get('app.reproduccionIniciada');
        if (!isPlaying) {
            const flatList = this.playlistManager.getFlattenedPlaylist();
            if (flatList.length > 0) {
                this.playFirstVideo();
            } else {
                this.showMessage("No hay videos en la cola", 'warning');
            }
        } else {
            this.togglePlayback();
        }
    }

    togglePlayback() {
        const currentPlayer = this.youtube.getActivePlayer();
        if (currentPlayer) {
            try {
                const playerState = currentPlayer.getPlayerState();
                if (playerState === YT.PlayerState.PLAYING) {
                    currentPlayer.pauseVideo();
                } else {
                    currentPlayer.playVideo();
                }
            } catch (error) {
                console.error('❌ Error toggling playback:', error);
            }
        }
    }

    playFirstVideo() {
        const flatList = this.playlistManager.getFlattenedPlaylist();
        if (flatList.length === 0) {
            this.showMessage('No hay videos para reproducir', 'warning');
            return;
        }

        const firstVideo = flatList[0];
        console.log('▶️ Reproduciendo primer video:', firstVideo.videoId);

        try {
            const player1 = this.state.get('app.player1');
            const player2 = this.state.get('app.player2');
            
            if (player2) this.youtube.safeStopPlayer(player2);
            
            player1.loadVideoById(firstVideo.videoId);
            player1.setVolume(100);

            // Update UI
            document.getElementById('player1')?.classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2')?.classList.add('hidden');
            
            // Update state
            this.state.set('app.currentPlayer', 1);
            this.state.set('app.reproduccionIniciada', true);
            this.state.set('playlist.currentPlayingInfo.flattenedIndex', 0);
            this.state.set('playlist.currentPlayingInfo.videoId', firstVideo.videoId);
            this.state.set('playlist.currentPlayingInfo.playlistId', firstVideo.sourcePlaylistId);

            // Update play button
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-pause"></i>';
                playButton.disabled = false;
            }

            this.startMonitoring();
            this.showMessage('Reproducción iniciada', 'success');

        } catch (error) {
            console.error("❌ Error iniciando reproducción:", error);
            this.showMessage('Error iniciando reproducción', 'error');
        }
    }

    playNextVideo() {
        const currentIndex = this.state.get('playlist.currentPlayingInfo.flattenedIndex');
        const flatList = this.playlistManager.getFlattenedPlaylist();

        if (currentIndex < 0 || flatList.length === 0) {
            this.showMessage('No hay siguiente video', 'warning');
            return;
        }

        const nextIndex = currentIndex + 1;
        if (nextIndex >= flatList.length) {
            this.showMessage('Final de la lista', 'info');
            return;
        }

        const nextVideo = flatList[nextIndex];
        console.log('⏭️ Reproduciendo siguiente video:', nextVideo.videoId);

        try {
            const currentPlayerNum = this.state.get('app.currentPlayer');
            const nextPlayerNum = currentPlayerNum === 1 ? 2 : 1;
            const nextPlayer = nextPlayerNum === 1 ? this.state.get('app.player1') : this.state.get('app.player2');

            if (nextPlayer) {
                nextPlayer.loadVideoById(nextVideo.videoId);
                nextPlayer.setVolume(100);

                // Update UI
                document.getElementById(`player${currentPlayerNum}`)?.classList.add('hidden');
                document.getElementById(`player${nextPlayerNum}`)?.classList.remove('hidden');

                // Update state
                this.state.set('app.currentPlayer', nextPlayerNum);
                this.state.set('playlist.currentPlayingInfo.flattenedIndex', nextIndex);
                this.state.set('playlist.currentPlayingInfo.videoId', nextVideo.videoId);
                this.state.set('playlist.currentPlayingInfo.playlistId', nextVideo.sourcePlaylistId);
            }

        } catch (error) {
            console.error("❌ Error reproduciendo siguiente:", error);
            this.showMessage('Error cambiando video', 'error');
        }
    }

    startMonitoring() {
        if (this.state.get('app.monitorInterval')) {
            clearInterval(this.state.get('app.monitorInterval'));
        }

        const interval = setInterval(() => {
            const activePlayer = this.youtube.getActivePlayer();
            if (!activePlayer) return;

            try {
                const currentTime = activePlayer.getCurrentTime();
                const duration = activePlayer.getDuration();
                const timeRemaining = duration - currentTime;

                // Auto-advance when near end
                if (timeRemaining <= 5 && timeRemaining > 0) {
                    console.log('⏭️ Auto-avanzando al siguiente video');
                    clearInterval(this.state.get('app.monitorInterval'));
                    this.state.set('app.monitorInterval', null);
                    
                    setTimeout(() => this.playNextVideo(), 1000);
                }

            } catch (error) {
                console.warn('⚠️ Error en monitoreo:', error);
            }
        }, 1000);

        this.state.set('app.monitorInterval', interval);
    }

    showMessage(message, type = 'info') {
        if (window.unifiedCore?.playlistManager?.showMessage) {
            window.unifiedCore.playlistManager.showMessage(message, type);
        } else {
            console.log(`💬 [${type.toUpperCase()}]: ${message}`);
        }
    }
}

// ===== CLASE PRINCIPAL UNIFICADA =====
class YTCrossMixUnified {
    constructor() {
        this.initialized = false;
        this.stateManager = null;
        this.youtubeManager = null;
        this.navigationManager = null;
        this.searchManager = null;
        this.playlistManager = null;
        this.authManager = null;
        this.playbackController = null;
    }

    async initialize() {
        console.log('🚀 Inicializando YT CrossMix Sistema Unificado...');
        
        try {
            // Initialize core managers
            this.stateManager = new UnifiedStateManager();
            window.unifiedStateManager = this.stateManager;
            
            this.youtubeManager = new UnifiedYouTubeManager(this.stateManager);
            window.unifiedYouTubeManager = this.youtubeManager;
            
            this.navigationManager = new UnifiedNavigationManager(this.stateManager);
            this.searchManager = new UnifiedSearchManager(this.stateManager, this.navigationManager);
            this.playlistManager = new UnifiedPlaylistManager(this.stateManager);
            this.authManager = new UnifiedAuthManager(this.stateManager);
            
            // Initialize YouTube Manager
            await this.youtubeManager.initialize();
            
            // Initialize playback controller after YouTube is ready
            this.playbackController = new UnifiedPlaybackController(
                this.stateManager,
                this.youtubeManager,
                this.playlistManager
            );
            
            // Setup global references
            this.setupGlobalReferences();
            
            // Setup event listeners
            this.setupEventListeners();
            
            this.initialized = true;
            
            console.log('✅ YT CrossMix Sistema Unificado inicializado');
            
            // Set initial view
            this.navigationManager.switchView('home');
            
            // Dispatch ready event
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:ready', {
                detail: {
                    initialized: true,
                    timestamp: Date.now()
                }
            }));
            
            // Show success message
            setTimeout(() => {
                this.showMessage('Sistema listo para usar', 'success');
            }, 1000);
            
        } catch (error) {
            console.error('💥 Error inicializando sistema unificado:', error);
            
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:error', {
                detail: { error: error.message, timestamp: Date.now() }
            }));
            
            throw error;
        }
    }

    setupGlobalReferences() {
        // Core references
        window.unifiedCore = this;
        window.SharedUtils = SharedUtils;
        window.CONFIG = CONFIG;
        
        // Manager references
        window.unifiedNavigationManager = this.navigationManager;
        window.unifiedSearchManager = this.searchManager;
        window.unifiedPlaylistManager = this.playlistManager;
        window.unifiedAuthManager = this.authManager;
        window.unifiedPlaybackController = this.playbackController;
        
        // Legacy compatibility functions
        window.switchView = (view) => this.navigationManager.switchView(view);
        window.performSearch = (query) => this.searchManager.performSearch(query);
        
        console.log('✅ Referencias globales configuradas');
    }

    setupEventListeners() {
        // Listen for playlist events from auth.js
        document.addEventListener('playlistsFetched', (event) => {
            console.log('📚 Playlists obtenidas desde Google:', event.detail?.length || 0);
            
            if (event.detail && Array.isArray(event.detail)) {
                this.addYouTubeLibraryPlaylists(event.detail);
            }
        });

        document.addEventListener('userLoggedOut', () => {
            console.log('👤 Usuario deslogueado');
            this.clearYouTubeLibraryPlaylists();
        });

        // Player state changes
        document.addEventListener('unifiedPlayerStateChanged', (event) => {
            const { playerNum, state: playerState } = event.detail;
            
            // Update play buttons
            const playButtons = document.querySelectorAll('#botonPlay, #miniPlayBtn');
            playButtons.forEach(button => {
                if (playerState === 1) { // YT.PlayerState.PLAYING
                    button.innerHTML = '<i class="fas fa-pause"></i>';
                } else if (playerState === 2 || playerState === 0) { // PAUSED or ENDED
                    button.innerHTML = '<i class="fas fa-play"></i>';
                }
            });
        });

        console.log('✅ Event listeners configurados');
    }

    addYouTubeLibraryPlaylists(youtubePlaylists) {
        if (!youtubePlaylists?.length) return;

        const currentPlaylists = this.stateManager.get('playlist.playlistsData') || [];
        const existingIds = new Set(currentPlaylists.map(p => p.id));
        
        const newPlaylists = youtubePlaylists
            .filter(playlist => 
                playlist.snippet?.title && 
                playlist.contentDetails?.itemCount > 0 &&
                !existingIds.has(playlist.id)
            )
            .map(playlist => ({
                id: playlist.id,
                name: playlist.snippet.title,
                thumbnailUrl: playlist.snippet.thumbnails?.high?.url || 
                             playlist.snippet.thumbnails?.default?.url || 
                             'https://via.placeholder.com/320x180/333333/ffffff?text=Playlist',
                videos: [],
                isExpanded: false,
                source: CONFIG.YOUTUBE_LIBRARY_SOURCE_ID,
                isLoaded: false,
                itemCount: playlist.contentDetails.itemCount,
                originalData: playlist
            }));

        if (newPlaylists.length === 0) {
            this.showMessage('No hay playlists nuevas para añadir', 'info');
            return;
        }

        const manualPlaylist = currentPlaylists.find(p => p.id === 'manual');
        const otherPlaylists = currentPlaylists.filter(p => p.id !== 'manual');
        
        const finalPlaylists = [
            ...(manualPlaylist ? [manualPlaylist] : []),
            ...otherPlaylists,
            ...newPlaylists
        ];
        
        this.stateManager.set('playlist.playlistsData', finalPlaylists);
        
        console.log(`✅ ${newPlaylists.length} playlists de YouTube añadidas`);
        this.showMessage(`${newPlaylists.length} playlists añadidas`, 'success');
        
        // Update library view if active
        const currentView = this.stateManager.get('ui.currentView');
        if (currentView === 'library') {
            setTimeout(() => this.navigationManager.updateLibraryView(), 300);
        }
    }

    clearYouTubeLibraryPlaylists() {
        const currentPlaylists = this.stateManager.get('playlist.playlistsData') || [];
        const filteredPlaylists = currentPlaylists.filter(p => p.source !== CONFIG.YOUTUBE_LIBRARY_SOURCE_ID);
        const removedCount = currentPlaylists.length - filteredPlaylists.length;
        
        if (removedCount > 0) {
            this.stateManager.set('playlist.playlistsData', filteredPlaylists);
            
            // Update library view if active
            const currentView = this.stateManager.get('ui.currentView');
            if (currentView === 'library') {
                setTimeout(() => this.navigationManager.updateLibraryView(), 300);
            }
            
            console.log(`✅ ${removedCount} playlists de YouTube eliminadas`);
        }
    }

    // Public API methods
    addVideoToQueue(videoId, title, thumbnail, author) {
        console.log(`➕ Añadiendo a cola: ${title}`);
        
        const videoData = {
            videoId: videoId,
            title: title,
            thumbnail: thumbnail,
            channelTitle: author,
            duration: 0
        };
        
        const result = this.playlistManager.addVideoToManualPlaylist(videoData);
        if (result) {
            this.showMessage(`"${title}" añadido a la cola`, 'success');
        }
        
        return result;
    }

    showMessage(message, type = 'info', duration = 3000) {
        return this.playlistManager.showMessage(message, type, duration);
    }

    // Debug and utility methods
    getDebugInfo() {
        return {
            initialized: this.initialized,
            stateSnapshot: {
                playlistCount: this.stateManager?.get('playlist.playlistsData')?.length || 0,
                currentView: this.stateManager?.get('ui.currentView'),
                isPlaying: this.stateManager?.get('app.reproduccionIniciada'),
                currentPlayer: this.stateManager?.get('app.currentPlayer'),
                currentVideoId: this.stateManager?.get('playlist.currentPlayingInfo.videoId')
            },
            managersReady: {
                stateManager: !!this.stateManager,
                youtubeManager: !!this.youtubeManager,
                navigationManager: !!this.navigationManager,
                searchManager: !!this.searchManager,
                playlistManager: !!this.playlistManager,
                authManager: !!this.authManager,
                playbackController: !!this.playbackController
            },
            timestamp: Date.now()
        };
    }

    performHealthCheck() {
        return {
            initialized: this.initialized,
            youtubeAPIReady: !!(window.YT && window.YT.Player),
            playersReady: this.youtubeManager?.playersReady || false,
            authManagerAvailable: !!(window.authManager),
            requiredElementsPresent: {
                player1: !!document.getElementById('player1'),
                player2: !!document.getElementById('player2'),
                searchResults: !!document.getElementById('searchResults'),
                playlistsGrid: !!document.getElementById('playlistsGrid')
            },
            timestamp: Date.now()
        };
    }
}

// ===== INITIALIZATION =====
// Create global instance
window.ytCrossMixUnified = new YTCrossMixUnified();
window.unifiedCore = window.ytCrossMixUnified;

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

// Global YouTube API ready callback
window.onYouTubeIframeAPIReady = function() {
    console.log('📺 YouTube Iframe API Ready (Global Callback)');
    if (window.unifiedYouTubeManager) {
        window.unifiedYouTubeManager.apiReady = true;
        if (!window.unifiedYouTubeManager.playersReady) {
            window.unifiedYouTubeManager.createPlayers();
        }
    }
};

// ===== FALLBACK Y COMPATIBILITY =====
// Legacy compatibility functions for existing code
window.addVideoToQueue = function(videoId, title, thumbnail, author) {
    if (window.unifiedCore && window.unifiedCore.addVideoToQueue) {
        return window.unifiedCore.addVideoToQueue(videoId, title, thumbnail, author);
    } else {
        console.warn('⚠️ Sistema unificado no disponible para addVideoToQueue');
        return null;
    }
};

window.showMessage = function(message, type = 'info', duration = 3000) {
    if (window.unifiedCore && window.unifiedCore.showMessage) {
        return window.unifiedCore.showMessage(message, type, duration);
    } else {
        console.log(`💬 [${type.toUpperCase()}]: ${message}`);
        return null;
    }
};

// Legacy playlist functions
window.getFlattenedPlaylist = function() {
    if (window.unifiedCore && window.unifiedCore.playlistManager) {
        return window.unifiedCore.playlistManager.getFlattenedPlaylist();
    }
    return [];
};

window.updatePlaylistsUI = function() {
    if (window.unifiedCore && window.unifiedCore.navigationManager) {
        window.unifiedCore.navigationManager.updateLibraryView();
    } else {
        console.warn('⚠️ Sistema unificado no disponible para updatePlaylistsUI');
    }
};

// Legacy search function
window.performSearch = function(query) {
    if (window.unifiedCore && window.unifiedCore.searchManager) {
        return window.unifiedCore.searchManager.performSearch(query);
    } else {
        console.warn('⚠️ Sistema unificado no disponible para performSearch');
    }
};

// ===== DEBUG Y TESTING =====
// Debug functions for development
window.debugUnified = function() {
    if (!window.unifiedCore) {
        console.error('❌ Sistema unificado no disponible');
        return;
    }
    
    console.log('🔧 Debug Info del Sistema Unificado:');
    console.table(window.unifiedCore.getDebugInfo());
    
    const health = window.unifiedCore.performHealthCheck();
    console.log('🏥 Health Check:');
    console.table(health);
    
    if (window.unifiedCore.showMessage) {
        window.unifiedCore.showMessage('Debug ejecutado (ver consola)', 'info', 2000);
    }
};

window.resetUnified = function() {
    if (!confirm('¿Reiniciar completamente el sistema unificado?')) {
        return;
    }
    
    console.log('🔄 Reiniciando sistema unificado...');
    
    try {
        // Clear intervals
        if (window.unifiedStateManager?.state) {
            const state = window.unifiedStateManager.state;
            
            if (state.app.monitorInterval) {
                clearInterval(state.app.monitorInterval);
                window.unifiedStateManager.set('app.monitorInterval', null);
            }
            
            if (state.app.crossfadeInterval) {
                clearInterval(state.app.crossfadeInterval);
                window.unifiedStateManager.set('app.crossfadeInterval', null);
            }
        }
        
        // Stop players
        try {
            const state = window.unifiedStateManager?.state;
            if (state?.app.player1) state.app.player1.stopVideo();
            if (state?.app.player2) state.app.player2.stopVideo();
        } catch (e) {
            console.warn('Error stopping players:', e);
        }
        
        // Clear storage
        ['google_token', 'ytcrossmix_state_backup'].forEach(item => {
            localStorage.removeItem(item);
            sessionStorage.removeItem(item);
        });
        
        // Reset state
        if (window.unifiedStateManager) {
            window.unifiedStateManager.state = {
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
                    isLoadingMore: false
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
        }
        
        // Reset UI
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        const homeView = document.getElementById('homeView');
        if (homeView) {
            homeView.classList.add('active');
        }
        
        document.querySelectorAll('[data-view]').forEach(item => {
            item.classList.remove('active');
        });
        
        const homeNavItem = document.querySelector('[data-view="home"]');
        if (homeNavItem) {
            homeNavItem.classList.add('active');
        }
        
        // Reset play button
        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.disabled = true;
        }
        
        // Clear search results
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                </div>
            `;
        }
        
        // Clear playlists grid
        const playlistsGrid = document.getElementById('playlistsGrid');
        if (playlistsGrid) {
            playlistsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-music"></i>
                    <h3>¡Conecta tu cuenta de Google!</h3>
                    <p>Ve tus playlists de YouTube y crea mezclas increíbles</p>
                </div>
            `;
        }
        
        console.log('✅ Reset completo del sistema unificado');
        
        if (window.unifiedCore && window.unifiedCore.showMessage) {
            setTimeout(() => {
                window.unifiedCore.showMessage('Sistema reiniciado correctamente', 'success', 3000);
            }, 1000);
        }
        
        // Re-initialize
        setTimeout(() => {
            if (window.ytCrossMixUnified?.initialize) {
                window.ytCrossMixUnified.initialize();
            }
        }, 2000);
        
    } catch (error) {
        console.error('💥 Error durante reset:', error);
        if (confirm('Error durante reset. ¿Recargar la página?')) {
            location.reload();
        }
    }
};

// Keyboard shortcuts for debugging
document.addEventListener('keydown', function(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }
    
    // Ctrl + Shift + D = Debug
    if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        window.debugUnified();
    }
    
    // Ctrl + Shift + R = Reset
    if (event.ctrlKey && event.shiftKey && event.key === 'R') {
        event.preventDefault();
        window.resetUnified();
    }
    
    // Ctrl + Shift + H = Health Check
    if (event.ctrlKey && event.shiftKey && event.key === 'H') {
        event.preventDefault();
        const health = window.unifiedCore?.performHealthCheck?.();
        if (health) {
            console.log('🏥 Health Check:', health);
            window.unifiedCore?.showMessage?.('Health check ejecutado (ver consola)', 'info');
        }
    }
});

// ===== SYSTEM HEALTH MONITORING =====
// Monitor system health periodically
setInterval(() => {
    if (window.unifiedCore && window.unifiedCore.performHealthCheck) {
        const health = window.unifiedCore.performHealthCheck();
        
        // Log warnings for critical issues
        if (!health.initialized) {
            console.warn('⚠️ Sistema unificado no inicializado');
        }
        
        if (!health.youtubeAPIReady) {
            console.warn('⚠️ YouTube API no está lista');
        }
        
        if (!health.playersReady && health.youtubeAPIReady) {
            console.warn('⚠️ Reproductores no están listos');
        }
    }
}, 30000); // Check every 30 seconds

// ===== ERROR HANDLING =====
// Global error handler
window.addEventListener('error', function(event) {
    // Filter out extension errors
    if (event.error && event.error.message && 
        (event.error.message.includes('Extension') || 
         event.error.message.includes('chrome-extension'))) {
        return;
    }
    
    console.error('🚨 Global Error:', event.error);
    
    // Show user-friendly error
    if (window.unifiedCore && window.unifiedCore.showMessage) {
        if (!event.error.message?.includes('Script error')) {
            window.unifiedCore.showMessage('Ha ocurrido un error inesperado', 'error', 5000);
        }
    }
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('🚨 Unhandled Promise Rejection:', event.reason);
    event.preventDefault();
    
    // Show user-friendly error
    if (window.unifiedCore && window.unifiedCore.showMessage &&
        !event.reason?.message?.includes('Extension') &&
        !event.reason?.message?.includes('NetworkError')) {
        window.unifiedCore.showMessage('Error de conexión o servicio', 'warning', 3000);
    }
});

// ===== FINAL SETUP =====
console.log('✅ Core Unificado con Correcciones cargado');
console.log('🔧 Debug: Ctrl+Shift+D | Reset: Ctrl+Shift+R | Health: Ctrl+Shift+H');
console.log('📝 API Global: window.unifiedCore, window.debugUnified(), window.resetUnified()');

// Fallback initialization with timeout
setTimeout(() => {
    if (!window.unifiedCore || !window.unifiedCore.initialized) {
        console.warn('⚠️ Sistema unificado no se inicializó en 10 segundos, reintentando...');
        
        if (window.ytCrossMixUnified && !window.ytCrossMixUnified.initialized) {
            window.ytCrossMixUnified.initialize().catch(error => {
                console.error('❌ Error en inicialización fallback:', error);
                
                // Show error to user
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = `
                    position: fixed; top: 20px; right: 20px; 
                    background: #f44336; color: white; padding: 16px; 
                    border-radius: 8px; z-index: 9999; max-width: 300px;
                    font-size: 14px; line-height: 1.4;
                `;
                errorDiv.innerHTML = `
                    <strong>Error del Sistema</strong><br>
                    El sistema no se pudo inicializar correctamente.<br>
                    <button onclick="location.reload()" style="
                        background: rgba(255,255,255,0.2); color: white; 
                        border: none; padding: 8px 12px; border-radius: 4px; 
                        margin-top: 8px; cursor: pointer;
                    ">Recargar Página</button>
                `;
                document.body.appendChild(errorDiv);
                
                setTimeout(() => errorDiv.remove(), 15000);
            });
        }
    }
}, 10000);
