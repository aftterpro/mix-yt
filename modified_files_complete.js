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
