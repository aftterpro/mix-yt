// ===== MANAGERS OPTIMIZADOS - SIN DUPLICACIONES =====
// Archivo unificado que reemplaza playlistManager.js, searchManager.js y playbackController.js

// ===== PLAYLISTMANAGER OPTIMIZADO =====
export class PlaylistManager {
    
    // ✅ DELEGACIÓN OPTIMIZADA AL CORE
    static initializeManualPlaylist() {
        return window.unifiedCore?.playlistManager?.initialize() || 
               PlaylistManager.fallbackInitializeManual();
    }

    static getFlattenedPlaylist() {
        return window.unifiedCore?.playlistManager?.getFlattenedPlaylist() || 
               PlaylistManager.fallbackGetFlattenedPlaylist();
    }

    static addVideoToManualPlaylist(videoData) {
        return window.unifiedCore?.playlistManager?.addVideoToManualPlaylist(videoData) || 
               PlaylistManager.fallbackAddVideoToManual(videoData);
    }

    static updateCurrentPlayingIndex() {
        return window.unifiedCore?.playlistManager?.updateCurrentPlayingIndex() || 
               PlaylistManager.fallbackUpdateCurrentIndex();
    }

    // ✅ FUNCIONES ESPECÍFICAS OPTIMIZADAS
    static async togglePlaylistExpansion(playlistId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const playlistsData = [...state.playlist.playlistsData];
        const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
        
        if (playlistIndex === -1) return;

        const playlist = playlistsData[playlistIndex];

        // YouTube Library lazy loading
        if (playlist.source === 'youtube_library' && !playlist.isLoaded && !playlist.isExpanded) {
            window.unifiedMessageManager?.show(`Cargando "${playlist.name}"...`, 'info');
            
            try {
                const { authManager } = await import('./auth.js');
                
                if (!authManager.isUserAuthenticated()) {
                    window.unifiedMessageManager?.show("Error: No hay sesión de Google activa", 'error');
                    return;
                }

                const videos = await authManager.getPlaylistVideos(playlist.id);
                
                if (videos?.length > 0) {
                    playlistsData[playlistIndex] = {
                        ...playlist,
                        videos: videos,
                        isLoaded: true,
                        isExpanded: true,
                        itemCount: videos.length
                    };
                    
                    window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
                    
                    console.log(`✅ ${videos.length} videos cargados para "${playlist.name}"`);
                    window.unifiedMessageManager?.show(`"${playlist.name}" cargada (${videos.length} videos)`, 'success');
                    
                    window.UIManager?.updatePlaylistsUI();
                    PlaylistManager.checkAndEnablePlayButton();
                } else {
                    window.unifiedMessageManager?.show(`No se pudieron cargar los videos`, 'error');
                }
                
            } catch (error) {
                console.error(`❌ Error cargando playlist:`, error);
                window.unifiedMessageManager?.show(`Error cargando playlist`, 'error');
            }
            
            return;
        }

        // Toggle normal
        playlistsData[playlistIndex] = {
            ...playlist,
            isExpanded: !playlist.isExpanded
        };
        
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
        window.UIManager?.updatePlaylistsUI();
    }

    static deleteVideo(playlistId, videoId) {
        return window.unifiedCore?.playlistManager?.deleteVideo?.(playlistId, videoId) || 
               PlaylistManager.fallbackDeleteVideo(playlistId, videoId);
    }

    static addYouTubeLibraryPlaylists(youtubePlaylists) {
        return window.unifiedCore?.playlistManager?.addYouTubeLibraryPlaylists?.(youtubePlaylists) || 
               PlaylistManager.fallbackAddYouTubeLibrary(youtubePlaylists);
    }

