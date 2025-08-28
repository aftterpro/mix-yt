// ===== MODULES-MIGRATION.JS - FASE 2 =====
// Migración de funcionalidades específicas al sistema unificado

// ===== 1. MIGRATION HELPER =====
class ModuleMigrationHelper {
    constructor(core) {
        this.core = core;
        this.stateManager = core.stateManager;
        this.migrationStatus = new Map();
    }
    
    async migrateModule(moduleName, migrationFn) {
        if (this.migrationStatus.has(moduleName)) {
            console.log(`✅ Módulo ${moduleName} ya migrado`);
            return;
        }
        
        console.log(`🔄 Migrando módulo: ${moduleName}`);
        
        try {
            await migrationFn();
            this.migrationStatus.set(moduleName, 'success');
            console.log(`✅ ${moduleName} migrado exitosamente`);
        } catch (error) {
            console.error(`❌ Error migrando ${moduleName}:`, error);
            this.migrationStatus.set(moduleName, 'error');
            throw error;
        }
    }
    
    getMigrationStatus() {
        return Object.fromEntries(this.migrationStatus);
    }
}

// ===== 2. YOUTUBE API MIGRATION =====
class YouTubeAPIMigrated {
    constructor(core) {
        this.core = core;
        this.stateManager = core.stateManager;
    }
    
    // ❌ ELIMINAR: window.onYouTubeIframeAPIReady duplicado
    // ✅ INTEGRADO: En core.js ya maneja esto
    
    // Funcionalidades específicas que se mantienen
    getPlayerInstance(playerNum) {
        return this.stateManager.get(`app.player${playerNum}`);
    }
    
    getActivePlayer() {
        const currentPlayer = this.stateManager.get('app.currentPlayer');
        return this.getPlayerInstance(currentPlayer);
    }
    
    getInactivePlayer() {
        const currentPlayer = this.stateManager.get('app.currentPlayer');
        const inactiveNum = currentPlayer === 1 ? 2 : 1;
        return this.getPlayerInstance(inactiveNum);
    }
    
    switchPlayers() {
        const currentPlayer = this.stateManager.get('app.currentPlayer');
        const newPlayer = currentPlayer === 1 ? 2 : 1;
        
        this.stateManager.set('app.currentPlayer', newPlayer);
        console.log(`🔄 Switched to Player ${newPlayer}`);
        
        return newPlayer;
    }
    
    // Verificar estado de reproductores
    arePlayersReady() {
        const player1 = this.getPlayerInstance(1);
        const player2 = this.getPlayerInstance(2);
        
        return player1 && player2 &&
               typeof player1.getPlayerState === 'function' &&
               typeof player2.getPlayerState === 'function';
    }
    
    // Obtener información del video actual
    getCurrentVideoInfo(playerNum = null) {
        const targetPlayerNum = playerNum || this.stateManager.get('app.currentPlayer');
        const player = this.getPlayerInstance(targetPlayerNum);
        
        if (!player || typeof player.getVideoData !== 'function') {
            return null;
        }
        
        try {
            const videoData = player.getVideoData();
            return {
                videoId: videoData.video_id,
                title: videoData.title,
                author: videoData.author,
                playerNum: targetPlayerNum,
                duration: player.getDuration(),
                currentTime: player.getCurrentTime(),
                state: player.getPlayerState()
            };
        } catch (error) {
            console.warn('Error obteniendo info del video:', error);
            return null;
        }
    }
}

// ===== 3. PLAYLIST MANAGER MIGRATION =====
class PlaylistManagerMigrated {
    constructor(core) {
        this.core = core;
        this.stateManager = core.stateManager;
    }
    
    // ✅ MIGRADO: getFlattenedPlaylist
    getFlattenedPlaylist() {
        const playlistsData = this.stateManager.get('playlist.playlistsData') || [];
        let flatList = [];
        
        playlistsData.forEach(playlist => {
            if (playlist.videos && Array.isArray(playlist.videos)) {
                playlist.videos.forEach(video => {
                    flatList.push({ 
                        ...video, 
                        sourcePlaylistId: playlist.id 
                    });
                });
            }
        });
        
        return flatList;
    }
    
