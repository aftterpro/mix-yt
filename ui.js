// Manejo de Interface de Usuario - CONSOLIDADO Y CORREGIDO
import { PlaylistManager } from './playlistManager.js';
// Importar dependencias necesarias
import { PlaylistState, CONFIG } from './config.js';
import { Utils } from './utils.js';

// ===== FUNCIONES DE LOADING MEJORADAS =====

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
    spinner.style.display = 'flex';
    console.log('✨ Loading spinner mostrado');
}

export function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.add('hidden');
        setTimeout(() => {
            spinner.style.display = 'none';
        }, 300);
    }
    console.log('✨ Loading spinner ocultado');
}

export function showLoadMoreSpinner(container) {
    if (!container) {
        console.warn('⚠️ Container no proporcionado para load more spinner');
        return;
    }
    
    let spinner = container.querySelector('#loadMoreSpinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loadMoreSpinner';
        spinner.className = 'loading-spinner-small';
        spinner.innerHTML = '<div class="spinner"></div>';
        container.appendChild(spinner);
    }
    spinner.classList.remove('hidden');
    spinner.style.display = 'flex';
}

export function hideLoadMoreSpinner(container) {
    const spinner = container ? 
        container.querySelector('#loadMoreSpinner') : 
        document.getElementById('loadMoreSpinner');
    
    if (spinner) {
        spinner.classList.add('hidden');
        setTimeout(() => {
            spinner.style.display = 'none';
        }, 300);
    }
}

// ===== MENSAJES FLOTANTES MEJORADOS =====

export function mostrarMensajeFlotante(mensaje, duracion = 4000, tipo = 'info') {
    if (!mensaje) {
        console.warn('⚠️ Mensaje vacío enviado a mostrarMensajeFlotante');
        return;
    }
    
    console.log('💬 Mensaje flotante:', mensaje);
    
    // Crear elemento del mensaje
    const mensajeDiv = document.createElement('div');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = 'floating-message';
    
    // Buscar contenedor apropiado o usar body
    const container = document.getElementById('floatingMessageContainer') || 
                     document.querySelector('.mobile-main') || 
                     document.body;
    
    container.appendChild(mensajeDiv);

    // Estilos optimizados según tipo
    const baseStyles = {
        position: 'fixed',
        bottom: 'calc(64px + 64px + 20px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%) translateY(100px) scale(0.8)',
        zIndex: '10001',
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
        willChange: 'transform, opacity',
        pointerEvents: 'none'
    };

    // Colores según tipo
    const typeColors = {
        info: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(26, 26, 26, 0.9))',
        success: 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9))',
        error: 'linear-gradient(135deg, rgba(244, 67, 54, 0.9), rgba(211, 47, 47, 0.9))',
        warning: 'linear-gradient(135deg, rgba(255, 193, 7, 0.9), rgba(245, 124, 0, 0.9))'
    };

    Object.assign(mensajeDiv.style, {
        ...baseStyles,
        background: typeColors[tipo] || typeColors.info
    });

    // Animación de entrada
    requestAnimationFrame(() => {
        Object.assign(mensajeDiv.style, {
            transform: 'translateX(-50%) translateY(0) scale(1)',
            opacity: '1'
        });
    });

    // Auto-remove con animación de salida
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
    }, duracion);

    // Permitir click para cerrar antes
    mensajeDiv.addEventListener('click', () => {
        mensajeDiv.style.opacity = '0';
        setTimeout(() => {
            if (mensajeDiv.parentNode) {
                mensajeDiv.remove();
            }
        }, 200);
    });
}

// ===== UI MANAGER PRINCIPAL MEJORADO =====

export class UIManager {
    
    // ===== ACTUALIZACIÓN DE PLAYLISTS MEJORADA =====
    
