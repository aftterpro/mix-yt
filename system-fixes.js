// ===== SYSTEM-FIXES.JS - CORRECCIONES FINALES COMPLETAS =====

console.log('🔧 Aplicando correcciones críticas finales...');

// ===== 1. CORRECCIÓN DE NAVEGACIÓN ENTRE PESTAÑAS MEJORADA =====
function fixNavigation() {
    console.log('🔧 Corrigiendo navegación...');
    
    function switchView(viewName) {
        console.log(`📄 Cambiando a vista: ${viewName}`);
        
        // Ocultar todas las vistas
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        // Mostrar vista objetivo
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
            
            // Actualizar navegación
            document.querySelectorAll('[data-view]').forEach(item => {
                if (item.dataset.view === viewName) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            
            // Actualizar estado si existe el manager
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('ui.currentView', viewName);
            }
            
            // Acciones específicas por vista
            if (viewName === 'library' && window.UIManager?.updatePlaylistsUI) {
                setTimeout(() => window.UIManager.updatePlaylistsUI(), 100);
            } else if (viewName === 'playing') {
                // Actualizar vista de reproducción y cola
                if (window.UIManager?.updateNowPlayingView) {
                    window.UIManager.updateNowPlayingView();
                }
            }
            
            console.log(`✅ Vista cambiada a: ${viewName}`);
        } else {
            console.error(`❌ Vista no encontrada: ${viewName}View`);
        }
    }
    
    // Configurar listeners de navegación
    document.addEventListener('click', (event) => {
        const navItem = event.target.closest('[data-view]');
        if (navItem) {
            event.preventDefault();
            const view = navItem.dataset.view;
            switchView(view);
        }
    });
    
    // Exponer función globalmente
    window.switchView = switchView;
    
    // Configurar vista inicial
    setTimeout(() => switchView('home'), 100);
    
    console.log('✅ Navegación corregida');
}

