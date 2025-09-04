// core.js - Sistema Unificado YT CrossMix
// Combina funcionalidades de los backups en una arquitectura moderna

console.log('🚀 Iniciando YT CrossMix - Sistema Unificado');

// =============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// =============================================
const CROSSFADE_DURATION = 15; // Duración del crossfade en segundos
const YOUTUBE_LIBRARY_SOURCE_ID = 'youtube_library';

let player1, player2;
let currentPlayer = 1;
let monitorInterval;
let playersInitialized = false;
let youtubeAPIReady = false;
let isTransitioning = false;
let isAudioFading = false;
let hasOutroCrossfadeStarted = false;
let crossfadeInterval = null;
let crossfadeInProgress = false;
let reproduccionIniciada = false;

// Estado de playlists y reproducción
let playlistsData = [];
let currentPlayingInfo = {
    playlistId: null,
    videoId: null,
    flattenedIndex: -1
};

// Variables para búsqueda
let isLoadingMore = false;
let nextPageContext = null;
let currentSearchQuery = '';

// Variables SponsorBlock
let segmentosCache = {};
let lastSeekEndTime = -1;
let lastSeekVideoId = null;

// Estado del sistema unificado
const unifiedState = {
    initialized: false,
    currentView: 'home',
    debugMode: false,
    authReady: false,
    playersReady: false
};

// =============================================
// SISTEMA UNIFICADO - CORE
// =============================================
class UnifiedCore {
    constructor() {
        this.state = unifiedState;
        this.views = ['home', 'search', 'library', 'playing'];
        this.currentView = 'home';
        this.debugMode = localStorage.getItem('ytcm_debug') === 'true';
        this.init();
    }

    async init() {
        console.log('🔧 Inicializando Sistema Unificado...');
        this.updateStatusIndicator('Inicializando...', 'loading');
        
        // Configurar debug
        if (this.debugMode) {
            this.enableDebugMode();
        }
        
        // Inicializar componentes
        await this.initializeComponents();
        
        // Configurar eventos
        this.setupEventListeners();
        
        // Cargar datos iniciales
        this.loadInitialData();
        
        this.state.initialized = true;
        this.updateStatusIndicator('Sistema Listo', 'success');
        this.enableUnifiedElements();
        
        console.log('✅ Sistema Unificado Inicializado');
    }

    async initializeComponents() {
        // Esperar a que las APIs estén disponibles
        if (!window.ytCrossMixAPIs?.ready) {
            console.log('⏳ Esperando a que las APIs estén listas...');
            await new Promise((resolve) => {
                const checkAPIs = () => {
                    if (window.ytCrossMixAPIs?.ready) {
                        resolve();
                    } else {
                        setTimeout(checkAPIs, 100);
                    }
                };
                checkAPIs();
                
                // Timeout de seguridad
                setTimeout(resolve, 10000);
            });
        }
        
        // Inicializar YouTube API
        await this.initializeYouTubeAPI();
        
        // Inicializar Auth
        this.initializeAuth();
        
        // Configurar UI inicial
        this.initializeUI();
    }

