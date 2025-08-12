// Manejo de Interface de Usuario - CORREGIDO
import { PlaylistState, CONFIG } from './config.js';
import { PlaylistManager } from './playlistManager.js';
import { Utils } from './utils.js';

// Función para mostrar mensajes flotantes - CORREGIDA
export function mostrarMensajeFlotante(mensaje) {
    const mensajeDiv = document.createElement('div');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = 'floating-messages';
    
    // CORRECCIÓN: Buscar el contenedor correcto y usar fallback
    let playlistContainer = document.getElementById('floatingMessageContainer');
    
    // Si no existe, buscar alternativas o crear uno
    if (!playlistContainer) {
        playlistContainer = document.getElementById('playlistContainer');
    }
    
    // Si tampoco existe, usar el body como fallback
    if (!playlistContainer) {
        playlistContainer = document.body;
    }
    
    // CORRECCIÓN: Usar appendChild en lugar de insertAdjacentElement si no es válido
    if (playlistContainer === document.body) {
        // Para el body, usar appendChild directamente
        playlistContainer.appendChild(mensajeDiv);
    } else {
        // Para otros contenedores, usar insertAdjacentElement
        try {
            playlistContainer.insertAdjacentElement('afterend', mensajeDiv);
        } catch (error) {
            console.warn('Error usando insertAdjacentElement, usando appendChild:', error);
            playlistContainer.appendChild(mensajeDiv);
        }
    }

    // Añadir estilos inline para asegurar visibilidad
    mensajeDiv.style.position = 'fixed';
    mensajeDiv.style.top = '20px';
    mensajeDiv.style.right = '20px';
    mensajeDiv.style.zIndex = '10000';
    mensajeDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    mensajeDiv.style.color = 'white';
    mensajeDiv.style.padding = '10px 15px';
    mensajeDiv.style.borderRadius = '5px';
    mensajeDiv.style.fontSize = '14px';
    mensajeDiv.style.maxWidth = '300px';
    mensajeDiv.style.wordWrap = 'break-word';
    mensajeDiv.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    mensajeDiv.style.transition = 'opacity 0.3s ease';

    setTimeout(() => {
        mensajeDiv.classList.add('fadeOut');
        mensajeDiv.style.opacity = '0';
        setTimeout(() => {
            if (mensajeDiv.parentNode) {
                mensajeDiv.remove();
            }
        }, 1000);
    }, 6000);
}
export class UIManager {
    // Actualizar UI de playlists completa
    static updatePlaylistsUI() {
        const playlistContainer = document.getElementById('playlistContainer');
        if (!playlistContainer) return;
        
        const currentScrollTop = playlistContainer.scrollTop;
        playlistContainer.innerHTML = '';

        const playingVideoId = PlaylistState.currentPlayingInfo.videoId;

        if (PlaylistState.playlistsData.length === 0) {
            playlistContainer.innerHTML = '<p style="padding: 10px; color: #888; text-align: center;">Añade playlists o videos.</p>';
            return;
        }

        PlaylistState.playlistsData.forEach((playlist) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = `playlist-group ${playlist.isExpanded ? 'expanded' : ''}`;
            groupDiv.dataset.playlistId = playlist.id;

            const headerDiv = document.createElement('div');
            headerDiv.className = 'playlist-group-header';
            headerDiv.innerHTML = `
                <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" class="playlist-group-thumb" loading="lazy">
                <span class="playlist-group-name">${playlist.name} (${playlist.videos.length})</span>
                <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} expand-icon"></i>
            `;
            headerDiv.addEventListener('click', () => PlaylistManager.togglePlaylistExpansion(playlist.id));
            groupDiv.appendChild(headerDiv);

            const videosDiv = document.createElement('div');
            videosDiv.className = 'playlist-group-videos';
            
            if (playlist.isExpanded) {
                videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
            } else {
                videosDiv.style.maxHeight = '0px';
            }

            playlist.videos.forEach((video) => {
                const item = UIManager.createPlaylistItemElement(video, playlist.id, playingVideoId);
                videosDiv.appendChild(item);
            });

            groupDiv.appendChild(videosDiv);
            playlistContainer.appendChild(groupDiv);

            if (playlist.isExpanded) {
                videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
            }
        });

