// ===== PLAYLISTMANAGER.JS CORREGIDO - GESTIÓN MEJORADA =====
// Versión corregida con inicialización de cola vacía y mejor manejo

export class PlaylistManager {
    
    // ✅ NUEVO: Inicializar cola de reproducción vacía
    static initializeManualPlaylist() {
        const state = window.unifiedStateManager?.state;
        if (!state) {
            console.warn('⚠️ Estado unificado no disponible para inicializar cola');
            return;
        }
        
        const playlistsData = [...state.playlist.playlistsData];
        
        // Buscar si ya existe la playlist manual
        const existingManual = playlistsData.find(p => p.id === 'manual');
        
        if (!existingManual) {
            const manualPlaylist = {
                id: 'manual',
                name: 'Cola de Reproducción',
                thumbnailUrl: '/electronic.ico',
                videos: [], // ✅ COLA VACÍA AL INICIO
                isExpanded: false,
                source: 'manual',
                isLoaded: true,
                itemCount: 0
            };
            
            // Añadir al inicio de la lista (para que aparezca primera)
            playlistsData.unshift(manualPlaylist);
            window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
            console.log('📋 Cola de reproducción inicializada (vacía)');
        } else {
            // Si ya existe, asegurar que tenga la estructura correcta
            const index = playlistsData.findIndex(p => p.id === 'manual');
            if (index !== -1) {
                playlistsData[index] = {
                    ...playlistsData[index],
                    videos: playlistsData[index].videos || [], // Asegurar array
                    isLoaded: true,
                    source: 'manual'
                };
                window.unifiedStateManager.set('playlist.playlistsData', playlistsData);
                console.log('📋 Cola de reproducción ya existía, estructura verificada');
            }
        }
    }

    // ✅ MEJORADO: Obtener lista plana con mejor gestión
    static getFlattenedPlaylist() {
        const playlistsData = window.unifiedStateManager?.state?.playlist?.playlistsData || [];
        let flatList = [];
        
        // Solo incluir playlist manual (cola de reproducción) para el playback
        const manualPlaylist = playlistsData.find(p => p.id === 'manual');
        
        if (manualPlaylist && manualPlaylist.videos && Array.isArray(manualPlaylist.videos)) {
            manualPlaylist.videos.forEach(video => {
                flatList.push({ 
                    ...video, 
                    sourcePlaylistId: 'manual'
                });
            });
        }
        
        console.log('📊 Lista plana generada:', flatList.length, 'videos de cola');
        return flatList;
    }

    // ✅ MEJORADO: Actualizar índice de reproducción actual
    static updateCurrentPlayingIndex() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        let playingVideoId = null;
        let activePlayerNum = null;

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
                    
                    // Actualizar estado unificado
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', playingVideoId);
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', 'manual');
                    window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', newFlatIndex);
                    
                    console.log(`🎵 Índice actualizado: ${newFlatIndex} (Video: ${playingVideoId})`);
                    
                    // Actualizar UI
                    if (window.UIManager?.updatePlaylistsUI) {
                        window.UIManager.updatePlaylistsUI();
                    }
                    
