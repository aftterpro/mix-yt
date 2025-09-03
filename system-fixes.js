// ===== SYSTEM-FIXES.JS - CORRECCIONES CRÍTICAS DEL SISTEMA =====
// Este archivo corrige problemas identificados en el proyecto YT CrossMix

console.log('🔧 Cargando correcciones del sistema...');

// ===== FIX 1: CREAR POPUP DE PLAYLIST FALTANTE =====
function createPlaylistPopup() {
    if (document.getElementById('playlistPopup')) return;
    
    console.log('🆕 Creando popup de playlist...');
    
    const popup = document.createElement('div');
    popup.id = 'playlistPopup';
    popup.className = 'playlist-popup';
    
    popup.innerHTML = `
        <div class="playlist-popup-content">
            <div class="playlist-popup-header">
                <img src="" class="playlist-popup-thumbnail" alt="Playlist">
                <div class="playlist-popup-info">
                    <h2 class="playlist-popup-title">Cargando...</h2>
                    <p class="playlist-popup-meta">0 videos</p>
                </div>
                <div class="playlist-popup-actions">
                    <button class="playlist-popup-btn" id="popupAddAllBtn">
                        <i class="fas fa-plus"></i> Añadir Todo
                    </button>
                    <button class="playlist-popup-btn secondary" id="popupPlayAllBtn">
                        <i class="fas fa-play"></i> Reproducir
                    </button>
                </div>
                <button class="playlist-popup-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="playlist-popup-body">
                <div id="playlistPopupVideos" class="playlist-popup-videos">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Cargando videos...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    console.log('✅ Popup de playlist creado');
}

// ===== FIX 2: MISSING FUNCTION IMPLEMENTATIONS =====
class SystemFixes {
    
    // Fix para UnifiedPlaybackController faltante
    static createUnifiedPlaybackController(stateManager, youtubeManager, playlistManager) {
        if (window.unifiedPlaybackController) return window.unifiedPlaybackController;
        
        console.log('🔧 Creando UnifiedPlaybackController fallback...');
        
        const playbackController = {
            playFirstVideo() {
                console.log('🎵 PlayFirst (fallback)');
                if (window.PlaybackController?.playFirstVideo) {
                    return window.PlaybackController.playFirstVideo();
                }
                
                const queue = playlistManager?.getFlattenedPlaylist() || [];
                if (queue.length === 0) {
                    window.unifiedMessageManager?.show('No hay videos en la cola', 'warning');
                    return;
                }
                
                const firstVideo = queue[0];
                const state = stateManager?.state;
                
                if (state && state.app.player1) {
                    try {
                        stateManager.set('playlist.currentPlayingInfo.videoId', firstVideo.videoId);
                        stateManager.set('playlist.currentPlayingInfo.flattenedIndex', 0);
                        stateManager.set('app.reproduccionIniciada', true);
                        stateManager.set('app.currentPlayer', 1);
                        
                        state.app.player1.loadVideoById(firstVideo.videoId);
                        state.app.player1.setVolume(100);
                        
                        const playButton = document.getElementById('botonPlay');
                        if (playButton) {
                            playButton.innerHTML = '<i class="fas fa-pause"></i>';
                        }
                        
                        console.log('✅ Primer video iniciado');
                        
                    } catch (error) {
                        console.error('❌ Error iniciando primer video:', error);
                        window.unifiedMessageManager?.show('Error iniciando reproducción', 'error');
                    }
                }
            },
            
            async playNextVideo() {
                console.log('⏭️ PlayNext (fallback)');
                if (window.PlaybackController?.playNextVideo) {
                    return window.PlaybackController.playNextVideo();
                }
                
                const state = stateManager?.state;
                if (!state) return;
                
                const currentIndex = state.playlist.currentPlayingInfo.flattenedIndex;
                const queue = playlistManager?.getFlattenedPlaylist() || [];
                
                if (currentIndex + 1 >= queue.length) {
                    const repeat = confirm('¿Repetir desde el principio?');
                    if (repeat) {
                        this.playFirstVideo();
                    }
                    return;
                }
                
                const nextVideo = queue[currentIndex + 1];
                if (nextVideo && state.app.player1) {
                    try {
                        stateManager.set('playlist.currentPlayingInfo.videoId', nextVideo.videoId);
                        stateManager.set('playlist.currentPlayingInfo.flattenedIndex', currentIndex + 1);
                        
                        state.app.player1.loadVideoById(nextVideo.videoId);
                        
                        console.log('✅ Siguiente video iniciado');
                        
                    } catch (error) {
                        console.error('❌ Error cambiando a siguiente video:', error);
                        window.unifiedMessageManager?.show('Error cambiando video', 'error');
                    }
                }
            },
            
            togglePlayback() {
                const state = stateManager?.state;
                if (!state?.app.player1) return;
                
                try {
                    const playerState = state.app.player1.getPlayerState();
                    
                    if (playerState === YT.PlayerState.PLAYING) {
                        state.app.player1.pauseVideo();
                        const playButton = document.getElementById('botonPlay');
                        if (playButton) playButton.innerHTML = '<i class="fas fa-play"></i>';
                    } else {
                        state.app.player1.playVideo();
                        const playButton = document.getElementById('botonPlay');
                        if (playButton) playButton.innerHTML = '<i class="fas fa-pause"></i>';
                    }
                } catch (error) {
                    console.error('❌ Error toggle playback:', error);
                }
            },
            
            playVideoAtIndex(index) {
                const queue = playlistManager?.getFlattenedPlaylist() || [];
                if (index < 0 || index >= queue.length) return;
                
                const video = queue[index];
                const state = stateManager?.state;
                
                if (video && state?.app.player1) {
                    try {
                        stateManager.set('playlist.currentPlayingInfo.videoId', video.videoId);
                        stateManager.set('playlist.currentPlayingInfo.flattenedIndex', index);
                        
                        state.app.player1.loadVideoById(video.videoId);
                        
                        console.log(`✅ Video en índice ${index} iniciado`);
                        
                    } catch (error) {
                        console.error('❌ Error reproduciendo video en índice:', error);
                    }
                }
            }
        };
        
        window.unifiedPlaybackController = playbackController;
        return playbackController;
    }
    
    // Fix para elementos DOM faltantes
    static createMissingElements() {
        const elementsToCreate = [
            {
                id: 'queueCloseBtn',
                parent: '.queue-header',
                element: 'button',
                className: 'queue-close-btn',
                innerHTML: '<i class="fas fa-times"></i>',
                onclick: () => window.UIManager?.hideQueue?.()
            },
            {
                id: 'popupAddAllBtn',
                parent: '.playlist-popup-actions',
                element: 'button',
                className: 'playlist-popup-btn',
                innerHTML: '<i class="fas fa-plus"></i> Añadir Todo'
            },
            {
                id: 'popupPlayAllBtn',
                parent: '.playlist-popup-actions',
                element: 'button',
                className: 'playlist-popup-btn secondary',
                innerHTML: '<i class="fas fa-play"></i> Reproducir'
            }
        ];
        
        elementsToCreate.forEach(config => {
            if (!document.getElementById(config.id)) {
                const parent = document.querySelector(config.parent);
                if (parent) {
                    const element = document.createElement(config.element);
                    element.id = config.id;
                    element.className = config.className;
                    element.innerHTML = config.innerHTML;
                    if (config.onclick) element.onclick = config.onclick;
                    parent.appendChild(element);
                    console.log(`✅ Elemento ${config.id} creado`);
                }
            }
        });
    }
    
    // Fix para funciones de búsqueda
    static fixSearchFunctions() {
        if (!window.unifiedCore?.searchManager && !window.SearchManager) {
            console.log('🔍 Creando SearchManager fallback...');
            
            window.SearchManager = {
                async performSearch(query) {
                    console.log(`🔍 Búsqueda: ${query}`);
                    
                    if (window.unifiedNavigationManager?.switchView) {
                        window.unifiedNavigationManager.switchView('search');
                    }
                    
                    const searchResults = document.getElementById('searchResults');
                    if (!searchResults) return;
                    
                    searchResults.innerHTML = `
                        <div class="search-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Buscando...</p>
                        </div>
                    `;
                    
                    try {
                        const response = await fetch(`/.netlify/functions/search?q=${encodeURIComponent(query)}`);
                        if (!response.ok) throw new Error(`Error: ${response.status}`);
                        
                        const data = await response.json();
                        SystemFixes.displaySearchResults(data);
                        
                    } catch (error) {
                        console.error('❌ Error en búsqueda:', error);
                        searchResults.innerHTML = `
                            <div class="search-error">
                                <i class="fas fa-exclamation-triangle"></i>
                                <p>Error de búsqueda</p>
                            </div>
                        `;
                    }
                }
            };
        }
    }
    
    static displaySearchResults(data) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults || !data?.items) return;
        
        searchResults.innerHTML = '';
        searchResults.className = 'search-results-grid';
        
        data.items.forEach(video => {
            const videoId = video.url?.split('v=')[1] || video.videoId;
            if (!videoId) return;
            
            const card = document.createElement('div');
            card.className = 'video-card';
            card.innerHTML = `
                <div class="video-card-thumbnail">
                    <img src="${video.thumbnail}" alt="${video.title}" loading="lazy">
                    <div class="video-card-overlay">
                        <button class="video-card-play-btn" onclick="SystemFixes.addVideoToQueue('${videoId}', '${video.title.replace(/'/g, "\\'")}', '${video.thumbnail}', '${video.uploaderName || ''}')">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
                <div class="video-card-info">
                    <h3 class="video-card-title">${video.title}</h3>
                    <p class="video-card-author">${video.uploaderName || 'Desconocido'}</p>
                    <button class="video-card-add-btn" onclick="SystemFixes.addVideoToQueue('${videoId}', '${video.title.replace(/'/g, "\\'")}', '${video.thumbnail}', '${video.uploaderName || ''}')">
                        <i class="fas fa-arrow-right-to-line"></i>
                        Añadir a Cola
                    </button>
                </div>
            `;
            
            searchResults.appendChild(card);
        });
        
        console.log(`✅ ${data.items.length} resultados mostrados`);
    }
    
    // Fix para añadir videos a la cola
    static addVideoToQueue(videoId, title, thumbnail, author) {
        console.log(`➕ Añadiendo: ${title}`);
        
        if (window.unifiedCore?.addVideoToQueue) {
            return window.unifiedCore.addVideoToQueue(videoId, title, thumbnail, author);
        }
        
        if (window.unifiedCore?.playlistManager?.addVideoToManualPlaylist) {
            const videoData = { videoId, title, thumbnail, channelTitle: author, duration: 0 };
            return window.unifiedCore.playlistManager.addVideoToManualPlaylist(videoData);
        }
        
        // Fallback manual
        const state = window.unifiedStateManager?.state;
        if (state) {
            const currentQueue = state.playlist.manualQueue || [];
            const newVideo = { videoId, title, thumbnail, channelTitle: author, duration: 0, addedAt: Date.now() };
            
            if (!currentQueue.some(v => v.videoId === videoId)) {
                window.unifiedStateManager.set('playlist.manualQueue', [...currentQueue, newVideo]);
                window.unifiedMessageManager?.show(`"${title}" añadido a la cola`, 'success');
                window.UIManager?.updateQueueDisplay?.();
                return newVideo;
            }
        }
        
        console.warn('⚠️ No se pudo añadir el video a la cola');
        return null;
    }
    
    // Fix para gestión de eventos
    static fixEventListeners() {
        // Fix para botones principales
        const playButton = document.getElementById('botonPlay');
        if (playButton && !playButton.dataset.listenerFixed) {
            playButton.addEventListener('click', () => {
                if (window.UIManager?.handlePlayButtonClick) {
                    window.UIManager.handlePlayButtonClick();
                } else if (window.unifiedPlaybackController?.playFirstVideo) {
                    window.unifiedPlaybackController.playFirstVideo();
                }
            });
            playButton.dataset.listenerFixed = 'true';
        }
        
        const nextButton = document.getElementById('botonNext');
        if (nextButton && !nextButton.dataset.listenerFixed) {
            nextButton.addEventListener('click', () => {
                if (window.UIManager?.handleNextButtonClick) {
                    window.UIManager.handleNextButtonClick();
                } else if (window.unifiedPlaybackController?.playNextVideo) {
                    window.unifiedPlaybackController.playNextVideo();
                }
            });
            nextButton.dataset.listenerFixed = 'true';
        }
        
        // Fix para cola
        const queueButton = document.getElementById('queueButton');
        if (queueButton && !queueButton.dataset.listenerFixed) {
            queueButton.addEventListener('click', () => {
                window.UIManager?.toggleQueue?.();
            });
            queueButton.dataset.listenerFixed = 'true';
        }
        
        console.log('✅ Event listeners corregidos');
    }
    
    // Fix para navegación
    static fixNavigation() {
        document.querySelectorAll('[data-view]').forEach(navItem => {
            if (!navItem.dataset.listenerFixed) {
                navItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    const view = navItem.dataset.view;
                    
                    if (window.UIManager?.switchView) {
                        window.UIManager.switchView(view);
                    } else if (window.unifiedNavigationManager?.switchView) {
                        window.unifiedNavigationManager.switchView(view);
                    }
                });
                navItem.dataset.listenerFixed = 'true';
            }
        });
    }
    
    // Fix para reproductores YouTube
    static fixYouTubeAPI() {
        if (!window.onYouTubeIframeAPIReady) {
            window.onYouTubeIframeAPIReady = function() {
                console.log('📺 YouTube API Ready (Fixed)');
                
                if (window.unifiedYouTubeManager?.createPlayers) {
                    window.unifiedYouTubeManager.createPlayers();
                } else {
                    SystemFixes.createBasicPlayers();
                }
            };
        }
    }
    
    static createBasicPlayers() {
        if (window.player1 && window.player2) return;
        
        console.log('🎮 Creando reproductores básicos...');
        
        try {
            window.player1 = new YT.Player('player1', {
                height: '100%',
                width: '100%',
                playerVars: { playsinline: 1, controls: 0 },
                events: {
                    onReady: () => console.log('Player 1 ready'),
                    onStateChange: (event) => SystemFixes.handlePlayerStateChange(event, 1),
                    onError: (event) => console.error('Player 1 error:', event)
                }
            });
            
            window.player2 = new YT.Player('player2', {
                height: '100%',
                width: '100%',
                playerVars: { playsinline: 1, controls: 0 },
                events: {
                    onReady: () => console.log('Player 2 ready'),
                    onStateChange: (event) => SystemFixes.handlePlayerStateChange(event, 2),
                    onError: (event) => console.error('Player 2 error:', event)
                }
            });
            
            // Actualizar estado si existe
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('app.player1', window.player1);
                window.unifiedStateManager.set('app.player2', window.player2);
                window.unifiedStateManager.set('app.playersInitialized', true);
            }
            
            console.log('✅ Reproductores básicos creados');
            
        } catch (error) {
            console.error('❌ Error creando reproductores:', error);
        }
    }
    
    static handlePlayerStateChange(event, playerNum) {
        console.log(`Player ${playerNum} state: ${event.data}`);
        
        // Actualizar botones de reproducción
        const playButtons = document.querySelectorAll('#botonPlay, #miniPlayBtn');
        playButtons.forEach(button => {
            if (event.data === YT.PlayerState.PLAYING) {
                button.innerHTML = '<i class="fas fa-pause"></i>';
            } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                button.innerHTML = '<i class="fas fa-play"></i>';
            }
        });
        
        // Dispatch event para sistema unificado
        document.dispatchEvent(new CustomEvent('unifiedPlayerStateChanged', {
            detail: { playerNum, state: event.data }
        }));
    }
    
    // Master fix function
    static applyAllFixes() {
        console.log('🔧 Aplicando todas las correcciones...');
        
        // Crear elementos faltantes
        createPlaylistPopup();
        SystemFixes.createMissingElements();
        
        // Fix managers
        if (window.unifiedStateManager && window.unifiedYouTubeManager && window.unifiedPlaylistManager) {
            SystemFixes.createUnifiedPlaybackController(
                window.unifiedStateManager,
                window.unifiedYouTubeManager,
                window.unifiedPlaylistManager
            );
        }
        
        // Fix funciones
        SystemFixes.fixSearchFunctions();
        SystemFixes.fixEventListeners();
        SystemFixes.fixNavigation();
        SystemFixes.fixYouTubeAPI();
        
        console.log('✅ Todas las correcciones aplicadas');
    }
}

// ===== FIX 3: COMPATIBILIDAD CON BACKUP =====
class BackupCompatibility {
    static initializeFromBackup() {
        console.log('📦 Inicializando compatibilidad con backup...');
        
        // Funciones del backup que pueden ser útiles
        if (!window.formatDuration) {
            window.formatDuration = function(duration) {
                if (typeof duration === 'number') {
                    const minutes = Math.floor(duration / 60);
                    const seconds = Math.floor(duration % 60);
                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                return '0:00';
            };
        }
        
        if (!window.parseDuration) {
            window.parseDuration = function(duration) {
                if (typeof duration === 'number') return duration;
                if (typeof duration !== 'string') return 0;
                
                const parts = duration.split(':');
                if (parts.length === 2) {
                    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
                }
                return 0;
            };
        }
        
        if (!window.getFlattenedPlaylist) {
            window.getFlattenedPlaylist = function() {
                if (window.unifiedCore?.playlistManager?.getFlattenedPlaylist) {
                    return window.unifiedCore.playlistManager.getFlattenedPlaylist();
                }
                
                const state = window.unifiedStateManager?.state;
                if (state?.playlist?.manualQueue) {
                    return state.playlist.manualQueue.map(video => ({
                        ...video,
                        sourcePlaylistId: 'manual'
                    }));
                }
                
                return [];
            };
        }
        
        console.log('✅ Compatibilidad con backup inicializada');
    }
}

// ===== AUTO-INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        SystemFixes.applyAllFixes();
        BackupCompatibility.initializeFromBackup();
    }, 2000); // Esperar a que el sistema principal se cargue
});

// Si el sistema ya está listo
if (window.ytCrossMixUnified?.initialized) {
    SystemFixes.applyAllFixes();
    BackupCompatibility.initializeFromBackup();
}

// Listener para cuando el sistema esté listo
window.addEventListener('ytcrossmix:unified:ready', () => {
    setTimeout(() => {
        SystemFixes.applyAllFixes();
        BackupCompatibility.initializeFromBackup();
    }, 1000);
});

// Export para debugging
window.SystemFixes = SystemFixes;
window.BackupCompatibility = BackupCompatibility;

console.log('✅ System Fixes cargado y listo');