    async initializeYouTubeAPI() {
        console.log('🎵 Configurando reproductores de YouTube...');
        
        if (window.YT && window.YT.Player) {
            this.initializePlayers();
            return;
        }
        
        // Esperar a que YouTube API esté disponible
        return new Promise((resolve) => {
            const originalCallback = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (originalCallback) originalCallback();
                this.initializePlayers();
                resolve();
            };
        });
    }

    initializePlayers() {
        if (player1 && player2) return;

        console.log('🎮 Inicializando reproductores...');

        const playerConfig = {
            height: '100%',
            width: '100%',
            playerVars: { 'playsinline': 1 },
            events: {
                'onReady': (event) => this.onPlayerReady(event),
                'onStateChange': (event) => this.onPlayerStateChange(event),
                'onError': (event) => this.onPlayerError(event)
            }
        };

        player1 = new YT.Player('player1', playerConfig);
        player2 = new YT.Player('player2', playerConfig);
    }

    onPlayerReady(event) {
        console.log('✅ Reproductor listo');
        if (player1 && player2) {
            playersInitialized = true;
            this.state.playersReady = true;
            this.updatePlayersStatus('Reproductores listos');
            this.enablePlayButton();
        }
    }

    onPlayerStateChange(event) {
        const player = event.target;
        const state = event.data;
        
        if (state === YT.PlayerState.ENDED) {
            console.log('📻 Video terminado, reproduciendo siguiente...');
            this.playNextVideo();
        } else if (state === YT.PlayerState.PLAYING) {
            hasOutroCrossfadeStarted = false;
            this.updateCurrentPlayingInfo();
        }
    }

    onPlayerError(event) {
        console.error('❌ Error en reproductor:', event.data);
        this.showMessage(`Error en reproductor: ${event.data}`, 'error');
    }

    initializeAuth() {
        // Configurar eventos de autenticación
        document.addEventListener('playlistsFetched', (event) => {
            console.log("📁 Playlists de biblioteca recibidas");
            this.addYouTubeLibraryPlaylists(event.detail);
        });

        document.addEventListener('userLoggedOut', () => {
            console.log("🚪 Usuario desconectado");
            this.clearYouTubeLibraryPlaylists();
        });
    }

    initializeUI() {
        // Asegurar que existe la playlist manual
        if (!playlistsData.some(p => p.id === 'manual')) {
            playlistsData.push({
                id: 'manual',
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true
            });
        }

        this.updatePlaylistsUI();
        this.updateOverviewStats();
    }

    setupEventListeners() {
        // Navegación
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });

        // Botones de control
        this.setupControlButtons();
        
        // Búsqueda
        this.setupSearch();
        
        // Añadir playlist por URL
        this.setupPlaylistInput();
        
        // Cola de reproducción
        this.setupQueue();
        
        // Cerrar menús al hacer clic fuera
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.delete-menu')) {
                this.closeAllContextMenus();
            }
        }, true);
    }

    setupControlButtons() {
        const playBtn = document.getElementById('botonPlay');
        const nextBtn = document.getElementById('botonNext');
        const prevBtn = document.getElementById('prevButton');

        if (playBtn) {
            playBtn.addEventListener('click', () => this.handlePlayPause());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.handleNext());
        }
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.handlePrevious());
        }
    }

    setupSearch() {
        const searchInputs = [
            document.getElementById('searchInput'),
            document.getElementById('sidebarSearchInput'),
            document.getElementById('mobileSearchInput')
        ].filter(Boolean);

        const debouncedSearch = this.debounce((query) => {
            this.performSearch(query);
        }, 500);

        searchInputs.forEach(input => {
            input.addEventListener('input', (event) => {
                const query = event.target.value.trim();
                if (query.length > 2) {
                    debouncedSearch(query);
                    if (this.currentView !== 'search') {
                        this.switchView('search');
                    }
                } else {
                    this.clearSearchResults();
                }
            });
        });
    }

    setupPlaylistInput() {
        const urlInput = document.getElementById('searchInput2');
        const addBtn = document.getElementById('añadirUrlButton');

        if (addBtn && urlInput) {
            addBtn.addEventListener('click', async () => {
                const url = urlInput.value.trim();
                if (!url) return;

                const playlistId = this.extractPlaylistId(url);
                if (!playlistId) {
                    this.showMessage('URL de playlist no válida', 'error');
                    return;
                }

                urlInput.value = '';
                this.showMessage('Cargando playlist...', 'loading');

                try {
                    const playlistInfo = await this.getPlaylistInfo(playlistId);
                    if (playlistInfo) {
                        playlistInfo.id = playlistId;
                        this.handlePlaylistLoaded(playlistInfo);
                    }
                } catch (error) {
                    console.error("Error cargando playlist:", error);
                    this.showMessage(`Error al cargar playlist: ${error.message}`, 'error');
                }
            });
        }
    }

    setupQueue() {
        const queueBtn = document.getElementById('queueButton');
        const queueCloseBtn = document.getElementById('queueCloseBtn');
        const queueSection = document.getElementById('queueSection');

        if (queueBtn) {
            queueBtn.addEventListener('click', () => {
                queueSection?.classList.toggle('hidden');
                this.switchView('playing');
            });
        }

        if (queueCloseBtn) {
            queueCloseBtn.addEventListener('click', () => {
                queueSection?.classList.add('hidden');
            });
        }
    }

    // =============================================
    // GESTIÓN DE VISTAS
    // =============================================
    switchView(viewName) {
        if (!this.views.includes(viewName)) return;

        console.log(`🔄 Cambiando a vista: ${viewName}`);

        // Actualizar navegación activa
        document.querySelectorAll('.nav-item, .tab, .nav-tab').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll(`[data-view="${viewName}"]`).forEach(item => {
            item.classList.add('active');
        });

        // Ocultar todas las vistas
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });

        // Mostrar vista seleccionada
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
        }

        this.currentView = viewName;

        // Acciones específicas por vista
        switch (viewName) {
            case 'library':
                this.refreshLibraryView();
                break;
            case 'search':
                this.focusSearchInput();
                break;
            case 'playing':
                this.refreshPlayingView();
                break;
        }
    }

    refreshLibraryView() {
        this.updatePlaylistsUI();
    }

    refreshPlayingView() {
        this.updateNowPlaying();
        this.updateQueueDisplay();
    }

    focusSearchInput() {
        const searchInput = document.getElementById('sidebarSearchInput') || 
                          document.getElementById('searchInput');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    // =============================================
    // GESTIÓN DE PLAYLISTS
    // =============================================
    updatePlaylistsUI() {
        const container = document.getElementById('playlistsGrid');
        const queueContainer = document.getElementById('playlistContainer');
        
        if (!container && !queueContainer) return;

        const playingVideoId = currentPlayingInfo.videoId;

        // Actualizar vista de biblioteca
        if (container) {
            if (playlistsData.length === 0) {
                container.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-music"></i>
                        <p><strong>¡Conecta tu cuenta de Google!</strong></p>
                        <p>Ve tus playlists de YouTube y crea mezclas increíbles</p>
                        <p><small>Powered by Sistema Unificado</small></p>
                    </div>
                `;
            } else {
                container.innerHTML = '';
                playlistsData.forEach(playlist => {
                    const card = this.createPlaylistCard(playlist);
                    container.appendChild(card);
                });
            }
        }

        // Actualizar cola de reproducción
        if (queueContainer) {
            this.updateQueueDisplay();
        }

        this.updateOverviewStats();
    }

    createPlaylistCard(playlist) {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.dataset.playlistId = playlist.id;

        card.innerHTML = `
            <div class="playlist-card-image">
                <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" loading="lazy">
                <div class="playlist-card-overlay">
                    <button class="play-playlist-btn" data-playlist-id="${playlist.id}">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="playlist-card-info">
                <h3 class="playlist-card-title" title="${playlist.name}">${playlist.name}</h3>
                <p class="playlist-card-count">${playlist.videos.length} videos</p>
                ${playlist.source === YOUTUBE_LIBRARY_SOURCE_ID ? 
                    '<span class="playlist-source-badge"><i class="fab fa-youtube"></i> YouTube</span>' : 
                    '<span class="playlist-source-badge"><i class="fas fa-user"></i> Personal</span>'
                }
            </div>
        `;

        // Event listener para reproducir playlist
        const playBtn = card.querySelector('.play-playlist-btn');
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playPlaylist(playlist.id);
        });

        return card;
    }

    updateQueueDisplay() {
        const queueContainer = document.getElementById('playlistContainer');
        if (!queueContainer) return;

        const flatList = this.getFlattenedPlaylist();
        
        if (flatList.length === 0) {
            queueContainer.innerHTML = `
                <div class="empty-queue-message">
                    <i class="fas fa-music"></i>
                    <p>La cola está vacía</p>
                    <p>Añade música desde la biblioteca o búsqueda</p>
                </div>
            `;
            return;
        }

        queueContainer.innerHTML = '';
        
        flatList.forEach((video, index) => {
            const item = this.createQueueItem(video, index);
            queueContainer.appendChild(item);
        });
    }

    createQueueItem(video, index) {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.dataset.videoId = video.videoId;
        item.dataset.flatIndex = index;

        const isPlaying = video.videoId === currentPlayingInfo.videoId;
        if (isPlaying) {
            item.classList.add('playing');
        }

        item.innerHTML = `
            <div class="queue-item-number">${index + 1}</div>
            <img src="${video.thumbnail}" alt="${video.title}" class="queue-item-thumbnail">
            <div class="queue-item-info">
                <div class="queue-item-title">${video.title}</div>
                <div class="queue-item-duration">${this.formatDuration(video.duration)}</div>
            </div>
            ${isPlaying ? '<i class="fas fa-volume-up queue-item-playing"></i>' : ''}
            <button class="queue-item-remove" data-video-id="${video.videoId}">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Event listeners
        item.addEventListener('click', () => this.playVideoAtIndex(index));
        
        const removeBtn = item.querySelector('.queue-item-remove');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeVideoFromQueue(video.videoId);
        });

        return item;
    }

    // =============================================
    // SISTEMA DE REPRODUCCIÓN
    // =============================================
    handlePlayPause() {
        if (!playersInitialized) {
            this.showMessage("Los reproductores no están listos", 'error');
            return;
        }

        const activePlayer = currentPlayer === 1 ? player1 : player2;
        
        if (!reproduccionIniciada) {
            this.playFirstVideo();
        } else {
            const playerState = activePlayer.getPlayerState();
            
            if (playerState === YT.PlayerState.PLAYING) {
                activePlayer.pauseVideo();
                this.updatePlayButton('play');
                this.stopMonitoring();
            } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
                activePlayer.playVideo();
                this.updatePlayButton('pause');
                this.startMonitoring();
            }
        }
    }

    handleNext() {
        if (!reproduccionIniciada) {
            this.showMessage("Inicia la reproducción primero", 'warning');
            return;
        }
        
        this.stopMonitoring();
        this.playNextVideo();
        setTimeout(() => this.startMonitoring(), 500);
    }

    handlePrevious() {
        // Implementar lógica de video anterior
        console.log('⏮️ Función anterior no implementada aún');
    }

    playFirstVideo() {
        const flatList = this.getFlattenedPlaylist();
        if (flatList.length === 0) {
            this.showMessage("No hay videos para reproducir", 'warning');
            return;
        }

        const firstVideo = flatList[0];
        console.log('▶️ Reproduciendo primer video:', firstVideo.title);

        currentPlayingInfo = {
            flattenedIndex: 0,
            videoId: firstVideo.videoId,
            playlistId: firstVideo.sourcePlaylistId
        };

        try {
            if (player2) player2.stopVideo();
            
            player1.loadVideoById(firstVideo.videoId);
            player1.setVolume(100);

            document.getElementById('player1')?.classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2')?.classList.add('hidden');
            
            currentPlayer = 1;
            reproduccionIniciada = true;
            
            this.updatePlayButton('pause');
            this.startMonitoring();
            this.updateNowPlaying();
            this.updatePlaylistsUI();
            
        } catch (error) {
            console.error("Error iniciando reproducción:", error);
            this.showMessage("Error al iniciar reproducción", 'error');
            reproduccionIniciada = false;
            this.updatePlayButton('play');
        }
    }

    async playNextVideo() {
        const currentFlatIndex = currentPlayingInfo.flattenedIndex;
        const flatList = this.getFlattenedPlaylist();

        if (flatList.length === 0) {
            this.handleEmptyPlaylist();
            return;
        }

        let nextIndex = currentFlatIndex + 1;
        if (nextIndex >= flatList.length) {
            this.handleEndOfPlaylist();
            return;
        }

        const nextVideo = flatList[nextIndex];
        console.log(`⏭️ Reproduciendo siguiente: ${nextVideo.title}`);

        // Lógica de crossfade (simplificada para el ejemplo)
        const currentPlayerInstance = currentPlayer === 1 ? player1 : player2;
        const nextPlayerInstance = currentPlayer === 1 ? player2 : player1;
        const nextPlayerElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);

        try {
            // Preparar siguiente reproductor
            nextPlayerInstance.cueVideoById(nextVideo.videoId);
            nextPlayerInstance.setVolume(0);
            
            if (nextPlayerElement) {
                nextPlayerElement.classList.remove('hidden', 'fade-out');
            }

            // Actualizar estado
            currentPlayingInfo = {
                flattenedIndex: nextIndex,
                videoId: nextVideo.videoId,
                playlistId: nextVideo.sourcePlaylistId
            };

            // Iniciar reproducción
            await nextPlayerInstance.playVideo();
            
            // Cambiar reproductor activo
            currentPlayer = currentPlayer === 1 ? 2 : 1;
            
            // Aplicar crossfade
            this.startCrossfade(currentPlayerInstance, nextPlayerInstance);
            
            this.updateNowPlaying();
            this.updatePlaylistsUI();

        } catch (error) {
            console.error("Error en reproducción siguiente:", error);
            this.showMessage("Error cambiando video", 'error');
        }
    }

    startCrossfade(prevPlayer, nextPlayer) {
        if (crossfadeInProgress) return;
        
        crossfadeInProgress = true;
        const duration = CROSSFADE_DURATION * 1000;
        const steps = 60; // 60 pasos para transición suave
        const stepTime = duration / steps;
        
        let step = 0;
        
        crossfadeInterval = setInterval(() => {
            step++;
            const progress = step / steps;
            
            // Curva de volumen
            const prevVolume = Math.max(0, Math.round(100 * (1 - progress)));
            const nextVolume = Math.min(100, Math.round(100 * progress));
            
            try {
                prevPlayer.setVolume(prevVolume);
                nextPlayer.setVolume(nextVolume);
            } catch (e) {
                console.warn("Error durante crossfade:", e);
            }
            
            if (step >= steps) {
                clearInterval(crossfadeInterval);
                crossfadeInterval = null;
                crossfadeInProgress = false;
                
                // Detener reproductor anterior
                setTimeout(() => {
                    try {
                        prevPlayer.stopVideo();
                    } catch (e) {}
                }, 100);
            }
        }, stepTime);
    }

    // =============================================
    // BÚSQUEDA
    // =============================================
    async performSearch(query, nextPage = null) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;

        if (!nextPage) {
            currentSearchQuery = query;
            nextPageContext = null;
            searchResults.innerHTML = '<div class="search-loading">Buscando...</div>';
        }

        isLoadingMore = true;

        try {
            let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(currentSearchQuery)}`;
            if (nextPage) {
                apiUrl += `&nextpage=${encodeURIComponent(nextPage)}`;
            }

            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.displaySearchResults(data, !!nextPage);

        } catch (error) {
            console.error("Error en búsqueda:", error);
            const errorMsg = error.message || "Error desconocido al buscar";
            
            if (!nextPage) {
                searchResults.innerHTML = `<div class="search-error">${errorMsg}</div>`;
            } else {
                this.showMessage(errorMsg, 'error');
            }
        } finally {
            isLoadingMore = false;
        }
    }

    displaySearchResults(results, append = false) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;

        if (!append) {
            searchResults.innerHTML = '';
        }

        if (!results?.items?.length) {
            if (!append) {
                searchResults.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-search"></i>
                        <p>No se encontraron resultados</p>
                    </div>
                `;
            }
            return;
        }

        nextPageContext = results.nextpage || null;

        const grid = append ? searchResults : this.createSearchGrid();
        if (!append) {
            searchResults.appendChild(grid);
        }

        results.items.forEach(video => {
            const videoId = video.videoId || video.url?.split('v=')[1];
            if (!videoId) return;

            // Evitar duplicados
            if (append && grid.querySelector(`[data-video-id="${videoId}"]`)) {
                return;
            }

            const card = this.createSearchResultCard(video, videoId);
            grid.appendChild(card);
        });
    }

    createSearchGrid() {
        const grid = document.createElement('div');
        grid.className = 'search-results-grid';
        return grid;
    }

    createSearchResultCard(video, videoId) {
        const card = document.createElement('div');
        card.className = 'search-result-card';
        card.dataset.videoId = videoId;

        const duration = video.duration ? this.formatDuration(video.duration) : '';
        const author = video.uploaderName || 'Autor Desconocido';

        card.innerHTML = `
            <div class="search-result-thumbnail">
                <img src="${video.thumbnail}" alt="${video.title}" loading="lazy">
                ${duration ? `<span class="search-result-duration">${duration}</span>` : ''}
            </div>
            <div class="search-result-info">
                <h3 class="search-result-title">${video.title}</h3>
                <p class="search-result-author">${author}</p>
                <button class="search-result-add-btn" data-video-id="${videoId}" 
                        data-title="${video.title}" data-thumbnail="${video.thumbnail}"
                        data-duration="${video.duration || 0}">
                    <i class="fas fa-plus"></i>
                    Añadir
                </button>
            </div>
        `;

        // Event listener para añadir
        const addBtn = card.querySelector('.search-result-add-btn');
        addBtn.addEventListener('click', (e) => {
            const videoData = {
                videoId: e.target.dataset.videoId,
                title: e.target.dataset.title,
                thumbnail: e.target.dataset.thumbnail,
                duration: parseInt(e.target.dataset.duration) || 0
            };
            this.addVideoToManualPlaylist(videoData);
        });

        return card;
    }

    clearSearchResults() {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                    <p><small>Sistema Unificado Activo</small></p>
                </div>
            `;
        }
        currentSearchQuery = '';
        nextPageContext = null;
    }

    // =============================================
    // GESTIÓN DE VIDEOS
    // =============================================
    addVideoToManualPlaylist(videoData) {
        let manualPlaylist = playlistsData.find(p => p.id === 'manual');
        
        if (!manualPlaylist) {
            manualPlaylist = {
                id: 'manual',
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true
            };
            playlistsData.unshift(manualPlaylist);
        }

        // Verificar duplicados
        const isDuplicate = manualPlaylist.videos.some(v => v.videoId === videoData.videoId);
        if (isDuplicate) {
            this.showMessage(`"${videoData.title}" ya está en la lista`, 'warning');
            return;
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || './electronic.ico',
            duration: videoData.duration || 0
        };

        manualPlaylist.videos.push(videoObject);
        this.showMessage(`Añadido: ${videoObject.title}`, 'success');
        
        this.updatePlaylistsUI();
        this.enablePlayButton();
    }

    removeVideoFromQueue(videoId) {
        // Encontrar y eliminar video de las playlists
        playlistsData.forEach(playlist => {
            const index = playlist.videos.findIndex(v => v.videoId === videoId);
            if (index !== -1) {
                const removedVideo = playlist.videos.splice(index, 1)[0];
                this.showMessage(`Eliminado: ${removedVideo.title}`, 'success');
            }
        });

        this.updatePlaylistsUI();
        this.updateCurrentPlayingIndex();
    }

    // =============================================
    // UTILIDADES Y HELPERS
    // =============================================
    getFlattenedPlaylist() {
        let flatList = [];
        playlistsData.forEach(playlist => {
            playlist.videos.forEach(video => {
                flatList.push({ ...video, sourcePlaylistId: playlist.id });
            });
        });
        return flatList;
    }

    formatDuration(duration) {
        if (isNaN(duration) || duration < 0) return "0:00";
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            return null;
        }
    }

    async getPlaylistInfo(playlistId) {
        const pipedInstances = [
            "https://api.piped.private.coffee"
        ];
        
        const instanceUrl = pipedInstances[Math.floor(Math.random() * pipedInstances.length)];
        const targetUrl = `${instanceUrl}/playlists/${playlistId}`;
        
        try {
            const response = await fetch(targetUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (!data?.relatedStreams) {
                throw new Error("La respuesta no contiene videos válidos");
            }
            
            return data;
        } catch (error) {
            console.error("Error obteniendo playlist:", error);
            throw error;
        }
    }

    async handlePlaylistLoaded(playlistInfo) {
        console.log('📁 Procesando playlist cargada:', playlistInfo.name);

        if (!playlistInfo?.relatedStreams?.length) {
            this.showMessage("No se encontraron videos válidos en la playlist", 'error');
            return;
        }

        const playlistId = playlistInfo.id || `playlist_${Date.now()}`;

        if (playlistsData.some(p => p.id === playlistId)) {
            this.showMessage(`La playlist "${playlistInfo.name || playlistId}" ya está cargada`, 'warning');
            return;
        }

        const loadedVideos = playlistInfo.relatedStreams.map(video => ({
            videoId: video.url?.split('v=')[1],
            title: video.title || "Título Desconocido",
            thumbnail: video.thumbnail || './electronic.ico',
            duration: this.parseDuration(video.duration) || 0,
        })).filter(v => v.videoId);

        if (loadedVideos.length === 0) {
            this.showMessage("La playlist no contiene videos válidos", 'error');
            return;
        }

        const newPlaylist = {
            id: playlistId,
            name: playlistInfo.name || "Playlist Sin Nombre",
            thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || './electronic.ico',
            videos: loadedVideos,
            isExpanded: true
        };

        // Insertar después de la playlist manual
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        if (manualIndex !== -1) {
            playlistsData.splice(manualIndex + 1, 0, newPlaylist);
        } else {
            playlistsData.push(newPlaylist);
        }

        this.showMessage(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos)`, 'success');
        this.updatePlaylistsUI();
        this.enablePlayButton();
    }

    parseDuration(durationInput) {
        if (typeof durationInput === 'number') return Math.floor(durationInput);
        if (typeof durationInput !== 'string') return 0;

        // Formato ISO PT1H2M3S
        const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (isoMatch) {
            const hours = parseInt(isoMatch[1] || '0', 10);
            const minutes = parseInt(isoMatch[2] || '0', 10);
            const seconds = parseFloat(isoMatch[3] || '0');
            return Math.floor(hours * 3600 + minutes * 60 + seconds);
        }

        // Formato MM:SS o HH:MM:SS
        const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
        if (timeParts.length === 2 && timeParts.every(p => !isNaN(p))) {
            return timeParts[0] * 60 + timeParts[1];
        } else if (timeParts.length === 3 && timeParts.every(p => !isNaN(p))) {
            return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        }

        const directNumber = parseInt(durationInput, 10);
        return !isNaN(directNumber) ? directNumber : 0;
    }

    // =============================================
    // PLAYLISTS DE YOUTUBE LIBRARY
    // =============================================
    addYouTubeLibraryPlaylists(youtubePlaylists) {
        if (!youtubePlaylists?.length) {
            this.showMessage("No se encontraron playlists en tu biblioteca", 'warning');
            return;
        }

        const formattedPlaylists = youtubePlaylists.map(playlist => {
            if (!playlist.snippet?.title || playlist.contentDetails?.itemCount === 0) {
                return null;
            }
            return {
                id: playlist.id,
                name: playlist.snippet.title,
                thumbnailUrl: playlist.snippet.thumbnails.high?.url || 
                            playlist.snippet.thumbnails.default?.url || './electronic.ico',
                videos: [],
                isExpanded: false,
                source: YOUTUBE_LIBRARY_SOURCE_ID,
                isLoaded: false,
            };
        }).filter(p => p !== null);

        playlistsData.unshift(...formattedPlaylists);
        this.showMessage(`${formattedPlaylists.length} playlists de tu biblioteca añadidas`, 'success');
        this.updatePlaylistsUI();
    }

    clearYouTubeLibraryPlaylists() {
        const initialCount = playlistsData.length;
        playlistsData = playlistsData.filter(p => p.source !== YOUTUBE_LIBRARY_SOURCE_ID);
        const removedCount = initialCount - playlistsData.length;
        
        if (removedCount > 0) {
            console.log(`Eliminadas ${removedCount} playlists de YouTube Library`);
            this.updatePlaylistsUI();
        }
    }

    // =============================================
    // MONITOREO Y ESTADO
    // =============================================
    startMonitoring() {
        if (!monitorInterval) {
            monitorInterval = setInterval(() => this.monitorPlayers(), 300);
            console.log('📊 Monitoreo iniciado');
        }
    }

    stopMonitoring() {
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
            console.log('📊 Monitoreo detenido');
        }
    }

    monitorPlayers() {
        if (!playersInitialized || !reproduccionIniciada) return;

        const activePlayer = currentPlayer === 1 ? player1 : player2;
        if (!activePlayer?.getPlayerState) return;

        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();

        if (playerState === YT.PlayerState.PLAYING && videoDuration > 0) {
            const timeRemaining = videoDuration - currentTime;
            
            // Disparar crossfade cerca del final
            if (timeRemaining <= CROSSFADE_DURATION + 0.5 && 
                timeRemaining > 0 && 
                !hasOutroCrossfadeStarted && 
                !crossfadeInProgress) {
                
                console.log(`⏰ Tiempo restante: ${timeRemaining.toFixed(1)}s, iniciando crossfade`);
                this.playNextVideo();
            }
        }
    }

    updateCurrentPlayingIndex() {
        const flatList = this.getFlattenedPlaylist();
        let playingVideoId = null;

        try {
            if (player1?.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = player1.getVideoData()?.video_id;
                currentPlayer = 1;
            } else if (player2?.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = player2.getVideoData()?.video_id;
                currentPlayer = 2;
            }
        } catch (e) {
            console.error("Error obteniendo datos de reproducción:", e);
        }

        if (playingVideoId && currentPlayingInfo.videoId !== playingVideoId) {
            const newIndex = flatList.findIndex(v => v.videoId === playingVideoId);
            if (newIndex !== -1) {
                const videoObj = flatList[newIndex];
                currentPlayingInfo = {
                    videoId: playingVideoId,
                    playlistId: videoObj.sourcePlaylistId,
                    flattenedIndex: newIndex
                };
                console.log(`📍 Índice actualizado: ${newIndex} (${playingVideoId})`);
                this.updateNowPlaying();
                this.updatePlaylistsUI();
            }
        }
    }

    // =============================================
    // UI UPDATES
    // =============================================
    updateNowPlaying() {
        const flatList = this.getFlattenedPlaylist();
        const currentVideo = flatList[currentPlayingInfo.flattenedIndex];
        
        if (currentVideo) {
            // Actualizar información en vista de reproducción
            const elements = {
                nowPlayingTitle: document.getElementById('nowPlayingTitle'),
                nowPlayingArtist: document.getElementById('nowPlayingArtist'),
                playerTitle: document.getElementById('playerTitle'),
                playerArtist: document.getElementById('playerArtist'),
                playerThumbnail: document.getElementById('playerThumbnail')
            };

            if (elements.nowPlayingTitle) elements.nowPlayingTitle.textContent = currentVideo.title;
            if (elements.nowPlayingArtist) elements.nowPlayingArtist.textContent = 'YT CrossMix';
            if (elements.playerTitle) elements.playerTitle.textContent = currentVideo.title;
            if (elements.playerArtist) elements.playerArtist.textContent = 'YT CrossMix - Sistema Unificado';
            if (elements.playerThumbnail) {
                elements.playerThumbnail.src = currentVideo.thumbnail;
                elements.playerThumbnail.alt = currentVideo.title;
            }
        }
    }

    updatePlayButton(state) {
        const playBtn = document.getElementById('botonPlay');
        const miniPlayBtn = document.getElementById('miniPlayBtn');
        
        const icon = state === 'play' ? 'fa-play' : 'fa-pause';
        const buttons = [playBtn, miniPlayBtn].filter(Boolean);
        
        buttons.forEach(btn => {
            const iconElement = btn.querySelector('i');
            if (iconElement) {
                iconElement.className = `fas ${icon}`;
            }
        });
    }

    enablePlayButton() {
        const flatList = this.getFlattenedPlaylist();
        const shouldEnable = flatList.length > 0 && playersInitialized;
        
        const buttons = [
            document.getElementById('botonPlay'),
            document.getElementById('botonNext'),
            document.getElementById('prevButton'),
            document.getElementById('miniPlayBtn'),
            document.getElementById('miniNextBtn')
        ].filter(Boolean);
        
        buttons.forEach(btn => {
            btn.disabled = !shouldEnable;
        });
    }

    updateOverviewStats() {
        const totalPlaylists = playlistsData.length;
        const totalVideos = playlistsData.reduce((sum, p) => sum + p.videos.length, 0);
        
        const overviewGrid = document.getElementById('overviewGrid');
        if (overviewGrid) {
            const playlistStat = overviewGrid.querySelector('.overview-stat');
            if (playlistStat) {
                playlistStat.textContent = `${totalPlaylists} playlists cargadas`;
            }
            const videoStat = overviewGrid.querySelector('.overview-stat:nth-child(2)');
            if (videoStat) {
                videoStat.textContent = `${totalVideos} videos en total`;
            }
        }
    }

    updateStatusIndicator(message, type = 'info') {
        const indicator = document.getElementById('unifiedStatusIndicator');
        if (!indicator) return;

        indicator.textContent = message;
        indicator.className = `unified-status-indicator show ${type}`;
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 3000);
        }
    }

    updatePlayersStatus(status) {
        const statusElement = document.getElementById('unifiedPlayersStatus');
        if (statusElement) {
            statusElement.textContent = `Reproductores: ${status}`;
        }
    }

    // =============================================
    // MANEJO DE EVENTOS Y ESTADOS
    // =============================================
    handleEmptyPlaylist() {
        console.log('📭 Lista vacía');
        this.stopMonitoring();
        reproduccionIniciada = false;
        this.updatePlayButton('play');
        this.enablePlayButton();
        currentPlayingInfo = { flattenedIndex: -1, videoId: null, playlistId: null };
        this.updatePlaylistsUI();
    }

    handleEndOfPlaylist() {
        console.log('🔚 Final de lista alcanzado');
        const repeat = confirm('¿Deseas repetir la lista desde el principio?');
        
        if (repeat) {
            currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
            this.playFirstVideo();
        } else {
            this.stopMonitoring();
            this.showMessage("Lista completada", 'success');
            try {
                if (player1) player1.stopVideo();
                if (player2) player2.stopVideo();
            } catch (e) {}
            reproduccionIniciada = false;
            this.updatePlayButton('play');
        }
    }

    playVideoAtIndex(index) {
        const flatList = this.getFlattenedPlaylist();
        if (index < 0 || index >= flatList.length) return;

        const video = flatList[index];
        console.log(`🎵 Reproduciendo video en índice ${index}: ${video.title}`);

        currentPlayingInfo = {
            flattenedIndex: index,
            videoId: video.videoId,
            playlistId: video.sourcePlaylistId
        };

        try {
            const activePlayer = currentPlayer === 1 ? player1 : player2;
            activePlayer.loadVideoById(video.videoId);
            
            reproduccionIniciada = true;
            this.updatePlayButton('pause');
            this.startMonitoring();
            this.updateNowPlaying();
            this.updatePlaylistsUI();
            
        } catch (error) {
            console.error("Error reproduciendo video:", error);
            this.showMessage("Error al reproducir video", 'error');
        }
    }

    playPlaylist(playlistId) {
        const playlist = playlistsData.find(p => p.id === playlistId);
        if (!playlist?.videos?.length) {
            this.showMessage("La playlist está vacía", 'warning');
            return;
        }

        // Encontrar el primer video de esta playlist en la lista aplanada
        const flatList = this.getFlattenedPlaylist();
        const firstVideoIndex = flatList.findIndex(v => v.sourcePlaylistId === playlistId);
        
        if (firstVideoIndex !== -1) {
            this.playVideoAtIndex(firstVideoIndex);
            this.switchView('playing');
        }
    }

    // =============================================
    // SISTEMA DE MENSAJES Y DEBUG
    // =============================================
    showMessage(message, type = 'info', duration = 4000) {
        console.log(`💬 ${type.toUpperCase()}: ${message}`);
        
        const container = document.getElementById('floatingMessageContainer') || 
                         document.querySelector('.floating-messages');
        if (!container) return;

        const messageEl = document.createElement('div');
        messageEl.className = `floating-message ${type}`;
        messageEl.textContent = message;

        container.appendChild(messageEl);

        // Auto-remove después del duration
        setTimeout(() => {
            messageEl.classList.add('fade-out');
            setTimeout(() => messageEl.remove(), 500);
        }, duration);
    }

    closeAllContextMenus() {
        document.querySelectorAll('.delete-menu-content, .playlist-selection-popup-menu').forEach(menu => {
            menu.style.display = 'none';
            menu.remove();
        });
    }

    enableUnifiedElements() {
        document.querySelectorAll('[data-requires-unified]').forEach(el => {
            el.classList.add('unified-ready');
        });
        document.body.classList.remove('unified-loading');
        
        // Actualizar indicador visual
        const indicator = document.getElementById('unifiedIndicator');
        if (indicator) {
            indicator.style.background = '#4caf50';
            indicator.title = 'Sistema Unificado - Activo';
        }
    }

    enableDebugMode() {
        console.log('🔧 Modo debug habilitado');
        document.getElementById('unifiedDebugToggle')?.style.setProperty('display', 'block');
        document.getElementById('unifiedControls')?.style.setProperty('display', 'flex');
    }

    loadInitialData() {
        // Cargar datos guardados del localStorage si los hay
        try {
            const savedPlaylists = localStorage.getItem('ytcm_playlists');
            if (savedPlaylists) {
                const parsed = JSON.parse(savedPlaylists);
                if (Array.isArray(parsed)) {
                    playlistsData = parsed;
                    console.log('📂 Datos cargados del localStorage');
                }
            }
        } catch (e) {
            console.warn('Error cargando datos guardados:', e);
        }
    }

    saveData() {
        try {
            // Filtrar playlists de YouTube Library para no guardarlas
            const playlistsToSave = playlistsData.filter(p => p.source !== YOUTUBE_LIBRARY_SOURCE_ID);
            localStorage.setItem('ytcm_playlists', JSON.stringify(playlistsToSave));
        } catch (e) {
            console.warn('Error guardando datos:', e);
        }
    }
}

