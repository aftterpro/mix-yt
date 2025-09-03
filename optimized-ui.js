export class UIManager {
    static initialized = false;

    // ✅ INICIALIZACIÓN CORREGIDA
    static initialize() {
        if (UIManager.initialized) return;
        
        console.log('🎨 Inicializando UIManager...');
        
        UIManager.setupEventListeners();
        UIManager.setupResponsiveDesign();
        UIManager.enableInteractivity();
        UIManager.setupPopup();
        
        UIManager.initialized = true;
        console.log('✅ UIManager inicializado');
    }

    // ✅ SETUP DE EVENT LISTENERS GLOBAL
    static setupEventListeners() {
        // Event listener global optimizado
        document.addEventListener('click', UIManager.handleGlobalClick);
        document.addEventListener('input', UIManager.handleGlobalInput);
        document.addEventListener('keydown', UIManager.handleGlobalKeydown);
        
        // Event listeners específicos
        document.addEventListener('playlistsFetched', (event) => {
            console.log('📚 Playlists recibidas:', event.detail?.length || 0);
            setTimeout(() => UIManager.updatePlaylistsUI(), 500);
        });

        document.addEventListener('userLoggedOut', () => {
            console.log('👤 Usuario deslogueado');
            setTimeout(() => UIManager.updatePlaylistsUI(), 500);
        });
    }

    // ✅ MANEJO GLOBAL DE CLICKS
    static handleGlobalClick(event) {
        const target = event.target;
        const button = target.closest('button');
        
        if (!button) return;
        
        const action = button.dataset.action;
        const playlistId = button.dataset.playlistId;
        const videoId = button.dataset.videoId;
        
        // Prevenir múltiples clicks
        if (button.disabled) return;
        
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
                    UIManager.handlePlayVideoNow(button, videoId);
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
                
            case 'expand-playlist':
                if (playlistId) {
                    window.PlaylistManager?.togglePlaylistExpansion?.(playlistId);
                }
                break;
        }
        
        // Botones específicos por ID
        if (button.id) {
            switch (button.id) {
                case 'botonPlay':
                case 'miniPlayBtn':
                    UIManager.handlePlayButtonClick();
                    break;
                    
                case 'botonNext':
                    UIManager.handleNextButtonClick();
                    break;
                    
                case 'queueButton':
                    UIManager.toggleQueue();
                    break;
                    
                case 'añadirUrlButton':
                    UIManager.handlePlaylistUrlAdd();
                    break;
            }
        }
        
        // Botones de playlist expand
        if (button.classList.contains('playlist-expand-btn')) {
            const playlistCard = button.closest('[data-playlist-id]');
            if (playlistCard) {
                const pid = playlistCard.dataset.playlistId;
                UIManager.showPlaylistPopup(pid);
            }
        }
    }

    // ✅ MANEJO GLOBAL DE INPUTS
    static handleGlobalInput(event) {
        const input = event.target;
        
        if (input.classList.contains('sidebar-search-input') || 
            input.classList.contains('mobile-search-input') ||
            input.id === 'searchInput') {
            
            const query = input.value.trim();
            if (UIManager.debouncedSearch) {
                UIManager.debouncedSearch(query);
            }
        }
    }

    // ✅ MANEJO GLOBAL DE TECLADO
    static handleGlobalKeydown(event) {
        const input = event.target;
        
        // Enter en campos de búsqueda
        if (event.key === 'Enter' && input.type === 'text') {
            if (input.classList.contains('sidebar-search-input') || 
                input.classList.contains('mobile-search-input') ||
                input.id === 'searchInput') {
                
                const query = input.value.trim();
                if (query.length > 0) {
                    UIManager.handleSearch(query);
                }
            }
            
            // Enter en campo de URL de playlist
            if (input.id === 'searchInput2') {
                UIManager.handlePlaylistUrlAdd();
            }
        }
        
        // Shortcuts de teclado globales
        if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
            switch (event.key.toLowerCase()) {
                case ' ':  // Spacebar
                    event.preventDefault();
                    UIManager.handlePlayButtonClick();
                    break;
                    
                case 'arrowright':
                    event.preventDefault();
                    UIManager.handleNextButtonClick();
                    break;
                    
                case 'q':
                    if (event.ctrlKey) {
                        event.preventDefault();
                        UIManager.toggleQueue();
                    }
                    break;
            }
        }
    }

    // ✅ SETUP DE POPUP CORREGIDO
    static setupPopup() {
        // Crear popup si no existe
        if (!document.getElementById('playlistPopup')) {
            UIManager.createPlaylistPopup();
        }
        
        // Setup listeners del popup
        const popup = document.getElementById('playlistPopup');
        if (popup) {
            // Click fuera del popup para cerrar
            popup.addEventListener('click', (event) => {
                if (event.target === popup) {
                    UIManager.hidePlaylistPopup();
                }
            });
            
            // Botón de cerrar
            const closeBtn = popup.querySelector('.playlist-popup-close, .popup-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    UIManager.hidePlaylistPopup();
                });
            }
            
            // Escape key para cerrar
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && popup.classList.contains('show')) {
                    UIManager.hidePlaylistPopup();
                }
            });
            
            // Setup botones del popup
            const addAllBtn = document.getElementById('popupAddAllBtn');
            if (addAllBtn) {
            }   
        }
      }
}
    // ✅ MOSTRAR POPUP DE PLAYLIST
    static async showPlaylistPopup(playlistId) {
        const popup = document.getElementById('playlistPopup');
        if (!popup) return;

        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const playlist = state.playlist.playlistsData.find(p => p.id === playlistId);
        if (!playlist) return;

        console.log(`📋 Mostrando popup para playlist: ${playlist.name}`);

        // Configurar datos básicos
        popup.dataset.currentPlaylistId = playlistId;
        
        const thumbnail = popup.querySelector('.playlist-popup-thumbnail');
        const title = popup.querySelector('.playlist-popup-title');
        const meta = popup.querySelector('.playlist-popup-meta');
        
        thumbnail.src = playlist.thumbnailUrl || 'https://via.placeholder.com/60x60/333333/ffffff?text=PL';
        title.textContent = playlist.name;
        meta.textContent = `${playlist.itemCount || 0} videos`;

        // Mostrar popup
        popup.classList.add('show');

        // Cargar videos si es necesario
        if (!playlist.isLoaded && playlist.source === 'youtube_library') {
            await UIManager.loadPlaylistVideosForPopup(playlistId);
        } else {
            UIManager.renderPlaylistPopupVideos(playlist.videos || []);
        }
    }

    // ✅ CARGAR VIDEOS DE YOUTUBE LIBRARY PARA POPUP
    static async loadPlaylistVideosForPopup(playlistId) {
        const videosContainer = document.getElementById('playlistPopupVideos');
        if (!videosContainer) return;

        videosContainer.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 16px;"></i>
                <p>Cargando videos...</p>
            </div>
        `;

        try {
            const authManager = window.unifiedAuthManager || window.authManager;
            
            if (!authManager?.isUserAuthenticated()) {
                throw new Error('No hay sesión de Google activa');
            }

            const videos = await authManager.getPlaylistVideos(playlistId);
            
            if (videos?.length > 0) {
                // Actualizar playlist en el estado
                const state = window.unifiedStateManager?.state;
                if (state) {
                    const playlistsData = [...state.playlist.playlistsData];
                    const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
                    
                    if (playlistIndex !== -1) {
                        playlistsData[playlistIndex] = {
                            ...playlistsData[playlistIndex],
                            videos: videos,
                            isLoaded: true
                        };
                        
                        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
                    }
                }
                
                UIManager.renderPlaylistPopupVideos(videos);
                console.log(`✅ ${videos.length} videos cargados para popup`);
            } else {
                videosContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                        <i class="fas fa-music" style="font-size: 32px; margin-bottom: 16px; opacity: 0.5;"></i>
                        <p>No se encontraron videos en esta playlist</p>
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('❌ Error cargando videos para popup:', error);
            videosContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 16px; color: #f44336;"></i>
                    <p>Error cargando videos</p>
                    <p style="font-size: 12px; margin-top: 8px;">${error.message}</p>
                </div>
            `;
        }
    }

    // ✅ RENDERIZAR VIDEOS EN POPUP
    static renderPlaylistPopupVideos(videos) {
        const videosContainer = document.getElementById('playlistPopupVideos');
        if (!videosContainer) return;

        if (!videos || videos.length === 0) {
            videosContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-music" style="font-size: 32px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <p>Esta playlist está vacía</p>
                </div>
            `;
            return;
        }

        videosContainer.innerHTML = '';

        videos.forEach((video, index) => {
            const videoElement = UIManager.createPopupVideoElement(video, index);
            videosContainer.appendChild(videoElement);
        });
    }

    // ✅ CREAR ELEMENTO DE VIDEO PARA POPUP
    static createPopupVideoElement(video, index) {
        const div = document.createElement('div');
        div.className = 'popup-video-item';
        div.dataset.videoId = video.videoId;

        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        const duration = window.SharedUtils?.formatDuration(video.duration) || '';
        const title = window.SharedUtils?.escapeHtml(video.title) || 'Título no disponible';
        const channel = window.SharedUtils?.escapeHtml(video.channelTitle) || 'Desconocido';

        div.innerHTML = `
            <div class="popup-video-index">${index + 1}</div>
            <img src="${thumbnailUrl}" class="popup-video-thumbnail" alt="${title}" loading="lazy">
            <div class="popup-video-info">
                <div class="popup-video-title" title="${title}">${title}</div>
                <div class="popup-video-meta">
                    <span class="popup-video-channel" title="${channel}">${channel}</span>
                    ${duration ? `<span class="popup-video-duration">${duration}</span>` : ''}
                </div>
            </div>
            <div class="popup-video-actions">
                <button class="popup-video-action-btn primary" data-action="add-video" data-video-id="${video.videoId}" title="Añadir a cola">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="popup-video-action-btn" data-action="play-next" data-video-id="${video.videoId}" title="Reproducir siguiente">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        `;

        return div;
    }

    // ✅ OCULTAR POPUP
    static hidePlaylistPopup() {
        const popup = document.getElementById('playlistPopup');
        if (popup) {
            popup.classList.remove('show');
            popup.dataset.currentPlaylistId = '';
        }
    }

    // ✅ ACTUALIZACIÓN DE UI CORREGIDA
    static updatePlaylistsUI() {
        try {
            const state = window.unifiedStateManager?.state;
            if (!state) return;
            
            const currentView = state.ui.currentView;
            
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
                        UIManager.updateQueueDisplay();
                        break;
                    default:
                        UIManager.renderPlaylistList(playlistContainer, state.playlist.playlistsData);
                }
            }
            
            if (currentScrollTop > 0) {
                playlistContainer.scrollTop = currentScrollTop;
            }
            
            console.log('✅ UI actualizada');
            
        } catch (error) {
            console.error('💥 Error actualizando UI:', error);
            UIManager.showError('Error actualizando interfaz', error);
        }
    }

    // ✅ RENDERIZADO DE BIBLIOTECA EN BALDOSAS PEQUEÑAS
    static renderLibraryGrid(container, playlistsData) {
        container.innerHTML = '';
        container.className = 'library-container';
        
        const grid = document.createElement('div');
        grid.className = 'library-grid';
        
        if (playlistsData.length === 0) {
            UIManager.renderEmptyState(container, 'library');
            return;
        }
        
        const fragment = document.createDocumentFragment();
        
        playlistsData.forEach((playlist, index) => {
            const card = UIManager.createPlaylistCard(playlist, index);
            fragment.appendChild(card);
        });
        
        grid.appendChild(fragment);
        container.appendChild(grid);
        
        console.log(`✅ ${playlistsData.length} playlists renderizadas en baldosas`);
    }

    // ✅ CREAR TARJETA DE PLAYLIST (BALDOSA PEQUEÑA)
    static createPlaylistCard(playlist, index) {
        const card = document.createElement('div');
        card.className = 'playlist-card-expandable';
        card.dataset.playlistId = playlist.id;
        
        const videoCount = playlist.videos?.length || playlist.itemCount || 0;
        const thumbnailUrl = UIManager.getPlaylistThumbnail(playlist);
        const isYouTubeLibrary = playlist.source === 'youtube_library';
        const isLoaded = playlist.isLoaded || playlist.videos?.length > 0;
        
        card.innerHTML = UIManager.getPlaylistCardHTML(playlist, videoCount, thumbnailUrl, isYouTubeLibrary, isLoaded);
        
        // Animación escalonada
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'all 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 50);
        
        return card;
    }

    static getPlaylistCardHTML(playlist, videoCount, thumbnailUrl, isYouTubeLibrary, isLoaded) {
        const name = window.SharedUtils?.escapeHtml(playlist.name) || 'Playlist Sin Nombre';
        
        return `
            <div class="playlist-card-header" data-playlist-id="${playlist.id}">
                <div class="playlist-card-image">
                    <img src="${thumbnailUrl}" alt="${name}" loading="lazy">
                    <div class="playlist-card-overlay">
                        <button class="playlist-expand-btn">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="playlist-card-info">
                    <h3 class="playlist-card-title" title="${name}">${name}</h3>
                    <p class="playlist-card-meta">
                        ${videoCount} videos
                        ${isYouTubeLibrary && !isLoaded ? ' • Click para ver' : ''}
                    </p>
                    <div class="playlist-card-actions">
                        <button class="playlist-action-btn primary" data-action="add-all" data-playlist-id="${playlist.id}">
                            <i class="fas fa-plus"></i> Añadir
                        </button>
                        <button class="playlist-action-btn secondary" data-action="play-all" data-playlist-id="${playlist.id}">
                            <i class="fas fa-play"></i> Reproducir
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    static getPlaylistThumbnail(playlist) {
        return playlist.thumbnailUrl || 
               playlist.thumbnail || 
               (playlist.videos?.[0]?.thumbnail) ||
               'https://via.placeholder.com/240x135/333333/ffffff?text=Playlist';
    }

    // ✅ GESTIÓN DE COLA MEJORADA
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
        
        UIManager.updateQueueDisplay();
        
        queueSection.classList.remove('hidden');
        
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

    // ✅ ACTUALIZAR CONTENIDO DE COLA
    static updateQueueDisplay() {
        const playlistContainer = document.getElementById('playlistContainer');
        if (!playlistContainer) return;
        
        const queue = window.unifiedCore?.playlistManager?.getFlattenedPlaylist() || [];
        
        if (queue.length === 0) {
            playlistContainer.innerHTML = `
                <div class="empty-queue-message">
                    <i class="fas fa-music"></i>
                    <p>La cola está vacía</p>
                    <p>Añade música desde la biblioteca o búsqueda</p>
                </div>
            `;
        } else {
            playlistContainer.innerHTML = '';
            
            const fragment = document.createDocumentFragment();
            
            queue.forEach((video, index) => {
                const videoItem = UIManager.createQueueVideoElement(video, index);
                fragment.appendChild(videoItem);
            });
            
            playlistContainer.appendChild(fragment);
            
            console.log(`📋 Cola actualizada: ${queue.length} videos`);
        }
    }

    // ✅ CREAR ELEMENTO DE VIDEO EN COLA
    static createQueueVideoElement(video, index) {
        const div = document.createElement('div');
        div.className = 'playlist-video-item queue-video-item';
        div.dataset.videoId = video.videoId;
        div.dataset.index = index;
        
        const currentVideoId = window.unifiedStateManager?.state?.playlist?.currentPlayingInfo?.videoId;
        const isCurrentlyPlaying = currentVideoId === video.videoId;
        
        if (isCurrentlyPlaying) {
            div.classList.add('currently-playing');
        }
        
        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        const duration = window.SharedUtils?.formatDuration(video.duration) || '';
        const title = window.SharedUtils?.escapeHtml(video.title) || 'Título no disponible';
        const channel = window.SharedUtils?.escapeHtml(video.channelTitle) || 'Desconocido';
        
        div.innerHTML = `
            <div class="video-index">${index + 1}</div>
            <img src="${thumbnailUrl}" class="video-thumbnail" alt="${title}" loading="lazy">
            <div class="video-info">
                <div class="video-title">
                    ${title}
                    ${isCurrentlyPlaying ? '<i class="fas fa-volume-up playing-indicator"></i>' : ''}
                </div>
                <div class="video-meta">
                    <span class="video-channel" title="${channel}">${channel}</span>
                    ${duration ? `<span class="video-duration">${duration}</span>` : ''}
                </div>
            </div>
            <div class="video-actions">
                <button class="video-action-btn primary" data-action="play-now" data-video-id="${video.videoId}" title="Reproducir ahora">
                    <i class="fas fa-play"></i>
                </button>
                <button class="video-action-btn" data-action="remove-from-queue" data-video-id="${video.videoId}" title="Eliminar de cola">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        return div;
    }

    // ✅ GESTIÓN DE VISTAS CORREGIDA
    static switchView(viewName) {
        window.unifiedStateManager?.set('ui.currentView', viewName);
        
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
            UIManager.updateNavigation(viewName);
            
            if (viewName === 'library') {
                setTimeout(() => UIManager.updatePlaylistsUI(), 100);
            } else if (viewName === 'playing') {
                UIManager.updateNowPlayingView();
            }
            
            console.log(`✅ Vista cambiada a: ${viewName}`);
        }
    }

    static updateNavigation(activeView) {
        document.querySelectorAll('[data-view]').forEach(item => {
            if (item.dataset.view === activeView) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // ✅ MANEJO DE ACCIONES CORREGIDO
    static handlePlayButtonClick() {
        const state = window.unifiedStateManager?.state;
        if (!state?.app.playersInitialized) {
            window.unifiedMessageManager?.show("Reproductores no están listos", 'warning');
            return;
        }

        if (!state.app.reproduccionIniciada) {
            const queue = window.unifiedCore?.playlistManager?.getFlattenedPlaylist() || [];
            if (queue.length > 0) {
                window.unifiedCore?.playbackController?.playFirstVideo();
            } else {
                window.unifiedMessageManager?.show("No hay videos en la cola", 'warning');
            }
        } else {
            window.unifiedCore?.playbackController?.togglePlayback();
        }
    }

    static handleNextButtonClick() {
        const state = window.unifiedStateManager?.state;
        if (!state?.app?.reproduccionIniciada) {
            window.unifiedMessageManager?.show("Inicia la reproducción primero", 'warning');
            return;
        }
        
        window.unifiedCore?.playbackController?.playNextVideo();
    }

    static handleAddVideoToQueue(button, videoId) {
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
            const result = window.unifiedCore?.addVideoToQueue(videoId, videoData.title, videoData.thumbnail, videoData.channelTitle);
            if (result) {
                UIManager.provideButtonFeedback(button, 'añadido');
            }
        }
    }

    static handleRemoveFromQueue(videoId) {
        const success = window.unifiedCore?.playlistManager?.removeVideoFromQueue(videoId);
        if (success) {
            window.unifiedMessageManager?.show('Video eliminado de la cola', 'success', 1500);
            UIManager.updateQueueDisplay();
        }
    }

    // ✅ REPRODUCIR VIDEO AHORA (MOVER A PRIMERA POSICIÓN)
    static handlePlayVideoNow(button, videoId) {
        const queue = window.unifiedCore?.playlistManager?.getFlattenedPlaylist() || [];
        const videoIndex = queue.findIndex(v => v.videoId === videoId);
        
        if (videoIndex !== -1) {
            window.unifiedCore?.playbackController?.playVideoAtIndex(videoIndex);
            UIManager.provideButtonFeedback(button, 'reproduciendo');
        }
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
            const result = window.unifiedCore?.addVideoToQueue(video.videoId, video.title, video.thumbnail, video.channelTitle);
            if (result) addedCount++;
        });
        
        if (addedCount > 0) {
            window.unifiedMessageManager?.show(`${addedCount} videos añadidos a la cola`, 'success');
            UIManager.updateQueueDisplay();
        }
    }

    static handlePlayAllPlaylist(playlistId) {
        // Limpiar cola actual
        const currentQueue = window.unifiedStateManager?.state?.playlist?.manualQueue || [];
        window.unifiedStateManager?.set('playlist.manualQueue', []);
        
        // Añadir todos los videos
        UIManager.handleAddAllToQueue(playlistId);
        
        // Iniciar reproducción
        setTimeout(() => {
            const newQueue = window.unifiedCore?.playlistManager?.getFlattenedPlaylist() || [];
            if (newQueue.length > 0) {
                window.unifiedCore?.playbackController?.playFirstVideo();
            }
        }, 500);
    }

    static handleSearch(query) {
        console.log('🔍 Iniciando búsqueda:', query);
        
        if (window.unifiedStateManager?.state?.ui?.currentView !== 'search') {
            UIManager.switchView('search');
        }
        
        window.unifiedCore?.searchManager?.performSearch(query);
        
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
        
        if (!window.SharedUtils?.isValidYouTubeUrl(url)) {
            window.unifiedMessageManager?.show('URL de YouTube no válida', 'error');
            return;
        }
        
        const playlistId = window.SharedUtils?.extractPlaylistId(url);
        if (!playlistId) {
            window.unifiedMessageManager?.show('URL no contiene una playlist válida', 'error');
            return;
        }
        
        input.value = '';
        
        if (window.unifiedCore?.playlistManager?.handlePlaylistUrlAdd) {
            window.unifiedCore.playlistManager.handlePlaylistUrlAdd();
        }
    }

    // ✅ UTILIDADES MEJORADAS
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
            const queue = window.unifiedCore?.playlistManager?.getFlattenedPlaylist() || [];
            const currentVideo = queue[currentInfo.flattenedIndex];
            
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
        UIManager.updateQueueDisplay();
        
        const state = window.unifiedStateManager?.state;
        if (state?.playlist?.currentPlayingInfo?.videoId) {
            const queue = window.unifiedCore?.playlistManager?.getFlattenedPlaylist() || [];
            const currentVideo = queue[state.playlist.currentPlayingInfo.flattenedIndex];
            
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

    static setupResponsiveDesign() {
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            document.querySelector('.mobile-header')?.style.setProperty('display', 'flex');
            document.querySelector('.bottom-nav')?.style.setProperty('display', 'flex');
            document.querySelector('.bottom-player')?.style.setProperty('display', 'none');
        }
        
        const debouncedResize = window.SharedUtils?.debounce(() => {
            const newIsMobile = window.innerWidth <= 768;
            if (newIsMobile !== isMobile) {
                location.reload();
            }
        }, 300);
        
        if (debouncedResize) {
            window.addEventListener('resize', debouncedResize);
        }
    }

    static enableInteractivity() {
        document.removeEventListener('click', UIManager.handleGlobalClick);
        document.removeEventListener('input', UIManager.handleGlobalInput);
        document.removeEventListener('keydown', UIManager.handleGlobalKeydown);
        
        document.addEventListener('click', UIManager.handleGlobalClick);
        document.addEventListener('input', UIManager.handleGlobalInput);
        document.addEventListener('keydown', UIManager.handleGlobalKeydown);
        
        console.log('✅ Interactividad optimizada habilitada');
    }

    static showError(message, error = null) {
        console.error(`💥 UI Error: ${message}`, error);
        
        if (window.unifiedMessageManager) {
            window.unifiedMessageManager.show(message, 'error');
        } else {
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

    static getCurrentView() {
        return document.querySelector('.content-view.active')?.id?.replace('View', '') || 'home';
    }

    // Create debounced search function once
    static debouncedSearch = window.SharedUtils?.debounce((query) => {
        if (query.length > 2) {
            UIManager.handleSearch(query);
        }
    }, 500);

    // ✅ MÉTODOS FALLBACK PARA COMPATIBILIDAD
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
        groupDiv.className = 'playlist-group-mobile';
        groupDiv.dataset.playlistId = playlist.id;
        
        const videoCount = playlist.videos?.length || playlist.itemCount || 0;
        const thumbnailUrl = UIManager.getPlaylistThumbnail(playlist);
        const name = window.SharedUtils?.escapeHtml(playlist.name) || 'Playlist Sin Nombre';
        
        groupDiv.innerHTML = `
            <div class="playlist-group-header-mobile">
                <img src="${thumbnailUrl}" class="playlist-group-thumb-mobile" alt="${name}">
                <div class="playlist-info-mobile">
                    <span class="playlist-name-mobile">${name}</span>
                    <span class="playlist-count-mobile">${videoCount} videos</span>
                </div>
                <button class="playlist-view-btn" onclick="UIManager.showPlaylistPopup('${playlist.id}')">
                    <i class="fas fa-eye"></i> Ver
                </button>
            </div>
        `;
        
        return groupDiv;
    }

    // ✅ DEBUG Y TESTING MEJORADO
    static getDebugInfo() {
        const state = window.unifiedStateManager?.state;
        
        return {
            timestamp: Date.now(),
            currentView: UIManager.getCurrentView(),
            stateView: state?.ui?.currentView,
            playlistCount: state?.playlist?.playlistsData?.length || 0,
            queueCount: window.unifiedCore?.playlistManager?.getFlattenedPlaylist()?.length || 0,
            containers: {
                playlistsGrid: !!document.getElementById('playlistsGrid'),
                playlistContainer: !!document.getElementById('playlistContainer'),
                searchResults: !!document.getElementById('searchResults'),
                queueSection: !!document.getElementById('queueSection'),
                playlistPopup: !!document.getElementById('playlistPopup')
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

// ✅ FUNCIÓN DE MENSAJES COMPATIBLE
export function mostrarMensajeFlotante(mensaje, duracion = 3000, tipo = 'info') {
    if (window.unifiedMessageManager?.show) {
        return window.unifiedMessageManager.show(mensaje, tipo, duracion);
    }
    
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
    
    const remove = () => {
        messageEl.style.opacity = '0';
        setTimeout(() => messageEl.remove(), 300);
    };
    
    messageEl.addEventListener('click', remove);
    setTimeout(remove, duracion);
    
    return messageEl;
}

// ✅ AUTO-INICIALIZACIÓN CORREGIDA
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM listo, configurando UIManager optimizado...');
    
    if (window.ytCrossMixUnified?.initialized) {
        UIManager.initialize();
    } else {
        window.addEventListener('ytcrossmix:unified:ready', UIManager.initialize, { once: true });
        
        setTimeout(() => {
            if (!window.ytCrossMixUnified?.initialized) {
                console.warn('⚠️ Timeout esperando sistema, inicializando UI básica...');
                UIManager.initialize();
            }
        }, 5000);
    }
});

// ✅ REFERENCIAS GLOBALES OPTIMIZADAS
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
        updateQueue: () => UIManager.updateQueueDisplay(),
        
        // Popup debugging
        showPopup: (playlistId) => UIManager.showPlaylistPopup(playlistId),
        hidePopup: () => UIManager.hidePlaylistPopup(),
        
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
            const containers = ['playlistsGrid', 'playlistContainer', 'searchResults', 'queueSection', 'playlistPopup'];
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
    
    // Keyboard shortcuts para debugging
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

        // Ctrl + Shift + P = Test Popup (primera playlist)
        if (event.ctrlKey && event.shiftKey && event.key === 'P') {
            event.preventDefault();
            const firstPlaylist = window.unifiedStateManager?.state?.playlist?.playlistsData?.[0];
            if (firstPlaylist) {
                UIManager.showPlaylistPopup(firstPlaylist.id);
            }
        }
    });
}

console.log('✅ UIManager CORREGIDO cargado');
console.log('🎯 Nuevas características:');
console.log('   - Biblioteca en baldosas pequeñas');
console.log('   - Popup de playlist con todos los videos');
console.log('   - Cola de reproducción funcional');
console.log('   - Búsqueda en formato de 4 columnas');
console.log('🔧 UIDebug disponible: window.UIDebug.testFlow()');
console.log('⌨️  Shortcuts: Ctrl+Shift+U (debug), Ctrl+Shift+T (test), Ctrl+Shift+Q (queue), Ctrl+Shift+P (popup)');
