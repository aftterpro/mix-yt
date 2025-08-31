// ===== PLAYLISTMANAGER.JS - CORREGIDO E INTEGRADO =====
// Versión que delega funciones principales al core y mantiene funciones específicas de UI

export class PlaylistManager {
    
    // ✅ DELEGACIÓN PRINCIPAL AL CORE UNIFICADO
    static initializeManualPlaylist() {
        if (window.unifiedCore?.playlistManager?.initialize) {
            return window.unifiedCore.playlistManager.initialize();
        } else {
            console.warn('⚠️ Core unificado no disponible, inicializando playlist manual básica');
            return PlaylistManager.fallbackInitializeManual();
        }
    }

    static getFlattenedPlaylist() {
        if (window.unifiedCore?.playlistManager?.getFlattenedPlaylist) {
            return window.unifiedCore.playlistManager.getFlattenedPlaylist();
        } else {
            console.warn('⚠️ Core unificado no disponible, usando fallback para lista plana');
            return PlaylistManager.fallbackGetFlattenedPlaylist();
        }
    }

    static addVideoToManualPlaylist(videoData) {
        if (window.unifiedCore?.playlistManager?.addVideoToManualPlaylist) {
            return window.unifiedCore.playlistManager.addVideoToManualPlaylist(videoData);
        } else {
            console.warn('⚠️ Core unificado no disponible, usando fallback para añadir video');
            return PlaylistManager.fallbackAddVideoToManual(videoData);
        }
    }

    static updateCurrentPlayingIndex() {
        if (window.unifiedCore?.playlistManager?.updateCurrentPlayingIndex) {
            return window.unifiedCore.playlistManager.updateCurrentPlayingIndex();
        } else {
            console.warn('⚠️ Core unificado no disponible, usando fallback para actualizar índice');
            return PlaylistManager.fallbackUpdateCurrentIndex();
        }
    }

    // ✅ FALLBACKS PARA COMPATIBILIDAD
    static fallbackInitializeManual() {
        const state = window.unifiedStateManager?.state;
        if (!state) {
            console.error('❌ Estado unificado no disponible');
            return;
        }
        
        const playlistsData = state.playlist.playlistsData || [];
        const existingManual = playlistsData.find(p => p.id === 'manual');
        
        if (!existingManual) {
            const manualPlaylist = {
                id: 'manual',
                name: 'Cola de Reproducción',
                thumbnailUrl: '/electronic.ico',
                videos: [],
                isExpanded: false,
                source: 'manual',
                isLoaded: true,
                itemCount: 0
            };
            
            const updatedPlaylists = [manualPlaylist, ...playlistsData];
            window.unifiedStateManager.set('playlist.playlistsData', updatedPlaylists);
            console.log('✅ Cola de reproducción inicializada (fallback)');
        }
    }

    static fallbackGetFlattenedPlaylist() {
        const state = window.unifiedStateManager?.state;
        if (!state) return [];
        
        const playlistsData = state.playlist.playlistsData || [];
        let flatList = [];
        
        // Solo incluir playlist manual para reproducción
        const manualPlaylist = playlistsData.find(p => p.id === 'manual');
        
        if (manualPlaylist && manualPlaylist.videos && Array.isArray(manualPlaylist.videos)) {
            manualPlaylist.videos.forEach(video => {
                flatList.push({ 
                    ...video, 
                    sourcePlaylistId: 'manual'
                });
            });
        }
        
        return flatList;
    }

    static fallbackAddVideoToManual(videoData) {
        const state = window.unifiedStateManager?.state;
        if (!state) return null;

        const playlistsData = [...state.playlist.playlistsData];
        let manualPlaylist = playlistsData.find(p => p.id === 'manual');

        if (!manualPlaylist) {
            PlaylistManager.fallbackInitializeManual();
            const updatedState = window.unifiedStateManager.state.playlist.playlistsData;
            manualPlaylist = updatedState.find(p => p.id === 'manual');
        }

        if (!manualPlaylist) {
            console.error('❌ No se pudo crear cola de reproducción');
            return null;
        }

        // Verificar duplicados
        const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
        if (isDuplicate) {
            console.log('⚠️ Video ya está en la cola:', videoData.title);
            window.unifiedMessageManager?.show(`"${videoData.title}" ya está en la cola`, 'warning');
            return null;
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || `https://img.youtube.com/vi/${videoData.videoId}/default.jpg`,
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || 'Desconocido',
            addedAt: Date.now()
        };

        // Actualizar playlist
        const updatedPlaylistsData = [...state.playlist.playlistsData];
        const manualIndex = updatedPlaylistsData.findIndex(p => p.id === 'manual');
        
        if (manualIndex !== -1) {
            updatedPlaylistsData[manualIndex] = {
                ...updatedPlaylistsData[manualIndex],
                videos: [...updatedPlaylistsData[manualIndex].videos, videoObject],
                itemCount: updatedPlaylistsData[manualIndex].videos.length + 1
            };
            
            window.unifiedStateManager.set('playlist.playlistsData', updatedPlaylistsData);
            console.log(`✅ Video añadido (fallback): "${videoObject.title}"`);
            
            // Habilitar botón play si es necesario
            PlaylistManager.checkAndEnablePlayButton();
            
            return videoObject;
        }

        return null;
    }

