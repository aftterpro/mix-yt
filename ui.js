// ===== 3. UI.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// ui.js - Versión completamente adaptada al sistema unificado

export class UIManager {
    
    static updatePlaylistsUI() {
        console.log('🔄 UIManager: Actualizando UI con estado unificado...');
        
        try {
            // ✅ Usar estado unificado
            const state = window.unifiedStateManager?.state;
            if (!state) {
                console.warn('⚠️ Estado unificado no disponible');
                return;
            }
            
            const currentView = state.ui.currentView || UIManager.getCurrentView() || 'home';
            let playlistContainer = UIManager.getPlaylistContainer(currentView);
            
            if (!playlistContainer) {
                console.warn('⚠️ No se encontró contenedor para vista:', currentView);
                return;
            }
            
            const currentScrollTop = playlistContainer.scrollTop;
            const playingVideoId = state.playlist.currentPlayingInfo?.videoId || null;
            
            if (!state.playlist.playlistsData || state.playlist.playlistsData.length === 0) {
                UIManager.renderEmptyState(playlistContainer, currentView);
            } else {
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
            // ✅ Usar sistema de mensajes unificado
            window.unifiedMessageManager?.show('Error actualizando interfaz', 'error');
        }
    }

    static renderPlaylistCards(container, playlistsData) {
        console.log('📱 Renderizando cards con estado unificado...');
        
        const grid = document.createElement('div');
        grid.className = 'playlists-grid-mobile';
        
        playlistsData.forEach((playlist, index) => {
            const card = UIManager.createPlaylistCard(playlist, index);
            grid.appendChild(card);
        });
        
        container.innerHTML = '';
        container.appendChild(grid);
    }

    static renderPlaylistList(container, playlistsData, playingVideoId) {
        console.log('📝 Renderizando lista con estado unificado...');
        
        container.innerHTML = '';
        
        playlistsData.forEach((playlist) => {
            const groupDiv = UIManager.createPlaylistGroup(playlist, playingVideoId);
            container.appendChild(groupDiv);
        });
    }

    static handlePlayNextActionFromSearch(videoId, videoData) {
        console.log('🎵 Añadiendo para reproducir después (unificado):', videoData.title);
        
        try {
            const state = window.unifiedStateManager?.state;
            if (!state) return;
            
            if (state.playlist.currentPlayingInfo) {
                const currentIndex = state.playlist.currentPlayingInfo.flattenedIndex;
                
                if (currentIndex < 0) {
                    UIManager.createQueueAndAdd(videoData);
                } else {
                    UIManager.insertVideoAfterCurrent(videoData, currentIndex);
                }
            } else {
                UIManager.createQueueAndAdd(videoData);
            }
            
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                // ✅ Usar sistema de mensajes unificado
                window.unifiedMessageManager?.show(`♪ Añadido`, 'success', 1500);
                
                if (navigator.vibrate) {
                    navigator.vibrate(30);
                }
            } else {
                window.unifiedMessageManager?.show(`"${videoData.title}" añadido para reproducir después`, 'success', 3000);
            }
            
            UIManager.updatePlaylistsUI();
            
        } catch (error) {
            console.error('💥 Error añadiendo video:', error);
            window.unifiedMessageManager?.show('Error añadiendo video', 'error', 2000);
        }
    }

