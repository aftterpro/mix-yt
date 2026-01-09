console.log('🎵 Cargando gestor de playlists...');

// =============================================
// CLASE PRINCIPAL PARA GESTIÓN DE PLAYLISTS
// =============================================
class PlaylistManager {
    constructor(core) {
    this.core = core;
    this.lyricsProvider = localStorage.getItem('ytcm_lyrics_provider') || 'lrclib';
    this.lastLoadedLyricsId = null;
    this.currentLrc = [];
    this.lyricsSyncInterval = null;
    this.lyricsTranslated = false;
    this.lastLoadedRelatedId = null;
    
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
            this.core.playlistsData = this.core.playlistsData; // Sincronizar referencia
        } 
        // 2. Si no, intentar cargar desde localStorage (persistencia propia de playlist.js si existiera)
        else {
            // Nota: La persistencia principal la maneja core.js via loadPlaylistsDataPersistent
            // Aquí podemos intentar recuperar si el core aún no ha cargado
            const storedData = localStorage.getItem('ytcm_playlists_persistent');
            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    this.core.playlistsData = parsed.data || [];
                    console.log(`✅ ${this.core.playlistsData.length} playlists recuperadas de localStorage local`);
                } catch (e) {
                    console.warn('⚠️ Error al leer localStorage local, iniciando vacío');
                    this.core.playlistsData = [];
                }
            } else {
                this.core.playlistsData = [];
            }
        }

        // 3. Asegurar que existe la Cola de Reproducción
        let queue = this.core.playlistsData.find(p => p.id === 'queue' || p.isQueue);
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
            this.core.playlistsData.unshift(queue); // Añadir al principio
        }

        // 4. Asegurar que existe la Playlist Manual
        let manual = this.core.playlistsData.find(p => p.id === 'manual');
        if (!manual) {
            manual = {
                id: 'manual',
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true
            };
            this.core.playlistsData.push(manual);
        }

        // 5. Sincronizar de vuelta al Core para que ambos compartan la misma referencia
        if (this.core) {
            this.core.playlistsData = this.core.playlistsData;
        }
        
        // Asignar alias para compatibilidad con código que use this.playlists
        this.playlists = this.core.playlistsData; 
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
    
    // Limpiar sufijos comunes
    cleanTitle = cleanTitle
        .replace(/\(official.*?video\)/gi, '')
        .replace(/\(lyric.*?video\)/gi, '')
        .replace(/\(visualizer\)/gi, '')
        .replace(/\(audio\)/gi, '')
        .replace(/\[official.*?\]/gi, '')
        .replace(/\[lyric.*?\]/gi, '')
        .trim();
    
    // Patrones de separación
    const separatorPatterns = [
        /^(.+?)\s*[-–—]\s*(.+?)$/, // Artista - Título
        /^(.+?)\s*:\s*(.+?)$/,      // Artista: Título
        /^(.+?)\s*\|\s*(.+?)$/,     // Artista | Título
    ];
    
    for (const pattern of separatorPatterns) {
        const match = cleanTitle.match(pattern);
        if (match && match[1] && match[2]) {
            const artist = match[1].trim();
            
            // ✅ VALIDAR que no sea solo "Topic" o palabras genéricas
            if (artist.length < 50 && 
                !artist.toLowerCase().includes('feat') &&
                artist !== 'YouTube' &&
                artist !== 'Topic' &&
                !artist.endsWith(' - Topic')) {
                return artist;
            }
        }
    }
    
    return 'Desconocido';
}

async addVideoToQueue(videoData, fromPlaylist = false) {
    console.log('🎵 addVideoToQueue:', videoData);
    
    // ✅ VALIDACIÓN ESTRICTA
    if (!videoData || 
        !videoData.videoId || 
        videoData.videoId === 'undefined' || 
        typeof videoData.videoId !== 'string' ||
        videoData.videoId.trim() === '') {
        console.error('❌ videoId inválido:', videoData);
        if (this.core) this.core.showMessage('Error: Video inválido', 'error');
        return false;
    }

    // ✅ VALIDAR TÍTULO
    if (!videoData.title || videoData.title.trim() === '') {
        console.warn('⚠️ Video sin título, usando fallback');
        videoData.title = 'Video sin título';
    }

    // ✅ SINCRONIZACIÓN CON CORE
    if (this.core?.playlistsData) {
        this.core.playlistsData = this.core.playlistsData;
    }

    // ✅ OBTENER COLA
    let queue = this.core.playlistsData.find(p => p.id === 'queue' || p.isQueue);

    if (!queue) {
        console.log('✨ Creando cola...');
        queue = {
            id: 'queue',
            name: 'Cola de Reproducción',
            thumbnailUrl: './electronic.ico',
            videos: [],
            isExpanded: true,
            isQueue: true
        };
        this.core.playlistsData.unshift(queue);
    }

    // ✅ NORMALIZAR VIDEO
    const videoToAdd = {
        videoId: videoData.videoId.trim(),
        title: videoData.title.trim(),
        thumbnail: videoData.thumbnail || videoData.thumbnailUrl || './electronic.ico',
        duration: parseInt(videoData.duration) || 0,
        uploaderName: this.cleanArtistName(videoData.uploaderName || videoData.artist || 'Desconocido'),
        artist: this.cleanArtistName(videoData.artist || videoData.uploaderName || 'Desconocido'),
        sourcePlaylistId: 'queue'
    };

    // ✅ VERIFICAR DUPLICADOS
    const isDuplicate = queue.videos.some(v => v.videoId === videoToAdd.videoId);
    if (isDuplicate) {
        if (this.core) this.core.showMessage(`"${videoToAdd.title}" ya está en cola`, 'warning');
        return false;
    }

    // ✅ AÑADIR (al final si es desde playlist, inteligente si es manual)
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

    // ✅ ACTUALIZAR UI
    this.updateQueueUI();
    
    if (this.core) {
        this.core.showMessage(`Añadido: ${videoToAdd.title}`, 'success');
        
        if (typeof this.core.enablePlayButton === 'function') {
            this.core.enablePlayButton();
        }
        
        // Invalidar caché
        if (typeof this.core.invalidateFlattenedCache === 'function') {
            this.core.invalidateFlattenedCache();
        }
    }

    // ✅ GUARDAR
    setTimeout(() => {
        if (typeof window.saveAllData === 'function') {
            window.saveAllData();
        }
    }, 100);
    
    return true;
}
    cleanArtistName(name) {
    if (!name) return 'Desconocido';
    
    // Eliminar " - Topic" de YouTube
    let cleaned = name.replace(/\s*-\s*Topic$/i, '').trim();
    
    // Si quedó vacío, devolver original
    return cleaned.length > 0 ? cleaned : name;
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

        let queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue');
        
        if (!queuePlaylist) {
            queuePlaylist = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true,
                isQueue: true
            };
            this.core.playlistsData.unshift(queuePlaylist);
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
    
    const playlist = this.core.playlistsData.find(p => p.id === playlistId);
    if (!playlist) {
        console.error(`❌ Playlist ${playlistId} no encontrada`);
        return false;
    }
    
    if (playlist.isLoaded && playlist.videos.length > 0) {
        console.log(`✅ Playlist ya cargada con ${playlist.videos.length} videos`);
        return true;
    }
    
    try {
        this.core?.showMessage('Cargando videos...', 'info');
        
        let allVideos = [];
        let nextPageToken = null;
        
        // PASO 1: Cargar metadata
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                part: ['snippet', 'contentDetails'],
                playlistId: playlistId,
                maxResults: 50,
                pageToken: nextPageToken
            });
            
            if (response.result.items) {
                const videos = response.result.items
                    .map(item => {
                        const videoId = item.contentDetails?.videoId;
                        const title = item.snippet?.title || 'Sin título';
                        
                        // ✅ CORRECCIÓN: Extraer artista del TÍTULO
                        const artist = this.extractArtistFromTitle(title);
                        
                        return {
                            videoId: videoId,
                            title: title,
                            thumbnail: item.snippet?.thumbnails?.high?.url || 
                                      item.snippet?.thumbnails?.default?.url || 
                                      './electronic.ico',
                            duration: 0, // Se llenará después
                            uploaderName: artist, // ✅ Artista extraído
                            author: artist,        // ✅ Artista extraído
                            artist: artist,        // ✅ Artista extraído
                            channelTitle: item.snippet?.videoOwnerChannelTitle || 'YouTube',
                            sourcePlaylistId: playlistId
                        };
                    })
                    .filter(v => v.videoId && !v.title.toLowerCase().includes('deleted'));
                
                allVideos.push(...videos);
            }
            
            nextPageToken = response.result.nextPageToken;
            
        } while (nextPageToken);
        
        console.log(`📦 ${allVideos.length} videos obtenidos, cargando duraciones...`);
        
        // PASO 2: Obtener duraciones
        if (allVideos.length > 0 && this.core) {
            const videoIds = allVideos.map(v => v.videoId);
            
            for (let i = 0; i < videoIds.length; i += 50) {
                const batch = videoIds.slice(i, i + 50);
                
                const response = await gapi.client.youtube.videos.list({
                    part: ['contentDetails'],
                    id: batch.join(',')
                });
                
                if (response.result.items) {
                    response.result.items.forEach(videoData => {
                        const video = allVideos.find(v => v.videoId === videoData.id);
                        if (video && videoData.contentDetails?.duration) {
                            video.duration = this.core.parseDuration(videoData.contentDetails.duration);
                        }
                    });
                }
            }
        }
        
        playlist.videos = allVideos;
        playlist.isLoaded = true;
        
        this.core?.showMessage(`${allVideos.length} videos cargados`, 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Error cargando videos:', error);
        this.core?.showMessage('Error cargando videos: ' + error.message, 'error');
        return false;
    }
}
 extractArtistFromTitle(title) {
    if (!title) return 'Desconocido';
    
    // Limpiar título
    let cleanTitle = title
        .replace(/\(official.*?video\)/gi, '')
        .replace(/\(lyric.*?video\)/gi, '')
        .replace(/\(visualizer\)/gi, '')
        .replace(/\(audio\)/gi, '')
        .replace(/\[official.*?\]/gi, '')
        .trim();
    
    // Patrones de separación
    const separators = [
        /^(.+?)\s*[-–—]\s*(.+?)$/,  // Artista - Título
        /^(.+?)\s*:\s*(.+?)$/,      // Artista: Título
        /^(.+?)\s*\|\s*(.+?)$/,     // Artista | Título
    ];
    
    for (const pattern of separators) {
        const match = cleanTitle.match(pattern);
        if (match && match[1]) {
            let artist = match[1].trim();
            
            // ✅ Validaciones
            if (artist.length < 50 && 
                artist !== 'YouTube' &&
                artist !== 'Topic' &&
                !artist.endsWith(' - Topic')) {
                return artist;
            }
        }
    }
    
    return 'Desconocido';
}   
    /**
     * Eliminar video de la cola
     */

