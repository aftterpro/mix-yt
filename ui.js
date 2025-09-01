// ===== UI.JS - VERSIÓN OPTIMIZADA SIN DUPLICACIONES =====
// UIManager optimizado que elimina redundancias y mejora performance

export class UIManager {

    // ===== INICIALIZACIÓN OPTIMIZADA =====
    static async initialize() {
        console.log('🎨 Inicializando UIManager optimizado...');
        
        try {
            if (window.unifiedCore?.initialized) {
                UIManager.setupUI();
            } else {
                window.addEventListener('ytcrossmix:unified:ready', UIManager.setupUI, { once: true });
                
                // Timeout fallback
                setTimeout(() => {
                    if (!window.unifiedCore?.initialized) {
                        console.warn('⚠️ Timeout esperando core, usando fallback');
                        UIManager.setupUIFallback();
                    }
                }, 8000);
            }
            
        } catch (error) {
            console.error('💥 Error inicializando UIManager:', error);
            UIManager.showError('Error inicializando interfaz', error);
        }
    }

    static setupUI() {
        console.log('🔧 Configurando UI completa...');
        
        // Setup systems in optimal order
        UIManager.setupEventDelegation();
        UIManager.setupResponsiveDesign();
        UIManager.enableInteractivity();
        
        // Set initial view
        const currentView = window.unifiedStateManager?.state?.ui?.currentView || 'home';
        UIManager.switchView(currentView);
        
        // Trigger initial UI update with delay for DOM stability
        setTimeout(() => UIManager.updatePlaylistsUI(), 300);
        
        console.log('✅ UIManager configurado exitosamente');
    }

    static setupUIFallback() {
        console.log('🔧 Configurando UI en modo fallback...');
        UIManager.setupEventDelegation();
        UIManager.enableInteractivity();
    }

    // ===== EVENT DELEGATION OPTIMIZADO =====
    static setupEventDelegation() {
        // Single document click handler for all interactions
        document.addEventListener('click', UIManager.handleGlobalClick);
        
        // Single input handler for all search inputs
        document.addEventListener('input', UIManager.handleGlobalInput);
        
        // Single keydown handler
        document.addEventListener('keydown', UIManager.handleGlobalKeydown);
        
        console.log('✅ Event delegation configurado');
    }

    static handleGlobalClick(event) {
        const target = event.target;
        const button = target.closest('button');
        const navItem = target.closest('[data-view]');
        
        // Navigation
        if (navItem) {
            event.preventDefault();
            const view = navItem.dataset.view;
            UIManager.switchView(view);
            return;
        }
        
        if (!button) return;
        
        // Player controls
        switch (button.id) {
            case 'botonPlay':
            case 'miniPlayBtn':
                UIManager.handlePlayButtonClick();
                break;
            case 'botonNext':
            case 'miniNextBtn':
                UIManager.handleNextButtonClick();
                break;
            case 'queueButton':
                UIManager.toggleQueue();
                break;
            case 'queueCloseBtn':
                UIManager.hideQueue();
                break;
            case 'añadirUrlButton':
                UIManager.handlePlaylistUrlAdd();
                break;
        }

        // Data-driven actions
        const action = button.dataset.action;
        if (action) {
            UIManager.handleDataAction(button, action, event);
        }

        // Search result add buttons
        if (button.classList.contains('search-result-add-button')) {
            const videoData = JSON.parse(button.dataset.videoData);
            UIManager.handleSearchResultAdd(button, videoData);
        }

        // Playlist card headers (expansion)
        const playlistHeader = target.closest('.playlist-card-header');
        if (playlistHeader) {
            const playlistId = playlistHeader.dataset.playlistId;
            if (playlistId) {
                window.PlaylistManager.togglePlaylistExpansion(playlistId);
            }
        }
    }

    static handleGlobalInput(event) {
        const input = event.target;
        
        // Search inputs
        if (['sidebarSearchInput', 'mobileSearchInput', 'searchInput'].includes(input.id)) {
            UIManager.debouncedSearch(input.value.trim());
        }
    }

    static handleGlobalKeydown(event) {
        const input = event.target;
        
        // Enter key for search and URL inputs
        if (event.key === 'Enter') {
            if (['sidebarSearchInput', 'mobileSearchInput', 'searchInput'].includes(input.id)) {
                const query = input.value.trim();
                if (query.length > 0) {
                    UIManager.handleSearch(query);
                }
            } else if (input.id === 'searchInput2') {
                UIManager.handlePlaylistUrlAdd();
            }
        }
    }

