console.log('🎵 Cargando gestor de playlists...');

// =============================================
// CLASE PRINCIPAL PARA GESTIÓN DE PLAYLISTS
// =============================================
class PlaylistManager {
    constructor(unifiedCore) {
        this.core = unifiedCore;
        this.playlistsData = unifiedCore.playlistsData;
        this.lyricsSyncInterval = null; // Para el intervalo de sincronización
        this.currentLrc = [];           // Para guardar las líneas de [tiempo, texto]
        this.lyricsProvider = 'lrclib'; // Proveedor por defecto
        this.loadPersistentData();
    }

    // =============================================
    // PERSISTENCIA DE DATOS
    // =============================================
    
    async loadPersistentData() {
        console.log('📂 Cargando datos persistentes...');
        
        // Esperar un momento para que las funciones de core.js se carguen
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Cargar playlists persistentes
        if (typeof window.loadPlaylistsDataPersistent === 'function') {
            const persistentPlaylists = window.loadPlaylistsDataPersistent();
            if (persistentPlaylists && Array.isArray(persistentPlaylists)) {
                // Limpiar array existente y agregar datos cargados
                this.playlistsData.splice(0, this.playlistsData.length);
                this.playlistsData.push(...persistentPlaylists);
                
                // Actualizar también la referencia en core si existe
                if (this.core && this.core.playlistsData) {
                    this.core.playlistsData = this.playlistsData;
                }
                
                console.log(`✅ ${persistentPlaylists.length} playlists cargadas desde almacenamiento`);
            }
        } else {
            console.log('⚠️ loadPlaylistsDataPersistent no disponible aún, usando datos vacíos');
        }
        
        // Verificar y cargar playlists de YouTube guardadas en auth.js
        setTimeout(() => {
            if (typeof getStoredPlaylists === 'function') {
                const youtubeLibraryPlaylists = getStoredPlaylists();
                if (youtubeLibraryPlaylists && youtubeLibraryPlaylists.length > 0) {
                    console.log('🎵 Restaurando playlists de YouTube Library guardadas');
                    const event = new CustomEvent('playlistsFetched', {
                        detail: youtubeLibraryPlaylists
                    });
                    document.dispatchEvent(event);
                }
            }
        }, 2000);

        // Cargar cola persistente
        if (typeof window.loadQueuePersistent === 'function') {
            const persistentQueue = window.loadQueuePersistent();
            if (persistentQueue) {
                // Asegurar que existe la playlist de cola
                let queuePlaylist = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);
                if (!queuePlaylist) {
                    queuePlaylist = {
                        id: 'queue',
                        name: 'Cola de Reproducción',
                        thumbnailUrl: './electronic.ico',
                        videos: [],
                        isExpanded: true,
                        isQueue: true
                    };
                    this.playlistsData.unshift(queuePlaylist);
                }
                
                // Cargar videos de la cola
                queuePlaylist.videos = persistentQueue.videos || [];
                
                // Restaurar estado de reproducción si el core está disponible
                if (this.core && persistentQueue.currentPlayingInfo) {
                    this.core.currentPlayingInfo = persistentQueue.currentPlayingInfo;
                    // También actualizar la variable global
                    if (typeof window.currentPlayingInfo !== 'undefined') {
                        window.currentPlayingInfo = persistentQueue.currentPlayingInfo;
                    }
                }
                
                console.log(`✅ Cola cargada: ${persistentQueue.videos?.length || 0} videos`);
            }
        } else {
            console.log('⚠️ loadQueuePersistent no disponible aún');
        }
    }

    // =============================================
    // GESTIÓN DE VIDEOS EN COLA
    // =============================================
    
    /**
     * Añadir video a la cola
     */
    async addVideoToQueue(videoData) {
        // VALIDACIÓN CRÍTICA
        if (!videoData || !videoData.videoId) {
            console.error('❌ addVideoToQueue: videoData o videoId inválido:', videoData);
            this.core?.showMessage('Error: Video inválido', 'error');
            return;
        }

        if (videoData.videoId === 'undefined' || videoData.videoId === undefined) {
            console.error('❌ addVideoToQueue: videoId es undefined');
            this.core?.showMessage('Error: ID de video no válido', 'error');
            return;
        }

        let queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
        
        if (!queuePlaylist) {
            queuePlaylist = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true,
                isQueue: true
            };
            this.playlistsData.unshift(queuePlaylist);
        }

        // Verificar duplicados
        const isDuplicate = queuePlaylist.videos.some(v => v.videoId === videoData.videoId);
        if (isDuplicate) {
            this.core?.showMessage(`"${videoData.title}" ya está en la cola`, 'warning');
            return;
        }

        // Obtener duración si no la tiene
        let duration = videoData.duration || 0;
        
        if (!duration && videoData.videoId && window.isAuthorized) {
            try {
                const durations = await this.core?.getBatchVideoDurations([videoData.videoId]);
                duration = durations?.[videoData.videoId] || 0;
            } catch (error) {
                console.warn('No se pudo obtener duración para', videoData.videoId);
            }
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || './electronic.ico',
            duration: duration,
            uploaderName: videoData.uploaderName || videoData.author || 'Desconocido',
            author: videoData.author || videoData.uploaderName || 'Desconocido',
            sourcePlaylistId: 'queue'
        };

        console.log('🎵 Video a añadir:', {
            videoId: videoObject.videoId,
            title: videoObject.title.substring(0, 50),
            hasValidId: !!videoObject.videoId && videoObject.videoId !== 'undefined'
        });

        queuePlaylist.videos.push(videoObject);
        this.core?.showMessage(`Añadido a cola: ${videoObject.title}`, 'success');
        
        if (this.updatePlaylistsUI) {
            this.updatePlaylistsUI();
            } else if (this.core?.updatePlaylistsUI) {
                this.core.updatePlaylistsUI();
            }
        this.core?.enablePlayButton();
        
        console.log(`🎵 Video añadido exitosamente. Total: ${queuePlaylist.videos.length} videos`);
        
        // Guardar cambios
        setTimeout(() => {
            if (typeof window.saveAllData === 'function') {
                window.saveAllData();
            }
        }, 500);
    }

    /**
     * Añadir video después del video actual
     */
    async addVideoToQueueAfterCurrent(videoData) {
        // VALIDACIÓN CRÍTICA
        if (!videoData || !videoData.videoId) {
            console.error('❌ addVideoToQueueAfterCurrent: videoData o videoId inválido:', videoData);
            this.core?.showMessage('Error: Video inválido', 'error');
            return;
        }

        if (videoData.videoId === 'undefined' || videoData.videoId === undefined) {
            console.error('❌ addVideoToQueueAfterCurrent: videoId es undefined');
            this.core?.showMessage('Error: ID de video no válido', 'error');
            return;
        }

        let queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
        
        if (!queuePlaylist) {
            queuePlaylist = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true,
                isQueue: true
            };
            this.playlistsData.unshift(queuePlaylist);
        }

        // Verificar duplicados
        const isDuplicate = queuePlaylist.videos.some(v => v.videoId === videoData.videoId);
        if (isDuplicate) {
            this.core?.showMessage(`"${videoData.title}" ya está en la cola`, 'warning');
            return;
        }

        // Obtener duración si no la tiene
        let duration = videoData.duration || 0;
        
        if (!duration && videoData.videoId && window.isAuthorized) {
            try {
                const durations = await this.core?.getBatchVideoDurations([videoData.videoId]);
                duration = durations?.[videoData.videoId] || 0;
            } catch (error) {
                console.warn('No se pudo obtener duración para', videoData.videoId);
            }
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || './electronic.ico',
            duration: duration,
            uploaderName: videoData.uploaderName || videoData.author || 'Desconocido',
            author: videoData.author || videoData.uploaderName || 'Desconocido',
            sourcePlaylistId: 'queue'
        };

        // INSERTAR DESPUÉS DEL VIDEO ACTUAL
        const currentIndex = window.currentPlayingInfo?.flattenedIndex || -1;
        
        if (currentIndex >= 0 && currentIndex < queuePlaylist.videos.length) {
            queuePlaylist.videos.splice(currentIndex + 1, 0, videoObject);
            this.core?.showMessage(`Añadido después de la canción actual: ${videoObject.title}`, 'success');
            console.log(`🎵 Video insertado en posición ${currentIndex + 1}`);
        } else {
            queuePlaylist.videos.push(videoObject);
            this.core?.showMessage(`Añadido a cola: ${videoObject.title}`, 'success');
        }
        
        this.updatePlaylistsUI();
        this.core?.enablePlayButton();
        
        console.log(`🎵 Video añadido exitosamente. Total: ${queuePlaylist.videos.length} videos`);
        
        // Guardar cambios
        setTimeout(() => {
            if (typeof window.saveAllData === 'function') {
                window.saveAllData();
            }
        }, 500);
    }
    
