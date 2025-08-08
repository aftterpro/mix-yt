import { playlistsData, getFlattenedPlaylist, currentPlayingInfo, updatePlaylistsUI } from "./app.js";
import { mostrarMensajeFlotante } from "./ui.js";
import { showPlaylistSelectionPopup } from "./popups.js";

export function addYouTubeLibraryPlaylists(youtubePlaylists) {
    if (!youtubePlaylists || youtubePlaylists.length === 0) {
        mostrarMensajeFlotante("No se encontraron playlists en tu biblioteca de YouTube.");
        return;
    }

    // Transforma los datos de la API al formato que usa nuestra app
    const formattedPlaylists = youtubePlaylists.map(playlist => {
        // Ignorar playlists que no tienen título o items
        if (!playlist.snippet.title || playlist.contentDetails.itemCount === 0) {
            return null;
        }
        return {
            id: playlist.id,
            name: playlist.snippet.title,
            // Usar thumbnail de alta calidad si está disponible, si no, el por defecto
            thumbnailUrl: playlist.snippet.thumbnails.high?.url || playlist.snippet.thumbnails.default.url,
            videos: [], // Los videos se cargarán desde Piped al hacer clic en la playlist
            isExpanded: false,
            source: YOUTUBE_LIBRARY_SOURCE_ID, // Marcar como playlist de la biblioteca de YT
            isLoaded: false, // Marcar que los videos aún no se han cargado
        };
    }).filter(p => p !== null); // Filtrar las playlists nulas

    // Añadir las nuevas playlists al principio de la lista de datos
    playlistsData.unshift(...formattedPlaylists);
    
    mostrarMensajeFlotante(`${formattedPlaylists.length} playlists de tu biblioteca han sido añadidas.`);
    updatePlaylistsUI(); // Refrescar la interfaz
}

export function clearYouTubeLibraryPlaylists() {
    const initialCount = playlistsData.length;
    playlistsData = playlistsData.filter(p => p.source !== YOUTUBE_LIBRARY_SOURCE_ID);
    const removedCount = initialCount - playlistsData.length;
    
    if (removedCount > 0) {
        console.log(`Se eliminaron ${removedCount} playlists de la biblioteca de YouTube.`);
        updatePlaylistsUI(); // Actualizar la interfaz para que desaparezcan
    }
}

