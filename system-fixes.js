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
// ===== AUTH MANAGER INITIALIZATION FIX =====
// Solución al problema de authManager no disponible

console.log('🔧 Aplicando corrección para AuthManager...');

// ===== 1. MANAGER DE AUTENTICACIÓN MEJORADO =====
class AuthManagerFix {
    constructor() {
        this.isReady = false;
        this.retryCount = 0;
        this.maxRetries = 10;
        this.checkInterval = null;
        
        this.init();
    }
    
    async init() {
        console.log('🔐 Inicializando AuthManager Fix...');
        
        // Esperar a que los scripts de Google se carguen
        await this.waitForGoogleAPIs();
        
        // Intentar obtener el authManager existente o crear uno nuevo
        await this.ensureAuthManager();
        
        // Configurar listeners
        this.setupEventListeners();
        
        this.isReady = true;
        console.log('✅ AuthManager Fix listo');
    }
    
    async waitForGoogleAPIs() {
        return new Promise((resolve) => {
            const checkGoogleAPIs = () => {
                if (window.gapi && window.google?.accounts) {
                    console.log('✅ Google APIs disponibles');
                    resolve();
                } else {
                    setTimeout(checkGoogleAPIs, 500);
                }
            };
            
            checkGoogleAPIs();
            
            // Timeout de 30 segundos
            setTimeout(() => {
                console.warn('⚠️ Timeout esperando Google APIs');
                resolve(); // Continuar de todos modos
            }, 30000);
        });
    }
    
    async ensureAuthManager() {
        // Verificar si authManager ya existe
        if (window.authManager && window.authManager.initialize) {
            console.log('✅ AuthManager existente encontrado');
            
            // Asegurar que esté inicializado
            if (!window.authManager.gapiReady) {
                try {
                    await window.authManager.initialize();
                } catch (error) {
                    console.error('❌ Error inicializando authManager existente:', error);
                }
            }
            return;
        }
        
        // Si no existe, intentar cargarlo
        await this.loadAuthManager();
    }
    
    async loadAuthManager() {
        console.log('📦 Intentando cargar AuthManager...');
        
        try {
            // Intentar importar auth.js si es module
            if (typeof import !== 'undefined') {
                try {
                    const authModule = await import('./auth.js');
                    if (authModule.authManager) {
                        window.authManager = authModule.authManager;
                        console.log('✅ AuthManager importado como módulo');
                        return;
                    }
                } catch (e) {
                    console.log('📝 No se pudo importar como módulo, continuando...');
                }
            }
            
            // Verificar cada segundo si authManager se carga
            this.checkInterval = setInterval(() => {
                if (window.authManager) {
                    console.log('✅ AuthManager detectado');
                    clearInterval(this.checkInterval);
                    
                    // Inicializar si no está listo
                    if (!window.authManager.gapiReady) {
                        window.authManager.initialize().catch(error => {
                            console.error('❌ Error inicializando authManager:', error);
                        });
                    }
                }
                
                this.retryCount++;
                if (this.retryCount >= this.maxRetries) {
                    console.warn('⚠️ Timeout esperando authManager, creando fallback...');
                    clearInterval(this.checkInterval);
                    this.createFallbackAuth();
                }
            }, 1000);
            
        } catch (error) {
            console.error('❌ Error cargando AuthManager:', error);
            this.createFallbackAuth();
        }
    }
    
