// ===== UI.JS CORREGIDO - PROBLEMAS SOLUCIONADOS =====
// Versión corregida que soluciona los problemas identificados

export class UIManager {
    
    static updatePlaylistsUI() {
        console.log('🔄 UIManager: Actualizando UI con estado unificado...');
        
        try {
            const state = window.unifiedStateManager?.state;
            if (!state) {
                console.warn('⚠️ Estado unificado no disponible');
                return;
            }
            
            const currentView = state.ui.currentView || UIManager.getCurrentView() || 'home';
            
            // ✅ FIX: Mejorar detección de contenedores
            let playlistContainer = UIManager.getPlaylistContainer(currentView);
            
            if (!playlistContainer) {
                console.warn('⚠️ No se encontró contenedor para vista:', currentView);
                return;
            }
            
            const currentScrollTop = playlistContainer.scrollTop;
            const playingVideoId = state.playlist.currentPlayingInfo?.videoId || null;
            
            // ✅ FIX: Verificar playlists correctamente
            if (!state.playlist.playlistsData || state.playlist.playlistsData.length === 0) {
                UIManager.renderEmptyState(playlistContainer, currentView);
            } else {
                console.log(`📊 Renderizando ${state.playlist.playlistsData.length} playlists en vista: ${currentView}`);
                
                if (currentView === 'library') {
                    UIManager.renderPlaylistCards(playlistContainer, state.playlist.playlistsData);
                } else {
                    UIManager.renderPlaylistList(playlistContainer, state.playlist.playlistsData, playingVideoId);
                }
            }
            
            if (currentScrollTop > 0) {
                playlistContainer.scrollTop = currentScrollTop;
            }
            
            UIManager.enableInteractivity();
            console.log('✅ UI actualizada con estado unificado');
            
        } catch (error) {
            console.error('💥 Error actualizando UI:', error);
            window.unifiedMessageManager?.show('Error actualizando interfaz', 'error');
        }
    }