/**
 * Cargar videos de una playlist de YouTube
 */
async loadPlaylistVideos(playlistId) {
    console.log(`📥 Cargando videos de playlist: ${playlistId}`);
    
    const playlist = this.playlistsData.find(p => p.id === playlistId);
    if (!playlist) {
        console.error(`❌ Playlist ${playlistId} no encontrada`);
        return false;
    }
    
    // Si ya está cargada, no recargar
    if (playlist.isLoaded && playlist.videos.length > 0) {
        console.log(`✅ Playlist ya cargada con ${playlist.videos.length} videos`);
        return true;
    }
    
    try {
        // Verificar que gapi esté disponible
        if (!window.gapi?.client?.youtube) {
            console.error('❌ Google API no está disponible');
            this.core?.showMessage('Error: API de YouTube no disponible', 'error');
            return false;
        }
        
        this.core?.showMessage('Cargando videos de la playlist...', 'info');
        
        let allVideos = [];
        let nextPageToken = null;
        
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                part: ['snippet', 'contentDetails'],
                playlistId: playlistId,
                maxResults: 50,
                pageToken: nextPageToken
            });
            
            if (response.result.items) {
                const videos = response.result.items.map(item => ({
                    videoId: item.contentDetails?.videoId,
                    title: item.snippet?.title || 'Sin título',
                    thumbnail: item.snippet?.thumbnails?.high?.url || 
                              item.snippet?.thumbnails?.default?.url || 
                              './electronic.ico',
                    duration: 0, // Se puede obtener después con batch
                    uploaderName: item.snippet?.videoOwnerChannelTitle || 'YouTube',
                    author: item.snippet?.videoOwnerChannelTitle || 'YouTube',
                    sourcePlaylistId: playlistId
                })).filter(v => v.videoId); // Filtrar videos sin ID válido
                
                allVideos.push(...videos);
            }
            
            nextPageToken = response.result.nextPageToken;
            
        } while (nextPageToken);
        
        console.log(`✅ ${allVideos.length} videos cargados de la playlist`);
        
        // Actualizar playlist
        playlist.videos = allVideos;
        playlist.isLoaded = true;
        
        // Obtener duraciones en lote (opcional pero recomendado)
        if (allVideos.length > 0 && this.core?.getBatchVideoDurations) {
            try {
                const videoIds = allVideos.map(v => v.videoId);
                const durations = await this.core.getBatchVideoDurations(videoIds);
                
                // Actualizar duraciones
                allVideos.forEach(video => {
                    if (durations[video.videoId]) {
                        video.duration = durations[video.videoId];
                    }
                });
                
                console.log(`✅ Duraciones actualizadas para ${Object.keys(durations).length} videos`);
            } catch (durationError) {
                console.warn('⚠️ No se pudieron obtener duraciones:', durationError);
            }
        }
        
        this.core?.showMessage(`${allVideos.length} videos cargados`, 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Error cargando videos de playlist:', error);
        this.core?.showMessage('Error cargando videos de la playlist', 'error');
        return false;
    }
}
    
    /**
     * Eliminar video de la cola
     */
removeVideoFromQueue(videoId) {
    console.log(`🗑️ removeVideoFromQueue INICIADO: ${videoId}`);
    
    // VALIDACIÓN CRÍTICA
    if (!videoId || videoId === 'undefined' || videoId === 'null') {
        console.error('❌ videoId inválido para eliminar:', videoId);
        this.core?.showMessage('Error: ID de video inválido', 'error');
        return false;
    }
    
    // Obtener cola
    const queuePlaylist = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);
    if (!queuePlaylist) {
        console.error('❌ No se encontró playlist de cola');
        this.core?.showMessage('Error: Cola no encontrada', 'error');
        return false;
    }
    
    // Buscar índice del video
    const videoIndex = queuePlaylist.videos.findIndex(v => v.videoId === videoId);
    
    if (videoIndex === -1) {
        console.error(`❌ Video ${videoId} no encontrado en cola`);
        this.core?.showMessage('Video no encontrado en la cola', 'error');
        return false;
    }
    
    const removedVideo = queuePlaylist.videos[videoIndex];
    const wasCurrentlyPlaying = window.currentPlayingInfo?.videoId === videoId;
    
    console.log(`📊 Eliminando video en índice ${videoIndex}:`, {
        title: removedVideo.title.substring(0, 30),
        wasPlaying: wasCurrentlyPlaying,
        currentIndex: window.currentPlayingInfo?.flattenedIndex,
        totalVideos: queuePlaylist.videos.length
    });
    
    // ELIMINAR EL VIDEO
    queuePlaylist.videos.splice(videoIndex, 1);
    
    console.log(`✅ Video eliminado físicamente de la cola`);
    console.log(`📊 Quedan ${queuePlaylist.videos.length} videos en cola`);
    
    // AJUSTAR ÍNDICE DE REPRODUCCIÓN
    if (wasCurrentlyPlaying) {
        console.log('🎵 El video eliminado estaba reproduciéndose');
        
        if (queuePlaylist.videos.length > 0) {
            // Si quedan videos, reproducir el siguiente
            let newIndex = videoIndex;
            if (newIndex >= queuePlaylist.videos.length) {
                newIndex = queuePlaylist.videos.length - 1;
            }
            
            if (window.currentPlayingInfo) {
                window.currentPlayingInfo.flattenedIndex = newIndex;
            }
            
            console.log(`▶️ Reproduciendo siguiente video en índice ${newIndex}`);
            
            // Reproducir el siguiente video
            setTimeout(() => {
                const nextVideo = queuePlaylist.videos[newIndex];
                if (nextVideo && this.core?.playVideoAtIndex) {
                    this.core.playVideoAtIndex(newIndex);
                }
            }, 200);
        } else {
            console.log('📭 Cola vacía después de eliminar');
            this.core?.handleEmptyPlaylist?.();
        }
    } else if (window.currentPlayingInfo && window.currentPlayingInfo.flattenedIndex > videoIndex) {
        // Ajustar índice si eliminamos un video anterior al actual
        window.currentPlayingInfo.flattenedIndex--;
        console.log(`🔢 Índice de reproducción ajustado a ${window.currentPlayingInfo.flattenedIndex}`);
    }
    
    // ACTUALIZAR UI INMEDIATAMENTE
    console.log('🔄 Actualizando UI...');
    this.updatePlaylistsUI();
    this.updateQueuePopup();
    this.core?.updateNowPlaying?.();
    
    // Guardar cambios
    setTimeout(() => {
        console.log('💾 Guardando cambios...');
        if (typeof window.saveAllData === 'function') {
            window.saveAllData();
        }
    }, 100);
    
    this.core?.showMessage(`Eliminado: ${removedVideo.title}`, 'success');
    
    console.log('✅ removeVideoFromQueue COMPLETADO');
    return true;
}
    // =============================================
// GESTIÓN DE TABS EN LA COLA
// =============================================
/**
 * Cambiar entre tabs de la cola
 */