    static fallbackUpdateCurrentIndex() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        let playingVideoId = null;
        let activePlayerNum = null;

        try {
            if (state.app.player1 && state.app.player1.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = state.app.player1.getVideoData()?.video_id;
                activePlayerNum = 1;
            } else if (state.app.player2 && state.app.player2.getPlayerState() === YT.PlayerState.PLAYING) {
                playingVideoId = state.app.player2.getVideoData()?.video_id;
                activePlayerNum = 2;
            }
        } catch (e) {
            console.error("Error obteniendo datos de video:", e);
        }
        
        if (playingVideoId) {
            const currentInfo = state.playlist.currentPlayingInfo;
            if (currentInfo.videoId !== playingVideoId || currentInfo.flattenedIndex < 0) {
                const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
                if (newFlatIndex !== -1) {
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', playingVideoId);
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', 'manual');
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', newFlatIndex);
                    
                    console.log(`🎵 Índice actualizado (fallback): ${newFlatIndex}`);
                    
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                }
            }

            if (activePlayerNum && state.app.currentPlayer !== activePlayerNum) {
                window.unifiedStateManager.set('app.currentPlayer', activePlayerNum);
            }
        } else {
            const currentInfo = state.playlist.currentPlayingInfo;
            if (currentInfo.flattenedIndex !== -1) {
                window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
                
                if (window.UIManager?.updatePlaylistsUI) {
                    window.UIManager.updatePlaylistsUI();
                }
            }
        }
    }

    // ✅ FUNCIONES ESPECÍFICAS DE UI Y LÓGICA COMPLEJA (mantener independientes)
    
    // ✅ Del backup: Toggle expansion mejorado con carga bajo demanda
    static async togglePlaylistExpansion(playlistId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const playlistsData = [...state.playlist.playlistsData];
        const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
        
        if (playlistIndex === -1) {
            console.warn('⚠️ Playlist no encontrada para expansion:', playlistId);
            return;
        }

        const playlist = playlistsData[playlistIndex];

        // ✅ Del backup: Lógica para YouTube Library con carga bajo demanda
        if (playlist.source === 'youtube_library' && !playlist.isLoaded && !playlist.isExpanded) {
            console.log(`📡 Cargando videos de YouTube Library: ${playlist.name}`);
            
            window.unifiedMessageManager?.show(`Cargando "${playlist.name}"...`, 'info');
            
            try {
                const { authManager } = await import('./auth.js');
                
                if (!authManager.isUserAuthenticated()) {
                    window.unifiedMessageManager?.show("Error: No hay sesión de Google activa.", 'error');
                    return;
                }

                const videos = await authManager.getPlaylistVideos(playlist.id);
                
                if (videos && videos.length > 0) {
                    // Actualizar playlist con videos cargados
                    playlistsData[playlistIndex] = {
                        ...playlist,
                        videos: videos,
                        isLoaded: true,
                        isExpanded: true,
                        itemCount: videos.length
                    };
                    
                    window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
                    
                    console.log(`✅ ${videos.length} videos cargados para "${playlist.name}"`);
                    window.unifiedMessageManager?.show(`"${playlist.name}" cargada (${videos.length} videos).`, 'success');
                    
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                    PlaylistManager.checkAndEnablePlayButton();
                } else {
                    window.unifiedMessageManager?.show(`No se pudieron cargar los videos de "${playlist.name}".`, 'error');
                }
                
            } catch (error) {
                console.error(`❌ Error cargando playlist ${playlist.name}:`, error);
                window.unifiedMessageManager?.show(`Error cargando "${playlist.name}". Intenta de nuevo.`, 'error');
            }
            
            return;
        }

        // Toggle normal de expansion
        playlistsData[playlistIndex] = {
            ...playlist,
            isExpanded: !playlist.isExpanded
        };
        
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
        
        console.log(`🔄 Playlist "${playlist.name}" ${playlist.isExpanded ? 'contraída' : 'expandida'}`);
        
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
    }

    // ✅ Del backup: Eliminar video con gestión de estado mejorada
    static deleteVideo(playlistId, videoId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return false;

        const playlistsData = [...state.playlist.playlistsData];
        const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
        if (playlistIndex === -1) {
            console.warn('⚠️ Playlist no encontrada:', playlistId);
            return false;
        }

        const playlist = playlistsData[playlistIndex];
        if (!playlist.videos) {
            console.warn('⚠️ Playlist sin videos:', playlistId);
            return false;
        }

        const videoIndex = playlist.videos.findIndex(v => v.videoId === videoId);
        if (videoIndex === -1) {
            console.warn('⚠️ Video no encontrado en playlist:', videoId);
            return false;
        }

        const deletedVideo = playlist.videos[videoIndex];
        
        // Eliminar video
        playlistsData[playlistIndex] = {
            ...playlist,
            videos: playlist.videos.filter(v => v.videoId !== videoId),
            itemCount: playlist.videos.length - 1
        };
        
        // Si la playlist queda vacía y no es manual, eliminar playlist completa
        if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
            playlistsData.splice(playlistIndex, 1);
            console.log(`🗑️ Playlist "${playlist.name}" eliminada por quedar vacía`);
        }

        // Actualizar estado
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);

        console.log(`🗑️ Video eliminado: "${deletedVideo.title}" de "${playlist.name}"`);
        
        // Si se eliminó de la cola, verificar reproducción actual
        if (playlistId === 'manual') {
            const currentInfo = state.playlist.currentPlayingInfo;
            if (currentInfo.videoId === videoId) {
                console.log('⏹️ Video en reproducción eliminado, pasando al siguiente...');
                
                setTimeout(() => {
                    if (window.PlaybackController?.playNextVideo) {
                        window.PlaybackController.playNextVideo();
                    }
                }, 500);
            }
        }
        
        // Actualizar UI
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
        
        // Actualizar índices de reproducción
        PlaylistManager.updateCurrentPlayingIndex();

        return true;
    }

    // ✅ NUEVO: Procesar playlists de YouTube Library
    static addYouTubeLibraryPlaylists(youtubePlaylists) {
        if (!youtubePlaylists || youtubePlaylists.length === 0) {
            window.unifiedMessageManager?.show("No se encontraron playlists en tu biblioteca de YouTube.", 'info');
            return;
        }

        const state = window.unifiedStateManager?.state;
        if (!state) return;

        // ✅ Del backup: Transformar datos de la API al formato de la app
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
                source: 'youtube_library',
                isLoaded: false,
                itemCount: playlist.contentDetails.itemCount || 0,
                originalData: playlist
            };
        }).filter(p => p !== null);

        // Combinar con playlists existentes
        const currentPlaylists = [...state.playlist.playlistsData];
        const manualPlaylist = currentPlaylists.find(p => p.id === 'manual');
        const otherPlaylists = currentPlaylists.filter(p => p.id !== 'manual');
        
        // Filtrar duplicados por ID
        const newPlaylists = formattedPlaylists.filter(newPl => 
            !otherPlaylists.some(existing => existing.id === newPl.id)
        );
        
        const finalPlaylists = [
            ...(manualPlaylist ? [manualPlaylist] : []),
            ...otherPlaylists,
            ...newPlaylists
        ];
        
        window.unifiedStateManager.set('playlist.playlistsData', finalPlaylists);
        
        console.log(`✅ ${newPlaylists.length} nuevas playlists de YouTube Library añadidas`);
        window.unifiedMessageManager?.show(`${newPlaylists.length} playlists de tu biblioteca añadidas.`, 'success');
        
        // Actualizar UI
        if (window.UIManager?.updatePlaylistsUI) {
            setTimeout(() => {
                window.UIManager.updatePlaylistsUI();
            }, 300);
        }
        
        return newPlaylists.length;
    }

    // ✅ Del backup: Limpiar playlists de YouTube Library
    static clearYouTubeLibraryPlaylists() {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const initialCount = state.playlist.playlistsData.length;
        const filteredPlaylists = state.playlist.playlistsData.filter(p => p.source !== 'youtube_library');
        const removedCount = initialCount - filteredPlaylists.length;
        
        if (removedCount > 0) {
            window.unifiedStateManager.set('playlist.playlistsData', filteredPlaylists);
            console.log(`🗑️ ${removedCount} playlists de YouTube Library eliminadas`);
            
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }
        }
    }

    // ✅ Del backup: Manejar carga de playlist externa mejorada
    static async handlePlaylistLoaded(playlistInfo) {
        console.log('📥 Procesando playlist cargada:', playlistInfo.name || playlistInfo.id);

        if (!playlistInfo || !playlistInfo.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
            const failedPlaylistId = playlistInfo?.id || 'desconocida';
            window.unifiedMessageManager?.show(`No se encontraron videos válidos en la playlist ${failedPlaylistId}.`, 'error');
            console.error("❌ Respuesta inválida de getPlaylistInfo:", playlistInfo);
            return;
        }

        const playlistId = playlistInfo.id || `playlist_${Date.now()}`;
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        // Verificar si ya existe
        if (state.playlist.playlistsData.some(p => p.id === playlistId)) {
            window.unifiedMessageManager?.show(`La playlist "${playlistInfo.name || playlistId}" ya está cargada.`, 'warning');
            return;
        }

        // ✅ Del backup: Procesar videos con filtrado robusto
        const loadedVideos = playlistInfo.relatedStreams
            .filter(video => video.title && video.title !== 'Private video' && video.title !== 'Deleted video')
            .map(video => ({
                videoId: video.url?.split('v=')[1] || video.url?.split('/').pop(),
                title: video.title || "Título Desconocido",
                thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.url?.split('v=')[1]}/default.jpg`,
                duration: PlaylistManager.parseDuration(video.duration) || 0,
                channelTitle: video.uploaderName || 'Desconocido',
                uploaderUrl: video.uploaderUrl || ''
            }))
            .filter(v => v.videoId);

        if (loadedVideos.length === 0) {
            window.unifiedMessageManager?.show(`La playlist "${playlistInfo.name || playlistId}" no contiene videos válidos.`, 'warning');
            return;
        }

        // Crear nueva playlist
        const newPlaylist = {
            id: playlistId,
            name: playlistInfo.name || "Playlist Sin Nombre",
            thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || '',
            videos: loadedVideos,
            isExpanded: false,
            source: 'external',
            isLoaded: true,
            itemCount: loadedVideos.length,
            loadedAt: Date.now()
        };

        // ✅ Del backup: Lógica de ordenamiento
        const playlistsData = [...state.playlist.playlistsData];
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        if (manualIndex !== -1) {
            playlistsData.splice(manualIndex + 1, 0, newPlaylist);
        } else {
            playlistsData.push(newPlaylist);
        }
        
        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);

        console.log(`✅ Playlist "${newPlaylist.name}" añadida con ${loadedVideos.length} videos`);
        window.unifiedMessageManager?.show(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos).`, 'success');
        
        // Actualizar UI
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
        
        PlaylistManager.checkAndEnablePlayButton();
    }

    // ✅ UTILIDADES Y FUNCIONES DE ESTADO
    
    static checkAndEnablePlayButton() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        const playersReady = window.unifiedStateManager?.state?.app?.playersInitialized;
        
        const playButton = document.getElementById('botonPlay');
        const nextButton = document.getElementById('botonNext');
        const prevButton = document.getElementById('prevButton');
        
        if (flatList.length > 0 && playersReady) {
            if (playButton) {
                playButton.disabled = false;
                playButton.title = 'Reproducir cola';
            }
            if (nextButton) {
                nextButton.disabled = false;
            }
            if (prevButton) {
                prevButton.disabled = false;
            }
            console.log(`✅ Botones habilitados - Cola: ${flatList.length} videos`);
        } else {
            if (playButton) {
                playButton.disabled = true;
                playButton.title = flatList.length === 0 ? 'Cola vacía' : 'Reproductores no listos';
            }
            if (nextButton) {
                nextButton.disabled = flatList.length === 0;
            }
            if (prevButton) {
                prevButton.disabled = true;
            }
            console.log(`⏸️ Botones deshabilitados - Cola: ${flatList.length}, Players: ${playersReady}`);
        }
    }

    // ✅ NUEVO: Limpiar cola de reproducción
    static clearQueue() {
        const state = window.unifiedStateManager?.state;
        if (!state) return false;

        const playlistsData = [...state.playlist.playlistsData];
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        
        if (manualIndex !== -1) {
            playlistsData[manualIndex] = {
                ...playlistsData[manualIndex],
                videos: [],
                itemCount: 0
            };
            
            window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
            
            // Reset current playing info
            window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
            window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            
            console.log('🗑️ Cola de reproducción limpiada');
            
            // Detener reproducción si estaba activa
            const appState = state.app;
            if (appState.reproduccionIniciada) {
                try {
                    if (appState.player1) appState.player1.stopVideo();
                    if (appState.player2) appState.player2.stopVideo();
                } catch (e) {
                    console.warn('Error deteniendo reproductores:', e);
                }
                
                window.unifiedStateManager.set('app.reproduccionIniciada', false);
            }
            
            // Actualizar UI
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }
            
            PlaylistManager.checkAndEnablePlayButton();
            
            window.unifiedMessageManager?.show('Cola de reproducción limpiada', 'success', 2000);
            return true;
        }
        
        return false;
    }

    // ✅ NUEVO: Obtener información de la cola
    static getQueueInfo() {
        const state = window.unifiedStateManager?.state;
        if (!state) return null;
        
        const manualPlaylist = state.playlist.playlistsData.find(p => p.id === 'manual');
        
        if (!manualPlaylist) {
            return {
                exists: false,
                count: 0,
                videos: [],
                currentIndex: -1,
                currentVideo: null
            };
        }
        
        const currentInfo = state.playlist.currentPlayingInfo;
        const currentIndex = currentInfo.playlistId === 'manual' ? currentInfo.flattenedIndex : -1;
        const currentVideo = currentIndex >= 0 ? manualPlaylist.videos[currentIndex] : null;
        
        return {
            exists: true,
            count: manualPlaylist.videos?.length || 0,
            videos: manualPlaylist.videos || [],
            currentIndex: currentIndex,
            currentVideo: currentVideo,
            totalDuration: PlaylistManager.calculateTotalDuration(manualPlaylist.videos)
        };
    }

    // ✅ NUEVO: Calcular duración total
    static calculateTotalDuration(videos) {
        if (!videos || !Array.isArray(videos)) return 0;
        
        return videos.reduce((total, video) => {
            return total + (video.duration || 0);
        }, 0);
    }

    // ✅ Del backup: Parsear duración mejorado
    static parseDuration(durationInput) {
        if (typeof durationInput === 'number') {
            return Math.floor(durationInput);
        }
        if (typeof durationInput !== 'string') return 0;

        // PT0H0M0S format (ISO 8601)
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

    // ✅ NUEVO: Mover video dentro de la cola (para drag & drop futuro)
    static moveVideoInQueue(fromIndex, toIndex) {
        const state = window.unifiedStateManager?.state;
        if (!state) return false;

        const playlistsData = [...state.playlist.playlistsData];
        const manualIndex = playlistsData.findIndex(p => p.id === 'manual');
        
        if (manualIndex === -1) return false;

        const manualPlaylist = playlistsData[manualIndex];
        if (!manualPlaylist.videos || fromIndex < 0 || toIndex < 0 || 
            fromIndex >= manualPlaylist.videos.length || toIndex >= manualPlaylist.videos.length) {
            return false;
        }

        // Mover video
        const videos = [...manualPlaylist.videos];
        const [movedVideo] = videos.splice(fromIndex, 1);
        videos.splice(toIndex, 0, movedVideo);

        playlistsData[manualIndex] = {
            ...manualPlaylist,
            videos: videos
        };

        window.unifiedStateManager.set('playlist.playlistsData', playlistsData);

        console.log(`🔄 Video movido de posición ${fromIndex} a ${toIndex} en cola`);

        // Actualizar índice de reproducción si es necesario
        const currentInfo = state.playlist.currentPlayingInfo;
        if (currentInfo.playlistId === 'manual' && currentInfo.flattenedIndex >= 0) {
            if (currentInfo.flattenedIndex === fromIndex) {
                // El video actual fue movido
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', toIndex);
            } else if (fromIndex < currentInfo.flattenedIndex && toIndex >= currentInfo.flattenedIndex) {
                // Video movido de antes a después del actual
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', currentInfo.flattenedIndex - 1);
            } else if (fromIndex > currentInfo.flattenedIndex && toIndex <= currentInfo.flattenedIndex) {
                // Video movido de después a antes del actual
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', currentInfo.flattenedIndex + 1);
            }
        }

        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }

        return true;
    }

    // ✅ MIGRACIÓN Y COMPATIBILIDAD
    static checkCoreAvailability() {
        return {
            coreAvailable: !!window.unifiedCore,
            coreInitialized: window.unifiedCore?.initialized || false,
            playlistManagerAvailable: !!window.unifiedCore?.playlistManager,
            fallbackRequired: !window.unifiedCore?.initialized
        };
    }

    static getDebugInfo() {
        const state = window.unifiedStateManager?.state;
        if (!state) return { error: 'Estado no disponible' };
        
        const queueInfo = PlaylistManager.getQueueInfo();
        const flatList = PlaylistManager.getFlattenedPlaylist();
        const coreCheck = PlaylistManager.checkCoreAvailability();
        
        return {
            timestamp: Date.now(),
            core: coreCheck,
            totalPlaylists: state.playlist.playlistsData.length,
            queue: queueInfo,
            flatListCount: flatList.length,
            currentPlayingInfo: state.playlist.currentPlayingInfo,
            playersReady: state.app.playersInitialized,
            reproductionStarted: state.app.reproduccionIniciada
        };
    }

    // ✅ NUEVO: Obtener playlists por fuente
    static getPlaylistsBySource(source) {
        const state = window.unifiedStateManager?.state;
        if (!state) return [];
        
        return state.playlist.playlistsData.filter(p => p.source === source);
    }

    // ✅ NUEVO: Buscar video en todas las playlists
    static findVideoInPlaylists(videoId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return [];
        
        const found = [];
        state.playlist.playlistsData.forEach(playlist => {
            if (playlist.videos) {
                const videoIndex = playlist.videos.findIndex(v => v.videoId === videoId);
                if (videoIndex !== -1) {
                    found.push({
                        playlist: playlist,
                        video: playlist.videos[videoIndex],
                        index: videoIndex
                    });
                }
            }
        });
        
        return found;
    }
}

