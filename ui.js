// Manejo de Interface de Usuario - CONSOLIDADO Y CORREGIDO
import { PlaylistState, CONFIG } from './config.js';
import { PlaylistManager } from './playlistManager.js';
import { Utils } from './utils.js';

// ===== FUNCIONES DE LOADING =====

/**
 * Mostrar spinner de carga global
 */
export function showLoadingSpinner() {
    let spinner = document.getElementById('loadingSpinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loadingSpinner';
        spinner.className = 'loading-spinner';
        spinner.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(spinner);
    }
    spinner.classList.remove('hidden');
}

/**
 * Ocultar spinner de carga global
 */
export function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.add('hidden');
    }
}

/**
 * Mostrar spinner pequeño en un contenedor específico
 */
export function showLoadMoreSpinner(container) {
    let spinner = container.querySelector('#loadMoreSpinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loadMoreSpinner';
        spinner.className = 'loading-spinner-small';
        spinner.innerHTML = '<div class="spinner"></div>';
        container.appendChild(spinner);
    }
    spinner.classList.remove('hidden');
}

/**
 * Ocultar spinner pequeño
 */
export function hideLoadMoreSpinner(container) {
    const spinner = container ? 
        container.querySelector('#loadMoreSpinner') : 
        document.getElementById('loadMoreSpinner');
    if (spinner) {
        spinner.classList.add('hidden');
    }
}

// ===== MENSAJES FLOTANTES =====

/**
 * Función para mostrar mensajes flotantes - MEJORADA
 */
export function mostrarMensajeFlotante(mensaje) {
    const mensajeDiv = document.createElement('div');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = 'floating-message';
    
    // Buscar contenedor apropiado
    let container = document.getElementById('floatingMessageContainer') || 
                   document.querySelector('.mobile-main') || 
                   document.body;
    
    container.appendChild(mensajeDiv);

    // Estilos optimizados para mobile
    Object.assign(mensajeDiv.style, {
        position: 'fixed',
        bottom: 'calc(64px + 64px + 20px + env(safe-area-inset-bottom))', // bottom-nav + mini-player + margin
        left: '50%',
        transform: 'translateX(-50%) translateY(100px) scale(0.8)',
        zIndex: '10000',
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(26, 26, 26, 0.9))',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: '500',
        maxWidth: 'calc(100vw - 32px)',
        wordWrap: 'break-word',
        textAlign: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.15)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        opacity: '0',
        transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        willChange: 'transform, opacity'
    });

    // Animación de entrada
    requestAnimationFrame(() => {
        Object.assign(mensajeDiv.style, {
            transform: 'translateX(-50%) translateY(0) scale(1)',
            opacity: '1'
        });
    });

    // Animación de salida
    setTimeout(() => {
        Object.assign(mensajeDiv.style, {
            transform: 'translateX(-50%) translateY(-20px) scale(0.9)',
            opacity: '0'
        });
        setTimeout(() => {
            if (mensajeDiv.parentNode) {
                mensajeDiv.remove();
            }
        }, 400);
    }, 4000);
}

// ===== GESTOR PRINCIPAL DE UI =====

export class UIManager {
    
    // ===== ACTUALIZACIÓN DE PLAYLISTS =====
    
    /**
     * Actualizar UI de playlists completa - CORREGIDO
     */
    static updatePlaylistsUI() {
        console.log('🔄 Actualizando UI de playlists...');
        
        // Determinar contenedor según la vista activa
        const currentView = window.integration?.currentView || window.currentView || 'home';
        let playlistContainer;
        
        if (currentView === 'library') {
            playlistContainer = document.getElementById('playlistsGrid');
        } else if (currentView === 'playing') {
            playlistContainer = document.getElementById('playlistContainer');
        } else {
            // Fallback: buscar cualquier contenedor disponible
            playlistContainer = document.getElementById('playlistContainer') || 
                              document.getElementById('playlistsGrid');
        }
        
        if (!playlistContainer) {
            console.warn('No se encontró contenedor de playlists para la vista:', currentView);
            return;
        }
        
        const currentScrollTop = playlistContainer.scrollTop;
        playlistContainer.innerHTML = '';
        const playingVideoId = PlaylistState.currentPlayingInfo.videoId;

        if (PlaylistState.playlistsData.length === 0) {
            UIManager.renderEmptyState(playlistContainer);
            return;
        }

        if (currentView === 'library') {
            UIManager.renderPlaylistCards(playlistContainer);
        } else {
            UIManager.renderPlaylistList(playlistContainer, playingVideoId);
        }
        
        playlistContainer.scrollTop = currentScrollTop;
        UIManager.enableDragAndDrop();
        
        console.log('✅ UI de playlists actualizada');
    }
    
