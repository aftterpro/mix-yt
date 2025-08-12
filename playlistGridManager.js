// Gestor del Grid de Playlists
export class PlaylistGridManager {
    static renderPlaylistsGrid() {
        const playlistsGrid = document.getElementById('playlistsGrid');
        if (!playlistsGrid) return;

        const youtubePlaylists = PlaylistState.playlistsData.filter(p => 
            p.source === CONFIG.YOUTUBE_LIBRARY_SOURCE_ID
        );

        if (youtubePlaylists.length === 0) {
            playlistsGrid.innerHTML = `
                <div class="no-playlists-message">
                    <i class="fas fa-music"></i>
                    <p>No hay playlists de YouTube cargadas</p>
                    <p>Inicia sesión para ver tus playlists</p>
                </div>
            `;
            return;
        }

        playlistsGrid.innerHTML = youtubePlaylists.map(playlist => `
            <div class="playlist-card" data-playlist-id="${playlist.id}">
                <div class="playlist-card-thumbnail">
                    <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" loading="lazy">
                </div>
                <div class="playlist-card-info">
                    <h3 class="playlist-card-title">${playlist.name}</h3>
                    <p class="playlist-card-meta">${playlist.videoCount || playlist.videos.length} videos</p>
                    <div class="playlist-card-actions">
                        <button class="playlist-add-all-btn" data-playlist-id="${playlist.id}">
                            <i class="fas fa-plus"></i>
                            Añadir Todo
                        </button>
                        <button class="playlist-more-btn" data-playlist-id="${playlist.id}">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Añadir event listeners
        PlaylistGridManager.setupEventListeners();
    }

    static setupEventListeners() {
        const playlistsGrid = document.getElementById('playlistsGrid');
        if (!playlistsGrid) return;

        // Click en playlist card (mostrar detalle)
        playlistsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.playlist-card');
            if (!card || e.target.closest('button')) return;

            const playlistId = card.dataset.playlistId;
            PlaylistGridManager.showPlaylistDetail(playlistId);
        });

        // Botón "Añadir Todo"
        playlistsGrid.addEventListener('click', (e) => {
            if (e.target.closest('.playlist-add-all-btn')) {
                e.stopPropagation();
                const playlistId = e.target.closest('.playlist-add-all-btn').dataset.playlistId;
                PlaylistGridManager.addAllToQueue(playlistId);
            }
        });
    }

    static async showPlaylistDetail(playlistId) {
        // Cargar videos si no están cargados
        const playlist = PlaylistState.playlistsData.find(p => p.id === playlistId);
        if (!playlist.isLoaded) {
            await PlaylistManager.togglePlaylistExpansion(playlistId);
        }

        // Mostrar modal con detalle de playlist
        // TODO: Implementar modal de detalle
        console.log('Mostrar detalle de playlist:', playlistId);
    }

    static addAllToQueue(playlistId) {
        const playlist = PlaylistState.playlistsData.find(p => p.id === playlistId);
        if (!playlist || playlist.videos.length === 0) {
            mostrarMensajeFlotante('Esta playlist está vacía');
            return;
        }

        // Añadir todos los videos a la cola
        playlist.videos.forEach(video => {
            UIManager.handlePlayNextActionFromSearch(video.videoId, video);
        });

        mostrarMensajeFlotante(`${playlist.videos.length} videos de "${playlist.name}" añadidos a la cola`);
    }
   static async showPlaylistDetail(playlistId) {
    const playlist = PlaylistState.playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    // Cargar videos si no están cargados
    if (!playlist.isLoaded) {
        mostrarMensajeFlotante(`Cargando "${playlist.name}"...`);
        await PlaylistManager.togglePlaylistExpansion(playlistId);
    }

    // Crear modal
    const modal = document.createElement('div');
    modal.className = 'playlist-detail-modal';
    modal.innerHTML = `
        <div class="playlist-detail-modal-content">
            <div class="playlist-detail-header">
                <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" class="playlist-detail-cover">
                <div class="playlist-detail-info">
                    <h2 class="playlist-detail-title">${playlist.name}</h2>
                    <p class="playlist-detail-meta">
                        ${playlist.videos.length} videos • 
                        ${PlaylistGridManager.calculateTotalDuration(playlist.videos)}
                    </p>
                    <div class="playlist-detail-actions">
                        <button class="btn btn-primary" id="playAllBtn">
                            <i class="fas fa-play"></i>
                            Reproducir Todo
                        </button>
                        <button class="btn btn-secondary" id="addAllToQueueBtn">
                            <i class="fas fa-plus"></i>
                            Añadir Todo a Cola
                        </button>
                    </div>
                </div>
                <button class="playlist-detail-close">&times;</button>
            </div>
            <div class="playlist-detail-videos" id="playlistDetailVideos">
                ${PlaylistGridManager.renderPlaylistVideos(playlist.videos)}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners del modal
    PlaylistGridManager.setupDetailModalListeners(modal, playlist);
}

static calculateTotalDuration(videos) {
    const totalSeconds = videos.reduce((total, video) => total + (video.duration || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

static renderPlaylistVideos(videos) {
    if (videos.length === 0) {
        return '<p class="no-videos">Esta playlist está vacía</p>';
    }

    return videos.map((video, index) => `
        <div class="playlist-video-item" data-video-id="${video.videoId}">
            <span class="video-index">${index + 1}</span>
            <img src="${video.thumbnail}" alt="${video.title}" class="video-thumbnail">
            <div class="video-info">
                <h4 class="video-title">${video.title}</h4>
                <p class="video-duration">${Utils.formatDuration(video.duration)}</p>
            </div>
            <div class="video-actions">
                <button class="video-action-btn" data-action="menu" data-video-id="${video.videoId}">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        </div>
    `).join('');
}

static setupDetailModalListeners(modal, playlist) {
    // Cerrar modal
    modal.querySelector('.playlist-detail-close').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Botón "Reproducir Todo"
    modal.querySelector('#playAllBtn').addEventListener('click', () => {
        PlaylistGridManager.playAllFromPlaylist(playlist);
        modal.remove();
    });

    // Botón "Añadir Todo a Cola"
    modal.querySelector('#addAllToQueueBtn').addEventListener('click', () => {
        PlaylistGridManager.addAllToQueue(playlist.id);
        modal.remove();
    });

    // Menús de 3 puntos de videos
    modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="menu"]')) {
            const videoId = e.target.closest('[data-action="menu"]').dataset.videoId;
            const video = playlist.videos.find(v => v.videoId === videoId);
            PlaylistGridManager.showVideoContextMenu(e.target.closest('[data-action="menu"]'), video);
        }
    });

    // Click en video (reproducir después)
    modal.addEventListener('click', (e) => {
        const videoItem = e.target.closest('.playlist-video-item');
        if (videoItem && !e.target.closest('button')) {
            const videoId = videoItem.dataset.videoId;
            const video = playlist.videos.find(v => v.videoId === videoId);
            UIManager.handlePlayNextActionFromSearch(videoId, video);
            
            // Feedback visual
            videoItem.style.background = 'var(--active-bg)';
            setTimeout(() => {
                videoItem.style.background = '';
            }, 1000);
        }
    });
}

static showVideoContextMenu(button, video) {
    // Remover menús existentes
    document.querySelectorAll('.video-context-menu').forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'video-context-menu';
    menu.innerHTML = `
        <button class="context-menu-item" data-action="play-next">
            <i class="fas fa-arrow-right-to-line"></i>
            Reproducir Después
        </button>
        <button class="context-menu-item" data-action="add-to-queue">
            <i class="fas fa-plus"></i>
            Añadir a Cola
        </button>
    `;

    document.body.appendChild(menu);

    // Posicionar menú
    const rect = button.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.zIndex = '10001';

    // Event listeners del menú
    menu.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        
        if (action === 'play-next') {
            UIManager.handlePlayNextActionFromSearch(video.videoId, video);
        } else if (action === 'add-to-queue') {
            UIManager.handlePlayNextActionFromSearch(video.videoId, video);
        }
        
        menu.remove();
    });

    // Cerrar menú al hacer click fuera
    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 100);
}

static playAllFromPlaylist(playlist) {
    if (playlist.videos.length === 0) {
        mostrarMensajeFlotante('Esta playlist está vacía');
        return;
    }

    // Limpiar cola actual y añadir todos los videos
    const queuePlaylist = PlaylistState.playlistsData.find(p => p.id === 'queue') || {
        id: 'queue',
        name: 'Cola de Reproducción',
        thumbnailUrl: 'https://via.placeholder.com/50?text=▶',
        videos: [],
        isExpanded: true
    };

    if (!PlaylistState.playlistsData.includes(queuePlaylist)) {
        PlaylistState.playlistsData.unshift(queuePlaylist);
    }

    queuePlaylist.videos = [...playlist.videos];
    
    // Iniciar reproducción
    if (window.PlaybackController) {
        PlaybackController.playFirstVideo();
    }

    UIManager.updatePlaylistsUI();
    mostrarMensajeFlotante(`Reproduciendo "${playlist.name}" (${playlist.videos.length} videos)`);
  } 
}