        playlistContainer.scrollTop = currentScrollTop;
        UIManager.enableDragAndDrop();
    }

    // Actualizar UI de una sola playlist
    static updateSinglePlaylistUI(playlistId) {
        const playlist = PlaylistState.playlistsData.find(p => p.id === playlistId);
        const groupDiv = document.querySelector(`.playlist-group[data-playlist-id="${playlistId}"]`);

        if (!groupDiv) {
            console.warn(`updateSinglePlaylistUI: No se encontró el grupo en el DOM para la playlist ${playlistId}.`);
            UIManager.updatePlaylistsUI();
            return;
        }

        if (playlist && playlist.videos.length === 0 && playlist.id !== 'manual') {
            mostrarMensajeFlotante(`Playlist "${playlist.name}" eliminada (vacía).`);
            PlaylistState.playlistsData = PlaylistState.playlistsData.filter(p => p.id !== playlistId);
            groupDiv.style.transition = 'opacity 0.3s ease';
            groupDiv.style.opacity = '0';
            setTimeout(() => groupDiv.remove(), 300);
            return;
        }
        
        if (playlist) {
            const headerName = groupDiv.querySelector('.playlist-group-name');
            if (headerName) {
                headerName.textContent = `${playlist.name} (${playlist.videos.length})`;
            }

            const videosDiv = groupDiv.querySelector('.playlist-group-videos');
            if (videosDiv) {
                const playingVideoId = PlaylistState.currentPlayingInfo.videoId;
                videosDiv.innerHTML = '';
                playlist.videos.forEach(video => {
                    const item = UIManager.createPlaylistItemElement(video, playlist.id, playingVideoId);
                    videosDiv.appendChild(item);
                });
                
                UIManager.enableDragAndDrop(videosDiv);

                if (playlist.isExpanded) {
                    videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
                }
            }
        }
    }

    // Crear elemento de video en playlist
    static createPlaylistItemElement(video, playlistId, playingVideoId) {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.draggable = true;
        item.dataset.videoId = video.videoId;
        item.dataset.playlistId = playlistId;

        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';
        const img = document.createElement('img');
        img.src = video.thumbnail;
        img.alt = video.title;
        img.className = 'drag-handle';
        img.loading = 'lazy';
        imageContainer.appendChild(img);

        if (video.videoId === playingVideoId) {
            item.classList.add('playing');
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-volume-high playing-icon';
            imageContainer.appendChild(icon);
        }
        item.appendChild(imageContainer);

        const textContainer = document.createElement('div');
        textContainer.innerHTML = `
            <p style="margin: 0; font-size: 12px; font-weight: bold;" title="${video.title}">${video.title}</p>
            <p style="margin: 0; font-size: 10px; color: #999;">Duración: ${Utils.formatDuration(video.duration)}</p>
        `;
        item.appendChild(textContainer);

        // Crear menú contextual
        const deleteMenu = UIManager.createContextMenu(video, playlistId);
        item.appendChild(deleteMenu);

        return item;
    }

    // Crear menú contextual para item de playlist
    static createContextMenu(video, playlistId) {
        const deleteMenu = document.createElement('div');
        deleteMenu.className = 'delete-menu';
        
        const menuButton = document.createElement('button');
        menuButton.className = 'delete-menu-button';
        menuButton.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
        
        const menuContent = document.createElement('div');
        menuContent.className = 'delete-menu-content';

        // Botón Eliminar
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button-item';
        deleteButton.title = 'Eliminar de esta playlist';
        deleteButton.innerHTML = '<i class="fa-solid fa-xmark"></i> Eliminar';
        menuContent.appendChild(deleteButton);

        // Botón Reproducir Después
        const playNextButton = document.createElement('button');
        playNextButton.className = 'play-next-button';
        playNextButton.title = 'Poner después del video actual';
        playNextButton.innerHTML = '<i class="fa-solid fa-arrow-right-to-line"></i> Reproducir Despues';
        menuContent.appendChild(playNextButton);

        // Botón Mover a otra playlist
        const moveToPlaylistButton = document.createElement('button');
        moveToPlaylistButton.className = 'move-to-playlist-button';
        moveToPlaylistButton.title = 'Mover este video a otra playlist';
        moveToPlaylistButton.innerHTML = '<i class="fa-solid fa-folder-tree"></i> Mover a playlist';
        menuContent.appendChild(moveToPlaylistButton);

        deleteMenu.appendChild(menuButton);
        deleteMenu.appendChild(menuContent);

        // Event listeners
        UIManager.setupContextMenuListeners(menuButton, menuContent, deleteButton, playNextButton, moveToPlaylistButton, video, playlistId);

        return deleteMenu;
    }

    // Configurar listeners del menú contextual
    static setupContextMenuListeners(menuButton, menuContent, deleteButton, playNextButton, moveToPlaylistButton, video, playlistId) {
        // Listener para el botón de 3 puntos
        menuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            UIManager.closeAllContextMenus();

            if (menuContent.style.display === 'block' || menuContent.classList.contains('visible')) {
                menuContent.style.display = 'none';
                menuContent.classList.remove('visible');
            } else {
                menuContent.style.display = 'block';
                menuContent.classList.add('visible');
            }
        });

        // Listener para eliminar
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            PlaylistManager.deleteVideo(playlistId, video.videoId);
            UIManager.closeAllContextMenus();
        });

        // Listener para reproducir después
        playNextButton.addEventListener('click', (event) => {
            event.stopPropagation();
            console.log("Click en 'Reproducir Despues'");
            UIManager.closeAllContextMenus();
            UIManager.handlePlayNextAction(video.videoId, playlistId);
        });

        // Listener para mover a playlist
        moveToPlaylistButton.addEventListener('click', (event) => {
            event.stopPropagation();
            console.log("Click en 'Mover a playlist'");

            const videoDataForMove = {
                videoId: video.videoId,
                title: video.title,
                thumbnail: video.thumbnail,
                duration: video.duration,
            };

            UIManager.showPlaylistSelectionPopup(menuButton, videoDataForMove, 'move', playlistId);
        });
    }

    // Manejar acción "Reproducir Después"
    static handlePlayNextAction(sourceVideoId, sourcePlaylistId) {
        let targetFlatIndex;
        
        if (PlaylistState.currentPlayingInfo.flattenedIndex < 0) {
            const sourcePlaylist = PlaylistState.playlistsData.find(p => p.id === sourcePlaylistId);
            const sourceIndexInOwn = sourcePlaylist ? sourcePlaylist.videos.findIndex(v => v.videoId === sourceVideoId) : -1;

            if (sourceIndexInOwn === 0 || sourcePlaylistId === 'manual') {
                targetFlatIndex = 0;
            } else {
                targetFlatIndex = 0;
            }
            console.log(`Nada sonando, moviendo ${sourceVideoId} a índice aplanado ${targetFlatIndex}`);
        } else {
            targetFlatIndex = PlaylistState.currentPlayingInfo.flattenedIndex + 1;
            console.log(`Sonando ${PlaylistState.currentPlayingInfo.videoId}, moviendo ${sourceVideoId} a índice aplanado ${targetFlatIndex}.`);
        }

        const flatList = PlaylistManager.getFlattenedPlaylist();
        targetFlatIndex = Math.max(0, Math.min(targetFlatIndex, flatList.length));

        let cumulativeIndex = 0;
        let targetLocalIndex = -1;
        let targetPlaylistId = null;

        for (const p of PlaylistState.playlistsData) {
            const playlistVideoCount = p.videos.length;
            const endOfPlaylistIndex = cumulativeIndex + playlistVideoCount;

            if (targetFlatIndex < endOfPlaylistIndex || (targetFlatIndex === endOfPlaylistIndex && p === PlaylistState.playlistsData[PlaylistState.playlistsData.length -1])) {
                targetPlaylistId = p.id;
                targetLocalIndex = targetFlatIndex - cumulativeIndex;
                targetLocalIndex = Math.min(targetLocalIndex, p.videos.length);
                break;
            }
            cumulativeIndex += playlistVideoCount;
        }

        if (targetPlaylistId !== null && targetLocalIndex !== -1) {
            const sourcePlaylist = PlaylistState.playlistsData.find(p => p.id === sourcePlaylistId);
            const sourceLocalIndex = sourcePlaylist ? sourcePlaylist.videos.findIndex(v => v.videoId === sourceVideoId) : -1;

            if (!(sourcePlaylistId === targetPlaylistId && sourceLocalIndex === targetLocalIndex)) {
                console.log(`Moviendo ${sourceVideoId} (de ${sourcePlaylistId}) a Playlist ${targetPlaylistId} en índice local ${targetLocalIndex} para 'Reproducir Después'`);
                PlaylistManager.moveVideo(sourceVideoId, sourcePlaylistId, targetPlaylistId, targetLocalIndex);
            } else {
                console.log(`Video ${sourceVideoId} ya está en la posición de 'Reproducir Después', no se mueve.`);
            }
        } else {
            console.error("No se pudo determinar la playlist/índice destino para 'Reproducir Después'.");
            mostrarMensajeFlotante("Error al calcular la posición para 'Reproducir Después'.");
        }
    }

    // Mostrar popup de selección de playlist
    static showPlaylistSelectionPopup(anchorElement, videoData, actionType, sourcePlaylistId = null) {
        UIManager.closePlaylistSelectionPopups();
        UIManager.closeAllContextMenus();

        const menu = document.createElement('div');
        menu.className = 'playlist-selection-popup-menu add-to-playlist-menu';

        let availablePlaylists = PlaylistState.playlistsData;
        let popupTitleText = '';
        let itemClickHandler = null;

        if (actionType === 'add') {
            popupTitleText = "Add video to:";
            availablePlaylists = PlaylistState.playlistsData;

            itemClickHandler = (event) => {
                event.stopPropagation();
                const targetPId = event.currentTarget.dataset.targetPlaylistId;
                console.log(`Adding ${videoData.videoId} to playlist ${targetPId}`);
                PlaylistManager.addVideoToSpecificPlaylist(videoData, targetPId);
                UIManager.closePlaylistSelectionPopups();
            };

        } else if (actionType === 'move') {
            popupTitleText = "Move video to:";
            availablePlaylists = PlaylistState.playlistsData.filter(p => p.id !== sourcePlaylistId);

            if (availablePlaylists.length === 0) {
                mostrarMensajeFlotante("No other playlists to move to.");
                return;
            }

            itemClickHandler = (event) => {
                event.stopPropagation();
                const targetPId = event.currentTarget.dataset.targetPlaylistId;
                console.log(`Moving ${videoData.videoId} from ${sourcePlaylistId} to ${targetPId}`);
                const targetInsertionIndex = 0;
                PlaylistManager.moveVideo(videoData.videoId, sourcePlaylistId, targetPId, targetInsertionIndex);
                UIManager.closePlaylistSelectionPopups();
            };
        } else {
            console.error("showPlaylistSelectionPopup: Invalid actionType:", actionType);
            return;
        }

        const title = document.createElement('div');
        title.textContent = popupTitleText;
        title.className = 'playlist-selection-popup-title move-to-playlist-popup-title add-to-playlist-popup-title';
        menu.appendChild(title);

        availablePlaylists.forEach(playlist => {
            const item = document.createElement('button');
            item.className = 'playlist-selection-popup-item add-to-playlist-menu-item';
            item.dataset.targetPlaylistId = playlist.id;

            item.innerHTML = `
                <img src="${playlist.thumbnailUrl || 'https://via.placeholder.com/50?text=?'}" alt="" loading="lazy">
                <span>${playlist.name}</span>
            `;
            item.title = `${popupTitleText} "${playlist.name}"`;

            item.addEventListener('click', itemClickHandler);
            menu.appendChild(item);
        });

        // Posicionamiento
        document.body.appendChild(menu);
        const anchorRect = anchorElement.getBoundingClientRect();

        let top = window.scrollY + anchorRect.bottom + 2;
        let left = window.scrollX + anchorRect.left;

        menu.style.position = 'absolute';
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.style.minWidth = `${anchorRect.width + 50}px`;
        menu.style.zIndex = '1000';

        requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();

            if (menuRect.right > window.innerWidth - 10) {
                left = window.scrollX + anchorRect.right - menuRect.width;
                menu.style.left = `${Math.max(10, left)}px`;
            }
            if (menuRect.left < 10) {
                menu.style.left = '10px';
            }

            if (menuRect.bottom > window.innerHeight - 10) {
                top = window.scrollY + anchorRect.top - menuRect.height - 2;
                menu.style.top = `${Math.max(10, top)}px`;
            }
            if (menuRect.top < 10) {
                menu.style.top = '10px';
            }
        });

        setTimeout(() => {
            document.addEventListener('click', UIManager.closePlaylistSelectionPopups, { once: true, capture: true });
            menu.addEventListener('click', e => e.stopPropagation());
        }, 10);
    }

    // Cerrar popups de selección de playlist
    static closePlaylistSelectionPopups() {
        document.querySelectorAll('.playlist-selection-popup-menu').forEach(menu => menu.remove());
    }

    // Cerrar todos los menús contextuales
    static closeAllContextMenus() {
        document.querySelectorAll('#playlistContainer .delete-menu-content').forEach(menu => {
            menu.style.display = 'none';
        });
    }

    // Habilitar drag and drop
    static enableDragAndDrop(scopeElement = document) {
        const playlistContainer = scopeElement === document 
            ? document.getElementById('playlistContainer') 
            : scopeElement.closest('.playlist-group');

        if (!playlistContainer) return;

        let draggedItemElement = null;
        let draggedVideoData = null;
        let placeholder = null;

        function createPlaceholder() {
            const ph = document.createElement('div');
            ph.className = 'playlist-item placeholder';
            ph.style.height = '40px';
            ph.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
            ph.style.border = '1px dashed #007bff';
            ph.style.margin = '4px 0';
            return ph;
        }
        placeholder = createPlaceholder();

        const itemsToMakeDraggable = (scopeElement === document) 
            ? playlistContainer.querySelectorAll('.playlist-item') 
            : scopeElement.querySelectorAll('.playlist-item');

        itemsToMakeDraggable.forEach(item => {
            item.addEventListener('dragstart', (event) => {
                const targetItem = event.target.closest('.playlist-item');
                if (!targetItem) return;

                draggedItemElement = targetItem;
                draggedVideoData = {
                    videoId: targetItem.dataset.videoId,
                    sourcePlaylistId: targetItem.dataset.playlistId
                };

                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', draggedVideoData.videoId);

                setTimeout(() => targetItem.classList.add('dragging'), 0);
            });

            item.addEventListener('dragend', (event) => {
                if (draggedItemElement) {
                    draggedItemElement.classList.remove('dragging');
                }
                if(placeholder && placeholder.parentNode) {
                    placeholder.remove();
                }
                document.querySelectorAll('.drag-over-area').forEach(el => el.classList.remove('drag-over-area'));
                draggedItemElement = null;
                draggedVideoData = null;
            });

            item.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const targetItem = event.target.closest('.playlist-item');
                if (!targetItem || targetItem === draggedItemElement) return;

                const targetRect = targetItem.getBoundingClientRect();
                const offsetY = event.clientY - targetRect.top;
                if (offsetY < targetRect.height / 2) {
                    targetItem.parentNode.insertBefore(placeholder, targetItem);
                } else {
                    targetItem.parentNode.insertBefore(placeholder, targetItem.nextSibling);
                }
            });

            item.addEventListener('drop', (event) => {
                event.preventDefault();
                if (placeholder && placeholder.parentNode) {
                    placeholder.remove();
                }
                const targetItem = event.target.closest('.playlist-item');
                if (!targetItem || !draggedVideoData || targetItem === draggedItemElement) {
                    return;
                }

                const targetPlaylistId = targetItem.dataset.playlistId;
                const droppedVideoId = event.dataTransfer.getData('text/plain');

                let targetIndex = Array.from(targetItem.parentNode.children)
                    .filter(el => el.classList.contains('playlist-item') && !el.classList.contains('placeholder') && !el.classList.contains('dragging'))
                    .indexOf(targetItem);

                const targetRect = targetItem.getBoundingClientRect();
                const offsetY = event.clientY - targetRect.top;
                if (offsetY >= targetRect.height / 2) {
                    targetIndex++;
                }

                console.log(`Drop: Video ${droppedVideoId} (from ${draggedVideoData.sourcePlaylistId}) sobre item ${targetItem.dataset.videoId} (Playlist ${targetPlaylistId}, índice ${targetIndex})`);

                PlaylistManager.moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
            });
        });

        const containersToListen = (scopeElement === document)
            ? playlistContainer.querySelectorAll('.playlist-group-videos')
            : playlistContainer.querySelectorAll('.playlist-group-videos');

        containersToListen.forEach(container => {
            container.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (container.children.length === 0 || event.offsetY > container.scrollHeight - 20) {
                    container.classList.add('drag-over-area');
                    if (!placeholder.parentNode || placeholder.nextSibling) {
                        container.appendChild(placeholder);
                    }
                } else {
                    container.classList.remove('drag-over-area');
                }
            });

            container.addEventListener('dragleave', (event) => {
                if (!container.contains(event.relatedTarget)) {
                    container.classList.remove('drag-over-area');
                    if(placeholder.parentNode === container) placeholder.remove();
                }
            });

            container.addEventListener('drop', (event) => {
                event.preventDefault();
                if (placeholder && placeholder.parentNode) {
                    placeholder.remove();
                }
                container.classList.remove('drag-over-area');
                const groupDiv = event.target.closest('.playlist-group');
                if (!groupDiv || !draggedVideoData) return;

                const targetPlaylistId = groupDiv.dataset.playlistId;
                const droppedVideoId = event.dataTransfer.getData('text/plain');

                const targetPlaylist = PlaylistState.playlistsData.find(p => p.id === targetPlaylistId);
                const targetIndex = targetPlaylist ? targetPlaylist.videos.length : 0;

                console.log(`Drop: Video ${droppedVideoId} (from ${draggedVideoData.sourcePlaylistId}) al final de Playlist ${targetPlaylistId}`);
                PlaylistManager.moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
            });
        });
    }
    // Manejar acción "Reproducir Después" desde búsqueda