    createFallbackAuth() {
        console.log('🔄 Creando AuthManager fallback...');
        
        window.authManager = {
            isAuthenticated: false,
            gapiReady: false,
            gisReady: false,
            
            async initialize() {
                console.log('🔄 Inicializando AuthManager fallback...');
                
                try {
                    // Cargar GAPI
                    await new Promise((resolve) => {
                        if (window.gapi) {
                            gapi.load('client', {
                                callback: resolve,
                                onerror: () => {
                                    console.error('❌ Error cargando GAPI client');
                                    resolve();
                                }
                            });
                        } else {
                            resolve();
                        }
                    });
                    
                    if (window.gapi?.client) {
                        await gapi.client.init({
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
                        });
                        this.gapiReady = true;
                    }
                    
                    // Configurar GIS
                    if (window.google?.accounts) {
                        this.tokenClient = google.accounts.oauth2.initTokenClient({
                            client_id: "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com",
                            scope: 'https://www.googleapis.com/auth/youtube.readonly',
                            callback: (tokenResponse) => {
                                this.handleTokenResponse(tokenResponse);
                            }
                        });
                        this.gisReady = true;
                    }
                    
                    console.log('✅ AuthManager fallback inicializado');
                    
                } catch (error) {
                    console.error('❌ Error en AuthManager fallback:', error);
                }
            },
            
            handleAuthClick() {
                if (!this.gapiReady || !this.gisReady) {
                    window.unifiedCore?.showMessage?.('APIs de Google no están listas', 'error');
                    return;
                }
                
                if (this.tokenClient) {
                    this.tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    window.unifiedCore?.showMessage?.('Cliente OAuth no disponible', 'error');
                }
            },
            
            handleTokenResponse(tokenResponse) {
                if (tokenResponse && tokenResponse.access_token) {
                    try {
                        if (window.gapi?.client) {
                            gapi.client.setToken(tokenResponse);
                        }
                        
                        const tokenData = {
                            ...tokenResponse,
                            timestamp: Date.now()
                        };
                        localStorage.setItem('google_token', JSON.stringify(tokenData));
                        
                        this.isAuthenticated = true;
                        this.updateUI(true);
                        
                        window.unifiedCore?.showMessage?.('Autenticación exitosa', 'success');
                        
                        // Intentar cargar playlists
                        this.getPlaylists();
                        
                    } catch (error) {
                        console.error('❌ Error procesando token:', error);
                        window.unifiedCore?.showMessage?.('Error procesando autenticación', 'error');
                    }
                } else {
                    this.isAuthenticated = false;
                    this.updateUI(false);
                    window.unifiedCore?.showMessage?.('Autenticación fallida', 'error');
                }
            },
            
            handleSignOutClick() {
                try {
                    const token = gapi.client.getToken();
                    
                    if (token && token.access_token) {
                        google.accounts.oauth2.revoke(token.access_token, () => {
                            console.log('Token revocado');
                        });
                        gapi.client.setToken('');
                    }
                    
                    localStorage.removeItem('google_token');
                    
                    this.isAuthenticated = false;
                    this.updateUI(false);
                    
                    document.dispatchEvent(new CustomEvent('userLoggedOut'));
                    window.unifiedCore?.showMessage?.('Sesión cerrada', 'success');
                    
                } catch (error) {
                    console.error('❌ Error cerrando sesión:', error);
                    
                    // Forzar limpieza
                    localStorage.removeItem('google_token');
                    this.isAuthenticated = false;
                    this.updateUI(false);
                    
                    document.dispatchEvent(new CustomEvent('userLoggedOut'));
                }
            },
            
            updateUI(isLoggedIn) {
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
            },
            
            isUserAuthenticated() {
                return this.isAuthenticated && this.gapiReady;
            },
            
            async getPlaylists() {
                window.unifiedCore?.showMessage?.('Función de playlists en desarrollo', 'info');
            }
        };
        
        // Inicializar el fallback
        window.authManager.initialize();
    }
    
    setupEventListeners() {
        // Listener para cuando se detecte authManager
        document.addEventListener('authManagerReady', () => {
            console.log('📢 AuthManager listo detectado');
            this.setupGoogleButtons();
        });
        
        // Setup inicial de botones
        this.setupGoogleButtons();
    }
    
    setupGoogleButtons() {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (signInButton) {
            // Remover listeners existentes
            signInButton.replaceWith(signInButton.cloneNode(true));
            const newSignInButton = document.getElementById('googleSignInButton');
            
            newSignInButton.addEventListener('click', () => {
                console.log('👤 Click en botón de login');
                this.handleGoogleSignIn();
            });
            
            newSignInButton.classList.remove('hidden');
            newSignInButton.disabled = false;
        }
        
        if (signOutButton) {
            // Remover listeners existentes
            signOutButton.replaceWith(signOutButton.cloneNode(true));
            const newSignOutButton = document.getElementById('googleSignOutButton');
            
            newSignOutButton.addEventListener('click', () => {
                console.log('👤 Click en botón de logout');
                this.handleGoogleSignOut();
            });
        }
        
        console.log('✅ Botones de Google configurados');
    }
    
    handleGoogleSignIn() {
        console.log('🔑 Procesando login de Google...');
        
        if (window.authManager && window.authManager.handleAuthClick) {
            console.log('✅ Usando authManager original');
            window.authManager.handleAuthClick();
        } else {
            console.log('⚠️ AuthManager no disponible, usando fallback...');
            
            if (window.authManager?.handleAuthClick) {
                window.authManager.handleAuthClick();
            } else {
                window.unifiedCore?.showMessage?.('Sistema de autenticación no está listo', 'error');
                
                // Intentar reinicializar
                this.ensureAuthManager();
            }
        }
    }
    