// ✅ SETUP AUTOMÁTICO Y EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    // Verificar disponibilidad del core
    const coreCheck = setInterval(() => {
        if (window.unifiedCore?.initialized) {
            console.log('✅ PlaylistManager: Core unificado disponible');
            clearInterval(coreCheck);
            
            // El core ya maneja la inicialización
            console.log('📋 PlaylistManager delegando inicialización al core');
        }
    }, 100);
    
    // Timeout para inicialización fallback
    setTimeout(() => {
        clearInterval(coreCheck);
        if (!window.unifiedCore?.initialized) {
            console.warn('⚠️ PlaylistManager: Timeout esperando core, usando inicialización fallback');
            PlaylistManager.fallbackInitializeManual();
        }
    }, 10000);
});

// ✅ Event listeners para integración con auth.js
document.addEventListener('playlistsFetched', (event) => {
    console.log("📚 Evento 'playlistsFetched' recibido en PlaylistManager");
    const libraryPlaylists = event.detail;
    PlaylistManager.addYouTubeLibraryPlaylists(libraryPlaylists);
});

document.addEventListener('userLoggedOut', () => {
    console.log("👤 Evento 'userLoggedOut' recibido en PlaylistManager");
    PlaylistManager.clearYouTubeLibraryPlaylists();
});