static handlePlayNextActionFromSearch(videoId, videoData) {
    // Si no hay video reproduciéndose, añadir al principio
    if (PlaylistState.currentPlayingInfo.flattenedIndex < 0) {
        // Crear playlist temporal si no existe
        if (!PlaylistState.playlistsData.some(p => p.id === 'queue')) {
            PlaylistState.playlistsData.unshift({
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: 'https://via.placeholder.com/50?text=▶',
                videos: [],
                isExpanded: true
            });
        }
        
        const queuePlaylist = PlaylistState.playlistsData.find(p => p.id === 'queue');
        queuePlaylist.videos.push({
            videoId: videoData.videoId,
            title: videoData.title,
            thumbnail: videoData.thumbnail,
            duration: videoData.duration || 0
        });
        
        console.log(`Video ${videoId} añadido a cola (no hay reproducción activa)`);
    } else {
        // Añadir después del video actual
        const targetFlatIndex = PlaylistState.currentPlayingInfo.flattenedIndex + 1;
        UIManager.insertVideoAtFlatIndex(videoData, targetFlatIndex);
        console.log(`Video ${videoId} añadido para reproducir después del actual`);
    }
    
    UIManager.updatePlaylistsUI();
    mostrarMensajeFlotante(`"${videoData.title}" añadido a la cola`);
}

// Insertar video en índice específico de la lista aplanada
static insertVideoAtFlatIndex(videoData, targetFlatIndex) {
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
}