// Reemplazar línea 250-350 en playlist.js
removeVideoFromQueue(videoId) {
    console.log(`🗑️ removeVideoFromQueue: ${videoId}`);
    
    // Validación
    if (!videoId || videoId === 'undefined' || typeof videoId !== 'string') {
        console.error('❌ videoId inválido:', videoId);
        return false;
    }
    
    const queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue' || p.isQueue);
    if (!queuePlaylist?.videos) {
        console.error('❌ Cola no encontrada');
        return false;
    }
    
    const videoIndex = queuePlaylist.videos.findIndex(v => v?.videoId === videoId);
    
    if (videoIndex === -1) {
        console.error(`❌ Video ${videoId} no encontrado en cola`);
        return false;
    }
    
    // Eliminar
    const removedVideo = queuePlaylist.videos[videoIndex];
    queuePlaylist.videos.splice(videoIndex, 1);
    
    // Invalidar caché
    if (this.core && typeof this.core.invalidateFlattenedCache === 'function') {
        this.core.invalidateFlattenedCache();
    }
    
    // Actualizar UI
    this.updatePlaylistsUI();
    
    if (this.core) {
        this.core.updatePersistentQueue();
        this.core.showMessage(`Eliminado: ${removedVideo.title}`, 'success');
    }
    
    // Guardar
    setTimeout(() => {
        if (typeof window.saveAllData === 'function') {
            window.saveAllData();
        }
    }, 100);
    
    return true;
}
// =============================================
// GESTIÓN DE TABS EN LA COLA
// =============================================
switchQueueTab(tabName) {
    console.log(`🔄 Cambiando a tab: ${tabName}`);
    
    // ✅ DETENER SINCRONIZACIÓN DE LETRAS AL SALIR
    if (tabName !== 'lyrics') {
        if (this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
            this.lyricsSyncInterval = null;
            console.log('🛑 Sincronización detenida');
        }
    }
    
    // ✅ ACTUALIZAR UI DE TABS
    document.querySelectorAll('.queue-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.queue-list-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tabContent === tabName);
    });
    
    // ✅ OBTENER VIDEO ACTUAL desde el player activo
    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    
    if (!activePlayer || typeof activePlayer.getVideoData !== 'function') {
        console.warn('⚠️ No hay reproductor activo');
        this.showEmptyTabMessage(tabName);
        return;
    }
    
    const videoData = activePlayer.getVideoData();
    const currentVideoId = videoData?.video_id;
    
    if (!currentVideoId) {
        console.warn('⚠️ No hay video reproduciéndose');
        this.showEmptyTabMessage(tabName);
        return;
    }
    
    // ✅ BUSCAR VIDEO EN COLA
    const queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue');
    
    if (!queuePlaylist?.videos) {
        console.warn('⚠️ Cola no encontrada');
        this.showEmptyTabMessage(tabName);
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
        console.warn(`⚠️ Video ${currentVideoId} no encontrado`);
        this.showEmptyTabMessage(tabName);
        return;
    }
    
    console.log(`🎵 Cargando tab "${tabName}" para:`, currentVideo.title);
    
    // ✅ CARGAR CONTENIDO SEGÚN EL TAB
    if (tabName === 'lyrics') {
        this.loadLyricsForCurrentVideo(currentVideo);
    } else if (tabName === 'related') {
        this.loadRelatedForVideo(currentVideo);
    }
}
 /**
 * Mostrar mensaje cuando no hay contenido
 */
showEmptyTabMessage(tabName) {
    let container;
    let message;
    
    if (tabName === 'lyrics') {
        container = document.getElementById('lyricsContent');
        message = '<div class="lyrics-placeholder"><i class="fas fa-music"></i><p>Reproduce una canción para ver las letras</p></div>';
    } else if (tabName === 'related') {
        container = document.getElementById('relatedVideosList');
        message = '<div class="related-placeholder"><i class="fas fa-sparkles"></i><p>Reproduce una canción para ver relacionados</p></div>';
    }
    
    if (container) {
        container.innerHTML = message;
    }
}   
 /**
 * Cargar letras para el video actual
 */