    // ✅ MIGRADO: updateCurrentPlayingIndex
    updateCurrentPlayingIndex() {
        const flatList = this.getFlattenedPlaylist();
        const currentInfo = this.stateManager.get('playlist.currentPlayingInfo');
        
        // Obtener video actualmente reproduciéndose
        let playingVideoId = null;
        let activePlayerNum = null;
        
        try {
            const youtube = this.core.modules.get('youtube');
            if (youtube) {
                const currentVideoInfo = youtube.getCurrentVideoInfo();
                if (currentVideoInfo) {
                    playingVideoId = currentVideoInfo.videoId;
                    activePlayerNum = currentVideoInfo.playerNum;
                }
            }
        } catch (error) {
            console.warn('Error obteniendo video actual:', error);
        }
        
        if (playingVideoId && currentInfo.videoId !== playingVideoId) {
            const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
            
            if (newFlatIndex !== -1) {
                const currentVideoObject = flatList[newFlatIndex];
                
                this.stateManager.set('playlist.currentPlayingInfo', {
                    videoId: playingVideoId,
                    playlistId: currentVideoObject.sourcePlaylistId,
                    flattenedIndex: newFlatIndex
                });
                
                console.log(`📍 Índice actualizado: ${newFlatIndex} (${playingVideoId})`);
                
                // Actualizar UI si está disponible
                this.updateUI();
            }
        }
    }
    
    // ✅ MIGRADO: addVideoToManualPlaylist
    addVideoToManualPlaylist(videoData) {
        const playlistsData = this.stateManager.get('playlist.playlistsData') || [];
        let manualPlaylist = playlistsData.find(p => p.id === 'manual');
        
        if (!manualPlaylist) {
            manualPlaylist = {
                id: 'manual',
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: '/electronic.ico',
                videos: [],
                isExpanded: true
            };
            playlistsData.unshift(manualPlaylist);
        }
        
        // Verificar duplicados
        const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
        if (isDuplicate) {
            this.core.showMessage(`"${videoData.title}" ya está en "${manualPlaylist.name}"`, 'warning');
            return;
        }
        
        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || videoData.artist || 'Desconocido'
        };
        
        manualPlaylist.videos.push(videoObject);
        
        // Actualizar estado
        this.stateManager.set('playlist.playlistsData', playlistsData);
        
        console.log(`➕ Video añadido a manual: ${videoObject.title}`);
        this.updateUI();
        this.checkAndEnablePlayButton();
        
