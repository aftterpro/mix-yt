console.log('🎵 Cargando gestor de playlists...');

// =============================================
// CLASE PRINCIPAL PARA GESTIÓN DE PLAYLISTS
// =============================================
class PlaylistManager {
    constructor(unifiedCore) {
        this.core = unifiedCore;
        this.playlistsData = unifiedCore.playlistsData;
        
        // Cargar datos persistentes ANTES de inicializar
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
                    newIndex = 0;
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
        // Verificar si ya existe el popup
        let existingPopup = document.querySelector('.queue-popup-overlay');
        if (existingPopup) {
            existingPopup.remove();
        }

        const flatList = this.core?.getFlattenedPlaylist() || [];
        
        const popup = document.createElement('div');
        popup.className = 'queue-popup-overlay';
        popup.innerHTML = `
            <div class="queue-popup">
                <div class="queue-popup-header">
                    <h3>Cola de Reproducción</h3>
                    <button class="queue-popup-close">×</button>
                </div>
                <div class="queue-popup-content" id="queuePopupContent">
                    ${this.renderQueueContent(flatList)}
                </div>
            </div>
        `;

        // Event listeners
        popup.querySelector('.queue-popup-close').addEventListener('click', () => {
            popup.remove();
        });

        popup.addEventListener('click', (e) => {
            if (e.target === popup) popup.remove();
        });

        document.body.appendChild(popup);
        
        // Configurar drag & drop
        setTimeout(() => {
            if (window.queueDragDrop) {
                window.queueDragDrop.attachDragListeners();
            }
        }, 100);
        
        // Animación de entrada
        setTimeout(() => popup.classList.add('show'), 10);
    }

