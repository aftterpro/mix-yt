//  Sistema de Integración Corregido para YT CrossMix - VERSIÓN CORREGIDA
class YTCrossMixIntegration {
    constructor() {
        this.isInitialized = false;
        this.modules = new Map();
        this.domReady = false;
        this.initPromise = null;
        
        // Estados de la aplicación
        this.currentView = 'home';
        this.isPlaying = false;
        this.currentTrack = null;
        
        // Referencias DOM críticas
        this.domElements = {
            // Headers y navegación
            mobileHeader: null,
            bottomNav: null,
            miniPlayer: null,
            
            // Vistas principales - CORREGIDO: usar querySelectorAll para arrays
            contentViews: null,
            searchResults: null,
            playlistsGrid: null,
            
            // Controles
            searchInput: null,
            playButton: null,
            nextButton: null,
            miniPlayBtn: null,
            miniNextBtn: null,
            
            // Contenedores
            videoContainer: null,
            playlistContainer: null,
            floatingMessages: null
        };
        
        this.setupEventListeners();
    }

    // Inicialización principal
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    async _doInitialize() {
        try {
            console.log('🚀 Iniciando YT CrossMix Integration...');
            
            // 1. Esperar a que el DOM esté listo
            await this.waitForDOM();
            
            // 2. Obtener referencias DOM
            this.getDOMReferences();
            
            // 3. Verificar elementos críticos
            this.verifyDOMElements();
            
            // 4. Configurar navegación móvil
            this.setupMobileNavigation();
            
            // 5. Configurar controles de reproducción
            this.setupPlaybackControls();
            
            // 6. Configurar búsqueda
            this.setupSearch();
            
            // 7. Configurar mini player
            this.setupMiniPlayer();
            
            // 8. Configurar manejo de errores
            this.setupErrorHandling();
            
            // 9. Inicializar vista por defecto
            this.switchView('home');
            
            // 10. Marcar como inicializado
            this.isInitialized = true;
            
            console.log('✅ YT CrossMix Integration inicializado correctamente');
            this.dispatchEvent('integrationReady');
            
            return true;
        } catch (error) {
            console.error('💥 Error en inicialización:', error);
            this.showError('Error al inicializar la aplicación');
            throw error;
        }
    }