    static checkAndEnablePlayButton() {
        if (window.unifiedCore?.checkAndEnablePlayButton) {
            return window.unifiedCore.checkAndEnablePlayButton();
        }
        
        const flatList = PlaylistManager.getFlattenedPlaylist();
        const playersReady = window.unifiedStateManager?.state?.app?.playersInitialized;
        
        ['botonPlay', 'botonNext', 'prevButton'].forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.disabled = !(flatList.length > 0 && playersReady);
            }
        });
    }

    // ✅ FALLBACKS CONSOLIDADOS
    static fallbackInitializeManual() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        const playlistsData = state.playlist.playlistsData || [];
        
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
            
            window.unifiedStateManager.set('playlist.playlistsData', [manualPlaylist, ...playlistsData]);
        }
    }

    static fallbackGetFlattenedPlaylist() {
        const state = window.unifiedStateManager?.state;
        if (!state) return [];
        
        const manualPlaylist = state.playlist.playlistsData?.find(p => p.id === 'manual');
        
        return manualPlaylist?.videos?.map(video => ({
            ...video,
            sourcePlaylistId: 'manual'
        })) || [];
    }

    static fallbackAddVideoToManual(videoData) {
        const state = window.unifiedStateManager?.state;
        if (!state) return null;

        const playlistsData = [...state.playlist.playlistsData];
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        
        if (manualIndex === -1) {
            PlaylistManager.fallbackInitializeManual();
            return PlaylistManager.fallbackAddVideoToManual(videoData);
        }

        const manualPlaylist = playlistsData[manualIndex];

        // Check duplicates
        if (manualPlaylist.videos?.some(video => video.videoId === videoData.videoId)) {
            window.unifiedMessageManager?.show(`"${videoData.title}" ya está en la cola`, 'warning');
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

        playlistsData[manualIndex] = {
            ...manualPlaylist,
            videos: [...(manualPlaylist.videos || []), videoObject],
            itemCount: (manualPlaylist.videos?.length || 0) + 1
        };
        
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
        PlaylistManager.checkAndEnablePlayButton();
        
        return videoObject;
    }

    static fallbackDeleteVideo(playlistId, videoId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return false;

        const playlistsData = [...state.playlist.playlistsData];
        const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
        
        if (playlistIndex === -1) return false;

        const playlist = playlistsData[playlistIndex];
        const videoIndex = playlist.videos?.findIndex(v => v.videoId === videoId);
        
        if (videoIndex === -1) return false;

        playlistsData[playlistIndex] = {
            ...playlist,
            videos: playlist.videos.filter(v => v.videoId !== videoId),
            itemCount: playlist.videos.length - 1
        };

        // Remove empty external playlists
        if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
            playlistsData.splice(playlistIndex, 1);
        }

        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);

        // Handle current playing
        const currentInfo = state.playlist.currentPlayingInfo;
        if (playlistId === 'manual' && currentInfo.videoId === videoId) {
            setTimeout(() => window.PlaybackController?.playNextVideo?.(), 500);
        }
        
        window.UIManager?.updatePlaylistsUI();
        PlaylistManager.updateCurrentPlayingIndex();
        
        return true;
    }

    static fallbackAddYouTubeLibrary(youtubePlaylists) {
        if (!youtubePlaylists?.length) return 0;

        const state = window.unifiedStateManager?.state;
        if (!state) return 0;

        const existingIds = new Set(state.playlist.playlistsData?.map(p => p.id) || []);
        
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
                             playlist.snippet.thumbnails?.default?.url,
                videos: [],
                isExpanded: false,
                source: 'youtube_library',
                isLoaded: false,
                itemCount: playlist.contentDetails.itemCount,
                originalData: playlist
            }));

        if (newPlaylists.length === 0) return 0;

        const currentPlaylists = state.playlist.playlistsData || [];
        const manualPlaylist = currentPlaylists.find(p => p.id === 'manual');
        const otherPlaylists = currentPlaylists.filter(p => p.id !== 'manual');
        
        const finalPlaylists = [
            ...(manualPlaylist ? [manualPlaylist] : []),
            ...otherPlaylists,
            ...newPlaylists
        ];
        
        window.unifiedStateManager.set('playlist.playlistsData', finalPlaylists);
        
        console.log(`✅ ${newPlaylists.length} playlists de YouTube Library añadidas`);
        window.unifiedMessageManager?.show(`${newPlaylists.length} playlists añadidas`, 'success');
        
        setTimeout(() => window.UIManager?.updatePlaylistsUI(), 300);
        
        return newPlaylists.length;
    }

    static clearYouTubeLibraryPlaylists() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const filteredPlaylists = state.playlist.playlistsData.filter(p => p.source !== 'youtube_library');
        const removedCount = state.playlist.playlistsData.length - filteredPlaylists.length;
        
        if (removedCount > 0) {
            window.unifiedStateManager.set('playlist.playlistsData', filteredPlaylists);
            window.UIManager?.updatePlaylistsUI();
        }
    }

    // ✅ UTILIDADES OPTIMIZADAS
    static getQueueInfo() {
        const state = window.unifiedStateManager?.state;
        if (!state) return { exists: false, count: 0, videos: [] };
        
        const manualPlaylist = state.playlist.playlistsData?.find(p => p.id === 'manual');
        
        return {
            exists: !!manualPlaylist,
            count: manualPlaylist?.videos?.length || 0,
            videos: manualPlaylist?.videos || [],
            currentIndex: state.playlist.currentPlayingInfo?.flattenedIndex || -1,
            currentVideo: manualPlaylist?.videos?.[state.playlist.currentPlayingInfo?.flattenedIndex] || null
        };
    }

    static clearQueue() {
        const state = window.unifiedStateManager?.state;
        if (!state) return false;

        const playlistsData = [...state.playlist.playlistsData];
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        
        if (manualIndex !== -1) {
            playlistsData[manualIndex] = {
                ...playlistsData[manualIndex],
                videos: [],
                itemCount: 0
            };
            
            window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
            
            // Reset current playing
            ['playlist.currentPlayingInfo.videoId', 'playlist.currentPlayingInfo.playlistId'].forEach(path => {
                window.unifiedStateManager.set(path, null);
            });
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            
            // Stop playback if active
            if (state.app.reproduccionIniciada) {
                try {
                    if (state.app.player1) state.app.player1.stopVideo();
                    if (state.app.player2) state.app.player2.stopVideo();
                } catch (e) {
                    console.warn('Error deteniendo reproductores:', e);
                }
                
                window.unifiedStateManager.set('app.reproduccionIniciada', false);
            }
            
            window.UIManager?.updatePlaylistsUI();
            PlaylistManager.checkAndEnablePlayButton();
            
            window.unifiedMessageManager?.show('Cola limpiada', 'success');
            return true;
        }
        
        return false;
    }
}