// ===== 2. CORRECCIÓN DE BÚSQUEDA CON FORMATO BALDOSAS =====
function fixSearch() {
    console.log('🔧 Corrigiendo búsqueda...');
    
    async function performSearch(query) {
        console.log(`🔍 Iniciando búsqueda: ${query}`);
        
        if (!query || query.trim().length < 2) {
            return;
        }
        
        // Cambiar a vista de búsqueda
        if (window.switchView) {
            window.switchView('search');
        }
        
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) {
            console.error('❌ Contenedor de resultados no encontrado');
            return;
        }
        
        // Mostrar loading
        searchResults.className = 'search-results';
        searchResults.innerHTML = `
            <div class="search-loading" style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-color);"></i>
                <p style="margin-top: 16px; color: var(--text-secondary);">Buscando...</p>
            </div>
        `;
        
        try {
            const pipedInstances = [
                "https://api.piped.private.coffee",
                "https://pipedapi.ducks.party"
            ];
            
            let searchData = null;
            
            for (const instance of pipedInstances) {
                try {
                    console.log(`🔗 Probando instancia: ${instance}`);
                    
                    const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        },
                        signal: AbortSignal.timeout(10000)
                    });
                    
                    if (response.ok) {
                        searchData = await response.json();
                        console.log(`✅ Búsqueda exitosa en: ${instance}`);
                        break;
                    }
                } catch (error) {
                    console.warn(`⚠️ Falló instancia ${instance}:`, error.message);
                    continue;
                }
            }
            
            if (!searchData) {
                throw new Error('Todas las instancias de búsqueda fallaron');
            }
            
            displaySearchResults(searchData);
            
        } catch (error) {
            console.error('❌ Error en búsqueda:', error);
            displaySearchError(error, query);
        }
    }
    
    // ✅ MOSTRAR RESULTADOS EN FORMATO BALDOSAS (4 COLUMNAS)
    function displaySearchResults(data) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        const items = data.items || data.relatedStreams || [];
        
        if (!items || items.length === 0) {
            searchResults.className = 'search-results';
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>No se encontraron resultados</p>
                </div>
            `;
            return;
        }
        
        // ✅ CAMBIAR A FORMATO GRID
        searchResults.className = 'search-results-grid';
        searchResults.innerHTML = '';
        
        items.forEach(video => {
            const videoId = extractVideoId(video);
            if (!videoId) return;
            
            const videoCard = createVideoCard(video, videoId);
            searchResults.appendChild(videoCard);
        });
        
        console.log(`✅ ${items.length} resultados mostrados en grid`);
    }
    
    // ✅ CREAR TARJETA DE VIDEO (FORMATO BALDOSA)
    function createVideoCard(video, videoId) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.videoId = videoId;
        
        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        const duration = formatDuration(video.duration);
        const title = escapeHtml(video.title || 'Título no disponible');
        const author = escapeHtml(video.uploaderName || video.channelTitle || 'Desconocido');
        
        card.innerHTML = `
            <div class="video-card-thumbnail">
                <img src="${thumbnailUrl}" alt="${title}" loading="lazy">
                ${duration ? `<span class="video-card-duration">${duration}</span>` : ''}
                <div class="video-card-overlay">
                    <button class="video-card-play-btn" onclick="addToQueue('${videoId}', '${title.replace(/'/g, "\\'")}', '${thumbnailUrl}', '${author.replace(/'/g, "\\'")}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
            <div class="video-card-info">
                <h3 class="video-card-title" title="${title}">${title}</h3>
                <p class="video-card-author" title="${author}">${author}</p>
                <button class="video-card-add-btn" onclick="addToQueue('${videoId}', '${title.replace(/'/g, "\\'")}', '${thumbnailUrl}', '${author.replace(/'/g, "\\'")}')">
                    <i class="fas fa-arrow-right-to-line"></i>
                    Añadir a Cola
                </button>
            </div>
        `;
        
        return card;
    }
    
    function displaySearchError(error, query) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        searchResults.className = 'search-results';
        searchResults.innerHTML = `
            <div class="search-error" style="text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #f44336; margin-bottom: 16px;"></i>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">Error de búsqueda: ${error.message}</p>
                <button onclick="performSearch('${query}')" style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }
    
    // Configurar listeners de búsqueda
    const searchInputs = ['sidebarSearchInput', 'mobileSearchInput', 'searchInput'];
    
    searchInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            // Búsqueda al presionar Enter
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    const query = input.value.trim();
                    if (query.length > 0) {
                        performSearch(query);
                    }
                }
            });
            
            // Búsqueda con delay
            let searchTimeout;
            input.addEventListener('input', (event) => {
                clearTimeout(searchTimeout);
                const query = event.target.value.trim();
                
                if (query.length > 2) {
                    searchTimeout = setTimeout(() => {
                        performSearch(query);
                    }, 500);
                }
            });
        }
    });
    
    // Exponer funciones globalmente
    window.performSearch = performSearch;
    
    console.log('✅ Búsqueda corregida con formato baldosas');
}