// =============================================
// FUNCIONES GLOBALES Y UTILIDADES
// =============================================
function toggleUnifiedDebug() {
    const debugPanel = document.getElementById('unifiedDebugPanel');
    const statePanel = document.getElementById('unifiedStateDebug');
    
    if (debugPanel) {
        debugPanel.classList.toggle('show');
    }
    if (statePanel) {
        statePanel.classList.toggle('show');
        if (statePanel.classList.contains('show')) {
            updateDebugInfo();
        }
    }
}

function updateDebugInfo() {
    const debugContent = document.getElementById('stateDebugContent');
    if (!debugContent) return;

    const info = {
        'Sistema': unifiedState.initialized ? '✅ Inicializado' : '❌ No inicializado',
        'Vista actual': window.unifiedCore?.currentView || 'Desconocida',
        'Reproductores': playersInitialized ? '✅ Listos' : '❌ No listos',
        'Reproducción': reproduccionIniciada ? '▶️ Activa' : '⏸️ Detenida',
        'Playlists cargadas': playlistsData.length,
        'Videos totales': playlistsData.reduce((sum, p) => sum + p.videos.length, 0),
        'Video actual': currentPlayingInfo.videoId || 'Ninguno',
        'Índice actual': currentPlayingInfo.flattenedIndex,
        'Crossfade activo': crossfadeInProgress ? '✅ Sí' : '❌ No',
        'Monitoreo activo': monitorInterval ? '✅ Sí' : '❌ No'
    };

    debugContent.innerHTML = Object.entries(info).map(([key, value]) => 
        `<div class="state-section"><span class="state-key">${key}:</span> <span class="state-value">${value}</span></div>`
    ).join('');
}

