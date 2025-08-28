// ===== 1. PLAYLISTMANAGER.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// playlistManager.js - Versión adaptada al sistema unificado

export class PlaylistManager {
    
    // ✅ Usar estado unificado en lugar de imports duplicados
    static getFlattenedPlaylist() {
        const playlistsData = window.unifiedStateManager?.state?.playlist?.playlistsData || [];
        let flatList = [];
        
        playlistsData.forEach(playlist => {
            if (playlist.videos && Array.isArray(playlist.videos)) {
                playlist.videos.forEach(video => {
                    flatList.push({ 
                        ...video, 
                        sourcePlaylistId: playlist.id 
                    });
                });
            }
        });
        
        return flatList;
    }

    static updateCurrentPlayingIndex() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        let playingVideoId = null;
        let activePlayerNum = null;

        // ✅ Usar estado unificado
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        try {
            if (state.app.player1 && state.app.player1.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = state.app.player1.getVideoData()?.video_id;
                activePlayerNum = 1;
            } else if (state.app.player2 && state.app.player2.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = state.app.player2.getVideoData()?.video_id;
                activePlayerNum = 2;
            }
        } catch (e) {
            console.error("Error getting playing video data:", e);
        }
        
        if (playingVideoId) {
            const currentInfo = state.playlist.currentPlayingInfo;
            if (currentInfo.videoId !== playingVideoId || currentInfo.flattenedIndex < 0) {
                const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
                if (newFlatIndex !== -1) {
                    const currentVideoObject = flatList[newFlatIndex];
                    
                    // ✅ Usar setState unificado
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', playingVideoId);
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', currentVideoObject.sourcePlaylistId);
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', newFlatIndex);
                    
                    console.log(`Índice aplanado actualizado a: ${newFlatIndex} (Video: ${playingVideoId})`);
                    
                    // ✅ Usar UI unificada
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                }
            }

            if (activePlayerNum && state.app.currentPlayer !== activePlayerNum) {
                console.log(`Sincronizando currentPlayer a ${activePlayerNum}`);
                window.unifiedStateManager.set('app.currentPlayer', activePlayerNum);
            }
        } else {
            const currentInfo = state.playlist.currentPlayingInfo;
            if (currentInfo.flattenedIndex !== -1) {
                console.log("Reproducción detenida, reseteando índice.");
                window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
                
                if (window.UIManager?.updatePlaylistsUI) {
                    window.UIManager.updatePlaylistsUI();
                }
            }
        }
    }

    static async handlePlaylistLoaded(playlistInfo) {
        console.log('Datos de playlist recibidos:', playlistInfo);

        if (!playlistInfo || !playlistInfo.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
            const failedPlaylistId = playlistInfo?.id || 'desconocida';
            // ✅ Usar sistema de mensajes unificado
            window.unifiedMessageManager?.show(`No se encontraron videos válidos en la playlist ${failedPlaylistId}.`, 'error');
            console.error("Respuesta inválida de getPlaylistInfo:", playlistInfo);
            return;
        }

        const playlistId = playlistInfo.id || `playlist_${Date.now()}`;
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        if (state.playlist.playlistsData.some(p => p.id === playlistId)) {
            window.unifiedMessageManager?.show(`La playlist "${playlistInfo.name || playlistId}" ya está cargada.`, 'warning');
            return;
        }

        const loadedVideos = playlistInfo.relatedStreams.map(video => ({
            videoId: video.url?.split('v=')[1],
            title: video.title || "Título Desconocido",
            thumbnail: video.thumbnail || '',
            duration: PlaylistManager.parseDuration(video.duration) || 0,
        })).filter(v => v.videoId);

        if (loadedVideos.length === 0) {
            window.unifiedMessageManager?.show(`La playlist "${playlistInfo.name || playlistId}" no contiene videos válidos.`, 'warning');
            return;
        }

        const newPlaylist = {
            id: playlistId,
            name: playlistInfo.name || "Playlist Sin Nombre",
            thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || '',
            videos: loadedVideos,
            isExpanded: true
        };

        // ✅ Usar estado unificado
        const playlistsData = [...state.playlist.playlistsData];
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        if (manualIndex !== -1) {
            playlistsData.splice(manualIndex + 1, 0, newPlaylist);
        } else {
            playlistsData.push(newPlaylist);
        }
        
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);

        window.unifiedMessageManager?.show(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos).`, 'success');
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
        PlaylistManager.checkAndEnablePlayButton();
    }

    static addVideoToManualPlaylist(videoData) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const playlistsData = [...state.playlist.playlistsData];
        let manualPlaylist = playlistsData.find(p => p.id === 'manual');

        if (!manualPlaylist) {
            manualPlaylist = {
                id: 'manual',
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: '/electronic.ico',
                videos: [],
                isExpanded: true
            };
            playlistsData.unshift(manualPlaylist);
            console.log("Playlist 'manual' creada y añadida al inicio.");
        }

        const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
        if (isDuplicate) {
            window.unifiedMessageManager?.show(`"${videoData.title}" ya está en "${manualPlaylist.name}".`, 'warning');
            return;
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || '',
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || 'Desconocido'
        };

        manualPlaylist.videos.push(videoObject);
        console.log(`Video añadido a playlist 'manual': ${videoObject.title}`);
        
        // ✅ Actualizar estado unificado
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
        PlaylistManager.checkAndEnablePlayButton();

        return videoObject;
    }

    static deleteVideo(playlistId, videoId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return false;

        const playlistsData = [...state.playlist.playlistsData];
        const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
        if (playlistIndex === -1) return false;

        const videoIndex = playlistsData[playlistIndex].videos.findIndex(v => v.videoId === videoId);
        if (videoIndex === -1) return false;

        const deletedVideo = playlistsData[playlistIndex].videos[videoIndex];
        playlistsData[playlistIndex].videos.splice(videoIndex, 1);
        
        if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
            playlistsData.splice(playlistIndex, 1);
        }

        // ✅ Actualizar estado unificado
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);

        console.log(`Video eliminado: ${deletedVideo.title}`);
        window.unifiedMessageManager?.show('Video eliminado', 'success', 2000);
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
        PlaylistManager.updateCurrentPlayingIndex();

        return true;
    }

    static checkAndEnablePlayButton() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        const playersReady = window.unifiedStateManager?.state?.app?.playersInitialized;
        
        if (flatList.length > 0 && playersReady) {
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.disabled = false;
            }
            console.log('✅ Botón Play habilitado');
        }
    }

    static async togglePlaylistExpansion(playlistId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const playlist = state.playlist.playlistsData.find(p => p.id === playlistId);
        if (!playlist) return;

        // Lógica para YouTube Library
        if (playlist.source === 'youtube_library' && !playlist.isLoaded && !playlist.isExpanded) {
            console.log(`Cargando videos de YouTube para: ${playlist.name}`);
            window.unifiedMessageManager?.show(`Cargando "${playlist.name}"...`, 'info');
            
            try {
                const { authManager } = await import('./auth.js');
                
                if (!authManager.isUserAuthenticated()) {
                    window.unifiedMessageManager?.show("Error: No hay sesión de Google activa.", 'error');
                    return;
                }

                const videos = await authManager.getPlaylistVideos(playlist.id);
                
                if (videos && videos.length > 0) {
                    playlist.videos = videos;
                    playlist.isLoaded = true;
                    playlist.isExpanded = true;
                    
                    // ✅ Actualizar estado unificado
                    const playlistsData = [...state.playlist.playlistsData];
                    const index = playlistsData.findIndex(p => p.id === playlistId);
                    if (index !== -1) {
                        playlistsData[index] = playlist;
                        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
                    }
                    
                    console.log(`Cargados ${videos.length} videos para "${playlist.name}"`);
                    window.unifiedMessageManager?.show(`"${playlist.name}" cargada (${videos.length} videos).`, 'success');
                    
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                    PlaylistManager.checkAndEnablePlayButton();
                } else {
                    window.unifiedMessageManager?.show(`No se pudieron cargar los videos de "${playlist.name}".`, 'error');
                }
                
            } catch (error) {
                console.error(`Error cargando playlist ${playlist.name}:`, error);
                window.unifiedMessageManager?.show(`Error cargando "${playlist.name}". Intenta de nuevo.`, 'error');
            }
            
            return;
        }

        // Toggle normal
        playlist.isExpanded = !playlist.isExpanded;
        
        // ✅ Actualizar estado unificado
        const playlistsData = [...state.playlist.playlistsData];
        const index = playlistsData.findIndex(p => p.id === playlistId);
        if (index !== -1) {
            playlistsData[index] = playlist;
            window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
        }
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
    }

    // ✅ Utility method moved here from Utils
    static parseDuration(durationInput) {
        if (typeof durationInput === 'number') {
            return Math.floor(durationInput);
        }
        if (typeof durationInput !== 'string') return 0;

        // PT0H0M0S format
        const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (isoMatch) {
            const hours = parseInt(isoMatch[1] || '0', 10);
            const minutes = parseInt(isoMatch[2] || '0', 10);
            const seconds = parseFloat(isoMatch[3] || '0');
            return Math.floor(hours * 3600 + minutes * 60 + seconds);
        }

        // MM:SS or HH:MM:SS format
        const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
        if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
            return timeParts[0] * 60 + timeParts[1];
        } else if (timeParts.length === 3 && !isNaN(timeParts[0]) && !isNaN(timeParts[1]) && !isNaN(timeParts[2])) {
            return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        }

        const directNumber = parseInt(durationInput, 10);
        if (!isNaN(directNumber)) {
            return directNumber;
        }

        return 0;
    }
}