// ===== SEARCHMANAGER OPTIMIZADO =====
export class SearchManager {
    
    // ✅ DELEGACIÓN OPTIMIZADA AL CORE
    static async performSearch(query, nextPage = null) {
        return window.unifiedCore?.searchManager?.performSearch(query, nextPage) || 
               SearchManager.fallbackPerformSearch(query, nextPage);
    }

    static initialize() {
        return window.unifiedCore?.searchManager?.initialize() || 
               SearchManager.fallbackInitialize();
    }

    // ✅ FALLBACK OPTIMIZADO
    static async fallbackPerformSearch(query, nextPage = null) {
        const searchResultsElement = document.getElementById('searchResults');
        if (!searchResultsElement) return;

        if (!nextPage) {
            searchResultsElement.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i><p>Buscando...</p></div>';
        }

        const PIPED_INSTANCES = window.CONFIG?.PIPED_INSTANCES || [
            "https://api.piped.private.coffee",
            "https://pipedapi.ducks.party"
        ];

        try {
            const searchResults = await SearchManager.tryMultipleInstances(PIPED_INSTANCES, query, nextPage);
            SearchManager.displaySearchResults(searchResults, !!nextPage);
        } catch (error) {
            SearchManager.handleSearchError(error, !!nextPage, query);
        }
    }

    static async tryMultipleInstances(instances, query, nextPage) {
        for (const instance of instances) {
            try {
                const url = new URL(`${instance}/search`);
                url.searchParams.set('q', query);
                url.searchParams.set('filter', 'videos');
                if (nextPage) url.searchParams.set('nextpage', nextPage);

                const response = await window.SharedUtils.fetchWithTimeout(url.toString(), {}, 15000);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Búsqueda exitosa en ${instance}`);
                    return data;
                }
            } catch (error) {
                console.warn(`⚠️ Fallo en ${instance}:`, error.message);
                continue;
            }
        }
        
        throw new Error('Todas las instancias fallaron');
    }

    static displaySearchResults(results, append = false) {
        const searchResultsElement = document.getElementById('searchResults');
        if (!searchResultsElement) return;
        
        if (!append) searchResultsElement.innerHTML = '';
        
        const items = results.items || results.relatedStreams || [];
        
        if (!items?.length) {
            if (!append) {
                searchResultsElement.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-search"></i>
                        <p>No se encontraron resultados</p>
                    </div>
                `;
            }
            return;
        }

        const fragment = document.createDocumentFragment();

        items.forEach(video => {
            const videoId = window.SharedUtils.extractVideoId(video);
            if (!videoId || (append && searchResultsElement.querySelector(`[data-video-id="${videoId}"]`))) {
                return;
            }

            const videoDiv = SearchManager.createVideoResultElement(video, videoId);
            fragment.appendChild(videoDiv);
        });

        searchResultsElement.appendChild(fragment);
        console.log(`✅ ${items.length} resultados mostrados`);
    }

    static createVideoResultElement(video, videoId) {
        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;

        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        const duration = window.SharedUtils.formatDuration(video.duration);
        const title = window.SharedUtils.escapeHtml(video.title || 'Título no disponible');
        const author = window.SharedUtils.escapeHtml(video.uploaderName || video.channelTitle || 'Desconocido');

        videoDiv.innerHTML = `
            <div class="thumbnail-container">
                <img src="${thumbnailUrl}" alt="${title}" class="thumbnail" loading="lazy">
                ${duration ? `<span class="duration">${duration}</span>` : ''}
            </div>
            <div class="video-details">
                <h3 class="video-title">${title}</h3>
                <p class="video-author">${author}</p>
                <button class="search-result-add-button" data-video-data='${JSON.stringify({
                    videoId,
                    title: video.title || 'Título no disponible',
                    thumbnail: thumbnailUrl,
                    duration: window.SharedUtils.parseDuration(video.duration),
                    channelTitle: author
                })}'>
                    <i class="fa-solid fa-arrow-right-to-line"></i>
                    <span class="add-text">Reproducir Después</span>
                </button>
            </div>
        `;
        
        return videoDiv;
    }

    static handleSearchError(error, isLoadMore, query) {
        console.error("❌ Error en búsqueda:", error);
        
        if (!isLoadMore) {
            const resultsDiv = document.getElementById('searchResults');
            if (resultsDiv) {
                resultsDiv.innerHTML = `
                    <div class="search-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error de búsqueda: ${error?.message || 'Instancias no disponibles'}</p>
                        <button onclick="SearchManager.performSearch('${query || ''}')" class="retry-search-btn">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                    </div>
                `;
            }
        } else {
            window.unifiedMessageManager?.show('Error cargando más resultados', 'error');
        }
    }

    static fallbackInitialize() {
        const searchResultsElement = document.getElementById('searchResults');
        if (searchResultsElement) {
            searchResultsElement.addEventListener('scroll', window.SharedUtils.debounce(() => {
                SearchManager.handleScroll();
            }, 100));
        }
    }