    static updatePlaylistsUI() {
        console.log('🔄 UIManager: Actualizando UI de playlists...');
        
        try {
            // Determinar contenedor según vista activa
            const currentView = window.integration?.currentView || 
                               UIManager.getCurrentView() || 
                               'home';
            
            let playlistContainer = UIManager.getPlaylistContainer(currentView);
            
            if (!playlistContainer) {
                console.warn('⚠️ No se encontró contenedor de playlists para vista:', currentView);
                return;
            }
            
            // Preservar scroll position
            const currentScrollTop = playlistContainer.scrollTop;
            
            // Obtener video actualmente reproduciéndose
            const playingVideoId = PlaylistState.currentPlayingInfo?.videoId || null;
            
            // Renderizar contenido según estado
            if (!PlaylistState.playlistsData || PlaylistState.playlistsData.length === 0) {
                UIManager.renderEmptyState(playlistContainer, currentView);
            } else {
                if (currentView === 'library') {
                    UIManager.renderPlaylistCards(playlistContainer);
                } else {
                    UIManager.renderPlaylistList(playlistContainer, playingVideoId);
                }
            }
            
            // Restaurar scroll position
            if (currentScrollTop > 0) {
                playlistContainer.scrollTop = currentScrollTop;
            }
            
            // Habilitar interactividad
            UIManager.enableInteractivity();
            
            console.log('✅ UI de playlists actualizada correctamente');
            
        } catch (error) {
            console.error('💥 Error actualizando UI de playlists:', error);
            mostrarMensajeFlotante('Error actualizando interfaz', 3000, 'error');
        }
    }
    
    // ===== HELPERS MEJORADOS =====
    
    static getCurrentView() {
        // Detectar vista activa
        const activeView = document.querySelector('.content-view.active');
        if (activeView) {
            const viewId = activeView.id;
            return viewId.replace('View', '');
        }
        
        // Fallback: revisar navegación activa
        const activeNavTab = document.querySelector('.nav-tab.active');
        if (activeNavTab) {
            return activeNavTab.dataset.view;
        }
        
        return 'home';
    }
    
    static getPlaylistContainer(view) {
        const containers = {
            library: '#playlistsGrid',
            playing: '#playlistContainer',
            home: '#playlistOverview'
        };
        
        let container = document.querySelector(containers[view]);
        
        // Fallback: buscar cualquier contenedor disponible
        if (!container) {
            container = document.querySelector('#playlistContainer') || 
                       document.querySelector('#playlistsGrid') ||
                       document.querySelector('.playlists-grid-mobile');
        }
        
        return container;
    }
    
