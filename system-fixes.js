// ===== CORRECCIONES CRÍTICAS PARA YT CROSSMIX =====
// Archivo: critical-fixes.js
// Soluciona problemas de navegación, búsqueda, autenticación y URLs

console.log('🔧 Aplicando correcciones críticas...');

// ===== 1. CORRECCIÓN DE NAVEGACIÓN ENTRE PESTAÑAS =====
function fixNavigation() {
    console.log('🔧 Corrigiendo navegación...');
    
    // Función para cambiar vistas
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

// ===== 2. CORRECCIÓN DE BÚSQUEDA =====
function fixSearch() {
    console.log('🔧 Corrigiendo búsqueda...');
    
    // Función de búsqueda unificada
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
        searchResults.innerHTML = `
            <div class="search-loading" style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-color);"></i>
                <p style="margin-top: 16px; color: var(--text-secondary);">Buscando...</p>
            </div>
        `;
        
        try {
            // Usar instancias de Piped
            const pipedInstances = [
                "https://api.piped.private.coffee",
                "https://pipedapi.ducks.party",
                "https://api.piped.video"
            ];
            
            let searchData = null;
            
            // Intentar con múltiples instancias
            for (const instance of pipedInstances) {
                try {
                    console.log(`🔗 Probando instancia: ${instance}`);
                    
                    const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        },
                        signal: AbortSignal.timeout(10000) // 10s timeout
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
    }
    
    // Mostrar resultados
    function displaySearchResults(data) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        const items = data.items || data.relatedStreams || [];
        
        if (!items || items.length === 0) {
            searchResults.innerHTML = `
                <div class="search-placeholder" style="text-align: center; padding: 40px;">
                    <i class="fas fa-search" style="font-size: 24px; opacity: 0.5; margin-bottom: 16px;"></i>
                    <p style="color: var(--text-secondary);">No se encontraron resultados</p>
                </div>
            `;
            return;
        }
        
        searchResults.innerHTML = '';
        
        items.forEach(video => {
            const videoId = extractVideoId(video);
            if (!videoId) return;
            
            const videoElement = createVideoResultElement(video, videoId);
            searchResults.appendChild(videoElement);
        });
        
        console.log(`✅ ${items.length} resultados mostrados`);
    }
    
    function extractVideoId(video) {
        if (video.videoId) return video.videoId;
        if (video.id) return video.id;
        if (video.url) {
            const match = video.url.match(/(?:watch\?v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            return match ? match[1] : null;
        }
        return null;
    }
    
    function createVideoResultElement(video, videoId) {
        const videoDiv = document.createElement('div');
        videoDiv.className = 'video-result';
        videoDiv.dataset.videoId = videoId;
        
        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        const duration = formatDuration(video.duration);
        const title = escapeHtml(video.title || 'Título no disponible');
        const author = escapeHtml(video.uploaderName || video.channelTitle || 'Desconocido');
        
        videoDiv.innerHTML = `
            <div class="thumbnail-container">
                <img src="${thumbnailUrl}" alt="${title}" class="thumbnail" loading="lazy">
                ${duration ? `<span class="duration">${duration}</span>` : ''}
            </div>
            <div class="video-details">
                <h3 class="video-title">${title}</h3>
                <p class="video-author">${author}</p>
                <button class="search-result-add-button" onclick="addToQueue('${videoId}', '${title.replace(/'/g, "\\'")}', '${thumbnailUrl}', '${author.replace(/'/g, "\\'")}')">
                    <i class="fa-solid fa-arrow-right-to-line"></i>
                    <span class="add-text">Reproducir Después</span>
                </button>
            </div>
        `;
        
        return videoDiv;
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
    window.addToQueue = addToQueue;
    
    console.log('✅ Búsqueda corregida');
}

// ===== 3. CORRECCIÓN DE AUTENTICACIÓN =====
function fixAuth() {
    console.log('🔧 Corrigiendo autenticación...');
    
    // Configurar botones de Google
    function setupGoogleButtons() {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (signInButton) {
            signInButton.classList.remove('hidden');
            signInButton.addEventListener('click', () => {
                console.log('👤 Intento de login con Google');
                
                if (window.authManager && window.authManager.handleAuthClick) {
                    window.authManager.handleAuthClick();
                } else {
                    showMessage('Sistema de autenticación no disponible', 'error');
                }
            });
        }
        
        if (signOutButton) {
            signOutButton.addEventListener('click', () => {
                console.log('👤 Intento de logout');
                
                if (window.authManager && window.authManager.handleSignOutClick) {
                    window.authManager.handleSignOutClick();
                } else {
                    showMessage('Sistema de autenticación no disponible', 'error');
                }
            });
        }
    }
    
    // Verificar estado de autenticación
    function checkAuthState() {
        if (window.authManager && window.authManager.isUserAuthenticated) {
            const isAuth = window.authManager.isUserAuthenticated();
            updateAuthUI(isAuth);
            return isAuth;
        }
        return false;
    }
    
    function updateAuthUI(isLoggedIn) {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (signInButton && signOutButton) {
            if (isLoggedIn) {
                signInButton.classList.add('hidden');
                signOutButton.classList.remove('hidden');
            } else {
                signInButton.classList.remove('hidden');
                signOutButton.classList.add('hidden');
            }
        }
    }
    
    // Configurar inmediatamente
    setupGoogleButtons();
    
    // Verificar cada 2 segundos si hay cambios en authManager
    const authCheckInterval = setInterval(() => {
        if (window.authManager) {
            checkAuthState();
            clearInterval(authCheckInterval);
        }
    }, 2000);
    
    // Timeout para evitar bucle infinito
    setTimeout(() => {
        clearInterval(authCheckInterval);
    }, 30000);
    
    console.log('✅ Autenticación corregida');
}

// ===== 4. CORRECCIÓN DE URLs DE PLAYLIST =====
function fixPlaylistUrl() {
    console.log('🔧 Corrigiendo añadir playlist desde URL...');
    
    function handlePlaylistUrlAdd() {
        const input = document.getElementById('searchInput2');
        if (!input) {
            console.error('❌ Input de URL no encontrado');
            return;
        }
        
        const url = input.value.trim();
        if (!url) {
            showMessage('Ingresa una URL válida', 'warning');
            return;
        }
        
        console.log(`🔗 Procesando URL: ${url}`);
        
        // Validar URL de YouTube
        if (!isValidYouTubeUrl(url)) {
            showMessage('URL de YouTube no válida', 'error');
            return;
        }
        
        // Extraer playlist ID
        const playlistId = extractPlaylistId(url);
        if (!playlistId) {
            showMessage('URL no contiene una playlist válida', 'error');
            return;
        }
        
        console.log(`📋 ID de playlist extraído: ${playlistId}`);
        
        // Limpiar input
        input.value = '';
        
        // Procesar playlist
        loadPlaylistFromUrl(playlistId, url);
    }
    
    async function loadPlaylistFromUrl(playlistId, originalUrl) {
        showMessage('Cargando playlist...', 'info');
        
        try {
            // Intentar cargar desde Piped
            const pipedInstances = [
                "https://api.piped.private.coffee",
                "https://pipedapi.ducks.party"
            ];
            
            let playlistData = null;
            
            for (const instance of pipedInstances) {
                try {
                    console.log(`🔗 Intentando cargar playlist desde: ${instance}`);
                    
                    const response = await fetch(`${instance}/playlists/${playlistId}`, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(15000)
                    });
                    
                    if (response.ok) {
                        playlistData = await response.json();
                        console.log(`✅ Playlist cargada desde: ${instance}`);
                        break;
                    }
                } catch (error) {
                    console.warn(`⚠️ Error en instancia ${instance}:`, error.message);
                    continue;
                }
            }
            
            if (!playlistData) {
                throw new Error('No se pudo cargar la playlist desde ninguna instancia');
            }
            
            // Procesar datos de la playlist
            const processedPlaylist = {
                id: playlistId,
                name: playlistData.name || 'Playlist Sin Nombre',
                thumbnailUrl: playlistData.thumbnailUrl || 'https://via.placeholder.com/320x180/333333/ffffff?text=Playlist',
                videos: [],
                isExpanded: true,
                source: 'external'
            };
            
            // Procesar videos
            if (playlistData.relatedStreams && Array.isArray(playlistData.relatedStreams)) {
                processedPlaylist.videos = playlistData.relatedStreams
                    .filter(video => video && extractVideoId(video))
                    .map(video => ({
                        videoId: extractVideoId(video),
                        title: video.title || 'Título Desconocido',
                        thumbnail: video.thumbnail || `https://img.youtube.com/vi/${extractVideoId(video)}/default.jpg`,
                        duration: parseDuration(video.duration) || 0,
                        channelTitle: video.uploaderName || 'YouTube'
                    }));
            }
            
            if (processedPlaylist.videos.length === 0) {
                throw new Error('La playlist no contiene videos válidos');
            }
            
            // Añadir playlist al estado
            addPlaylistToState(processedPlaylist);
            
            showMessage(`Playlist "${processedPlaylist.name}" cargada (${processedPlaylist.videos.length} videos)`, 'success');
            
            // Cambiar a vista de biblioteca
            if (window.switchView) {
                window.switchView('library');
            }
            
        } catch (error) {
            console.error('❌ Error cargando playlist:', error);
            showMessage(`Error cargando playlist: ${error.message}`, 'error');
        }
    }
    
    function addPlaylistToState(playlist) {
        // Si existe un estado unificado, usarlo
        if (window.unifiedStateManager && window.unifiedStateManager.state) {
            const currentPlaylists = window.unifiedStateManager.state.playlist.playlistsData || [];
            
            // Verificar duplicados
            if (currentPlaylists.some(p => p.id === playlist.id)) {
                showMessage('Esta playlist ya está cargada', 'warning');
                return;
            }
            
            const updatedPlaylists = [...currentPlaylists, playlist];
            window.unifiedStateManager.set('playlist.playlistsData', updatedPlaylists);
            
            // Actualizar UI si existe
            if (window.UIManager && window.UIManager.updatePlaylistsUI) {
                setTimeout(() => window.UIManager.updatePlaylistsUI(), 100);
            }
        }
        // Fallback a variable global
        else if (window.playlistsData) {
            if (window.playlistsData.some(p => p.id === playlist.id)) {
                showMessage('Esta playlist ya está cargada', 'warning');
                return;
            }
            
            window.playlistsData.push(playlist);
            
            // Actualizar UI si existe función global
            if (window.updatePlaylistsUI) {
                setTimeout(() => window.updatePlaylistsUI(), 100);
            }
        }
        
        console.log(`✅ Playlist añadida: ${playlist.name} (${playlist.videos.length} videos)`);
    }
    
    // Configurar listener del botón
    const addButton = document.getElementById('añadirUrlButton');
    if (addButton) {
        addButton.addEventListener('click', handlePlaylistUrlAdd);
        console.log('✅ Botón de añadir URL configurado');
    }
    
    // Configurar listener del input (Enter key)
    const urlInput = document.getElementById('searchInput2');
    if (urlInput) {
        urlInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handlePlaylistUrlAdd();
            }
        });
        console.log('✅ Input de URL configurado');
    }
    
    console.log('✅ Añadir playlist desde URL corregido');
}