    static handleScroll() {
        const state = window.unifiedStateManager?.state?.search;
        if (!state || state.isLoadingMore || !state.nextPageContext) return;
        
        const container = document.getElementById('searchResults');
        if (!container) return;
        
        const { scrollTop, clientHeight, scrollHeight } = container;
        const bottomReached = scrollTop + clientHeight >= scrollHeight - 200;
        
        if (bottomReached) {
            SearchManager.performSearch(state.currentSearchQuery, state.nextPageContext);
        }
    }

    // ✅ TESTING OPTIMIZADO
    static async testPipedInstances() {
        const instances = window.CONFIG?.PIPED_INSTANCES || [];
        const testPromises = instances.map(async (instance) => {
            try {
                const startTime = Date.now();
                const response = await window.SharedUtils.fetchWithTimeout(`${instance}/trending`, { method: 'HEAD' }, 5000);
                
                return {
                    instance,
                    status: response.ok ? 'OK' : `HTTP ${response.status}`,
                    responseTime: `${Date.now() - startTime}ms`,
                    success: response.ok
                };
            } catch (error) {
                return {
                    instance,
                    status: error.message,
                    success: false
                };
            }
        });
        
        const results = await Promise.allSettled(testPromises);
        const finalResults = results.map(r => r.status === 'fulfilled' ? r.value : { success: false });
        
        console.table(finalResults);
        
        const working = finalResults.filter(r => r.success).length;
        window.unifiedMessageManager?.show(`${working}/${instances.length} instancias funcionando`, working > 0 ? 'success' : 'error');
        
        return finalResults;
    }
}

// ===== PLAYBACKCONTROLLER OPTIMIZADO =====
export class PlaybackController {
    
    // ✅ DELEGACIÓN COMPLETA AL CORE
    static playFirstVideo() {
        return window.unifiedCore?.playbackController?.playFirstVideo() || 
               PlaybackController.fallbackPlayFirst();
    }
    
    static async playNextVideo() {
        return window.unifiedCore?.playbackController?.playNextVideo() || 
               PlaybackController.fallbackPlayNext();
    }
    
    static startMonitoring() {
        return window.unifiedCore?.playbackController?.startMonitoring() || 
               PlaybackController.fallbackStartMonitoring();
    }

    static stopMonitoring() {
        return window.unifiedCore?.playbackController?.stopMonitoring() || 
               PlaybackController.fallbackStopMonitoring();
    }

    // ✅ FALLBACKS SIMPLIFICADOS
    static fallbackPlayFirst() {
        const state = window.unifiedStateManager?.state;
        if (!state?.app.playersInitialized) {
            window.unifiedMessageManager?.show('Reproductores no están listos', 'error');
            return;
        }

        const flatList = window.PlaylistManager.getFlattenedPlaylist();
        if (flatList.length === 0) {
            window.unifiedMessageManager?.show('No hay videos en la cola', 'warning');
            return;
        }

        const firstVideo = flatList[0];
        
        try {
            // Update state
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', 0);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', firstVideo.videoId);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', firstVideo.sourcePlaylistId);
            window.unifiedStateManager.set('app.reproduccionIniciada', true);
            window.unifiedStateManager.set('app.currentPlayer', 1);

            // Setup players
            if (state.app.player2) {
                try { state.app.player2.stopVideo(); } catch(e) {}
            }
            
            state.app.player1.loadVideoById(firstVideo.videoId);
            state.app.player1.setVolume(100);

            // UI updates
            document.getElementById('player1')?.classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2')?.classList.add('hidden');

            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-pause"></i>';
                playButton.disabled = false;
            }