switchQueueTab(tabName) {
    console.log(`🔄 Cambiando a tab: ${tabName}`);
    // Detener sincronización si salimos de 'lyrics'
        if (tabName !== 'lyrics' && this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
            this.lyricsSyncInterval = null;
        }
    // Actualizar botones de tabs
    document.querySelectorAll('.queue-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`.queue-tab[data-tab="${tabName}"]`)?.classList.add('active');
    
    // Actualizar contenido de tabs
    document.querySelectorAll('.queue-list-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelector(`[data-tab-content="${tabName}"]`)?.classList.add('active');
    
    // Cargar contenido específico del tab
    if (tabName === 'related') {
        this.loadRelatedVideos();
    } else if (tabName === 'lyrics') {
        this.loadLyrics();
    }
}

/**
 * Cargar videos relacionados
 */
async loadRelatedVideos() {
    const relatedList = document.getElementById('relatedVideosList');
    const currentVideo = this.core?.getFlattenedPlaylist()[this.core?.currentPlayingInfo?.flattenedIndex];

    // 1. Check for playing video
    if (!currentVideo || !currentVideo.videoId) {
        relatedList.innerHTML = `
            <p class="related-placeholder">Reproduce una canción para ver videos relacionados</p>
        `;
        return;
    }

    // 2. Show loading state
    relatedList.innerHTML = `
        <div class="related-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando videos relacionados...</p>
        </div>
    `;

    try {
        // 3. Call the updated youtube client
        if (!window.youtubeJSClient || typeof window.youtubeJSClient.getVideoInfo !== 'function') {
            throw new Error('YouTube client no está disponible.');
        }
        
        const videoInfo = await window.youtubeJSClient.getVideoInfo(currentVideo.videoId);

        // 4. Check for related streams
        if (!videoInfo || !videoInfo.relatedStreams || videoInfo.relatedStreams.length === 0) {
            throw new Error('No se encontraron videos relacionados.');
        }

        // 5. Render the videos
        relatedList.innerHTML = videoInfo.relatedStreams
            .filter(video => video.type === 'stream') // Asegurar que sean videos
            .slice(0, 15) // Limitar a 15 resultados
            .map(video => {
                // Extraer videoId de la URL (Piped lo da en 'url')
                const videoIdMatch = video.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                const videoId = videoIdMatch ? videoIdMatch[1] : null;
                if (!videoId) return ''; // Omitir si no hay ID

                const duration = this.core?.formatDuration(video.duration) || '';

                return `
                    <div class="related-video-item" data-video-id="${videoId}" title="${this.escapeHTML(video.title)}">
                        <img src="${video.thumbnail}" alt="Thumbnail" class="related-video-thumbnail" onerror="this.src='./electronic.ico';">
                        <div class="related-video-info">
                            <div class="related-video-title">${this.escapeHTML(video.title)}</div>
                            <div class="related-video-author">${this.escapeHTML(video.uploaderName)}</div>
                            <span class="related-video-duration">${duration}</span>
                        </div>
                        <button class="related-video-add" data-video-id="${videoId}" title="Añadir a cola">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                `;
            })
            .join('');
        
        // 6. Add event listeners to the new buttons
        this.setupRelatedVideosListeners();

    } catch (error) {
        console.error('❌ Error cargando relacionados:', error);
        relatedList.innerHTML = `
            <p class="related-error">Error cargando videos relacionados</p>
        `;
    }
}
/**
 * Actualiza el contenido de la pestaña activa cuando cambia la canción
 */
refreshActiveQueueTab() {
    const activeTab = document.querySelector('.queue-tab.active');
    if (!activeTab) return;

    const tabName = activeTab.dataset.tab;
    
    // ✅ CRÍTICO: Obtener el índice ACTUAL del video reproduciéndose
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? 
                        this.core?.currentPlayingInfo?.flattenedIndex ?? 
                        -1;
    
    console.log('🎵 refreshActiveQueueTab:', { 
        tabName, 
        currentIndex,
        videoId: window.currentPlayingInfo?.videoId 
    });
    
    // No recargar la pestaña 'next' (la cola)
    if (tabName === 'lyrics') {
        console.log('🎵 Canción cambió, recargando letras...');
        // ✅ Forzar recarga con el índice correcto
        this.loadLyrics();
    } else if (tabName === 'related') {
        console.log('🎵 Canción cambió, recargando relacionados...');
        this.loadRelatedVideos();
    }
}
    /**
     * Parsea un string de formato LRC [00:00.00]texto a un array de objetos
     */
    parseLRC(lrcText) {
        const lines = lrcText.split('\n');
        const lrcData = [];
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        
        for (const line of lines) {
            const match = line.match(timeRegex);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = parseInt(match[3].padEnd(3, '0'));
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = line.replace(timeRegex, '').trim();
                
                // Añadir solo si tiene texto (ignora líneas vacías)
                if (text) {
                    lrcData.push({ time, text });
                }
            }
        }
        return lrcData;
    }

    /**
     * ✅ NUEVA FUNCIÓN
     * Inicia el intervalo que revisa el tiempo de la canción
     */
    startLyricsSync() {
        if (this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
        }
        // Revisa 4 veces por segundo
        this.lyricsSyncInterval = setInterval(() => {
            this.syncLyricsLine();
        }, 250);
    }

    /**
     * Sincroniza la línea activa de la letra con el tiempo del video
     */
syncLyricsLine() {
    if (!this.core || !this.currentLrc || this.currentLrc.length === 0) {
        return;
    }

    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    if (!activePlayer || typeof activePlayer.getCurrentTime !== 'function') {
        return;
    }
    
    const currentTime = activePlayer.getCurrentTime();
    const container = document.getElementById('syncedLyricsContainer');
    if (!container) return;

    let activeLineIndex = -1;
    
    // Encontrar línea activa con adelanto de 0.3s
    for (let i = this.currentLrc.length - 1; i >= 0; i--) {
        if (currentTime >= (this.currentLrc[i].time - 0.3)) {
            activeLineIndex = i;
            break;
        }
    }

    const allLines = container.querySelectorAll('p');
    allLines.forEach((line, index) => {
        line.classList.remove('active');
        
        if (index === activeLineIndex) {
            line.classList.add('active');
            // Scroll suave al centro
            line.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
        }
    });
}
/**
 * Configurar listeners para los videos relacionados
 */
setupRelatedVideosListeners() {
    const relatedList = document.getElementById('relatedVideosList');
    if (!relatedList) return;

    relatedList.querySelectorAll('.related-video-item').forEach(item => {
        const videoId = item.dataset.videoId;
        if (!videoId) return;

        // Click en el item para reproducir (añadir y saltar)
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.related-video-add')) return; // No si se hizo click en el '+'

            const video = this.findRelatedVideoData(item);
            if (!video) return;

            await this.addVideoToQueue(video);
            setTimeout(() => {
                const flatList = this.core?.getFlattenedPlaylist();
                const index = flatList?.findIndex(v => v.videoId === video.videoId);
                if (index !== -1 && this.core) {
                    this.core.playVideoAtIndex(index);
                }
            }, 100);
        });

        // Click en el botón '+' para añadir a la cola
        const addBtn = item.querySelector('.related-video-add');
        addBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const video = this.findRelatedVideoData(item);
            if (!video) return;
            await this.addVideoToQueue(video);
        });
    });
}

/**
 * Helper para extraer datos del DOM de un item relacionado
 */