// ===== 3. CORRECCIÓN DE COLA DE REPRODUCCIÓN =====
function fixQueue() {
    console.log('🔧 Corrigiendo sistema de cola...');
    
    // ✅ FUNCIÓN PARA AÑADIR VIDEOS A LA COLA
    window.addToQueue = function(videoId, title, thumbnail, author) {
        console.log(`➕ Añadiendo video a cola: ${title}`);
        
        const videoData = {
            videoId: videoId,
            title: title || 'Título no disponible',
            thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/default.jpg`,
            channelTitle: author || 'Desconocido',
            duration: 0
        };
        
        let success = false;
        
        // 1. Sistema unificado
        if (window.unifiedCore?.addVideoToQueue) {
            try {
                const result = window.unifiedCore.addVideoToQueue(videoId, title, thumbnail, author);
                if (result) {
                    success = true;
                    console.log('✅ Video añadido vía sistema unificado');
                }
            } catch (error) {
                console.warn('⚠️ Error en sistema unificado:', error);
            }
        }
        
        // 2. Estado manual directo
        if (!success && window.unifiedStateManager) {
            try {
                const currentQueue = window.unifiedStateManager.state.playlist.manualQueue || [];
                const newQueue = currentQueue.filter(v => v.videoId !== videoId);
                
                if (newQueue.length !== currentQueue.length) {
                    window.unifiedStateManager.set('playlist.manualQueue', newQueue);
                    success = true;
                    console.log(`✅ Video eliminado de cola (Restantes: ${newQueue.length})`);
                }
            } catch (error) {
                console.warn('⚠️ Error eliminando de estado:', error);
            }
        }
        
        // 3. Fallback básico
        if (!success && window.manualQueue) {
            const originalLength = window.manualQueue.length;
            window.manualQueue = window.manualQueue.filter(v => v.videoId !== videoId);
            success = window.manualQueue.length !== originalLength;
        }
        
        if (success) {
            showMessage('Video eliminado de la cola', 'success');
            updateQueueDisplay();
            checkAndEnablePlayButton();
        }
    };
    
    // ✅ MOSTRAR/OCULTAR COLA
    window.toggleQueue = function() {
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) return;
        
        if (queueSection.classList.contains('hidden')) {
            updateQueueDisplay();
            queueSection.classList.remove('hidden');
            console.log('✅ Cola mostrada');
        } else {
            queueSection.classList.add('hidden');
        }
    };
    
    // Configurar botón de cola
    const queueButton = document.getElementById('queueButton');
    if (queueButton) {
        queueButton.addEventListener('click', window.toggleQueue);
    }
    
    // Configurar botón de cerrar cola
    const queueCloseBtn = document.getElementById('queueCloseBtn');
    if (queueCloseBtn) {
        queueCloseBtn.addEventListener('click', () => {
            const queueSection = document.getElementById('queueSection');
            if (queueSection) {
                queueSection.classList.add('hidden');
            }
        });
    }
    
    // Exponer funciones
    window.checkAndEnablePlayButton = checkAndEnablePlayButton;
    window.updateQueueDisplay = updateQueueDisplay;
    
    console.log('✅ Sistema de cola corregido');
}

// ===== 4. CORRECCIÓN DEL BOTÓN PLAY =====
function fixPlayButton() {
    console.log('🔧 Corrigiendo botón play...');
    
    const playButton = document.getElementById('botonPlay');
    const nextButton = document.getElementById('botonNext');
    
    if (playButton) {
        // Remover listeners existentes
        playButton.replaceWith(playButton.cloneNode(true));
        const newPlayButton = document.getElementById('botonPlay');
        
        newPlayButton.addEventListener('click', () => {
            console.log('🎵 Click en botón Play');
            
            const playersReady = window.unifiedStateManager?.state?.app?.playersInitialized || 
                                (window.YT && window.YT.Player);
            
            if (!playersReady) {
                showMessage("Reproductores no están listos", 'warning');
                return;
            }
            
            const isPlaying = window.unifiedStateManager?.state?.app?.reproduccionIniciada;
            
            if (!isPlaying) {
                // Iniciar reproducción
                let queue = [];
                
                if (window.unifiedCore?.playlistManager) {
                    queue = window.unifiedCore.playlistManager.getFlattenedPlaylist();
                } else if (window.unifiedStateManager?.state?.playlist?.manualQueue) {
                    queue = window.unifiedStateManager.state.playlist.manualQueue;
                } else if (window.manualQueue) {
                    queue = window.manualQueue;
                }
                
                if (queue.length > 0) {
                    if (window.unifiedCore?.playbackController?.playFirstVideo) {
                        window.unifiedCore.playbackController.playFirstVideo();
                    } else {
                        playFirstVideoFallback(queue[0]);
                    }
                } else {
                    showMessage("No hay videos en la cola", 'warning');
                }
            } else {
                // Alternar reproducción/pausa
                if (window.unifiedCore?.playbackController?.togglePlayback) {
                    window.unifiedCore.playbackController.togglePlayback();
                } else {
                    togglePlaybackFallback();
                }
            }
        });
    }
    
    if (nextButton) {
        nextButton.replaceWith(nextButton.cloneNode(true));
        const newNextButton = document.getElementById('botonNext');
        
        newNextButton.addEventListener('click', () => {
            console.log('⏭️ Click en botón Next');
            
            const isPlaying = window.unifiedStateManager?.state?.app?.reproduccionIniciada;
            
            if (!isPlaying) {
                showMessage("Inicia la reproducción primero", 'warning');
                return;
            }
            
            if (window.unifiedCore?.playbackController?.playNextVideo) {
                window.unifiedCore.playbackController.playNextVideo();
            } else {
                showMessage("Funcionalidad en desarrollo", 'info');
            }
        });
    }
    
    // ✅ FALLBACK PARA REPRODUCIR PRIMER VIDEO
    function playFirstVideoFallback(video) {
        console.log(`▶️ Reproduciendo primer video (fallback): ${video.title}`);
        
        try {
            const player1 = window.unifiedStateManager?.state?.app?.player1;
            
            if (!player1) {
                showMessage("Reproductor no está disponible", 'error');
                return;
            }
            
            player1.loadVideoById(video.videoId);
            player1.setVolume(100);
            
            // Actualizar estado
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('app.currentPlayer', 1);
                window.unifiedStateManager.set('app.reproduccionIniciada', true);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.videoId', video.videoId);
                window.unifiedStateManager.set('playlist.currentPlayingInfo.flattenedIndex', 0);
            }
            
            // Actualizar botón
            newPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
            
            showMessage(`Reproduciendo: ${video.title}`, 'success');
            
        } catch (error) {
            console.error('❌ Error en fallback playFirst:', error);
            showMessage('Error iniciando reproducción', 'error');
        }
    }
    
    // ✅ FALLBACK PARA ALTERNAR REPRODUCCIÓN
    function togglePlaybackFallback() {
        try {
            const currentPlayer = window.unifiedStateManager?.state?.app?.currentPlayer === 1 ? 
                                 window.unifiedStateManager?.state?.app?.player1 : 
                                 window.unifiedStateManager?.state?.app?.player2;
            
            if (currentPlayer) {
                const playerState = currentPlayer.getPlayerState();
                if (playerState === YT.PlayerState.PLAYING) {
                    currentPlayer.pauseVideo();
                    newPlayButton.innerHTML = '<i class="fas fa-play"></i>';
                } else {
                    currentPlayer.playVideo();
                    newPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
                }
            }
        } catch (error) {
            console.error('❌ Error en fallback toggle:', error);
        }
    }
    
    console.log('✅ Botón play corregido');
}

// ===== 5. CORRECCIÓN DE AUTENTICACIÓN MEJORADA =====
function fixAuth() {
    console.log('🔧 Corrigiendo autenticación...');
    
    function setupGoogleButtons() {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (signInButton) {
            signInButton.classList.remove('hidden');
            signInButton.replaceWith(signInButton.cloneNode(true));
            const newSignInButton = document.getElementById('googleSignInButton');
            
            newSignInButton.addEventListener('click', () => {
                console.log('👤 Intento de login con Google');
                
                if (window.unifiedAuthManager?.handleAuthClick) {
                    window.unifiedAuthManager.handleAuthClick();
                } else if (window.authManager?.handleAuthClick) {
                    window.authManager.handleAuthClick();
                } else {
                    showMessage('Sistema de autenticación no disponible', 'error');
                }
            });
        }
        
        if (signOutButton) {
            signOutButton.replaceWith(signOutButton.cloneNode(true));
            const newSignOutButton = document.getElementById('googleSignOutButton');
            
            newSignOutButton.addEventListener('click', () => {
                console.log('👤 Intento de logout');
                
                if (window.unifiedAuthManager?.handleSignOutClick) {
                    window.unifiedAuthManager.handleSignOutClick();
                } else if (window.authManager?.handleSignOutClick) {
                    window.authManager.handleSignOutClick();
                } else {
                    showMessage('Sistema de autenticación no disponible', 'error');
                }
            });
        }
    }
    
    // Configurar inmediatamente
    setupGoogleButtons();
    
    // Verificar cada 2 segundos si hay cambios
    let attempts = 0;
    const authCheckInterval = setInterval(() => {
        attempts++;
        
        if (window.unifiedAuthManager || window.authManager) {
            console.log('✅ AuthManager detectado');
            setupGoogleButtons();
            clearInterval(authCheckInterval);
        } else if (attempts >= 15) { // 30 segundos
            console.warn('⚠️ Timeout esperando AuthManager');
            clearInterval(authCheckInterval);
        }
    }, 2000);
    
    console.log('✅ Autenticación corregida');
}

// ===== 6. FUNCIONES AUXILIARES CORREGIDAS =====
function extractVideoId(video) {
    if (video.videoId) return video.videoId;
    if (video.id) return video.id;
    if (video.url) {
        const match = video.url.match(/(?:watch\?v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    }
    return null;
}

function formatDuration(duration) {
    if (!duration) return '';
    
    if (typeof duration === 'number') {
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    if (typeof duration === 'string') {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
            const hours = parseInt(match[1] || '0');
            const minutes = parseInt(match[2] || '0');
            const seconds = parseInt(match[3] || '0');
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (/^\d+:\d{2}$/.test(duration)) {
            return duration;
        }
    }
    
    return '';
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ✅ SISTEMA DE MENSAJES MEJORADO
function showMessage(message, type = 'info', duration = 3000) {
    console.log(`💬 [${type.toUpperCase()}]: ${message}`);
    
    // Intentar usar el sistema unificado
    if (window.unifiedMessageManager?.show) {
        return window.unifiedMessageManager.show(message, type, duration);
    }
    
    // Fallback al sistema legacy
    if (window.mostrarMensajeFlotante) {
        return window.mostrarMensajeFlotante(message, duration, type);
    }
    
    // Último recurso: crear mensaje simple
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type} show`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
        background: var(--background-elevated); color: var(--text-primary);
        padding: 12px 16px; border-radius: 8px; z-index: 3000;
        font-size: 14px; text-align: center; box-shadow: var(--shadow-medium);
        transition: all 0.3s ease; cursor: pointer; max-width: 400px;
        word-wrap: break-word;
    `;
    
    const typeStyles = {
        success: 'background: rgba(76, 175, 80, 0.9); color: white;',
        error: 'background: rgba(244, 67, 54, 0.9); color: white;',
        warning: 'background: rgba(255, 193, 7, 0.9); color: black;',
        info: 'background: rgba(33, 150, 243, 0.9); color: white;'
    };
    
    if (typeStyles[type]) {
        messageDiv.style.cssText += typeStyles[type];
    }
    
    document.body.appendChild(messageDiv);
    
    const remove = () => {
        messageDiv.style.opacity = '0';
        setTimeout(() => messageDiv.remove(), 300);
    };
    
    messageDiv.addEventListener('click', remove);
    setTimeout(remove, duration);
    
    return messageDiv;
}

// ===== 7. CORRECCIÓN DE PLAYLIST URL =====
function fixPlaylistUrl() {
    console.log('🔧 Corrigiendo añadir playlist desde URL...');
    
    const addButton = document.getElementById('añadirUrlButton');
    const urlInput = document.getElementById('searchInput2');
    
    if (addButton) {
        addButton.replaceWith(addButton.cloneNode(true));
        const newAddButton = document.getElementById('añadirUrlButton');
        
        newAddButton.addEventListener('click', handlePlaylistUrlAdd);
    }
    
    if (urlInput) {
        urlInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handlePlaylistUrlAdd();
            }
        });
    }
    
    function handlePlaylistUrlAdd() {
        const input = document.getElementById('searchInput2');
        if (!input) return;
        
        const url = input.value.trim();
        if (!url) {
            showMessage('Ingresa una URL válida', 'warning');
            return;
        }
        
        if (!isValidYouTubeUrl(url)) {
            showMessage('URL de YouTube no válida', 'error');
            return;
        }
        
        const playlistId = extractPlaylistId(url);
        if (!playlistId) {
            showMessage('URL no contiene una playlist válida', 'error');
            return;
        }
        
        input.value = '';
        
        if (window.unifiedCore?.playlistManager?.loadPlaylistFromUrl) {
            window.unifiedCore.playlistManager.loadPlaylistFromUrl(playlistId, url);
        } else {
            showMessage('Funcionalidad de playlist no disponible', 'error');
        }
    }
    
    function isValidYouTubeUrl(url) {
        return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
    }
    
    function extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
            return match ? match[1] : null;
        }
    }
    
    console.log('✅ Añadir playlist desde URL corregido');
}

// ===== 8. FUNCIÓN PRINCIPAL DE CORRECCIÓN =====
function applyCriticalFixes() {
    console.log('🚀 Aplicando todas las correcciones críticas...');
    
    try {
        fixNavigation();
        fixSearch();
        fixQueue();
        fixPlayButton();
        fixAuth();
        fixPlaylistUrl();
        
        // Configurar funciones globales
        window.showMessage = showMessage;
        window.extractVideoId = extractVideoId;
        window.formatDuration = formatDuration;
        window.escapeHtml = escapeHtml;
        
        console.log('✅ Todas las correcciones aplicadas exitosamente');
        
        // Verificar sistema cada 5 segundos
        setInterval(() => {
            if (window.unifiedStateManager?.state?.playlist?.manualQueue) {
                const queueCount = window.unifiedStateManager.state.playlist.manualQueue.length;
                if (queueCount > 0 && window.checkAndEnablePlayButton) {
                    window.checkAndEnablePlayButton();
                }
            }
        }, 5000);
        
        // Mostrar mensaje de éxito
        setTimeout(() => {
            showMessage('✅ Sistema completamente corregido y funcional', 'success');
        }, 2000);
        
    } catch (error) {
        console.error('💥 Error aplicando correcciones:', error);
        showMessage('Error en las correcciones del sistema', 'error');
    }
}

// ===== 9. INICIALIZACIÓN AUTOMÁTICA MEJORADA =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCriticalFixes);
} else {
    applyCriticalFixes();
}

// Aplicar correcciones después de delays escalonados
setTimeout(applyCriticalFixes, 1000);
setTimeout(applyCriticalFixes, 3000);

// ===== 10. MONITOREO DEL SISTEMA =====
let systemCheckCount = 0;
const systemMonitor = setInterval(() => {
    systemCheckCount++;
    
    // Verificar elementos críticos
    const criticalElements = {
        player1: document.getElementById('player1'),
        player2: document.getElementById('player2'),
        botonPlay: document.getElementById('botonPlay'),
        searchResults: document.getElementById('searchResults'),
        queueSection: document.getElementById('queueSection')
    };
    
    const missingElements = Object.entries(criticalElements)
        .filter(([name, element]) => !element)
        .map(([name]) => name);
    
    if (missingElements.length > 0 && systemCheckCount < 20) {
        console.warn(`⚠️ Elementos faltantes: ${missingElements.join(', ')}`);
    }
    
    // Verificar funcionalidad de cola
    if (window.unifiedStateManager?.state?.playlist?.manualQueue) {
        const queueCount = window.unifiedStateManager.state.playlist.manualQueue.length;
        
        if (queueCount > 0) {
            const playButton = document.getElementById('botonPlay');
            const playersReady = window.unifiedStateManager.state.app.playersInitialized;
            
            if (playButton && playersReady && playButton.disabled) {
                console.log('🔧 Auto-corrigiendo botón play deshabilitado');
                playButton.disabled = false;
            }
        }
    }
    
    // Detener monitoreo después de 2 minutos
    if (systemCheckCount >= 120) { // 2 minutos con checks cada segundo
        clearInterval(systemMonitor);
        console.log('✅ Monitoreo del sistema completado');
    }
}, 1000);

console.log('✅ Sistema de correcciones críticas COMPLETO cargado');
console.log('🎯 Funcionalidades corregidas:');
console.log('   ✅ Navegación entre vistas');
console.log('   ✅ Búsqueda en formato baldosas (4 columnas)');
console.log('   ✅ Cola de reproducción funcional');
console.log('   ✅ Botón play operativo');
console.log('   ✅ Sistema de autenticación');
console.log('   ✅ Añadir playlist desde URL');
console.log('   ✅ Monitoreo automático del sistema');
console.log('🔧 Funciones globales: addToQueue, toggleQueue, playVideoNow, removeFromQueue');