    static handleDataAction(button, action, event) {
        event.preventDefault();
        
        const videoId = button.dataset.videoId;
        const playlistId = button.dataset.playlistId;
        
        switch (action) {
            case 'add-video':
                if (videoId) {
                    UIManager.handleAddVideoToQueue(button, videoId);
                }
                break;
            case 'remove-from-queue':
                if (videoId) {
                    UIManager.handleRemoveFromQueue(videoId);
                }
                break;
            case 'play-now':
                if (videoId) {
                    UIManager.handlePlayVideoNow(videoId);
                }
                break;
            case 'add-all':
                if (playlistId) {
                    UIManager.handleAddAllToQueue(playlistId);
                }
                break;
            case 'play-all':
                if (playlistId) {
                    UIManager.handlePlayAllPlaylist(playlistId);
                }
                break;
        }
    }

    // ===== ACTUALIZACIÓN DE UI OPTIMIZADA =====
    static updatePlaylistsUI() {
        try {
            const state = window.unifiedStateManager?.state;
            if (!state) return;
            
            const currentView = state.ui.currentView;
            
            // Don't update search view to preserve results
            if (currentView === 'search') {
                console.log('🔍 Vista de búsqueda activa - preservando resultados');
                return;
            }
            
            const playlistContainer = UIManager.getPlaylistContainer(currentView);
            if (!playlistContainer) return;
            
            const currentScrollTop = playlistContainer.scrollTop;
            
            if (!state.playlist.playlistsData?.length) {
                UIManager.renderEmptyState(playlistContainer, currentView);
            } else {
                switch (currentView) {
                    case 'library':
                        UIManager.renderLibraryGrid(playlistContainer, state.playlist.playlistsData);
                        break;
                    case 'playing':
                        UIManager.renderNowPlayingInfo();
                        break;
                    default:
                        UIManager.renderPlaylistList(playlistContainer, state.playlist.playlistsData);
                }
            }
            
            // Restore scroll position
            if (currentScrollTop > 0) {
                playlistContainer.scrollTop = currentScrollTop;
            }
            
            console.log('✅ UI actualizada');
            
        } catch (error) {
            console.error('💥 Error actualizando UI:', error);
            UIManager.showError('Error actualizando interfaz', error);
        }
    }

    // ===== RENDERIZADO OPTIMIZADO =====
    static renderLibraryGrid(container, playlistsData) {
        container.innerHTML = '';
        container.className = 'library-container';
        
        const grid = document.createElement('div');
        grid.className = 'library-grid';
        
        const libraryPlaylists = playlistsData.filter(playlist => playlist.id !== 'manual');
        
        if (libraryPlaylists.length === 0) {
            UIManager.renderEmptyState(container, 'library');
            return;
        }
        
        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        libraryPlaylists.forEach((playlist, index) => {
            const card = UIManager.createPlaylistCard(playlist, index);
            fragment.appendChild(card);
        });
        
        grid.appendChild(fragment);
        container.appendChild(grid);
        
        console.log(`✅ ${libraryPlaylists.length} playlists renderizadas`);
    }

    static createPlaylistCard(playlist, index) {
        const card = document.createElement('div');
        card.className = `playlist-card-expandable ${playlist.isExpanded ? 'expanded' : ''}`;
        card.dataset.playlistId = playlist.id;
        
        const videoCount = playlist.videos?.length || playlist.itemCount || 0;
        const thumbnailUrl = UIManager.getPlaylistThumbnail(playlist);
        const isYouTubeLibrary = playlist.source === 'youtube_library';
        const isLoaded = playlist.isLoaded || playlist.videos?.length > 0;
        
        card.innerHTML = UIManager.getPlaylistCardHTML(playlist, videoCount, thumbnailUrl, isYouTubeLibrary, isLoaded);
        
        // Render videos if expanded and loaded
        if (playlist.isExpanded && playlist.videos?.length > 0) {
            const videosContainer = card.querySelector('.playlist-videos-container');
            UIManager.renderPlaylistVideos(videosContainer, playlist.videos, playlist.id);
        }
        
        // Staggered animation
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'all 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 50); // Reduced delay for faster loading
        
        return card;
    }