findRelatedVideoData(itemElement) {
    try {
        const videoId = itemElement.dataset.videoId;
        const title = itemElement.querySelector('.related-video-title').textContent;
        const thumbnail = itemElement.querySelector('.related-video-thumbnail').src;
        const author = itemElement.querySelector('.related-video-author').textContent;
        const durationStr = itemElement.querySelector('.related-video-duration').textContent;
        
        // Parsear duración (ej: "3:45") de vuelta a segundos
        let duration = 0;
        if (durationStr.includes(':')) {
            const parts = durationStr.split(':').map(Number);
            if (parts.length === 2) duration = parts[0] * 60 + parts[1];
            if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        return {
            videoId: videoId,
            title: title,
            thumbnail: thumbnail,
            uploaderName: author,
            author: author,
            duration: duration
        };
    } catch (e) {
        console.error("Error encontrando datos de video relacionado:", e);
        return null;
    }
}  
/**
 * Cargar letras de la canción actual (CON CAMBIO DE PROVEEDOR)
 */
async loadLyrics() {
    // 1. Limpiar sincronización
    if (this.lyricsSyncInterval) {
        clearInterval(this.lyricsSyncInterval);
        this.lyricsSyncInterval = null;
    }
    this.currentLrc = [];
    
    const lyricsContainer = document.getElementById('lyricsContent');
    
    // ✅ CRÍTICO: Obtener el índice ACTUAL
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? 
                        this.core?.currentPlayingInfo?.flattenedIndex ?? 
                        -1;
    
    const flatList = this.core?.getFlattenedPlaylist() || [];
    const currentVideo = flatList[currentIndex];
    
    console.log('🎵 loadLyrics llamado:', { 
        currentIndex, 
        totalVideos: flatList.length,
        videoTitle: currentVideo?.title 
    });

    if (!currentVideo || currentIndex < 0) {
        lyricsContainer.innerHTML = `
            <div class="lyrics-container">
                <div class="lyrics-header"><i class="fas fa-music"></i><p>Letras no disponibles</p></div>
                <p class="lyrics-info">Reproduce una canción para ver las letras</p>
            </div>`;
        return;
    }

    // 2. Mostrar "Cargando" CON el botón
    lyricsContainer.innerHTML = `
        <div class="lyrics-container">
            <div class="lyrics-header">
                <i class="fas fa-spinner fa-spin"></i><p>Buscando letras...</p>
                <button id="lyricsProviderToggle" class="lyrics-provider-btn" title="Cambiar Proveedor">
                    <i class="fas fa-sync-alt"></i> ${this.lyricsProvider}
                </button>
            </div>
            <p class="lyrics-info">Para: ${this.escapeHTML(currentVideo.title)}</p>
        </div>`;
    
    this.setupLyricsProviderButton();

    try {
        // 3. Preparar datos con limpieza mejorada
        let artist = (currentVideo.artist || currentVideo.uploaderName || '').trim();
        let title = (currentVideo.title || '').trim();
        const duration = Math.round(currentVideo.duration || 0);
        
        // Limpiar título
        title = title
            .replace(/\(official.*?video\)/gi, '')
            .replace(/\(lyric.*?video\)/gi, '')
            .replace(/\(visualizer\)/gi, '')
            .replace(/\(audio\)/gi, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?official.*?\)/gi, '')
            .trim();
        
        // Si el título incluye el artista, removerlo
        if (artist && title.toLowerCase().includes(artist.toLowerCase())) {
            const artistRegex = new RegExp(`^${this.escapeRegExp(artist)}\\s*[-–:]\\s*`, 'i');
            title = title.replace(artistRegex, '').trim();
        }
        
        // Si no hay artista válido, extraer del título
        if (!artist || artist === 'Desconocido' || artist === 'YouTube') {
            const separatorMatch = title.match(/^(.+?)\s*[-–:]\s*(.+?)$/);
            if (separatorMatch) {
                artist = separatorMatch[1].trim();
                title = separatorMatch[2].trim();
            }
        }

        console.log('🎵 Buscando letras para:', { artist, title, duration, provider: this.lyricsProvider });

        let match;

        if (this.lyricsProvider === 'lrclib') {
            const lrclibUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}}`;
            console.log('📡 lrclib URL:', lrclibUrl);
            
            const response = await fetch(lrclibUrl);
            if (!response.ok) throw new Error(`lrclib.net: Error ${response.status}`);
            
            match = await response.json();
            if (!match || match.code === 404) throw new Error('No se encontraron letras (lrclib)');
            match.source = 'lrclib.net';

        } else {
            const lujjjUrl = `https://lyrics-api.lujjjh.com/?name=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
            console.log('📡 lujjjh URL:', lujjjUrl);
            
            const response = await fetch(lujjjUrl);
            if (!response.ok) throw new Error(`lujjjh.com: Error ${response.status}`);
            
            const text = await response.text();
            if (!text || text.includes('Error: Not Found')) throw new Error('No se encontraron letras (lujjjh)');

            const artistName = text.match(/\[ar:(.*?)\]/i)?.[1] || artist;
            const trackName = text.match(/\[ti:(.*?)\]/i)?.[1] || title;
            
            match = {
                syncedLyrics: text,
                plainLyrics: text.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '\n').replace(/\[.*?\]/g, '').trim(),
                trackName: trackName,
                artistName: artistName,
                source: 'lujjjh.com'
            };
        }

        // Renderizar
        const headerHtml = `
            <div class="lyrics-header">
                <i class="fas fa-music"></i>
                <p>${this.escapeHTML(match.trackName)}</p>
                <button id="lyricsProviderToggle" class="lyrics-provider-btn" title="Cambiar Proveedor">
                    <i class="fas fa-sync-alt"></i> ${this.lyricsProvider}
                </button>
            </div>`;

        if (match.syncedLyrics) {
            this.currentLrc = this.parseLRC(match.syncedLyrics);
            if (this.currentLrc.length === 0) throw new Error('Letra encontrada pero no se pudo parsear');

            lyricsContainer.innerHTML = `
                <div class="lyrics-container">
                    ${headerHtml}
                    <p class="lyrics-artist-header">por ${this.escapeHTML(match.artistName)}</p>
                    <div class="lyrics-text synced" id="syncedLyricsContainer">
                        ${this.currentLrc.map((line) => `<p data-time="${line.time}">${this.escapeHTML(line.text)}</p>`).join('')}
                    </div>
                    <p class="lyrics-source">Fuente: ${match.source} (Sincronizado)</p>
                </div>`;
            this.startLyricsSync();
        } else if (match.plainLyrics) {
            const formattedLyrics = this.escapeHTML(match.plainLyrics).replace(/\n/g, '<br>');
            lyricsContainer.innerHTML = `
                <div class="lyrics-container">
                    ${headerHtml}
                    <p class="lyrics-artist-header">por ${this.escapeHTML(match.artistName)}</p>
                    <p class="lyrics-text">${formattedLyrics}</p>
                    <p class="lyrics-source">Fuente: ${match.source}</p>
                </div>`;
        }

    } catch (error) {
        console.error('❌ Error cargando letras:', error);
        lyricsContainer.innerHTML = `
            <div class="lyrics-container">
                <div class="lyrics-header">
                    <i class="fas fa-exclamation-triangle"></i><p>Letras no disponibles</p>
                    <button id="lyricsProviderToggle" class="lyrics-provider-btn" title="Cambiar Proveedor">
                        <i class="fas fa-sync-alt"></i> ${this.lyricsProvider}
                    </button>
                </div>
                <p class="lyrics-info">No se encontraron letras para "${this.escapeHTML(currentVideo.title)}"</p>
                <p class="lyrics-info error-details">(${this.lyricsProvider} | ${error.message})</p>
            </div>`;
    }
    
    this.setupLyricsProviderButton();
}

   /**
     * ✅ NUEVA FUNCIÓN
     * Asigna el evento click al botón de cambio de proveedor
     */
    setupLyricsProviderButton() {
        const toggleBtn = document.getElementById('lyricsProviderToggle');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                this.toggleLyricsProvider();
            };
        }
    }

    /**
     * ✅ NUEVA FUNCIÓN
     * Cambia el proveedor y recarga las letras
     */
    toggleLyricsProvider() {
        if (this.lyricsProvider === 'lrclib') {
            this.lyricsProvider = 'lujjjh';
        } else {
            this.lyricsProvider = 'lrclib';
        }
        console.log(`🎵 Proveedor de letras cambiado a: ${this.lyricsProvider}`);
        this.loadLyrics(); // Recargar letras
    } 
/**
 * Actualizar UI de playlists
 */
updatePlaylistsUI() {
    console.log('🔄 Actualizando UI de playlists...');
    
    const container = document.getElementById('playlistsGrid');
    if (!container) {
        console.error('❌ Container playlistsGrid no encontrado');
        return;
    }
    
    // Limpiar container
    container.innerHTML = '';
    
    // ✅ FILTRAR: NO MOSTRAR LA COLA EN BIBLIOTECA
    const visiblePlaylists = this.playlistsData.filter(p => 
        p.id !== 'queue' && !p.isQueue
    );
    
    if (visiblePlaylists.length === 0) {
        container.innerHTML = `
            <div class="search-placeholder">
                <i class="fas fa-music"></i>
                <p><strong>¡Conecta tu cuenta de Google!</strong></p>
                <p>Ve tus playlists de YouTube y crea mezclas increíbles</p>
                <p><small>Powered by Sistema Unificado</small></p>
            </div>
        `;
        return;
    }
    
    console.log(`📊 Renderizando ${visiblePlaylists.length} playlists (sin cola)`);
    
    // Renderizar cada playlist (excepto cola)
    visiblePlaylists.forEach((playlist, index) => {
        const card = this.createPlaylistCard(playlist);
        container.appendChild(card);
    });
    
    const finalCount = container.querySelectorAll('.playlist-card').length;
    console.log(`✅ ${finalCount} playlists renderizadas`);
    
    // Actualizar stats en core
    this.core?.updateOverviewStats?.();
}
    /**
     * Limpiar toda la cola
     */
    clearQueue() {
        if (confirm('¿Estás seguro de que quieres borrar toda la cola?')) {
            const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
            if (queuePlaylist) {
                queuePlaylist.videos = [];
            }
            
            this.updatePlaylistsUI();
            this.core?.showMessage('Cola limpiada', 'success');
            
            // Si no hay más videos, detener reproducción
            const flatList = this.core?.getFlattenedPlaylist() || [];
            if (flatList.length === 0) {
                this.core?.handleEmptyPlaylist?.();
            }
        }
    }

    // =============================================
    // POPUP DE COLA
    // =============================================
/**
 * Mostrar popup de cola
 */
showQueuePopup() {
    console.log('📋 Redirigiendo a vista completa...');
    // En vez de popup, ir a vista fullPlayer
    if (this.core) {
        this.core.switchView('fullPlayer');
    } else if (window.unifiedCore) {
        window.unifiedCore.switchView('fullPlayer');
    }
}

    /**
     * Actualizar contenido del popup de cola
     */