            PlaybackController.fallbackStartMonitoring();
            console.log('✅ Reproducción iniciada (fallback)');
            
        } catch (error) {
            console.error('❌ Error en fallback playFirstVideo:', error);
            window.unifiedMessageManager?.show('Error iniciando reproducción', 'error');
        }
    }

    static async fallbackPlayNext() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const currentFlatIndex = state.playlist.currentPlayingInfo.flattenedIndex;
        const flatList = window.PlaylistManager.getFlattenedPlaylist();

        if (flatList.length === 0) {
            PlaybackController.handleEmptyPlaylist();
            return;
        }

        const nextIndex = currentFlatIndex + 1;
        if (nextIndex >= flatList.length) {
            PlaybackController.handleEndOfPlaylist();
            return;
        }

        try {
            const nextVideo = flatList[nextIndex];
            if (!nextVideo?.videoId) {
                throw new Error(`Video siguiente inválido`);
            }

            // Update state
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', nextIndex);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', nextVideo.videoId);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', nextVideo.sourcePlaylistId);

            // Simple player switch (without complex crossfade)
            const currentPlayerNum = state.app.currentPlayer;
            const nextPlayerNum = currentPlayerNum === 1 ? 2 : 1;
            const nextPlayer = nextPlayerNum === 1 ? state.app.player1 : state.app.player2;

            if (nextPlayer) {
                nextPlayer.cueVideoById(nextVideo.videoId);
                setTimeout(() => {
                    nextPlayer.playVideo();
                    window.unifiedStateManager.set('app.currentPlayer', nextPlayerNum);
                    window.UIManager?.updatePlaylistsUI();
                }, 500);
            }

        } catch (error) {
            console.error("❌ Error en fallback playNext:", error);
            window.unifiedMessageManager?.show(`Error cambiando video`, 'error');
        }
    }

    static fallbackStartMonitoring() {
        const state = window.unifiedStateManager?.state;
        if (!state || state.app.monitorInterval) return;

        const interval = setInterval(() => {
            if (window.SponsorBlockManager?.checkAndSkipSegment) {
                const activePlayer = (state.app.currentPlayer === 1) ? state.app.player1 : state.app.player2;
                if (activePlayer) {
                    window.SponsorBlockManager.checkAndSkipSegment(activePlayer);
                }
            }
        }, 300);

        window.unifiedStateManager.set('app.monitorInterval', interval);
    }

    static fallbackStopMonitoring() {
        const interval = window.unifiedStateManager?.state?.app?.monitorInterval;
        if (interval) {
            clearInterval(interval);
            window.unifiedStateManager.set('app.monitorInterval', null);
        }
    }

    static handleEmptyPlaylist() {
        PlaybackController.stopMonitoring();
        
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('app.reproduccionIniciada', false);
            window.unifiedStateManager.set('app.isTransitioning', false);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
        }

        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.disabled = true;
        }

        window.UIManager?.updatePlaylistsUI();
        window.unifiedMessageManager?.show("No hay videos en la cola", 'warning');
    }

    static handleEndOfPlaylist() {
        const repeat = confirm('Fin de la lista. ¿Repetir desde el principio?');
        
        if (repeat) {
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            }
            PlaybackController.playFirstVideo();
        } else {
            PlaybackController.stopMonitoring();
            window.unifiedMessageManager?.show("Playlist finalizada. ¡Gracias! 🎵", 'info');
            
            const state = window.unifiedStateManager?.state;
            if (state) {
                try {
                    if (state.app.player1) state.app.player1.stopVideo();
                    if (state.app.player2) state.app.player2.stopVideo();
                } catch(e) {}
                
                window.unifiedStateManager.set('app.reproduccionIniciada', false);
            }
            
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-play"></i>';
                playButton.disabled = window.PlaylistManager.getFlattenedPlaylist().length === 0;
            }
        }
        
        window.unifiedStateManager?.set('app.isTransitioning', false);
    }

    // ✅ UTILIDADES OPTIMIZADAS
    static getDebugInfo() {
        const state = window.unifiedStateManager?.state;
        if (!state) return { error: 'Estado no disponible' };
        
        return {
            reproduccionIniciada: state.app.reproduccionIniciada,
            currentPlayer: state.app.currentPlayer,
            isTransitioning: state.app.isTransitioning,
            crossfadeInProgress: state.app.crossfadeInProgress,
            currentPlayingInfo: state.playlist.currentPlayingInfo,
            flatListCount: window.PlaylistManager.getFlattenedPlaylist().length,
            playersInitialized: state.app.playersInitialized,
            monitoringActive: !!state.app.monitorInterval
        };
    }
}

// ===== SPONSORBLOCK OPTIMIZADO =====
export class SponsorBlockManager {
    
    static checkAndSkipSegment(player, forceCheck = false) {
        const currentTime = player.getCurrentTime();
        const videoId = player.getVideoData()?.video_id;

        if (!videoId || isNaN(currentTime)) return;

        const playerState = player.getPlayerState();
        if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING && !forceCheck) {
            return;
        }

        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const sponsorState = state.sponsorBlock;

        // Handle video change
        if (videoId !== sponsorState.lastSeekVideoId) {
            window.unifiedStateManager.set('sponsorBlock.lastSeekEndTime', -1);
            window.unifiedStateManager.set('sponsorBlock.lastSeekVideoId', videoId);
        } else if (sponsorState.lastSeekEndTime !== -1) {
            if (currentTime >= sponsorState.lastSeekEndTime + 0.2) {
                window.unifiedStateManager.set('sponsorBlock.lastSeekEndTime', -1);
            } else {
                return; // Still in cooldown
            }
        }

        const segments = sponsorState.segmentosCache[videoId];

        if (segments === undefined) {
            SponsorBlockManager.obtenerSegmentosSponsorBlock(videoId);
            return;
        }

        if (!Array.isArray(segments) || segments.length === 0) return;

        // Find segment to skip
        const segmentToSkip = segments.find(segment => {
            const { startTime, endTime } = segment;
            const isWithinSegment = currentTime >= startTime && currentTime < endTime;
            const isAfterLastSeek = sponsorState.lastSeekEndTime === -1 || endTime > sponsorState.lastSeekEndTime;
            return isWithinSegment && isAfterLastSeek;
        });