// ✅ REFERENCIAS GLOBALES Y DEBUG
if (typeof window !== 'undefined') {
    window.PlaylistManager = PlaylistManager;
    
    // Debug helpers específicos
    window.PlaylistDebug = {
        getQueue: () => PlaylistManager.getQueueInfo(),
        getFlatList: () => PlaylistManager.getFlattenedPlaylist(),
        clearQueue: () => PlaylistManager.clearQueue(),
        getDebugInfo: () => PlaylistManager.getDebugInfo(),
        initQueue: () => PlaylistManager.initializeManualPlaylist(),
        checkCore: () => PlaylistManager.checkCoreAvailability(),
        findVideo: (videoId) => PlaylistManager.findVideoInPlaylists(videoId),
        getBySource: (source) => PlaylistManager.getPlaylistsBySource(source),
        testMove: (from, to) => PlaylistManager.moveVideoInQueue(from, to),
        testFallback: () => {
            // Temporary disable core for testing
            const originalCore = window.unifiedCore;
            window.unifiedCore = null;
            PlaylistManager.initializeManualPlaylist();
            setTimeout(() => {
                window.unifiedCore = originalCore;
            }, 5000);
        }
    };
}

console.log('✅ PlaylistManager cargado - VERSIÓN INTEGRADA CON CORE UNIFICADO');
console.log('🔧 PlaylistDebug disponible: window.PlaylistDebug.getQueue()');
console.log('📋 Soporte para YouTube Library, cola manual y playlists externas');