updateQueuePopup() {
    // Actualizar popup (código existente)
    const popupContent = document.getElementById('queuePopupContent');
    if (popupContent) {
        const flatList = this.core?.getFlattenedPlaylist() || [];
        popupContent.innerHTML = this.renderQueueContent(flatList);
        
        setTimeout(() => {
            this.setupQueueItemListeners();
            this.syncQueueIndicator();
            
            if (window.queueDragDrop) {
                window.queueDragDrop.attachDragListeners();
            }
        }, 50);
    }
    
    // NUEVO: Actualizar cola persistente
    if (this.core && this.core.updatePersistentQueue) {
        this.core.updatePersistentQueue();
    }
}
    /**
 * Sincronizar cola después de cambio de video
 */
syncQueueIndicator() {
    const queueItems = document.querySelectorAll('.queue-item');
    const currentVideoId = window.currentPlayingInfo?.videoId;
    
    if (!currentVideoId) {
        console.log('⚠️ No hay video actual para sincronizar');
        return;
    }
    
    console.log(`🎵 Sincronizando indicador para: ${currentVideoId}`);
    
    let foundPlaying = false;
    
    queueItems.forEach(item => {
        const itemVideoId = item.dataset.videoId;
        
        if (itemVideoId === currentVideoId) {
            // ✅ MARCAR COMO REPRODUCIENDO
            item.classList.add('playing');
            
            // ✅ ACTUALIZAR NÚMERO A ICONO
            const numberEl = item.querySelector('.queue-item-number');
            if (numberEl) {
                numberEl.innerHTML = '<i class="fas fa-play-circle queue-item-playing"></i>';
            }
            
            foundPlaying = true;
            console.log(`✅ Marcado como playing: ${itemVideoId}`);
            
            // ✅ SCROLL SUAVE AL ITEM
            requestAnimationFrame(() => {
                item.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            });
        } else {
            // ✅ REMOVER MARCA
            item.classList.remove('playing');
            
            // ✅ RESTAURAR NÚMERO
            const numberEl = item.querySelector('.queue-item-number');
            const index = parseInt(item.dataset.flatIndex);
            if (numberEl && !isNaN(index)) {
                numberEl.textContent = index + 1;
            }
        }
    });
    
    if (!foundPlaying) {
        console.warn(`⚠️ No se encontró item con videoId: ${currentVideoId}`);
    }
}
/**
 * Escapar HTML para prevenir XSS
 */
escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
/**
 * Escapar caracteres especiales de RegExp
 */
escapeRegExp(string) {
    if (!string) return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
} 
    /**
 * Renderizar contenido de la cola
 */