        return videoObject;
    }
    
    // ✅ MIGRADO: togglePlaylistExpansion
    async togglePlaylistExpansion(playlistId) {
        const playlistsData = this.stateManager.get('playlist.playlistsData') || [];
        const playlist = playlistsData.find(p => p.id === playlistId);
        
        if (!playlist) {
            console.warn(`Playlist ${playlistId} no encontrada`);
            return;
        }
        
        // Si es una playlist de YouTube no cargada
        if (playlist.source === CONFIG.YOUTUBE_LIBRARY_SOURCE_ID && !playlist.isLoaded && !playlist.isExpanded) {
            console.log(`🔄 Cargando playlist de YouTube: ${playlist.name}`);
            this.core.showMessage(`Cargando "${playlist.name}"...`, 'info');
            
            try {
                const authManager = this.core.modules.get('auth');
                if (!authManager || !authManager.isUserAuthenticated()) {
                    this.core.showMessage('Error: No hay sesión de Google activa', 'error');
                    return;
                }
                
                const videos = await authManager.getPlaylistVideos(playlist.id);
                
                if (videos && videos.length > 0) {
                    playlist.videos = videos;
                    playlist.isLoaded = true;
                    playlist.isExpanded = true;
                    
                    this.stateManager.set('playlist.playlistsData', playlistsData);
                    
                    console.log(`✅ Cargados ${videos.length} videos para "${playlist.name}"`);
                    this.core.showMessage(`"${playlist.name}" cargada (${videos.length} videos)`, 'success');
                    
                    this.updateUI();
                    this.checkAndEnablePlayButton();
                } else {
                    this.core.showMessage(`No se pudieron cargar los videos de "${playlist.name}"`, 'error');
                }
                
            } catch (error) {
                console.error(`Error cargando playlist ${playlist.name}:`, error);
                this.core.showMessage(`Error cargando "${playlist.name}". Intenta de nuevo.`, 'error');
            }
            
            return;
        }
        
        // Toggle normal
        playlist.isExpanded = !playlist.isExpanded;
        this.stateManager.set('playlist.playlistsData', playlistsData);
        this.updateUI();
    }
    
    // ✅ MIGRADO: deleteVideo
    deleteVideo(playlistId, videoId) {
        const playlistsData = this.stateManager.get('playlist.playlistsData') || [];
        const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
        
        if (playlistIndex === -1) return false;
        
        const videoIndex = playlistsData[playlistIndex].videos.findIndex(v => v.videoId === videoId);
        if (videoIndex === -1) return false;
        
        const deletedVideo = playlistsData[playlistIndex].videos[videoIndex];
        playlistsData[playlistIndex].videos.splice(videoIndex, 1);
        
        // Si la playlist queda vacía y no es manual, eliminarla
        if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
            playlistsData.splice(playlistIndex, 1);
        }
        
        this.stateManager.set('playlist.playlistsData', playlistsData);
        
        console.log(`🗑️ Video eliminado: ${deletedVideo.title}`);
        this.core.showMessage('Video eliminado', 'success', 2000);
        
        this.updateUI();
        this.updateCurrentPlayingIndex();
        
        return true;
    }
    
    // ✅ MIGRADO: addYouTubeLibraryPlaylists
    addYouTubeLibraryPlaylists(youtubePlaylists) {
        if (!youtubePlaylists || youtubePlaylists.length === 0) {
            this.core.showMessage('No se encontraron playlists en tu biblioteca de YouTube', 'warning');
            return;
        }
        
        const formattedPlaylists = youtubePlaylists.map(playlist => {
            if (!playlist.snippet?.title || playlist.contentDetails?.itemCount === 0) {
                return null;
            }
            
            return {
                id: playlist.id,
                name: playlist.snippet.title,
                thumbnailUrl: playlist.snippet.thumbnails?.high?.url || 
                             playlist.snippet.thumbnails?.medium?.url ||
                             playlist.snippet.thumbnails?.default?.url ||
                             'https://via.placeholder.com/120x90?text=Playlist',
                videos: [],
                isExpanded: false,
                source: CONFIG.YOUTUBE_LIBRARY_SOURCE_ID,
                isLoaded: false,
                videoCount: playlist.contentDetails?.itemCount || 0
            };
        }).filter(p => p !== null);
        
        const playlistsData = this.stateManager.get('playlist.playlistsData') || [];
        
        // Insertar después de la playlist manual
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        if (manualIndex !== -1) {
            playlistsData.splice(manualIndex + 1, 0, ...formattedPlaylists);
        } else {
            playlistsData.unshift(...formattedPlaylists);
        }
        
        this.stateManager.set('playlist.playlistsData', playlistsData);
        
        console.log(`📚 ${formattedPlaylists.length} playlists de YouTube añadidas`);
        this.core.showMessage(`${formattedPlaylists.length} playlists de tu biblioteca añadidas`, 'success');
        
        this.updateUI();
    }
    
    // Utilities
    checkAndEnablePlayButton() {
        const flatList = this.getFlattenedPlaylist();
        const playersReady = this.stateManager.get('app.playersInitialized');
        
        if (flatList.length > 0 && playersReady) {
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.disabled = false;
            }
            console.log('✅ Botón Play habilitado');
        }
    }
    
    updateUI() {
        // Actualizar UI si UIManager está disponible
        const uiManager = this.core.modules.get('ui');
        if (uiManager && typeof uiManager.updatePlaylistsUI === 'function') {
            uiManager.updatePlaylistsUI();
        } else {
            console.log('📱 UI Manager no disponible para actualización');
        }
    }
    
    getPlaylistStats() {
        const playlistsData = this.stateManager.get('playlist.playlistsData') || [];
        
        return {
            totalPlaylists: playlistsData.length,
            totalVideos: playlistsData.reduce((total, p) => total + (p.videos?.length || 0), 0),
            youtubeLibraryPlaylists: playlistsData.filter(p => p.source === CONFIG.YOUTUBE_LIBRARY_SOURCE_ID).length,
            manualPlaylists: playlistsData.filter(p => p.source !== CONFIG.YOUTUBE_LIBRARY_SOURCE_ID).length,
            loadedPlaylists: playlistsData.filter(p => p.isLoaded !== false).length
        };
    }
}

