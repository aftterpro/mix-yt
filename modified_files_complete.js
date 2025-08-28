// ===== 1. PLAYLISTMANAGER.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// playlistManager.js - Versión adaptada al sistema unificado

export class PlaylistManager {
    
    // ✅ Usar estado unificado en lugar de imports duplicados
    static getFlattenedPlaylist() {
        const playlistsData = window.unifiedStateManager?.state?.playlist?.playlistsData || [];
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

    static updateCurrentPlayingIndex() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        let playingVideoId = null;
        let activePlayerNum = null;

        // ✅ Usar estado unificado
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        try {
            if (state.app.player1 && state.app.player1.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = state.app.player1.getVideoData()?.video_id;
                activePlayerNum = 1;
            } else if (state.app.player2 && state.app.player2.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = state.app.player2.getVideoData()?.video_id;
                activePlayerNum = 2;
            }
        } catch (e) {
            console.error("Error getting playing video data:", e);
        }
        
        if (playingVideoId) {
            const currentInfo = state.playlist.currentPlayingInfo;
            if (currentInfo.videoId !== playingVideoId || currentInfo.flattenedIndex < 0) {
                const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
                if (newFlatIndex !== -1) {
                    const currentVideoObject = flatList[newFlatIndex];
                    
                    // ✅ Usar setState unificado
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', playingVideoId);
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', currentVideoObject.sourcePlaylistId);
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', newFlatIndex);
                    
                    console.log(`Índice aplanado actualizado a: ${newFlatIndex} (Video: ${playingVideoId})`);
                    
                    // ✅ Usar UI unificada
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                }
            }

            if (activePlayerNum && state.app.currentPlayer !== activePlayerNum) {
                console.log(`Sincronizando currentPlayer a ${activePlayerNum}`);
                window.unifiedStateManager.set('app.currentPlayer', activePlayerNum);
            }
        } else {
            const currentInfo = state.playlist.currentPlayingInfo;
            if (currentInfo.flattenedIndex !== -1) {
                console.log("Reproducción detenida, reseteando índice.");
                window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
                
                if (window.UIManager?.updatePlaylistsUI) {
                    window.UIManager.updatePlaylistsUI();
                }
            }
        }
    }

    static async handlePlaylistLoaded(playlistInfo) {
        console.log('Datos de playlist recibidos:', playlistInfo);

        if (!playlistInfo || !playlistInfo.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
            const failedPlaylistId = playlistInfo?.id || 'desconocida';
            // ✅ Usar sistema de mensajes unificado
            window.unifiedMessageManager?.show(`No se encontraron videos válidos en la playlist ${failedPlaylistId}.`, 'error');
            console.error("Respuesta inválida de getPlaylistInfo:", playlistInfo);
            return;
        }

        const playlistId = playlistInfo.id || `playlist_${Date.now()}`;
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        if (state.playlist.playlistsData.some(p => p.id === playlistId)) {
            window.unifiedMessageManager?.show(`La playlist "${playlistInfo.name || playlistId}" ya está cargada.`, 'warning');
            return;
        }

        const loadedVideos = playlistInfo.relatedStreams.map(video => ({
            videoId: video.url?.split('v=')[1],
            title: video.title || "Título Desconocido",
            thumbnail: video.thumbnail || '',
            duration: PlaylistManager.parseDuration(video.duration) || 0,
        })).filter(v => v.videoId);

        if (loadedVideos.length === 0) {
            window.unifiedMessageManager?.show(`La playlist "${playlistInfo.name || playlistId}" no contiene videos válidos.`, 'warning');
            return;
        }

        const newPlaylist = {
            id: playlistId,
            name: playlistInfo.name || "Playlist Sin Nombre",
            thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || '',
            videos: loadedVideos,
            isExpanded: true
        };

        // ✅ Usar estado unificado
        const playlistsData = [...state.playlist.playlistsData];
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        if (manualIndex !== -1) {
            playlistsData.splice(manualIndex + 1, 0, newPlaylist);
        } else {
            playlistsData.push(newPlaylist);
        }
        
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);

