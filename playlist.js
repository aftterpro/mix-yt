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
    // GESTIÓN DE PLAYLISTS - CORE
    // =============================================
    
    /**
     * Cargar videos de una playlist específica
     */
    async loadPlaylistVideos(playlistId) {
        // Verificar si ya están cargados
        const playlist = this.playlistsData.find(p => p.id === playlistId);
        if (!playlist || playlist.isLoaded || playlist.videos.length > 0) {
            return playlist;
        }

        console.log(`📥 Cargando videos de playlist: ${playlist.name}`);
        this.core?.showMessage(`Cargando videos de "${playlist.name}"...`, 'loading');

        try {
            // Usar la función global de YouTube Library
            const videos = await getYouTubeLibraryPlaylistItems(playlistId);
            
            if (videos && videos.length > 0) {
                // CORRECCIÓN: Obtener duraciones reales de videos
                const videoIds = videos.map(v => v.videoId).filter(Boolean);
                const durations = await this.core?.getBatchVideoDurations(videoIds) || {};
                
                playlist.videos = videos.map(video => ({
                    videoId: video.videoId,
                    title: this.cleanVideoTitle(video.title),
                    thumbnail: video.thumbnail,
                    duration: durations[video.videoId] || video.duration || 0,
                    uploaderName: this.extractArtistFromTitle(video.title),
                    author: this.extractArtistFromTitle(video.title)
                }));
                playlist.isLoaded = true;
                
                console.log(`✅ ${videos.length} videos cargados para ${playlist.name}`);
                this.core?.showMessage(`${videos.length} videos cargados`, 'success');
                
                return playlist;
            } else {
                console.warn(`⚠️ No se encontraron videos en playlist ${playlistId}`);
                playlist.isLoaded = true; // Marcar como intentado
                return playlist;
            }
        } catch (error) {
            console.error(`❌ Error cargando videos de playlist ${playlistId}:`, error);
            this.core?.showMessage(`Error cargando playlist: ${error.message}`, 'error');
            return playlist;
        }
    }

    /**
     * NUEVA FUNCIÓN: Limpiar título de video
     * Elimina: (Videoclip Oficial), [Remix], | Video Oficial, etc.
     */
    cleanVideoTitle(title) {
        if (!title) return "Título Desconocido";
        
        let cleaned = title;
        
        // Eliminar patrones comunes al final o entre paréntesis/corchetes
        const patternsToRemove = [
            /\(Videoclip Oficial\)/gi,
            /\(Video Oficial\)/gi,
            /\| Video Oficial/gi,
            /\[Video Oficial\]/gi,
            /\(Official Video\)/gi,
            /\[Official Video\]/gi,
            /\(Official Music Video\)/gi,
            /\[Official Music Video\]/gi,
            /\(Lyric Video\)/gi,
            /\[Lyric Video\]/gi,
            /\(Audio Oficial\)/gi,
            /\[Audio Oficial\]/gi,
        ];
        
        patternsToRemove.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });
        
        // Extraer solo el título si hay artista
        // Patrones: "Artista - Título" o "Artista: Título"
        const artistTitlePattern = /^(.+?)\s*[-:]\s*(.+?)(?:\s*\(.*?\)|\s*\[.*?\])*$/;
        const match = cleaned.match(artistTitlePattern);
        
        if (match && match[2]) {
            // Solo retornar el título, sin el artista
            cleaned = match[2].trim();
            
            // Limpiar features y remix del título si están al final
            cleaned = cleaned
                .replace(/\s*\(feat\..*?\)/gi, '')
                .replace(/\s*\[Remix\]/gi, '')
                .replace(/\s*\(Remix\)/gi, '');
        }
        
        // Limpiar espacios múltiples y trim final
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        return cleaned || title; // Fallback al título original si queda vacío
    }

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
    /**
     * Actualizar UI de playlists
     */
    updatePlaylistsUI() {
        const container = document.getElementById('playlistsGrid');
        const queueContainer = document.getElementById('playlistContainer');
        
        if (!container && !queueContainer) return;

        const playingVideoId = this.core?.currentPlayingInfo?.videoId;

        // Actualizar vista de biblioteca
        if (container) {
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
                container.innerHTML = '';
                this.playlistsData.forEach(playlist => {
                    const card = this.createPlaylistCard(playlist);
                    container.appendChild(card);
                });
            }
        }

        // Actualizar cola de reproducción
        if (queueContainer) {
            this.updateQueueDisplay();
        }

        this.core?.updateOverviewStats();
    }

    /**
     * Crear tarjeta visual de playlist
     */
    createPlaylistCard(playlist) {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.dataset.playlistId = playlist.id;

        // CORRECCIÓN: Mostrar contador correcto de videos
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
            
            // CORRECCIÓN: Cargar videos si es YouTube Library y no está cargada
            if (isYouTubeLibrary && !playlist.isLoaded) {
                console.log('📥 Cargando videos de YouTube Library...');
                await this.loadPlaylistVideos(playlistId);
            }
            
            // Obtener playlist actualizada
            const updatedPlaylist = this.playlistsData.find(p => p.id === playlistId);
            
            console.log('📊 Playlist actualizada:', {
                id: updatedPlaylist?.id,
                name: updatedPlaylist?.name,
                videosCount: updatedPlaylist?.videos?.length,
                isLoaded: updatedPlaylist?.isLoaded
            });
            
            // Añadir toda la playlist a la cola
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
                    
                    // Verificar si ya está en cola antes de añadir
                    const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
                    const isDuplicate = queuePlaylist?.videos.some(v => v.videoId === video.videoId);
                    
                    if (!isDuplicate) {
                        await this.core?.addVideoToQueue(videoData);
                        addedCount++;
                    }
                }
                
                if (addedCount > 0) {
                    this.core?.showMessage(`${addedCount} videos de "${updatedPlaylist.name}" añadidos a cola`, 'success');
                    
                    // Reproducir el primer video añadido si no hay reproducción activa
                    const flatList = this.core?.getFlattenedPlaylist();
                    if (flatList?.length > 0 && !this.core?.reproduccionIniciada) {
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

        // CORRECCIÓN: Event listener para eliminar playlist (ahora funciona para TODAS)
        const deleteBtn = card.querySelector('.delete-playlist-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const playlistId = deleteBtn.dataset.playlistId;
                
                console.log(`🗑️ Solicitud eliminar playlist: ${playlistId}`);
                
                // Confirmar antes de eliminar
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
        
        // NO permitir eliminar la cola
        if (playlist.isQueue || playlistId === 'queue') {
            this.core?.showMessage('No puedes eliminar la cola de reproducción', 'warning');
            return;
        }
        
        // Eliminar de playlistsData
        const indexToRemove = this.playlistsData.findIndex(p => p.id === playlistId);
        if (indexToRemove !== -1) {
            this.playlistsData.splice(indexToRemove, 1);
            
            // Actualizar también en el core si existe
            if (this.core && this.core.playlistsData) {
                this.core.playlistsData = this.playlistsData;
            }
            
            console.log(`✅ Playlist "${playlist.name}" eliminada`);
            this.updatePlaylistsUI();
            this.core?.showMessage(`Playlist "${playlist.name}" eliminada`, 'success');
            
            // Actualizar cola si es necesario
            const flatList = this.core?.getFlattenedPlaylist();
            if (flatList?.length === 0) {
                this.core?.handleEmptyPlaylist();
            } else {
                this.core?.updateCurrentPlayingIndex();
            }
        } else {
            console.error(`❌ No se pudo encontrar índice de playlist ${playlistId}`);
        }
    }
// 3. DRAG AND DROP EN COLA DE REPRODUCCIÓN
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
        
        // Observar cambios en el popup de cola para reconfigurar
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.classList && node.classList.contains('queue-popup-overlay')) {
                            // Esperar a que el contenido se renderice
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
            // Hacer items arrastrables
            item.setAttribute('draggable', 'true');
            item.style.cursor = 'move';
            
            // Eliminar listeners anteriores
            item.removeEventListener('dragstart', this.handleDragStart);
            item.removeEventListener('dragover', this.handleDragOver);
            item.removeEventListener('drop', this.handleDrop);
            item.removeEventListener('dragend', this.handleDragEnd);
            item.removeEventListener('dragenter', this.handleDragEnter);
            item.removeEventListener('dragleave', this.handleDragLeave);
            
            // Agregar nuevos listeners
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
        
        // Estilo visual
        item.style.opacity = '0.5';
        item.classList.add('dragging');
        
        // Datos para el drag
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
        
        // Reordenar en playlistsData
        const queuePlaylist = playlistsData.find(p => p.id === 'queue' || p.isQueue);
        if (!queuePlaylist) return;
        
        // Extraer el video arrastrado
        const [movedVideo] = queuePlaylist.videos.splice(this.draggedIndex, 1);
        
        // Insertar en nueva posición
        let newIndex = targetIndex;
        if (this.draggedIndex < targetIndex) {
            newIndex--;
        }
        
        queuePlaylist.videos.splice(newIndex, 0, movedVideo);
        
        // Actualizar índice de reproducción si es necesario
        if (currentPlayingInfo.flattenedIndex === this.draggedIndex) {
            currentPlayingInfo.flattenedIndex = newIndex;
        } else if (this.draggedIndex < currentPlayingInfo.flattenedIndex && 
                   newIndex >= currentPlayingInfo.flattenedIndex) {
            currentPlayingInfo.flattenedIndex--;
        } else if (this.draggedIndex > currentPlayingInfo.flattenedIndex && 
                   newIndex <= currentPlayingInfo.flattenedIndex) {
            currentPlayingInfo.flattenedIndex++;
        }
        
        // Actualizar UI
        if (window.unifiedCore) {
            window.unifiedCore.updateQueuePopup();
            window.unifiedCore.showMessage('Orden actualizado', 'success');
        }
        
        // Guardar cambios
        setTimeout(() => saveAllData(), 100);
        
        return false;
    }
    
    handleDragEnd(e) {
        console.log('🎯 Drag end');
        
        if (this.draggedItem) {
            this.draggedItem.style.opacity = '1';
            this.draggedItem.classList.remove('dragging');
        }
        
        // Limpiar todos los estilos drag-over
        document.querySelectorAll('.queue-item').forEach(item => {
            item.classList.remove('drag-over');
        });
        
        this.draggedItem = null;
        this.draggedIndex = null;
    }
}