// ===== 4. SEARCH MANAGER MIGRATION =====
class SearchManagerMigrated {
    constructor(core) {
        this.core = core;
        this.stateManager = core.stateManager;
        this.searchState = this.stateManager.state.search;
    }
    
    initialize() {
        const searchResultsElement = document.getElementById('searchResults');
        
        if (searchResultsElement) {
            this.searchState.resultsContainer = searchResultsElement;
            this.searchState.resultsDiv = searchResultsElement;
            
            // Setup scroll listener
            this.searchState.resultsContainer.addEventListener('scroll', () => {
                this.handleScroll();
            });
            
            console.log('🔍 Search Manager inicializado');
        } else {
            console.warn('⚠️ Elemento searchResults no encontrado');
        }
    }
    
    // ✅ MIGRADO: performSearch
    async performSearch(query, nextPage = null) {
        if (!this.searchState.resultsDiv) {
            console.warn('⚠️ Results div no disponible');
            return;
        }
        
        const isNewSearch = !nextPage;
        
        if (isNewSearch) {
            console.log(`🔍 Nueva búsqueda: ${query}`);
            this.searchState.currentSearchQuery = query;
            this.searchState.nextPageContext = null;
            this.searchState.resultsDiv.innerHTML = '<div class="search-placeholder"><div class="spinner"></div><p>Buscando...</p></div>';
        } else {
            console.log(`📄 Cargando más resultados: ${query}`);
            this.showLoadMoreSpinner();
        }
        
        this.searchState.isLoadingMore = true;
        
        try {
            let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(this.searchState.currentSearchQuery)}`;
            if (nextPage) {
                apiUrl += `&nextpage=${encodeURIComponent(nextPage)}`;
            }
            
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                let errorDetails = `Error: ${response.status} ${response.statusText}`;
                try {
                    const errorBody = await response.json();
                    errorDetails = errorBody.error || errorDetails;
                } catch (e) {
                    try {
                        errorDetails = await response.text();
                    } catch (e2) {
                        // Ignorar si falla
                    }
                }
                throw new Error(errorDetails);
            }
            
            const data = await response.json();
            this.displaySearchResults(data, !isNewSearch);
            
        } catch (error) {
            console.error('Error en búsqueda:', error);
            const displayError = error.message || "Error desconocido al buscar";
            
            if (isNewSearch) {
                this.searchState.resultsDiv.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${displayError}</p>
                    </div>
                `;
            } else {
                this.core.showMessage(displayError, 'error');
                this.hideLoadMoreSpinner();
            }
            
