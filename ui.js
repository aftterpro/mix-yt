// ===== UI.JS - CORREGIDO E INTEGRADO =====
// Versión que mantiene funcionalidad de UI específica y delega lógica de negocio al core

export class UIManager {

    // ✅ INICIALIZACIÓN MEJORADA CON CORE
    static async initialize() {
        console.log('🎨 Inicializando UIManager con sistema unificado...');
        
        try {
            // Esperar a que el core esté disponible
            if (window.unifiedCore?.initialized) {
                console.log('✅ Core ya disponible, inicializando UI');
                UIManager.setupUI();
            } else {
                console.log('⏳ Esperando core unificado...');
                window.addEventListener('ytcrossmix:unified:ready', () => {
                    console.log('🎉 Core unificado listo, inicializando UI...');
                    UIManager.setupUI();
                });
                
                // Timeout fallback
                setTimeout(() => {
                    if (!window.unifiedCore?.initialized) {
                        console.warn('⚠️ Timeout esperando core, inicializando UI de todas formas...');
                        UIManager.setupUIFallback();
                    }
                }, 10000);
            }
            
        } catch (error) {
            console.error('💥 Error inicializando UIManager:', error);
            UIManager.handleError(error, 'initialize');
        }
    }

    static setupUI() {
        console.log('🔧 Configurando UI con core unificado...');
        
        // Setup navigation
        UIManager.setupNavigation();
        
        // Setup search inputs (delegar búsqueda al core)
        UIManager.setupSearchInputs();
        
        // Setup player controls (delegar lógica al core)
        UIManager.setupPlayerControls();
        
        // Setup playlist URL
        UIManager.setupPlaylistURL();
        
        // Setup view switching
        UIManager.setupViewSwitching();
        
        // Event listeners específicos de playlist
        UIManager.setupPlaylistEventListeners();
        
        // Enable interactivity
        UIManager.enableInteractivity();
        
        // Vista inicial
        const currentView = window.unifiedStateManager?.state?.ui?.currentView || 'home';
        UIManager.switchView(currentView);
        
        // Trigger initial UI update
        setTimeout(() => {
            UIManager.updatePlaylistsUI();
        }, 500);
        
        console.log('✅ UIManager configurado exitosamente');
    }

    static setupUIFallback() {
        console.log('🔧 Configurando UI en modo fallback...');
        
        // Configuración básica sin dependencia del core
        UIManager.setupNavigation();
        UIManager.setupPlayerControlsFallback();
        UIManager.enableInteractivity();
        
        console.log('⚠️ UI configurado en modo fallback');
    }

    // ✅ ACTUALIZACIÓN DE UI - PRINCIPAL (mantener lógica completa)
    static updatePlaylistsUI() {
        console.log('🔄 UIManager: Actualizando UI...');
        
        try {
            const state = window.unifiedStateManager?.state;
            if (!state) {
                console.warn('⚠️ Estado unificado no disponible');
                return;
            }
            
            const currentView = state.ui.currentView || UIManager.getCurrentView() || 'home';
            
            // ✅ FIX: NO actualizar búsqueda cuando se añaden videos
            if (currentView === 'search') {
                console.log('🔍 Vista de búsqueda activa - NO reemplazar resultados');
                return;
            }
            
            let playlistContainer = UIManager.getPlaylistContainer(currentView);
            
            if (!playlistContainer) {
                console.warn('⚠️ No se encontró contenedor para vista:', currentView);
                return;
            }
            
            const currentScrollTop = playlistContainer.scrollTop;
            
            // ✅ RENDERIZADO ESPECÍFICO POR VISTA
            if (!state.playlist.playlistsData || state.playlist.playlistsData.length === 0) {
                UIManager.renderEmptyState(playlistContainer, currentView);
            } else {
                console.log(`📊 Renderizando ${state.playlist.playlistsData.length} playlists en vista: ${currentView}`);
                
                if (currentView === 'library') {
                    UIManager.renderLibraryGrid(playlistContainer, state.playlist.playlistsData);
                } else if (currentView === 'playing') {
                    UIManager.renderNowPlayingInfo();
                } else {
                    UIManager.renderPlaylistList(playlistContainer, state.playlist.playlistsData);
                }
            }
            
            if (currentScrollTop > 0) {
                playlistContainer.scrollTop = currentScrollTop;
            }
            
            UIManager.enableInteractivity();
            console.log('✅ UI actualizada con sistema unificado');
            
        } catch (error) {
            console.error('💥 Error actualizando UI:', error);
            UIManager.handleError(error, 'updatePlaylistsUI');
        }
    }

