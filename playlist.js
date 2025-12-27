console.log('🎵 Cargando gestor de playlists...');

// =============================================
// CLASE PRINCIPAL PARA GESTIÓN DE PLAYLISTS
// =============================================
class PlaylistManager {
    constructor(core) {
        // 1. Referencia al Núcleo
        this.core = core;

        // 2. Inicialización de Datos
        // Intentamos cargar del core si ya tiene datos, si no, array vacío
        this.playlists = this.core?.playlistsData || []; 

        // 3. Configuración de Letras (Persistencia + Caché)
        this.lyricsProvider = localStorage.getItem('ytcm_lyrics_provider') || 'lrclib';
        this.lastLoadedLyricsId = null;
        this.currentLrc = [];
        this.lyricsSyncInterval = null;
        this.lyricsTranslated = false;

        // 4. Configuración de Relacionados (Caché)
        this.lastLoadedRelatedId = null;

        // 5. Arranque
        this.init(); 
    }
    init() {
        console.log('🔧 Inicializando PlaylistManager...');

        // 1. Cargar Playlists persistentes (si existen en localStorage)
        this.loadPlaylists();

        // 2. Configurar todos los botones y eventos (Drag & drop, clicks, etc.)
        this.setupEventListeners();

        // 3. Renderizar la vista inicial de playlists
        this.updatePlaylistsUI();
        
        // 4. Si hay una cola guardada, actualizar su UI
        this.updateQueueUI();

        console.log('✅ PlaylistManager Inicializado correctamente');
    }
    
    // =============================================
    // PERSISTENCIA DE DATOS
    // =============================================
    
    /**
     * Cargar playlists desde almacenamiento persistente o inicializar
     */
    loadPlaylists() {
        console.log('📂 Cargando playlists...');

        // 1. Intentar cargar desde el Core (si ya tiene datos)
        if (this.core && this.core.playlistsData && this.core.playlistsData.length > 0) {
            console.log('✅ Usando datos existentes del Core');
            this.playlistsData = this.core.playlistsData; // Sincronizar referencia
        } 
        // 2. Si no, intentar cargar desde localStorage (persistencia propia de playlist.js si existiera)
        else {
            // Nota: La persistencia principal la maneja core.js via loadPlaylistsDataPersistent
            // Aquí podemos intentar recuperar si el core aún no ha cargado
            const storedData = localStorage.getItem('ytcm_playlists_persistent');
            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    this.playlistsData = parsed.data || [];
                    console.log(`✅ ${this.playlistsData.length} playlists recuperadas de localStorage local`);
                } catch (e) {
                    console.warn('⚠️ Error al leer localStorage local, iniciando vacío');
                    this.playlistsData = [];
                }
            } else {
                this.playlistsData = [];
            }
        }

        // 3. Asegurar que existe la Cola de Reproducción
        let queue = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);
        if (!queue) {
            console.log('✨ Creando cola de reproducción inicial');
            queue = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true,
                isQueue: true
            };
            this.playlistsData.unshift(queue); // Añadir al principio
        }

        // 4. Asegurar que existe la Playlist Manual
        let manual = this.playlistsData.find(p => p.id === 'manual');
        if (!manual) {
            manual = {
                id: 'manual',
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true
            };
            this.playlistsData.push(manual);
        }

        // 5. Sincronizar de vuelta al Core para que ambos compartan la misma referencia
        if (this.core) {
            this.core.playlistsData = this.playlistsData;
        }
        
        // Asignar alias para compatibilidad con código que use this.playlists
        this.playlists = this.playlistsData; 
    }

    /**
     * Configurar listeners globales (setupEventListeners)
     */
    setupEventListeners() {
        console.log('🎧 Configurando eventos de PlaylistManager...');
        
        // Listener para búsqueda de playlists
        const input = document.getElementById('searchInput2');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('añadirUrlButton')?.click();
                }
            });
        }

        // Listener para cerrar popups con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const popup = document.querySelector('.playlist-popup-overlay.show');
                if (popup) {
                    popup.classList.remove('show');
                    setTimeout(() => popup.remove(), 300);
                }
            }
        });
    }
    // =============================================
    // GESTIÓN DE VIDEOS EN COLA
    // =============================================
  
extractArtistFromTitle(fullTitle) {
    if (!fullTitle) return 'Desconocido';
    
    let cleanTitle = fullTitle.trim();
    
    cleanTitle = cleanTitle
        .replace(/\(official.*?video\)/gi, '')
        .replace(/\(lyric.*?video\)/gi, '')
        .replace(/\(visualizer\)/gi, '')
        .replace(/\(audio\)/gi, '')
        .replace(/\[official.*?\]/gi, '')
        .replace(/\[lyric.*?\]/gi, '')
        .trim();
    
    const separatorPatterns = [
        /^(.+?)\s*[-–—]\s*(.+?)$/,
        /^(.+?)\s*:\s*(.+?)$/,
        /^(.+?)\s*\|\s*(.+?)$/,
    ];
    
    for (const pattern of separatorPatterns) {
        const match = cleanTitle.match(pattern);
        if (match && match[1] && match[2]) {
            const artist = match[1].trim();
            const title = match[2].trim();
            
            if (artist.length < 50 && !artist.toLowerCase().includes('feat')) {
                return artist; // ✅ RETORNAR STRING, no objeto
            }
        }
    }
    
    return 'Desconocido';
}