export function handleSearchResultAddClick(event, videoData) {
    event.preventDefault(); // Evitar comportamiento por defecto
    event.stopPropagation(); // Detener propagación

    const addButton = event.currentTarget; // El botón que fue clickeado
// Determine if there are any playlists loaded that are not the empty manual playlist
 const userLoadedPlaylists = playlistsData.filter(p => p.id !== 'manual' || p.videos.length > 0);

if (userLoadedPlaylists.length === 0) {
    // Case: No playlists loaded (or only manual is present and empty). Add directly to the manual playlist.
    console.log("No loaded playlists or only empty manual, adding direct to manual playlist.");
    addVideoToManualPlaylist(videoData); // Call the function to add to the manual playlist
} else {
    // Case: There are other playlists available. Show the menu to let the user choose.
    console.log("Showing menu to select destination playlist (Add action).");
    // Call the new generic popup function with the action type 'add'
    // No sourcePlaylistId is needed for 'add' from search results.
    showPlaylistSelectionPopup(addButton, videoData, 'add'); // <-- NEW CALL HERE
  }
}
export function addVideoToManualPlaylist(videoData) {
    const manualPlaylistId = 'manual';
    let manualPlaylist = playlistsData.find(p => p.id === manualPlaylistId);

    // Crear playlist manual si no existe
    if (!manualPlaylist) {
        manualPlaylist = {
            id: manualPlaylistId,
            name: 'Mis Vídeos Añadidos',
            thumbnailUrl: 'https://via.placeholder.com/50?text=+',
            videos: [],
            isExpanded: true
        };
        // Asegurar que la manual siempre quede al principio si se crea ahora
        playlistsData.unshift(manualPlaylist);
        console.log("Playlist 'manual' creada y añadida al inicio.");
    }

    // Verificar duplicados DENTRO de la playlist manual
    const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante(`"${videoData.title}" ya está en "${manualPlaylist.name}".`);
        return;
    }

    // Crear el objeto de video
    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: videoData.duration || 0, // Ya debería ser número
    };

    // Añadir al final de la playlist manual
    manualPlaylist.videos.push(videoObject);

    console.log(`Video añadido a playlist '${manualPlaylistId}': ${videoObject.title}`);

    updatePlaylistsUI(); // Actualizar la UI
    checkAndEnablePlayButton(); // Habilitar botón Play si corresponde
}
export function addVideoToSpecificPlaylist(videoData, targetPlaylistId) {
    const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);
    if (!targetPlaylist) {
        console.error(`Error: Playlist destino ${targetPlaylistId} no encontrada.`);
        mostrarMensajeFlotante("Error: No se encontró la playlist destino.");
        return;
    }

    // Verificar duplicados en la playlist destino
    const isDuplicate = targetPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante(`"${videoData.title}" ya está en "${targetPlaylist.name}".`);
        return;
    }

    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: videoData.duration || 0,
    };

    // --- Lógica de Inserción: "Debajo del video que se está reproduciendo" ---
    let targetIndex = targetPlaylist.videos.length; // Por defecto, añadir al final

    if (currentPlayingInfo.playlistId === targetPlaylistId && currentPlayingInfo.flattenedIndex >= 0) {
        // Si el video actual está en la playlist destino
        const currentVideoLocalIndex = targetPlaylist.videos.findIndex(v => v.videoId === currentPlayingInfo.videoId);
        if (currentVideoLocalIndex !== -1) {
            targetIndex = currentVideoLocalIndex + 1; // Insertar justo después
            console.log(`Insertando después del video actual (índice local ${currentVideoLocalIndex}) en ${targetPlaylistId}. Nuevo índice: ${targetIndex}`);
        } else {
             console.log(`Video actual (${currentPlayingInfo.videoId}) no encontrado localmente en ${targetPlaylistId}, añadiendo al final.`);
        }
    } else {
        // Si no hay nada sonando, o está en otra playlist, añadir al final
        console.log(`Video actual no está en ${targetPlaylistId} (o nada suena), añadiendo al final.`);
         targetIndex = targetPlaylist.videos.length;
    }

    // Insertar el video en el array
    targetPlaylist.videos.splice(targetIndex, 0, videoObject);
    mostrarMensajeFlotante(`Video añadido a "${targetPlaylist.name}": ${videoObject.title}`);
    console.log(`Video ${videoObject.videoId} añadido a playlist '${targetPlaylistId}' en índice ${targetIndex}.`);

    updatePlaylistsUI(); // Actualizar UI
    updateCurrentPlayingIndex(); // Recalcular índice aplanado
    checkAndEnablePlayButton(); // Habilitar botón Play si corresponde
}

export function checkAndEnablePlayButton() {
     const flatList = getFlattenedPlaylist();
     if (flatList.length > 0 && playersInitialized) {
         botonPlay.disabled = false;
     }
}
export function getFlattenedPlaylist() {
    let flatList = [];
    playlistsData.forEach(playlist => {
        // ¡IMPORTANTE! Aplanar todos los videos, independientemente de si la pestaña está expandida o no,
        // para mantener un orden de reproducción consistente.
        playlist.videos.forEach(video => {
            flatList.push({ ...video, sourcePlaylistId: playlist.id });
        });
    });
    return flatList;
}