        if (segmentToSkip) {
            const { endTime, category } = segmentToSkip;

            if (category === 'outro') {
                const timeRemaining = endTime - currentTime;
                
                if (timeRemaining <= window.CONFIG.CROSSFADE_DURATION + 0.5 && 
                    timeRemaining > 0 && 
                    !state.app.isTransitioning && 
                    !state.app.hasOutroCrossfadeStarted) {
                    
                    console.log(`SponsorBlock OUTRO: Disparando crossfade`);
                    window.unifiedStateManager.set('app.hasOutroCrossfadeStarted', true);
                    
                    if (window.PlaybackController?.playNextVideo) {
                        window.PlaybackController.playNextVideo();
                    }
                }
            } else {
                // Normal skip
                console.log(`SponsorBlock SKIP: Saltando segmento (${category})`);
                try {
                    player.seekTo(endTime, true);
                    window.unifiedStateManager.set('sponsorBlock.lastSeekEndTime', endTime);
                } catch (e) {
                    console.error("Error en seekTo:", e);
                }
            }
        }
    }

    static async obtenerSegmentosSponsorBlock(videoId) {
        const state = window.unifiedStateManager?.state;
        if (!state || state.sponsorBlock.segmentosCache[videoId]) return;

        // Mark as fetching
        const newCache = { ...state.sponsorBlock.segmentosCache };
        newCache[videoId] = 'fetching';
        window.unifiedStateManager.set('sponsorBlock.segmentosCache', newCache);

        const apiUrl = `/api/segments/${videoId}`;

        try {
            const response = await fetch(apiUrl, {
                headers: { 'X-UserID': window.CONFIG.SPONSORBLOCK_USER_ID }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error('Respuesta inválida');
            }

            // Validate and sort segments
            const validSegments = data
                .filter(segment => {
                    const start = parseFloat(segment.startTime);
                    const end = parseFloat(segment.endTime);
                    return !isNaN(start) && !isNaN(end) && start >= 0 && end > start;
                })
                .sort((a, b) => a.startTime - b.startTime);

            // Update cache
            const finalCache = { ...window.unifiedStateManager.state.sponsorBlock.segmentosCache };
            finalCache[videoId] = validSegments;
            window.unifiedStateManager.set('sponsorBlock.segmentosCache', finalCache);

            console.log(`SponsorBlock: ${validSegments.length} segmentos válidos para ${videoId}`);
            return validSegments;

        } catch (error) {
            console.error(`SponsorBlock Error para ${videoId}:`, error);
            
            // Cache null to avoid repeated requests
            const errorCache = { ...window.unifiedStateManager.state.sponsorBlock.segmentosCache };
            errorCache[videoId] = null;
            window.unifiedStateManager.set('sponsorBlock.segmentosCache', errorCache);
            
            return null;
        }
    }

    static clearCache(videoId = null) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        if (videoId) {
            const newCache = { ...state.sponsorBlock.segmentosCache };
            delete newCache[videoId];
            window.unifiedStateManager.set('sponsorBlock.segmentosCache', newCache);
        } else {
            // Clear all
            window.unifiedStateManager.set('sponsorBlock.segmentosCache', {});
            window.unifiedStateManager.set('sponsorBlock.lastSeekEndTime', -1);
            window.unifiedStateManager.set('sponsorBlock.lastSeekVideoId', null);
        }
    }
}

// ===== AUDIO MANAGER OPTIMIZADO =====
export class AudioManager {
    static setVolume(player, volume) {
        if (window.unifiedYouTubeManager?.safeSetVolume) {
            return window.unifiedYouTubeManager.safeSetVolume(player, volume);
        }
        
        // Fallback
        try {
            if (player && typeof player.setVolume === 'function') {
                player.setVolume(Math.max(0, Math.min(100, volume)));
            }
        } catch(e) {
            console.warn("Error configurando volumen:", e);
        }
    }
    
    static fadeVolume(player, fromVol, toVol, duration = 1000) {
        if (window.unifiedYouTubeManager?.performCrossfade && fromVol > toVol) {
            // Use unified crossfade system
            return;
        }
        
        // Simple volume fade fallback
        const steps = 20;
        const stepDuration = duration / steps;
        const volumeStep = (toVol - fromVol) / steps;
        
        let currentStep = 0;
        const interval = setInterval(() => {
            currentStep++;
            const newVolume = fromVol + (volumeStep * currentStep);
            
            AudioManager.setVolume(player, Math.round(newVolume));
            
            if (currentStep >= steps) {
                clearInterval(interval);
                AudioManager.setVolume(player, toVol);
            }
        }, stepDuration);
    }
    
    static syncVolumes() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        const { player1, player2, currentPlayer } = state.app;
        
        if (player1 && player2) {
            const activePlayer = currentPlayer === 1 ? player1 : player2;
            const inactivePlayer = currentPlayer === 1 ? player2 : player1;
            
            try {
                const activeVolume = activePlayer.getVolume();
                if (!isNaN(activeVolume)) {
                    AudioManager.setVolume(inactivePlayer, 0);
                    AudioManager.setVolume(activePlayer, activeVolume);
                }
            } catch(e) {
                console.warn("Error sincronizando volúmenes:", e);
            }
        }
    }
}

