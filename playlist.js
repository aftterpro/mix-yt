console.log('🎵 Cargando gestor de playlists...');

// =============================================
// VARIABLES GLOBALES ESPECÍFICAS DE PLAYLISTS
// =============================================
// Usar la variable global definida en auth.js o definir si no existe
const YOUTUBE_LIBRARY_SOURCE_ID = window.YOUTUBE_LIBRARY_SOURCE_ID || 'youtube_library';

// =============================================
// CLASE PRINCIPAL PARA GESTIÓN DE PLAYLISTS
// =============================================
class PlaylistManager {
    constructor(unifiedCore) {
        this.core = unifiedCore;
        this.playlistsData = this.core ? this.core.playlistsData || [] : [];
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
                playlist.videos = videos.map(video => ({
                    videoId: video.videoId,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    duration: video.duration || 0,
                    uploaderName: 'YouTube', // Fallback ya que YouTube Library no siempre tiene esta info
                    author: 'YouTube'
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
                <p class="playlist-card-count">${playlist.videos.length} videos</p>
                ${playlist.source === YOUTUBE_LIBRARY_SOURCE_ID ? 
                    '<span class="playlist-source-badge"><i class="fab fa-youtube"></i> YouTube</span>' : 
                    '<span class="playlist-source-badge"><i class="fas fa-user"></i> Personal</span>'
                }
                ${playlist.source !== YOUTUBE_LIBRARY_SOURCE_ID ? 
                    '<button class="delete-playlist-btn" data-playlist-id="' + playlist.id + '"><i class="fas fa-trash"></i></button>' : ''
                }
            </div>
        `;

        // Event listener para reproducir playlist
        const playBtn = card.querySelector('.play-playlist-btn');
        playBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const playlistId = e.target.dataset.playlistId;
            
            // Cargar videos si es necesario
            if (playlist.source === YOUTUBE_LIBRARY_SOURCE_ID && !playlist.isLoaded) {
                await this.loadPlaylistVideos(playlistId);
            }
            
            // Añadir toda la playlist a la cola
            const updatedPlaylist = this.playlistsData.find(p => p.id === playlistId);
            if (updatedPlaylist?.videos?.length > 0) {
                let addedCount = 0;
                updatedPlaylist.videos.forEach(video => {
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
                        this.core?.addVideoToQueue(videoData);
                        addedCount++;
                    }
                });
                
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
                this.core?.showMessage('La playlist está vacía', 'warning');
            }
        });

        // Event listener para eliminar playlist
        const deleteBtn = card.querySelector('.delete-playlist-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playlistId = e.target.dataset.playlistId;
                this.deletePlaylist(playlistId);
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
        if (!playlist) return;
        
        if (confirm(`¿Eliminar la playlist "${playlist.name}"?`)) {
            // Eliminar de playlistsData
            this.playlistsData = this.playlistsData.filter(p => p.id !== playlistId);
            
            // Actualizar también en el core si existe
            if (this.core && this.core.playlistsData) {
                this.core.playlistsData = this.playlistsData;
            }
            
            this.updatePlaylistsUI();
            this.core?.showMessage(`Playlist "${playlist.name}" eliminada`, 'success');
            
            // Actualizar cola si es necesario
            const flatList = this.core?.getFlattenedPlaylist();
            if (flatList?.length === 0) {
                this.core?.handleEmptyPlaylist();
            } else {
                this.core?.updateCurrentPlayingIndex();
            }
        }
    }

    /**
     * Crear popup de playlist con detalles
     */
    async createPlaylistPopup(playlist) {
        // Si es una playlist de YouTube Library y no está cargada, cargarla primero
        if (playlist.source === YOUTUBE_LIBRARY_SOURCE_ID && !playlist.isLoaded && playlist.videos.length === 0) {
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

        return playlist.videos.map((video, index) => `
            <div class="playlist-video-item" data-index="${index}">
                <div class="video-number">${index + 1}</div>
                <img src="${video.thumbnail}" alt="${video.title}" class="video-thumb">
                <div class="video-info">
                    <div class="video-title" title="${video.title}">${video.title}</div>
                    <div class="video-meta">
                        <span class="video-duration">${this.core?.formatDuration(video.duration) || '--:--'}</span>
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
        `).join('');
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
            queueHTML += `
                <div class="queue-item ${isPlaying ? 'playing' : ''}" 
                     data-video-id="${video.videoId}" 
                     data-flat-index="${index}">
                    <div class="queue-item-number">${index + 1}</div>
                    <img src="${video.thumbnail}" alt="${video.title}" class="queue-item-thumbnail">
                    <div class="queue-item-info">
                        <div class="queue-item-title">${video.title}</div>
                        <div class="queue-item-duration">${this.core?.formatDuration(video.duration) || '--:--'}</div>
                    </div>
                    ${isPlaying ? '<i class="fas fa-volume-up queue-item-playing"></i>' : ''}
                    <button class="queue-item-remove" data-video-id="${video.videoId}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        
        queueHTML += '</div>';
        queueContainer.innerHTML = queueHTML;
        
        // Event listeners
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
                const videoId = btn.dataset.videoId;
                this.core?.removeVideoFromQueue(videoId);
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
        if (!youtubePlaylists?.length) {
            this.core?.showMessage("No se encontraron playlists en tu biblioteca", 'warning');
            return;
        }

        const formattedPlaylists = youtubePlaylists.map(playlist => {
            if (!playlist.snippet?.title || playlist.contentDetails?.itemCount === 0) {
                return null;
            }
            return {
                id: playlist.id,
                name: playlist.snippet.title,
                thumbnailUrl: playlist.snippet.thumbnails.high?.url || 
                            playlist.snippet.thumbnails.default?.url || './electronic.ico',
                videos: [],
                isExpanded: false,
                source: YOUTUBE_LIBRARY_SOURCE_ID,
                isLoaded: false,
            };
        }).filter(p => p !== null);

        this.playlistsData.unshift(...formattedPlaylists);
        
        // Actualizar también en el core si existe
        if (this.core && this.core.playlistsData) {
            this.core.playlistsData = this.playlistsData;
        }
        
        this.core?.showMessage(`${formattedPlaylists.length} playlists de tu biblioteca añadidas`, 'success');
        this.updatePlaylistsUI();
    }

    /**
     * Limpiar playlists de YouTube Library
     */
    clearYouTubeLibraryPlaylists() {
        const initialCount = this.playlistsData.length;
        this.playlistsData = this.playlistsData.filter(p => p.source !== YOUTUBE_LIBRARY_SOURCE_ID);
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
                title: video.title || "Título Desconocido",
                thumbnail: video.thumbnail || './electronic.ico',
                duration: duration,
                uploaderName: video.uploaderName || this.extractArtistFromTitle(video.title),
                author: video.uploaderName || this.extractArtistFromTitle(video.title),
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
     * Extraer artista del título
     */
    extractArtistFromTitle(title) {
        if (!title) return 'Artista Desconocido';
        
        const patterns = [
            /^([^-]+)\s*-\s*(.+)$/,
            /^([^:]+)\s*:\s*(.+)$/,
            /^([^|]+)\s*\|\s*(.+)$/
        ];
        
        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        
        return 'YT CrossMix';
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