// Inicializar drag & drop
window.queueDragDrop = new QueueDragDrop();

    /**
     * Crear popup de playlist con detalles
     */
    async createPlaylistPopup(playlist) {
        // Si es una playlist de YouTube Library y no está cargada, cargarla primero
        if (playlist.source === 'youtube_library' && !playlist.isLoaded && playlist.videos.length === 0) {
            await this.loadPlaylistVideos(playlist.id);
            playlist = this.playlistsData.find(p => p.id === playlist.id); // Recargar datos actualizados
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
        
        // Animación de entrada
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
            // CORRECCIÓN: Formatear duración correctamente
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
        // Cerrar popup
        popup.querySelector('.playlist-popup-close').addEventListener('click', () => {
            popup.remove();
        });

        popup.addEventListener('click', (e) => {
            if (e.target === popup) popup.remove();
        });

        // Reproducir video directamente
        popup.querySelectorAll('.video-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const videoIndex = parseInt(btn.dataset.videoIndex);
                const video = playlist.videos[videoIndex];
                
                // Añadir toda la playlist a la cola manual si no está
                this.addPlaylistToQueue(playlist);
                
                // Reproducir este video específico
                const flatList = this.core?.getFlattenedPlaylist();
                const globalIndex = flatList?.findIndex(v => v.videoId === video.videoId);
                if (globalIndex !== -1) {
                    this.core?.playVideoAtIndex(globalIndex);
                    popup.remove();
                    this.core?.switchView('playing');
                }
            });
        });

        // Menu de 3 puntos
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
            
            // Verificar duplicados antes de añadir
            const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
            const isDuplicate = queuePlaylist?.videos.some(v => v.videoId === video.videoId);
            
            if (!isDuplicate) {
                this.core?.addVideoToQueue(videoData);
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

        // Posicionar cerca del botón
        const rect = buttonElement.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left - 100}px`;
        menu.style.zIndex = '10000';

        // Event listeners
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
                    this.core?.addVideoToQueue(videoData);
                } else if (action === 'play') {
                    this.core?.addVideoToQueue(videoData);
                    // Reproducir inmediatamente
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

        // Cerrar al hacer click fuera
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 100);

        document.body.appendChild(menu);
    }

    // =============================================
    // COLA DE REPRODUCCIÓN
    // =============================================

    /**
     * Actualizar display de la cola
     */
    updateQueueDisplay() {
        const queueContainer = document.getElementById('playlistContainer');
        if (!queueContainer) return;

        const flatList = this.core?.getFlattenedPlaylist() || [];
        
        if (flatList.length === 0) {
            queueContainer.innerHTML = `
                <div class="empty-queue-message">
                    <i class="fas fa-music"></i>
                    <p>La cola está vacía</p>
                    <p>Añade música desde la biblioteca o búsqueda</p>
                </div>
            `;
            return;
        }

        let queueHTML = `
            <div class="queue-controls">
                <div class="queue-info">
                    <span class="queue-count">${flatList.length} videos en cola</span>
                </div>
                <button class="clear-queue-btn" onclick="window.playlistManager.clearQueue()">
                    <i class="fas fa-trash"></i>
                    Borrar todo
                </button>
            </div>
            <div class="queue-items">
        `;
        
        flatList.forEach((video, index) => {
            const isPlaying = video.videoId === this.core?.currentPlayingInfo?.videoId;
            const formattedDuration = video.duration && video.duration > 0 
                ? this.core?.formatDuration(video.duration) 
                : '--:--';
            
            queueHTML += `
                <div class="queue-item ${isPlaying ? 'playing' : ''}" 
                     data-video-id="${video.videoId}" 
                     data-flat-index="${index}">
                    <div class="queue-item-number">${index + 1}</div>
                    <img src="${video.thumbnail}" alt="${video.title}" class="queue-item-thumbnail">
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
        
        // CORRECCIÓN: Event listeners mejorados para cola
        queueContainer.querySelectorAll('.queue-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.queue-item-remove')) {
                    const index = parseInt(item.dataset.flatIndex);
                    this.core?.playVideoAtIndex(index);
                }
            });
        });
        
        // CORRECCIÓN CRÍTICA: Event listeners para eliminar de cola
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
                
                // Deshabilitar botón temporalmente
                btn.disabled = true;
                btn.style.opacity = '0.5';
                
                // Eliminar video
                const success = this.core?.removeVideoFromQueue(videoId);
                
                if (success) {
                    // Actualizar display
                    setTimeout(() => {
                        this.updateQueueDisplay();
                    }, 100);
                } else {
                    // Restaurar botón si falló
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    this.core?.showMessage('Error eliminando video', 'error');
                }
            });
        });
    }

    /**
     * Borrar toda la cola
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
                this.core?.handleEmptyPlaylist();
            }
        }
    }

    // =============================================
    // PLAYLISTS DE YOUTUBE LIBRARY
    // =============================================

    /**
     * Añadir playlists de YouTube Library
     */