    /**
     * Renderizar estado vacío
     */
    static renderEmptyState(container) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-music"></i>
                <p>No hay playlists</p>
                <p>Ve a Biblioteca para añadir música</p>
            </div>
        `;
    }

    /**
     * Renderizar cards para library view
     */
    static renderPlaylistCards(container) {
        const grid = document.createElement('div');
        grid.className = 'playlists-grid-mobile';
        
        PlaylistState.playlistsData.forEach(playlist => {
            const card = UIManager.createPlaylistCard(playlist);
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
    }

    /**
     * Renderizar lista para otras vistas
     */
    static renderPlaylistList(container, playingVideoId) {
        PlaylistState.playlistsData.forEach((playlist) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = `playlist-group-mobile ${playlist.isExpanded ? 'expanded' : ''}`;
            groupDiv.dataset.playlistId = playlist.id;

            // Header más compacto para mobile
            const headerDiv = document.createElement('div');
            headerDiv.className = 'playlist-group-header-mobile';
            headerDiv.innerHTML = `
                <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" 
                     class="playlist-group-thumb-mobile" loading="lazy" 
                     onerror="this.src='https://via.placeholder.com/40x40?text=♪'">
                <div class="playlist-info-mobile">
                    <span class="playlist-name-mobile">${Utils.escapeHtml(playlist.name)}</span>
                    <span class="playlist-count-mobile">${playlist.videos.length} videos</span>
                </div>
                <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} expand-icon-mobile"></i>
            `;
            headerDiv.addEventListener('click', () => UIManager.togglePlaylistExpansion(playlist.id));
            groupDiv.appendChild(headerDiv);

            // Videos container
            const videosDiv = document.createElement('div');
            videosDiv.className = 'playlist-group-videos-mobile';
            
            if (playlist.isExpanded) {
                playlist.videos.forEach((video) => {
                    const item = UIManager.createMobilePlaylistItem(video, playlist.id, playingVideoId);
                    videosDiv.appendChild(item);
                });
            }

            groupDiv.appendChild(videosDiv);
            container.appendChild(groupDiv);
        });
    }
    
    // ===== CREACIÓN DE ELEMENTOS =====
    
    /**
     * Crear card de playlist para library
     */
    static createPlaylistCard(playlist) {
        const card = document.createElement('div');
        card.className = 'playlist-card-mobile';
        card.dataset.playlistId = playlist.id;
        
        card.innerHTML = `
            <div class="playlist-card-image">
                <img src="${playlist.thumbnailUrl}" alt="${Utils.escapeHtml(playlist.name)}" 
                     loading="lazy" onerror="this.src='https://via.placeholder.com/180x180?text=♪'">
                <div class="playlist-card-overlay">
                    <button class="playlist-play-btn" title="Reproducir playlist">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="playlist-card-info">
                <h3 class="playlist-card-title" title="${Utils.escapeHtml(playlist.name)}">${Utils.escapeHtml(playlist.name)}</h3>
                <p class="playlist-card-meta">${playlist.videos.length} videos</p>
            </div>
        `;
        
        // Event listeners
        card.addEventListener('click', (e) => {
            // Evitar doble trigger si se hace click en el botón play
            if (e.target.closest('.playlist-play-btn')) return;
            
            UIManager.handlePlaylistCardClick(playlist);
        });
        
        const playBtn = card.querySelector('.playlist-play-btn');
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            UIManager.playEntirePlaylist(playlist);
        });
        
        return card;
    }
    
    /**
     * Crear item de playlist para mobile
     */
    static createMobilePlaylistItem(video, playlistId, playingVideoId) {
        const item = document.createElement('div');
        item.className = 'playlist-item-mobile';
        item.draggable = false; // Desactivar drag en mobile por ahora
        item.dataset.videoId = video.videoId;
        item.dataset.playlistId = playlistId;
        
        if (video.videoId === playingVideoId) {
            item.classList.add('playing');
        }
        
        item.innerHTML = `
            <img src="${video.thumbnail}" alt="${Utils.escapeHtml(video.title)}" 
                 class="playlist-item-thumb-mobile" loading="lazy"
                 onerror="this.src='https://via.placeholder.com/48x36?text=♪'">
            <div class="playlist-item-info-mobile">
                <h4 class="playlist-item-title-mobile" title="${Utils.escapeHtml(video.title)}">${Utils.escapeHtml(video.title)}</h4>
                <p class="playlist-item-duration-mobile">${Utils.formatDuration(video.duration)}</p>
            </div>
            <button class="playlist-item-menu-mobile" title="Opciones">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            ${video.videoId === playingVideoId ? '<i class="fas fa-volume-up playing-icon-mobile"></i>' : ''}
        `;
        
        // Context menu para mobile
        const menuBtn = item.querySelector('.playlist-item-menu-mobile');
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            UIManager.showMobileContextMenu(e.target, video, playlistId);
        });
        
        // Click en el item (reproducir)
        item.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            UIManager.handleVideoItemClick(video, playlistId);
        });
        
        return item;
    }
    
    // ===== MANEJADORES DE EVENTOS =====
    
    /**
     * Manejar click en card de playlist
     */
    static handlePlaylistCardClick(playlist) {
        if (playlist.videos.length > 0) {
            UIManager.showMobilePlaylistDetail(playlist);
        } else {
            UIManager.togglePlaylistExpansion(playlist.id);
        }
    }
    
    /**
     * Manejar click en item de video
     */
    static handleVideoItemClick(video, playlistId) {
        console.log('🎵 Click en video:', video.title);
        
        // Si hay un PlaybackController, usarlo para reproducir este video específico
        if (window.PlaybackController) {
            // Aquí podrías implementar lógica para saltar a un video específico
            // Por ahora, añadimos como "reproducir después"
            UIManager.handlePlayNextActionFromSearch(video.videoId, video);
        }
        
        mostrarMensajeFlotante(`♪ "${video.title}" añadido a reproducir`);
    }
    
    /**
     * Toggle expansión de playlist
     */
    static async togglePlaylistExpansion(playlistId) {
        if (PlaylistManager && typeof PlaylistManager.togglePlaylistExpansion === 'function') {
            await PlaylistManager.togglePlaylistExpansion(playlistId);
        } else {
            // Fallback básico
            const playlist = PlaylistState.playlistsData.find(p => p.id === playlistId);
            if (playlist) {
                playlist.isExpanded = !playlist.isExpanded;
                UIManager.updatePlaylistsUI();
            }
        }
    }
    
    // ===== CONTEXT MENUS MOBILE =====
    
    /**
     * Mostrar menú contextual móvil
     */
    static showMobileContextMenu(trigger, video, playlistId) {
        UIManager.closeAllContextMenus();
        
        // Crear bottom sheet modal para mobile
        const modal = document.createElement('div');
        modal.className = 'mobile-context-modal';
        modal.innerHTML = `
            <div class="mobile-context-backdrop"></div>
            <div class="mobile-context-sheet">
                <div class="mobile-context-header">
                    <img src="${video.thumbnail}" alt="${Utils.escapeHtml(video.title)}" class="context-video-thumb"
                         onerror="this.src='https://via.placeholder.com/56x42?text=♪'">
                    <div class="context-video-info">
                        <h4>${Utils.escapeHtml(video.title)}</h4>
                        <p>${Utils.formatDuration(video.duration)}</p>
                    </div>
                </div>
                <div class="mobile-context-actions">
                    <button class="mobile-context-action" data-action="play-next">
                        <i class="fas fa-arrow-right-to-line"></i>
                        Reproducir Después
                    </button>
                    <button class="mobile-context-action" data-action="move">
                        <i class="fas fa-folder-tree"></i>
                        Mover a Playlist
                    </button>
                    <button class="mobile-context-action danger" data-action="delete">
                        <i class="fas fa-trash"></i>
                        Eliminar
                    </button>
                </div>
                <button class="mobile-context-close">Cancelar</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Animación de entrada
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        
        // Event listeners
        modal.querySelector('.mobile-context-backdrop').addEventListener('click', () => {
            UIManager.closeMobileContextMenu(modal);
        });
        
        modal.querySelector('.mobile-context-close').addEventListener('click', () => {
            UIManager.closeMobileContextMenu(modal);
        });
        
        // Action buttons
        modal.querySelectorAll('.mobile-context-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                UIManager.handleMobileContextAction(action, video, playlistId);
                UIManager.closeMobileContextMenu(modal);
            });
        });
    }
    
    /**
     * Cerrar menú contextual móvil
     */
    static closeMobileContextMenu(modal) {
        modal.classList.remove('show');
        modal.classList.add('hide');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 300);
    }
    
    /**
     * Manejar acción del menú contextual móvil
     */
    static handleMobileContextAction(action, video, playlistId) {
        switch (action) {
            case 'play-next':
                UIManager.handlePlayNextActionFromSearch(video.videoId, video);
                break;
            case 'move':
                UIManager.showMobilePlaylistSelector(video, playlistId);
                break;
            case 'delete':
                UIManager.deleteVideoFromPlaylist(video, playlistId);
                break;
            default:
                console.warn('Acción no reconocida:', action);
        }
    }
    
    /**
     * Eliminar video de playlist
     */
    static deleteVideoFromPlaylist(video, playlistId) {
        if (PlaylistManager && typeof PlaylistManager.deleteVideo === 'function') {
            PlaylistManager.deleteVideo(playlistId, video.videoId);
            mostrarMensajeFlotante('Video eliminado');
        } else {
            console.warn('PlaylistManager.deleteVideo no disponible');
        }
    }
    
    /**
     * Mostrar selector de playlist móvil
     */
    static showMobilePlaylistSelector(video, sourcePlaylistId) {
        // TODO: Implementar selector de playlists para mobile
        mostrarMensajeFlotante('Selector de playlists próximamente...');
    }
    
    // ===== ACCIONES DE REPRODUCCIÓN =====
    
    /**
     * Mostrar detalle de playlist móvil
     */
    static showMobilePlaylistDetail(playlist) {
        // Cambiar a playing view y mostrar la playlist
        if (window.integration && typeof window.integration.switchView === 'function') {
            window.integration.switchView('playing');
        } else if (typeof switchView === 'function') {
            switchView('playing');
        }
        
        // Trigger update para mostrar videos de esta playlist
        setTimeout(() => {
            UIManager.updatePlaylistsUI();
        }, 100);
    }
    
    /**
     * Reproducir playlist completa
     */
    static playEntirePlaylist(playlist) {
        if (playlist.videos.length === 0) {
            mostrarMensajeFlotante('Esta playlist está vacía');
            return;
        }
        
        // Comenzar reproducción desde el primer video
        if (window.PlaybackController && typeof window.PlaybackController.playFirstVideo === 'function') {
            PlaybackController.playFirstVideo();
        }
        
        mostrarMensajeFlotante(`Reproduciendo "${playlist.name}"`);
        
        // Cambiar a vista playing
        if (window.integration && typeof window.integration.switchView === 'function') {
            window.integration.switchView('playing');
        } else if (typeof switchView === 'function') {
            switchView('playing');
        }
    }
    
    /**
     * Manejar acción "Reproducir Después" desde búsqueda - MEJORADO
     */
    static handlePlayNextActionFromSearch(videoId, videoData) {
        console.log('🎵 Añadiendo para reproducir después:', videoData.title);
        
        // Si no hay video reproduciéndose, añadir al principio
        if (PlaylistState.currentPlayingInfo.flattenedIndex < 0) {
            // Crear playlist temporal si no existe
            let queuePlaylist = PlaylistState.playlistsData.find(p => p.id === 'queue');
            if (!queuePlaylist) {
                queuePlaylist = {
                    id: 'queue',
                    name: 'Cola de Reproducción',
                    thumbnailUrl: 'https://via.placeholder.com/50?text=▶',
                    videos: [],
                    isExpanded: true
                };
                PlaylistState.playlistsData.unshift(queuePlaylist);
            }
            
            const videoObject = {
                videoId: videoData.videoId,
                title: videoData.title,
                thumbnail: videoData.thumbnail,
                duration: videoData.duration || 0
            };
            
            queuePlaylist.videos.push(videoObject);
            console.log(`Video ${videoId} añadido a cola (no hay reproducción activa)`);
        } else {
            // Añadir después del video actual
            const targetFlatIndex = PlaylistState.currentPlayingInfo.flattenedIndex + 1;
            UIManager.insertVideoAtFlatIndex(videoData, targetFlatIndex);
            console.log(`Video ${videoId} añadido para reproducir después del actual`);
        }
        
        // Feedback optimizado para mobile
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            // Mostrar mini toast en mobile
            mostrarMensajeFlotante(`♪ "${videoData.title}" añadido`);
            
            // Vibración si está disponible
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        } else {
            mostrarMensajeFlotante(`"${videoData.title}" añadido para reproducir después`);
        }
        
        UIManager.updatePlaylistsUI();
    }
    
    /**
     * Insertar video en índice específico de la lista aplanada
     */
    static insertVideoAtFlatIndex(videoData, targetFlatIndex) {
        if (!PlaylistManager || typeof PlaylistManager.getFlattenedPlaylist !== 'function') {
            console.warn('PlaylistManager no disponible para insertVideoAtFlatIndex');
            return;
        }
        
        const flatList = PlaylistManager.getFlattenedPlaylist();
        targetFlatIndex = Math.max(0, Math.min(targetFlatIndex, flatList.length));

        let cumulativeIndex = 0;
        let targetLocalIndex = -1;
        let targetPlaylistId = null;

        for (const p of PlaylistState.playlistsData) {
            const playlistVideoCount = p.videos.length;
            const endOfPlaylistIndex = cumulativeIndex + playlistVideoCount;

            if (targetFlatIndex <= endOfPlaylistIndex) {
                targetPlaylistId = p.id;
                targetLocalIndex = targetFlatIndex - cumulativeIndex;
                break;
            }
            cumulativeIndex += playlistVideoCount;
        }

        if (targetPlaylistId && targetLocalIndex >= 0) {
            const targetPlaylist = PlaylistState.playlistsData.find(p => p.id === targetPlaylistId);
            const videoObject = {
                videoId: videoData.videoId,
                title: videoData.title,
                thumbnail: videoData.thumbnail,
                duration: videoData.duration || 0
            };
            
            targetPlaylist.videos.splice(targetLocalIndex, 0, videoObject);
        }
    }
    
    // ===== DRAG AND DROP =====
    
    /**
     * Habilitar drag and drop - SIMPLIFICADO
     */
    static enableDragAndDrop(scopeElement = document) {
        const isMobile = 'ontouchstart' in window;

        if (isMobile) {
            // En mobile, usar context menus en lugar de drag
            console.log('🤚 Drag and drop deshabilitado en mobile, usando context menus');
            return;
        }

        // TODO: Implementar drag and drop para desktop
        console.log('🖱️ Drag and drop para desktop pendiente de implementación');
    }
    
    // ===== UTILIDADES =====
    
    /**
     * Cerrar todos los menús contextuales
     */
    static closeAllContextMenus() {
        // Cerrar menús desktop existentes
        document.querySelectorAll('#playlistContainer .delete-menu-content').forEach(menu => {
            menu.style.display = 'none';
        });
        
        // Cerrar modales mobile
        document.querySelectorAll('.mobile-context-modal').forEach(modal => {
            UIManager.closeMobileContextMenu(modal);
        });
        
        // Cerrar playlist selectors
        document.querySelectorAll('.mobile-playlist-selector').forEach(selector => {
            selector.remove();
        });
    }
    
    /**
     * Actualizar UI de una sola playlist - SIMPLIFICADO
     */
    static updateSinglePlaylistUI(playlistId) {
        // Por simplicidad, actualizar toda la UI
        // TODO: Optimizar para actualizar solo una playlist
        UIManager.updatePlaylistsUI();
    }
}