    static getPlaylistCardHTML(playlist, videoCount, thumbnailUrl, isYouTubeLibrary, isLoaded) {
        const name = window.SharedUtils.escapeHtml(playlist.name);
        
        return `
            <div class="playlist-card-header" data-playlist-id="${playlist.id}">
                <div class="playlist-card-image">
                    <img src="${thumbnailUrl}" alt="${name}" loading="lazy">
                    <div class="playlist-card-overlay">
                        <button class="playlist-expand-btn">
                            <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                        </button>
                    </div>
                </div>
                <div class="playlist-card-info">
                    <h3 class="playlist-card-title">${name}</h3>
                    <p class="playlist-card-meta">
                        ${videoCount} videos
                        ${isYouTubeLibrary && !isLoaded ? ' • Click para cargar' : ''}
                    </p>
                    <div class="playlist-card-actions">
                        <button class="playlist-action-btn primary" data-action="add-all" data-playlist-id="${playlist.id}">
                            <i class="fas fa-plus"></i> Añadir Todo
                        </button>
                        <button class="playlist-action-btn secondary" data-action="play-all" data-playlist-id="${playlist.id}">
                            <i class="fas fa-play"></i> Reproducir
                        </button>
                    </div>
                </div>
            </div>
            <div class="playlist-videos-container">
                <div class="playlist-videos-content">
                    ${!isLoaded && isYouTubeLibrary ? 
                        '<div class="playlist-videos-placeholder">Click para cargar videos...</div>' :
                        '<div class="playlist-videos-loading">Preparando videos...</div>'
                    }
                </div>
            </div>
        `;
    }

    static getPlaylistThumbnail(playlist) {
        return playlist.thumbnailUrl || 
               playlist.thumbnail || 
               (playlist.videos?.[0]?.thumbnail) ||
               'https://via.placeholder.com/320x180/333333/ffffff?text=Playlist';
    }

    static renderPlaylistVideos(container, videos, playlistId) {
        const contentDiv = container.querySelector('.playlist-videos-content') || container;
        
        if (!videos?.length) {
            contentDiv.innerHTML = `
                <div class="playlist-videos-empty">
                    <i class="fas fa-music"></i>
                    <p>No hay videos en esta playlist</p>
                </div>
            `;
            return;
        }
        
        // Use fragment for performance
        const fragment = document.createDocumentFragment();
        
        videos.forEach((video, index) => {
            const videoItem = UIManager.createVideoItem(video, index + 1, playlistId);
            fragment.appendChild(videoItem);
        });
        
        contentDiv.innerHTML = '';
        contentDiv.appendChild(fragment);
    }

    static createVideoItem(video, index, playlistId) {
        const item = document.createElement('div');
        item.className = 'playlist-video-item';
        item.dataset.videoId = video.videoId;
        item.dataset.playlistId = playlistId;
        
        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        const duration = window.SharedUtils.formatDuration(video.duration);
        const title = window.SharedUtils.escapeHtml(video.title);
        const channel = window.SharedUtils.escapeHtml(video.channelTitle || 'YouTube');
        
        // Check if currently playing
        const isCurrentlyPlaying = window.unifiedStateManager?.state?.playlist?.currentPlayingInfo?.videoId === video.videoId;
        if (isCurrentlyPlaying) {
            item.classList.add('currently-playing');
        }
        
        item.innerHTML = `
            <div class="video-index">${index}</div>
            <img src="${thumbnailUrl}" class="video-thumbnail" alt="${title}" loading="lazy">
            <div class="video-info">
                <div class="video-title">
                    ${title}
                    ${isCurrentlyPlaying ? '<i class="fas fa-volume-up playing-indicator"></i>' : ''}
                </div>
                <div class="video-meta">
                    <span class="video-channel">${channel}</span>
                    ${duration ? `<span class="video-duration">${duration}</span>` : ''}
                </div>
            </div>
            <div class="video-actions">
                <button class="video-action-btn primary" data-action="add-video" data-video-id="${video.videoId}" title="Añadir a cola">
                    <i class="fas fa-plus"></i>
                </button>
                ${playlistId === 'manual' ? 
                    `<button class="video-action-btn" data-action="remove-from-queue" data-video-id="${video.videoId}" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>` :
                    `<button class="video-action-btn" data-action="play-now" data-video-id="${video.videoId}" title="Reproducir ahora">
                        <i class="fas fa-play"></i>
                    </button>`
                }
            </div>
        `;
        
        return item;
    }

    // ===== GESTIÓN DE COLA OPTIMIZADA =====
    static toggleQueue() {
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) return;
        