addYouTubeLibraryPlaylists(youtubePlaylists) {
    console.log(`📥 addYouTubeLibraryPlaylists llamada con ${youtubePlaylists?.length || 0} playlists`);
    
    // Validación rápida
    if (!youtubePlaylists?.length) {
        console.warn("❌ No se recibieron playlists válidas");
        return;
    }

    // Verificar duplicados de manera eficiente - UNA SOLA VEZ
    const currentYouTubeCount = this.playlistsData.filter(p => p.source === 'youtube_library').length;
    
    if (currentYouTubeCount >= youtubePlaylists.length) {
        console.log(`✅ Ya hay ${currentYouTubeCount} playlists de YouTube cargadas`);
        return;
    }

    // Limpiar solo si hay conflicto real
    if (currentYouTubeCount > 0) {
        console.log(`🧹 Limpiando ${currentYouTubeCount} playlists duplicadas...`);
        this.playlistsData = this.playlistsData.filter(p => p.source !== 'youtube_library');
    }

    // Formatear playlists de manera eficiente
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

    // Insertar de manera eficiente - encontrar índice UNA VEZ
    const insertIndex = Math.max(
        this.playlistsData.findIndex(p => p.id === 'manual'),
        this.playlistsData.findIndex(p => p.id === 'queue') + 1,
        0
    );
    
    // Insertar todas las playlists de una vez
    this.playlistsData.splice(insertIndex, 0, ...validPlaylists);
    
    console.log(`✅ ${validPlaylists.length} playlists de YouTube añadidas correctamente`);

    // Actualizar UI UNA SOLA VEZ - sin verificaciones redundantes
    requestAnimationFrame(() => {
        this.updatePlaylistsUI();
        
        // Mostrar mensaje al usuario
        if (this.core?.showMessage) {
            this.core.showMessage(`${validPlaylists.length} playlists de YouTube sincronizadas`, 'success');
        }
    });
}