    static createQueueAndAdd(videoData) {
        // ✅ Usar estado unificado
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        let playlistsData = [...state.playlist.playlistsData];
        let queuePlaylist = playlistsData.find(p => p.id === 'queue') ||
                           playlistsData.find(p => p.id === 'manual');
        
        if (!queuePlaylist) {
            queuePlaylist = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: '',
                videos: [],
                isExpanded: true
            };
            playlistsData.unshift(queuePlaylist);
        }
        
        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title,
            thumbnail: videoData.thumbnail,
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || videoData.artist || 'Desconocido'
        };
        
        queuePlaylist.videos.push(videoObject);
        
        // ✅ Actualizar estado unificado
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
        
        if (window.PlaylistManager?.checkAndEnablePlayButton) {
            window.PlaylistManager.checkAndEnablePlayButton();
        }
    }

    static insertVideoAfterCurrent(videoData, currentIndex) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const flatList = window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist() : [];
        
        if (currentIndex >= 0 && currentIndex < flatList.length) {
            const currentVideo = flatList[currentIndex];
            const targetPlaylist = state.playlist.playlistsData.find(p => p.id === currentVideo.sourcePlaylistId);
            
            if (targetPlaylist) {
                const videoIndex = targetPlaylist.videos.findIndex(v => v.videoId === currentVideo.videoId);
                
                if (videoIndex !== -1) {
                    const videoObject = {
                        videoId: videoData.videoId,
                        title: videoData.title,
                        thumbnail: videoData.thumbnail,
                        duration: videoData.duration || 0,
                        channelTitle: videoData.channelTitle || 'Desconocido'
                    };
                    
                    targetPlaylist.videos.splice(videoIndex + 1, 0, videoObject);
                    
                    // ✅ Actualizar estado unificado
                    const playlistsData = [...state.playlist.playlistsData];
                    window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
                }
            }
        } else {
            UIManager.createQueueAndAdd(videoData);
        }
    }

    // ===== UTILIDADES UI =====
    
    static getCurrentView() {
        const activeView = document.querySelector('.content-view.active');
        if (activeView) {
            return activeView.id.replace('View', '');
        }
        return 'home';
    }

    static getPlaylistContainer(currentView) {
        const containers = {
            'playing': document.getElementById('playlistContainer'),
            'library': document.getElementById('playlistsGrid'),
            'home': document.getElementById('overviewGrid')
        };
        
        return containers[currentView] || document.getElementById('playlistContainer');
    }

    static renderEmptyState(container, currentView) {
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
        
        const videoCount = playlist.videos ? playlist.videos.length : 0;
        const thumbnailUrl = playlist.thumbnailUrl || 'https://via.placeholder.com/160x90?text=Playlist';
        
        card.innerHTML = `
            <div class="playlist-card-image">
                <img src="${thumbnailUrl}" alt="${playlist.name}" loading="lazy">
                <div class="playlist-card-overlay">
                    <button class="playlist-play-btn" data-playlist-id="${playlist.id}">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="playlist-card-info">
                <h3 class="playlist-card-title">${playlist.name}</h3>
                <p class="playlist-card-meta">${videoCount} videos</p>
                <div class="playlist-card-actions">
                    <button class="playlist-add-all-btn" data-playlist-id="${playlist.id}">
                        <i class="fas fa-plus"></i>
                        Añadir Todo
                    </button>
                </div>
            </div>
        `;
        
        // Delay para animación escalonada
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 50);
        
        return card;
    }

    static createPlaylistGroup(playlist, playingVideoId) {
        const groupDiv = document.createElement('div');
        groupDiv.className = `playlist-group-mobile ${playlist.isExpanded ? 'expanded' : ''}`;
        groupDiv.dataset.playlistId = playlist.id;
        
        const videoCount = playlist.videos ? playlist.videos.length : 0;
        const thumbnailUrl = playlist.thumbnailUrl || 'https://via.placeholder.com/40x40?text=P';
        
        // Header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'playlist-group-header-mobile';
        headerDiv.innerHTML = `
            <img src="${thumbnailUrl}" class="playlist-group-thumb-mobile" alt="${playlist.name}">
            <div class="playlist-info-mobile">
                <span class="playlist-name-mobile">${playlist.name}</span>
                <span class="playlist-count-mobile">${videoCount} videos</span>
            </div>
            <i class="fas fa-chevron-down expand-icon-mobile"></i>
        `;
        
        // Videos container
        const videosDiv = document.createElement('div');
        videosDiv.className = 'playlist-group-videos-mobile';
        
        if (playlist.isExpanded && playlist.videos) {
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
        
        const thumbnailUrl = video.thumbnail || 'https://via.placeholder.com/48x36?text=V';
        const duration = UIManager.formatDuration(video.duration);
        
        itemDiv.innerHTML = `
            <img src="${thumbnailUrl}" class="playlist-item-thumb-mobile" alt="${video.title}">
            <div class="playlist-item-info-mobile">
                <div class="playlist-item-title-mobile">${video.title}</div>
                <div class="playlist-item-duration-mobile">${duration}</div>
            </div>
            <button class="playlist-item-menu-mobile" data-video-id="${video.videoId}">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            ${isPlaying ? '<div class="playing-icon-mobile"><i class="fas fa-volume-up"></i></div>' : ''}
        `;
        
        return itemDiv;
    }

    static enableInteractivity() {
        // Event delegation para playlist cards
        document.addEventListener('click', function(e) {
            // Playlist card clicks
            if (e.target.closest('.playlist-card-mobile')) {
                const card = e.target.closest('.playlist-card-mobile');
                const playlistId = card.dataset.playlistId;
                
                if (e.target.closest('.playlist-play-btn')) {
                    UIManager.handlePlaylistPlay(playlistId);
                } else if (e.target.closest('.playlist-add-all-btn')) {
                    UIManager.handlePlaylistAddAll(playlistId);
                } else {
                    UIManager.handlePlaylistClick(playlistId);
                }
                return;
            }
            
            // Playlist group headers
            if (e.target.closest('.playlist-group-header-mobile')) {
                const header = e.target.closest('.playlist-group-header-mobile');
                const group = header.parentElement;
                const playlistId = group.dataset.playlistId;
                UIManager.handlePlaylistToggle(playlistId);
                return;
            }
            
            // Video items
            if (e.target.closest('.playlist-item-mobile')) {
                const item = e.target.closest('.playlist-item-mobile');
                const videoId = item.dataset.videoId;
                
                if (e.target.closest('.playlist-item-menu-mobile')) {
                    UIManager.handleVideoMenu(videoId, e.target.closest('.playlist-item-menu-mobile'));
                } else {
                    UIManager.handleVideoClick(videoId);
                }
                return;
            }
        });
        
        console.log('✅ Interactividad habilitada (unificado)');
    }

    // ===== HANDLERS =====
    
    static handlePlaylistPlay(playlistId) {
        console.log('▶️ Reproducir playlist:', playlistId);
        // Implementar reproducción de playlist completa
        window.unifiedMessageManager?.show('Función de reproducción en desarrollo', 'info');
    }

    static handlePlaylistAddAll(playlistId) {
        console.log('➕ Añadir toda la playlist:', playlistId);
        
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        const playlist = state.playlist.playlistsData.find(p => p.id === playlistId);
        if (playlist && playlist.videos) {
            playlist.videos.forEach(video => {
                UIManager.handlePlayNextActionFromSearch(video.videoId, video);
            });
            
            window.unifiedMessageManager?.show(`${playlist.videos.length} videos añadidos de "${playlist.name}"`, 'success');
        }
    }

    static handlePlaylistClick(playlistId) {
        console.log('👆 Click en playlist:', playlistId);
        UIManager.handlePlaylistToggle(playlistId);
    }

    static async handlePlaylistToggle(playlistId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        if (window.PlaylistManager?.togglePlaylistExpansion) {
            await window.PlaylistManager.togglePlaylistExpansion(playlistId);
        }
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
        for (const playlist of state.playlist.playlistsData) {
            if (playlist.videos) {
                const index = playlist.videos.findIndex(v => v.videoId === videoId);
                if (index !== -1) {
                    const video = playlist.videos[index];
                    playlist.videos.splice(index, 1);
                    found = true;
                    
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

    // ===== UTILIDADES =====
    
    static formatDuration(duration) {
        if (!duration || isNaN(duration)) {
            return "0:00";
        }
        
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
        return `${minutes}:${formattedSeconds}`;
    }

    static escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    static truncateText(text, maxLength = 50) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // ===== VIEW MANAGEMENT =====
    
    static switchView(viewName) {
        console.log('🔄 Cambiando a vista:', viewName);
        
        // Actualizar estado unificado
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('ui.currentView', viewName);
        }
        
        // Ocultar todas las vistas
        const views = document.querySelectorAll('.content-view');
        views.forEach(view => view.classList.remove('active'));
        
        // Mostrar vista target
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
        }
        
        // Actualizar navegación
        const navItems = document.querySelectorAll('[data-view]');
        navItems.forEach(item => {
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Actualizar UI específica de la vista
        setTimeout(() => {
            UIManager.updatePlaylistsUI();
        }, 100);
        
        console.log(`✅ Vista cambiada a: ${viewName}`);
    }

    // ===== SETUP INICIAL =====
    
    static initialize() {
        console.log('🎨 Inicializando UIManager con sistema unificado...');
        
        try {
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
            
            console.log('✅ UIManager inicializado exitosamente');
            
        } catch (error) {
            console.error('💥 Error inicializando UIManager:', error);
            window.unifiedMessageManager?.show('Error inicializando interfaz', 'error');
        }
    }

    static setupNavigation() {
        // Setup sidebar navigation
        const sidebarNavItems = document.querySelectorAll('.sidebar-nav [data-view]');
        sidebarNavItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                UIManager.switchView(view);
            });
        });
        
        // Setup bottom navigation (mobile)
        const bottomNavItems = document.querySelectorAll('.bottom-nav [data-view]');
        bottomNavItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                UIManager.switchView(view);
            });
        });
        
        console.log('✅ Navegación configurada');
    }

    static setupPlayerControls() {
        // Setup play button
        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.addEventListener('click', () => {
                UIManager.handlePlayButtonClick();
            });
        }
        
        // Setup next button
        const nextButton = document.getElementById('botonNext');
        if (nextButton) {
            nextButton.addEventListener('click', () => {
                UIManager.handleNextButtonClick();
            });
        }
        
        // Setup mini player controls
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

    static setupSearchInputs() {
        const searchInputs = [
            'sidebarSearchInput',
            'mobileSearchInput',
            'searchInput2'
        ];
        
        searchInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', UIManager.debounce((e) => {
                    const query = e.target.value.trim();
                    if (query.length > 2) {
                        UIManager.handleSearch(query);
                    }
                }, 300));
            }
        });
        
        // Setup playlist URL input
        const urlButton = document.getElementById('añadirUrlButton');
        if (urlButton) {
            urlButton.addEventListener('click', () => {
                UIManager.handlePlaylistUrlAdd();
            });
        }
        
        console.log('✅ Entradas de búsqueda configuradas');
    }

    static setupViewSwitching() {
        // Auto-switch to search view when searching
        document.addEventListener('search-started', () => {
            UIManager.switchView('search');
        });
        
        // Auto-switch to playing view when playback starts
        document.addEventListener('playback-started', () => {
            if (window.innerWidth <= 768) {
                // En mobile, mantener vista actual pero mostrar mini player
                UIManager.showMiniPlayer();
            }
        });
        
        console.log('✅ Cambio de vistas configurado');
    }

    // ===== HANDLERS DE CONTROLES =====
    
    static handlePlayButtonClick() {
        console.log('▶️ Click en botón play');
        
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        if (state.app.reproduccionIniciada) {
            // Pausar/reanudar
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
            // Iniciar reproducción
            if (window.PlaybackController?.playFirstVideo) {
                window.PlaybackController.playFirstVideo();
            }
        }
    }

    static handleNextButtonClick() {
        console.log('⏭️ Click en botón siguiente');
        
        if (window.PlaybackController?.playNextVideo) {
            window.PlaybackController.playNextVideo();
        }
    }

    static handleSearch(query) {
        console.log('🔍 Búsqueda:', query);
        
        // Switch to search view
        UIManager.switchView('search');
        
        // Trigger search
        if (window.SearchManager?.performSearch) {
            window.SearchManager.performSearch(query);
        }
        
        // Dispatch event
        document.dispatchEvent(new CustomEvent('search-started', {
            detail: { query }
        }));
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
        
        // Limpiar input
        input.value = '';
        
        // Mostrar loading
        window.unifiedLoadingManager?.show('playlist-load', {
            type: 'overlay',
            message: 'Cargando playlist...'
        });
        
        // Simular carga (aquí iría la lógica real)
        setTimeout(() => {
            window.unifiedLoadingManager?.hide('playlist-load');
            window.unifiedMessageManager?.show('Funcionalidad en desarrollo', 'info');
        }, 2000);
    }

    // ===== MOBILE SPECIFIC =====
    
    static showMiniPlayer() {
        const miniPlayer = document.querySelector('.mini-player');
        if (miniPlayer && window.innerWidth <= 768) {
            miniPlayer.style.display = 'flex';
        }
    }

    static hideMiniPlayer() {
        const miniPlayer = document.querySelector('.mini-player');
        if (miniPlayer) {
            miniPlayer.style.display = 'none';
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
        if (imageEl) imageEl.src = trackInfo.thumbnail || '';
    }

    // ===== ERROR HANDLING =====
    
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
        // Fallback legacy
        console.warn('⚠️ Sistema de mensajes unificado no disponible, usando fallback');
        console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
    }
}

// ===== AUTO-INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que el sistema unificado esté listo
    if (window.ytCrossMixUnified?.initialized) {
        UIManager.initialize();
    } else {
        window.addEventListener('ytcrossmix:unified:ready', () => {
            UIManager.initialize();
        });
    }
});

// ===== EXPORT PARA COMPATIBILIDAD =====
window.UIManager = UIManager;
window.mostrarMensajeFlotante = mostrarMensajeFlotante;

console.log('✅ UIManager cargado con sistema unificado');