async addVideoToQueue(videoData, fromPlaylist = false) {
    console.log('🎵 addVideoToQueue llamado:', videoData);
    
    // ✅ VALIDACIÓN MEJORADA
    if (!videoData || 
        !videoData.videoId || 
        videoData.videoId === 'undefined' || 
        videoData.videoId === undefined ||
        typeof videoData.videoId !== 'string' ||
        videoData.videoId.trim() === '') {
        console.error('❌ videoData inválido:', videoData);
        if (this.core) this.core.showMessage('Error: Video inválido', 'error');
        return;
    }

    // ✅ VALIDACIÓN ADICIONAL: Título debe existir
    if (!videoData.title || videoData.title.trim() === '') {
        console.warn('⚠️ Video sin título, usando fallback');
        videoData.title = 'Video sin título';
    }

    // 2. SINCRONIZACIÓN CRÍTICA CON CORE
    if (this.core && this.core.playlistsData) {
        this.playlistsData = this.core.playlistsData;
    }

    // 3. OBTENCIÓN DE LA COLA
    let queue = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);

    if (!queue) {
        console.log('✨ Creando cola nueva...');
        queue = {
            id: 'queue',
            name: 'Cola de Reproducción',
            thumbnailUrl: './electronic.ico',
            videos: [],
            isExpanded: true,
            isQueue: true
        };
        this.playlistsData.unshift(queue);
        if (this.core) this.core.playlistsData = this.playlistsData;
    }

    // 4. NORMALIZAR DATOS
    const videoToAdd = {
        videoId: videoData.videoId.trim(),
        title: videoData.title.trim(),
        thumbnail: videoData.thumbnail || videoData.thumbnailUrl || './electronic.ico',
        duration: parseInt(videoData.duration) || 0,
        uploaderName: videoData.uploaderName || videoData.artist || 'Desconocido',
        artist: videoData.artist || videoData.uploaderName || 'Desconocido',
        sourcePlaylistId: 'queue'
    };

    // 5. VERIFICAR DUPLICADOS
    const isDuplicate = queue.videos.some(v => v.videoId === videoToAdd.videoId);
    if (isDuplicate) {
        if (this.core) this.core.showMessage(`"${videoToAdd.title}" ya está en la cola`, 'warning');
        return;
    }

    // 6. AÑADIR A LA COLA
    if (fromPlaylist) {
        queue.videos.push(videoToAdd);
    } else {
        const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
        if (currentIndex === -1 || currentIndex >= queue.videos.length - 1) {
            queue.videos.push(videoToAdd);
        } else {
            queue.videos.splice(currentIndex + 1, 0, videoToAdd);
        }
    }

    // 7. ACTUALIZACIÓN VISUAL Y DE ESTADO
    this.updateQueueUI();
    
    if (this.core) {
        this.core.showMessage(`Añadido: ${videoToAdd.title}`, 'success');
        
        if (typeof this.core.enablePlayButton === 'function') {
            this.core.enablePlayButton(); 
        }
    }

    // 8. GUARDAR
    setTimeout(() => {
        if (typeof window.saveAllData === 'function') window.saveAllData();
    }, 100);
}
// Asegúrate de tener esta función auxiliar para clicks en la biblioteca
handleLibraryItemClick(item, isPlaylist) {
    if (isPlaylist) {
        // Si es playlist, cargar sus videos y añadir al FINAL
        console.log('📂 Añadiendo playlist entera al final de la cola...');
        this.loadPlaylistVideos(item.id).then(videos => {
            videos.forEach(v => this.addVideoToQueue(v, true)); // true = al final
            this.core.showMessage(`${videos.length} videos añadidos al final`, 'success');
        });
    } else {
        // Si es video suelto, añadir DESPUÉS DEL ACTUAL
        console.log('🎵 Añadiendo video siguiente...');
        this.addVideoToQueue(item, false); // false = lógica inteligente (next)
    }
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
    
async loadPlaylistVideos(playlistId) {
    console.log(`📥 Cargando videos de playlist: ${playlistId}`);
    
    const playlist = this.playlistsData.find(p => p.id === playlistId);
    if (!playlist) {
        console.error(`❌ Playlist ${playlistId} no encontrada`);
        return false;
    }
    
    if (playlist.isLoaded && playlist.videos.length > 0) {
        console.log(`✅ Playlist ya cargada con ${playlist.videos.length} videos`);
        return true;
    }
    
    try {
        if (!window.gapi?.client?.youtube) {
            console.error('❌ Google API no está disponible');
            this.core?.showMessage('Error: API de YouTube no disponible', 'error');
            return false;
        }
        
        this.core?.showMessage('Cargando videos...', 'info');
        
        let allVideos = [];
        let nextPageToken = null;
        
        // ✅ PASO 1: Cargar metadata de la playlist
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                part: ['snippet', 'contentDetails'],
                playlistId: playlistId,
                maxResults: 50,
                pageToken: nextPageToken
            });
            
            if (response.result.items) {
                const videos = response.result.items
                    .map(item => ({
                        videoId: item.contentDetails?.videoId,
                        title: item.snippet?.title || 'Sin título',
                        thumbnail: item.snippet?.thumbnails?.high?.url || 
                                  item.snippet?.thumbnails?.default?.url || 
                                  './electronic.ico',
                        duration: 0, // Se obtendrá después
                        uploaderName: item.snippet?.videoOwnerChannelTitle || 'YouTube',
                        author: item.snippet?.videoOwnerChannelTitle || 'YouTube',
                        sourcePlaylistId: playlistId
                    }))
                    .filter(v => v.videoId && !v.title.toLowerCase().includes('deleted'));
                
                allVideos.push(...videos);
            }
            
            nextPageToken = response.result.nextPageToken;
            
        } while (nextPageToken);
        
        console.log(`📦 ${allVideos.length} videos obtenidos, cargando duraciones...`);
        
        // ✅ PASO 2: Obtener duraciones en lotes
        if (allVideos.length > 0 && this.core) {
            try {
                const videoIds = allVideos.map(v => v.videoId);
                
                // Procesar en lotes de 50
                for (let i = 0; i < videoIds.length; i += 50) {
                    const batch = videoIds.slice(i, i + 50);
                    
                    console.log(`⏱️ Cargando duraciones del lote ${Math.floor(i/50) + 1}...`);
                    
                    const response = await gapi.client.youtube.videos.list({
                        part: ['contentDetails'],
                        id: batch.join(',')
                    });
                    
                    if (response.result.items) {
                        response.result.items.forEach(videoData => {
                            const video = allVideos.find(v => v.videoId === videoData.id);
                            if (video && videoData.contentDetails?.duration) {
                                // ✅ Usar parseDuration del core
                                video.duration = this.core.parseDuration(videoData.contentDetails.duration);
                                console.log(`✅ ${video.videoId}: ${video.duration}s`);
                            }
                        });
                    }
                }
                
                console.log(`✅ Duraciones cargadas para ${allVideos.length} videos`);
            } catch (durationError) {
                console.warn('⚠️ Error obteniendo duraciones:', durationError);
            }
        }
        
        playlist.videos = allVideos;
        playlist.isLoaded = true;
        
        this.core?.showMessage(`${allVideos.length} videos cargados con duraciones`, 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Error cargando videos:', error);
        this.core?.showMessage('Error cargando videos: ' + error.message, 'error');
        return false;
    }
}
    /**
     * Eliminar video de la cola
     */

removeVideoFromQueue(videoId) {
    console.log(`🗑️ removeVideoFromQueue: ${videoId}`);
    
    // ✅ VALIDACIÓN MEJORADA
    if (!videoId || videoId === 'undefined' || typeof videoId !== 'string') {
        console.error('❌ videoId inválido:', videoId);
        return false;
    }
    
    const queuePlaylist = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);
    if (!queuePlaylist || !queuePlaylist.videos) {
        console.error('❌ Cola no encontrada');
        return false;
    }
    
    const videoIndex = queuePlaylist.videos.findIndex(v => v && v.videoId === videoId);
    
    if (videoIndex === -1) {
        console.error(`❌ Video ${videoId} no encontrado en cola`);
        return false;
    }
    
    const removedVideo = queuePlaylist.videos[videoIndex];
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    const wasCurrentlyPlaying = (currentIndex === videoIndex);
    
    console.log(`🗑️ Eliminando: "${removedVideo.title}" (índice ${videoIndex})`);
    console.log(`📊 Estado antes: currentIndex=${currentIndex}, queueLength=${queuePlaylist.videos.length}`);
    
    // ✅ ELIMINAR VIDEO
    queuePlaylist.videos.splice(videoIndex, 1);
    
    console.log(`✅ Eliminado. Quedan ${queuePlaylist.videos.length} videos`);
    
    // ✅ AJUSTAR ÍNDICE DE REPRODUCCIÓN
    if (wasCurrentlyPlaying) {
        console.log('⚠️ Video eliminado era el que estaba sonando');
        
        if (queuePlaylist.videos.length > 0) {
            // Calcular nuevo índice
            let newIndex = videoIndex;
            if (newIndex >= queuePlaylist.videos.length) {
                newIndex = queuePlaylist.videos.length - 1;
            }
            
            // Actualizar índice global
            if (window.currentPlayingInfo) {
                window.currentPlayingInfo.flattenedIndex = newIndex;
                window.currentPlayingInfo.videoId = queuePlaylist.videos[newIndex].videoId;
            }
            
            console.log(`📊 Nuevo índice: ${newIndex}`);
            
            // Reproducir siguiente video después de un breve delay
            setTimeout(() => {
                const nextVideo = queuePlaylist.videos[newIndex];
                if (nextVideo && this.core?.playVideoAtIndex) {
                    this.core.playVideoAtIndex(newIndex);
                }
            }, 300);
        } else {
            // Cola vacía
            console.log('📭 Cola vacía después de eliminar');
            this.core?.handleEmptyPlaylist?.();
        }
    } else if (window.currentPlayingInfo && videoIndex < currentIndex) {
        // Si eliminamos un video ANTES del actual, ajustar índice
        window.currentPlayingInfo.flattenedIndex = currentIndex - 1;
        console.log(`📊 Índice ajustado a: ${window.currentPlayingInfo.flattenedIndex}`);
    }
    
    // ✅ ELIMINAR ELEMENTO DEL DOM CON ANIMACIÓN
    const queueItems = document.querySelectorAll(`.queue-item[data-video-id="${videoId}"]`);
    queueItems.forEach(item => {
        item.classList.add('removing');
        setTimeout(() => item.remove(), 300);
    });
    
    // ✅ ACTUALIZAR UI (después de la animación)
    setTimeout(() => {
        this.updatePlaylistsUI();
        this.updateQueuePopup();
        
        if (this.core && this.core.updatePersistentQueue) {
            this.core.updatePersistentQueue();
        }
        
        this.core?.updateNowPlaying?.();
        
        // Sincronizar indicadores
        if (window.playlistManager?.syncQueueIndicator) {
            window.playlistManager.syncQueueIndicator();
        }
        
        // Re-activar drag & drop
        if (window.queueDragDrop) {
            setTimeout(() => {
                window.queueDragDrop.attachDragListeners();
            }, 100);
        }
    }, 350);
    
    // ✅ GUARDAR CAMBIOS
    setTimeout(() => {
        if (typeof window.saveAllData === 'function') {
            window.saveAllData();
        }
    }, 400);
    
    this.core?.showMessage(`Eliminado: ${removedVideo.title}`, 'success');
    
    return true;
}
    