// Forzar recreación de UI:
forceRecreatePlaylistsUI() {
    console.log("🔄 Forzando recreación completa de UI de playlists");
    
    const container = document.getElementById('playlistsGrid');
    if (!container) {
        console.error("❌ Container playlistsGrid no encontrado");
        return;
    }
    
    // LIMPIAR COMPLETAMENTE
    container.innerHTML = '';
    
    // RECREAR DESDE CERO
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
        
        // VERIFICAR RENDERIZADO FINAL
        const finalCount = container.querySelectorAll('.playlist-card').length;
        console.log(`🎯 Renderizado final: ${finalCount} de ${this.playlistsData.length} playlists`);
    }
    
    // ACTUALIZAR ESTADÍSTICAS
    this.core?.updateOverviewStats();
}

    /**
     * Limpiar playlists de YouTube Library
     */
    clearYouTubeLibraryPlaylists() {
        const initialCount = this.playlistsData.length;
        this.playlistsData = this.playlistsData.filter(p => p.source !== 'youtube_library');
        const removedCount = initialCount - this.playlistsData.length;
        
        // Actualizar también en el core si existe
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

    /**
     * Extraer ID de playlist de URL
     */
    extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            return null;
        }
    }

    /**
     * Obtener información de playlist desde API
     */
    async getPlaylistInfo(playlistId) {
        const pipedInstances = [
            "https://api.piped.private.coffee"
        ];
        
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

    /**
     * Manejar playlist cargada desde URL
     */
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

        // Insertar después de la playlist manual
        const manualIndex = this.playlistsData.findIndex(p => p.id === 'manual');
        if (manualIndex !== -1) {
            this.playlistsData.splice(manualIndex + 1, 0, newPlaylist);
        } else {
            this.playlistsData.push(newPlaylist);
        }

        // Actualizar también en el core si existe
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

    /**
     * MEJORADO: Extraer artista del título con mejor formato
     */
    extractArtistFromTitle(title) {
        if (!title) return 'Artista Desconocido';
        
        // Patrones para extraer artista - Formato: "Artista - Título" o "Artista: Título"
        const artistPatterns = [
            /^(.+?)\s*[-:]\s*(.+?)(?:\s*\(.*?\)|\s*\[.*?\])*$/,
            /^(.+?)\s*\|\s*(.+?)$/
        ];
        
        for (const pattern of artistPatterns) {
            const match = title.match(pattern);
            if (match && match[1]) {
                let artist = match[1].trim();
                
                // Limpiar features del artista pero mantener el artista principal
                // Ejemplo: "Piso 21 - Me Llamas (feat. Maluma)" -> Artista: "Piso 21 feat. Maluma"
                // Pero si está en el artista, mantenerlo
                if (artist.includes('ft.') || artist.includes('feat.') || artist.includes('featuring')) {
                    // Ya tiene features en el nombre del artista, mantener
                    return artist;
                }
                
                // Si el feature está en el título, extraerlo
                const featureInTitle = title.match(/\(feat\.\s*([^)]+)\)|\(ft\.\s*([^)]+)\)|featuring\s+([^)]+)/i);
                if (featureInTitle) {
                    const featuredArtist = featureInTitle[1] || featureInTitle[2] || featureInTitle[3];
                    if (featuredArtist) {
                        return `${artist} feat. ${featuredArtist.trim()}`;
                    }
                }
                
                return artist;
            }
        }
        
        // Si no encuentra patrón, extraer primera parte antes de paréntesis/corchetes
        const beforeParenthesis = title.split(/[\(\[]/)[0].trim();
        if (beforeParenthesis && beforeParenthesis.length > 0 && beforeParenthesis.length < title.length) {
            return beforeParenthesis;
        }
        
        return 'YouTube';
    }

    /**
     * Reproducir playlist específica
     */
    playPlaylist(playlistId) {
        const playlist = this.playlistsData.find(p => p.id === playlistId);
        if (!playlist?.videos?.length) {
            this.core?.showMessage("La playlist está vacía", 'warning');
            return;
        }

        // Encontrar el primer video de esta playlist en la lista aplanada
        const flatList = this.core?.getFlattenedPlaylist() || [];
        const firstVideoIndex = flatList.findIndex(v => v.sourcePlaylistId === playlistId);
        
        if (firstVideoIndex !== -1) {
            this.core?.playVideoAtIndex(firstVideoIndex);
            this.core?.switchView('playing');
        }
    }

    // =============================================
    // SINCRONIZACIÓN CON CORE
    // =============================================

    /**
     * Sincronizar datos con el core
     */
    syncWithCore() {
        if (this.core && this.core.playlistsData) {
            this.playlistsData = this.core.playlistsData;
        }
    }

    /**
     * Actualizar datos en el core
     */
    updateCore() {
        if (this.core) {
            this.core.playlistsData = this.playlistsData;
        }
    }
}