// ===== EVENT LISTENERS OPTIMIZADOS =====
function setupOptimizedEventListeners() {
    console.log('🎧 Configurando event listeners optimizados...');
    
    // Consolidated event listener for playlists
    document.addEventListener('playlistsFetched', (event) => {
        console.log('📚 Playlists obtenidas:', event.detail?.length || 0);
        if (event.detail && Array.isArray(event.detail)) {
            window.PlaylistManager.addYouTubeLibraryPlaylists(event.detail);
        }
    });

    document.addEventListener('userLoggedOut', () => {
        console.log('👤 Usuario deslogueado');
        window.PlaylistManager.clearYouTubeLibraryPlaylists();
    });

    // Optimized player state listener
    document.addEventListener('unifiedPlayerStateChanged', (event) => {
        const { playerNum, state: playerState } = event.detail;
        
        // Update play buttons
        const playButtons = document.querySelectorAll('#botonPlay, #miniPlayBtn');
        playButtons.forEach(button => {
            button.innerHTML = playerState === 1 ? 
                '<i class="fas fa-pause"></i>' : 
                '<i class="fas fa-play"></i>';
        });
    });

    // System ready listener
    window.addEventListener('ytcrossmix:unified:ready', function(event) {
        console.log('🎉 Sistema listo:', event.detail);
        
        // Enable debug in development
        if (window.location.hostname === 'localhost') {
            const debugControls = document.getElementById('unifiedControls');
            if (debugControls) debugControls.style.display = 'flex';
        }
        
        // Setup periodic updates (optimized)
        setInterval(() => {
            const debugVisible = document.querySelector('.unified-debug-panel.show, .unified-state-debug.show');
            if (debugVisible && window.unifiedHelpers?.updateDebugPanels) {
                window.unifiedHelpers.updateDebugPanels();
            }
        }, 5000); // Reduced frequency
    });

    console.log('✅ Event listeners optimizados configurados');
}

// ===== SETUP AUTOMÁTICO OPTIMIZADO =====
document.addEventListener('DOMContentLoaded', () => {
    setupOptimizedEventListeners();
    
    // Verify core availability with timeout
    const coreCheck = setInterval(() => {
        if (window.unifiedCore?.initialized) {
            console.log('✅ Managers: Core unificado disponible');
            clearInterval(coreCheck);
        }
    }, 100);
    
    setTimeout(() => {
        clearInterval(coreCheck);
        if (!window.unifiedCore?.initialized) {
            console.warn('⚠️ Managers: Timeout esperando core');
        }
    }, 10000);
});

// ===== REFERENCIAS GLOBALES OPTIMIZADAS =====
if (typeof window !== 'undefined') {
    // Assign to window with conflict prevention
    window.OptimizedManagers = {
        PlaylistManager,
        SearchManager, 
        PlaybackController,
        SponsorBlockManager,
        AudioManager
    };
    
    // Consolidated debug object
    window.ManagersDebug = {      
        // Search debugging  
        testSearch: (query = 'test music') => SearchManager.performSearch(query),
        testInstances: () => SearchManager.testPipedInstances(),
        
        // Playback debugging
        playFirst: () => PlaybackController.playFirstVideo(),
        playNext: () => PlaybackController.playNextVideo(),
        getPlaybackInfo: () => PlaybackController.getDebugInfo(),
        
        // SponsorBlock debugging
        clearSBCache: () => SponsorBlockManager.clearCache(),
        
        // Audio debugging
        syncVolumes: () => AudioManager.syncVolumes(),
        
        // Combined info
        getAllInfo: () => ({
            playlist: PlaylistManager.getQueueInfo(),
            playback: PlaybackController.getDebugInfo(),
            core: window.unifiedCore?.getDebugInfo(),
            timestamp: Date.now()
        })
    };

    // Evitar conflictos con el core
if (!window.PlaylistManager && window.unifiedCore?.playlistManager) {
    window.PlaylistManager = {
        getFlattenedPlaylist: () => window.unifiedCore.playlistManager.getFlattenedPlaylist(),
        addVideoToManualPlaylist: (data) => window.unifiedCore.playlistManager.addVideoToManualPlaylist(data),
        checkAndEnablePlayButton: () => window.unifiedCore.playlistManager.checkAndEnablePlayButton(),
        clearQueue: () => window.unifiedCore.playlistManager.clearQueue(),
        // ... otros métodos necesarios
    };
}
}