// =============================================
// GESTIÓN DE TABS EN LA COLA
// =============================================
switchQueueTab(tabName) {
    console.log(`🔄 Cambiando a tab: ${tabName}`);
    
    // 1. Detener sincronización de letras si salimos
    if (tabName !== 'lyrics') {
        if (this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
            this.lyricsSyncInterval = null;
        }
    }
    
    // 2. Actualizar UI
    document.querySelectorAll('.queue-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.queue-list-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tabContent === tabName);
    });
    
    // 3. ✅ OBTENER VIDEO REAL DEL REPRODUCTOR
    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    
    if (!activePlayer || typeof activePlayer.getVideoData !== 'function') {
        console.warn('⚠️ No hay reproductor activo');
        return;
    }
    
    const videoData = activePlayer.getVideoData();
    const currentVideoId = videoData?.video_id;
    
    if (!currentVideoId) {
        console.warn('⚠️ No hay video reproduciéndose');
        return;
    }
    
    // 4. ✅ Buscar video en cola
    const flatList = this.core?.getFlattenedPlaylist() || [];
    const currentVideo = flatList.find(v => v.videoId === currentVideoId);
    
    if (!currentVideo) {
        console.warn(`⚠️ Video ${currentVideoId} no encontrado`);
        return;
    }
    
    // 5. ✅ Cargar contenido correcto
    if (tabName === 'lyrics') {
        setTimeout(() => {
            this.loadLyricsForVideo(currentVideo);
        }, 100);
    } else if (tabName === 'related' && !this.relatedLoaded) {
        setTimeout(() => this.loadRelatedVideos(), 100);
        this.relatedLoaded = true;
    }
}

 /**
 * Cargar relacionados para un video específico
 */
async loadRelatedForVideo(video) {
    const relatedList = document.getElementById('relatedVideosList');
    
    if (!video || !video.videoId) {
        relatedList.innerHTML = `<p class="related-placeholder">Video no válido</p>`;
        this.lastLoadedRelatedId = null;
        return;
    }
    
    console.log(`🎵 Cargando relacionados EXPLÍCITOS para: ${video.title} (${video.videoId})`);
    
    // ✅ CACHÉ: Si ya están cargados para ESTE video
    if (this.lastLoadedRelatedId === video.videoId) {
        const existingItems = relatedList.querySelectorAll('.related-video-item');
        if (existingItems.length > 0) {
            console.log('✅ Relacionados ya cargados para este video');
            return;
        }
    }
    
    this.lastLoadedRelatedId = video.videoId;
    
    relatedList.innerHTML = `<p style="text-align:center; padding:20px; color:#888;">Cargando...</p>`;
    
    try {
        const { artist, title } = this.extractArtistFromTitle(video.title);
        const searchQuery = artist !== 'Desconocido' ? artist : title;
        
        console.log(`🔍 Buscando relacionados: "${searchQuery}"`);
        
        const searchResults = await window.youtubeJSClient.search(searchQuery);
        
        if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
            throw new Error('Sin resultados');
        }
        
        // Filtrar el video actual
        const relatedVideos = searchResults.items
            .filter(v => v.videoId !== video.videoId)
            .slice(0, 15);
        
        this.renderRelatedVideos(relatedVideos, relatedList);
        
    } catch (error) {
        console.error('❌ Error cargando relacionados:', error);
        relatedList.innerHTML = `
            <div class="related-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>No se pudieron cargar sugerencias</p>
            </div>
        `;
    }
}   
/**
 * Fallback usando búsqueda
 */
async loadRelatedVideosFallback(currentVideo, relatedList) {
    console.log('🔄 Usando fallback para videos relacionados...');
    
    // CORRECCIÓN: Agregar 'this.' antes de extractArtistFromTitle
const artist = this.extractArtistFromTitle(currentVideo.title);
const searchQuery = artist !== 'Desconocido' ? artist : currentVideo.title.split('-')[0].trim();
    
    console.log(`🔍 Buscando: "${searchQuery}"`);
    
    const searchResults = await window.youtubeJSClient.search(searchQuery);
    
    if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
        throw new Error('No se encontraron resultados en búsqueda');
    }
    
    // Filtrar el video actual
    const relatedVideos = searchResults.items
        .filter(video => video.videoId !== currentVideo.videoId)
        .slice(0, 15);
    
    this.renderRelatedVideos(relatedVideos, relatedList);
}

refreshActiveQueueTab() {
    const activeTab = document.querySelector('.queue-tab.active');
    if (!activeTab) return;

    const tabName = activeTab.dataset.tab;
    
    // 1. Detener sincronización de letras si salimos
    if (tabName !== 'lyrics') {
        if (this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
            this.lyricsSyncInterval = null;
        }
    }
    
    // 2. Actualizar UI de tabs
    document.querySelectorAll('.queue-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.queue-list-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tabContent === tabName);
    });
    
    // ✅ CORRECCIÓN: Obtener video del PLAYER directamente (sin find recursivo)
    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    
    if (!activePlayer || typeof activePlayer.getVideoData !== 'function') {
        console.warn('⚠️ No hay reproductor activo');
        return;
    }
    
    const videoData = activePlayer.getVideoData();
    const currentVideoId = videoData?.video_id;
    
    if (!currentVideoId) {
        console.warn('⚠️ No hay video reproduciéndose');
        return;
    }
    
    // ✅ BÚSQUEDA DIRECTA Y SEGURA (sin llamar a getFlattenedPlaylist)
    const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
    
    if (!queuePlaylist || !queuePlaylist.videos) {
        console.warn('⚠️ Cola no encontrada');
        return;
    }
    
    // Búsqueda simple sin recursión
    let currentVideo = null;
    for (let i = 0; i < queuePlaylist.videos.length; i++) {
        if (queuePlaylist.videos[i].videoId === currentVideoId) {
            currentVideo = queuePlaylist.videos[i];
            break;
        }
    }
    
    if (!currentVideo) {
        console.warn(`⚠️ Video ${currentVideoId} no encontrado en cola`);
        return;
    }
    
    console.log(`🎵 Refrescando tab "${tabName}" para:`, currentVideo.title);
    
    // Cargar contenido según el tab activo
    if (tabName === 'lyrics') {
        setTimeout(() => {
            this.loadLyricsForVideo(currentVideo);
        }, 100);
    } else if (tabName === 'related') {
        setTimeout(() => {
            this.loadRelatedForVideo(currentVideo);
        }, 100);
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
    // ✅ CRÍTICO: Limpiar intervalo anterior si existe
    if (this.lyricsSyncInterval) {
        clearInterval(this.lyricsSyncInterval);
        this.lyricsSyncInterval = null;
    }
    
    // ✅ Resetear índice anterior
    this.lastActiveLineIndex = -1;
    
    console.log('🎵 Iniciando sincronización de letras...');
    
    // ✅ Revisa cada 250ms (4 veces por segundo)
    this.lyricsSyncInterval = setInterval(() => {
        this.syncLyricsLine();
    }, 250);
    
    console.log('✅ Sincronización de letras activa (ID:', this.lyricsSyncInterval, ')');
}

    /**
     * Sincroniza la línea activa de la letra con el tiempo del video
     */