    // ✅ RENDERIZADO DE BIBLIOTECA COMO CUADRÍCULA
    static renderLibraryGrid(container, playlistsData) {
        console.log('📚 Renderizando biblioteca como cuadrícula...', playlistsData.length);
        
        container.innerHTML = '';
        container.className = 'library-container';
        
        const grid = document.createElement('div');
        grid.className = 'library-grid';
        
        // Filtrar playlists (excluir manual de la biblioteca)
        const libraryPlaylists = playlistsData.filter(playlist => playlist.id !== 'manual');
        
        if (libraryPlaylists.length === 0) {
            UIManager.renderEmptyState(container, 'library');
            return;
        }
        
        libraryPlaylists.forEach((playlist, index) => {
            const card = UIManager.createExpandablePlaylistCard(playlist, index);
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
        console.log(`✅ ${libraryPlaylists.length} playlists renderizadas en cuadrícula`);
    }

    static createExpandablePlaylistCard(playlist, index) {
        const card = document.createElement('div');
        card.className = 'playlist-card-expandable';
        card.dataset.playlistId = playlist.id;
        
        if (playlist.isExpanded) {
            card.classList.add('expanded');
        }
        
        const videoCount = playlist.videos ? playlist.videos.length : 
                          (playlist.itemCount || playlist.videoCount || 0);
        
        let thumbnailUrl = playlist.thumbnailUrl || playlist.thumbnail;
        if (!thumbnailUrl && playlist.videos && playlist.videos[0]) {
            thumbnailUrl = playlist.videos[0].thumbnail;
        }
        thumbnailUrl = thumbnailUrl || 'https://via.placeholder.com/320x180/333333/ffffff?text=Playlist';
        
        const isYouTubeLibrary = playlist.source === 'youtube_library';
        const isLoaded = playlist.isLoaded || playlist.videos?.length > 0;
        
        card.innerHTML = `
            <div class="playlist-card-header" data-playlist-id="${playlist.id}">
                <div class="playlist-card-image">
                    <img src="${thumbnailUrl}" alt="${playlist.name}" loading="lazy" 
                         onerror="this.src='https://via.placeholder.com/320x180/333333/ffffff?text=Error'">
                    <div class="playlist-card-overlay">
                        <button class="playlist-expand-btn">
                            <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                        </button>
                    </div>
                </div>
                <div class="playlist-card-info">
                    <h3 class="playlist-card-title">${UIManager.escapeHtml(playlist.name)}</h3>
                    <p class="playlist-card-meta">
                        ${videoCount} videos
                        ${isYouTubeLibrary && !isLoaded ? ' • Click para cargar' : ''}
                    </p>
                    <div class="playlist-card-actions">
                        <button class="playlist-action-btn primary" data-action="add-all" data-playlist-id="${playlist.id}">
                            <i class="fas fa-plus"></i>
                            Añadir Todo
                        </button>
                        <button class="playlist-action-btn secondary" data-action="play-all" data-playlist-id="${playlist.id}">
                            <i class="fas fa-play"></i>
                            Reproducir
                        </button>
                    </div>
                </div>
            </div>
            <div class="playlist-videos-container">
                <div class="playlist-videos-content">
                    ${!isLoaded && isYouTubeLibrary ? 
                        '<div class="playlist-videos-placeholder">Click en la playlist para cargar videos...</div>' :
                        '<div class="playlist-videos-loading">Preparando videos...</div>'
                    }
                </div>
            </div>
        `;
        
        // Si está expandida y tiene videos, renderizarlos
        if (playlist.isExpanded && playlist.videos && playlist.videos.length > 0) {
            const videosContainer = card.querySelector('.playlist-videos-container');
            UIManager.renderPlaylistVideos(videosContainer, playlist.videos, playlist.id);
        }
        
        // Animación escalonada
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'all 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
        
        return card;
    }

    static renderPlaylistVideos(container, videos, playlistId) {
        console.log('🎵 Renderizando videos de playlist:', videos?.length || 0);
        
        const contentDiv = container.querySelector('.playlist-videos-content') || container;
        
        if (!videos || videos.length === 0) {
            contentDiv.innerHTML = `
                <div class="playlist-videos-empty">
                    <i class="fas fa-music"></i>
                    <p>No hay videos en esta playlist</p>
                </div>
            `;
            return;
        }
        
        contentDiv.innerHTML = '';
        
        videos.forEach((video, index) => {
            const videoItem = UIManager.createPlaylistVideoItem(video, index + 1, playlistId);
            contentDiv.appendChild(videoItem);
        });
        
        console.log(`✅ ${videos.length} videos renderizados`);
    }

    static createPlaylistVideoItem(video, index, playlistId) {
        const item = document.createElement('div');
        item.className = 'playlist-video-item';
        item.dataset.videoId = video.videoId;
        item.dataset.playlistId = playlistId;
        
        let thumbnailUrl = video.thumbnail;
        if (!thumbnailUrl) {
            thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        }
        
        const duration = UIManager.formatDuration(video.duration);
        const channelTitle = video.channelTitle || 'YouTube';
        
        item.innerHTML = `
            <div class="video-index">${index}</div>
            <img src="${thumbnailUrl}" class="video-thumbnail" alt="${video.title}"
                 onerror="this.src='https://via.placeholder.com/60x45/333333/ffffff?text=V'">
            <div class="video-info">
                <div class="video-title">${UIManager.escapeHtml(video.title)}</div>
                <div class="video-meta">
                    <span class="video-channel">${UIManager.escapeHtml(channelTitle)}</span>
                    ${duration ? `<span class="video-duration">${duration}</span>` : ''}
                </div>
            </div>
            <div class="video-actions">
                <button class="video-action-btn primary" data-action="add-video" 
                        data-video-id="${video.videoId}" title="Añadir a cola">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="video-action-btn" data-action="play-now" 
                        data-video-id="${video.videoId}" title="Reproducir ahora">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        `;
        
        return item;
    }

    // ✅ GESTIÓN DE COLA DE REPRODUCCIÓN
    static toggleQueue() {
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) {
            console.warn('⚠️ queueSection no encontrado');
            return;
        }
        
        if (queueSection.classList.contains('hidden')) {
            UIManager.showQueue();
        } else {
            UIManager.hideQueue();
        }
    }

    static showQueue() {
        console.log('📋 Mostrando cola de reproducción');
        
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) return;
        
        // Actualizar contenido ANTES de mostrar
        UIManager.updateQueueContent();
        
        // Configurar como overlay global
        queueSection.style.position = 'fixed';
        queueSection.style.top = '0';
        queueSection.style.left = '0';
        queueSection.style.right = '0';
        queueSection.style.bottom = '0';
        queueSection.style.zIndex = '1000';
        queueSection.style.background = 'rgba(0, 0, 0, 0.8)';
        queueSection.style.backdropFilter = 'blur(10px)';
        
        queueSection.classList.remove('hidden');
        
        // Enfocar para accesibilidad
        const closeBtn = queueSection.querySelector('.queue-close-btn');
        if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 100);
        }
        
        console.log('✅ Cola mostrada');
    }
    static hideQueue() {
        console.log('📋 Ocultando cola de reproducción');
        
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) return;
        
        queueSection.classList.add('hidden');
    }

    static updateQueueContent() {
        const playlistContainer = document.getElementById('playlistContainer');
        if (!playlistContainer) {
            console.warn('⚠️ playlistContainer no encontrado para cola');
            return;
        }
        
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        // Buscar playlist manual (cola de reproducción)
        const manualPlaylist = state.playlist.playlistsData.find(p => p.id === 'manual');
        
        if (!manualPlaylist || !manualPlaylist.videos || manualPlaylist.videos.length === 0) {
            // Cola vacía
            playlistContainer.innerHTML = `
                <div class="empty-queue-message">
                    <i class="fas fa-music"></i>
                    <p>La cola está vacía</p>
                    <p>Añade música desde la biblioteca o búsqueda</p>
                </div>
            `;
        } else {
            // Renderizar videos de la cola
            playlistContainer.innerHTML = '';
            
            manualPlaylist.videos.forEach((video, index) => {
                const videoItem = UIManager.createQueueVideoItem(video, index);
                playlistContainer.appendChild(videoItem);
            });
            
            console.log(`📋 Cola actualizada: ${manualPlaylist.videos.length} videos`);
        }
    }

    static createQueueVideoItem(video, index) {
        const item = document.createElement('div');
        item.className = 'playlist-video-item queue-video-item';
        item.dataset.videoId = video.videoId;
        
        // Verificar si es el video actualmente reproduciéndose
        const state = window.unifiedStateManager?.state;
        const isCurrentlyPlaying = state?.playlist?.currentPlayingInfo?.videoId === video.videoId;
        
        if (isCurrentlyPlaying) {
            item.classList.add('currently-playing');
        }
        
        let thumbnailUrl = video.thumbnail;
        if (!thumbnailUrl) {
            thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        }
        
        const duration = UIManager.formatDuration(video.duration);
        
        item.innerHTML = `
            <div class="video-index">${index + 1}</div>
            <img src="${thumbnailUrl}" class="video-thumbnail" alt="${video.title}"
                 onerror="this.src='https://via.placeholder.com/60x45/333333/ffffff?text=V'">
            <div class="video-info">
                <div class="video-title">
                    ${UIManager.escapeHtml(video.title)}
                    ${isCurrentlyPlaying ? '<i class="fas fa-volume-up playing-indicator"></i>' : ''}
                </div>
                <div class="video-meta">
                    <span class="video-channel">${UIManager.escapeHtml(video.channelTitle || 'YouTube')}</span>
                    ${duration ? `<span class="video-duration">${duration}</span>` : ''}
                </div>
            </div>
            <div class="video-actions">
                <button class="video-action-btn" data-action="remove-from-queue" 
                        data-video-id="${video.videoId}" title="Eliminar de la cola">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        return item;
    }
    static handleRemoveFromQueue(videoId) {
        console.log('🗑️ Eliminando de la cola:', videoId);
        
        if (window.PlaylistManager?.deleteVideo) {
            const success = window.PlaylistManager.deleteVideo('manual', videoId);
            if (success) {
                // Actualizar vista de la cola si está abierta
                const queueSection = document.getElementById('queueSection');
                if (queueSection && !queueSection.classList.contains('hidden')) {
                    UIManager.updateQueueContent();
                }
                window.unifiedMessageManager?.show('Video eliminado de la cola', 'success', 2000);
            }
        }
    }

    // ✅ MÉTODOS DE RENDERIZADO EXISTENTES (compatibilidad)
    static renderPlaylistList(container, playlistsData) {
        console.log('📝 Renderizando lista tradicional...', playlistsData.length);
        
        container.innerHTML = '';
        
        playlistsData.forEach((playlist) => {
            if (playlist.id === 'manual') return; // No mostrar cola manual en otras vistas
            
            const groupDiv = UIManager.createPlaylistGroup(playlist);
            container.appendChild(groupDiv);
        });
        
        console.log(`✅ ${playlistsData.length} grupos renderizados`);
    }

    static createPlaylistGroup(playlist) {
        const groupDiv = document.createElement('div');
        groupDiv.className = `playlist-group-mobile ${playlist.isExpanded ? 'expanded' : ''}`;
        groupDiv.dataset.playlistId = playlist.id;
        
        const videoCount = playlist.videos ? playlist.videos.length : 
                          (playlist.itemCount || playlist.videoCount || 0);
        
        let thumbnailUrl = playlist.thumbnailUrl || playlist.thumbnail;
        if (!thumbnailUrl && playlist.videos && playlist.videos[0]) {
            thumbnailUrl = playlist.videos[0].thumbnail;
        }
        thumbnailUrl = thumbnailUrl || 'https://via.placeholder.com/48x48/333333/ffffff?text=P';
        
        groupDiv.innerHTML = `
            <div class="playlist-group-header-mobile">
                <img src="${thumbnailUrl}" class="playlist-group-thumb-mobile" alt="${playlist.name}" 
                     onerror="this.src='https://via.placeholder.com/48x48/333333/ffffff?text=P'">
                <div class="playlist-info-mobile">
                    <span class="playlist-name-mobile">${UIManager.escapeHtml(playlist.name)}</span>
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
        const duration = UIManager.formatDuration(video.duration);
        let thumbnailUrl = video.thumbnail;
        if (!thumbnailUrl) {
            thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        }
        
        return `
            <div class="playlist-item-mobile" data-video-id="${video.videoId}">
                <img src="${thumbnailUrl}" class="playlist-item-thumb-mobile" alt="${video.title}"
                     onerror="this.src='https://via.placeholder.com/48x36/333333/ffffff?text=V'">
                <div class="playlist-item-info-mobile">
                    <div class="playlist-item-title-mobile">${UIManager.escapeHtml(video.title)}</div>
                    <div class="playlist-item-duration-mobile">${duration}</div>
                </div>
                <button class="playlist-item-menu-mobile" data-video-id="${video.videoId}">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        `;
    }

    // ✅ MÉTODOS DE SETUP Y CONFIGURACIÓN
    static enableInteractivity() {
        // Remover listeners existentes para evitar duplicados
        document.removeEventListener('click', UIManager.handleDocumentClick);
        
        // Agregar listener único
        document.addEventListener('click', UIManager.handleDocumentClick);
        
        console.log('✅ Interactividad habilitada (unificado)');
    }

    static setupNavigation() {
        console.log('🧭 Configurando navegación...');
        
        // Setup sidebar navigation - usar event delegation
        const sidebar = document.querySelector('.sidebar-nav');
        if (sidebar) {
            sidebar.addEventListener('click', (e) => {
                const navItem = e.target.closest('[data-view]');
                if (navItem) {
                    e.preventDefault();
                    const view = navItem.dataset.view;
                    console.log('🔄 Navegación sidebar:', view);
                    UIManager.switchView(view);
                }
            });
        }
        
        // Setup bottom navigation - usar event delegation  
        const bottomNav = document.querySelector('.bottom-nav');
        if (bottomNav) {
            bottomNav.addEventListener('click', (e) => {
                const navItem = e.target.closest('[data-view]');
                if (navItem) {
                    e.preventDefault();
                    const view = navItem.dataset.view;
                    console.log('🔄 Navegación bottom:', view);
                    UIManager.switchView(view);
                }
            });
        }
        
        console.log('✅ Navegación configurada');
    }

    static setupSearchInputs() {
        console.log('🔍 Configurando búsqueda...');
        
        const searchInputIds = [
            'sidebarSearchInput',
            'mobileSearchInput',
            'searchInput2',
            'searchInput'
        ];
        
        let setupCount = 0;
        
        searchInputIds.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                // Remover listeners existentes
                const newInput = input.cloneNode(true);
                input.parentNode.replaceChild(newInput, input);
                
                // Agregar nuevo listener
                newInput.addEventListener('input', UIManager.debounce((e) => {
                    const query = e.target.value.trim();
                    console.log(`🔍 Input de búsqueda (${inputId}):`, query);
                    
                    if (query.length > 2) {
                        UIManager.handleSearch(query);
                    }
                }, 300));
                
                // Enter key
                newInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const query = e.target.value.trim();
                        if (query.length > 0) {
                            UIManager.handleSearch(query);
                        }
                    }
                });
                
                setupCount++;
                console.log(`✅ Input de búsqueda configurado: ${inputId}`);
            }
        });
        
        // Setup playlist URL input
        const urlButton = document.getElementById('añadirUrlButton');
        const urlInput = document.getElementById('searchInput2');
        
        if (urlButton && urlInput) {
            // Remover listener existente
            const newButton = urlButton.cloneNode(true);
            urlButton.parentNode.replaceChild(newButton, urlButton);
            
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                UIManager.handlePlaylistUrlAdd();
            });
            
            urlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    UIManager.handlePlaylistUrlAdd();
                }
            });
            
            console.log('✅ Botón de URL configurado');
        }
        
        console.log(`✅ ${setupCount} entradas de búsqueda configuradas`);
    }

    static setupPlayerControls() {
        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.addEventListener('click', () => {
                console.log('▶️ Click en botón play');
                UIManager.handlePlayButtonClick();
            });
        }
        
        const nextButton = document.getElementById('botonNext');
        if (nextButton) {
            nextButton.addEventListener('click', () => {
                console.log('⏭️ Click en botón next');
                UIManager.handleNextButtonClick();
            });
        }
        
        const miniPlayBtn = document.getElementById('miniPlayBtn');
        if (miniPlayBtn) {
            miniPlayBtn.addEventListener('click', () => {
                UIManager.handlePlayButtonClick();
            });
        }
        
        const miniNextBtn = document.getElementById('miniNextBtn');
        if (miniNextBtn) {
            miniNextBtn.addEventListener('click', () => {
                UIManager.handleNextButtonClick();
            });
        }
        
        console.log('✅ Controles de reproducción configurados');
    }

    static setupViewSwitching() {
        console.log('🔄 Configurando cambio de vistas...');
        
        document.addEventListener('search-started', () => {
            console.log('🔍 Evento search-started recibido');
            UIManager.switchView('search');
        });
        
        document.addEventListener('playback-started', () => {
            console.log('▶️ Evento playback-started recibido');
            if (window.innerWidth <= 768) {
                UIManager.showMiniPlayer();
            }
        });
        
        console.log('✅ Cambio de vistas configurado');
    }

    // ✅ GESTIÓN DE VISTAS
    static switchView(viewName) {
        console.log('🔄 Cambiando a vista:', viewName);
        
        // Actualizar estado unificado
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('ui.currentView', viewName);
        }
        
        // Ocultar todas las vistas
        const views = document.querySelectorAll('.content-view');
        views.forEach(view => {
            view.classList.remove('active');
        });
        
        // Mostrar vista target
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
            console.log(`✅ Vista ${viewName} activada`);
        } else {
            console.warn(`⚠️ Vista ${viewName}View no encontrada`);
        }
        
        // Actualizar navegación
        UIManager.updateNavigation(viewName);
        
        // Actualizar UI específica de la vista
        setTimeout(() => {
            UIManager.updatePlaylistsUI();
        }, 100);
        
        console.log(`✅ Vista cambiada a: ${viewName}`);
    }

    static updateNavigation(activeView) {
        // Actualizar sidebar navigation
        const sidebarItems = document.querySelectorAll('.sidebar-nav [data-view]');
        sidebarItems.forEach(item => {
            if (item.dataset.view === activeView) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Actualizar bottom navigation
        const bottomItems = document.querySelectorAll('.bottom-nav [data-view]');
        bottomItems.forEach(item => {
            if (item.dataset.view === activeView) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // ✅ MANEJO DE BÚSQUEDA
    static handleSearch(query) {
        console.log('🔍 Iniciando búsqueda:', query);
        
        // Switch to search view si no está activa
        const currentView = window.unifiedStateManager?.state?.ui?.currentView;
        if (currentView !== 'search') {
            UIManager.switchView('search');
        }
        
        // Trigger search
        if (window.SearchManager?.performSearch) {
            console.log('📡 Ejecutando búsqueda con SearchManager...');
            window.SearchManager.performSearch(query);
        } else {
            console.warn('⚠️ SearchManager no disponible');
            window.unifiedMessageManager?.show('Sistema de búsqueda no disponible', 'error');
        }
        
        // Dispatch event
        document.dispatchEvent(new CustomEvent('search-started', {
            detail: { query }
        }));
    }

    static handlePlayButtonClick() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        if (state.app.reproduccionIniciada) {
            const currentPlayer = state.app.currentPlayer === 1 ? state.app.player1 : state.app.player2;
            if (currentPlayer) {
                const playerState = currentPlayer.getPlayerState();
                if (playerState === YT.PlayerState.PLAYING) {
                    currentPlayer.pauseVideo();
                } else {
                    currentPlayer.playVideo();
                }
            }
        } else {
            if (window.PlaybackController?.playFirstVideo) {
                window.PlaybackController.playFirstVideo();
            }
        }
    }

    static handleNextButtonClick() {
        if (window.PlaybackController?.playNextVideo) {
            window.PlaybackController.playNextVideo();
        }
    }

    // ✅ GESTIÓN DE PLAYLIST URL
    static handlePlaylistUrlAdd() {
        const input = document.getElementById('searchInput2');
        if (!input) return;
        
        const url = input.value.trim();
        if (!url) {
            window.unifiedMessageManager?.show('Ingresa una URL válida', 'warning');
            return;
        }
        
        console.log('🔗 Añadir playlist por URL:', url);
        
        // Validar URL de YouTube
        const isYouTubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
        if (!isYouTubeUrl) {
            window.unifiedMessageManager?.show('URL de YouTube no válida', 'error');
            return;
        }
        
        // Extraer playlist ID
        const playlistMatch = url.match(/[&?]list=([^&]+)/);
        if (!playlistMatch) {
            window.unifiedMessageManager?.show('URL no contiene una playlist válida', 'error');
            return;
        }
        
        const playlistId = playlistMatch[1];
        console.log('📋 ID de playlist extraído:', playlistId);
        
        // Limpiar input
        input.value = '';
        
        // Cargar playlist usando el sistema unificado
        if (window.ytCrossMixUnified?.moduleLoader) {
            console.log('📡 Cargando playlist via sistema unificado...');
            window.unifiedLoadingManager?.show('playlist-load', {
                type: 'overlay',
                message: 'Cargando playlist...'
            });
            
            window.ytCrossMixUnified.moduleLoader.loadPlaylistFromUrl(playlistId)
                .then(() => {
                    console.log('✅ Playlist cargada exitosamente');
                    UIManager.switchView('library');
                })
                .catch((error) => {
                    console.error('❌ Error cargando playlist:', error);
                    window.unifiedMessageManager?.show('Error cargando playlist', 'error');
                })
                .finally(() => {
                    window.unifiedLoadingManager?.hide('playlist-load');
                });
        } else {
            window.unifiedMessageManager?.show('Sistema de carga no disponible', 'error');
        }
    }

    // ✅ INICIALIZACIÓN PRINCIPAL
    static async initialize() {
        console.log('🎨 Inicializando UIManager con sistema unificado...');
        
        try {
            // Esperar un poco para asegurar que el DOM esté listo
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Setup navigation
            UIManager.setupNavigation();
            
            // Setup player controls
            UIManager.setupPlayerControls();
            
            // Setup search inputs
            UIManager.setupSearchInputs();
            
            // Setup view switching
            UIManager.setupViewSwitching();
            
            // ✅ CRÍTICO: Agregar listeners específicos para playlists
            document.addEventListener('playlists-loaded', (event) => {
                console.log('🎉 Playlists cargadas, actualizando UI:', event.detail.count);
                setTimeout(() => {
                    UIManager.updatePlaylistsUI();
                    // Cambiar a vista biblioteca si es la primera carga
                    if (event.detail.count > 0 && UIManager.getCurrentView() === 'home') {
                        UIManager.switchView('library');
                    }
                }, 500);
            });
            
            // Listener para auth events
            document.addEventListener('playlistsFetched', (event) => {
                console.log('📚 Playlists recibidas desde auth:', event.detail?.length || 0);
                setTimeout(() => {
                    UIManager.updatePlaylistsUI();
                }, 500);
            });
            
            document.addEventListener('userLoggedOut', () => {
                console.log('👤 Usuario deslogueado, actualizando UI...');
                UIManager.updatePlaylistsUI();
            });
            
            // Enable interactivity
            UIManager.enableInteractivity();
            
            // Configurar vista inicial
            const currentView = window.unifiedStateManager?.state?.ui?.currentView || 'home';
            UIManager.switchView(currentView);
            
            console.log('✅ UIManager inicializado exitosamente');
            
            // Trigger initial UI update
            setTimeout(() => {
                UIManager.updatePlaylistsUI();
            }, 500);
            
        } catch (error) {
            console.error('💥 Error inicializando UIManager:', error);
            window.unifiedMessageManager?.show('Error inicializando interfaz', 'error');
        }
    }

    // ✅ MOBILE METHODS
    static showMiniPlayer() {
        const miniPlayer = document.querySelector('.mini-player');
        if (miniPlayer && window.innerWidth <= 768) {
            miniPlayer.style.display = 'flex';
            document.body.classList.add('has-playback');
        }
    }

    static hideMiniPlayer() {
        const miniPlayer = document.querySelector('.mini-player');
        if (miniPlayer) {
            miniPlayer.style.display = 'none';
            document.body.classList.remove('has-playback');
        }
    }

    static updateMiniPlayer(trackInfo) {
        const miniPlayer = document.querySelector('.mini-player');
        if (!miniPlayer) return;
        
        const titleEl = miniPlayer.querySelector('.mini-track-title');
        const artistEl = miniPlayer.querySelector('.mini-track-artist');
        const imageEl = miniPlayer.querySelector('.mini-track-image');
        
        if (titleEl) titleEl.textContent = trackInfo.title || 'Selecciona una canción';
        if (artistEl) artistEl.textContent = trackInfo.artist || 'YT CrossMix';
        if (imageEl && trackInfo.thumbnail) imageEl.src = trackInfo.thumbnail;
        
        UIManager.showMiniPlayer();
    }

    // ✅ UTILIDADES
    static formatDuration(duration) {
        if (!duration || isNaN(duration)) {
            return "0:00";
        }
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    static escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    static getCurrentView() {
        const activeView = document.querySelector('.content-view.active');
        if (activeView) {
            return activeView.id.replace('View', '');
        }
        return 'home';
    }

    // ✅ ERROR HANDLING
    static handleError(error, context = 'UIManager') {
        console.error(`💥 Error en ${context}:`, error);
        
        if (window.unifiedMessageManager) {
            window.unifiedMessageManager.show(`Error en ${context}`, 'error');
        }
        
        // Reportar error si hay sistema de telemetría
        if (window.errorBoundary?.logError) {
            window.errorBoundary.logError({
                type: 'ui_error',
                context,
                message: error.message,
                stack: error.stack,
                timestamp: Date.now()
            });
        }
    }
}

// ✅ FUNCIÓN DE MENSAJES COMPATIBLE
export function mostrarMensajeFlotante(mensaje, duracion = 3000, tipo = 'info') {
    if (window.unifiedMessageManager) {
        return window.unifiedMessageManager.show(mensaje, tipo, duracion);
    } else {
        console.warn('⚠️ Sistema de mensajes unificado no disponible, usando fallback');
        console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
    }
}

// ✅ AUTO-INICIALIZACIÓN Y EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM listo, configurando UIManager...');
    
    // Esperar a que el sistema unificado esté listo
    if (window.ytCrossMixUnified?.initialized) {
        console.log('✅ Sistema unificado ya disponible');
        UIManager.initialize();
    } else {
        console.log('⏳ Esperando sistema unificado...');
        window.addEventListener('ytcrossmix:unified:ready', () => {
            console.log('🎉 Sistema unificado listo, inicializando UI...');
            UIManager.initialize();
        });
        
        // Timeout fallback
        setTimeout(() => {
            if (!window.ytCrossMixUnified?.initialized) {
                console.warn('⚠️ Timeout esperando sistema unificado, inicializando UI de todas formas...');
                UIManager.initialize();
            }
        }, 5000);
    }
});

// ✅ REFERENCIAS GLOBALES Y DEBUG
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
    window.mostrarMensajeFlotante = mostrarMensajeFlotante;
    
    // Debug helpers
    window.UIDebug = {
        updateUI: () => UIManager.updatePlaylistsUI(),
        switchView: (view) => UIManager.switchView(view),
        getState: () => window.unifiedStateManager?.state,
        getPlaylists: () => window.unifiedStateManager?.state?.playlist?.playlistsData,
        testSearch: (query) => UIManager.handleSearch(query),
        showQueue: () => UIManager.showQueue(),
        hideQueue: () => UIManager.hideQueue(),
        checkContainers: () => {
            console.log('📋 Contenedores disponibles:');
            console.log('- playlistsGrid:', !!document.getElementById('playlistsGrid'));
            console.log('- playlistContainer:', !!document.getElementById('playlistContainer'));
            console.log('- searchResults:', !!document.getElementById('searchResults'));
            console.log('- queueSection:', !!document.getElementById('queueSection'));
        }
    };
    
    console.log('🔧 UIDebug disponible en window.UIDebug');
}

console.log('✅ UIManager cargado - VERSIÓN BIBLIOTECA CUADRÍCULA + COLA MODAL');
