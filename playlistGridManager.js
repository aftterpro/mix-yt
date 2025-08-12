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
}