syncLyricsLine() {
    // Validaciones básicas
    if (!this.core || !this.currentLrc || this.currentLrc.length === 0) return;

    // Detectar qué reproductor está sonando realmente
    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    
    // Asegurar que el reproductor está activo y tiene la función getCurrentTime
    if (!activePlayer || typeof activePlayer.getCurrentTime !== 'function') return;

    const currentTime = activePlayer.getCurrentTime();
    const container = document.getElementById('syncedLyricsContainer');
    if (!container) return;

    // Encontrar la línea activa (con una compensación de 0.2s para que se sienta a tiempo)
    let activeLineIndex = -1;
    for (let i = this.currentLrc.length - 1; i >= 0; i--) {
        if (currentTime >= (this.currentLrc[i].time - 0.2)) {
            activeLineIndex = i;
            break;
        }
    }

    // OPTIMIZACIÓN CLAVE: Solo actualizar el DOM si la línea cambió
    // Esto evita que se "trabe" o parpadee
    if (this.lastActiveLineIndex === activeLineIndex) return;
    this.lastActiveLineIndex = activeLineIndex;

    const allLines = container.querySelectorAll('p');
    
    allLines.forEach((line, index) => {
        // Limpiar clases anteriores
        line.className = ''; 

        if (index === activeLineIndex) {
            line.classList.add('active');
            
            // Scroll suave tipo Spotify: siempre al centro
            line.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
        } else if (index < activeLineIndex) {
            line.classList.add('past'); // Líneas ya cantadas
        } else {
            line.classList.add('future'); // Líneas futuras
        }
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
     * Renderizar letras (Puente compatible)
     */
    renderLyrics(data) {
        // Obtener metadatos actuales para el header
        const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
        const flatList = this.core?.getFlattenedPlaylist() || [];
        const currentVideo = flatList[currentIndex];
        
        // Llamar a la función UI real pasando los datos
        // renderLyricsUI espera: (match, originalArtist, originalTitle)
        
        // Adaptar el objeto 'data' al formato 'match' que espera renderLyricsUI
        const match = {
            syncedLyrics: data.syncedLyrics,
            plainLyrics: data.plainLyrics,
            source: data.source || 'Desconocido',
            trackName: currentVideo?.title,
            artistName: currentVideo?.artist || currentVideo?.uploaderName
        };

        this.renderLyricsUI(match, match.artistName, match.trackName);
    }   
renderLyricsUI(match, originalArtist, originalTitle) {
        const lyricsContainer = document.getElementById('lyricsContent');
        const trackName = match.trackName || originalTitle;
        const artistName = match.artistName || originalArtist;
        const albumInfo = match.albumName ? ` • 💿 ${match.albumName}` : '';

        // Header con botón de traducir
        const headerHtml = `
            <div class="lyrics-header">
                <i class="fas fa-music"></i>
                <div style="flex:1; overflow:hidden;">
                    <p style="font-weight:bold;">${this.escapeHTML(trackName)}</p>
                    <p class="lyrics-artist-header" style="margin:0; font-size:12px;">
                        ${this.escapeHTML(artistName)}${this.escapeHTML(albumInfo)}
                    </p>
                </div>
                <button id="translateLyricsBtn" class="lyrics-provider-btn" title="Traducir al español">
                    <i class="fas fa-language"></i>
                </button>
                <button id="lyricsProviderToggle" class="lyrics-provider-btn" title="Cambiar proveedor">
                    <i class="fas fa-sync-alt"></i> ${this.lyricsProvider}
                </button>
            </div>`;

        let contentHtml = '';

        if (match.instrumental) {
            contentHtml = `
                <div class="lyrics-text plain" style="display:flex; justify-content:center; align-items:center; height:300px; flex-direction:column;">
                    <i class="fas fa-guitar" style="font-size:40px; margin-bottom:15px; opacity:0.5;"></i>
                    <p>Instrumental</p>
                </div>`;
        } else if (match.syncedLyrics) {
            this.currentLrc = this.parseLRC(match.syncedLyrics);
            contentHtml = `
                <div class="lyrics-text synced" id="syncedLyricsContainer">
                    ${this.currentLrc.map(l => `<p data-time="${l.time}">${this.escapeHTML(l.text)}</p>`).join('')}
                </div>`;
            setTimeout(() => this.startLyricsSync(), 100);
        } else if (match.plainLyrics) {
            contentHtml = `
                <div class="lyrics-text plain">
                    ${this.escapeHTML(match.plainLyrics).replace(/\n/g, '<br>')}
                </div>`;
        } else {
            throw new Error('Sin datos de letra');
        }

        lyricsContainer.innerHTML = `
            <div class="lyrics-container">
                ${headerHtml}
                ${contentHtml}
                <p class="lyrics-source">Fuente: ${match.source}</p>
            </div>`;

        // Configurar los botones
        this.setupLyricsHeaderButtons();
}
    setupLyricsHeaderButtons() {
        // Botón Proveedor
        const providerBtn = document.getElementById('lyricsProviderToggle');
        if (providerBtn) {
            providerBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleLyricsProvider();
            };
        }

        // Botón Traducir
        const translateBtn = document.getElementById('translateLyricsBtn');
        if (translateBtn) {
            translateBtn.onclick = (e) => {
                e.stopPropagation();
                this.translateLyrics(); // Llamada a la función de traducción
            };
        }
    }
    renderErrorUI(title) {
        const lyricsContainer = document.getElementById('lyricsContent');
        lyricsContainer.innerHTML = `
            <div class="lyrics-container">
                <div class="lyrics-header">
                    <i class="fas fa-exclamation-circle"></i><p>No encontradas</p>
                    <button id="lyricsProviderToggle" class="lyrics-provider-btn">
                        <i class="fas fa-sync-alt"></i> ${this.lyricsProvider}
                    </button>
                </div>
                <p class="lyrics-info">"${this.escapeHTML(title)}"</p>
                <p class="lyrics-info" style="font-size:11px; opacity:0.5">Intenta cambiar de proveedor</p>
            </div>`;
    }
cleanTrackTitle(title) {
    if (!title) return '';
    
    let clean = title;

    // 1. Eliminar Emojis
    const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;
    clean = clean.replace(emojiRegex, '');

    // 2. Eliminar colaboraciones y productores (ft., feat., prod.)
    clean = clean.replace(/\s(ft\.|feat\.|featuring|vs\.|x|with|prod\.|produced by)\s.*/i, '');

    // 3. Eliminar contenido entre paréntesis/corchetes que sea "ruido"
    const noiseKeywords = 'official|video|audio|lyrics|visualizer|hd|hq|4k|8k|live|vivo|version|remaster|extended|radio|original|cover|acoustic|instrumental|karaoke|bpm|remix|rmx|mix|edit|mashup|bootleg|dj|set|session|topic';
    
    clean = clean.replace(new RegExp(`\\s*[\\(\\[].*?(${noiseKeywords}).*?[\\)\\]]`, 'gi'), '');
    
    // 4. Eliminar palabras clave sueltas al final
    clean = clean.replace(new RegExp(`\\s*[-:]?\\s*(${noiseKeywords})$`, 'gi'), '');

    // 5. CORRECCIÓN ESPECÍFICA: Eliminar letra "s" suelta al final
    clean = clean.replace(/\s+s$/i, '');

    // 6. Limpieza final de caracteres y espacios
    clean = clean.replace(/["“”]/g, ''); // Comillas
    clean = clean.split('|')[0]; // Separadores de tubo
    
    // Si el título es "Artista - Titulo", quedarse solo con el titulo
    if (clean.includes(' - ')) {
        const parts = clean.split(' - ');
        if (parts.length > 1) clean = parts[1];
    }

    const finalTitle = clean.replace(/\s+/g, ' ').trim();
    
    // Fallback: Si la limpieza borró todo (ej: título era solo emojis), usar original
    return finalTitle.length > 0 ? finalTitle : title;
}
async loadLyrics() {
    const lyricsContainer = document.getElementById('lyricsContent');
    const providerBtn = document.getElementById('lyricsProviderToggle');
    
    // Obtener video actual
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    const allPlaylists = this.playlists || window.unifiedCore?.playlistsData || [];
    const queue = allPlaylists.find(p => p.id === 'queue');
    const currentVideo = queue?.videos[currentIndex];

    if (!currentVideo) {
        lyricsContainer.innerHTML = '<p class="lyrics-info">Reproduce música...</p>';
        if(providerBtn) providerBtn.style.display = 'none';
        return;
    }

    // ✅ CORRECCIÓN: Validar caché correctamente
    const cacheKey = `${currentVideo.videoId}_${this.lyricsProvider}`;
    const cachedLyrics = sessionStorage.getItem(cacheKey);
    
    if (cachedLyrics && this.lastLoadedLyricsId === currentVideo.videoId) {
        try {
            const parsed = JSON.parse(cachedLyrics);
            console.log('✅ Usando letras cacheadas');
            this.renderLyrics(parsed);
            if (providerBtn) providerBtn.style.display = 'inline-flex';
            return;
        } catch (e) {
            console.warn('⚠️ Cache inválido, recargando...');
            sessionStorage.removeItem(cacheKey);
        }
    }
    
    this.lastLoadedLyricsId = currentVideo.videoId;

    // ✅ Loading mejorado
    lyricsContainer.innerHTML = `
        <div class="lyrics-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando letras...</p>
        </div>
    `;
    
    if(providerBtn) providerBtn.style.display = 'none';

    try {
        const artist = currentVideo.artist || currentVideo.uploaderName || '';
        const title = currentVideo.title || '';
        const duration = currentVideo.duration || 0;

        console.log(`🔍 Buscando letras para: ${title} (${this.lyricsProvider})`);

        let data = null;
        let usedProvider = this.lyricsProvider;

        // 1. INTENTO PRINCIPAL
        try {
            data = await this.fetchLyrics(this.lyricsProvider, artist, title, duration);
        } catch (e) {
            console.warn(`⚠️ Falló proveedor principal (${this.lyricsProvider}):`, e.message);
        }

        // 2. FALLBACK AUTOMÁTICO
        if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
            const fallbackProvider = (this.lyricsProvider === 'lrclib') ? 'lujjjh' : 'lrclib';
            console.log(`🔄 Intentando fallback: ${fallbackProvider}`);
            
            try {
                data = await this.fetchLyrics(fallbackProvider, artist, title, duration);
                if (data && (data.syncedLyrics || data.plainLyrics)) {
                    usedProvider = fallbackProvider;
                }
            } catch (e) {
                console.warn('❌ Fallback también falló:', e.message);
            }
        }

        // 3. RENDERIZADO
        if (data && (data.syncedLyrics || data.plainLyrics)) {
            // Guardar en caché
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify(data));
            } catch (e) {
                console.warn('⚠️ No se pudo cachear letras');
            }
            
            this.renderLyrics(data);
            
            // LÓGICA DEL BOTÓN
            if (usedProvider !== this.lyricsProvider) {
                // Fallback usado - ocultar botón
                if(providerBtn) providerBtn.style.display = 'none';
                console.log('✅ Letra encontrada con fallback. Botón oculto.');
            } else {
                // Proveedor original funcionó - mostrar botón
                if(providerBtn) {
                    providerBtn.style.display = 'inline-flex';
                    providerBtn.innerHTML = `<i class="fas fa-sync-alt"></i> ${usedProvider === 'lrclib' ? 'LRCLIB' : 'Lujjjh'}`;
                }
            }
        } else {
            // No se encontró en NINGUNO
            lyricsContainer.innerHTML = `
                <div class="lyrics-container">
                    <div class="lyrics-header">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>No encontradas</p>
                    </div>
                    <p class="lyrics-info">"${this.escapeHTML(title)}"</p>
                    <p class="lyrics-info" style="font-size:11px; opacity:0.5">Intenta cambiar de proveedor</p>
                </div>
            `;
            if(providerBtn) providerBtn.style.display = 'inline-flex';
        }

    } catch (error) {
        console.error('❌ Error general letras:', error);
        lyricsContainer.innerHTML = `
            <div class="lyrics-error">
                <i class="fas fa-times-circle"></i>
                <p>Error cargando letra</p>
                <small>${error.message}</small>
            </div>
        `;
        if(providerBtn) providerBtn.style.display = 'none';
    }
}

// ✅ CORRECCIÓN: fetchLyrics con mejor manejo de errores
async fetchLyrics(provider, rawArtist, rawTitle, duration) {
    const title = this.cleanTrackTitle(rawTitle);
    let artist = rawArtist || 'Desconocido';
    artist = artist.replace(/\s*-\s*Topic$/i, '').trim();

    console.log(`📡 Buscando [${provider}]: "${title}" - "${artist}"`);

    try {
        if (provider === 'lrclib') {
            // Intento 1: Búsqueda exacta
            const urlExact = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}&duration=${Math.round(duration)}`;
            let response = await fetch(urlExact);
            
            // Intento 2: Búsqueda flexible
            if (!response.ok) {
                console.log('⚠️ LRCLIB exacto falló, búsqueda flexible...');
                const query = `${artist} ${title}`;
                const urlSearch = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
                response = await fetch(urlSearch);
            }

            if (!response.ok) {
                throw new Error(`LRCLIB HTTP ${response.status}`);
            }

            const data = await response.json();
            const track = Array.isArray(data) ? data[0] : data;

            if (!track || (!track.syncedLyrics && !track.plainLyrics)) {
                throw new Error('Sin letras en respuesta');
            }

            return {
                syncedLyrics: track.syncedLyrics, 
                plainLyrics: track.plainLyrics,   
                source: 'LRCLIB',
                provider: 'lrclib'
            };

        } else if (provider === 'lujjjh') {
            const targetUrl = `https://lyrics-api.lujjjh.com/?name=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
            const proxyUrl = `/.netlify/functions/cors-proxy?url=${encodeURIComponent(targetUrl)}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) {
                throw new Error(`Lujjjh HTTP ${response.status}`);
            }

            const textData = await response.text();
            
            if (!textData || textData.length < 10 || textData.includes('Not found')) {
                throw new Error('Sin letras disponibles');
            }

            const plain = textData.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();

            return {
                syncedLyrics: textData,
                plainLyrics: plain,
                source: 'Lujjjh API',
                provider: 'lujjjh'
            };
        }

    } catch (error) {
        console.warn(`❌ Error en fetchLyrics (${provider}):`, error.message);
        throw error; // Re-lanzar para que el llamador maneje
    }

    throw new Error('Proveedor no soportado');
}

// ✅ CORRECCIÓN: toggleLyricsProvider con limpieza de caché
toggleLyricsProvider() {
    // Cambiar proveedor
    this.lyricsProvider = (this.lyricsProvider === 'lrclib') ? 'lujjjh' : 'lrclib';
    
    console.log(`🎵 Proveedor cambiado a: ${this.lyricsProvider}`);
    
    // Guardar preferencia
    localStorage.setItem('ytcm_lyrics_provider', this.lyricsProvider);
    
    // ✅ CORRECCIÓN: Limpiar caché del video actual
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    const queue = this.playlistsData.find(p => p.id === 'queue');
    const currentVideo = queue?.videos[currentIndex];
    
    if (currentVideo) {
        // Limpiar ambos cachés
        sessionStorage.removeItem(`${currentVideo.videoId}_lrclib`);
        sessionStorage.removeItem(`${currentVideo.videoId}_lujjjh`);
    }
    
    // Forzar recarga
    this.lastLoadedLyricsId = null;
    this.loadLyrics();
    
    if (this.core) {
        this.core.showMessage(
            `Proveedor: ${this.lyricsProvider === 'lrclib' ? 'LRCLIB' : 'Lujjjh'}`, 
            'info'
        );
    }
}
 /**
 * ✅ NUEVA FUNCIÓN: Cargar letras para un video específico
 */
async loadLyricsForVideo(video) {
    const lyricsContainer = document.getElementById('lyricsContent');
    const providerBtn = document.getElementById('lyricsProviderToggle');
    
    if (!video || !video.videoId) {
        lyricsContainer.innerHTML = '<p class="lyrics-info">Video no válido</p>';
        if (providerBtn) providerBtn.style.display = 'none';
        return;
    }
    
    console.log(`🎵 Cargando letras EXPLÍCITAS para: ${video.title} (${video.videoId})`);
    
    // ✅ CACHÉ: Si ya están cargadas para ESTE video específico
    if (this.lastLoadedLyricsId === video.videoId) {
        const existingLyrics = lyricsContainer.querySelector('.lyrics-text');
        if (existingLyrics && existingLyrics.textContent.trim().length > 0) {
            console.log('✅ Letras ya cargadas para este video');
            if (this.currentLrc && this.currentLrc.length > 0) {
                this.startLyricsSync();
            }
            if (providerBtn) providerBtn.style.display = 'inline-flex';
            return;
        }
    }
    
    // ✅ Marcar este video como el último procesado
    this.lastLoadedLyricsId = video.videoId;
    
    // Loading
    lyricsContainer.innerHTML = `<p style="text-align:center; color:#888; padding:20px;">Cargando letras...</p>`;
    if (providerBtn) providerBtn.style.display = 'none';
    
    try {
        const artist = video.artist || video.uploaderName || '';
        const title = video.title || '';
        const duration = video.duration || 0;
        
        console.log(`🔍 Búsqueda: "${title}" por "${artist}" (${duration}s)`);
        
        let data = null;
        let usedProvider = this.lyricsProvider;
        
        // Intento principal
        try {
            data = await this.fetchLyrics(this.lyricsProvider, artist, title, duration);
        } catch (e) {
            console.warn(`⚠️ Falló ${this.lyricsProvider}, probando alternativa...`);
        }
        
        // Fallback
        if (!data) {
            const fallbackProvider = (this.lyricsProvider === 'lrclib') ? 'lujjjh' : 'lrclib';
            console.log(`🔄 Usando ${fallbackProvider}...`);
            
            try {
                data = await this.fetchLyrics(fallbackProvider, artist, title, duration);
                if (data) usedProvider = fallbackProvider;
            } catch (e) {
                console.warn('❌ Fallback también falló');
            }
        }
        
        // Renderizar
        if (data) {
            this.renderLyrics(data);
            
            if (usedProvider !== this.lyricsProvider) {
                if (providerBtn) providerBtn.style.display = 'none';
                console.log('✅ Letras con fallback, botón oculto');
            } else {
                if (providerBtn) {
                    providerBtn.style.display = 'inline-flex';
                    providerBtn.innerHTML = `<i class="fas fa-sync-alt"></i> ${usedProvider === 'lrclib' ? 'LRCLIB' : 'Lujjjh'}`;
                }
            }
        } else {
            lyricsContainer.innerHTML = `
                <div class="lyrics-container">
                    <div class="lyrics-header">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>No encontradas</p>
                    </div>
                    <p class="lyrics-info">"${this.escapeHTML(title)}"</p>
                </div>`;
            if (providerBtn) providerBtn.style.display = 'none';
        }
        
    } catch (error) {
        console.error('❌ Error cargando letras:', error);
        lyricsContainer.innerHTML = '<p class="lyrics-error">Error cargando letra.</p>';
        if (providerBtn) providerBtn.style.display = 'none';
    }
}   
    
    setupTranslateButton() {
    const translateBtn = document.getElementById('lyricsTranslateToggle');
    if (!translateBtn) return;
    
    // Mostrar botón solo si hay letras cargadas
    const lyricsText = document.querySelector('.lyrics-text');
    if (lyricsText && lyricsText.textContent.trim()) {
        translateBtn.style.display = 'inline-flex';
        
        translateBtn.onclick = async () => {
            if (this.lyricsTranslated) {
                // Ocultar traducción
                document.querySelectorAll('.lyrics-translation').forEach(el => el.remove());
                this.lyricsTranslated = false;
                translateBtn.innerHTML = '<i class="fas fa-language"></i>';
            } else {
                // Mostrar traducción
                await this.translateLyrics();
                this.lyricsTranslated = true;
                translateBtn.innerHTML = '<i class="fas fa-language"></i> ✓';
            }
        };
    }
}
async translateLyrics() {
    const btn = document.getElementById('translateLyricsBtn');
    const container = document.getElementById('lyricsContent');
    
    // --- (Lógica de toggle existente se mantiene igual) ---
    if (btn.classList.contains('translated')) {
        container.querySelectorAll('.lyrics-translation').forEach(el => el.remove());
        btn.classList.remove('translated');
        btn.innerHTML = '<i class="fas fa-language"></i>';
        btn.style.background = '';
        return;
    }

    // Feedback de carga
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    // --- (Obtención del texto se mantiene igual) ---
    const syncedLines = container.querySelectorAll('.lyrics-text.synced p');
    const plainContainer = container.querySelector('.lyrics-text.plain');
    
    let textToTranslate = "";
    let isSynced = false;

    if (syncedLines.length > 0) {
        isSynced = true;
        textToTranslate = Array.from(syncedLines).map(p => p.textContent).join(' ||| ');
    } else if (plainContainer) {
        textToTranslate = plainContainer.innerText;
    }

    if (!textToTranslate) {
        // ... manejo de error vacío ...
        btn.innerHTML = originalIcon;
        btn.disabled = false;
        return;
    }

    try {
        console.log('🌐 Traduciendo letras (vía POST)...');
        
        // 1. URL base de Google (SIN el texto 'q')
        const googleBaseUrl = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t";
        
        // 2. URL del Proxy apuntando a la base de Google
        const proxyUrl = `/.netlify/functions/cors-proxy?url=${encodeURIComponent(googleBaseUrl)}`;

        // 3. Preparar los datos para enviar por POST (Body)
        // Usamos URLSearchParams para formato 'application/x-www-form-urlencoded' que Google espera
        const postData = new URLSearchParams();
        postData.append('q', textToTranslate);

        // 4. Petición Fetch con método POST
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData
        });

        if (!response.ok) throw new Error(`Error en traducción: ${response.status}`);
        
        const data = await response.json();
        
        // Procesar respuesta de Google
        let fullTranslation = "";
        if (data && data[0]) {
            fullTranslation = data[0].map(item => item[0]).join('');
        }

        // Limpieza opcional por seguridad
        try {
            fullTranslation = decodeURIComponent(fullTranslation);
        } catch (e) {}

        // --- (Inyección en el DOM - Se mantiene igual) ---
        if (isSynced) {
            const translatedLines = fullTranslation.split(' ||| ');
            syncedLines.forEach((line, index) => {
                if (translatedLines[index]) {
                    const transEl = document.createElement('span');
                    transEl.className = 'lyrics-translation';
                    transEl.textContent = translatedLines[index].trim();
                    transEl.style.cssText = "display:block; font-size:0.85em; color:#4caf50; font-style:italic; margin-top:2px; opacity:0.9;";
                    line.appendChild(transEl);
                }
            });
        } else if (plainContainer) {
            const transDiv = document.createElement('div');
            transDiv.className = 'lyrics-translation';
            transDiv.innerHTML = `<hr style="border-color:#333; margin:20px 0;"><strong>Traducción:</strong><br><br>${fullTranslation.replace(/\n/g, '<br>')}`;
            transDiv.style.color = "#4caf50";
            plainContainer.appendChild(transDiv);
        }

        // Éxito
        btn.classList.add('translated');
        btn.innerHTML = '<i class="fas fa-check"></i> ES';
        btn.style.background = 'rgba(76, 175, 80, 0.2)';

    } catch (error) {
        console.error('❌ Error traduciendo:', error);
        this.core?.showMessage('Error al traducir (Intenta de nuevo)', 'error');
        btn.innerHTML = originalIcon;
    } finally {
        btn.disabled = false;
    }
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
    
updateQueueUI() {
    console.log('🔄 Actualizando interfaz de cola...');
    
    // 1. Obtener datos actualizados
    const queuePlaylist = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);
    const videos = queuePlaylist ? queuePlaylist.videos : [];
    
    // 2. Actualizar contadores globales
    if (this.core && this.core.updateQueueCount) {
        this.core.updateQueueCount(videos.length);
    }

    // Aseguramos que si existía, se borre siempre
    const existingBtn = document.querySelector('.play-queue-btn');
    if (existingBtn) existingBtn.remove();
    
    // 4. Si existe un contenedor de lista de cola en el DOM, actualizarlo
    const queueListContainer = document.getElementById('queueContentList');
    if (queueListContainer) {
        if (videos.length === 0) {
            queueListContainer.innerHTML = `
                <div class="empty-queue-placeholder">
                    <p>La cola está vacía</p>
                </div>`;
        } else {
            // ✅ CORRECCIÓN: Renderizar directamente sin llamar a core
            const fragment = document.createDocumentFragment();
            
            videos.forEach((video, index) => {
                if (!video || !video.videoId) return;
                
                const duration = video.duration && video.duration > 0 
                    ? this.formatDuration(video.duration) 
                    : '--:--';
                
                const queueItem = document.createElement('div');
                queueItem.className = 'queue-item';
                queueItem.dataset.videoId = video.videoId;
                queueItem.dataset.flatIndex = index;
                
                queueItem.innerHTML = `
                    <div class="queue-item-number">${index + 1}</div>
                    <div class="queue-item-thumbnail-wrapper">
                        <img src="${video.thumbnail || './electronic.ico'}" 
                             alt="${this.escapeHTML(video.title)}" 
                             onerror="this.src='./electronic.ico';">
                        <span class="queue-item-duration">${duration}</span>
                    </div>
                    <div class="queue-item-info">
                        <div class="queue-item-title">${this.escapeHTML(video.title || 'Sin título')}</div>
                        <div class="queue-item-meta">
                            <span class="queue-item-author">${this.escapeHTML(video.uploaderName || 'Desconocido')}</span>
                        </div>
                    </div>
                    <button class="queue-item-remove" 
                            data-video-id="${video.videoId}" 
                            title="Eliminar de la cola">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                
                fragment.appendChild(queueItem);
            });
            
            queueListContainer.innerHTML = '';
            queueListContainer.appendChild(fragment);
            this.setupQueueItemListeners();
        }
    }
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
// CORRECCIÓN: Videos Relacionados en playlist.js
// Reemplazar loadRelatedVideos() y funciones relacionadas
// =============================================