    /**
     * Actualizar contenido del popup de cola
     */
    updateQueuePopup() {
        const popupContent = document.getElementById('queuePopupContent');
        if (!popupContent) return;

        const flatList = this.core?.getFlattenedPlaylist() || [];
        popupContent.innerHTML = this.renderQueueContent(flatList);
        
        // Reconfigurar drag & drop
        setTimeout(() => {
            if (window.queueDragDrop) {
                window.queueDragDrop.attachDragListeners();
            }
        }, 50);
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
            const isPlaying = video.videoId === window.currentPlayingInfo?.videoId;
            const formattedDuration = video.duration && video.duration > 0 
                ? this.core?.formatDuration(video.duration) 
                : '--:--';
            
            html += `
                <div class="queue-item ${isPlaying ? 'playing' : ''}" 
                     data-video-id="${video.videoId}" 
                     data-flat-index="${index}">
                    <div class="queue-item-info">
                        <div class="queue-item-title">${video.title}</div>
                        <div class="queue-item-duration">${formattedDuration}</div>
                    </div>
                    ${isPlaying ? '<i class="fas fa-volume-up queue-item-playing"></i>' : ''}
                    <button class="queue-item-remove" data-video-id="${video.videoId}" title="Eliminar de la cola">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        
        queueHTML += '</div>';
        queueContainer.innerHTML = queueHTML;
        
        // Event listeners para cola
        queueContainer.querySelectorAll('.queue-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.queue-item-remove')) {
                    const index = parseInt(item.dataset.flatIndex);
                    this.core?.playVideoAtIndex(index);
                }
            });
        });
        
        queueContainer.querySelectorAll('.queue-item-remove').forEach(btn => {
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

        // Event listener para reproducir playlist
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

        // Event listener para eliminar playlist
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

        // Click en card para popup
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.play-playlist-btn') && !e.target.closest('.delete-playlist-btn')) {
                this.createPlaylistPopup(playlist);
            }
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
     * Crear popup de playlist con detalles
     */
    async createPlaylistPopup(playlist) {
        if (playlist.source === 'youtube_library' && !playlist.isLoaded && playlist.videos.length === 0) {
            await this.loadPlaylistVideos(playlist.id);
            playlist = this.playlistsData.find(p => p.id === playlist.id);
        }

        const popup = document.createElement('div');
        popup.className = 'playlist-popup-overlay';
        popup.innerHTML = `
            <div class="playlist-popup">
                <div class="playlist-popup-header">
                    <div class="playlist-header-info">
                        <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" class="playlist-popup-thumb">
                        <div class="playlist-header-text">
                            <h3>${playlist.name}</h3>
                            <p class="playlist-video-count">${playlist.videos.length} videos</p>
                        </div>
                    </div>
                    <button class="playlist-popup-close">×</button>
                </div>
                <div class="playlist-popup-content">
                    ${this.renderPlaylistContent(playlist)}
                </div>
            </div>
        `;

        this.setupPlaylistPopupEvents(popup, playlist);
        document.body.appendChild(popup);
        
        setTimeout(() => popup.classList.add('show'), 10);
    }

    /**
     * Renderizar contenido de playlist
     */
    renderPlaylistContent(playlist) {
        if (playlist.videos.length === 0) {
            return `<div class="empty-playlist">
                <i class="fas fa-music-slash"></i>
                <h4>Esta playlist está vacía</h4>
                <p>No se encontraron videos válidos</p>
            </div>`;
        }

        return playlist.videos.map((video, index) => {
            const formattedDuration = video.duration && video.duration > 0 
                ? this.core?.formatDuration(video.duration) 
                : '--:--';
            
            return `
            <div class="playlist-video-item" data-index="${index}">
                <div class="video-number">${index + 1}</div>
                <img src="${video.thumbnail}" alt="${video.title}" class="video-thumb">
                <div class="video-info">
                    <div class="video-title" title="${video.title}">${video.title}</div>
                    <div class="video-meta">
                        <span class="video-duration">${formattedDuration}</span>
                        ${video.uploaderName ? `<span class="video-author">${video.uploaderName}</span>` : ''}
                    </div>
                </div>
                <div class="video-actions">
                    <button class="video-play-btn" title="Reproducir ahora" data-video-index="${index}">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="video-menu-btn" title="Más opciones" data-video-id="${video.videoId}">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </div>
        `;
        }).join('');
    }

    /**
     * Configurar eventos del popup de playlist
     */
    setupPlaylistPopupEvents(popup, playlist) {
        popup.querySelector('.playlist-popup-close').addEventListener('click', () => {
            popup.remove();
        });

        popup.addEventListener('click', (e) => {
            if (e.target === popup) popup.remove();
        });

        popup.querySelectorAll('.video-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const videoIndex = parseInt(btn.dataset.videoIndex);
                const video = playlist.videos[videoIndex];
                
                this.addPlaylistToQueue(playlist);
                
                const flatList = this.core?.getFlattenedPlaylist();
                const globalIndex = flatList?.findIndex(v => v.videoId === video.videoId);
                if (globalIndex !== -1) {
                    this.core?.playVideoAtIndex(globalIndex);
                    popup.remove();
                    this.core?.switchView('playing');
                }
            });
        });

        popup.querySelectorAll('.video-menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const videoId = btn.dataset.videoId;
                const video = playlist.videos.find(v => v.videoId === videoId);
                this.showVideoMenu(video, btn);
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

        const currentYouTubeCount = this.playlistsData.filter(p => p.source === 'youtube_library').length;
        
        if (currentYouTubeCount >= youtubePlaylists.length) {
            console.log(`✅ Ya hay ${currentYouTubeCount} playlists de YouTube cargadas`);
            return;
        }

        if (currentYouTubeCount > 0) {
            console.log(`🧹 Limpiando ${currentYouTubeCount} playlists duplicadas...`);
            this.playlistsData = this.playlistsData.filter(p => p.source !== 'youtube_library');
        }

        const validPlaylists = youtubePlaylists
            .filter(playlist => playlist.snippet?.title && playlist.contentDetails?.itemCount > 0)
            .map(playlist => ({
                id: playlist.id,
                name: playlist.snippet.title,
                thumbnailUrl: playlist.snippet.thumbnails?.high?.url || 
                             playlist.snippet.thumbnails?.default?.url || 
                             './electronic.ico',
                videos: [],
                isExpanded: false,
                source: 'youtube_library',
                isLoaded: false
            }));

        if (validPlaylists.length === 0) {
            console.warn("❌ No hay playlists válidas para añadir");
            return;
        }

        const insertIndex = Math.max(
            this.playlistsData.findIndex(p => p.id === 'manual'),
            this.playlistsData.findIndex(p => p.id === 'queue') + 1,
            0
        );
        
        this.playlistsData.splice(insertIndex, 0, ...validPlaylists);
        
        console.log(`✅ ${validPlaylists.length} playlists de YouTube añadidas correctamente`);

        requestAnimationFrame(() => {
            this.updatePlaylistsUI();
            
            if (this.core?.showMessage) {
                this.core.showMessage(`${validPlaylists.length} playlists de YouTube sincronizadas`, 'success');
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
        
        const queuePlaylist = window.playlistsData.find(p => p.id === 'queue' || p.isQueue);
        if (!queuePlaylist) return;
        
        const [movedVideo] = queuePlaylist.videos.splice(this.draggedIndex, 1);
        
        let newIndex = targetIndex;
        if (this.draggedIndex < targetIndex) {
            newIndex--;
        }
        
        queuePlaylist.videos.splice(newIndex, 0, movedVideo);
        
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
        
        if (window.playlistManager) {
            window.playlistManager.updateQueuePopup();
        }
        
        if (window.unifiedCore) {
            window.unifiedCore.showMessage('Orden actualizado', 'success');
        }
        
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