// ===== VERIFICACIÓN FINAL DEL SISTEMA =====
class FinalSystemVerification {
    static verify() {
        console.log('🔍 Verificación final del sistema...');
        
        const results = {
            coreSystem: {
                unifiedCore: !!window.unifiedCore,
                initialized: window.unifiedCore?.initialized || false,
                managers: {
                    state: !!window.unifiedStateManager,
                    youtube: !!window.unifiedYouTubeManager,
                    playlist: !!window.unifiedPlaylistManager,
                    search: !!window.unifiedSearchManager,
                    auth: !!window.unifiedAuthManager,
                    playback: !!window.unifiedPlaybackController
                }
            },
            supportSystems: {
                messages: !!window.unifiedMessageManager,
                loading: !!window.unifiedLoadingManager,
                notifications: !!window.notificationSystem
            },
            uiSystems: {
                uiManager: !!window.UIManager,
                legacyManagers: {
                    playlist: !!window.PlaylistManager,
                    search: !!window.SearchManager,
                    playback: !!window.PlaybackController
                }
            },
            criticalElements: {
                players: {
                    player1: !!document.getElementById('player1'),
                    player2: !!document.getElementById('player2')
                },
                containers: {
                    searchResults: !!document.getElementById('searchResults'),
                    playlistsGrid: !!document.getElementById('playlistsGrid'),
                    playlistContainer: !!document.getElementById('playlistContainer'),
                    queueSection: !!document.getElementById('queueSection')
                },
                controls: {
                    playButton: !!document.getElementById('botonPlay'),
                    nextButton: !!document.getElementById('botonNext'),
                    queueButton: !!document.getElementById('queueButton')
                }
            },
            apis: {
                youtubeAPI: !!(window.YT && window.YT.Player),
                googleAPI: !!window.gapi,
                googleAuth: !!window.google?.accounts
            }
        };
        
        // Calcular puntuación de salud
        const flattenedResults = FinalSystemVerification.flattenResults(results);
        const totalChecks = flattenedResults.length;
        const passedChecks = flattenedResults.filter(r => r.status).length;
        const healthScore = Math.round((passedChecks / totalChecks) * 100);
        
        console.log('📊 Resultados de verificación:');
        console.table(flattenedResults.filter(r => !r.status));
        
        const healthStatus = healthScore >= 90 ? '🟢 EXCELENTE' : 
                           healthScore >= 75 ? '🟡 BUENO' : 
                           healthScore >= 60 ? '🟠 REGULAR' : '🔴 CRÍTICO';
        
        console.log(`📈 Estado del sistema: ${healthScore}% ${healthStatus}`);
        
        if (window.unifiedMessageManager && healthScore >= 75) {
            window.unifiedMessageManager.show(
                `Sistema listo: ${healthScore}% funcional`, 
                healthScore >= 90 ? 'success' : 'info', 
                3000
            );
        }
        
        return {
            results,
            healthScore,
            status: healthScore >= 75 ? 'ready' : 'issues'
        };
    }
    
    static flattenResults(obj, prefix = '') {
        let flattened = [];
        
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (typeof value === 'boolean') {
                flattened.push({ component: newKey, status: value });
            } else if (typeof value === 'object' && value !== null) {
                flattened.push(...FinalSystemVerification.flattenResults(value, newKey));
            }
        }
        
        return flattened;
    }
    
    static generateReport() {
        const verification = FinalSystemVerification.verify();
        
        const report = {
            timestamp: new Date().toISOString(),
            healthScore: verification.healthScore,
            status: verification.status,
            summary: {
                coreReady: verification.results.coreSystem.initialized,
                managersReady: Object.values(verification.results.coreSystem.managers).filter(Boolean).length,
                elementsReady: Object.values(verification.results.criticalElements).flat().map(obj => 
                    Object.values(obj)).flat().filter(Boolean).length,
                apisReady: Object.values(verification.results.apis).filter(Boolean).length
            },
            recommendations: FinalSystemVerification.generateRecommendations(verification.results)
        };
        
        console.log('📋 Reporte del sistema:', report);
        return report;
    }
    
    static generateRecommendations(results) {
        const recommendations = [];
        
        if (!results.coreSystem.initialized) {
            recommendations.push('Reinicializar el sistema core');
        }
        
        if (!results.supportSystems.messages) {
            recommendations.push('Cargar sistema de mensajes');
        }
        
        if (!results.apis.youtubeAPI) {
            recommendations.push('Verificar carga de YouTube API');
        }
        
        const missingElements = Object.entries(results.criticalElements)
            .filter(([_, group]) => Object.values(group).some(exists => !exists))
            .map(([group]) => group);
        
        if (missingElements.length > 0) {
            recommendations.push(`Crear elementos faltantes: ${missingElements.join(', ')}`);
        }
        
        return recommendations;
    }
}

// Auto-ejecutar verificación final
window.addEventListener('load', () => {
    setTimeout(() => {
        const verification = FinalSystemVerification.verify();
        
        // Si hay problemas críticos, mostrar herramientas de reparación
        if (verification.healthScore < 75) {
            console.warn('⚠️ Sistema con problemas, activando herramientas de reparación...');
            
            // Crear botón de reparación
            const repairBtn = document.createElement('button');
            repairBtn.textContent = '🔧 Reparar Sistema';
            repairBtn.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 10000;
                background: #ff9800; color: white; border: none; padding: 12px 16px;
                border-radius: 6px; font-size: 14px; cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            
            repairBtn.onclick = () => {
                SystemCompatibilityChecker.checkAndRepair();
                location.reload();
            };
            
            document.body.appendChild(repairBtn);
            
            // Auto-remover después de 30 segundos
            setTimeout(() => {
                if (repairBtn.parentNode) {
                    repairBtn.remove();
                }
            }, 30000);
        }
    }, 5000);
});

// Exponer herramientas de verificación
window.SystemVerification = {
    verify: FinalSystemVerification.verify,
    generateReport: FinalSystemVerification.generateReport,
    repair: SystemCompatibilityChecker.checkAndRepair
};
console.log('📦 Módulos unificados: Playlist, Search, Playback, SponsorBlock, Audio');