            this.searchState.isLoadingMore = false;
        }
    }
    
    // ✅ MIGRADO: displaySearchResults
    displaySearchResults(results, append = false) {
        if (!this.searchState.resultsDiv) return;
        
        if (!append) {
            this.searchState.resultsDiv.innerHTML = '';
        }
        
        if (!results || !results.items || !Array.isArray(results.items)) {
            if (!append && (!results || results.items?.length === 0)) {
                this.searchState.resultsDiv.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-search"></i>
                        <p>No se encontraron resultados</p>
                    </div>
                `;
            }
            this.searchState.nextPageContext = results?.nextpage || null;
            this.searchState.isLoadingMore = false;
            this.hideLoadMoreSpinner();
            return;
        }
        
        this.searchState.nextPageContext = results.nextpage || null;
        
        results.items.forEach(video => {
            const videoId = video.videoId || video.url?.split('v=')[1];
            if (!videoId) return;
            
            // Evitar duplicados
            if (append && this.searchState.resultsDiv.querySelector(`[data-video-id="${videoId}"]`)) {
                return;
            }
            
            const videoElement = this.createVideoResultElement(video, videoId);
            this.searchState.resultsDiv.appendChild(videoElement);
        });
        
        if (append) {
            this.hideLoadMoreSpinner();
        }
        
        this.searchState.isLoadingMore = false;
        console.log(`🔍 Resultados mostrados: ${results.items.length}`);
    }
    
    // ✅ MIGRADO: createVideoResultElement
    createVideoResultElement(video, videoId) {
        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;
        
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');
        
        const thumbnail = document.createElement('img');
        thumbnail.src = video.thumbnail || '';
        thumbnail.alt = video.title || 'Video';
        thumbnail.classList.add('thumbnail');
        thumbnail.loading = "lazy";
        thumbnail.onerror = () => {
            thumbnail.src = 'https://via.placeholder.com/180x135?text=No+Image';
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
        title.title = video.title;
        detailsDiv.appendChild(title);
        
        const author = document.createElement('p');
        author.textContent = video.uploaderName || 'Autor desconocido';
        author.classList.add('video-author');
        detailsDiv.appendChild(author);
        
        const addButton = document.createElement('button');
        addButton.innerHTML = '<i class="fas fa-arrow-right-to-line"></i><span class="add-text"> Reproducir Después</span>';
        addButton.classList.add('search-result-add-button');
        
        addButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const videoData = {
                videoId: videoId,
                title: video.title,
                thumbnail: video.thumbnail,
                duration: this.parseDuration(video.duration),
                channelTitle: video.uploaderName
            };
            
            this.handleAddClick(addButton, videoData);
        });
        
        detailsDiv.appendChild(addButton);
        videoDiv.appendChild(detailsDiv);
        
        return videoDiv;
    }
    
    // ✅ MIGRADO: handleAddClick
    handleAddClick(button, videoData) {
        console.log('➕ Añadiendo video:', videoData.title);
        
        try {
            // Usar playlist manager migrado
            const playlistManager = this.core.modules.get('playlist');
            if (playlistManager) {
                playlistManager.addVideoToManualPlaylist(videoData);
            }
            
            // Feedback visual
            const originalContent = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i> Añadido';
            button.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
            
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.style.background = '';
            }, 2000);
            
            // Vibración en mobile
            if (navigator.vibrate) {
                navigator.vibrate(30);
            }
            
            this.core.showMessage(`♪ "${videoData.title}" añadido`, 'success', 2000);
            
        } catch (error) {
            console.error('Error añadiendo video:', error);
            this.core.showMessage('Error añadiendo video', 'error');
        }
    }
    
    // ✅ MIGRADO: handleScroll
    handleScroll() {
        if (this.searchState.isLoadingMore || 
            !this.searchState.nextPageContext || 
            !this.searchState.currentSearchQuery) {
            return;
        }
        
        const container = this.searchState.resultsContainer;
        const scrollThreshold = 300;
        const bottomReached = container.scrollTop + container.clientHeight >= 
                              container.scrollHeight - scrollThreshold;
        
        if (bottomReached) {
            console.log('📄 Cargando más resultados...');
            this.performSearch(this.searchState.currentSearchQuery, this.searchState.nextPageContext);
        }
    }
    
    // Utilidades
    showLoadMoreSpinner() {
        let spinner = document.getElementById('loadMoreSpinner');
        if (!spinner) {
            spinner = document.createElement('div');
            spinner.id = 'loadMoreSpinner';
            spinner.className = 'loading-spinner-small';
            spinner.innerHTML = '<div class="spinner"></div>';
            this.searchState.resultsContainer.appendChild(spinner);
        }
        spinner.style.display = 'flex';
    }
    
    hideLoadMoreSpinner() {
        const spinner = document.getElementById('loadMoreSpinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }
    
    formatDuration(duration) {
        if (typeof duration === 'number') {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        return duration || '0:00';
    }
    
    parseDuration(duration) {
        if (typeof duration === 'number') return duration;
        if (typeof duration === 'string') {
            const parts = duration.split(':').map(Number);
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return 0;
    }
}

// ===== 5. UI MANAGER MIGRATION =====
class UIManagerMigrated {
    constructor(core) {
        this.core = core;
        this.stateManager = core.stateManager;
    }
    
    initialize() {
        console.log('🎨 UI Manager migrado inicializado');
        this.setupEventListeners();
        this.updatePlaylistsUI();
    }
    
    setupEventListeners() {
        // Context menus y otros event listeners específicos
        document.addEventListener('contextmenu', (e) => {
            const playlistItem = e.target.closest('.playlist-item-mobile');
            if (playlistItem) {
                e.preventDefault();
                this.showContextMenu(e, playlistItem);
            }
        });
        
        // Touch and hold para mobile context menus
        let touchTimer = null;
        document.addEventListener('touchstart', (e) => {
            const playlistItem = e.target.closest('.playlist-item-mobile');
            if (playlistItem) {
                touchTimer = setTimeout(() => {
                    this.showContextMenu(e, playlistItem);
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 500);
            }
        });
        
        document.addEventListener('touchend', () => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });
    }
    
    // ✅ MIGRADO: updatePlaylistsUI
    updatePlaylistsUI() {
        console.log('🔄 Actualizando UI de playlists (migrado)...');
        
        try {
            const currentView = this.stateManager.get('ui.currentView');
            const container = this.getPlaylistContainer(currentView);
            
            if (!container) {
                console.warn('⚠️ Container no encontrado para vista:', currentView);
                return;
            }
            
            const playlistsData = this.stateManager.get('playlist.playlistsData') || [];
            const currentInfo = this.stateManager.get('playlist.currentPlayingInfo');
            
            if (playlistsData.length === 0) {
                this.renderEmptyState(container, currentView);
            } else {
                if (currentView === 'library') {
                    this.renderPlaylistCards(container, playlistsData);
                } else {
                    this.renderPlaylistList(container, playlistsData, currentInfo.videoId);
                }
            }
            
            console.log('✅ UI de playlists actualizada');
            
        } catch (error) {
            console.error('💥 Error actualizando UI:', error);
            this.core.showMessage('Error actualizando interfaz', 'error');
        }
    }
    
    getPlaylistContainer(view) {
        const containers = {
            library: '#playlistsGrid',
            playing: '#playlistContainer',
            home: '#overviewGrid'
        };
        
        return document.querySelector(containers[view]) || 
               document.querySelector('#playlistContainer') ||
               document.querySelector('#playlistsGrid');
    }
    
    renderEmptyState(container, view) {
        const emptyStates = {
            library: {
                icon: 'fas fa-music',
                title: 'No hay playlists cargadas',
                subtitle: 'Conecta tu cuenta de Google para ver tus playlists de YouTube'
            },
            playing: {
                icon: 'fas fa-music',
                title: 'Cola de reproducción vacía',
                subtitle: 'Añade música desde la búsqueda o biblioteca'
            },
            home: {
                icon: 'fas fa-headphones',
                title: 'Bienvenido a YT CrossMix',
                subtitle: 'Comienza añadiendo playlists'
            }
        };
        
        const state = emptyStates[view] || emptyStates.home;
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="${state.icon}"></i>
                <p><strong>${state.title}</strong></p>
                <p>${state.subtitle}</p>
            </div>
        `;
    }
    
    renderPlaylistCards(container, playlistsData) {
        const grid = document.createElement('div');
        grid.className = 'playlists-grid-mobile';
        
        playlistsData.forEach((playlist, index) => {
            const card = this.createPlaylistCard(playlist, index);
            grid.appendChild(card);
        });
        
        container.innerHTML = '';
        container.appendChild(grid);
    }
    
    renderPlaylistList(container, playlistsData, playingVideoId) {
        container.innerHTML = '';
        
        playlistsData.forEach(playlist => {
            const groupDiv = this.createPlaylistGroup(playlist, playingVideoId);
            container.appendChild(groupDiv);
        });
    }
    
    createPlaylistCard(playlist, index) {
        const card = document.createElement('div');
        card.className = 'playlist-card-mobile';
        card.dataset.playlistId = playlist.id;
        card.style.animationDelay = `${index * 0.1}s`;
        
        const thumbnail = playlist.thumbnailUrl || 
                         (playlist.videos[0]?.thumbnail) || 
                         'https://via.placeholder.com/180x135?text=Playlist';
        
        card.innerHTML = `
            <div class="playlist-card-image">
                <img src="${thumbnail}" 
                     alt="${this.escapeHtml(playlist.name)}" 
                     loading="lazy"
                     onerror="this.src='https://via.placeholder.com/180x135?text=Playlist'">
            </div>
            <div class="playlist-card-info">
                <h3 class="playlist-card-title">${this.escapeHtml(playlist.name)}</h3>
                <p class="playlist-card-meta">
                    ${playlist.videos?.length || 0} videos
                    ${playlist.isLoaded === false ? ' • No cargada' : ''}
                </p>
                <div class="playlist-card-actions">
                    <button class="playlist-add-all-btn" title="Añadir todos">
                        <i class="fas fa-plus"></i>
                        Añadir Todo
                    </button>
                </div>
            </div>
        `;
        
        // Event listeners
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            this.handlePlaylistCardClick(playlist);
        });
        
        const addAllBtn = card.querySelector('.playlist-add-all-btn');
        if (addAllBtn) {
            addAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addAllToQueue(playlist);
            });
        }
        
        return card;
    }
    
    createPlaylistGroup(playlist, playingVideoId) {
        const groupDiv = document.createElement('div');
        groupDiv.className = `playlist-group-mobile ${playlist.isExpanded ? 'expanded' : ''}`;
        groupDiv.dataset.playlistId = playlist.id;
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'playlist-group-header-mobile';
        
        const thumbnail = playlist.thumbnailUrl || 
                         'https://via.placeholder.com/50x50?text=♪';
        
        headerDiv.innerHTML = `
            <img src="${thumbnail}" 
                 alt="${this.escapeHtml(playlist.name)}" 
                 class="playlist-group-thumb-mobile"
                 loading="lazy"
                 onerror="this.src='https://via.placeholder.com/50x50?text=♪'">
            <div class="playlist-info-mobile">
                <span class="playlist-name-mobile">${this.escapeHtml(playlist.name)}</span>
                <span class="playlist-count-mobile">
                    ${playlist.videos?.length || 0} videos
                    ${playlist.isLoaded === false ? ' • Cargando...' : ''}
                </span>
            </div>
            <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} expand-icon-mobile"></i>
        `;
        
        headerDiv.addEventListener('click', () => {
            const playlistManager = this.core.modules.get('playlist');
            if (playlistManager) {
                playlistManager.togglePlaylistExpansion(playlist.id);
            }
        });
        
        groupDiv.appendChild(headerDiv);
        
        const videosDiv = document.createElement('div');
        videosDiv.className = 'playlist-group-videos-mobile';
        
        if (playlist.isExpanded && playlist.videos?.length > 0) {
            playlist.videos.forEach((video, index) => {
                const item = this.createPlaylistItem(video, playlist.id, playingVideoId, index);
                videosDiv.appendChild(item);
            });
        } else if (playlist.isExpanded && playlist.videos?.length === 0) {
            videosDiv.innerHTML = `
                <div class="playlist-empty-state">
                    <p>Esta playlist está vacía</p>
                </div>
            `;
        }
        
        groupDiv.appendChild(videosDiv);
        return groupDiv;
    }
    
    createPlaylistItem(video, playlistId, playingVideoId, index) {
        const item = document.createElement('div');
        item.className = 'playlist-item-mobile';
        item.dataset.videoId = video.videoId;
        item.dataset.playlistId = playlistId;
        item.style.animationDelay = `${index * 0.05}s`;
        
        if (video.videoId === playingVideoId) {
            item.classList.add('playing');
        }
        
        const thumbnail = video.thumbnail || 
                         'https://via.placeholder.com/56x42?text=♪';
        
        item.innerHTML = `
            <img src="${thumbnail}" 
                 alt="${this.escapeHtml(video.title)}" 
                 class="playlist-item-thumb-mobile"
                 loading="lazy"
                 onerror="this.src='https://via.placeholder.com/56x42?text=♪'">
            <div class="playlist-item-info-mobile">
                <h4 class="playlist-item-title-mobile">${this.escapeHtml(video.title)}</h4>
                <p class="playlist-item-duration-mobile">
                    ${this.formatDuration(video.duration)}
                    ${video.channelTitle ? ` • ${video.channelTitle}` : ''}
                </p>
            </div>
            <button class="playlist-item-menu-mobile" title="Opciones">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            ${video.videoId === playingVideoId ? '<i class="fas fa-volume-up playing-icon-mobile"></i>' : ''}
        `;
        
        // Event listeners
        item.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            this.handleVideoClick(video, playlistId);
        });
        
        const menuBtn = item.querySelector('.playlist-item-menu-mobile');
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showContextMenu(e, item, video, playlistId);
            });
        }
        
        return item;
    }
    
    // Event handlers
    handlePlaylistCardClick(playlist) {
        console.log('🎵 Click en playlist card:', playlist.name);
        
        const playlistManager = this.core.modules.get('playlist');
        if (!playlistManager) return;
        
        if (playlist.source === CONFIG.YOUTUBE_LIBRARY_SOURCE_ID && !playlist.isLoaded) {
            playlistManager.togglePlaylistExpansion(playlist.id);
        } else if (playlist.videos?.length > 0) {
            this.core.switchView('playing');
        } else {
            this.core.showMessage('Esta playlist está vacía', 'warning');
        }
    }
    
    handleVideoClick(video, playlistId) {
        console.log('🎵 Click en video:', video.title);
        
        const playlistManager = this.core.modules.get('playlist');
        if (playlistManager) {
            playlistManager.addVideoToManualPlaylist(video);
        }
    }
    
    addAllToQueue(playlist) {
        if (!playlist.videos || playlist.videos.length === 0) {
            this.core.showMessage('Esta playlist está vacía', 'warning');
            return;
        }
        
        const playlistManager = this.core.modules.get('playlist');
        if (playlistManager) {
            playlist.videos.forEach(video => {
                playlistManager.addVideoToManualPlaylist(video);
            });
            
            this.core.showMessage(
                `${playlist.videos.length} videos de "${playlist.name}" añadidos`, 
                'success'
            );
        }
    }
    
    showContextMenu(event, element, video = null, playlistId = null) {
        // Implementar context menu móvil
        console.log('📋 Context menu solicitado');
        
        // Por ahora, mostrar mensaje simple
        if (video) {
            this.core.showMessage(`Opciones para: ${video.title}`, 'info', 2000);
        }
    }
    
    // Utilidades
    escapeHtml(text) {
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
    
    formatDuration(duration) {
        if (!duration || isNaN(duration)) return '0:00';
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// ===== 6. INTEGRATION ORCHESTRATOR =====
class ModuleMigrationOrchestrator {
    constructor(core) {
        this.core = core;
        this.migrationHelper = new ModuleMigrationHelper(core);
        this.migratedModules = new Map();
    }
    
    async performMigration() {
        console.log('🔄 Iniciando migración de módulos...');
        
        try {
            // Migrar YouTube API
            await this.migrationHelper.migrateModule('youtube', async () => {
                const youtubeAPI = new YouTubeAPIMigrated(this.core);
                this.core.modules.set('youtube', youtubeAPI);
                this.migratedModules.set('youtube', youtubeAPI);
            });
            
            // Migrar Playlist Manager
            await this.migrationHelper.migrateModule('playlist', async () => {
                const playlistManager = new PlaylistManagerMigrated(this.core);
                this.core.modules.set('playlist', playlistManager);
                this.migratedModules.set('playlist', playlistManager);
            });
            
            // Migrar Search Manager
            await this.migrationHelper.migrateModule('search', async () => {
                const searchManager = new SearchManagerMigrated(this.core);
                searchManager.initialize();
                this.core.modules.set('search', searchManager);
                this.migratedModules.set('search', searchManager);
            });
            
            // Migrar UI Manager
            await this.migrationHelper.migrateModule('ui', async () => {
                const uiManager = new UIManagerMigrated(this.core);
                uiManager.initialize();
                this.core.modules.set('ui', uiManager);
                this.migratedModules.set('ui', uiManager);
            });
            
            console.log('✅ Migración de módulos completada');
            console.log('📊 Estado:', this.migrationHelper.getMigrationStatus());
            
            return true;
            
        } catch (error) {
            console.error('💥 Error en migración:', error);
            throw error;
        }
    }
    
    getMigratedModule(name) {
        return this.migratedModules.get(name);
    }
    
    getAllMigratedModules() {
        return Object.fromEntries(this.migratedModules);
    }
}

// ===== 7. EXPORTS =====
export { 
    ModuleMigrationOrchestrator,
    YouTubeAPIMigrated,
    PlaylistManagerMigrated,
    SearchManagerMigrated,
    UIManagerMigrated
};