        window.unifiedMessageManager?.show(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos).`, 'success');
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
        PlaylistManager.checkAndEnablePlayButton();
    }

    static addVideoToManualPlaylist(videoData) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const playlistsData = [...state.playlist.playlistsData];
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
            console.log("Playlist 'manual' creada y añadida al inicio.");
        }

        const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
        if (isDuplicate) {
            window.unifiedMessageManager?.show(`"${videoData.title}" ya está en "${manualPlaylist.name}".`, 'warning');
            return;
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || '',
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || 'Desconocido'
        };

        manualPlaylist.videos.push(videoObject);
        console.log(`Video añadido a playlist 'manual': ${videoObject.title}`);
        
        // ✅ Actualizar estado unificado
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
        PlaylistManager.checkAndEnablePlayButton();

        return videoObject;
    }

    static deleteVideo(playlistId, videoId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return false;

        const playlistsData = [...state.playlist.playlistsData];
        const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
        if (playlistIndex === -1) return false;

        const videoIndex = playlistsData[playlistIndex].videos.findIndex(v => v.videoId === videoId);
        if (videoIndex === -1) return false;

        const deletedVideo = playlistsData[playlistIndex].videos[videoIndex];
        playlistsData[playlistIndex].videos.splice(videoIndex, 1);
        
        if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
            playlistsData.splice(playlistIndex, 1);
        }

        // ✅ Actualizar estado unificado
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);

        console.log(`Video eliminado: ${deletedVideo.title}`);
        window.unifiedMessageManager?.show('Video eliminado', 'success', 2000);
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
        PlaylistManager.updateCurrentPlayingIndex();

        return true;
    }

    static checkAndEnablePlayButton() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        const playersReady = window.unifiedStateManager?.state?.app?.playersInitialized;
        
        if (flatList.length > 0 && playersReady) {
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.disabled = false;
            }
            console.log('✅ Botón Play habilitado');
        }
    }

    static async togglePlaylistExpansion(playlistId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const playlist = state.playlist.playlistsData.find(p => p.id === playlistId);
        if (!playlist) return;

        // Lógica para YouTube Library
        if (playlist.source === 'youtube_library' && !playlist.isLoaded && !playlist.isExpanded) {
            console.log(`Cargando videos de YouTube para: ${playlist.name}`);
            window.unifiedMessageManager?.show(`Cargando "${playlist.name}"...`, 'info');
            
            try {
                const { authManager } = await import('./auth.js');
                
                if (!authManager.isUserAuthenticated()) {
                    window.unifiedMessageManager?.show("Error: No hay sesión de Google activa.", 'error');
                    return;
                }

                const videos = await authManager.getPlaylistVideos(playlist.id);
                
                if (videos && videos.length > 0) {
                    playlist.videos = videos;
                    playlist.isLoaded = true;
                    playlist.isExpanded = true;
                    
                    // ✅ Actualizar estado unificado
                    const playlistsData = [...state.playlist.playlistsData];
                    const index = playlistsData.findIndex(p => p.id === playlistId);
                    if (index !== -1) {
                        playlistsData[index] = playlist;
                        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
                    }
                    
                    console.log(`Cargados ${videos.length} videos para "${playlist.name}"`);
                    window.unifiedMessageManager?.show(`"${playlist.name}" cargada (${videos.length} videos).`, 'success');
                    
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                    PlaylistManager.checkAndEnablePlayButton();
                } else {
                    window.unifiedMessageManager?.show(`No se pudieron cargar los videos de "${playlist.name}".`, 'error');
                }
                
            } catch (error) {
                console.error(`Error cargando playlist ${playlist.name}:`, error);
                window.unifiedMessageManager?.show(`Error cargando "${playlist.name}". Intenta de nuevo.`, 'error');
            }
            
            return;
        }

        // Toggle normal
        playlist.isExpanded = !playlist.isExpanded;
        
        // ✅ Actualizar estado unificado
        const playlistsData = [...state.playlist.playlistsData];
        const index = playlistsData.findIndex(p => p.id === playlistId);
        if (index !== -1) {
            playlistsData[index] = playlist;
            window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
        }
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
    }

    // ✅ Utility method moved here from Utils
    static parseDuration(durationInput) {
        if (typeof durationInput === 'number') {
            return Math.floor(durationInput);
        }
        if (typeof durationInput !== 'string') return 0;

        // PT0H0M0S format
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
        } else if (timeParts.length === 3 && !isNaN(timeParts[0]) && !isNaN(timeParts[1]) && !isNaN(timeParts[2])) {
            return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        }

        const directNumber = parseInt(durationInput, 10);
        if (!isNaN(directNumber)) {
            return directNumber;
        }

        return 0;
    }
}

// ===== 2. SEARCHMANAGER.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// searchManager.js - Versión adaptada al sistema unificado

export class SearchManager {

    static initialize() {
        const searchResultsElement = document.getElementById('searchResults');
        
        if (searchResultsElement) {
            // ✅ Usar estado unificado
            const state = window.unifiedStateManager?.state;
            if (state) {
                state.search.resultsContainer = searchResultsElement;
                state.search.resultsDiv = searchResultsElement;
                
                searchResultsElement.addEventListener('scroll', SearchManager.handleScroll);
                console.log('🔍 Search Manager inicializado con estado unificado');
            }
        } else {
            console.error("Error: Elemento 'searchResults' no encontrado en el DOM.");
        }
    }

    static async performSearch(query, nextPage = null) {
        const state = window.unifiedStateManager?.state;
        if (!state?.search?.resultsDiv) return;

        const searchState = state.search;

        if (!nextPage) {
            console.log(`Iniciando NUEVA búsqueda para: ${query}`);
            searchState.currentSearchQuery = query;
            searchState.nextPageContext = null;
            searchState.resultsDiv.innerHTML = '<p>Buscando...</p>';
        } else {
            console.log(`Cargando MÁS resultados para: ${searchState.currentSearchQuery}`);
            SearchManager.showLoadMoreSpinner();
        }

        searchState.isLoadingMore = true;

        try {
            let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(searchState.currentSearchQuery)}`;
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
                    } catch (e2) { /* Ignorar */ }
                }
                throw new Error(errorDetails);
            }

            const data = await response.json();
            SearchManager.displaySearchResults(data, !!nextPage);

        } catch (error) {
            console.error("Error fetching search results:", error);
            const displayError = error.message || "Error desconocido al buscar.";
            
            if (!nextPage) {
                searchState.resultsDiv.innerHTML = `<p>${displayError}</p>`;
            } else {
                // ✅ Usar sistema de mensajes unificado
                window.unifiedMessageManager?.show(displayError, 'error');
                SearchManager.hideLoadMoreSpinner();
            }
            searchState.isLoadingMore = false;
        }
    }

    static displaySearchResults(results, append = false) {
        const state = window.unifiedStateManager?.state;
        if (!state?.search?.resultsDiv) return;
        
        const searchState = state.search;
        
        if (!append) {
            searchState.resultsDiv.innerHTML = '';
        }
        
        if (!results || !results.items || !Array.isArray(results.items)) {
            if (!append && (!results || results.items?.length === 0)) {
                searchState.resultsDiv.innerHTML = "<p>No se encontraron resultados.</p>";
            }
            searchState.nextPageContext = results?.nextpage || null;
            searchState.isLoadingMore = false;
            SearchManager.hideLoadMoreSpinner();
            return;
        }

        searchState.nextPageContext = results.nextpage || null;

        results.items.forEach(video => {
            const videoId = video.videoId || video.url?.split('v=')[1];
            if (!videoId) return;

            if (append && searchState.resultsDiv.querySelector(`.video-result[data-video-id="${videoId}"]`)) {
                return;
            }

            const videoDiv = SearchManager.createVideoResultElement(video, videoId);
            searchState.resultsDiv.appendChild(videoDiv);
        });

        if (append) {
            SearchManager.hideLoadMoreSpinner();
        }
        searchState.isLoadingMore = false;
    }

    static createVideoResultElement(video, videoId) {
        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');
        
        const thumbnail = document.createElement('img');
        thumbnail.src = video.thumbnail;
        thumbnail.alt = video.title;
        thumbnail.classList.add('thumbnail');
        thumbnail.loading = "lazy";
        thumbnailContainer.appendChild(thumbnail);
        
        if (video.duration && video.duration > 0) {
            const durationSpan = document.createElement('span');
            durationSpan.textContent = SearchManager.formatDuration(video.duration);
            durationSpan.classList.add('duration');
            thumbnailContainer.appendChild(durationSpan);
        }
        
        videoDiv.appendChild(thumbnailContainer);

        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('video-details');
        
        const title = document.createElement('h3');
        title.textContent = video.title;
        title.classList.add('video-title');
        detailsDiv.appendChild(title);
        
        const author = document.createElement('p');
        author.textContent = video.uploaderName || 'Autor Desconocido';
        author.classList.add('video-author');
        detailsDiv.appendChild(author);

        const addButton = document.createElement('button');
        addButton.innerHTML = '<i class="fa-solid fa-arrow-right-to-line"></i><span class="add-text"> Reproducir Después</span>';
        addButton.classList.add('search-result-add-button');
        
        addButton.dataset.videoId = videoId;
        addButton.dataset.videoTitle = video.title;
        addButton.dataset.videoThumbnail = video.thumbnail;
        addButton.dataset.videoDuration = SearchManager.parseDuration(video.duration);
        
        addButton.addEventListener('click', (event) => {
            const videoData = {
                videoId: addButton.dataset.videoId,
                title: addButton.dataset.videoTitle,
                thumbnail: addButton.dataset.videoThumbnail,
                duration: parseInt(addButton.dataset.videoDuration, 10),
                channelTitle: video.uploaderName
            };
            SearchManager.handleSearchResultAddClick(event, videoData);
        });
      
        detailsDiv.appendChild(addButton);
        videoDiv.appendChild(detailsDiv);
        
        return videoDiv;
    }

    static handleSearchResultAddClick(event, videoData) {
        event.preventDefault();
        event.stopPropagation();

        console.log("Añadiendo video para 'Reproducir Después':", videoData.title);
        
        // ✅ Usar PlaylistManager
        if (window.PlaylistManager) {
            window.PlaylistManager.addVideoToManualPlaylist(videoData);
        }
        
        // Feedback visual
        const button = event.currentTarget;
        const originalContent = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Añadido';
        button.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
        
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.style.background = '';
        }, 2000);

        // ✅ Usar sistema de mensajes unificado
        window.unifiedMessageManager?.show(`♪ "${videoData.title}" añadido`, 'success', 2000);
    }

    static handleScroll() {
        const state = window.unifiedStateManager?.state;
        if (!state?.search) return;
        
        const searchState = state.search;
        
        if (searchState.isLoadingMore || !searchState.nextPageContext || !searchState.currentSearchQuery) {
            return;
        }
        
        const scrollThreshold = 300;
        const bottomReached = searchState.resultsContainer.scrollTop + searchState.resultsContainer.clientHeight >= 
                              searchState.resultsContainer.scrollHeight - scrollThreshold;
        
        if (bottomReached) {
            console.log("Scroll cerca del final, cargando más...");
            SearchManager.performSearch(searchState.currentSearchQuery, searchState.nextPageContext);
        }
    }

    static showLoadMoreSpinner() {
        const state = window.unifiedStateManager?.state;
        if (!state?.search?.resultsContainer) return;

        // ✅ Usar loading manager unificado
        window.unifiedLoadingManager?.show('search-more', {
            type: 'append',
            container: state.search.resultsContainer,
            size: 'small'
        });
    }

    static hideLoadMoreSpinner() {
        // ✅ Usar loading manager unificado
        window.unifiedLoadingManager?.hide('search-more');
    }

    // Utilities
    static formatDuration(duration) {
        if (typeof duration === 'number') {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        return duration || '0:00';
    }

    static parseDuration(duration) {
        if (typeof duration === 'number') return duration;
        if (typeof duration === 'string') {
            const parts = duration.split(':').map(Number);
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return 0;
    }
}

// ===== 3. UI.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// ui.js - Versión adaptada (solo las partes críticas modificadas)

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
        
        // ✅ Actualizar estado unific