    handleGoogleSignOut() {
        console.log('🔓 Procesando logout de Google...');
        
        if (window.authManager && window.authManager.handleSignOutClick) {
            window.authManager.handleSignOutClick();
        } else {
            window.unifiedCore?.showMessage?.('Sistema de autenticación no disponible', 'error');
        }
    }
    
    // Método de debugging
    getStatus() {
        return {
            isReady: this.isReady,
            authManagerExists: !!window.authManager,
            authManagerInitialized: window.authManager?.gapiReady || false,
            googleAPIsAvailable: !!(window.gapi && window.google?.accounts),
            retryCount: this.retryCount,
            timestamp: Date.now()
        };
    }
}

// ===== 2. CORRECCIÓN DE SISTEMA DE PLAYLISTS =====
function fixPlaylistSystem() {
    console.log('🔧 Corrigiendo sistema de playlists...');
    
    // Función global para añadir videos a cola
    window.addVideoToQueue = function(videoId, title, thumbnail, author) {
        console.log(`➕ Añadiendo video a cola: ${title}`);
        
        const videoData = {
            videoId: videoId,
            title: title || 'Título no disponible',
            thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/default.jpg`,
            channelTitle: author || 'Desconocido',
            duration: 0
        };
        
        // Intentar múltiples sistemas
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
        
        // 2. PlaylistManager
        if (!success && window.PlaylistManager?.addVideoToManualPlaylist) {
            try {
                const result = window.PlaylistManager.addVideoToManualPlaylist(videoData);
                if (result) {
                    success = true;
                    console.log('✅ Video añadido vía PlaylistManager');
                }
            } catch (error) {
                console.warn('⚠️ Error en PlaylistManager:', error);
            }
        }
        
        // 3. Sistema legacy
        if (!success && window.addVideoToManualPlaylist) {
            try {
                window.addVideoToManualPlaylist(videoData);
                success = true;
                console.log('✅ Video añadido vía sistema legacy');
            } catch (error) {
                console.warn('⚠️ Error en sistema legacy:', error);
            }
        }
        
        // 4. Fallback - crear sistema básico
        if (!success) {
            console.log('🔄 Creando sistema básico de cola...');
            
            if (!window.manualQueue) {
                window.manualQueue = [];
            }
            
            // Verificar duplicados
            if (!window.manualQueue.find(v => v.videoId === videoId)) {
                window.manualQueue.push(videoData);
                success = true;
                
                console.log(`✅ Video añadido a cola básica (${window.manualQueue.length} videos)`);
                
                // Actualizar UI si existe
                if (window.UIManager?.updateQueueContent) {
                    window.UIManager.updateQueueContent();
                }
            } else {
                console.log('⚠️ Video ya existe en la cola');
            }
        }
        
        // Mostrar resultado
        if (success) {
            window.unifiedCore?.showMessage?.(`"${title}" añadido a la cola`, 'success');
        } else {
            window.unifiedCore?.showMessage?.('Error añadiendo video a la cola', 'error');
        }
        
        return success;
    };
    
    console.log('✅ Sistema de playlists corregido');
}

// ===== 3. INICIALIZACIÓN Y SETUP =====
let authManagerFix = null;

function initializeAuthFix() {
    console.log('🚀 Inicializando corrección de autenticación...');
    
    try {
        // Crear el fix manager
        authManagerFix = new AuthManagerFix();
        
        // Corregir sistema de playlists
        fixPlaylistSystem();
        
        // Exponer funciones globales
        window.authManagerFix = authManagerFix;
        
        // Función de debugging
        window.debugAuth = function() {
            console.log('🔧 Auth Debug Info:');
            console.table(authManagerFix.getStatus());
            
            console.log('📊 Managers disponibles:');
            console.log('- authManager:', !!window.authManager);
            console.log('- unifiedCore:', !!window.unifiedCore);
            console.log('- PlaylistManager:', !!window.PlaylistManager);
            console.log('- UIManager:', !!window.UIManager);
            
            if (window.unifiedCore?.showMessage) {
                window.unifiedCore.showMessage('Debug info en consola', 'info');
            }
        };
        
        console.log('✅ Corrección de autenticación inicializada');
        
    } catch (error) {
        console.error('💥 Error inicializando corrección de auth:', error);
    }
}

// ===== 4. AUTO-INICIALIZACIÓN =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuthFix);
} else {
    initializeAuthFix();
}

// También inicializar después de un delay para asegurar que otros scripts carguen
setTimeout(initializeAuthFix, 1000);

console.log('✅ Auth Manager Fix cargado');
console.log('🔧 Debug disponible: window.debugAuth()');