// Funciones globales de debug
window.debugUnified = function() {
    console.log('🐛 Estado del Sistema Unificado:', {
        unifiedState,
        playlistsData,
        currentPlayingInfo,
        playersInitialized,
        reproduccionIniciada,
        crossfadeInProgress
    });
    updateDebugInfo();
};

window.resetUnified = function() {
    if (confirm('¿Resetear completamente el sistema?')) {
        localStorage.removeItem('ytcm_playlists');
        localStorage.removeItem('ytcm_debug');
        location.reload();
    }
};

// =============================================
// INICIALIZACIÓN AUTOMÁTICA
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 DOM cargado, iniciando Sistema Unificado...');
    
    // Crear instancia global
    window.unifiedCore = new UnifiedCore();
    window.unifiedStateManager = window.unifiedCore;
    
    // Guardar datos periódicamente
    setInterval(() => {
        if (window.unifiedCore?.state?.initialized) {
            window.unifiedCore.saveData();
        }
    }, 30000); // Cada 30 segundos
    
    // Debug automático en desarrollo
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        localStorage.setItem('ytcm_debug', 'true');
        setTimeout(() => window.unifiedCore?.enableDebugMode(), 1000);
    }
});

// Cleanup al salir
window.addEventListener('beforeunload', () => {
    if (window.unifiedCore?.state?.initialized) {
        window.unifiedCore.saveData();
        window.unifiedCore.stopMonitoring();
    }
});

export default UnifiedCore;