async loadRelatedVideos() {
    const relatedList = document.getElementById('relatedVideosList');
    
    if (!relatedList) {
        console.error('❌ Contenedor relatedVideosList no encontrado');
        return;
    }

    // ✅ CORRECCIÓN: Obtener video del PLAYER directamente
    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    
    if (!activePlayer || typeof activePlayer.getVideoData !== 'function') {
        relatedList.innerHTML = `<p class="related-placeholder">No hay video reproduciéndose</p>`;
        this.lastLoadedRelatedId = null;
        return;
    }
    
    const videoData = activePlayer.getVideoData();
    const currentVideoId = videoData?.video_id;
    
    if (!currentVideoId) {
        relatedList.innerHTML = `<p class="related-placeholder">Reproduce una canción</p>`;
        this.lastLoadedRelatedId = null;
        return;
    }

    // ✅ CORRECCIÓN: Buscar video en cola de forma segura
    const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
    if (!queuePlaylist || !queuePlaylist.videos) {
        console.warn('⚠️ Cola no encontrada');
        return;
    }
    
    let currentVideo = null;
    for (let i = 0; i < queuePlaylist.videos.length; i++) {
        if (queuePlaylist.videos[i].videoId === currentVideoId) {
            currentVideo = queuePlaylist.videos[i];
            break;
        }
    }
    
    if (!currentVideo) {
        console.warn(`⚠️ Video ${currentVideoId} no encontrado en cola`);
        relatedList.innerHTML = `<p class="related-placeholder">Video no encontrado</p>`;
        return;
    }

    // ✅ CACHÉ: Verificar si ya están cargados
    if (this.lastLoadedRelatedId === currentVideo.videoId) {
        const existingItems = relatedList.querySelectorAll('.related-video-item');
        if (existingItems.length > 0) {
            console.log('✅ Relacionados ya cargados');
            return;
        }
    }

    this.lastLoadedRelatedId = currentVideo.videoId;
    relatedList.innerHTML = `
        <div class="related-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando sugerencias...</p>
        </div>
    `;

    try {
        // ✅ CORRECCIÓN: Usar extractArtistFromTitle correctamente
        const artist = this.extractArtistFromTitle(currentVideo.title);
        const searchQuery = artist !== 'Desconocido' ? artist : currentVideo.title;
        
        console.log(`🔍 Buscando relacionados: "${searchQuery}"`);
        
        const searchResults = await window.youtubeJSClient.search(searchQuery);
        
        if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
            throw new Error('Sin resultados');
        }
        
        // Filtrar video actual y limitar a 15
        const relatedVideos = searchResults.items
            .filter(video => video.videoId !== currentVideo.videoId)
            .slice(0, 15);
        
        if (relatedVideos.length === 0) {
            relatedList.innerHTML = `
                <div class="related-placeholder">
                    <i class="fas fa-music-slash"></i>
                    <p>No se encontraron videos relacionados</p>
                </div>
            `;
            return;
        }
        
        this.renderRelatedVideos(relatedVideos, relatedList);

    } catch (error) {
        console.error('❌ Error cargando relacionados:', error);
        relatedList.innerHTML = `
            <div class="related-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>No se pudieron cargar sugerencias</p>
                <small>${error.message}</small>
            </div>
        `;
    }
}