renderQueueContent(flatList) {
    if (flatList.length === 0) {
        return `
            <div class="empty-queue-message">
                <i class="fas fa-music"></i>
                <p>La cola está vacía</p>
                <p>Añade música desde la biblioteca o búsqueda</p>
            </div>
        `;
    }

    let html = `
        <div class="queue-controls">
            <div class="queue-info">
                <span class="queue-count">${flatList.length} videos en cola</span>
            </div>
            <button class="clear-queue-btn" onclick="window.playlistManager?.clearQueue()">
                <i class="fas fa-trash"></i>
                Borrar todo
            </button>
        </div>
        <div class="queue-items">
    `;

    flatList.forEach((video, index) => {
        const isPlaying = window.currentPlayingInfo?.videoId === video.videoId;
        const formattedDuration = video.duration && video.duration > 0 
            ? this.core?.formatDuration(video.duration) 
            : '--:--';
        
        html += `
            <div class="queue-item ${isPlaying ? 'playing' : ''}" 
                 data-video-id="${video.videoId}" 
                 data-flat-index="${index}"
                 draggable="true">
                
                <div class="queue-item-number">
                    ${isPlaying ? '<i class="fas fa-play-circle queue-item-playing"></i>' : (index + 1)}
                </div>
                
                <img src="${video.thumbnail}" 
                     alt="${this.escapeHTML(video.title)}" 
                     class="queue-item-thumbnail"
                     onerror="this.src='./electronic.ico';">
                
                <div class="queue-item-info">
                    <div class="queue-item-title">${this.escapeHTML(video.title)}</div>
                    <div class="queue-item-meta">
                        <span class="queue-item-duration">${formattedDuration}</span>
                        ${video.uploaderName ? `<span class="queue-item-author">${this.escapeHTML(video.uploaderName)}</span>` : ''}
                    </div>
                </div>
                
                <button class="queue-item-remove" 
                        data-video-id="${video.videoId}" 
                        title="Eliminar de la cola">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}
    /**
     * Crear tarjeta visual de playlist
     */
createPlaylistCard(playlist) {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.dataset.playlistId = playlist.id;

    const videoCount = playlist.videos?.length || 0;
    const isYouTubeLibrary = playlist.source === 'youtube_library';

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
            <p class="playlist-card-count">${videoCount} videos</p>
            ${isYouTubeLibrary ? 
                '<span class="playlist-source-badge"><i class="fab fa-youtube"></i> YouTube</span>' : 
                '<span class="playlist-source-badge"><i class="fas fa-user"></i> Personal</span>'
            }
            <button class="delete-playlist-btn" data-playlist-id="${playlist.id}" title="Eliminar playlist">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    // ✅ Event listener para reproducir playlist
    const playBtn = card.querySelector('.play-playlist-btn');
    playBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const playlistId = playBtn.dataset.playlistId;
        
        console.log(`🎵 Reproducir playlist: ${playlistId}`);
        
        if (isYouTubeLibrary && !playlist.isLoaded) {
            console.log('📥 Cargando videos de YouTube Library...');
            await this.loadPlaylistVideos(playlistId);
        }
        
        const updatedPlaylist = this.playlistsData.find(p => p.id === playlistId);
        
        if (updatedPlaylist?.videos?.length > 0) {
            let addedCount = 0;
            
            for (const video of updatedPlaylist.videos) {
                const videoData = {
                    videoId: video.videoId,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    duration: video.duration,
                    uploaderName: video.uploaderName || video.author || 'YouTube',
                    author: video.author || video.uploaderName || 'YouTube'
                };
                
                const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
                const isDuplicate = queuePlaylist?.videos.some(v => v.videoId === video.videoId);
                
                if (!isDuplicate) {
                    await this.addVideoToQueue(videoData);
                    addedCount++;
                }
            }
            
            if (addedCount > 0) {
                this.core?.showMessage(`${addedCount} videos de "${updatedPlaylist.name}" añadidos a cola`, 'success');
                
                const flatList = this.core?.getFlattenedPlaylist();
                if (flatList?.length > 0 && !window.reproduccionIniciada) {
                    this.core?.playVideoAtIndex(0);
                    this.core?.switchView('playing');
                }
            } else {
                this.core?.showMessage(`Todos los videos de "${updatedPlaylist.name}" ya están en la cola`, 'info');
            }
        } else {
            console.error('❌ La playlist no tiene videos o no se cargaron correctamente');
            this.core?.showMessage('No se pudieron cargar los videos de la playlist', 'error');
        }
    });

    // ✅ Event listener para eliminar playlist
    const deleteBtn = card.querySelector('.delete-playlist-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const playlistId = deleteBtn.dataset.playlistId;
            
            console.log(`🗑️ Solicitud eliminar playlist: ${playlistId}`);
            
            const playlistToDelete = this.playlistsData.find(p => p.id === playlistId);
            if (playlistToDelete) {
                const confirmMessage = isYouTubeLibrary 
                    ? `¿Eliminar "${playlistToDelete.name}" de la biblioteca? (Solo se elimina de la app, no de YouTube)`
                    : `¿Eliminar la playlist "${playlistToDelete.name}"?`;
                
                if (confirm(confirmMessage)) {
                    this.deletePlaylist(playlistId);
                }
            }
        });
    }

    // ✅ CORRECCIÓN: Click en card para mostrar popup
    card.addEventListener('click', async (e) => {
        // Verificar que NO se hizo click en botones
        if (e.target.closest('.play-playlist-btn') || 
            e.target.closest('.delete-playlist-btn')) {
            return;
        }
        
        console.log(`🎵 Click en playlist: ${playlist.name}`);
        
        // Si es de YouTube Library y no está cargada, cargar videos
        if (isYouTubeLibrary && !playlist.isLoaded) {
            console.log('📥 Cargando videos de YouTube Library...');
            const success = await this.loadPlaylistVideos(playlist.id);
            if (!success) {
                this.core?.showMessage('Error cargando videos de la playlist', 'error');
                return;
            }
        }
        
        // Mostrar popup con videos
        this.createPlaylistPopup(playlist);
    });

    return card;
}

    /**
     * Eliminar playlist
     */
    deletePlaylist(playlistId) {
        const playlist = this.playlistsData.find(p => p.id === playlistId);
        if (!playlist) {
            console.warn(`⚠️ Playlist ${playlistId} no encontrada`);
            return;
        }
        
        console.log(`🗑️ Eliminando playlist: ${playlist.name} (${playlistId})`);
        
        if (playlist.isQueue || playlistId === 'queue') {
            this.core?.showMessage('No puedes eliminar la cola de reproducción', 'warning');
            return;
        }
        
        const indexToRemove = this.playlistsData.findIndex(p => p.id === playlistId);
        if (indexToRemove !== -1) {
            this.playlistsData.splice(indexToRemove, 1);
            
            if (this.core && this.core.playlistsData) {
                this.core.playlistsData = this.playlistsData;
            }
            
            console.log(`✅ Playlist "${playlist.name}" eliminada`);
            this.updatePlaylistsUI();
            this.core?.showMessage(`Playlist "${playlist.name}" eliminada`, 'success');
            
            const flatList = this.core?.getFlattenedPlaylist();
            if (flatList?.length === 0) {
                this.core?.handleEmptyPlaylist?.();
            } else {
                this.core?.updateCurrentPlayingIndex?.();
            }
        } else {
            console.error(`❌ No se pudo encontrar índice de playlist ${playlistId}`);
        }
    }
/**
 * Configurar event listeners para items de la cola
 */
setupQueueItemListeners() {
    const queueItems = document.querySelectorAll('.queue-item');
    
    console.log(`🎵 Configurando listeners para ${queueItems.length} items de cola`);
    
    queueItems.forEach((item, index) => {
        // Click en el item para reproducir
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.queue-item-remove') && 
                !e.target.closest('.queue-item-drag-handle')) {
                
                const itemIndex = parseInt(item.dataset.flatIndex);
                const videoId = item.dataset.videoId;
                
                console.log(`🎵 Click en queue item: ${videoId} (índice ${itemIndex})`);
                
                if (!isNaN(itemIndex)) {
                    // Validar que el índice sea correcto
                    const flatList = this.core?.getFlattenedPlaylist() || [];
                    if (itemIndex >= 0 && itemIndex < flatList.length) {
                        console.log(`▶️ Saltando a: ${flatList[itemIndex].title}`);
                        this.core?.playVideoAtIndex(itemIndex);
                    } else {
                        console.error(`❌ Índice fuera de rango: ${itemIndex}`);
                    }
                }
            }
        });
    });
    
    // Listeners para botones de eliminar
    const removeButtons = document.querySelectorAll('.queue-item-remove');
    removeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const videoId = btn.dataset.videoId;
            console.log(`🗑️ Eliminando video de cola: ${videoId}`);
            
            if (!videoId || videoId === 'undefined') {
                console.error('❌ videoId inválido para eliminar');
                return;
            }
            
            btn.disabled = true;
            btn.style.opacity = '0.5';
            
            const success = this.removeVideoFromQueue(videoId);
            
            if (!success) {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });
    });
}
    /**
     * Crear popup de playlist con detalles
     */
createPlaylistPopup(playlist) {
    console.log(`📋 Creando popup para: ${playlist.name}`);
    
    // Eliminar popup anterior si existe
    const existingPopup = document.querySelector('.playlist-popup-overlay');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // Crear popup
    const popup = document.createElement('div');
    popup.className = 'playlist-popup-overlay';
    popup.innerHTML = `
        <div class="playlist-popup">
            <div class="playlist-popup-header">
                <div class="playlist-header-info">
                    <img src="${playlist.thumbnailUrl}" 
                         alt="${this.escapeHTML(playlist.name)}" 
                         class="playlist-popup-thumb">
                    <div class="playlist-header-text">
                        <h3>${this.escapeHTML(playlist.name)}</h3>
                        <p class="playlist-video-count">${playlist.videos?.length || 0} videos</p>
                    </div>
                </div>
                <button class="playlist-popup-close" title="Cerrar">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="playlist-popup-content">
                ${this.renderPlaylistContent(playlist)}
            </div>
        </div>
    `;

    // Agregar al body
    document.body.appendChild(popup);
    
    // Mostrar con animación
    setTimeout(() => popup.classList.add('show'), 10);
    
    // Setup event listeners
    this.setupPlaylistPopupEvents(popup, playlist);
    
    console.log(`✅ Popup creado con ${playlist.videos?.length || 0} videos`);
}

    /**
     * Renderizar contenido de playlist
     */
renderPlaylistContent(playlist) {
    if (!playlist.videos || playlist.videos.length === 0) {
        return `
            <div class="empty-playlist">
                <i class="fas fa-music-slash"></i>
                <h4>Esta playlist está vacía</h4>
                <p>No se encontraron videos válidos</p>
            </div>
        `;
    }

    return `
        <div class="playlist-popup-videos">
            ${playlist.videos.map((video, index) => {
                const duration = video.duration && video.duration > 0 
                    ? this.core?.formatDuration(video.duration) 
                    : '--:--';
                
                return `
                    <div class="popup-video-item" data-index="${index}">
                        <div class="popup-video-index">${index + 1}</div>
                        <img src="${video.thumbnail}" 
                             alt="${this.escapeHTML(video.title)}" 
                             class="popup-video-thumbnail"
                             onerror="this.src='./electronic.ico';">
                        <div class="popup-video-info">
                            <div class="popup-video-title" title="${this.escapeHTML(video.title)}">
                                ${this.escapeHTML(video.title)}
                            </div>
                            <div class="popup-video-meta">
                                <span class="popup-video-channel">${this.escapeHTML(video.uploaderName || 'YouTube')}</span>
                                <span class="popup-video-duration">${duration}</span>
                            </div>
                        </div>
                        <div class="popup-video-actions">
                            <button class="popup-video-action-btn primary" 
                                    data-action="play" 
                                    data-video-id="${video.videoId}"
                                    title="Reproducir ahora">
                                <i class="fas fa-play"></i>
                            </button>
                            <button class="popup-video-action-btn" 
                                    data-action="queue" 
                                    data-video-id="${video.videoId}"
                                    title="Añadir a cola">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}
// Formatear duración
formatDuration(duration) {
    if (!duration || isNaN(duration)) return '0:00';
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
    /**
     * Configurar eventos del popup de playlist
     */
setupPlaylistPopupEvents(popup, playlist) {
    // Botón cerrar
    popup.querySelector('.playlist-popup-close')?.addEventListener('click', () => {
        popup.classList.remove('show');
        setTimeout(() => popup.remove(), 300);
    });

    // Click fuera del popup
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 300);
        }
    });

    // Botones de acción de videos
    popup.querySelectorAll('.popup-video-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            const action = btn.dataset.action;
            const videoId = btn.dataset.videoId;
            const video = playlist.videos.find(v => v.videoId === videoId);
            
            if (!video) return;
            
            const videoData = {
                videoId: video.videoId,
                title: video.title,
                thumbnail: video.thumbnail,
                duration: video.duration,
                uploaderName: video.uploaderName || video.author || 'YouTube',
                author: video.author || video.uploaderName || 'YouTube'
            };
            
            if (action === 'queue') {
                await this.addVideoToQueue(videoData);
            } else if (action === 'play') {
                await this.addVideoToQueue(videoData);
                setTimeout(() => {
                    const flatList = this.core?.getFlattenedPlaylist();
                    const index = flatList?.findIndex(v => v.videoId === video.videoId);
                    if (index !== -1 && this.core) {
                        this.core.playVideoAtIndex(index);
                        this.core.switchView('fullPlayer');
                    }
                }, 100);
            }
        });
    });
}
    /**
     * Añadir playlist completa a la cola
     */
    addPlaylistToQueue(playlist) {
        let addedCount = 0;
        
        playlist.videos.forEach(video => {
            const videoData = {
                videoId: video.videoId,
                title: video.title,
                thumbnail: video.thumbnail,
                duration: video.duration,
                uploaderName: video.uploaderName || video.author || 'YouTube',
                author: video.author || video.uploaderName || 'YouTube'
            };
            
            const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
            const isDuplicate = queuePlaylist?.videos.some(v => v.videoId === video.videoId);
            
            if (!isDuplicate) {
                this.addVideoToQueue(videoData);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            this.core?.showMessage(`${addedCount} videos añadidos de "${playlist.name}"`, 'success');
        } else {
            this.core?.showMessage(`Todos los videos de "${playlist.name}" ya están en la cola`, 'info');
        }
    }

    /**
     * Mostrar menú contextual de video
     */
    showVideoMenu(video, buttonElement) {
        const menu = document.createElement('div');
        menu.className = 'video-context-menu';
        menu.innerHTML = `
            <button class="context-menu-item" data-action="play">
                <i class="fas fa-play"></i> Reproducir ahora
            </button>
            <button class="context-menu-item" data-action="queue">
                <i class="fas fa-plus"></i> Añadir a cola
            </button>
        `;

        const rect = buttonElement.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left - 100}px`;
        menu.style.zIndex = '10000';

        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                
                const videoData = {
                    videoId: video.videoId,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    duration: video.duration,
                    uploaderName: video.uploaderName || video.author || 'YouTube',
                    author: video.author || video.uploaderName || 'YouTube'
                };
                
                if (action === 'queue') {
                    this.addVideoToQueue(videoData);
                } else if (action === 'play') {
                    this.addVideoToQueue(videoData);
                    setTimeout(() => {
                        const flatList = this.core?.getFlattenedPlaylist();
                        const index = flatList?.findIndex(v => v.videoId === video.videoId);
                        if (index !== -1) {
                            this.core?.playVideoAtIndex(index);
                            this.core?.switchView('playing');
                        }
                    }, 100);
                }
                menu.remove();
            });
        });

        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 100);

        document.body.appendChild(menu);
    }

    // =============================================
    // PLAYLISTS DE YOUTUBE LIBRARY
    // =============================================

    /**
     * Añadir playlists de YouTube Library
     */