// =============================================
// FUNCIONES GLOBALES PARA COMPATIBILIDAD
// =============================================

// Crear instancia global cuando esté disponible el core
let playlistManagerInstance = null;

// Función para inicializar el gestor cuando el core esté listo
function initializePlaylistManager(unifiedCore) {
    playlistManagerInstance = new PlaylistManager(unifiedCore);
    
    // Exponer globalmente para compatibilidad
    window.playlistManager = playlistManagerInstance;
    
    console.log('✅ PlaylistManager inicializado y conectado con UnifiedCore');
    return playlistManagerInstance;
}

// Función para configurar event listeners de playlist input (movida desde core.js)
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

// Configurar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('📁 Playlist.js cargado, esperando inicialización...');
    
    // Configurar input de playlist URL
    setTimeout(() => {
        setupPlaylistInput();
    }, 1000); // Esperar a que el DOM esté completamente cargado
});

// =============================================
// FUNCIONES GLOBALES DE UTILIDAD
// =============================================

// Función para obtener la instancia del playlist manager
window.getPlaylistManager = function() {
    return playlistManagerInstance;
};

// Función para verificar si el playlist manager está listo
window.isPlaylistManagerReady = function() {
    return playlistManagerInstance !== null && playlistManagerInstance.core !== null;
};

// Función de debug específica para playlists
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

// Función para forzar sincronización
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
// EXPORT PARA MÓDULOS ES6 (OPCIONAL)
// =============================================

// Si se usan módulos ES6
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PlaylistManager,
        initializePlaylistManager
    };
}

// Si se usa como módulo ES6
if (typeof window !== 'undefined') {
    window.PlaylistManager = PlaylistManager;
    window.initializePlaylistManager = initializePlaylistManager;
}

console.log('🎵 Playlist.js completamente cargado y listo');
