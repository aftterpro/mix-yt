// ===== 3. UI.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// ui.js - Versión adaptada (solo las partes críticas modificadas)

export class UIManager {
    
    static updatePlaylistsUI() {
        console.log('🔄 UIManager: Actualizando UI con estado unificado...');
        
        try {
            // ✅ Usar estado unificado
            const state = window.unifiedStateManager?.state;
            if (!state) {
                console.warn('⚠️ Estado unificado no disponible');
                return;
            }
            
            const currentView = state.ui.currentView || UIManager.getCurrentView() || 'home';
            let playlistContainer = UIManager.getPlaylistContainer(currentView);
            
            if (!playlistContainer) {
                console.warn('⚠️ No se encontró contenedor para vista:', currentView);
                return;
            }
            
            const currentScrollTop = playlistContainer.scrollTop;
            const playingVideoId = state.playlist.currentPlayingInfo?.videoId || null;
            
            if (!state.playlist.playlistsData || state.playlist.playlistsData.length === 0) {
                UIManager.renderEmptyState(playlistContainer, currentView);
            } else {
                if (currentView === 'library') {
                    UIManager.renderPlaylistCards(playlistContainer, state.playlist.playlistsData);
                } else {
                    UIManager.renderPlaylistList(playlistContainer, state.playlist.playlistsData, playingVideoId);
                }
            }
            
            if (currentScrollTop > 0) {
                playlistContainer.scrollTop = currentScrollTop;
            }
            
            UIManager.enableInteractivity();
            console.log('✅ UI actualizada con estado unificado');
            
        } catch (error) {
            console.error('💥 Error actualizando UI:', error);
            // ✅ Usar sistema de mensajes unificado
            window.unifiedMessageManager?.show('Error actualizando interfaz', 'error');
        }
    }

    static renderPlaylistCards(container, playlistsData) {
        console.log('📱 Renderizando cards con estado unificado...');
        
        const grid = document.createElement('div');
        grid.className = 'playlists-grid-mobile';
        
        playlistsData.forEach((playlist, index) => {
            const card = UIManager.createPlaylistCard(playlist, index);
            grid.appendChild(card);
        });
        
        container.innerHTML = '';
        container.appendChild(grid);
    }

    static renderPlaylistList(container, playlistsData, playingVideoId) {
        console.log('📝 Renderizando lista con estado unificado...');
        
        container.innerHTML = '';
        
        playlistsData.forEach((playlist) => {
            const groupDiv = UIManager.createPlaylistGroup(playlist, playingVideoId);
            container.appendChild(groupDiv);
        });
    }

    static handlePlayNextActionFromSearch(videoId, videoData) {
        console.log('🎵 Añadiendo para reproducir después (unificado):', videoData.title);
        
        try {
            const state = window.unifiedStateManager?.state;
            if (!state) return;
            
            if (state.playlist.currentPlayingInfo) {
                const currentIndex = state.playlist.currentPlayingInfo.flattenedIndex;
                
                if (currentIndex < 0) {
                    UIManager.createQueueAndAdd(videoData);
                } else {
                    UIManager.insertVideoAfterCurrent(videoData, currentIndex);
                }
            } else {
                UIManager.createQueueAndAdd(videoData);
            }
            
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                // ✅ Usar sistema de mensajes unificado
                window.unifiedMessageManager?.show(`♪ Añadido`, 'success', 1500);
                
                if (navigator.vibrate) {
                    navigator.vibrate(30);
                }
            } else {
                window.unifiedMessageManager?.show(`"${videoData.title}" añadido para reproducir después`, 'success', 3000);
            }
            
            UIManager.updatePlaylistsUI();
            
        } catch (error) {
            console.error('💥 Error añadiendo video:', error);
            window.unifiedMessageManager?.show('Error añadiendo video', 'error', 2000);
        }
    }

    static createQueueAndAdd(videoData) {
        // ✅ Usar estado unificado
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        let playlistsData = [...state.playlist.playlistsData];
        let queuePlaylist = playlistsData.find(p => p.id === 'queue') ||
                           playlistsData.find(p => p.id === 'manual');
        
        if (!queuePlaylist) {
            queuePlaylist = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: '',
                videos: [],
                isExpanded: true
            };
            playlistsData.unshift(queuePlaylist);
        }
        
        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title,
            thumbnail: videoData.thumbnail,
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || videoData.artist || 'Desconocido'
        };
        
        queuePlaylist.videos.push(videoObject);
        
        // ✅ Actualizar estado unific