// ✅ CORRECCIÓN: renderRelatedVideos con duraciones correctas
renderRelatedVideos(videos, container) {
    if (!videos || videos.length === 0) {
        container.innerHTML = '<p class="related-placeholder">Sin videos para mostrar</p>';
        return;
    }

    const html = videos
        .map(video => {
            let videoId = video.videoId;
            
            // Extraer ID de URL si es necesario
            if (!videoId && video.url) {
                const match = video.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                videoId = match ? match[1] : null;
            }
            
            if (!videoId) return '';

            // ✅ CORRECCIÓN: Procesar duración correctamente
            let durationText = '';
            if (video.duration) {
                if (typeof video.duration === 'number') {
                    durationText = this.core?.formatDuration(video.duration) || '';
                } else if (typeof video.duration === 'string') {
                    const seconds = this.parseDurationToSeconds(video.duration);
                    durationText = this.core?.formatDuration(seconds) || video.duration;
                }
            }

            const thumbnail = video.thumbnail || './electronic.ico';
            const title = video.title || 'Sin título';
            const uploader = video.uploaderName || 'YouTube';

            return `
                <div class="related-video-item" 
                     data-video-id="${videoId}" 
                     title="${this.escapeHTML(title)}">
                    <div class="related-video-thumbnail-container">
                        <img src="${thumbnail}" 
                             alt="Thumbnail" 
                             class="related-video-thumbnail" 
                             onerror="this.src='./electronic.ico';">
                        ${durationText ? `<span class="related-video-duration">${durationText}</span>` : ''}
                    </div>
                    <div class="related-video-info">
                        <div class="related-video-title">${this.escapeHTML(title)}</div>
                        <div class="related-video-meta">
                            <span class="related-video-author">${this.escapeHTML(uploader)}</span>
                        </div>
                    </div>
                    <button class="related-video-add" 
                            data-video-id="${videoId}"
                            data-duration="${typeof video.duration === 'number' ? video.duration : this.parseDurationToSeconds(video.duration)}" 
                            title="Añadir a cola">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            `;
        })
        .filter(html => html !== '')
        .join('');
    
    container.innerHTML = html;
    this.setupRelatedVideosListeners();
}
setupRelatedVideosListeners() {
    const relatedList = document.getElementById('relatedVideosList');
    if (!relatedList) return;

    relatedList.querySelectorAll('.related-video-item').forEach(item => {
        const videoId = item.dataset.videoId;
        if (!videoId || videoId === 'undefined') return;

        // Click en el item para reproducir
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.related-video-add')) return;

            const video = this.extractVideoDataFromDOM(item);
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

        // Click en botón '+' para añadir
        const addBtn = item.querySelector('.related-video-add');
        if (addBtn) {
            addBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                const video = this.extractVideoDataFromDOM(item);
                if (!video) return;
                
                addBtn.disabled = true;
                addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                try {
                    await this.addVideoToQueue(video);
                    addBtn.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => {
                        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
                        addBtn.disabled = false;
                    }, 1500);
                } catch (error) {
                    console.error('❌ Error añadiendo:', error);
                    addBtn.innerHTML = '<i class="fas fa-times"></i>';
                    setTimeout(() => {
                        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
                        addBtn.disabled = false;
                    }, 1500);
                }
            });
        }
    });
}