    static renderPlaylistCards(container, playlistsData) {
        console.log('📱 Renderizando cards con estado unificado...', playlistsData.length);
        
        // ✅ FIX: Limpiar correctamente el contenedor
        container.innerHTML = '';
        
        const grid = document.createElement('div');
        grid.className = 'playlists-grid-mobile';
        
        playlistsData.forEach((playlist, index) => {
            const card = UIManager.createPlaylistCard(playlist, index);
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
        console.log(`✅ ${playlistsData.length} cards renderizados`);
    }

    static renderPlaylistList(container, playlistsData, playingVideoId) {
        console.log('📝 Renderizando lista con estado unificado...', playlistsData.length);
        
        container.innerHTML = '';
        
        playlistsData.forEach((playlist) => {
            const groupDiv = UIManager.createPlaylistGroup(playlist, playingVideoId);
            container.appendChild(groupDiv);
        });
        
        console.log(`✅ ${playlistsData.length} grupos renderizados`);
    }

    // ✅ FIX: Mejorar detección de contenedores
    static getPlaylistContainer(currentView) {
        const containers = {
            'playing': document.getElementById('playlistContainer'),
            'library': document.getElementById('playlistsGrid'),
            'home': document.getElementById('overviewGrid'),
            'search': document.getElementById('searchResults')
        };
        
        const container = containers[currentView];
        console.log(`🔍 Contenedor para vista '${currentView}':`, container ? 'encontrado' : 'no encontrado');
        
        // Fallback más inteligente
        if (!container) {
            const fallbacks = [
                document.getElementById('playlistsGrid'),
                document.getElementById('playlistContainer'),
                document.querySelector('.content-view.active'),
                document.querySelector('.playlists-grid'),
                document.querySelector('.content-area')
            ];
            
            for (const fallback of fallbacks) {
                if (fallback) {
                    console.log(`🔄 Usando fallback para contenedor:`, fallback.id || fallback.className);
                    return fallback;
                }
            }
        }
        
        return container;
    }

    static renderEmptyState(container, currentView) {
        console.log('📋 Renderizando estado vacío para vista:', currentView);
        
        const emptyStates = {
            'library': `
                <div class="search-placeholder">
                    <i class="fas fa-music"></i>
                    <p><strong>¡Conecta tu cuenta de Google!</strong></p>
                    <p>Ve tus playlists de YouTube y crea mezclas increíbles</p>
                    <p><small>Powered by Sistema Unificado</small></p>
                </div>
            `,
            'playing': `
                <div class="search-placeholder">
                    <i class="fas fa-music"></i>
                    <p>No hay videos en la cola de reproducción</p>
                    <p>Añade música desde la búsqueda o biblioteca</p>
                </div>
            `,
            'search': `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                    <p>Escribe en la barra de búsqueda para empezar</p>
                </div>
            `,
            'default': `
                <div class="search-placeholder">
                    <i class="fas fa-folder-open"></i>
                    <p>No hay contenido disponible</p>
                    <p>Conecta tu cuenta o añade playlists manualmente</p>
                </div>
            `
        };
        
        container.innerHTML = emptyStates[currentView] || emptyStates.default;
    }

    static createPlaylistCard(playlist, index) {
        const card = document.createElement('div');
        card.className = 'playlist-card-mobile';
        card.dataset.playlistId = playlist.id;
        
        // ✅ FIX: Manejar datos de YouTube Library
        const videoCount = playlist.videos ? playlist.videos.length : 
                          (playlist.itemCount || playlist.videoCount || 0);
        
        // ✅ FIX: Mejorar manejo de thumbnails
        let thumbnailUrl = playlist.thumbnailUrl || playlist.thumbnail;
        if (!thumbnailUrl && playlist.videos && playlist.videos[0]) {
            thumbnailUrl = playlist.videos[0].thumbnail;
        }
        thumbnailUrl = thumbnailUrl || 'https://via.placeholder.com/160x90/333333/ffffff?text=Playlist';
        
        card.innerHTML = `
            <div class="playlist-card-image">
                <img src="${thumbnailUrl}" alt="${playlist.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/160x90/333333/ffffff?text=Error'">
                <div class="playlist-card-overlay">
                    <button class="playlist-play-btn" data-playlist-id="${playlist.id}">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="playlist-card-info">
                <h3 class="playlist-card-title">${UIManager.escapeHtml(playlist.name)}</h3>
                <p class="playlist-card-meta">${videoCount} videos</p>
                <div class="playlist-card-actions">
                    <button class="playlist-add-all-btn" data-playlist-id="${playlist.id}">
                        <i class="fas fa-plus"></i>
                        ${playlist.source === 'youtube_library' ? 'Cargar' : 'Añadir Todo'}
                    </button>
                </div>
            </div>
        `;
        
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

    static createPlaylistGroup(playlist, playingVideoId) {
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
        
        // Header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'playlist-group-header-mobile';
        headerDiv.innerHTML = `
            <img src="${thumbnailUrl}" class="playlist-group-thumb-mobile" alt="${playlist.name}" 
                 onerror="this.src='https://via.placeholder.com/48x48/333333/ffffff?text=P'">
            <div class="playlist-info-mobile">
                <span class="playlist-name-mobile">${UIManager.escapeHtml(playlist.name)}</span>
                <span class="playlist-count-mobile">${videoCount} videos</span>
            </div>
            <i class="fas fa-chevron-down expand-icon-mobile"></i>
        `;
        
        // Videos container
        const videosDiv = document.createElement('div');
        videosDiv.className = 'playlist-group-videos-mobile';
        
        if (playlist.isExpanded && playlist.videos && playlist.videos.length > 0) {
            playlist.videos.forEach((video, index) => {
                const videoItem = UIManager.createVideoItem(video, index, playingVideoId === video.videoId);
                videosDiv.appendChild(videoItem);
            });
        }
        
        groupDiv.appendChild(headerDiv);
        groupDiv.appendChild(videosDiv);
        
        return groupDiv;
    }

    static createVideoItem(video, index, isPlaying) {
        const itemDiv = document.createElement('div');
        itemDiv.className = `playlist-item-mobile ${isPlaying ? 'playing' : ''}`;
        itemDiv.dataset.videoId = video.videoId;
        
        let thumbnailUrl = video.thumbnail;
        if (!thumbnailUrl) {
            thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        }
        
        const duration = UIManager.formatDuration(video.duration);
        
        itemDiv.innerHTML = `
            <img src="${thumbnailUrl}" class="playlist-item-thumb-mobile" alt="${video.title}"
                 onerror="this.src='https://via.placeholder.com/48x36/333333/ffffff?text=V'">
            <div class="playlist-item-info-mobile">
                <div class="playlist-item-title-mobile">${UIManager.escapeHtml(video.title)}</div>
                <div class="playlist-item-duration-mobile">${duration}</div>
            </div>
            <button class="playlist-item-menu-mobile" data-video-id="${video.videoId}">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            ${isPlaying ? '<div class="playing-icon-mobile"><i class="fas fa-volume-up"></i></div>' : ''}
        `;
        
        return itemDiv;
    }

    // ✅ FIX: Event delegation más robusta
    static enableInteractivity() {
        // Remover listeners existentes para evitar duplicados
        document.removeEventListener('click', UIManager.handleDocumentClick);
        
        // Agregar listener único
        document.addEventListener('click', UIManager.handleDocumentClick);
        
        console.log('✅ Interactividad habilitada (unificado)');
    }

    // ✅ FIX: Manejador centralizado de clicks
    static handleDocumentClick(e) {
        try {
            // Playlist card clicks
            const playlistCard = e.target.closest('.playlist-card-mobile');
            if (playlistCard) {
                const playlistId = playlistCard.dataset.playlistId;
                
                if (e.target.closest('.playlist-play-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    UIManager.handlePlaylistPlay(playlistId);
                } else if (e.target.closest('.playlist-add-all-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    UIManager.handlePlaylistAddAll(playlistId);
                } else {
                    UIManager.handlePlaylistClick(playlistId);
                }
                return;
            }
            
            // Playlist group headers
            const playlistHeader = e.target.closest('.playlist-group-header-mobile');
            if (playlistHeader) {
                const group = playlistHeader.closest('.playlist-group-mobile');
                const playlistId = group?.dataset.playlistId;
                if (playlistId) {
                    UIManager.handlePlaylistToggle(playlistId);
                }
                return;
            }
            
            // Video items
            const videoItem = e.target.closest('.playlist-item-mobile');
            if (videoItem) {
                const videoId = videoItem.dataset.videoId;
                
                if (e.target.closest('.playlist-item-menu-mobile')) {
                    e.preventDefault();
                    e.stopPropagation();
                    UIManager.handleVideoMenu(videoId, e.target.closest('.playlist-item-menu-mobile'));
                } else {
                    UIManager.handleVideoClick(videoId);
                }
                return;
            }
            
        } catch (error) {
            console.error('💥 Error en handleDocumentClick:', error);
        }
    }

    // ✅ FIX: Handlers mejorados
    static handlePlaylistPlay(playlistId) {
        console.log('▶️ Reproducir playlist:', playlistId);
        UIManager.handlePlaylistAddAll(playlistId);
        
        // Auto-iniciar reproducción después de añadir
        setTimeout(() => {
            if (window.PlaybackController?.playFirstVideo) {
                window.PlaybackController.playFirstVideo();
            }
        }, 1000);
    }

    static async handlePlaylistAddAll(playlistId) {
        console.log('➕ Añadir toda la playlist:', playlistId);
        
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        const playlist = state.playlist.playlistsData.find(p => p.id === playlistId);
        if (!playlist) {
            console.warn('Playlist no encontrada:', playlistId);
            return;
        }
        
        // ✅ FIX: Manejar playlists de YouTube Library que no están cargadas
        if (playlist.source === 'youtube_library' && !playlist.videos) {
            console.log('🔄 Cargando playlist de YouTube Library...');
            
            window.unifiedMessageManager?.show(`Cargando "${playlist.name}"...`, 'info');
            
            try {
                if (window.PlaylistManager?.togglePlaylistExpansion) {
                    await window.PlaylistManager.togglePlaylistExpansion(playlistId);
                }
                
                // Recargar playlist después de expansión
                const updatedPlaylist = state.playlist.playlistsData.find(p => p.id === playlistId);
                if (updatedPlaylist?.videos) {
                    UIManager.addPlaylistVideos(updatedPlaylist);
                }
            } catch (error) {
                console.error('Error cargando playlist:', error);
                window.unifiedMessageManager?.show('Error cargando playlist', 'error');
            }
        } else if (playlist.videos && playlist.videos.length > 0) {
            UIManager.addPlaylistVideos(playlist);
        } else {
            window.unifiedMessageManager?.show('Esta playlist está vacía', 'warning');
        }
    }

    static addPlaylistVideos(playlist) {
        const addedCount = playlist.videos.length;
        
        // Usar PlaylistManager si está disponible
        if (window.PlaylistManager?.addVideoToManualPlaylist) {
            playlist.videos.forEach(video => {
                window.PlaylistManager.addVideoToManualPlaylist(video);
            });
        } else {
            // Fallback: añadir al estado directamente
            playlist.videos.forEach(video => {
                UIManager.handlePlayNextActionFromSearch(video.videoId, video);
            });
        }
        
        window.unifiedMessageManager?.show(
            `${addedCount} videos añadidos de "${playlist.name}"`, 
            'success',
            3000
        );
    }

    static async handlePlaylistToggle(playlistId) {
        console.log('🔄 Toggle playlist:', playlistId);
        
        if (window.PlaylistManager?.togglePlaylistExpansion) {
            try {
                await window.PlaylistManager.togglePlaylistExpansion(playlistId);
            } catch (error) {
                console.error('Error toggling playlist:', error);
                window.unifiedMessageManager?.show('Error expandiendo playlist', 'error');
            }
        }
    }

    // ✅ FIX: Mejorar gestión de vista y navegación
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

    // ✅ FIX: Setup mejorado de navegación
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

    // ✅ FIX: Setup mejorado de búsqueda
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

    // ✅ FIX: Manejo mejorado de búsqueda
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

    static handlePlayNextActionFromSearch(videoId, videoData) {
        console.log('🎵 Añadiendo para reproducir después:', videoData.title);
        
        try {
            // Usar PlaylistManager si está disponible
            if (window.PlaylistManager?.addVideoToManualPlaylist) {
                window.PlaylistManager.addVideoToManualPlaylist(videoData);
                window.unifiedMessageManager?.show(`"${videoData.title}" añadido`, 'success', 2000);
            } else {
                console.warn('⚠️ PlaylistManager no disponible');
                window.unifiedMessageManager?.show('Sistema de playlist no disponible', 'error');
            }
            
        } catch (error) {
            console.error('💥 Error añadiendo video:', error);
            window.unifiedMessageManager?.show('Error añadiendo video', 'error');
        }
    }

    // ✅ FIX: Inicialización mejorada
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

    // Resto de métodos sin cambios...
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

    // Utilidades
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

    static handlePlaylistClick(playlistId) {
        console.log('👆 Click en playlist:', playlistId);
        UIManager.handlePlaylistToggle(playlistId);
    }

    static handleVideoClick(videoId) {
        console.log('🎵 Click en video:', videoId);
        
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        // Encontrar el video en los datos
        let foundVideo = null;
        for (const playlist of state.playlist.playlistsData) {
            if (playlist.videos) {
                foundVideo = playlist.videos.find(v => v.videoId === videoId);
                if (foundVideo) break;
            }
        }
        
        if (foundVideo) {
            UIManager.handlePlayNextActionFromSearch(videoId, foundVideo);
        }
    }

    static handleVideoMenu(videoId, buttonElement) {
        console.log('📋 Menú de video:', videoId);
        
        // Crear menú contextual
        const menu = document.createElement('div');
        menu.className = 'video-context-menu';
        menu.innerHTML = `
            <button class="context-menu-item" data-action="play-next" data-video-id="${videoId}">
                <i class="fas fa-play"></i>
                Reproducir Siguiente
            </button>
            <button class="context-menu-item" data-action="remove" data-video-id="${videoId}">
                <i class="fas fa-trash"></i>
                Eliminar
            </button>
        `;
        
        // Posicionar menú
        document.body.appendChild(menu);
        const rect = buttonElement.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left - 100}px`;
        menu.style.zIndex = '10001';
        
        // Event listeners del menú
        menu.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            const targetVideoId = e.target.closest('[data-action]')?.dataset.videoId;
            
            if (action === 'play-next') {
                const state = window.unifiedStateManager?.state;
                if (state) {
                    let foundVideo = null;
                    for (const playlist of state.playlist.playlistsData) {
                        if (playlist.videos) {
                            foundVideo = playlist.videos.find(v => v.videoId === targetVideoId);
                            if (foundVideo) break;
                        }
                    }
                    if (foundVideo) {
                        UIManager.handlePlayNextActionFromSearch(targetVideoId, foundVideo);
                    }
                }
            } else if (action === 'remove') {
                UIManager.handleVideoRemove(targetVideoId);
            }
            
            menu.remove();
        });

        // Cerrar menú al hacer click fuera
        setTimeout(() => {
            document.addEventListener('click', () => {
                if (menu.parentNode) {
                    menu.remove();
                }
            }, { once: true });
        }, 100);
    }

    static handleVideoRemove(videoId) {
        console.log('🗑️ Eliminar video:', videoId);
        
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        // Encontrar y eliminar el video
        let found = false;
        const playlistsData = [...state.playlist.playlistsData];
        
        for (const playlist of playlistsData) {
            if (playlist.videos) {
                const index = playlist.videos.findIndex(v => v.videoId === videoId);
                if (index !== -1) {
                    const video = playlist.videos[index];
                    playlist.videos.splice(index, 1);
                    found = true;
                    
                    // Actualizar estado
                    window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
                    
                    window.unifiedMessageManager?.show(`"${video.title}" eliminado`, 'success', 2000);
                    UIManager.updatePlaylistsUI();
                    break;
                }
            }
        }
        
        if (!found) {
            window.unifiedMessageManager?.show('Video no encontrado', 'error', 2000);
        }
    }

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

    // Mobile specific methods
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

    // Error handling
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

// ===== FUNCIÓN DE MENSAJES COMPATIBLE =====
export function mostrarMensajeFlotante(mensaje, duracion = 3000, tipo = 'info') {
    if (window.unifiedMessageManager) {
        return window.unifiedMessageManager.show(mensaje, tipo, duracion);
    } else {
        console.warn('⚠️ Sistema de mensajes unificado no disponible, usando fallback');
        console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
    }
}

// ===== AUTO-INICIALIZACIÓN MEJORADA =====
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

// ===== EVENT LISTENERS PARA INTEGRATION CON AUTH =====
document.addEventListener('playlistsFetched', (event) => {
    console.log('📚 Playlists recibidas desde auth:', event.detail?.length || 0);
    
    // Esperar un poco para que el estado se actualice
    setTimeout(() => {
        console.log('🔄 Actualizando UI después de recibir playlists...');
        UIManager.updatePlaylistsUI();
    }, 500);
});

document.addEventListener('userLoggedOut', () => {
    console.log('👤 Usuario deslogueado, actualizando UI...');
    UIManager.updatePlaylistsUI();
});

// ===== DEBUG HELPERS =====
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
        checkContainers: () => {
            console.log('📋 Contenedores disponibles:');
            console.log('- playlistsGrid:', !!document.getElementById('playlistsGrid'));
            console.log('- playlistContainer:', !!document.getElementById('playlistContainer'));
            console.log('- searchResults:', !!document.getElementById('searchResults'));
            console.log('- overviewGrid:', !!document.getElementById('overviewGrid'));
        }
    };
    
    console.log('🔧 UIDebug disponible en window.UIDebug');
}

console.log('✅ UIManager cargado con sistema unificado - VERSION CORREGIDA');