    static renderEmptyState(container, view) {
        const emptyStates = {
            library: {
                icon: 'fas fa-music',
                title: 'No hay playlists',
                subtitle: 'Conecta tu cuenta de Google para ver tus playlists de YouTube',
                action: 'Conectar'
            },
            playing: {
                icon: 'fas fa-music',
                title: 'Cola de reproducción vacía',
                subtitle: 'Añade música desde la búsqueda o biblioteca',
                action: null
            },
            home: {
                icon: 'fas fa-headphones',
                title: 'Bienvenido a YT CrossMix',
                subtitle: 'Comienza añadiendo playlists desde la biblioteca',
                action: 'Explorar'
            }
        };
        
        const state = emptyStates[view] || emptyStates.home;
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="${state.icon}"></i>
                <p><strong>${state.title}</strong></p>
                <p>${state.subtitle}</p>
                ${state.action ? `<button class="empty-state-action" onclick="UIManager.handleEmptyStateAction('${view}')">${state.action}</button>` : ''}
            </div>
        `;
    }
    
    static handleEmptyStateAction(view) {
        switch (view) {
            case 'library':
                // Trigger auth
                const authBtn = document.getElementById('googleSignInButton') || 
                               document.getElementById('authToggleBtn');
                if (authBtn) authBtn.click();
                break;
            case 'home':
                // Switch to library
                if (window.integration && window.integration.switchView) {
                    window.integration.switchView('library');
                }
                break;
        }
    }
    
    // ===== RENDERIZADO DE CONTENIDO =====
    
    static renderPlaylistCards(container) {
        console.log('📱 Renderizando cards de playlists...');
        
        // Crear wrapper grid
        const grid = document.createElement('div');
        grid.className = 'playlists-grid-mobile';
        
        // Renderizar cada playlist como card
        PlaylistState.playlistsData.forEach((playlist, index) => {
            const card = UIManager.createPlaylistCard(playlist, index);
            grid.appendChild(card);
        });
        
        // Reemplazar contenido
        container.innerHTML = '';
        container.appendChild(grid);
    }
    
    static renderPlaylistList(container, playingVideoId) {
        console.log('📝 Renderizando lista de playlists...');
        
        container.innerHTML = '';
        
        PlaylistState.playlistsData.forEach((playlist) => {
            const groupDiv = UIManager.createPlaylistGroup(playlist, playingVideoId);
            container.appendChild(groupDiv);
        });
    }
    
    // ===== CREACIÓN DE ELEMENTOS MEJORADA =====
    
    static createPlaylistCard(playlist, index = 0) {
        const card = document.createElement('div');
        card.className = 'playlist-card-mobile';
        card.dataset.playlistId = playlist.id;
        card.style.animationDelay = `${index * 0.1}s`;
        
        // Determinar thumbnail seguro
        const thumbnail = playlist.thumbnailUrl || 
                         (playlist.videos[0]?.thumbnail) ||
                         'https://via.placeholder.com/180x180?text=♪';
        
        card.innerHTML = `
            <div class="playlist-card-image">
                <img src="${thumbnail}" 
                     alt="${Utils.escapeHtml(playlist.name)}" 
                     loading="lazy" 
                     onerror="this.src='https://via.placeholder.com/180x180?text=♪'">
                <div class="playlist-card-overlay">
                    <button class="playlist-play-btn" title="Reproducir playlist">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="playlist-card-info">
                <h3 class="playlist-card-title" title="${Utils.escapeHtml(playlist.name)}">
                    ${Utils.escapeHtml(playlist.name)}
                </h3>
                <p class="playlist-card-meta">
                    ${playlist.videos?.length || 0} videos
                    ${playlist.isLoaded === false ? ' • No cargada' : ''}
                </p>
                ${UIManager.createPlaylistCardActions(playlist)}
            </div>
        `;
        
        // Event listeners
        UIManager.setupPlaylistCardListeners(card, playlist);
        
        return card;
    }
    
    static createPlaylistCardActions(playlist) {
        if (playlist.videos?.length > 0) {
            return `
                <div class="playlist-card-actions">
                    <button class="playlist-add-all-btn" title="Añadir todos los videos">
                        <i class="fas fa-plus"></i>
                        Añadir Todo
                    </button>
                </div>
            `;
        }
        return '';
    }
    
    static setupPlaylistCardListeners(card, playlist) {
        // Click general en la card
        card.addEventListener('click', (e) => {
            if (e.target.closest('.playlist-play-btn, .playlist-add-all-btn')) return;
            UIManager.handlePlaylistCardClick(playlist);
        });
        
        // Botón play
        const playBtn = card.querySelector('.playlist-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                UIManager.playEntirePlaylist(playlist);
            });
        }
        
        // Botón añadir todo
        const addAllBtn = card.querySelector('.playlist-add-all-btn');
        if (addAllBtn) {
            addAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                UIManager.addAllToQueue(playlist);
            });
        }
        
        // Hover effects para mobile
        if ('ontouchstart' in window) {
            card.addEventListener('touchstart', () => {
                card.classList.add('touch-active');
            });
            
            card.addEventListener('touchend', () => {
                setTimeout(() => {
                    card.classList.remove('touch-active');
                }, 150);
            });
        }
    }
    
    static createPlaylistGroup(playlist, playingVideoId) {
        const groupDiv = document.createElement('div');
        groupDiv.className = `playlist-group-mobile ${playlist.isExpanded ? 'expanded' : ''}`;
        groupDiv.dataset.playlistId = playlist.id;

        // Header del grupo
        const headerDiv = document.createElement('div');
        headerDiv.className = 'playlist-group-header-mobile';
        
        const thumbnail = playlist.thumbnailUrl || 
                         'https://via.placeholder.com/40x40?text=♪';
        
        headerDiv.innerHTML = `
            <img src="${thumbnail}" 
                 alt="${Utils.escapeHtml(playlist.name)}" 
                 class="playlist-group-thumb-mobile" 
                 loading="lazy" 
                 onerror="this.src='https://via.placeholder.com/40x40?text=♪'">
            <div class="playlist-info-mobile">
                <span class="playlist-name-mobile">${Utils.escapeHtml(playlist.name)}</span>
                <span class="playlist-count-mobile">
                    ${playlist.videos?.length || 0} videos
                    ${playlist.isLoaded === false ? ' • Cargando...' : ''}
                </span>
            </div>
            <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} expand-icon-mobile"></i>
        `;
        
        // Event listener para toggle
        headerDiv.addEventListener('click', () => {
            UIManager.togglePlaylistExpansion(playlist.id);
        });
        
        groupDiv.appendChild(headerDiv);

        // Container de videos
        const videosDiv = document.createElement('div');
        videosDiv.className = 'playlist-group-videos-mobile';
        
        if (playlist.isExpanded && playlist.videos?.length > 0) {
            playlist.videos.forEach((video, index) => {
                const item = UIManager.createPlaylistItem(video, playlist.id, playingVideoId, index);
                videosDiv.appendChild(item);
            });
        } else if (playlist.isExpanded && playlist.videos?.length === 0) {
            videosDiv.innerHTML = `
                <div class="playlist-empty-state">
                    <p>Esta playlist está vacía</p>
                </div>
            `;
        }

        groupDiv.appendChild(videosDiv);
        return groupDiv;
    }
    
    static createPlaylistItem(video, playlistId, playingVideoId, index = 0) {
        const item = document.createElement('div');
        item.className = 'playlist-item-mobile';
        item.dataset.videoId = video.videoId;
        item.dataset.playlistId = playlistId;
        item.style.animationDelay = `${index * 0.05}s`;
        
        // Marcar como playing si corresponde
        if (video.videoId === playingVideoId) {
            item.classList.add('playing');
        }
        
        const thumbnail = video.thumbnail || 
                         'https://via.placeholder.com/48x36?text=♪';
        
        item.innerHTML = `
            <img src="${thumbnail}" 
                 alt="${Utils.escapeHtml(video.title)}" 
                 class="playlist-item-thumb-mobile" 
                 loading="lazy"
                 onerror="this.src='https://via.placeholder.com/48x36?text=♪'">
            <div class="playlist-item-info-mobile">
                <h4 class="playlist-item-title-mobile" title="${Utils.escapeHtml(video.title)}">
                    ${Utils.escapeHtml(video.title)}
                </h4>
                <p class="playlist-item-duration-mobile">
                    ${Utils.formatDuration(video.duration)}
                    ${video.channelTitle ? ` • ${video.channelTitle}` : ''}
                </p>
            </div>
            <button class="playlist-item-menu-mobile" title="Opciones">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            ${video.videoId === playingVideoId ? '<i class="fas fa-volume-up playing-icon-mobile"></i>' : ''}
        `;
        
        // Event listeners
        UIManager.setupPlaylistItemListeners(item, video, playlistId);
        
        return item;
    }
    
    static setupPlaylistItemListeners(item, video, playlistId) {
        // Context menu
        const menuBtn = item.querySelector('.playlist-item-menu-mobile');
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                UIManager.showMobileContextMenu(e.target, video, playlistId);
            });
        }
        
        // Click en el item (reproducir)
        item.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            UIManager.handleVideoItemClick(video, playlistId);
        });
        
        // Touch feedback
        if ('ontouchstart' in window) {
            item.addEventListener('touchstart', () => {
                item.style.backgroundColor = 'var(--hover-bg)';
            });
            
            item.addEventListener('touchend', () => {
                setTimeout(() => {
                    item.style.backgroundColor = '';
                }, 150);
            });
        }
    }
    
    // ===== MANEJADORES DE EVENTOS MEJORADOS =====
    
    static handlePlaylistCardClick(playlist) {
        console.log('🎵 Click en playlist card:', playlist.name);
        
        if (playlist.source === CONFIG.YOUTUBE_LIBRARY_SOURCE_ID && !playlist.isLoaded) {
            // Cargar playlist de YouTube
            UIManager.togglePlaylistExpansion(playlist.id);
        } else if (playlist.videos?.length > 0) {
            // Mostrar detalle o cambiar a playing
            if (window.integration && typeof window.integration.switchView === 'function') {
                window.integration.switchView('playing');
            }
        } else {
            mostrarMensajeFlotante('Esta playlist está vacía', 2000, 'warning');
        }
    }
    
    static handleVideoItemClick(video, playlistId) {
        console.log('🎵 Click en video:', video.title);
        
        // Añadir como "reproducir después"
        UIManager.handlePlayNextActionFromSearch(video.videoId, video);
        
        // Feedback visual mejorado
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            mostrarMensajeFlotante(`♪ Añadido: ${video.title}`, 2000, 'success');
            
            // Vibración si está disponible
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        } else {
            mostrarMensajeFlotante(`"${video.title}" añadido para reproducir después`, 3000, 'success');
        }
    }
    
    static async togglePlaylistExpansion(playlistId) {
        console.log('🔄 Toggle expansión playlist:', playlistId);
        
        try {
            if (window.PlaylistManager && typeof window.PlaylistManager.togglePlaylistExpansion === 'function') {
                await window.PlaylistManager.togglePlaylistExpansion(playlistId);
            } else {
                // Fallback básico
                const playlist = PlaylistState.playlistsData?.find(p => p.id === playlistId);
                if (playlist) {
                    playlist.isExpanded = !playlist.isExpanded;
                    UIManager.updatePlaylistsUI();
                }
            }
        } catch (error) {
            console.error('💥 Error toggle expansión:', error);
            mostrarMensajeFlotante('Error expandiendo playlist', 3000, 'error');
        }
    }
    
    // ===== CONTEXT MENUS MOBILE MEJORADOS =====
    
    static showMobileContextMenu(trigger, video, playlistId) {
        console.log('📋 Mostrando context menu mobile para:', video.title);
        
        // Cerrar menús existentes
        UIManager.closeAllContextMenus();
        
        const modal = UIManager.createMobileContextModal(video, playlistId);
        document.body.appendChild(modal);
        
        // Animación de entrada
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        
        // Setup de eventos
        UIManager.setupContextModalEvents(modal, video, playlistId);
    }
    
    static createMobileContextModal(video, playlistId) {
        const modal = document.createElement('div');
        modal.className = 'mobile-context-modal';
        
        const thumbnail = video.thumbnail || 'https://via.placeholder.com/56x42?text=♪';
        
        modal.innerHTML = `
            <div class="mobile-context-backdrop"></div>
            <div class="mobile-context-sheet">
                <div class="mobile-context-header">
                    <img src="${thumbnail}" 
                         alt="${Utils.escapeHtml(video.title)}" 
                         class="context-video-thumb"
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
                    <button class="mobile-context-action" data-action="add-to-queue">
                        <i class="fas fa-plus"></i>
                        Añadir a Cola
                    </button>
                    <button class="mobile-context-action" data-action="copy-link">
                        <i class="fas fa-link"></i>
                        Copiar Enlace
                    </button>
                    <button class="mobile-context-action" data-action="move" ${playlistId === 'manual' ? '' : 'style="display:none"'}>
                        <i class="fas fa-folder-tree"></i>
                        Mover a Playlist
                    </button>
                    <button class="mobile-context-action danger" data-action="delete" ${playlistId === 'manual' ? '' : 'style="display:none"'}>
                        <i class="fas fa-trash"></i>
                        Eliminar
                    </button>
                </div>
                <button class="mobile-context-close">Cancelar</button>
            </div>
        `;
        
        return modal;
    }
    
    static setupContextModalEvents(modal, video, playlistId) {
        // Cerrar con backdrop
        modal.querySelector('.mobile-context-backdrop').addEventListener('click', () => {
            UIManager.closeMobileContextMenu(modal);
        });
        
        // Cerrar con botón
        modal.querySelector('.mobile-context-close').addEventListener('click', () => {
            UIManager.closeMobileContextMenu(modal);
        });
        
        // Actions
        modal.querySelectorAll('.mobile-context-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                UIManager.handleMobileContextAction(action, video, playlistId);
                UIManager.closeMobileContextMenu(modal);
            });
        });
        
        // ESC key para cerrar
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                UIManager.closeMobileContextMenu(modal);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        // Prevenir scroll del body
        document.body.style.overflow = 'hidden';
    }
    
    static closeMobileContextMenu(modal) {
        modal.classList.remove('show');
        modal.classList.add('hide');
        
        // Restaurar scroll del body
        document.body.style.overflow = '';
        
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 300);
    }
    
    static handleMobileContextAction(action, video, playlistId) {
        console.log('📋 Context action:', action, 'para video:', video.title);
        
        switch (action) {
            case 'play-next':
            case 'add-to-queue':
                UIManager.handlePlayNextActionFromSearch(video.videoId, video);
                break;
                
            case 'copy-link':
                UIManager.copyVideoLink(video.videoId);
                break;
                
            case 'move':
                UIManager.showPlaylistSelector(video, playlistId);
                break;
                
            case 'delete':
                UIManager.deleteVideoFromPlaylist(video, playlistId);
                break;
                
            default:
                console.warn('⚠️ Acción no reconocida:', action);
        }
    }
    
    // ===== ACCIONES ESPECÍFICAS =====
    
    static playEntirePlaylist(playlist) {
        if (!playlist.videos || playlist.videos.length === 0) {
            mostrarMensajeFlotante('Esta playlist está vacía', 2000, 'warning');
            return;
        }
        
        console.log('▶️ Reproduciendo playlist completa:', playlist.name);
        
        // Usar PlaybackController si está disponible
        if (window.PlaybackController && typeof window.PlaybackController.playFirstVideo === 'function') {
            // Limpiar y configurar queue
            UIManager.setupQueueFromPlaylist(playlist);
            window.PlaybackController.playFirstVideo();
        } else {
            console.warn('⚠️ PlaybackController no disponible');
        }
        
        mostrarMensajeFlotante(`Reproduciendo "${playlist.name}" (${playlist.videos.length} videos)`, 3000, 'success');
        
        // Cambiar a vista playing
        if (window.integration && window.integration.switchView) {
            window.integration.switchView('playing');
        }
    }
    
    static addAllToQueue(playlist) {
        if (!playlist.videos || playlist.videos.length === 0) {
            mostrarMensajeFlotante('Esta playlist está vacía', 2000, 'warning');
            return;
        }
        
        console.log('➕ Añadiendo toda la playlist a la cola:', playlist.name);
        
        // Añadir todos los videos
        playlist.videos.forEach(video => {
            UIManager.handlePlayNextActionFromSearch(video.videoId, video);
        });
        
        mostrarMensajeFlotante(`${playlist.videos.length} videos de "${playlist.name}" añadidos`, 3000, 'success');
    }
    
    static setupQueueFromPlaylist(playlist) {
        // Crear o actualizar playlist de cola
        let queuePlaylist = PlaylistState.playlistsData?.find(p => p.id === 'queue');
        if (!queuePlaylist) {
            queuePlaylist = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: 'https://via.placeholder.com/50?text=▶',
                videos: [],
                isExpanded: true
            };
            if (PlaylistState.playlistsData) {
                PlaylistState.playlistsData.unshift(queuePlaylist);
            }
        }
        
        // Reemplazar videos de la cola
        queuePlaylist.videos = [...playlist.videos];
        
        console.log('🎵 Cola configurada con', queuePlaylist.videos.length, 'videos');
    }
    
    static handlePlayNextActionFromSearch(videoId, videoData) {
        console.log('🎵 Añadiendo para reproducir después:', videoData.title);
        
        try {
            // Determinar estrategia según estado actual
            if (window.PlaylistState && window.PlaylistState.currentPlayingInfo) {
                const currentIndex = window.PlaylistState.currentPlayingInfo.flattenedIndex;
                
                if (currentIndex < 0) {
                    // No hay reproducción activa - crear queue
                    UIManager.createQueueAndAdd(videoData);
                } else {
                    // Hay reproducción activa - añadir después del actual
                    UIManager.insertVideoAfterCurrent(videoData, currentIndex);
                }
            } else {
                // Fallback: crear queue básica
                UIManager.createQueueAndAdd(videoData);
            }
            
            // Feedback optimizado
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                mostrarMensajeFlotante(`♪ Añadido`, 1500, 'success');
                
                // Vibración táctil
                if (navigator.vibrate) {
                    navigator.vibrate(30);
                }
            } else {
                mostrarMensajeFlotante(`"${videoData.title}" añadido para reproducir después`, 3000, 'success');
            }
            
            // Actualizar UI
            UIManager.updatePlaylistsUI();
            
        } catch (error) {
            console.error('💥 Error añadiendo video:', error);
            mostrarMensajeFlotante('Error añadiendo video', 2000, 'error');
        }
    }
    
    static createQueueAndAdd(videoData) {
        // Buscar o crear playlist de cola
        let queuePlaylist = PlaylistState.playlistsData?.find(p => p.id === 'queue') ||
                           PlaylistState.playlistsData?.find(p => p.id === 'manual');
        
        if (!queuePlaylist) {
            queuePlaylist = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: 'https://via.placeholder.com/50?text=▶',
                videos: [],
                isExpanded: true
            };
            
            if (PlaylistState.playlistsData) {
                PlaylistState.playlistsData.unshift(queuePlaylist);
            } else {
                window.PlaylistState = { playlistsData: [queuePlaylist] };
            }
        }
        
        // Añadir video
        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title,
            thumbnail: videoData.thumbnail,
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || videoData.artist || 'Desconocido'
        };
        
        queuePlaylist.videos.push(videoObject);
        console.log('➕ Video añadido a cola:', videoObject.title);
    }
    
    static insertVideoAfterCurrent(videoData, currentIndex) {
        if (window.PlaylistManager && typeof window.PlaylistManager.insertVideoAtFlatIndex === 'function') {
            const targetIndex = currentIndex + 1;
            window.PlaylistManager.insertVideoAtFlatIndex(videoData, targetIndex);
            console.log('➕ Video insertado en posición:', targetIndex);
        } else {
            // Fallback: añadir a cola
            UIManager.createQueueAndAdd(videoData);
        }
    }
    
    static copyVideoLink(videoId) {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        
        if (Utils.copyToClipboard) {
            Utils.copyToClipboard(url).then(success => {
                if (success) {
                    mostrarMensajeFlotante('Enlace copiado al portapapeles', 2000, 'success');
                } else {
                    mostrarMensajeFlotante('Error copiando enlace', 2000, 'error');
                }
            });
        } else {
            // Fallback manual
            navigator.clipboard?.writeText(url).then(() => {
                mostrarMensajeFlotante('Enlace copiado', 2000, 'success');
            }).catch(() => {
                mostrarMensajeFlotante('Error copiando enlace', 2000, 'error');
            });
        }
    }
    
    static deleteVideoFromPlaylist(video, playlistId) {
        if (window.PlaylistManager && typeof window.PlaylistManager.deleteVideo === 'function') {
            window.PlaylistManager.deleteVideo(playlistId, video.videoId);
            mostrarMensajeFlotante('Video eliminado', 2000, 'success');
        } else {
            console.warn('⚠️ PlaylistManager.deleteVideo no disponible');
            mostrarMensajeFlotante('Error eliminando video', 2000, 'error');
        }
    }
    
    static showPlaylistSelector(video, sourcePlaylistId) {
        mostrarMensajeFlotante('Selector de playlists próximamente...', 2000, 'info');
        // TODO: Implementar selector de playlists móvil
    }
    
    // ===== INTERACTIVIDAD Y EVENTOS =====
    
    static enableInteractivity() {
        // Habilitar drag & drop solo en desktop
        if (window.innerWidth >= 1024) {
            UIManager.enableDragAndDrop();
        }
        
        // Configurar intersection observer para lazy loading
        UIManager.setupLazyLoading();
        
        // Configurar touch gestures en mobile
        if ('ontouchstart' in window) {
            UIManager.setupTouchGestures();
        }
    }
    
    static enableDragAndDrop() {
        // TODO: Implementar drag and drop para desktop
        console.log('🖱️ Drag and drop pendiente de implementación');
    }
    
    static setupLazyLoading() {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            observer.unobserve(img);
                        }
                    }
                });
            });
            
            // Observar imágenes con data-src
            document.querySelectorAll('img[data-src]').forEach(img => {
                imageObserver.observe(img);
            });
        }
    }
    
    static setupTouchGestures() {
        // Configurar gestos básicos para mobile
        let touchStartX = 0;
        let touchStartY = 0;
        
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });
        
        document.addEventListener('touchend', (e) => {
            if (!e.changedTouches.length) return;
            
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            // Detectar swipe horizontal (cambio de vista)
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 100) {
                // TODO: Implementar navegación por swipe
                console.log('👆 Swipe detectado:', deltaX > 0 ? 'derecha' : 'izquierda');
            }
        });
    }
    
    // ===== UTILIDADES =====
    
    static closeAllContextMenus() {
        // Cerrar menús contextuales desktop
        document.querySelectorAll('.delete-menu-content').forEach(menu => {
            menu.style.display = 'none';
        });
        
        // Cerrar modales mobile
        document.querySelectorAll('.mobile-context-modal').forEach(modal => {
            UIManager.closeMobileContextMenu(modal);
        });
        
        // Restaurar scroll del body
        document.body.style.overflow = '';
    }
    
    static updateSinglePlaylistUI(playlistId) {
        // Por simplicidad, actualizar toda la UI
        // TODO: Optimizar para actualizar solo una playlist específica
        console.log('🔄 Actualizando playlist específica:', playlistId);
        UIManager.updatePlaylistsUI();
    }
    
    static getPlaylistStats() {
        if (!PlaylistState.playlistsData) return { playlists: 0, videos: 0 };
        
        return {
            playlists: PlaylistState.playlistsData.length,
            videos: PlaylistState.playlistsData.reduce((total, p) => total + (p.videos?.length || 0), 0)
        };
    }
    
    // ===== DEBUG Y DIAGNÓSTICO =====
    
    static debug() {
        console.log('=== UI MANAGER DEBUG ===');
        console.log('Current View:', UIManager.getCurrentView());
        console.log('Playlist Stats:', UIManager.getPlaylistStats());
        console.log('DOM Elements:', {
            playlistContainer: !!UIManager.getPlaylistContainer(UIManager.getCurrentView()),
            searchResults: !!document.getElementById('searchResults'),
            playlistsGrid: !!document.getElementById('playlistsGrid')
        });
        console.log('PlaylistState:', window.PlaylistState);
        console.log('========================');
    }
}

// ===== SOLO UN EXPORT AL FINAL - SIN DUPLICADOS =====
