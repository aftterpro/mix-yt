// playlistManager.js - Manejo de Playlists
import { PlaylistState, CONFIG } from './config.js';
import { mostrarMensajeFlotante } from './ui.js';
import { UIManager } from './ui.js';
import { Utils } from './utils.js';

export class PlaylistManager {
    // Obtener la lista aplanada para reproducción
    static getFlattenedPlaylist() {
        let flatList = [];
        PlaylistState.playlistsData.forEach(playlist => {
            playlist.videos.forEach(video => {
                flatList.push({ ...video, sourcePlaylistId: playlist.id });
            });
        });
        return flatList;
    }

    // Actualizar índice basado en video actual
    static updateCurrentPlayingIndex() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        let playingVideoId = null;
        let activePlayerNum = null;

        // Determinar qué player está sonando
        try {
            if (window.appState?.player1 && window.appState.player1.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = window.appState.player1.getVideoData()?.video_id;
                activePlayerNum = 1;
            } else if (window.appState?.player2 && window.appState.player2.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = window.appState.player2.getVideoData()?.video_id;
                activePlayerNum = 2;
            }
        } catch (e) {
            console.error("Error getting playing video data:", e);
        }
        
        if (playingVideoId) {
            if (PlaylistState.currentPlayingInfo.videoId !== playingVideoId || PlaylistState.currentPlayingInfo.flattenedIndex < 0) {
                const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
                if (newFlatIndex !== -1) {
                    const currentVideoObject = flatList[newFlatIndex];
                    PlaylistState.currentPlayingInfo.videoId = playingVideoId;
                    PlaylistState.currentPlayingInfo.playlistId = currentVideoObject.sourcePlaylistId;
                    PlaylistState.currentPlayingInfo.flattenedIndex = newFlatIndex;
                    console.log(`Índice aplanado actualizado a: ${newFlatIndex} (Video: ${playingVideoId})`);
                    UIManager.updatePlaylistsUI();
                } else {
                    console.warn(`Video ${playingVideoId} sonando, pero no encontrado en la lista aplanada actualizada.`);
                    PlaylistState.currentPlayingInfo.flattenedIndex = -1;
                }
            }

            if (activePlayerNum && window.appState?.currentPlayer !== activePlayerNum) {
                console.log(`Sincronizando currentPlayer a ${activePlayerNum}`);
                window.appState.currentPlayer = activePlayerNum;
            }
        } else {
            if (PlaylistState.currentPlayingInfo.flattenedIndex !== -1) {
                console.log("Reproducción detenida o sin iniciar, reseteando índice aplanado.");
                PlaylistState.currentPlayingInfo.videoId = null;
                PlaylistState.currentPlayingInfo.playlistId = null;
                PlaylistState.currentPlayingInfo.flattenedIndex = -1;
                UIManager.updatePlaylistsUI();
            }
        }
    }

    // Manejar carga de Playlist desde URL
    static async handlePlaylistLoaded(playlistInfo) {
        console.log('Datos de playlist recibidos:', playlistInfo);

        if (!playlistInfo || !playlistInfo.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
            const failedPlaylistId = playlistInfo?.id || playlistInfo?.url?.split('list=')[1] || 'desconocida';
            mostrarMensajeFlotante(`No se encontraron videos válidos en la playlist ${failedPlaylistId}.`);
            console.error("Respuesta inválida de getPlaylistInfo:", playlistInfo);
            return;
        }

        const playlistId = playlistInfo.id || playlistInfo.url?.split('list=')[1] || `playlist_${Date.now()}`;

        if (PlaylistState.playlistsData.some(p => p.id === playlistId)) {
            mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" ya está cargada.`);
            return;
        }

        const loadedVideos = playlistInfo.relatedStreams.map(video => ({
            videoId: video.url?.split('v=')[1],
            title: video.title || "Título Desconocido",
            thumbnail: video.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
            duration: Utils.parseDuration(video.duration) || 0,
        })).filter(v => v.videoId);

        if (loadedVideos.length === 0) {
            mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" no contiene videos válidos.`);
            return;
        }

        const newPlaylist = {
            id: playlistId,
            name: playlistInfo.name || "Playlist Sin Nombre",
            thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || 'https://via.placeholder.com/50?text=?',
            videos: loadedVideos,
            isExpanded: true
        };

        // Lógica de ordenamiento
        const manualPlaylistIndex = PlaylistState.playlistsData.findIndex(p => p.id === 'manual');
        if (manualPlaylistIndex !== -1) {
            PlaylistState.playlistsData.splice(manualPlaylistIndex + 1, 0, newPlaylist);
        } else {
            PlaylistState.playlistsData.push(newPlaylist);
        }

        mostrarMensajeFlotante(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos).`);
        UIManager.updatePlaylistsUI();
        PlaylistManager.checkAndEnablePlayButton();
    }

    // Añadir video a playlist manual
    static addVideoToManualPlaylist(videoData) {
        const manualPlaylistId = 'manual';
        let manualPlaylist = PlaylistState.playlistsData.find(p => p.id === manualPlaylistId);

        if (!manualPlaylist) {
            manualPlaylist = {
                id: manualPlaylistId,
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: 'https://via.placeholder.com/50?text=+',
                videos: [],
                isExpanded: true
            };
            PlaylistState.playlistsData.unshift(manualPlaylist);
            console.log("Playlist 'manual' creada y añadida al inicio.");
        }

        const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
        if (isDuplicate) {
            mostrarMensajeFlotante(`"${videoData.title}" ya está en "${manualPlaylist.name}".`);
            return;
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
            duration: videoData.duration || 0,
        };

        manualPlaylist.videos.push(videoObject);
        console.log(`Video añadido a playlist '${manualPlaylistId}': ${videoObject.title}`);
        
        UIManager.updatePlaylistsUI();
        PlaylistManager.checkAndEnablePlayButton();
    }

    // Añadir video a playlist específica
    static addVideoToSpecificPlaylist(videoData, targetPlaylistId) {
        const targetPlaylist = PlaylistState.playlistsData.find(p => p.id === targetPlaylistId);
        if (!targetPlaylist) {
            console.error(`Error: Playlist destino ${targetPlaylistId} no encontrada.`);
            mostrarMensajeFlotante("Error: No se encontró la playlist destino.");
            return;
        }

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

        let targetIndex = targetPlaylist.videos.length;

        if (PlaylistState.currentPlayingInfo.playlistId === targetPlaylistId && PlaylistState.currentPlayingInfo.flattenedIndex >= 0) {
            const currentVideoLocalIndex = targetPlaylist.videos.findIndex(v => v.videoId === PlaylistState.currentPlayingInfo.videoId);
            if (currentVideoLocalIndex !== -1) {
                targetIndex = currentVideoLocalIndex + 1;
                console.log(`Insertando después del video actual (índice local ${currentVideoLocalIndex}) en ${targetPlaylistId}.`);
            }
        }

        targetPlaylist.videos.splice(targetIndex, 0, videoObject);
        mostrarMensajeFlotante(`Video añadido a "${targetPlaylist.name}": ${videoObject.title}`);
        
        UIManager.updatePlaylistsUI();
        PlaylistManager.updateCurrentPlayingIndex();
        PlaylistManager.checkAndEnablePlayButton();
    }

    // Eliminar video de playlist
    static deleteVideo(playlistId, videoId) {
        const playlistIndex = PlaylistState.playlistsData.findIndex(p => p.id === playlistId);
        if (playlistIndex === -1) return;

        const videoIndex = PlaylistState.playlistsData[playlistIndex].videos.findIndex(v => v.videoId === videoId);
        if (videoIndex === -1) return;

        const deletedVideoTitle = PlaylistState.playlistsData[playlistIndex].videos[videoIndex].title;
        PlaylistState.playlistsData[playlistIndex].videos.splice(videoIndex, 1);
        
        if (PlaylistState.playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
            PlaylistState.playlistsData.splice(playlistIndex, 1);
        }

        UIManager.updateSinglePlaylistUI(playlistId);
        PlaylistManager.updateCurrentPlayingIndex();
    }

    // Mover video entre playlists
    static moveVideo(videoId, sourcePlaylistId, targetPlaylistId, targetIndex) {
        if (!videoId || !sourcePlaylistId || !targetPlaylistId) {
            console.error("moveVideo: Argumentos inválidos.");
            return;
        }

        const sourcePlaylistIndex = PlaylistState.playlistsData.findIndex(p => p.id === sourcePlaylistId);
        if (sourcePlaylistIndex === -1) {
            console.error(`moveVideo: Playlist origen ${sourcePlaylistId} no encontrada.`);
            return;
        }
        const sourcePlaylist = PlaylistState.playlistsData[sourcePlaylistIndex];

        const videoIndexInSource = sourcePlaylist.videos.findIndex(v => v.videoId === videoId);
        if (videoIndexInSource === -1) {
            console.error(`moveVideo: Video ${videoId} no encontrado en playlist origen ${sourcePlaylistId}.`);
            return;
        }

        const targetPlaylistIndex = PlaylistState.playlistsData.findIndex(p => p.id === targetPlaylistId);
        if (targetPlaylistIndex === -1) {
            console.error(`moveVideo: Playlist destino ${targetPlaylistId} no encontrada.`);
            return;
        }
        const targetPlaylist = PlaylistState.playlistsData[targetPlaylistIndex];

        // Quitar el video de la playlist origen
        const [movedVideoData] = sourcePlaylist.videos.splice(videoIndexInSource, 1);

        // Asegurar que targetIndex esté dentro de los límites
        targetIndex = Math.max(0, Math.min(targetIndex, targetPlaylist.videos.length));

        // Insertar el video en la playlist destino
        targetPlaylist.videos.splice(targetIndex, 0, movedVideoData);

        console.log(`Video ${videoId} movido de ${sourcePlaylistId} a ${targetPlaylistId} en índice ${targetIndex}.`);

        if (sourcePlaylistId === targetPlaylistId) {
            UIManager.updateSinglePlaylistUI(sourcePlaylistId);
        } else {
            UIManager.updateSinglePlaylistUI(sourcePlaylistId);
            UIManager.updateSinglePlaylistUI(targetPlaylistId);
        }

        PlaylistManager.updateCurrentPlayingIndex();
    }

    // Habilitar botón Play si hay videos
    static checkAndEnablePlayButton() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        if (flatList.length > 0 && window.appState?.playersInitialized) {
            document.getElementById('botonPlay').disabled = false;
        }
    }

    // Procesar playlists de la biblioteca de YouTube
    static addYouTubeLibraryPlaylists(youtubePlaylists) {
        if (!youtubePlaylists || youtubePlaylists.length === 0) {
            mostrarMensajeFlotante("No se encontraron playlists en tu biblioteca de YouTube.");
            return;
        }

        const formattedPlaylists = youtubePlaylists.map(playlist => {
            if (!playlist.snippet.title || playlist.contentDetails.itemCount === 0) {
                return null;
            }
            return {
                id: playlist.id,
                name: playlist.snippet.title,
                thumbnailUrl: playlist.snippet.thumbnails.high?.url || playlist.snippet.thumbnails.default.url,
                videos: [],
                isExpanded: false,
                source: CONFIG.YOUTUBE_LIBRARY_SOURCE_ID,
                isLoaded: false,
            };
        }).filter(p => p !== null);

        PlaylistState.playlistsData.unshift(...formattedPlaylists);
        
        mostrarMensajeFlotante(`${formattedPlaylists.length} playlists de tu biblioteca han sido añadidas.`);
        UIManager.updatePlaylistsUI();
    }

    // Eliminar playlists de la biblioteca de YouTube
    static clearYouTubeLibraryPlaylists() {
        const initialCount = PlaylistState.playlistsData.length;
        PlaylistState.playlistsData = PlaylistState.playlistsData.filter(p => p.source !== CONFIG.YOUTUBE_LIBRARY_SOURCE_ID);
        const removedCount = initialCount - PlaylistState.playlistsData.length;
        
        if (removedCount > 0) {
            console.log(`Se eliminaron ${removedCount} playlists de la biblioteca de YouTube.`);
            UIManager.updatePlaylistsUI();
        }
    }

    // Alternar expansión de playlist
    static togglePlaylistExpansion(playlistId) {
        const playlist = PlaylistState.playlistsData.find(p => p.id === playlistId);
        if (!playlist) return;

        // Lógica para carga bajo demanda de playlists de YouTube
        if (playlist.source === CONFIG.YOUTUBE_LIBRARY_SOURCE_ID && !playlist.isLoaded) {
            console.log(`Cargando videos de la biblioteca para: ${playlist.name}`);
            mostrarMensajeFlotante(`Cargando "${playlist.name}"...`);
            
            // Aquí llamarías a la función de carga de videos desde la biblioteca
            // Por ahora solo simularemos el comportamiento
            setTimeout(() => {
                playlist.isLoaded = true;
                playlist.isExpanded = true;
                UIManager.updatePlaylistsUI();
                PlaylistManager.checkAndEnablePlayButton();
            }, 1000);
            
            return;
        }

        playlist.isExpanded = !playlist.isExpanded;
        UIManager.updatePlaylistsUI();
    }
}