// ===== 5. FUNCIONES AUXILIARES =====
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
        // PT format
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
        
        // Already formatted
        if (/^\d+:\d{2}$/.test(duration)) {
            return duration;
        }
    }
    
    return '';
}

function parseDuration(duration) {
    if (!duration) return 0;
    
    if (typeof duration === 'number') return Math.floor(duration);
    
    if (typeof duration === 'string') {
        // PT format
        const ptMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (ptMatch) {
            const hours = parseInt(ptMatch[1] || '0');
            const minutes = parseInt(ptMatch[2] || '0');
            const seconds = parseFloat(ptMatch[3] || '0');
            return Math.floor(hours * 3600 + minutes * 60 + seconds);
        }
        
        // MM:SS format
        const timeMatch = duration.match(/^(\d+):(\d{2})$/);
        if (timeMatch) {
            const minutes = parseInt(timeMatch[1]);
            const seconds = parseInt(timeMatch[2]);
            return minutes * 60 + seconds;
        }
    }
    
    return 0;
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Función para añadir videos a la cola
function addToQueue(videoId, title, thumbnail, author) {
    console.log(`➕ Añadiendo a cola: ${title}`);
    
    const videoData = {
        videoId: videoId,
        title: title,
        thumbnail: thumbnail,
        channelTitle: author,
        duration: 0
    };
    
    // Intentar usar el sistema unificado
    if (window.PlaylistManager && window.PlaylistManager.addVideoToManualPlaylist) {
        const result = window.PlaylistManager.addVideoToManualPlaylist(videoData);
        if (result) {
            showMessage(`"${title}" añadido a la cola`, 'success');
        }
    }
    // Fallback al sistema legacy
    else if (window.addVideoToManualPlaylist) {
        window.addVideoToManualPlaylist(videoData);
    }
    // Último recurso: mensaje de error
    else {
        showMessage('Sistema de playlists no disponible', 'error');
    }
}

// Sistema de mensajes mejorado
function showMessage(message, type = 'info', duration = 3000) {
    console.log(`💬 Mensaje [${type}]: ${message}`);
    
    // Intentar usar el sistema unificado
    if (window.unifiedMessageManager && window.unifiedMessageManager.show) {
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
        transition: all 0.3s ease; cursor: pointer;
    `;
    
    // Tipo-specific styling
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
    
    // Auto-remove
    const remove = () => {
        messageDiv.style.opacity = '0';
        setTimeout(() => messageDiv.remove(), 300);
    };
    
    messageDiv.addEventListener('click', remove);
    setTimeout(remove, duration);
    
    return messageDiv;
}

// ===== 6. FUNCIÓN PRINCIPAL DE CORRECCIÓN =====
function applyCriticalFixes() {
    console.log('🚀 Aplicando todas las correcciones críticas...');
    
    try {
        fixNavigation();
        fixSearch();
        fixAuth();
        fixPlaylistUrl();
        
        // Configurar funciones globales
        window.showMessage = showMessage;
        window.isValidYouTubeUrl = isValidYouTubeUrl;
        window.extractPlaylistId = extractPlaylistId;
        window.formatDuration = formatDuration;
        window.parseDuration = parseDuration;
        window.escapeHtml = escapeHtml;
        
        console.log('✅ Todas las correcciones aplicadas exitosamente');
        
        // Mostrar mensaje de éxito
        setTimeout(() => {
            showMessage('Sistema corregido y listo para usar', 'success');
        }, 1000);
        
    } catch (error) {
        console.error('💥 Error aplicando correcciones:', error);
        showMessage('Error en las correcciones del sistema', 'error');
    }
}

// ===== 7. INICIALIZACIÓN AUTOMÁTICA =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCriticalFixes);
} else {
    applyCriticalFixes();
}

// Aplicar correcciones después de un delay para asegurar que otros scripts carguen
setTimeout(applyCriticalFixes, 2000);

console.log('✅ Sistema de correcciones críticas cargado');