                    // Actualizar cola si está visible
                    const queueSection = document.getElementById('queueSection');
                    if (queueSection && !queueSection.classList.contains('hidden')) {
                        if (window.UIManager?.updateQueueContent) {
                            window.UIManager.updateQueueContent();
                        }
                    }
                }
            }

            if (activePlayerNum && state.app.currentPlayer !== activePlayerNum) {
                console.log(`🔄 Sincronizando currentPlayer a ${activePlayerNum}`);
                window.unifiedStateManager.set('app.currentPlayer', activePlayerNum);
            }
        } else {
            const currentInfo = state.playlist.currentPlayingInfo;
            if (currentInfo.flattenedIndex !== -1) {
                console.log("▫️ Reproducción detenida, reseteando índice");
                window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.playlistId', null);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', -1);
                
                if (window.UIManager?.updatePlaylistsUI) {
                    window.UIManager.updatePlaylistsUI();
                }
            }
        }
    }

    // ✅ MEJORADO: Añadir video a la cola de reproducción
    static addVideoToManualPlaylist(videoData) {
        const state = window.unifiedStateManager?.state;
        if (!state) {
            console.warn('⚠️ Estado unificado no disponible');
            return null;
        }

        const playlistsData = [...state.playlist.playlistsData];
        let manualPlaylist = playlistsData.find(p => p.id === 'manual');

        // Si no existe la playlist manual, crearla
        if (!manualPlaylist) {
            console.log('📋 Creando cola de reproducción...');
            PlaylistManager.initializeManualPlaylist();
            
            // Recargar datos después de crear
            const updatedData = window.unifiedStateManager.state.playlist.playlistsData;
            manualPlaylist = updatedData.find(p => p.id === 'manual');
        }

        if (!manualPlaylist) {
            console.error('❌ No se pudo crear/encontrar la cola de reproducción');
            return null;
        }

        // Verificar duplicados
        const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
        if (isDuplicate) {
            console.log('⚠️ Video ya está en la cola:', videoData.title);
            window.unifiedMessageManager?.show(`"${videoData.title}" ya está en la cola`, 'warning');
            return null;
        }

        // Preparar objeto de video
        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || `https://img.youtube.com/vi/${videoData.videoId}/default.jpg`,
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || videoData.uploaderName || 'Desconocido',
            addedAt: Date.now()
        };

        // Añadir video a la cola
        const updatedPlaylistsData = [...state.playlist.playlistsData];
        const manualIndex = updatedPlaylistsData.findIndex(p => p.id === 'manual');
        
        if (manualIndex !== -1) {
            updatedPlaylistsData[manualIndex] = {
                ...updatedPlaylistsData[manualIndex],
                videos: [...updatedPlaylistsData[manualIndex].videos, videoObject],
                itemCount: updatedPlaylistsData[manualIndex].videos.length + 1
            };
            
            // Actualizar estado
            window.unifiedStateManager.set('playlist.playlistsData', updatedPlaylistsData);
            
            console.log(`✅ Video añadido a cola: "${videoObject.title}" (Total: ${updatedPlaylistsData[manualIndex].videos.length})`);
            
            // Actualizar UI si es necesario
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }
            
            // Habilitar botón play si hay videos y reproductores listos
            PlaylistManager.checkAndEnablePlayButton();
            
            return videoObject;
        }

        console.error('❌ Error actualizando cola de reproducción');
        return null;
    }

    // ✅ MEJORADO: Eliminar video con mejor gestión
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
                // El video que se está reproduciendo fue eliminado
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

    // ✅ MEJORADO: Verificar y habilitar botón play
    static checkAndEnablePlayButton() {
        const flatList = PlaylistManager.getFlattenedPlaylist();
        const playersReady = window.unifiedStateManager?.state?.app?.playersInitialized;
        
        const playButton = document.getElementById('botonPlay');
        const nextButton = document.getElementById('botonNext');
        
        if (flatList.length > 0 && playersReady) {
            if (playButton) {
                playButton.disabled = false;
                playButton.title = 'Reproducir cola';
            }
            if (nextButton) {
                nextButton.disabled = false;
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
            console.log(`⏸️ Botones deshabilitados - Cola: ${flatList.length}, Players: ${playersReady}`);
        }
    }

    // ✅ MEJORADO: Manejar carga de playlist externa
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

        // Procesar videos
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

        // Añadir a la lista (después de manual)
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

    // ✅ MEJORADO: Toggle expansion con mejor manejo de YouTube Library
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

        // Lógica para YouTube Library
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

    // ✅ NUEVO: Procesar playlists de YouTube Library
    static processYouTubeLibraryPlaylists(playlists) {
        console.log('📚 Procesando playlists de YouTube Library:', playlists.length);
        
        const state = window.unifiedStateManager?.state;
        if (!state) return;
        
        const processedPlaylists = playlists.map(playlist => ({
            id: playlist.id,
            name: playlist.snippet?.title || 'Playlist Sin Nombre',
            thumbnailUrl: playlist.snippet?.thumbnails?.medium?.url || 
                         playlist.snippet?.thumbnails?.default?.url || '',
            videos: null, // Se cargarán bajo demanda
            isExpanded: false,
            source: 'youtube_library',
            isLoaded: false,
            itemCount: playlist.contentDetails?.itemCount || 0,
            originalData: playlist // Para referencia
        }));
        
        // Combinar con playlists existentes
        const currentPlaylists = [...state.playlist.playlistsData];
        
        // Asegurar que manual esté primero
        const manualPlaylist = currentPlaylists.find(p => p.id === 'manual');
        const otherPlaylists = currentPlaylists.filter(p => p.id !== 'manual');
        
        // Filtrar duplicados por ID
        const newPlaylists = processedPlaylists.filter(newPl => 
            !otherPlaylists.some(existing => existing.id === newPl.id)
        );
        
        const finalPlaylists = [
            ...(manualPlaylist ? [manualPlaylist] : []),
            ...otherPlaylists,
            ...newPlaylists
        ];
        
        window.unifiedStateManager.set('playlist.playlistsData', finalPlaylists);
        
        console.log(`✅ ${newPlaylists.length} nuevas playlists de YouTube Library procesadas`);
        
        // Trigger UI update
        if (window.UIManager?.updatePlaylistsUI) {
            setTimeout(() => {
                window.UIManager.updatePlaylistsUI();
            }, 300);
        }
        
        return newPlaylists.length;
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

    // ✅ UTILITY: Parsear duración (mantenido del original)
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

    // ✅ NUEVO: Debug y utilidades
    static getDebugInfo() {
        const state = window.unifiedStateManager?.state;
        if (!state) return { error: 'Estado no disponible' };
        
        const queueInfo = PlaylistManager.getQueueInfo();
        const flatList = PlaylistManager.getFlattenedPlaylist();
        
        return {
            timestamp: Date.now(),
            totalPlaylists: state.playlist.playlistsData.length,
            queue: queueInfo,
            flatListCount: flatList.length,
            currentPlayingInfo: state.playlist.currentPlayingInfo,
            playersReady: state.app.playersInitialized,
            reproductionStarted: state.app.reproduccionIniciada
        };
    }
}

// ✅ INICIALIZACIÓN AUTOMÁTICA
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que el sistema unificado esté listo
    if (window.unifiedStateManager) {
        PlaylistManager.initializeManualPlaylist();
    } else {
        window.addEventListener('ytcrossmix:unified:ready', () => {
            console.log('🎉 Inicializando PlaylistManager con sistema unificado listo...');
            PlaylistManager.initializeManualPlaylist();
        });
    }
});

// ✅ REFERENCIAS GLOBALES
if (typeof window !== 'undefined') {
    window.PlaylistManager = PlaylistManager;
    
    // Debug helpers
    window.PlaylistDebug = {
        getQueue: () => PlaylistManager.getQueueInfo(),
        getFlatList: () => PlaylistManager.getFlattenedPlaylist(),
        clearQueue: () => PlaylistManager.clearQueue(),
        getDebugInfo: () => PlaylistManager.getDebugInfo(),
        initQueue: () => PlaylistManager.initializeManualPlaylist()
    };
}

console.log('✅ PlaylistManager cargado - VERSIÓN COLA VACÍA + GESTIÓN MEJORADA');