    // Esperar a que el DOM esté listo
    waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            } else {
                resolve();
            }
        });
    }

    // Obtener referencias a elementos DOM críticos - CORREGIDO
    getDOMReferences() {
        const elements = {
            // Headers y navegación
            mobileHeader: '#mobileHeader, .mobile-header',
            bottomNav: '#bottomNav, .bottom-nav',
            miniPlayer: '#miniPlayer, .mini-player',
            
            // Vistas principales - USAR querySelectorAll para arrays
            searchResults: '#searchResults',
            playlistsGrid: '#playlistsGrid',
            
            // Controles
            searchInput: '#searchInput',
            playButton: '#botonPlay, #playButton',
            nextButton: '#botonNext, #nextButton',
            miniPlayBtn: '#miniPlayBtn',
            miniNextBtn: '#miniNextBtn',
            
            // Contenedores
            videoContainer: '#videoContainer',
            playlistContainer: '#playlistContainer',
            floatingMessages: '#floatingMessageContainer'
        };

        Object.entries(elements).forEach(([key, selector]) => {
            const element = document.querySelector(selector);
            this.domElements[key] = element;
            
            if (!element) {
                console.warn(`⚠️ Elemento no encontrado: ${selector}`);
            }
        });
        
        // CORREGIDO: Obtener contentViews como NodeList
        this.domElements.contentViews = document.querySelectorAll('.content-view');
        console.log(`📱 Encontradas ${this.domElements.contentViews.length} vistas de contenido`);
    }

    // Verificar elementos DOM críticos
    verifyDOMElements() {
        const critical = ['searchInput'];
        const missing = critical.filter(key => !this.domElements[key]);
        
        if (missing.length > 0) {
            throw new Error(`Elementos DOM críticos faltantes: ${missing.join(', ')}`);
        }
        
        // Verificar que contentViews tenga elementos
        if (!this.domElements.contentViews || this.domElements.contentViews.length === 0) {
            throw new Error('No se encontraron vistas de contenido (.content-view)');
        }
    }

    // Configurar navegación móvil
    setupMobileNavigation() {
        // Navegación bottom
        if (this.domElements.bottomNav) {
            this.domElements.bottomNav.addEventListener('click', (e) => {
                const navTab = e.target.closest('.nav-tab');
                if (!navTab) return;
                
                const view = navTab.dataset.view;
                if (view) {
                    this.switchView(view);
                }
            });
        }

        // Navegación sidebar (desktop)
        const sidebarNavItems = document.querySelectorAll('.nav-item[data-view]');
        sidebarNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                if (view) {
                    this.switchView(view);
                }
            });
        });
    }

    // Cambiar vista activa - CORREGIDO
    switchView(newView) {
        if (this.currentView === newView) return;
        
        console.log(`📱 Cambiando vista: ${this.currentView} → ${newView}`);
        
        // CORREGIDO: Usar forEach en NodeList
        if (this.domElements.contentViews && this.domElements.contentViews.length > 0) {
            this.domElements.contentViews.forEach(view => {
                const isActive = view.id === `${newView}View`;
                view.classList.toggle('active', isActive);
            });
        }

        // Actualizar navegación bottom
        if (this.domElements.bottomNav) {
            const navTabs = this.domElements.bottomNav.querySelectorAll('.nav-tab');
            navTabs.forEach(tab => {
                const isActive = tab.dataset.view === newView;
                tab.classList.toggle('active', isActive);
            });
        }

        // Actualizar navegación sidebar
        const sidebarItems = document.querySelectorAll('.nav-item');
        sidebarItems.forEach(item => {
            const isActive = item.dataset.view === newView;
            item.classList.toggle('active', isActive);
        });

        const oldView = this.currentView;
        this.currentView = newView;

        // Acciones específicas por vista
        this.handleViewChange(oldView, newView);
        
        // Disparar evento
        this.dispatchEvent('viewChanged', { 
            from: oldView, 
            to: newView 
        });
    }

    // Manejar cambio de vista
    handleViewChange(fromView, toView) {
        switch (toView) {
            case 'search':
                // Focus en búsqueda
                if (this.domElements.searchInput) {
                    setTimeout(() => {
                        this.domElements.searchInput.focus();
                    }, 100);
                }
                break;
                
            case 'playing':
                // Asegurar que el video container esté visible
                if (this.domElements.videoContainer) {
                    this.domElements.videoContainer.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
                break;
                
            case 'library':
                // Cargar playlists si es necesario
                this.loadLibraryContent();
                break;
        }
    }

    // Configurar controles de reproducción
    setupPlaybackControls() {
        // Botón play principal
        if (this.domElements.playButton) {
            this.domElements.playButton.addEventListener('click', () => {
                this.handlePlayPause();
            });
        }

        // Botón next principal
        if (this.domElements.nextButton) {
            this.domElements.nextButton.addEventListener('click', () => {
                this.handleNext();
            });
        }
    }

    // Configurar mini player
    setupMiniPlayer() {
        if (!this.domElements.miniPlayer) return;

        // Click en mini player va a playing view
        this.domElements.miniPlayer.addEventListener('click', (e) => {
            if (!e.target.closest('.mini-control-btn')) {
                this.switchView('playing');
            }
        });

        // Controles mini player
        if (this.domElements.miniPlayBtn) {
            this.domElements.miniPlayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handlePlayPause();
            });
        }

        if (this.domElements.miniNextBtn) {
            this.domElements.miniNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleNext();
            });
        }
    }

    // Configurar búsqueda
    setupSearch() {
        if (!this.domElements.searchInput) return;

        let searchTimeout = null;

        this.domElements.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            // Limpiar timeout anterior
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // Cambiar a vista de búsqueda automáticamente si hay query
            if (query.length > 0 && this.currentView !== 'search') {
                this.switchView('search');
            }
            
            // Debounce de búsqueda
            searchTimeout = setTimeout(() => {
                if (query.length > 2) {
                    this.performSearch(query);
                } else if (query.length === 0) {
                    this.clearSearchResults();
                }
            }, 300);
        });

        // Enter para buscar
        this.domElements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = e.target.value.trim();
                if (query.length > 0) {
                    this.performSearch(query);
                }
            }
        });
    }

    // Configurar manejo de errores
    setupErrorHandling() {
        // Error global de JavaScript
        window.addEventListener('error', (e) => {
            console.error('Error global capturado:', e.error);
            this.showError('Error en la aplicación: ' + e.message);
        });

        // Error de promesas no capturadas
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Promise rechazada:', e.reason);
            this.showError('Error de conexión o carga');
            e.preventDefault();
        });
    }

    // Configurar listeners de eventos globales
    setupEventListeners() {
        // Resize y orientación
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 250));

        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.handleResize(), 100);
        });

        // Estados de conexión
        window.addEventListener('online', () => {
            this.showMessage('Conexión restaurada');
        });

        window.addEventListener('offline', () => {
            this.showMessage('Sin conexión a internet');
        });

        // Prevenir zoom accidental
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        });

        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        });
    }

    // Manejar play/pause
    handlePlayPause() {
        console.log('🎵 Play/Pause clicked');
        
        // Integración con sistema existente
        if (window.YTCrossMixApp && typeof window.YTCrossMixApp.handlePlayPause === 'function') {
            window.YTCrossMixApp.handlePlayPause();
            return;
        }

        // Si existe el botón principal, hacer click en él
        if (this.domElements.playButton) {
            this.domElements.playButton.click();
            return;
        }

        // Fallback básico
        this.isPlaying = !this.isPlaying;
        this.updatePlayButtonState();
        
        if (this.isPlaying) {
            this.showMessage('Reproduciendo...');
        } else {
            this.showMessage('Pausado');
        }
    }

    // Manejar next
    handleNext() {
        console.log('⏭️ Next clicked');
        
        // Integración con sistema existente
        if (window.YTCrossMixApp && typeof window.YTCrossMixApp.handleNext === 'function') {
            window.YTCrossMixApp.handleNext();
            return;
        }

        // Si existe el botón principal, hacer click en él
        if (this.domElements.nextButton) {
            this.domElements.nextButton.click();
            return;
        }

        // Fallback básico
        this.showMessage('Siguiente canción');
    }

    // Actualizar estado de botones de play
    updatePlayButtonState() {
        const playIcon = this.isPlaying ? 'fa-pause' : 'fa-play';
        
        // Botón principal
        if (this.domElements.playButton) {
            const icon = this.domElements.playButton.querySelector('i');
            if (icon) {
                icon.className = `fas ${playIcon}`;
            }
        }

        // Mini player
        if (this.domElements.miniPlayBtn) {
            const icon = this.domElements.miniPlayBtn.querySelector('i');
            if (icon) {
                icon.className = `fas ${playIcon}`;
            }
        }
    }

    // Realizar búsqueda
    async performSearch(query) {
        console.log('🔍 Buscando:', query);
        
        if (!this.domElements.searchResults) {
            console.warn('No hay contenedor de resultados');
            return;
        }

        // Mostrar loading
        this.domElements.searchResults.innerHTML = `
            <div class="search-placeholder">
                <div class="spinner"></div>
                <p>Buscando "${query}"...</p>
            </div>
        `;

        try {
            // Integración con SearchManager existente
            if (window.SearchManager && window.SearchManager.performSearch) {
                await window.SearchManager.performSearch(query);
                return;
            }

            // Fallback básico - simular búsqueda
            await this.sleep(1000);
            this.renderMockSearchResults(query);
            
        } catch (error) {
            console.error('Error en búsqueda:', error);
            this.domElements.searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al buscar. Intenta de nuevo.</p>
                </div>
            `;
        }
    }

    // Renderizar resultados mock para testing
    renderMockSearchResults(query) {
        const mockResults = [
            {
                title: `Resultado 1 para "${query}"`,
                author: 'Artista de Ejemplo',
                thumbnail: 'https://via.placeholder.com/320x180?text=Video+1',
                duration: '3:45'
            },
            {
                title: `Resultado 2 para "${query}"`,
                author: 'Otro Artista',
                thumbnail: 'https://via.placeholder.com/320x180?text=Video+2',
                duration: '4:20'
            }
        ];

        const resultsHTML = mockResults.map(result => `
            <div class="video-result">
                <div class="thumbnail-container">
                    <img src="${result.thumbnail}" alt="${result.title}" class="thumbnail">
                    <span class="duration">${result.duration}</span>
                </div>
                <div class="video-details">
                    <h3 class="video-title">${result.title}</h3>
                    <p class="video-author">${result.author}</p>
                    <button class="search-result-add-button" onclick="integration.handleAddToPlaylist('${result.title}')">
                        <i class="fas fa-plus"></i>
                        Añadir
                    </button>
                </div>
            </div>
        `).join('');

        this.domElements.searchResults.innerHTML = resultsHTML;
    }

    // Limpiar resultados de búsqueda
    clearSearchResults() {
        if (this.domElements.searchResults) {
            this.domElements.searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                </div>
            `;
        }
    }

    // Manejar añadir a playlist
    handleAddToPlaylist(title) {
        console.log('➕ Añadiendo a playlist:', title);
        
        // Integración con sistema existente
        if (window.PlaylistManager && window.PlaylistManager.addVideoToManualPlaylist) {
            // Usar sistema real
            window.PlaylistManager.addVideoToManualPlaylist({
                title: title,
                videoId: 'mock_' + Date.now()
            });
        } else {
            // Fallback
            this.showMessage(`"${title}" añadido a la playlist`);
        }
    }

    // Cargar contenido de biblioteca
    loadLibraryContent() {
        console.log('📚 Cargando biblioteca...');
        
        // Integración con sistema existente
        if (window.PlaylistGridManager && window.PlaylistGridManager.renderPlaylistsGrid) {
            setTimeout(() => {
                window.PlaylistGridManager.renderPlaylistsGrid();
            }, 100);
            return;
        }

        // Fallback - mostrar mensaje
        if (this.domElements.playlistsGrid) {
            this.domElements.playlistsGrid.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-music"></i>
                    <p>Conecta tu cuenta de Google para ver tus playlists</p>
                </div>
            `;
        }
    }

    // Actualizar información del track actual
    updateCurrentTrack(trackInfo) {
        console.log('🎵 Actualizando track:', trackInfo);
        
        this.currentTrack = trackInfo;

        // Actualizar mini player
        this.updateMiniPlayer(trackInfo);
        
        // Actualizar vista playing
        this.updatePlayingView(trackInfo);
        
        // Disparar evento
        this.dispatchEvent('trackChanged', trackInfo);
    }

    // Actualizar mini player
    updateMiniPlayer(trackInfo) {
        if (!this.domElements.miniPlayer || !trackInfo) return;

        const titleEl = this.domElements.miniPlayer.querySelector('.mini-track-title');
        const artistEl = this.domElements.miniPlayer.querySelector('.mini-track-artist');
        const imageEl = this.domElements.miniPlayer.querySelector('.mini-track-image');

        if (titleEl) titleEl.textContent = trackInfo.title || 'Selecciona música';
        if (artistEl) artistEl.textContent = trackInfo.artist || 'YT CrossMix';
        if (imageEl && trackInfo.thumbnail) imageEl.src = trackInfo.thumbnail;
    }

    // Actualizar vista playing
    updatePlayingView(trackInfo) {
        const titleEl = document.getElementById('nowPlayingTitle');
        const artistEl = document.getElementById('nowPlayingArtist');

        if (titleEl) titleEl.textContent = trackInfo.title || 'Selecciona una canción';
        if (artistEl) artistEl.textContent = trackInfo.artist || 'YT CrossMix';
    }

    // Manejar resize
    handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        console.log(`📐 Resize: ${width}x${height}`);
        
        // Actualizar CSS custom properties si es necesario
        document.documentElement.style.setProperty('--viewport-width', width + 'px');
        document.documentElement.style.setProperty('--viewport-height', height + 'px');
        
        // Ajustes específicos para landscape en mobile
        if (width > height && width < 1024) {
            document.body.classList.add('landscape-mobile');
        } else {
            document.body.classList.remove('landscape-mobile');
        }
        
        // Disparar evento
        this.dispatchEvent('resize', { width, height });
    }

    // Mostrar mensaje flotante
    showMessage(message, duration = 4000) {
        console.log('💬 Mensaje:', message);
        
        // Usar la función existente si está disponible
        if (typeof mostrarMensajeFlotante === 'function') {
            mostrarMensajeFlotante(message);
            return;
        }
        
        // Crear elemento de mensaje
        const messageEl = document.createElement('div');
        messageEl.className = 'floating-message';
        messageEl.textContent = message;
        
        // Encontrar contenedor o usar body
        let container = this.domElements.floatingMessages || document.body;
        container.appendChild(messageEl);
        
        // Aplicar estilos de posición
        Object.assign(messageEl.style, {
            position: 'fixed',
            bottom: 'calc(64px + 64px + 20px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%) translateY(100px) scale(0.8)',
            zIndex: '10000',
            opacity: '0',
            transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        });
        
        // Animación de entrada
        requestAnimationFrame(() => {
            Object.assign(messageEl.style, {
                transform: 'translateX(-50%) translateY(0) scale(1)',
                opacity: '1'
            });
        });
        
        // Animación de salida
        setTimeout(() => {
            Object.assign(messageEl.style, {
                transform: 'translateX(-50%) translateY(-20px) scale(0.9)',
                opacity: '0'
            });
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.remove();
                }
            }, 400);
        }, duration);
    }

    // Mostrar error
    showError(message) {
        console.error('❌ Error:', message);
        this.showMessage('❌ ' + message, 6000);
    }

    // Mostrar loading
    showLoading(show = true) {
        let spinner = document.getElementById('loadingSpinner');
        
        if (show && !spinner) {
            spinner = document.createElement('div');
            spinner.id = 'loadingSpinner';
            spinner.className = 'loading-spinner';
            spinner.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(spinner);
        }
        
        if (spinner) {
            spinner.classList.toggle('hidden', !show);
        }
    }

    // Utilidades
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Disparar evento personalizado
    dispatchEvent(eventName, detail = null) {
        const event = new CustomEvent(eventName, { 
            detail,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    // Obtener información de diagnóstico
    getDiagnostics() {
        return {
            isInitialized: this.isInitialized,
            currentView: this.currentView,
            isPlaying: this.isPlaying,
            currentTrack: this.currentTrack,
            domElements: Object.fromEntries(
                Object.entries(this.domElements).map(([key, el]) => [key, !!el])
            ),
            contentViewsCount: this.domElements.contentViews ? this.domElements.contentViews.length : 0,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                ratio: window.devicePixelRatio
            },
            browser: {
                userAgent: navigator.userAgent,
                language: navigator.language,
                online: navigator.onLine,
                cookieEnabled: navigator.cookieEnabled,
                platform: navigator.platform
            },
            support: {
                serviceWorker: 'serviceWorker' in navigator,
                localStorage: this.checkLocalStorage(),
                webAudio: 'AudioContext' in window || 'webkitAudioContext' in window,
                fullscreen: 'requestFullscreen' in document.documentElement
            }
        };
    }

    // Verificar localStorage
    checkLocalStorage() {
        try {
            localStorage.setItem('test', 'test');
            localStorage.removeItem('test');
            return true;
        } catch (e) {
            return false;
        }
    }

    // Método para debugging
    debug() {
        console.log('=== YT CROSSMIX INTEGRATION DEBUG ===');
        console.table(this.getDiagnostics());
        console.log('=====================================');
    }

    // Método de reset
    reset() {
        console.log('🔄 Reseteando integración...');
        
        this.currentView = 'home';
        this.isPlaying = false;
        this.currentTrack = null;
        
        // Limpiar interfaces
        this.switchView('home');
        this.updatePlayButtonState();
        this.clearSearchResults();
        
        this.showMessage('Aplicación reiniciada');
    }

    // Integración con módulos existentes
    connectWithExistingModules() {
        // Conectar con app principal si existe
        if (window.YTCrossMixApp) {
            console.log('🔗 Conectando con YTCrossMixApp...');
            
            // Override funciones si es necesario
            const originalReset = window.YTCrossMixApp.reset;
            if (typeof originalReset === 'function') {
                window.YTCrossMixApp.reset = () => {
                    originalReset.call(window.YTCrossMixApp);
                    this.reset();
                };
            }
        }

        // Conectar con gestores existentes
        ['PlaylistManager', 'SearchManager', 'PlaybackController'].forEach(manager => {
            if (window[manager]) {
                console.log(`🔗 ${manager} detectado`);
            }
        });

        // Escuchar eventos del sistema existente
        document.addEventListener('playerStateChanged', (e) => {
            if (e.detail && e.detail.state === 1) { // PLAYING
                this.isPlaying = true;
                this.updatePlayButtonState();
                
                // Actualizar track info si está disponible
                if (e.detail.videoId) {
                    // Intentar obtener info del video
                    this.syncTrackInfo(e.detail);
                }
            } else {
                this.isPlaying = false;
                this.updatePlayButtonState();
            }
        });

        document.addEventListener('playlistsUpdated', () => {
            if (this.currentView === 'library') {
                this.loadLibraryContent();
            }
        });
    }

    // Sincronizar información del track
    syncTrackInfo(playerDetail) {
        // Intentar obtener información del video actual
        if (window.PlaylistState && window.PlaylistState.currentPlayingInfo) {
            const currentInfo = window.PlaylistState.currentPlayingInfo;
            const flatList = window.PlaylistManager ? window.PlaylistManager.getFlattenedPlaylist() : [];
            const currentVideo = flatList.find(v => v.videoId === currentInfo.videoId);
            
            if (currentVideo) {
                this.updateCurrentTrack({
                    title: currentVideo.title,
                    artist: currentVideo.channelTitle || 'Desconocido',
                    thumbnail: currentVideo.thumbnail
                });
            }
        }
    }
}

// Crear instancia global
const integration = new YTCrossMixIntegration();

// Auto-inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await integration.initialize();
        integration.connectWithExistingModules();
        
        // Hacer disponible globalmente
        window.YTCrossMixIntegration = integration;
        window.integration = integration; // Alias corto
        
        console.log('✅ YT CrossMix Integration listo');
        
    } catch (error) {
        console.error('💥 Error inicializando integración:', error);
    }
});

// Funciones globales para compatibilidad
window.switchView = (view) => integration.switchView(view);
window.updateMiniPlayer = (data) => integration.updateCurrentTrack(data);

// Exportar para uso en módulos
export { YTCrossMixIntegration, integration };