addYouTubeLibraryPlaylists(youtubePlaylists) {
        console.log(`📥 addYouTubeLibraryPlaylists llamada con ${youtubePlaylists?.length || 0} playlists`);
        
        if (!youtubePlaylists?.length) {
            console.warn("❌ No se recibieron playlists válidas");
            return;
        }

        // ✅ VERIFICAR SI YA ESTÁN CARGADAS (evitar duplicados)
        const currentYouTubeCount = this.playlistsData.filter(p => p.source === 'youtube_library').length;
        
        if (currentYouTubeCount >= youtubePlaylists.length) {
            console.log(`✅ Ya hay ${currentYouTubeCount} playlists de YouTube cargadas`);
            return;
        }

        if (currentYouTubeCount > 0) {
            console.log(`🧹 Limpiando ${currentYouTubeCount} playlists duplicadas...`);
            this.playlistsData = this.playlistsData.filter(p => p.source !== 'youtube_library');
        }

        // ✅ PROCESAR PLAYLISTS CON VIDEOS YA CARGADOS
        const validPlaylists = youtubePlaylists
            .filter(playlist => {
                // Verificar que tenga videos cargados (vienen de auth.js)
                const hasVideos = playlist.videos && Array.isArray(playlist.videos);
                const hasValidVideos = hasVideos && playlist.videos.length > 0;
                
                if (!hasValidVideos) {
                    console.warn(`⚠️ Playlist "${playlist.title || playlist.name}" sin videos válidos`);
                }
                
                return hasValidVideos;
            })
            .map(playlist => {
                // ✅ OBTENER THUMBNAIL DEL PRIMER VIDEO
                let thumbnailUrl = './electronic.ico';
                if (playlist.videos && playlist.videos.length > 0) {
                    thumbnailUrl = playlist.videos[0].thumbnail || './electronic.ico';
                }
                
                return {
                    id: playlist.id,
                    name: playlist.title || playlist.name || 'Playlist Sin Nombre',
                    thumbnailUrl: thumbnailUrl,
                    videos: playlist.videos, // ✅ VIDEOS YA VIENEN CARGADOS
                    isExpanded: false,
                    source: 'youtube_library',
                    isLoaded: true, // ✅ YA ESTÁ CARGADA
                    count: playlist.videos.length
                };
            });

        if (validPlaylists.length === 0) {
            console.warn("❌ No hay playlists con videos válidos para añadir");
            return;
        }

        // ✅ INSERTAR DESPUÉS DE LA COLA
        const queueIndex = this.playlistsData.findIndex(p => p.id === 'queue' || p.isQueue);
        const insertIndex = queueIndex !== -1 ? queueIndex + 1 : 0;
        
        this.playlistsData.splice(insertIndex, 0, ...validPlaylists);
        
        console.log(`✅ ${validPlaylists.length} playlists de YouTube añadidas correctamente`);
        console.log(`📊 Total de videos: ${validPlaylists.reduce((sum, p) => sum + p.videos.length, 0)}`);

        // ✅ ACTUALIZAR UI INMEDIATAMENTE
        requestAnimationFrame(() => {
            this.updatePlaylistsUI();
            
            if (this.core?.showMessage) {
                this.core.showMessage(`${validPlaylists.length} playlists sincronizadas`, 'success');
            }
        });
    }

    /**
     * Forzar recreación de UI
     */
    forceRecreatePlaylistsUI() {
        console.log("🔄 Forzando recreación completa de UI de playlists");
        
        const container = document.getElementById('playlistsGrid');
        if (!container) {
            console.error("❌ Container playlistsGrid no encontrado");
            return;
        }
        
        container.innerHTML = '';
        
        if (this.playlistsData.length === 0) {
            container.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-music"></i>
                    <p><strong>¡Conecta tu cuenta de Google!</strong></p>
                    <p>Ve tus playlists de YouTube y crea mezclas increíbles</p>
                    <p><small>Powered by Sistema Unificado</small></p>
                </div>
            `;
        } else {
            console.log(`📊 Recreando ${this.playlistsData.length} playlists en DOM`);
            
            this.playlistsData.forEach((playlist, index) => {
                const card = this.createPlaylistCard(playlist);
                container.appendChild(card);
                console.log(`✅ Playlist ${index + 1} renderizada: ${playlist.name}`);
            });
            
            const finalCount = container.querySelectorAll('.playlist-card').length;
            console.log(`🎯 Renderizado final: ${finalCount} de ${this.playlistsData.length} playlists`);
        }
        
        this.core?.updateOverviewStats?.();
    }

    /**
     * Limpiar playlists de YouTube Library
     */
    clearYouTubeLibraryPlaylists() {
        const initialCount = this.playlistsData.length;
        this.playlistsData = this.playlistsData.filter(p => p.source !== 'youtube_library');
        const removedCount = initialCount - this.playlistsData.length;
        
        if (this.core && this.core.playlistsData) {
            this.core.playlistsData = this.playlistsData;
        }
        
        if (removedCount > 0) {
            console.log(`Eliminadas ${removedCount} playlists de YouTube Library`);
            this.updatePlaylistsUI();
        }
    }

    // =============================================
    // GESTIÓN DE PLAYLIST POR URL
    // =============================================

    extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            return null;
        }
    }

    async getPlaylistInfo(playlistId) {
        const pipedInstances = ["https://api.piped.private.coffee"];
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
            this.core?.showMessage("No se encontraron videos válidos en la playlist", 'error');
            return;
        }

        const playlistId = playlistInfo.id || `playlist_${Date.now()}`;

        if (this.playlistsData.some(p => p.id === playlistId)) {
            this.core?.showMessage(`La playlist "${playlistInfo.name || playlistId}" ya está cargada`, 'warning');
            return;
        }

        const loadedVideos = playlistInfo.relatedStreams.map(video => {
            const videoId = video.url?.split('v=')[1];
            const duration = this.core?.parseDuration(video.duration) || 0;
            
            return {
                videoId: videoId,
                title: this.cleanVideoTitle(video.title),
                thumbnail: video.thumbnail || './electronic.ico',
                duration: duration,
                uploaderName: this.extractArtistFromTitle(video.title),
                author: this.extractArtistFromTitle(video.title),
                source: 'url'
            };
        }).filter(v => v.videoId && v.title);

        if (loadedVideos.length === 0) {
            this.core?.showMessage("La playlist no contiene videos válidos", 'error');
            return;
        }

        const newPlaylist = {
            id: playlistId,
            name: playlistInfo.name || "Playlist Sin Nombre",
            thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || './electronic.ico',
            videos: loadedVideos,
            isExpanded: true
        };

        const manualIndex = this.playlistsData.findIndex(p => p.id === 'manual');
        if (manualIndex !== -1) {
            this.playlistsData.splice(manualIndex + 1, 0, newPlaylist);
        } else {
            this.playlistsData.push(newPlaylist);
        }

        if (this.core && this.core.playlistsData) {
            this.core.playlistsData = this.playlistsData;
        }

        this.core?.showMessage(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos)`, 'success');
        this.updatePlaylistsUI();
        this.core?.enablePlayButton();
    }

    // =============================================
    // UTILIDADES
    // =============================================

    playPlaylist(playlistId) {
        const playlist = this.playlistsData.find(p => p.id === playlistId);
        if (!playlist?.videos?.length) {
            this.core?.showMessage("La playlist está vacía", 'warning');
            return;
        }

        const flatList = this.core?.getFlattenedPlaylist() || [];
        const firstVideoIndex = flatList.findIndex(v => v.sourcePlaylistId === playlistId);
        
        if (firstVideoIndex !== -1) {
            this.core?.playVideoAtIndex(firstVideoIndex);
            this.core?.switchView('playing');
        }
    }

    syncWithCore() {
        if (this.core && this.core.playlistsData) {
            this.playlistsData = this.core.playlistsData;
        }
    }

    updateCore() {
        if (this.core) {
            this.core.playlistsData = this.playlistsData;
        }
    }
}