        if (queueSection.classList.contains('hidden')) {
            UIManager.showQueue();
        } else {
            UIManager.hideQueue();
        }
    }

    static showQueue() {
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) return;
        
        // Update content before showing
        UIManager.updateQueueContent();
        
        queueSection.classList.remove('hidden');
        
        // Focus management for accessibility
        const closeBtn = queueSection.querySelector('.queue-close-btn');
        setTimeout(() => closeBtn?.focus(), 100);
        
        console.log('✅ Cola mostrada');
    }

    static hideQueue() {
        const queueSection = document.getElementById('queueSection');
        if (queueSection) {
            queueSection.classList.add('hidden');
        }
    }

    static updateQueueContent() {
        const playlistContainer = document.getElementById('playlistContainer');
        if (!playlistContainer) return;
        
        const queueInfo = window.PlaylistManager.getQueueInfo();
        
        if (!queueInfo.exists || queueInfo.count === 0) {
            playlistContainer.innerHTML = `
                <div class="empty-queue-message">
                    <i class="fas fa-music"></i>
                    <p>La cola está vacía</p>
                    <p>Añade música desde la biblioteca o búsqueda</p>
                </div>
            `;
        } else {
            const fragment = document.createDocumentFragment();
            
            queueInfo.videos.forEach((video, index) => {
                const videoItem = UIManager.createVideoItem(video, index + 1, 'manual');
                fragment.appendChild(videoItem);
            });
            
            playlistContainer.innerHTML = '';
            playlistContainer.appendChild(fragment);
            
            console.log(`📋 Cola actualizada: ${queueInfo.count} videos`);
        }
    }

    // ===== GESTIÓN DE VISTAS OPTIMIZADA =====
    static switchView(viewName) {
        // Update unified state
        window.unifiedStateManager?.set('ui.currentView', viewName);
        
        // Hide all views
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        // Show target view
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
            UIManager.updateNavigation(viewName);
            
            // View-specific updates
            if (viewName === 'library') {
                setTimeout(() => UIManager.updatePlaylistsUI(), 100);
            } else if (viewName === 'playing') {
                UIManager.updateNowPlayingView();
            }
            
            console.log(`✅ Vista cambiada a: ${viewName}`);
        }
    }

    static updateNavigation(activeView) {
        // Update all navigation items efficiently
        document.querySelectorAll('[data-view]').forEach(item => {
            if (item.dataset.view === activeView) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // ===== MANEJO DE ACCIONES OPTIMIZADO =====
    static handlePlayButtonClick() {
        const state = window.unifiedStateManager?.state;
        if (!state?.app.playersInitialized) {
            window.unifiedMessageManager?.show("Reproductores no están listos", 'warning');
            return;
        }

        if (!state.app.reproduccionIniciada) {
            const flatList = window.PlaylistManager.getFlattenedPlaylist();
            if (flatList.length > 0) {
                window.PlaybackController.playFirstVideo();
            } else {
                window.unifiedMessageManager?.show("No hay videos en la cola", 'warning');
            }
        } else {
            const currentPlayer = state.app.currentPlayer === 1 ? state.app.player1 : state.app.player2;
            if (currentPlayer) {
                const playerState = currentPlayer.getPlayerState();
                if (playerState === YT.PlayerState.PLAYING) {
                    currentPlayer.pauseVideo();
                } else {
                    currentPlayer.playVideo();
                }
            }
        }
    }

    static handleNextButtonClick() {
        if (!window.unifiedStateManager?.state?.app?.reproduccionIniciada) {
            window.unifiedMessageManager?.show("Inicia la reproducción primero", 'warning');
            return;
        }
        
        window.PlaybackController.playNextVideo();
    }

    static handleSearchResultAdd(button, videoData) {
        const result = window.PlaylistManager.addVideoToManualPlaylist(videoData);
        
        if (result) {
            UIManager.provideButtonFeedback(button, 'añadido');
            window.unifiedMessageManager?.show(`♪ "${videoData.title}" añadido a la cola`, 'success', 2000);
            
            // Enable controls if needed
            const flatList = window.PlaylistManager.getFlattenedPlaylist();
            if (flatList.length === 1) { // First video added
                document.getElementById('botonPlay')?.removeAttribute('disabled');
            }
        }
    }

    static handleAddVideoToQueue(button, videoId) {
        // Find video data from the playlist
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        let videoData = null;
        
        for (const playlist of state.playlist.playlistsData) {
            if (playlist.videos) {
                const video = playlist.videos.find(v => v.videoId === videoId);
                if (video) {
                    videoData = video;
                    break;
                }
            }
        }
        
        if (videoData) {
            UIManager.handleSearchResultAdd(button, videoData);
        }
    }

    static handleRemoveFromQueue(videoId) {
        const success = window.PlaylistManager.deleteVideo('manual', videoId);
        if (success) {
            UIManager.updateQueueContent();
            window.unifiedMessageManager?.show('Video eliminado de la cola', 'success', 1500);
        }
    }

    static handlePlayVideoNow(videoId) {
        // Add to queue and play immediately
        // Implementation would depend on specific requirements
        window.unifiedMessageManager?.show('Función "Reproducir Ahora" en desarrollo', 'info');
    }

    static handleAddAllToQueue(playlistId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        const playlist = state.playlist.playlistsData.find(p => p.id === playlistId);
        if (!playlist?.videos?.length) {
            window.unifiedMessageManager?.show('Playlist sin videos válidos', 'warning');
            return;
        }
        
        let addedCount = 0;
        playlist.videos.forEach(video => {
            const result = window.PlaylistManager.addVideoToManualPlaylist(video);
            if (result) addedCount++;
        });
        
        if (addedCount > 0) {
            window.unifiedMessageManager?.show(`${addedCount} videos añadidos a la cola`, 'success');
            UIManager.updateQueueContent();
        }
    }

    static handlePlayAllPlaylist(playlistId) {
        // Clear queue and add all videos from playlist
        window.PlaylistManager.clearQueue();
        UIManager.handleAddAllToQueue(playlistId);
        
        // Start playback
        setTimeout(() => {
            if (window.PlaylistManager.getFlattenedPlaylist().length > 0) {
                window.PlaybackController.playFirstVideo();
            }
        }, 500);
    }

    static handleSearch(query) {
        console.log('🔍 Iniciando búsqueda:', query);
        
        // Switch to search view
        if (window.unifiedStateManager?.state?.ui?.currentView !== 'search') {
            UIManager.switchView('search');
        }
        
        // Trigger search
        window.SearchManager.performSearch(query);
        
        // Dispatch event
        document.dispatchEvent(new CustomEvent('search-started', { detail: { query } }));
    }

    static handlePlaylistUrlAdd() {
        const input = document.getElementById('searchInput2');
        if (!input) return;
        
        const url = input.value.trim();
        if (!url) {
            window.unifiedMessageManager?.show('Ingresa una URL válida', 'warning');
            return;
        }
        
        if (!window.SharedUtils.isValidYouTubeUrl(url)) {
            window.unifiedMessageManager?.show('URL de YouTube no válida', 'error');
            return;
        }
        
        const playlistId = window.SharedUtils.extractPlaylistId(url);
        if (!playlistId) {
            window.unifiedMessageManager?.show('URL no contiene una playlist válida', 'error');
            return;
        }
        
        input.value = '';
        
        // Delegate to core
        if (window.unifiedCore?.handlePlaylistUrlAdd) {
            window.unifiedCore.handlePlaylistUrlAdd();
        } else {
            window.unifiedMessageManager?.show('Sistema de playlist no disponible', 'error');
        }
    }

    // ===== UTILIDADES OPTIMIZADAS =====
    static provideButtonFeedback(button, message = 'completado') {
        if (!button) return;
        
        const originalContent = button.innerHTML;
        const originalStyle = button.style.cssText;
        
        button.innerHTML = '<i class="fas fa-check"></i> ' + message.charAt(0).toUpperCase() + message.slice(1);
        button.style.background = '#4caf50';
        button.disabled = true;
        
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.style.cssText = originalStyle;
            button.disabled = false;
        }, 2000);
    }

    static getPlaylistContainer(currentView) {
        const containers = {
            'library': 'playlistsGrid',
            'playing': 'playlistContainer',
            'home': 'overviewGrid'
        };
        
        const containerId = containers[currentView];
        return containerId ? document.getElementById(containerId) : null;
    }

    static renderEmptyState(container, viewType) {
        const emptyStates = {
            'library': {
                icon: 'fas fa-music',
                title: '¡Conecta tu cuenta de Google!',
                message: 'Ve tus playlists de YouTube y crea mezclas increíbles',
                button: null
            },
            'search': {
                icon: 'fas fa-search',
                title: 'Busca música',
                message: 'Usa la barra de búsqueda para encontrar canciones',
                button: null
            },
            'home': {
                icon: 'fas fa-headphones',
                title: 'Bienvenido a YT CrossMix',
                message: 'Sistema de mezcla avanzado con crossfade automático',
                button: { text: 'Comenzar', action: 'library' }
            }
        };
        
        const config = emptyStates[viewType] || emptyStates.home;
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="${config.icon}"></i>
                <h3>${config.title}</h3>
                <p>${config.message}</p>
                ${config.button ? 
                    `<button class="cta-button" onclick="UIManager.switchView('${config.button.action}')">
                        <i class="fas fa-play"></i>
                        ${config.button.text}
                    </button>` : ''
                }
            </div>
        `;
    }

    static renderNowPlayingInfo() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        const currentInfo = state.playlist.currentPlayingInfo;
        const titleEl = document.getElementById('nowPlayingTitle');
        const artistEl = document.getElementById('nowPlayingArtist');
        
        if (currentInfo.videoId) {
            const flatList = window.PlaylistManager.getFlattenedPlaylist();
            const currentVideo = flatList[currentInfo.flattenedIndex];
            
            if (currentVideo && titleEl && artistEl) {
                titleEl.textContent = currentVideo.title;
                artistEl.textContent = currentVideo.channelTitle || 'YouTube';
            }
        } else if (titleEl && artistEl) {
            titleEl.textContent = 'Selecciona una canción';
            artistEl.textContent = 'YT CrossMix - Sistema Unificado';
        }
    }

    static updateNowPlayingView() {
        UIManager.renderNowPlayingInfo();
        
        // Update bottom player info
        const state = window.unifiedStateManager?.state;
        if (state?.playlist?.currentPlayingInfo?.videoId) {
            const flatList = window.PlaylistManager.getFlattenedPlaylist();
            const currentVideo = flatList[state.playlist.currentPlayingInfo.flattenedIndex];
            
            if (currentVideo) {
                UIManager.updateBottomPlayer(currentVideo);
            }
        }
    }

    static updateBottomPlayer(videoData) {
        const elements = {
            thumbnail: document.getElementById('playerThumbnail'),
            title: document.getElementById('playerTitle'),
            artist: document.getElementById('playerArtist')
        };
        
        if (elements.thumbnail) elements.thumbnail.src = videoData.thumbnail || '';
        if (elements.title) elements.title.textContent = videoData.title || 'Selecciona una canción';
        if (elements.artist) elements.artist.textContent = videoData.channelTitle || 'YT CrossMix';
    }

    // ===== RESPONSIVE DESIGN OPTIMIZADO =====
    static setupResponsiveDesign() {
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            document.querySelector('.mobile-header')?.style.setProperty('display', 'flex');
            document.querySelector('.bottom-nav')?.style.setProperty('display', 'flex');
            document.querySelector('.bottom-player')?.style.setProperty('display', 'none');
        }
        
        // Optimized resize handler
        const debouncedResize = window.SharedUtils.debounce(() => {
            const newIsMobile = window.innerWidth <= 768;
            if (newIsMobile !== isMobile) {
                location.reload(); // Simple but effective for layout changes
            }
        }, 300);
        
        window.addEventListener('resize', debouncedResize);
    }

    static showMiniPlayer(trackInfo = null) {
        if (window.innerWidth > 768) return;
        
        const miniPlayer = document.querySelector('.mini-player');
        if (!miniPlayer) return;
        
        if (trackInfo) {
            UIManager.updateMiniPlayer(trackInfo);
        }
        
        miniPlayer.style.display = 'flex';
        document.body.classList.add('has-playback');
    }

    static updateMiniPlayer(trackInfo) {
        const miniPlayer = document.querySelector('.mini-player');
        if (!miniPlayer) return;
        
        const elements = {
            title: miniPlayer.querySelector('.mini-track-title'),
            artist: miniPlayer.querySelector('.mini-track-artist'),
            image: miniPlayer.querySelector('.mini-track-image')
        };
        
        if (elements.title) elements.title.textContent = trackInfo.title || 'Selecciona una canción';
        if (elements.artist) elements.artist.textContent = trackInfo.artist || 'YT CrossMix';
        if (elements.image && trackInfo.thumbnail) elements.image.src = trackInfo.thumbnail;
        
        UIManager.showMiniPlayer();
    }

    // ===== OPTIMIZACIÓN DE INTERACTIVIDAD =====
    static enableInteractivity() {
        // Remove existing listeners to prevent duplicates
        document.removeEventListener('click', UIManager.handleGlobalClick);
        document.removeEventListener('input', UIManager.handleGlobalInput);
        document.removeEventListener('keydown', UIManager.handleGlobalKeydown);
        
        // Add optimized listeners
        document.addEventListener('click', UIManager.handleGlobalClick);
        document.addEventListener('input', UIManager.handleGlobalInput);
        document.addEventListener('keydown', UIManager.handleGlobalKeydown);
        
        console.log('✅ Interactividad optimizada habilitada');
    }

    // ===== ERROR HANDLING OPTIMIZADO =====
    static showError(message, error = null) {
        console.error(`💥 UI Error: ${message}`, error);
        
        if (window.unifiedMessageManager) {
            window.unifiedMessageManager.show(message, 'error');
        } else {
            // Fallback error display
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                position: fixed; top: 20px; right: 20px; 
                background: #f44336; color: white; padding: 12px 16px;
                border-radius: 8px; z-index: 9999; max-width: 300px;
            `;
            errorDiv.textContent = message;
            document.body.appendChild(errorDiv);
            
            setTimeout(() => errorDiv.remove(), 5000);
        }
    }

    // ===== UTILIDADES CONSOLIDADAS =====
    static getCurrentView() {
        return document.querySelector('.content-view.active')?.id?.replace('View', '') || 'home';
    }

    // Create debounced search function once
    static debouncedSearch = window.SharedUtils?.debounce((query) => {
        if (query.length > 2) {
            UIManager.handleSearch(query);
        }
    }, 500);

    // ===== FALLBACK METHODS =====
    static renderPlaylistList(container, playlistsData) {
        console.log('📝 Renderizando lista tradicional...');
        
        const fragment = document.createDocumentFragment();
        
        playlistsData.forEach((playlist) => {
            if (playlist.id === 'manual') return;
            
            const groupDiv = UIManager.createPlaylistGroup(playlist);
            fragment.appendChild(groupDiv);
        });
        
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    static createPlaylistGroup(playlist) {
        const groupDiv = document.createElement('div');
        groupDiv.className = `playlist-group-mobile ${playlist.isExpanded ? 'expanded' : ''}`;
        groupDiv.dataset.playlistId = playlist.id;
        
        const videoCount = playlist.videos?.length || playlist.itemCount || 0;
        const thumbnailUrl = UIManager.getPlaylistThumbnail(playlist);
        const name = window.SharedUtils.escapeHtml(playlist.name);
        
        groupDiv.innerHTML = `
            <div class="playlist-group-header-mobile">
                <img src="${thumbnailUrl}" class="playlist-group-thumb-mobile" alt="${name}">
                <div class="playlist-info-mobile">
                    <span class="playlist-name-mobile">${name}</span>
                    <span class="playlist-count-mobile">${videoCount} videos</span>
                </div>
                <i class="fas fa-chevron-down expand-icon-mobile"></i>
            </div>
            <div class="playlist-group-videos-mobile">
                ${playlist.isExpanded && playlist.videos ? 
                    playlist.videos.map((video, index) => 
                        UIManager.createVideoItemHTML(video, index)
                    ).join('') : 
                    ''
                }
            </div>
        `;
        
        return groupDiv;
    }

    static createVideoItemHTML(video, index) {
        const duration = window.SharedUtils.formatDuration(video.duration);
        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        const title = window.SharedUtils.escapeHtml(video.title);
        
        return `
            <div class="playlist-item-mobile" data-video-id="${video.videoId}">
                <img src="${thumbnailUrl}" class="playlist-item-thumb-mobile" alt="${title}">
                <div class="playlist-item-info-mobile">
                    <div class="playlist-item-title-mobile">${title}</div>
                    <div class="playlist-item-duration-mobile">${duration}</div>
                </div>
                <button class="playlist-item-menu-mobile" data-video-id="${video.videoId}">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
    }

    // ===== DEBUG Y TESTING OPTIMIZADO =====
    static getDebugInfo() {
        const state = window.unifiedStateManager?.state;
        
        return {
            timestamp: Date.now(),
            currentView: UIManager.getCurrentView(),
            stateView: state?.ui?.currentView,
            playlistCount: state?.playlist?.playlistsData?.length || 0,
            queueCount: window.PlaylistManager?.getQueueInfo()?.count || 0,
            containers: {
                playlistsGrid: !!document.getElementById('playlistsGrid'),
                playlistContainer: !!document.getElementById('playlistContainer'),
                searchResults: !!document.getElementById('searchResults'),
                queueSection: !!document.getElementById('queueSection')
            },
            responsive: {
                isMobile: window.innerWidth <= 768,
                windowWidth: window.innerWidth,
                windowHeight: window.innerHeight
            }
        };
    }

    static testUIFlow() {
        console.log('🧪 Testing UI flow...');
        
        const sequence = [
            { view: 'home', delay: 0 },
            { view: 'library', delay: 1000 },
            { view: 'search', delay: 2000 },
            { view: 'playing', delay: 3000 },
            { view: 'home', delay: 4000 }
        ];
        
        sequence.forEach(({ view, delay }) => {
            setTimeout(() => {
                console.log(`🔄 Testing view: ${view}`);
                UIManager.switchView(view);
            }, delay);
        });
        
        console.log('✅ UI flow test iniciado');
    }
}

// ===== FUNCIÓN DE MENSAJES OPTIMIZADA =====
export function mostrarMensajeFlotante(mensaje, duracion = 3000, tipo = 'info') {
    if (window.unifiedMessageManager?.show) {
        return window.unifiedMessageManager.show(mensaje, tipo, duracion);
    }
    
    // Optimized fallback
    console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
    
    const messageEl = document.createElement('div');
    messageEl.className = `floating-message ${tipo} show`;
    messageEl.textContent = mensaje;
    messageEl.style.cssText = `
        position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
        background: var(--background-elevated); color: var(--text-primary);
        padding: 12px 16px; border-radius: 8px; z-index: 3000;
        font-size: 14px; text-align: center; box-shadow: var(--shadow-medium);
        transition: all 0.3s ease; cursor: pointer;
    `;
    
    // Type-specific styling
    const typeStyles = {
        success: 'background: rgba(76, 175, 80, 0.9); color: white;',
        error: 'background: rgba(244, 67, 54, 0.9); color: white;',
        warning: 'background: rgba(255, 193, 7, 0.9); color: black;',
        info: 'background: rgba(33, 150, 243, 0.9); color: white;'
    };
    
    if (typeStyles[tipo]) {
        messageEl.style.cssText += typeStyles[tipo];
    }
    
    document.body.appendChild(messageEl);
    
    // Auto-remove and click to dismiss
    const remove = () => {
        messageEl.style.opacity = '0';
        setTimeout(() => messageEl.remove(), 300);
    };
    
    messageEl.addEventListener('click', remove);
    setTimeout(remove, duracion);
    
    return messageEl;
}

// ===== AUTO-INICIALIZACIÓN OPTIMIZADA =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM listo, configurando UIManager optimizado...');
    
    // Single initialization attempt
    if (window.ytCrossMixUnified?.initialized) {
        UIManager.initialize();
    } else {
        window.addEventListener('ytcrossmix:unified:ready', UIManager.initialize, { once: true });
        
        // Fallback timeout
        setTimeout(() => {
            if (!window.ytCrossMixUnified?.initialized) {
                console.warn('⚠️ Timeout esperando sistema, inicializando UI básica...');
                UIManager.initialize();
            }
        }, 5000);
    }
});

// ===== REFERENCIAS GLOBALES OPTIMIZADAS =====
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
    window.mostrarMensajeFlotante = mostrarMensajeFlotante;
    
    // Consolidated debug object
    window.UIDebug = {
        // Core debugging
        updateUI: () => UIManager.updatePlaylistsUI(),
        switchView: (view) => UIManager.switchView(view),
        getCurrentView: () => UIManager.getCurrentView(),
        
        // Queue debugging
        showQueue: () => UIManager.showQueue(),
        hideQueue: () => UIManager.hideQueue(),
        updateQueue: () => UIManager.updateQueueContent(),
        
        // Search debugging
        testSearch: (query = 'test music') => UIManager.handleSearch(query),
        
        // State debugging
        getDebugInfo: () => UIManager.getDebugInfo(),
        getState: () => window.unifiedStateManager?.state,
        
        // UI testing
        testFlow: () => UIManager.testUIFlow(),
        testMessage: (type = 'info') => mostrarMensajeFlotante(`Test ${type} message`, 2000, type),
        
        // Container verification
        checkContainers: () => {
            const containers = ['playlistsGrid', 'playlistContainer', 'searchResults', 'queueSection'];
            const status = {};
            containers.forEach(id => {
                status[id] = !!document.getElementById(id);
            });
            console.table(status);
            return status;
        },
        
        // Performance testing
        testPerformance: () => {
            const start = performance.now();
            UIManager.updatePlaylistsUI();
            const end = performance.now();
            console.log(`⚡ UI Update took: ${(end - start).toFixed(2)}ms`);
            return end - start;
        }
    };
    
    // Keyboard shortcuts for debugging
    document.addEventListener('keydown', (event) => {
        if (event.target.tagName === 'INPUT') return;
        
        // Ctrl + Shift + U = UI Debug
        if (event.ctrlKey && event.shiftKey && event.key === 'U') {
            event.preventDefault();
            console.log('🔧 UI Debug Info:');
            console.table(UIManager.getDebugInfo());
        }
        
        // Ctrl + Shift + T = Test UI Flow
        if (event.ctrlKey && event.shiftKey && event.key === 'T') {
            event.preventDefault();
            UIManager.testUIFlow();
        }
        
        // Ctrl + Shift + Q = Toggle Queue
        if (event.ctrlKey && event.shiftKey && event.key === 'Q') {
            event.preventDefault();
            UIManager.toggleQueue();
        }
    });
}

console.log('✅ UIManager Optimizado cargado - Performance mejorado, duplicaciones eliminadas');
console.log('🔧 UIDebug disponible: window.UIDebug.testFlow()');
console.log('⌨️  Shortcuts: Ctrl+Shift+U (debug), Ctrl+Shift+T (test), Ctrl+Shift+Q (queue)');