extractVideoDataFromDOM(itemElement) {
    try {
        const videoId = itemElement.dataset.videoId;
        const title = itemElement.querySelector('.related-video-title')?.textContent || 'Sin título';
        const thumbnail = itemElement.querySelector('.related-video-thumbnail')?.src || './electronic.ico';
        const author = itemElement.querySelector('.related-video-author')?.textContent || 'YouTube';
        const durationStr = itemElement.querySelector('.related-video-duration')?.textContent || '0:00';
        
        const duration = this.parseDurationToSeconds(durationStr);

        return {
            videoId: videoId,
            title: title,
            thumbnail: thumbnail,
            uploaderName: author,
            author: author,
            duration: duration
        };
    } catch (e) {
        console.error("❌ Error extrayendo datos de video:", e);
        return null;
    }
}

// Helper: Parsear duraciones tipo "3:45"
parseDurationToSeconds(durationStr) {
    if (!durationStr) return 0;
    if (typeof durationStr === 'number') return durationStr;
    
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    return 0;
}
    // =============================================
    // POPUP DE COLA
    // =============================================

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
    
    // Actualizar cola persistente
    
}
/**
 * Sincronizar cola después de cambio de video
 */
syncQueueIndicator() {
    const queueItems = document.querySelectorAll('.queue-item');
    
    // ✅ CORRECCIÓN: Usar siempre window.currentPlayingInfo
    const currentVideoId = window.currentPlayingInfo?.videoId;
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    
    if (!currentVideoId || currentIndex < 0) {
        console.log('⚠️ No hay video actual para sincronizar');
        return;
    }
    
    console.log(`🎵 Sincronizando indicador:`, {
        videoId: currentVideoId,
        index: currentIndex,
        totalItems: queueItems.length
    });
    
    let foundPlaying = false;
    
    queueItems.forEach((item, idx) => {
        const itemVideoId = item.dataset.videoId;
        const itemIndex = parseInt(item.dataset.flatIndex);
        
        // Verificar por índice Y por videoId (doble verificación)
        const isPlaying = (itemIndex === currentIndex) && (itemVideoId === currentVideoId);
        
        if (isPlaying) {
            item.classList.add('playing');
            
            const numberEl = item.querySelector('.queue-item-number');
            if (numberEl) {
                numberEl.innerHTML = '<i class="fas fa-play-circle queue-item-playing"></i>';
            }
            
            foundPlaying = true;
            console.log(`✅ Marcado como playing: índice ${itemIndex}, videoId ${itemVideoId}`);
            
            // Scroll suave
            requestAnimationFrame(() => {
                item.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            });
        } else {
            item.classList.remove('playing');
            
            const numberEl = item.querySelector('.queue-item-number');
            if (numberEl && !isNaN(itemIndex)) {
                numberEl.textContent = itemIndex + 1;
            }
        }
    });
    
    if (!foundPlaying) {
        console.warn(`⚠️ No se encontró item activo. Índice: ${currentIndex}, VideoId: ${currentVideoId}`);
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
                
                <!-- ✅ WRAPPER CON DURACIÓN DENTRO -->
                <div class="queue-item-thumbnail-wrapper">
                    <img src="${video.thumbnail}" 
                         alt="${this.escapeHTML(video.title)}" 
                         onerror="this.src='./electronic.ico';">
                    <span class="queue-item-duration">${formattedDuration}</span>
                </div>
                
                <div class="queue-item-info">
                    <div class="queue-item-title">${this.escapeHTML(video.title)}</div>
                    <div class="queue-item-meta">
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
    const playBtn = card.querySelector('.play-playlist-btn');
    playBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const playlistId = playBtn.dataset.playlistId;
    
    console.log(`🎵 Reproducir playlist: ${playlistId}`);
    
    // ✅ Si es de YouTube Library, cargar videos primero
    if (isYouTubeLibrary && !playlist.isLoaded) {
        console.log('📥 Cargando videos de YouTube Library...');
        const success = await this.loadPlaylistVideos(playlistId);
        if (!success) {
            this.core?.showMessage('Error cargando videos', 'error');
            return;
        }
    }
    
    // ✅ Obtener playlist actualizada
    const updatedPlaylist = this.playlistsData.find(p => p.id === playlistId);
    
    if (!updatedPlaylist?.videos?.length) {
        this.core?.showMessage('La playlist está vacía', 'error');
        return;
    }
    
    console.log(`📋 Añadiendo ${updatedPlaylist.videos.length} videos a cola...`);
    
    let addedCount = 0;
    
    // ✅ Añadir cada video a la cola
    for (const video of updatedPlaylist.videos) {
        const videoData = {
            videoId: video.videoId,
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration || 0, // ✅ Incluir duración
            uploaderName: video.uploaderName || video.author || 'YouTube',
            author: video.author || video.uploaderName || 'YouTube',
            sourcePlaylistId: playlistId
        };
        
        // ✅ Verificar duplicados
        const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
        const isDuplicate = queuePlaylist?.videos.some(v => v.videoId === video.videoId);
        
        if (!isDuplicate) {
            await this.addVideoToQueue(videoData, true); // ✅ true = al final
            addedCount++;
        }
    }
    
    if (addedCount > 0) {
        this.core?.showMessage(`${addedCount} videos añadidos a cola`, 'success');
        
        // ✅ Si no hay reproducción, iniciar
        const flatList = this.core?.getFlattenedPlaylist();
        if (flatList?.length > 0 && !window.reproduccionIniciada) {
            setTimeout(() => {
                this.core?.playVideoAtIndex(0);
            }, 300);
        }
    } else {
        this.core?.showMessage('Todos los videos ya están en la cola', 'info');
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
    
    // ✅ CORRECCIÓN: LIMPIAR LISTENERS PREVIOS clonando nodos
    queueItems.forEach((item) => {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
    });
    
    // Ahora configurar listeners en los nodos limpios
    const freshItems = document.querySelectorAll('.queue-item');
    
    freshItems.forEach((item) => {
        const itemIndex = parseInt(item.dataset.flatIndex);
        const videoId = item.dataset.videoId;
        
        // Click en el item para reproducir
        item.addEventListener('click', (e) => {
            // Ignorar click en botón de eliminar
            if (e.target.closest('.queue-item-remove')) {
                return;
            }
            
            if (!isNaN(itemIndex)) {
                const flatList = this.core?.getFlattenedPlaylist() || [];
                if (itemIndex >= 0 && itemIndex < flatList.length) {
                    console.log(`▶️ Reproduciendo: ${flatList[itemIndex].title}`);
                    this.core?.playVideoAtIndex(itemIndex);
                }
            }
        });
    });
    
    // Configurar botones de eliminar (también limpiados)
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
                await this.addVideoToQueue(videoData, true); // true = desde playlist
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
        // ✅ CRÍTICO: Asegurar que el atributo draggable esté activo
        item.setAttribute('draggable', 'true');
        item.style.cursor = 'move';
        
        // ✅ Limpiar listeners anteriores clonando el nodo
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        // ✅ Configurar eventos en el nodo limpio
        newItem.addEventListener('dragstart', (e) => {
            this.draggedItem = newItem;
            this.draggedIndex = parseInt(newItem.dataset.flatIndex);
            
            newItem.style.opacity = '0.5';
            newItem.classList.add('dragging');
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.draggedIndex);
            
            console.log(`🎯 Drag start: índice ${this.draggedIndex}`);
        });
        
        newItem.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        
        newItem.addEventListener('dragenter', (e) => {
            if (newItem !== this.draggedItem) {
                newItem.classList.add('drag-over');
            }
        });
        
        newItem.addEventListener('dragleave', (e) => {
            newItem.classList.remove('drag-over');
        });
        
        newItem.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleDrop(e, newItem, parseInt(newItem.dataset.flatIndex));
        });
        
        newItem.addEventListener('dragend', (e) => {
            this.handleDragEnd(e);
        });
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