// =============================================
// DRAG AND DROP EN COLA
// =============================================

class QueueDragDrop {
    constructor() {
        this.draggedItem = null;
        this.draggedIndex = null;
        this.placeholder = null;
        this.setupDragAndDrop();
    }
    
    setupDragAndDrop() {
        console.log('🎯 Configurando Drag & Drop para cola');
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.classList && node.classList.contains('queue-popup-overlay')) {
                            setTimeout(() => {
                                this.attachDragListeners();
                            }, 100);
                        }
                    });
                }
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }
    
    attachDragListeners() {
        const queueItems = document.querySelectorAll('.queue-item');
        
        console.log(`🎯 Configurando ${queueItems.length} items para drag & drop`);
        
        queueItems.forEach((item, index) => {
            item.setAttribute('draggable', 'true');
            item.style.cursor = 'move';
            
            item.removeEventListener('dragstart', this.handleDragStart);
            item.removeEventListener('dragover', this.handleDragOver);
            item.removeEventListener('drop', this.handleDrop);
            item.removeEventListener('dragend', this.handleDragEnd);
            item.removeEventListener('dragenter', this.handleDragEnter);
            item.removeEventListener('dragleave', this.handleDragLeave);
            
            item.addEventListener('dragstart', (e) => this.handleDragStart(e, item, index));
            item.addEventListener('dragover', (e) => this.handleDragOver(e));
            item.addEventListener('drop', (e) => this.handleDrop(e, item, index));
            item.addEventListener('dragend', (e) => this.handleDragEnd(e));
            item.addEventListener('dragenter', (e) => this.handleDragEnter(e, item));
            item.addEventListener('dragleave', (e) => this.handleDragLeave(e, item));
        });
    }
    
    handleDragStart(e, item, index) {
        console.log(`🎯 Drag start: item ${index}`);
        
        this.draggedItem = item;
        this.draggedIndex = index;
        
        item.style.opacity = '0.5';
        item.classList.add('dragging');
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', item.innerHTML);
        e.dataTransfer.setData('application/json', JSON.stringify({
            index: index,
            videoId: item.dataset.videoId
        }));
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }
    
    handleDragEnter(e, item) {
        if (item !== this.draggedItem) {
            item.classList.add('drag-over');
        }
    }
    
    handleDragLeave(e, item) {
        item.classList.remove('drag-over');
    }
    
handleDrop(e, targetItem, targetIndex) {
    e.preventDefault();
    e.stopPropagation();
    
    targetItem.classList.remove('drag-over');
    
    if (this.draggedItem === targetItem) {
        return false;
    }
    
    console.log(`🎯 Drop: de ${this.draggedIndex} a ${targetIndex}`);
    
    // CORRECCIÓN: Usar playlistManager en lugar de playlistsData directamente
    const queuePlaylist = window.playlistManager?.playlistsData?.find(p => p.id === 'queue' || p.isQueue);
    if (!queuePlaylist) {
        console.error('❌ No se encontró playlist de cola');
        return false;
    }
    
    const [movedVideo] = queuePlaylist.videos.splice(this.draggedIndex, 1);
    
    let newIndex = targetIndex;
    if (this.draggedIndex < targetIndex) {
        newIndex--;
    }
    
    queuePlaylist.videos.splice(newIndex, 0, movedVideo);
    
    // Ajustar índice de reproducción actual
    if (window.currentPlayingInfo) {
        if (window.currentPlayingInfo.flattenedIndex === this.draggedIndex) {
            window.currentPlayingInfo.flattenedIndex = newIndex;
        } else if (this.draggedIndex < window.currentPlayingInfo.flattenedIndex && 
                   newIndex >= window.currentPlayingInfo.flattenedIndex) {
            window.currentPlayingInfo.flattenedIndex--;
        } else if (this.draggedIndex > window.currentPlayingInfo.flattenedIndex && 
                   newIndex <= window.currentPlayingInfo.flattenedIndex) {
            window.currentPlayingInfo.flattenedIndex++;
        }
    }
    
    // Actualizar UI
    if (window.playlistManager) {
        window.playlistManager.updateQueuePopup();
    }
    
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Orden actualizado', 'success');
    }
    
    // Guardar cambios
    setTimeout(() => {
        if (typeof window.saveAllData === 'function') {
            window.saveAllData();
        }
    }, 100);
    
    return false;
}
    
    handleDragEnd(e) {
        console.log('🎯 Drag end');
        
        if (this.draggedItem) {
            this.draggedItem.style.opacity = '1';
            this.draggedItem.classList.remove('dragging');
        }
        
        document.querySelectorAll('.queue-item').forEach(item => {
            item.classList.remove('drag-over');
        });
        
        this.draggedItem = null;
        this.draggedIndex = null;
    }
}

// =============================================
// FUNCIONES GLOBALES Y DE COMPATIBILIDAD
// =============================================

let playlistManagerInstance = null;

/**
 * Inicializar el gestor cuando el core esté listo
 */
function initializePlaylistManager(unifiedCore) {
    playlistManagerInstance = new PlaylistManager(unifiedCore);
    
    // Exponer globalmente
    window.playlistManager = playlistManagerInstance;
    
    console.log('✅ PlaylistManager inicializado y conectado con UnifiedCore');
    return playlistManagerInstance;
}

/**
 * Configurar event listeners de playlist input
 */
function setupPlaylistInput() {
    const urlInput = document.getElementById('searchInput2');
    const addBtn = document.getElementById('añadirUrlButton');

    if (addBtn && urlInput) {
        addBtn.addEventListener('click', async () => {
            const url = urlInput.value.trim();
            if (!url) return;

            const playlistId = playlistManagerInstance?.extractPlaylistId(url);
            if (!playlistId) {
                window.unifiedCore?.showMessage('URL de playlist no válida', 'error');
                return;
            }

            urlInput.value = '';
            window.unifiedCore?.showMessage('Cargando playlist...', 'loading');

            try {
                const playlistInfo = await playlistManagerInstance?.getPlaylistInfo(playlistId);
                if (playlistInfo) {
                    playlistInfo.id = playlistId;
                    await playlistManagerInstance?.handlePlaylistLoaded(playlistInfo);
                }
            } catch (error) {
                console.error("Error cargando playlist:", error);
                window.unifiedCore?.showMessage(`Error al cargar playlist: ${error.message}`, 'error');
            }
        });
    }
}

// =============================================
// INICIALIZACIÓN Y EVENTOS
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('📁 Playlist.js cargado, esperando inicialización...');
    
    setTimeout(() => {
        setupPlaylistInput();
        
        // Inicializar drag & drop
        window.queueDragDrop = new QueueDragDrop();
    }, 1000);
});

// =============================================
// FUNCIONES GLOBALES DE UTILIDAD
// =============================================

window.getPlaylistManager = function() {
    return playlistManagerInstance;
};

window.isPlaylistManagerReady = function() {
    return playlistManagerInstance !== null && playlistManagerInstance.core !== null;
};

window.debugPlaylists = function() {
    if (!playlistManagerInstance) {
        console.log('❌ PlaylistManager no inicializado');
        return;
    }
    
    console.log('🐛 Estado del PlaylistManager:', {
        instance: playlistManagerInstance,
        playlistsData: playlistManagerInstance.playlistsData,
        coreConnection: !!playlistManagerInstance.core,
        totalPlaylists: playlistManagerInstance.playlistsData.length,
        queuePlaylist: playlistManagerInstance.playlistsData.find(p => p.id === 'queue'),
        youtubeLibraryPlaylists: playlistManagerInstance.playlistsData.filter(p => p.source === 'youtube_library').length
    });
};

window.forcePlaylistSync = function() {
    if (playlistManagerInstance && window.unifiedCore) {
        playlistManagerInstance.syncWithCore();
        playlistManagerInstance.updatePlaylistsUI();
        console.log('🔄 Sincronización forzada completada');
    } else {
        console.warn('⚠️ No se puede sincronizar: faltan dependencias');
    }
};

// =============================================
// EXPORT PARA MÓDULOS
// =============================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PlaylistManager,
        initializePlaylistManager
    };
}

if (typeof window !== 'undefined') {
    window.PlaylistManager = PlaylistManager;
    window.initializePlaylistManager = initializePlaylistManager;
}

console.log('🎵 Playlist.js completamente cargado y listo')