export function updateCurrentPlayingIndex() {
 const flatList = getFlattenedPlaylist();
    let playingVideoId = null;
    let activePlayerNum = null;

    // Determinar qué player está sonando
     try {
         if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) {
             playingVideoId = player1.getVideoData()?.video_id;
             activePlayerNum = 1;
         } else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) {
             playingVideoId = player2.getVideoData()?.video_id;
             activePlayerNum = 2;
         }
     } catch (e) {
         console.error("Error getting playing video data:", e);
         // Mantener índice previo si hay error?
     }
    
    if (playingVideoId) {
        // Solo actualizar si el video que suena ha cambiado o el índice es inválido
         if (currentPlayingInfo.videoId !== playingVideoId || currentPlayingInfo.flattenedIndex < 0) {
             const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
             if (newFlatIndex !== -1) {
                  const currentVideoObject = flatList[newFlatIndex];
                  currentPlayingInfo.videoId = playingVideoId;
                  currentPlayingInfo.playlistId = currentVideoObject.sourcePlaylistId;
                  currentPlayingInfo.flattenedIndex = newFlatIndex;
                  console.log(`Índice aplanado actualizado a: ${newFlatIndex} (Video: ${playingVideoId})`);
                  // Actualizar UI para reflejar el cambio de resaltado
                  updatePlaylistsUI();
             } else {
                 console.warn(`Video ${playingVideoId} sonando, pero no encontrado en la lista aplanada actualizada.`);
                  // Podríamos buscar por playlistId también si el ID no coincide? O resetear?
                   currentPlayingInfo.flattenedIndex = -1; // Marcar como desconocido
             }
         }
          // Asegurarse que currentPlayer esté sincronizado con el player que realmente suena
          if (activePlayerNum && currentPlayer !== activePlayerNum) {
             console.log(`Sincronizando currentPlayer a ${activePlayerNum}`);
             currentPlayer = activePlayerNum;
          }

    } else {
         // Si nada suena, el índice es -1 (o el último conocido si se pausó?)
         // Por simplicidad, si nada suena activamente, consideramos índice -1
         if (currentPlayingInfo.flattenedIndex !== -1) {
            console.log("Reproducción detenida o sin iniciar, reseteando índice aplanado.");
            currentPlayingInfo.videoId = null;
            currentPlayingInfo.playlistId = null;
            currentPlayingInfo.flattenedIndex = -1;
            // Actualizar UI para quitar resaltado
            updatePlaylistsUI();
         }
    }
}
// --- Renderizar/Actualizar UI de Playlists con Pestañas ---
export function updatePlaylistsUI() {
const playlistContainer = document.getElementById('playlistContainer');
    if (!playlistContainer) return;
    const currentScrollTop = playlistContainer.scrollTop; // Guardar posición scroll
    playlistContainer.innerHTML = ''; // Limpiar contenedor principal

    // Obtener info del video sonando para resaltarlo
     const playingVideoId = currentPlayingInfo.videoId;

    if (playlistsData.length === 0) {
         // Opcional: Mostrar mensaje si no hay playlists
         playlistContainer.innerHTML = '<p style="padding: 10px; color: #888; text-align: center;">Añade playlists o videos.</p>';
         return;
    }

    playlistsData.forEach((playlist) => {
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
        headerDiv.addEventListener('click', () => togglePlaylistExpansion(playlist.id));
        groupDiv.appendChild(headerDiv);

        const videosDiv = document.createElement('div');
        videosDiv.className = 'playlist-group-videos';
        // Aplicar max-height inicial para animación CSS (el CSS debe ocultarlo si no tiene 'expanded')
         if (playlist.isExpanded) {
              // Calcular altura después de añadir items, o poner un valor grande inicial
              // videosDiv.style.maxHeight = '1000px'; // Temporal
         } else {
              videosDiv.style.maxHeight = '0px';
         }
        playlist.videos.forEach((video) => {
            // Usar función helper para crear cada item
            const item = createPlaylistItemElement(video, playlist.id, playingVideoId);
            videosDiv.appendChild(item);
        });

        groupDiv.appendChild(videosDiv);
        playlistContainer.appendChild(groupDiv);

         // Ajustar max-height después de añadir contenido si está expandido (para animación)
         if (playlist.isExpanded) {
             // Pequeño delay para asegurar que los elementos estén en el DOM
             // requestAnimationFrame(() => { // O setTimeout(..., 0)
                videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
             // });
         }
    });

    playlistContainer.scrollTop = currentScrollTop; // Restaurar posición scroll

    // Volver a habilitar Drag and Drop (Fase 1 - dentro de la misma lista)
    enableDragAndDrop();
}