async loadLyricsForCurrentVideo(video) {
    const lyricsContainer = document.getElementById('lyricsContent');
    
    if (!lyricsContainer) {
        console.error('❌ lyricsContent no encontrado');
        return;
    }
    
    // ✅ VALIDAR DATOS DEL VIDEO
    if (!video || !video.title) {
        console.error('❌ Video sin datos válidos:', video);
        lyricsContainer.innerHTML = `
            <div class="lyrics-error">
                <i class="fas fa-exclamation-circle"></i>
                <p>No se puede cargar letras: video inválido</p>
            </div>
        `;
        return;
    }
    
    console.log(`📡 Buscando letras para: "${video.title}"`);
    
    // ✅ LOADING STATE
    lyricsContainer.innerHTML = `
        <div class="lyrics-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Buscando letras...</p>
        </div>
    `;
    
    try {
        // ✅ EXTRAER ARTISTA (puede venir de diferentes campos)
        let artist = video.artist || video.uploaderName || video.author || '';
        artist = artist.replace(/\s*-\s*Topic$/i, '').trim();
        
        if (!artist || artist.toLowerCase() === 'youtube') {
            // Intentar extraer del título
            if (video.title.includes(' - ')) {
                artist = video.title.split(' - ')[0].trim();
            } else {
                artist = 'Desconocido';
            }
        }
        
        const title = this.cleanTrackTitle(video.title);
        const duration = video.duration || 0;
        
        console.log(`📊 Datos para búsqueda de letras:`, { title, artist, duration });
        
        // Buscar letras
        const lyricsData = await this.fetchLyrics(this.lyricsProvider, artist, title, duration);
        
        if (lyricsData && (lyricsData.syncedLyrics || lyricsData.plainLyrics)) {
            this.renderLyricsUI(lyricsData, artist, title);
        } else {
            throw new Error('No se encontraron letras');
        }
        
    } catch (error) {
        console.error('❌ Error cargando letras:', error);
        lyricsContainer.innerHTML = `
            <div class="lyrics-error">
                <i class="fas fa-times-circle"></i>
                <p>No se encontraron letras para esta canción</p>
                <button onclick="window.playlistManager.switchQueueTab('lyrics')" 
                        style="margin-top: 12px; padding: 8px 16px;">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }
}   
 /**
 * Cargar relacionados para un video específico
 */
async loadRelatedForVideo(video) {
    const relatedList = document.getElementById('relatedVideosList');
    
    // ✅ VALIDACIÓN CRÍTICA
    if (!relatedList) {
        console.error('❌ relatedVideosList no encontrado en el DOM');
        return;
    }
    
    if (!video || !video.videoId) {
        relatedList.innerHTML = `<p class="related-placeholder">Video no válido</p>`;
        this.lastLoadedRelatedId = null;
        return;
    }
    
    console.log(`🎵 Cargando relacionados para: ${video.title} (${video.videoId})`);
    
    // ✅ CANCELAR CARGA ANTERIOR
    if (this.relatedLoadAbortController) {
        this.relatedLoadAbortController.abort();
        console.log('🛑 Carga anterior cancelada');
    }
    
    // ✅ CREAR NUEVO ABORT CONTROLLER
    this.relatedLoadAbortController = new AbortController();
    const currentAbortController = this.relatedLoadAbortController;
    
    // ✅ CACHÉ: Evitar recargas innecesarias
    if (this.lastLoadedRelatedId === video.videoId) {
        const existingItems = relatedList.querySelectorAll('.related-video-item');
        if (existingItems.length > 0) {
            console.log('✅ Relacionados ya cargados');
            return;
        }
    }
    
    this.lastLoadedRelatedId = video.videoId;
    
    // ✅ LOADING STATE
    relatedList.innerHTML = `
        <div class="related-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando relacionados...</p>
        </div>
    `;
    
    try {
        // ✅ EXTRAER ARTISTA DEL TÍTULO
        const artist = this.extractArtistFromTitle(video.title);
        const searchQuery = artist !== 'Desconocido' ? artist : video.title;
        
        console.log(`🔍 Buscando relacionados: "${searchQuery}"`);
        
        // ✅ VALIDAR QUE youtubeJSClient EXISTA
        if (!window.youtubeJSClient) {
            throw new Error('YouTube Client no disponible');
        }
        
        const searchResults = await window.youtubeJSClient.search(searchQuery);
        
        // ✅ VERIFICAR SI FUE CANCELADO
        if (currentAbortController.signal.aborted) {
            console.log('🛑 Carga cancelada por el usuario');
            return;
        }
        
        if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
            throw new Error('Sin resultados');
        }
        
        // ✅ FILTRAR EL VIDEO ACTUAL
        const relatedVideos = searchResults.items
            .filter(v => v.videoId !== video.videoId)
            .slice(0, 15);
        
        if (relatedVideos.length === 0) {
            // ✅ VERIFICAR NUEVAMENTE SI FUE CANCELADO
            if (currentAbortController.signal.aborted) return;
            
            const currentList = document.getElementById('relatedVideosList');
            if (currentList) {
                currentList.innerHTML = `
                    <div class="related-placeholder">
                        <i class="fas fa-music-slash"></i>
                        <p>No se encontraron videos relacionados</p>
                    </div>
                `;
            }
            return;
        }
        
        // ✅ RENDERIZAR (solo si no fue cancelado)
        if (!currentAbortController.signal.aborted) {
            const currentList = document.getElementById('relatedVideosList');
            if (currentList) {
                this.renderRelatedVideos(relatedVideos, currentList);
            }
        }
        
    } catch (error) {
        // ✅ IGNORAR ERRORES DE CANCELACIÓN
        if (error.name === 'AbortError' || currentAbortController.signal.aborted) {
            console.log('🛑 Carga cancelada');
            return;
        }
        
        console.error('❌ Error cargando relacionados:', error);
        
        // ✅ VALIDAR QUE relatedList SIGA EXISTIENDO
        const currentList = document.getElementById('relatedVideosList');
        if (currentList && !currentAbortController.signal.aborted) {
            currentList.innerHTML = `
                <div class="related-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error: ${error.message || 'No se pudieron cargar sugerencias'}</p>
                    <button onclick="window.playlistManager?.loadRelatedForVideo(${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                            style="margin-top: 12px; padding: 8px 16px; background: var(--primary-color); 
                                   border: none; border-radius: 20px; color: white; cursor: pointer;">
                        <i class="fas fa-redo"></i> Reintentar
                    </button>
                </div>
            `;
        }
    } finally {
        // ✅ LIMPIAR ABORT CONTROLLER
        if (this.relatedLoadAbortController === currentAbortController) {
            this.relatedLoadAbortController = null;
        }
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
    
    // ✅ OBTENER VIDEO DEL PLAYER DIRECTAMENTE (sin usar getFlattenedPlaylist)
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
    const queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue');
    
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
            this.loadLyricsForCurrentVideo(currentVideo);
        }, 100);
    } else if (tabName === 'related') {
        setTimeout(() => {
            this.loadRelatedForVideo(currentVideo);
        }, 100);
    }
}
parseLRC(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') {
        console.warn('⚠️ Texto LRC inválido');
        return [];
    }
    
    const lines = lrcText.split('\n');
    const lrcData = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    
    for (const line of lines) {
        const match = line.match(timeRegex);
        
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
            
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = line.replace(timeRegex, '').trim();
            
            // ✅ Solo añadir si tiene texto
            if (text && text.length > 0) {
                lrcData.push({ time, text });
            }
        }
    }
    
    // ✅ ORDENAR POR TIEMPO (por si acaso)
    lrcData.sort((a, b) => a.time - b.time);
    
    console.log(`✅ Parseadas ${lrcData.length} líneas LRC`);
    
    return lrcData;
}
startLyricsSync() {
    // ✅ LIMPIAR INTERVALO ANTERIOR
    if (this.lyricsSyncInterval) {
        clearInterval(this.lyricsSyncInterval);
        this.lyricsSyncInterval = null;
    }
    
    console.log('🎵 Iniciando sincronización de letras...');
    
    // ✅ VALIDAR QUE HAY LETRAS
    if (!this.currentLrc || this.currentLrc.length === 0) {
        console.warn('⚠️ No hay letras para sincronizar');
        return;
    }
    
    // ✅ RESETEAR ÍNDICE
    this.lastActiveLineIndex = -1;
    
    this.lyricsSyncInterval = setInterval(() => {
        this.syncLyricsLine();
    }, 250);
    
    console.log('✅ Sincronización activa');
}

syncLyricsLine() {
    // ===== VALIDACIONES =====
    if (!this.core || !this.currentLrc || this.currentLrc.length === 0) {
        return;
    }

    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    
    if (!activePlayer || typeof activePlayer.getCurrentTime !== 'function') {
        return;
    }

    const currentTime = activePlayer.getCurrentTime();
    const container = document.getElementById('syncedLyricsContainer');
    
    // ✅ Si el contenedor ya no existe, detener sincronización
    if (!container) {
        if (this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
            this.lyricsSyncInterval = null;
            console.log('🛑 Sincronización detenida (contenedor no existe)');
        }
        return;
    }

    // ===== ENCONTRAR LÍNEA ACTIVA =====
    let activeLineIndex = -1;
    
    for (let i = this.currentLrc.length - 1; i >= 0; i--) {
        if (currentTime >= (this.currentLrc[i].time - 0.2)) {
            activeLineIndex = i;
            break;
        }
    }

    // ===== OPTIMIZACIÓN: Solo actualizar si cambió =====
    if (this.lastActiveLineIndex === activeLineIndex) {
        return;
    }
    
    this.lastActiveLineIndex = activeLineIndex;

    // ===== ACTUALIZAR CLASES CSS =====
    const allLines = container.querySelectorAll('p');
    
    allLines.forEach((line, index) => {
        line.className = '';
        
        if (index === activeLineIndex) {
            line.classList.add('active');
            
            line.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
        } else if (index < activeLineIndex) {
            line.classList.add('past');
        } else {
            line.classList.add('future');
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
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    const flatList = this.core?.getFlattenedPlaylist() || [];
    const currentVideo = flatList[currentIndex];
    
    if (!currentVideo) {
        console.warn('⚠️ No hay video actual para renderizar letras');
        return;
    }
    
    const match = {
        syncedLyrics: data.syncedLyrics,
        plainLyrics: data.plainLyrics,
        instrumental: data.instrumental || false,
        source: data.source || 'Desconocido',
        trackName: data.trackName || currentVideo.title,
        artistName: data.artistName || currentVideo.artist || currentVideo.uploaderName,
        albumName: data.albumName || null
    };

    this.renderLyricsUI(match, match.artistName, match.trackName);
}  
renderLyricsUI(match, originalArtist, originalTitle) {
    const lyricsContainer = document.getElementById('lyricsContent');
    if (!lyricsContainer) {
        console.error('❌ Contenedor de letras no encontrado');
        return;
    }
    
    const trackName = match.trackName || originalTitle;
    const artistName = match.artistName || originalArtist;
    const albumInfo = match.albumName ? ` • 💿 ${match.albumName}` : '';

    // ===== HEADER CON BOTONES =====
    const headerHtml = `
        <div class="lyrics-header">
            <i class="fas fa-music"></i>
            <div style="flex:1; overflow:hidden;">
                <p style="font-weight:bold; margin:0;">${this.escapeHTML(trackName)}</p>
                <p class="lyrics-artist-header" style="margin:0; font-size:12px; color:rgba(255,255,255,0.7);">
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

    // ===== INSTRUMENTAL =====
    if (match.instrumental) {
        contentHtml = `
            <div class="lyrics-text plain" style="display:flex; justify-content:center; align-items:center; 
                 height:300px; flex-direction:column;">
                <i class="fas fa-guitar" style="font-size:40px; margin-bottom:15px; opacity:0.5;"></i>
                <p>Instrumental</p>
            </div>`;
            
    // ===== LETRAS SINCRONIZADAS =====
    } else if (match.syncedLyrics) {
        // ✅ PARSEAR LRC
        this.currentLrc = this.parseLRC(match.syncedLyrics);
        
        if (this.currentLrc.length === 0) {
            console.warn('⚠️ No se pudieron parsear letras sincronizadas, usando plain');
            contentHtml = `
                <div class="lyrics-text plain">
                    ${this.escapeHTML(match.plainLyrics || match.syncedLyrics).replace(/\n/g, '<br>')}
                </div>`;
        } else {
            contentHtml = `
                <div class="lyrics-text synced" id="syncedLyricsContainer">
                    ${this.currentLrc.map(l => 
                        `<p data-time="${l.time}">${this.escapeHTML(l.text)}</p>`
                    ).join('')}
                </div>`;
            
            // ✅ INICIAR SINCRONIZACIÓN
            setTimeout(() => this.startLyricsSync(), 100);
        }
        
    // ===== LETRAS PLANAS =====
    } else if (match.plainLyrics) {
        contentHtml = `
            <div class="lyrics-text plain">
                ${this.escapeHTML(match.plainLyrics).replace(/\n/g, '<br>')}
            </div>`;
    } else {
        throw new Error('Sin datos de letra');
    }

    // ===== RENDERIZAR =====
    lyricsContainer.innerHTML = `
        <div class="lyrics-container">
            ${headerHtml}
            ${contentHtml}
            <p class="lyrics-source" style="text-align:center; font-size:11px; color:rgba(255,255,255,0.4); 
               margin-top:32px; font-style:italic;">
                Fuente: ${match.source}
            </p>
        </div>`;

    // ===== CONFIGURAR BOTONES =====
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
    // ✅ VALIDACIÓN CRÍTICA AL INICIO
    if (title === undefined || title === null) {
        console.error('❌ Título es undefined o null');
        return 'Sin título';
    }
    
    // ✅ CONVERTIR A STRING SIEMPRE
    let titleStr = String(title).trim();
    
    // ✅ VALIDAR QUE NO ESTÉ VACÍO
    if (titleStr.length === 0) {
        console.error('❌ Título vacío después de convertir a string');
        return 'Sin título';
    }
    
    // ✅ VALIDAR QUE NO SEA SOLO NÚMEROS
    if (/^\d+$/.test(titleStr)) {
        console.warn('⚠️ Título solo contiene números:', titleStr);
        return titleStr;
    }

    console.log(`🧹 Limpiando título: "${titleStr}"`);

    let clean = titleStr;

    // 1. Eliminar Emojis
    const emojiRegex = /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;
    clean = clean.replace(emojiRegex, '');

    // 2. Eliminar "(Official Video)" y similares
    clean = clean.replace(/\s*\(official.*video\)/gi, '');
    clean = clean.replace(/\s*\[official.*video\]/gi, '');
    
    // 3. Eliminar colaboraciones
    clean = clean.replace(/\s(ft\.|feat\.|featuring|vs\.|x|with)\s.*/i, '');

    // 4. Eliminar ruido entre paréntesis
    const noiseKeywords = 'official|video|audio|lyrics|visualizer|hd|hq|4k|8k|live|version|remaster|extended|radio|cover|acoustic|instrumental|remix|rmx|mix|edit|topic';
    clean = clean.replace(new RegExp(`\\s*[\\(\\[].*?(${noiseKeywords}).*?[\\)\\]]`, 'gi'), '');

    // 5. Si tiene " - ", tomar solo la parte del título (después del guión)
    if (clean.includes(' - ')) {
        const parts = clean.split(' - ');
        // Si hay más de 1 parte y la segunda no está vacía
        if (parts.length > 1 && parts[1].trim().length > 0) {
            clean = parts[1].trim();
        }
    }

    // 6. Limpieza final
    clean = clean.replace(/["""]/g, '');
    clean = clean.split('|')[0];
    clean = clean.replace(/\s+/g, ' ').trim();
    
    // ✅ VALIDACIÓN FINAL
    if (!clean || clean.length === 0) {
        console.warn('⚠️ Título quedó vacío después de limpieza, usando original');
        return titleStr;
    }
    
    console.log(`✅ Título limpio: "${clean}"`);
    return clean;
}
async loadLyrics() {
    const lyricsContainer = document.getElementById('lyricsContent');
    const providerBtn = document.getElementById('lyricsProviderToggle');
    
    // ===== OBTENER VIDEO ACTUAL =====
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    const allPlaylists = this.playlists || window.unifiedCore?.playlistsData || [];
    const queue = allPlaylists.find(p => p.id === 'queue');
    const currentVideo = queue?.videos[currentIndex];

    if (!currentVideo) {
        lyricsContainer.innerHTML = '<p class="lyrics-info">Reproduce música...</p>';
        if (providerBtn) providerBtn.style.display = 'none';
        return;
    }

    // ✅ EXTRAER Y LIMPIAR DATOS
    const rawTitle = currentVideo.title?.trim() || '';
    const rawArtist = (currentVideo.artist || currentVideo.uploaderName || '').trim();

    // ✅ VALIDACIÓN MEJORADA
    if (!rawTitle || rawTitle.length < 2) {
        console.error('❌ Video sin título válido:', currentVideo);
        lyricsContainer.innerHTML = `
            <div class="lyrics-error">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error: Video sin título</p>
            </div>
        `;
        return;
    }

    console.log('📊 Datos del video:', {
        rawTitle: rawTitle,
        rawArtist: rawArtist,
        videoId: currentVideo.videoId
    });

    // ===== LOADING STATE =====
    lyricsContainer.innerHTML = `
        <div class="lyrics-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando letras...</p>
        </div>
    `;

    try {
        // ✅ PASAR DATOS SIN PROCESAR - fetchLyrics hará la limpieza
        const data = await this.fetchLyrics(this.lyricsProvider, rawArtist, rawTitle, currentVideo.duration || 0);

        if (data && (data.syncedLyrics || data.plainLyrics)) {
            this.renderLyrics(data);
            if (providerBtn) providerBtn.style.display = 'inline-flex';
        } else {
            throw new Error('Sin datos de letra');
        }

    } catch (error) {
        console.error('❌ Error:', error);
        lyricsContainer.innerHTML = `
            <div class="lyrics-error">
                <i class="fas fa-times-circle"></i>
                <p>No se encontraron letras</p>
            </div>
        `;
    }
} 
async fetchLyrics(provider, rawArtist, rawTitle, duration) {
    // ✅ VALIDACIÓN ESTRICTA
    if (!rawTitle || typeof rawTitle !== 'string' || rawTitle.trim() === '') {
        throw new Error('Título inválido');
    }
    
    if (!rawArtist || typeof rawArtist !== 'string' || rawArtist.trim() === '') {
        throw new Error('Artista inválido');
    }

    // ✅ LIMPIAR TÍTULO Y ARTISTA
    const title = this.cleanTrackTitle(rawTitle);
    let artist = rawArtist.replace(/\s*-\s*Topic$/i, '').trim();

    console.log(`📡 Buscando [${provider}]: "${title}" - "${artist}"`);

    try {
        if (provider === 'lrclib') {
            // ✅ URL SIN DURACIÓN (más rápido y más resultados)
            const params = new URLSearchParams({
                artist_name: artist,
                track_name: title
            });
            
            const url = `https://lrclib.net/api/get?${params}`;
            console.log('🔗 URL LRCLIB:', url);

            const response = await fetch(url, {
                signal: AbortSignal.timeout(8000)
            });

            if (!response.ok) {
                throw new Error(`LRCLIB HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
                throw new Error('Sin letras en respuesta');
            }

            return {
                syncedLyrics: data.syncedLyrics, 
                plainLyrics: data.plainLyrics,
                instrumental: data.instrumental || false,
                source: 'LRCLIB',
                provider: 'lrclib',
                trackName: data.trackName || title,
                artistName: data.artistName || artist,
                albumName: data.albumName || null
            };

        } else if (provider === 'lujjjh') {
            const params = new URLSearchParams({
                name: title,
                artist: artist
            });
            
            const targetUrl = `https://lyrics-api.lujjjh.com/?${params.toString()}`;
            const proxyUrl = `https://mix-yt.netlify.app/.netlify/functions/cors-proxy?url=${encodeURIComponent(targetUrl)}`;
            
            console.log('🔗 URL LUJJJH:', targetUrl);
            console.log('🔗 URL PROXY:', proxyUrl);

            const response = await fetch(proxyUrl, {
                signal: AbortSignal.timeout(8000)
            });
            
            if (!response.ok) {
                throw new Error(`Lujjjh HTTP ${response.status}`);
            }

            const textData = await response.text();
            
            if (!textData || textData.length < 10) {
                throw new Error('Respuesta vacía');
            }

            const plain = textData.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();

            return {
                syncedLyrics: textData,
                plainLyrics: plain,
                instrumental: false,
                source: 'Lujjjh API',
                provider: 'lujjjh',
                trackName: title,
                artistName: artist
            };
        }

    } catch (error) {
        console.warn(`❌ Error en fetchLyrics (${provider}):`, error.message);
        throw error;
    }

    throw new Error('Proveedor no soportado');
}

toggleLyricsProvider() {
    // Cambiar proveedor
    this.lyricsProvider = (this.lyricsProvider === 'lrclib') ? 'lujjjh' : 'lrclib';
    
    console.log(`🎵 Proveedor cambiado a: ${this.lyricsProvider}`);
    
    // Guardar preferencia
    localStorage.setItem('ytcm_lyrics_provider', this.lyricsProvider);
    
    // ✅ CORRECCIÓN: Limpiar caché del video actual
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    const queue = this.core.playlistsData.find(p => p.id === 'queue');
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
    
    async loadLyricsForVideo() {
    const info = window.currentPlayingInfo;
    if (!info || info.flattenedIndex === -1) return;

    // Obtener la lista aplanada (con artistas ya corregidos)
    const flatList = window.unifiedCore.getFlattenedPlaylist();
    const videoData = flatList[info.flattenedIndex];

    if (!videoData) return;

    const lyricsContainer = document.getElementById('lyricsContainer');
    if (lyricsContainer) {
        lyricsContainer.innerHTML = '<div class="lyrics-loading">🔍 Buscando letras para ' + videoData.title + '...</div>';
    }

    try {
        console.log(`📡 Buscando letras: "${videoData.title}" - "${videoData.artist}"`);
        
        // Llamada al motor de búsqueda de letras (fetchLyrics)
        // Se pasan: título, artista corregido y duración
        const lyrics = await this.fetchLyrics(
            videoData.title, 
            videoData.artist, 
            videoData.duration
        );

        if (lyrics) {
            this.displayLyrics(lyrics);
            // Iniciar sincronización si las letras tienen tiempos
            if (this.hasTimestamps(lyrics)) {
                this.startLyricsSync();
            }
        } else {
            throw new Error("No se encontraron letras");
        }
    } catch (error) {
        console.warn(`⚠️ Error cargando letras: ${error.message}`);
        if (lyricsContainer) {
            lyricsContainer.innerHTML = `
                <div class="lyrics-error">
                    <p>No pudimos encontrar las letras de esta canción.</p>
                    <button onclick="window.playlistManager.loadLyricsForVideo()">🔄 Reintentar</button>
                </div>`;
        }
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
    
    // --- Lógica de toggle existente ---
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

    // --- Obtención del texto ---
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
        btn.innerHTML = originalIcon;
        btn.disabled = false;
        this.core?.showMessage('No hay letras para traducir', 'warning');
        return;
    }

    try {
        console.log('🌐 Traduciendo letras (vía POST)...');
        
        const googleBaseUrl = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t";
        const proxyUrl = `/.netlify/functions/cors-proxy?url=${encodeURIComponent(googleBaseUrl)}`;

        const postData = new URLSearchParams();
        postData.append('q', textToTranslate);

        // ✅ AÑADIR TIMEOUT Y ABORT CONTROLLER
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos

        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Procesar respuesta de Google
        let fullTranslation = "";
        if (data && Array.isArray(data[0])) {
            fullTranslation = data[0]
                .filter(item => item && item[0])
                .map(item => item[0])
                .join('');
        }
        
        if (!fullTranslation || fullTranslation.trim() === '') {
            throw new Error('Traducción vacía');
        }

        // Limpieza opcional
        try {
            fullTranslation = decodeURIComponent(fullTranslation);
        } catch (e) {
            // Ignorar si ya está decodificado
        }

        // --- Inyección en el DOM ---
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
        
        let errorMessage = 'Error al traducir';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Traducción cancelada (timeout)';
        } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
        }
        
        this.core?.showMessage(errorMessage, 'error');
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
    const visiblePlaylists = this.core.playlistsData.filter(p => 
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
    const queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue' || p.isQueue);
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
            const queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue');
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

async loadRelatedVideos() {
    const relatedList = document.getElementById('relatedVideosList');
    
    if (!relatedList) return;

    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    
    if (!activePlayer || typeof activePlayer.getVideoData !== 'function') {
        relatedList.innerHTML = `<p class="related-placeholder">No hay video reproduciéndose</p>`;
        return;
    }
    
    const videoData = activePlayer.getVideoData();
    const currentVideoId = videoData?.video_id;
    
    if (!currentVideoId) {
        relatedList.innerHTML = `<p class="related-placeholder">Reproduce una canción</p>`;
        return;
    }

    // Buscar video en cola
    const queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue');
    if (!queuePlaylist?.videos) return;
    
    let currentVideo = null;
    for (let i = 0; i < queuePlaylist.videos.length; i++) {
        if (queuePlaylist.videos[i].videoId === currentVideoId) {
            currentVideo = queuePlaylist.videos[i];
            break;
        }
    }
    
    if (!currentVideo) return;

    // Verificar caché
    if (this.lastLoadedRelatedId === currentVideo.videoId) {
        const existing = relatedList.querySelectorAll('.related-video-item');
        if (existing.length > 0) return;
    }

    this.lastLoadedRelatedId = currentVideo.videoId;
    relatedList.innerHTML = `<div class="related-loading"><i class="fas fa-spinner fa-spin"></i><p>Cargando...</p></div>`;

    try {
        const artist = this.extractArtistFromTitle(currentVideo.title);
        const searchQuery = artist !== 'Desconocido' ? artist : currentVideo.title;
        
        const searchResults = await window.youtubeJSClient.search(searchQuery);
        
        if (!searchResults?.items?.length) {
            throw new Error('Sin resultados');
        }
        
        const relatedVideos = searchResults.items
            .filter(video => video.videoId !== currentVideo.videoId)
            .slice(0, 15);
        
        if (relatedVideos.length === 0) {
            relatedList.innerHTML = `<div class="related-placeholder"><i class="fas fa-music-slash"></i><p>No hay relacionados</p></div>`;
            return;
        }
        
        this.renderRelatedVideos(relatedVideos, relatedList);

    } catch (error) {
        console.error('❌ Error:', error);
        relatedList.innerHTML = `<div class="related-error"><i class="fas fa-exclamation-triangle"></i><p>Error cargando</p></div>`;
    }
}
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
                    this.core.playNextVideo(index);
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

    createPlaylistCard(playlist) {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.dataset.playlistId = playlist.id;

    const videoCount = playlist.videos?.length || 0;
    const isYouTubeLibrary = playlist.source === 'youtube_library';
    
    // CORRECCIÓN: Usar artista si está disponible
    const artistInfo = playlist.artist || 'YouTube';

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
                `<span class="playlist-source-badge"><i class="fas fa-user"></i> ${artistInfo}</span>` : 
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
    const updatedPlaylist = this.core.playlistsData.find(p => p.id === playlistId);
    
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
        const queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue');
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
                this.core?.playNextVideo(0);
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
            
            const playlistToDelete = this.core.playlistsData.find(p => p.id === playlistId);
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
        const playlist = this.core.playlistsData.find(p => p.id === playlistId);
        if (!playlist) {
            console.warn(`⚠️ Playlist ${playlistId} no encontrada`);
            return;
        }
        
        console.log(`🗑️ Eliminando playlist: ${playlist.name} (${playlistId})`);
        
        if (playlist.isQueue || playlistId === 'queue') {
            this.core?.showMessage('No puedes eliminar la cola de reproducción', 'warning');
            return;
        }
        
        const indexToRemove = this.core.playlistsData.findIndex(p => p.id === playlistId);
        if (indexToRemove !== -1) {
            this.core.playlistsData.splice(indexToRemove, 1);
            
            if (this.core && this.core.playlistsData) {
                this.core.playlistsData = this.core.playlistsData;
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
    const queueList = document.getElementById('queueContentList');
    if (!queueList) {
        console.warn('⚠️ queueContentList no encontrado');
        return;
    }

    // ✅ LIMPIAR LISTENERS ANTERIORES
    // Clonar y reemplazar para eliminar todos los event listeners
    const newQueueList = queueList.cloneNode(true);
    if (queueList.parentNode) {
        queueList.parentNode.replaceChild(newQueueList, queueList);
    } else {
        console.error('❌ queueList no tiene parentNode');
        return;
    }
    
    // ✅ OBTENER NUEVA REFERENCIA DESPUÉS DEL REEMPLAZO
    const freshList = document.getElementById('queueContentList');
    if (!freshList) {
        console.error('❌ No se pudo obtener freshList después del reemplazo');
        return;
    }
    
    // ✅ EVENT DELEGATION (más eficiente)
    freshList.addEventListener('click', (e) => {
        // IGNORAR: Botones de eliminar
        if (e.target.closest('.queue-item-remove')) {
            return;
        }
        
        // CLICK EN ITEM: Reproducir
        const item = e.target.closest('.queue-item');
        if (!item) return;
        
        const index = parseInt(item.dataset.flatIndex);
        if (!isNaN(index) && index >= 0) {
            console.log(`▶️ Reproduciendo desde cola: índice ${index}`);
            
            window.currentPlayingInfo.flattenedIndex = index - 1;
            
            if (!window.reproduccionIniciada) {
                window.reproduccionIniciada = true;
                if (typeof monitorPlayers === 'function' && !window.monitorInterval) {
                    window.monitorInterval = setInterval(monitorPlayers, 500);
                }
            }
            
            if (this.core && this.core.playNextVideo) {
                this.core.playNextVideo();
            }
        }
    });
    
    // ✅ BOTONES DE ELIMINAR (con delegation)
    freshList.addEventListener('click', (e) => {
        const btn = e.target.closest('.queue-item-remove');
        if (!btn) return;
        
        e.stopPropagation();
        e.preventDefault();
        
        const videoId = btn.dataset.videoId;
        console.log(`🗑️ Eliminando: ${videoId}`);
        
        if (!videoId || videoId === 'undefined') {
            console.error('❌ videoId inválido');
            return;
        }
        
        // Deshabilitar temporalmente
        btn.disabled = true;
        btn.style.opacity = '0.5';
        
        const success = this.removeVideoFromQueue(videoId);
        
        if (!success) {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    });
    
    console.log('✅ Listeners de cola configurados correctamente');
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
                        
                        <!-- CORRECCIÓN: Wrapper con duración dentro -->
                        <div class="popup-video-thumbnail-wrapper">
                            <img src="${video.thumbnail}" 
                                 alt="${this.escapeHTML(video.title)}" 
                                 class="popup-video-thumbnail"
                                 onerror="this.src='./electronic.ico';">
                            <span class="popup-video-duration">${duration}</span>
                        </div>
                        
                        <div class="popup-video-info">
                            <div class="popup-video-title" title="${this.escapeHTML(video.title)}">
                                ${this.escapeHTML(video.title)}
                            </div>
                            <div class="popup-video-meta">
                                <span class="popup-video-channel">${this.escapeHTML(video.uploaderName || 'YouTube')}</span>
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
    console.log('🎯 Configurando eventos del popup');
    
    // Botón cerrar
    const closeBtn = popup.querySelector('.playlist-popup-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('❌ Cerrando popup');
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 300);
        });
    }

    // Click fuera del popup
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            console.log('❌ Click fuera del popup');
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 300);
        }
    });

    // ✅ EVENT DELEGATION para botones de acción
    const popupContent = popup.querySelector('.playlist-popup-content');
    if (popupContent) {
        popupContent.addEventListener('click', async (e) => {
            const actionBtn = e.target.closest('.popup-video-action-btn');
            if (!actionBtn) return;
            
            e.stopPropagation();
            e.preventDefault();
            
            const action = actionBtn.dataset.action;
            const videoId = actionBtn.dataset.videoId;
            
            console.log(`🎬 Acción: ${action} para video: ${videoId}`);
            
            const video = playlist.videos.find(v => v.videoId === videoId);
            
            if (!video) {
                console.error('❌ Video no encontrado');
                return;
            }
            
            const videoData = {
                videoId: video.videoId,
                title: video.title,
                thumbnail: video.thumbnail,
                duration: video.duration,
                uploaderName: video.uploaderName || video.author || 'YouTube',
                author: video.author || video.uploaderName || 'YouTube'
            };
            
            // Deshabilitar botón temporalmente
            actionBtn.disabled = true;
            const icon = actionBtn.querySelector('i');
            const originalIcon = icon.className;
            icon.className = 'fas fa-spinner fa-spin';
            
            try {
                if (action === 'queue') {
                    await this.addVideoToQueue(videoData);
                    icon.className = 'fas fa-check';
                    actionBtn.style.background = '#4caf50';
                } else if (action === 'play') {
                    await this.addVideoToQueue(videoData, true);
                    setTimeout(() => {
                        const flatList = this.core?.getFlattenedPlaylist();
                        const index = flatList?.findIndex(v => v.videoId === video.videoId);
                        if (index !== -1 && this.core) {
                            this.core.playNextVideo(index);
                            this.core.switchView('fullPlayer');
                        }
                    }, 100);
                    icon.className = 'fas fa-check';
                    actionBtn.style.background = '#4caf50';
                }
                
                // Restaurar botón después de 1.5s
                setTimeout(() => {
                    icon.className = originalIcon;
                    actionBtn.style.background = '';
                    actionBtn.disabled = false;
                }, 1500);
                
            } catch (error) {
                console.error('❌ Error en acción:', error);
                icon.className = 'fas fa-times';
                actionBtn.style.background = '#f44336';
                
                setTimeout(() => {
                    icon.className = originalIcon;
                    actionBtn.style.background = '';
                    actionBtn.disabled = false;
                }, 1500);
            }
        });
    }
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
            
            const queuePlaylist = this.core.playlistsData.find(p => p.id === 'queue');
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
                            this.core?.playNextVideo(index);
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

addYouTubeLibraryPlaylists(youtubePlaylists) {
    console.log(`📥 addYouTubeLibraryPlaylists: ${youtubePlaylists?.length || 0} playlists`);
    
    if (!youtubePlaylists?.length) {
        console.warn("❌ No hay playlists válidas");
        return;
    }

    // ✅ FILTRAR PLAYLISTS SIN VIDEOS VÁLIDOS
    const validPlaylists = youtubePlaylists
        .filter(playlist => {
            // Verificar que tenga videos
            const hasVideos = playlist.videos && Array.isArray(playlist.videos);
            const hasValidVideos = hasVideos && playlist.videos.length > 0;
            
            // Verificar que al menos 1 video tenga videoId válido
            const hasValidIds = hasValidVideos && playlist.videos.some(v => 
                v.videoId && 
                typeof v.videoId === 'string' && 
                v.videoId.length === 11
            );
            
            if (!hasValidIds) {
                console.warn(`⚠️ Playlist "${playlist.title || playlist.name}" sin videos válidos`);
                return false;
            }
            
            return true;
        })
        .map(playlist => {
            // ✅ LIMPIAR VIDEOS INVÁLIDOS DENTRO DE CADA PLAYLIST
            const cleanedVideos = playlist.videos.filter(video => {
                const hasValidId = video.videoId && 
                                   typeof video.videoId === 'string' && 
                                   video.videoId.length === 11;
                
                const hasTitle = video.title && video.title.trim().length > 0;
                
                return hasValidId && hasTitle;
            });
            
            // ✅ EXTRAER ARTISTA DEL PRIMER VIDEO
            let artist = 'YouTube';
            let thumbnailUrl = './electronic.ico';
            
            if (cleanedVideos.length > 0) {
                const firstVideo = cleanedVideos[0];
                
                artist = firstVideo.artist || 
                         firstVideo.uploaderName || 
                         firstVideo.author || 
                         'YouTube';
                
                artist = artist.replace(/\s*-\s*Topic$/i, '').trim();
                thumbnailUrl = firstVideo.thumbnail || './electronic.ico';
            }
            
            return {
                id: playlist.id,
                name: playlist.title || playlist.name || 'Playlist Sin Nombre',
                thumbnailUrl: thumbnailUrl,
                videos: cleanedVideos, // ✅ Videos limpios
                isExpanded: false,
                source: 'youtube_library',
                isLoaded: true,
                count: cleanedVideos.length,
                artist: artist
            };
        });

    if (validPlaylists.length === 0) {
        console.warn("❌ No hay playlists válidas después del filtrado");
        return;
    }

    // Insertar después de la cola
    const queueIndex = this.core.playlistsData.findIndex(p => p.id === 'queue' || p.isQueue);
    const insertIndex = queueIndex !== -1 ? queueIndex + 1 : 0;
    
    this.core.playlistsData.splice(insertIndex, 0, ...validPlaylists);
    
    console.log(`✅ ${validPlaylists.length} playlists válidas añadidas`);

    // Actualizar UI
    requestAnimationFrame(() => {
        this.updatePlaylistsUI();
        
        if (this.core?.showMessage) {
            this.core.showMessage(
                `${validPlaylists.length} playlists sincronizadas`, 
                'success'
            );
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
        
        if (this.core.playlistsData.length === 0) {
            container.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-music"></i>
                    <p><strong>¡Conecta tu cuenta de Google!</strong></p>
                    <p>Ve tus playlists de YouTube y crea mezclas increíbles</p>
                    <p><small>Powered by Sistema Unificado</small></p>
                </div>
            `;
        } else {
            console.log(`📊 Recreando ${this.core.playlistsData.length} playlists en DOM`);
            
            this.core.playlistsData.forEach((playlist, index) => {
                const card = this.createPlaylistCard(playlist);
                container.appendChild(card);
                console.log(`✅ Playlist ${index + 1} renderizada: ${playlist.name}`);
            });
            
            const finalCount = container.querySelectorAll('.playlist-card').length;
            console.log(`🎯 Renderizado final: ${finalCount} de ${this.core.playlistsData.length} playlists`);
        }
        
        this.core?.updateOverviewStats?.();
    }

    /**
     * Limpiar playlists de YouTube Library
     */
    clearYouTubeLibraryPlaylists() {
        const initialCount = this.core.playlistsData.length;
        this.core.playlistsData = this.core.playlistsData.filter(p => p.source !== 'youtube_library');
        const removedCount = initialCount - this.core.playlistsData.length;
        
        if (this.core && this.core.playlistsData) {
            this.core.playlistsData = this.core.playlistsData;
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

        if (this.core.playlistsData.some(p => p.id === playlistId)) {
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

        const manualIndex = this.core.playlistsData.findIndex(p => p.id === 'manual');
        if (manualIndex !== -1) {
            this.core.playlistsData.splice(manualIndex + 1, 0, newPlaylist);
        } else {
            this.core.playlistsData.push(newPlaylist);
        }

        if (this.core && this.core.playlistsData) {
            this.core.playlistsData = this.core.playlistsData;
        }

        this.core?.showMessage(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos)`, 'success');
        this.updatePlaylistsUI();
        this.core?.enablePlayButton();
    }

    // =============================================
    // UTILIDADES
    // =============================================

    playPlaylist(playlistId) {
        const playlist = this.core.playlistsData.find(p => p.id === playlistId);
        if (!playlist?.videos?.length) {
            this.core?.showMessage("La playlist está vacía", 'warning');
            return;
        }

        const flatList = this.core?.getFlattenedPlaylist() || [];
        const firstVideoIndex = flatList.findIndex(v => v.sourcePlaylistId === playlistId);
        
        if (firstVideoIndex !== -1) {
            this.core?.playNextVideo(firstVideoIndex);
            this.core?.switchView('playing');
        }
    }

    syncWithCore() {
        if (this.core && this.core.playlistsData) {
            this.core.playlistsData = this.core.playlistsData;
        }
    }

    updateCore() {
        if (this.core) {
            this.core.playlistsData = this.core.playlistsData;
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
                        if (node.classList && node.classList.contains('queue-list-content')) {
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
        // ✅ CRÍTICO: Solo items dentro de #queueContentList
        const queueItems = document.querySelectorAll('#queueContentList .queue-item');
        
        console.log(`🎯 Configurando ${queueItems.length} items para drag & drop`);
        
        queueItems.forEach((item) => {
            // Limpiar listeners previos
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            
            // ✅ ASEGURAR DRAGGABLE
            newItem.setAttribute('draggable', 'true');
            newItem.style.cursor = 'move';
            
            // Eventos
            newItem.addEventListener('dragstart', (e) => {
                this.draggedItem = newItem;
                this.draggedIndex = parseInt(newItem.dataset.flatIndex);
                
                newItem.classList.add('dragging');
                newItem.style.opacity = '0.5';
                
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
            
            newItem.addEventListener('dragleave', () => {
                newItem.classList.remove('drag-over');
            });
            
            newItem.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleDrop(e, newItem, parseInt(newItem.dataset.flatIndex));
            });
            
            newItem.addEventListener('dragend', () => {
                this.handleDragEnd();
            });
        });
    }

    handleDrop(e, targetItem, targetIndex) {
        e.preventDefault();
        e.stopPropagation();
        
        targetItem.classList.remove('drag-over');
        
        if (this.draggedItem === targetItem || this.draggedIndex === targetIndex) {
            return false;
        }
        
        console.log(`🎯 Drop: de ${this.draggedIndex} a ${targetIndex}`);
        
        const queuePlaylist = window.playlistManager?.core?.playlistsData?.find(p => p.id === 'queue');
        if (!queuePlaylist) {
            console.error('❌ No se encontró playlist de cola');
            return false;
        }
        
        // Mover video en el array
        const [movedVideo] = queuePlaylist.videos.splice(this.draggedIndex, 1);
        
        let newIndex = targetIndex;
        if (this.draggedIndex < targetIndex) {
            newIndex--;
        }
        
        queuePlaylist.videos.splice(newIndex, 0, movedVideo);
        
        // Ajustar índice de reproducción actual
        if (window.currentPlayingInfo) {
            const currentIdx = window.currentPlayingInfo.flattenedIndex;
            
            if (currentIdx === this.draggedIndex) {
                window.currentPlayingInfo.flattenedIndex = newIndex;
            } else if (this.draggedIndex < currentIdx && newIndex >= currentIdx) {
                window.currentPlayingInfo.flattenedIndex--;
            } else if (this.draggedIndex > currentIdx && newIndex <= currentIdx) {
                window.currentPlayingInfo.flattenedIndex++;
            }
        }
        
        // Actualizar UI
        if (window.playlistManager) {
            window.playlistManager.updateQueueUI();
            
            // ✅ Reattach listeners después de actualizar
            setTimeout(() => {
                this.attachDragListeners();
            }, 100);
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
    
    handleDragEnd() {
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
