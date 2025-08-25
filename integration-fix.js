// ===== INTEGRATION-FIX.JS CORREGIDO Y OPTIMIZADO =====

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
        this.isDesktop = window.innerWidth >= 1024;
        this.expandedPlaylists = new Set();
        
        // Referencias DOM críticas
        this.domElements = {
            mobileHeader: null,
            bottomNav: null,
            miniPlayer: null,
            sidebar: null,
            bottomPlayer: null,
            contentViews: null,
            searchResults: null,
            playlistsGrid: null,
            searchInput: null,
            sidebarSearchInput: null,
            playButton: null,
            nextButton: null,
            miniPlayBtn: null,
            miniNextBtn: null,
            videoContainer: null,
            playlistContainer: null,
            floatingMessages: null
        };
        
        this.setupEventListeners();
    }

    // ===== INICIALIZACIÓN CORREGIDA =====
    async initialize() {
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    async _doInitialize() {
        try {
            console.log('🚀 Iniciando YT CrossMix Integration V4 (CORREGIDO)...');
            
            await this.waitForDOM();
            this.detectDeviceType();
            this.getDOMReferences();
            this.setupDeviceInterface();
            this.setupNavigation();
            this.setupPlaybackControls();
            this.setupSearch();
            this.setupErrorHandling();
            this.switchView('home');
            
            this.isInitialized = true;
            console.log('✅ YT CrossMix Integration V4 inicializado correctamente');
            
            this.dispatchEvent('integrationReady');
            return true;
            
        } catch (error) {
            console.error('💥 Error en inicialización:', error);
            this.showError('Error al inicializar la aplicación');
            throw error;
        }
    }

    // ===== DOM REFERENCES CORREGIDAS =====
    getDOMReferences() {
        const selectors = {
            mobileHeader: '.mobile-header, #mobileHeader',
            bottomNav: '.bottom-nav, #bottomNav',
            miniPlayer: '.mini-player, #miniPlayer',
            sidebar: '.desktop-sidebar, #sidebar',
            bottomPlayer: '.bottom-player',
            searchResults: '#searchResults, .search-results',
            playlistsGrid: '#playlistsGrid, .playlists-grid-mobile',
            searchInput: '#searchInput',
            sidebarSearchInput: '#sidebarSearchInput',
            playButton: '#botonPlay, #playButton',
            nextButton: '#botonNext, #nextButton',
            miniPlayBtn: '#miniPlayBtn',
            miniNextBtn: '#miniNextBtn',
            videoContainer: '#videoContainer',
            playlistContainer: '#playlistContainer',
            floatingMessages: '#floatingMessageContainer, .floating-messages'
        };

        Object.entries(selectors).forEach(([key, selector]) => {
            const element = document.querySelector(selector);
            this.domElements[key] = element;
            
            if (!element && ['searchInput', 'miniPlayer', 'bottomNav'].includes(key)) {
                console.warn(`⚠️ Elemento crítico no encontrado: ${key} (${selector})`);
            }
        });
        
        // ContentViews como NodeList
        this.domElements.contentViews = document.querySelectorAll('.content-view');
        
        // Crear elementos faltantes críticos
        this.createMissingElements();
        
        console.log(`📱 Referencias DOM obtenidas. ContentViews: ${this.domElements.contentViews.length}`);
    }

    // ===== CREAR ELEMENTOS FALTANTES =====
    createMissingElements() {
        // Crear search input si no existe
        if (!this.domElements.searchInput) {
            const header = this.domElements.mobileHeader;
            if (header) {
                const searchDiv = document.createElement('div');
                searchDiv.className = 'mobile-search';
                searchDiv.innerHTML = '<input type="text" id="searchInput" class="mobile-search-input" placeholder="Buscar música...">';
                
                const logo = header.querySelector('.mobile-logo');
                if (logo) {
                    logo.parentNode.insertBefore(searchDiv, logo.nextSibling);
                } else {
                    header.appendChild(searchDiv);
                }
                
                this.domElements.searchInput = document.getElementById('searchInput');
                console.log('✅ Search input creado');
            }
        }

        // Crear resultados de búsqueda si no existe
        if (!this.domElements.searchResults) {
            const searchView = document.getElementById('searchView');
            if (searchView) {
                const contentBody = searchView.querySelector('.content-body');
                if (contentBody) {
                    const resultsDiv = document.createElement('div');
                    resultsDiv.id = 'searchResults';
                    resultsDiv.className = 'search-results';
                    resultsDiv.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-search"></i>
                            <p>Busca música, artistas o playlists</p>
                        </div>
                    `;
                    contentBody.appendChild(resultsDiv);
                    this.domElements.searchResults = resultsDiv;
                    console.log('✅ Search results container creado');
                }
            }
        }

        // Crear playlists grid si no existe
        if (!this.domElements.playlistsGrid) {
            const libraryView = document.getElementById('libraryView');
            if (libraryView) {
                const contentBody = libraryView.querySelector('.content-body');
                if (contentBody && !contentBody.querySelector('#playlistsGrid')) {
                    const gridDiv = document.createElement('div');
                    gridDiv.id = 'playlistsGrid';
                    gridDiv.className = 'playlists-grid-mobile';
                    gridDiv.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-music"></i>
                            <p>Conecta tu cuenta de Google para ver tus playlists</p>
                        </div>
                    `;
                    contentBody.appendChild(gridDiv);
                    this.domElements.playlistsGrid = gridDiv;
                    console.log('✅ Playlists grid creado');
                }
            }
        }

        // Crear playlist container para playing view si no existe
        if (!this.domElements.playlistContainer) {
            const playingView = document.getElementById('playingView');
            if (playingView) {
                const queueSection = playingView.querySelector('.queue-section');
                if (queueSection && !queueSection.querySelector('#playlistContainer')) {
                    const containerDiv = document.createElement('div');
                    containerDiv.id = 'playlistContainer';
                    containerDiv.className = 'playlist-container-mobile';
                    containerDiv.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-music"></i>
                            <p>No hay videos en la cola</p>
                        </div>
                    `;
                    queueSection.appendChild(containerDiv);
                    this.domElements.playlistContainer = containerDiv;
                    console.log('✅ Playlist container creado');
                }
            }
        }
    }

    // ===== CONFIGURACIÓN DE DISPOSITIVO =====
    detectDeviceType() {
        this.isDesktop = window.innerWidth >= 1024;
        this.isMobile = !this.isDesktop;
        this.isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        
        document.body.classList.toggle('is-desktop', this.isDesktop);
        document.body.classList.toggle('is-mobile', this.isMobile);
        document.body.classList.toggle('is-tablet', this.isTablet);
        
        console.log(`📱 Dispositivo: ${this.isDesktop ? 'Desktop' : this.isTablet ? 'Tablet' : 'Mobile'}`);
    }

    setupDeviceInterface() {
        if (this.isDesktop) {
            this.setupDesktopInterface();
        } else {
            this.setupMobileInterface();
        }
        
        this.setMobileViewport();
    }

    setupDesktopInterface() {
        console.log('🖥️ Configurando interfaz desktop...');
        
        this.toggleElement(this.domElements.sidebar, true);
        this.toggleElement(this.domElements.bottomPlayer, true);
        this.toggleElement(this.domElements.mobileHeader, false);
        this.toggleElement(this.domElements.bottomNav, false);
        this.toggleElement(this.domElements.miniPlayer, false);
        
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.paddingLeft = '260px';
        }
        
        this.setupDesktopControls();
    }

    setupMobileInterface() {
        console.log('📱 Configurando interfaz mobile...');
        
        this.toggleElement(this.domElements.mobileHeader, true);
        this.toggleElement(this.domElements.bottomNav, true);
        this.toggleElement(this.domElements.miniPlayer, true);
        this.toggleElement(this.domElements.sidebar, false);
        this.toggleElement(this.domElements.bottomPlayer, false);
        
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.paddingLeft = '0';
        }
        
        this.setupMiniPlayer();
    }

    setupDesktopControls() {
        console.log('🖥️ Configurando controles desktop');
        // Implementar controles específicos de desktop si es necesario
    }

    toggleElement(element, show) {
        if (element) {
            element.style.display = show ? (element.classList.contains('bottom-player') ? 'flex' : 'block') : 'none';
        }
    }

    setMobileViewport() {
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setViewportHeight();
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', () => setTimeout(setViewportHeight, 100));
    }

    // ===== NAVEGACIÓN =====
    setupNavigation() {
        // Navegación mobile (bottom nav)
        if (this.domElements.bottomNav) {
            this.domElements.bottomNav.addEventListener('click', (e) => {
                const navTab = e.target.closest('.nav-tab, [data-view]');
                if (navTab) {
                    const view = navTab.dataset.view;
                    if (view) {
                        this.switchView(view);
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            });
        }

        // Navegación desktop (sidebar)
        if (this.domElements.sidebar) {
            const navItems = this.domElements.sidebar.querySelectorAll('.nav-item, [data-view]');
            navItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const view = item.dataset.view;
                    if (view) {
                        this.switchView(view);
                    }
                });
            });
        }
    }

    // ===== SWITCH VIEW =====
    switchView(newView) {
        if (this.currentView === newView) return;
        
        console.log(`📱 Cambiando vista: ${this.currentView} → ${newView}`);
        
        // Guardar expansiones
        if (['library', 'playing'].includes(this.currentView)) {
            this.savePlaylistExpansions();
        }
        
        // Actualizar vistas de contenido
        if (this.domElements.contentViews && this.domElements.contentViews.length > 0) {
            this.domElements.contentViews.forEach(view => {
                const isActive = view.id === `${newView}View`;
                view.classList.toggle('active', isActive);
                view.style.display = isActive ? 'flex' : 'none';
            });
        }

        // Actualizar navegación
        this.updateNavigationActiveState(newView);

        const oldView = this.currentView;
        this.currentView = newView;

        // Acciones específicas por vista
        this.handleViewChange(oldView, newView);
        
        this.scrollToTop();
        this.dispatchEvent('viewChanged', { from: oldView, to: newView });
    }

    updateNavigationActiveState(activeView) {
        // Actualizar bottom nav (mobile)
        if (this.domElements.bottomNav) {
            const navTabs = this.domElements.bottomNav.querySelectorAll('.nav-tab, [data-view]');
            navTabs.forEach(tab => {
                const isActive = tab.dataset.view === activeView;
                tab.classList.toggle('active', isActive);
            });
        }

        // Actualizar sidebar (desktop)
        if (this.domElements.sidebar) {
            const sidebarItems = this.domElements.sidebar.querySelectorAll('.nav-item, [data-view]');
            sidebarItems.forEach(item => {
                const isActive = item.dataset.view === activeView;
                item.classList.toggle('active', isActive);
            });
        }
    }

    scrollToTop() {
        const activeView = document.querySelector('.content-view.active');
        if (activeView) {
            const contentBody = activeView.querySelector('.content-body');
            if (contentBody) {
                contentBody.scrollTop = 0;
            }
        }
    }

    // ===== BÚSQUEDA =====
    setupSearch() {
        const inputs = [this.domElements.searchInput, this.domElements.sidebarSearchInput].filter(Boolean);
        
        if (inputs.length === 0) {
            console.warn('⚠️ No se encontraron inputs de búsqueda');
            return;
        }

        console.log(`🔍 Configurando ${inputs.length} input(s) de búsqueda`);

        inputs.forEach((input) => {
            let searchTimeout = null;

            input.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                
                // Sincronizar inputs
                inputs.forEach(otherInput => {
                    if (otherInput !== input && otherInput.value !== query) {
                        otherInput.value = query;
                    }
                });
                
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                
                if (query.length > 0 && this.currentView !== 'search') {
                    this.switchView('search');
                }
                
                searchTimeout = setTimeout(() => {
                    if (query.length > 2) {
                        this.performSearch(query);
                    } else if (query.length === 0) {
                        this.clearSearchResults();
                    }
                }, 300);
            });

            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query.length > 0) {
                        this.performSearch(query);
                    }
                }
            });

            input.addEventListener('focus', () => {
                if (this.currentView !== 'search' && input.value.trim().length > 0) {
                    this.switchView('search');
                }
            });
        });
    }

    // ===== CONTROLES DE REPRODUCCIÓN =====
    setupPlaybackControls() {
        if (this.domElements.playButton) {
            this.domElements.playButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handlePlayPause();
            });
        }

        if (this.domElements.nextButton) {
            this.domElements.nextButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleNext();
            });
        }
    }

    setupMiniPlayer() {
        if (!this.domElements.miniPlayer) return;

        this.domElements.miniPlayer.addEventListener('click', (e) => {
            if (!e.target.closest('.mini-control-btn')) {
                this.switchView('playing');
            }
        });

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

    // ===== MANEJADORES DE REPRODUCCIÓN =====
    handlePlayPause() {
        console.log('🎵 Play/Pause integración');
        
        if (this.domElements.playButton && !this.domElements.playButton.disabled) {
            this.domElements.playButton.click();
            return;
        }

        if (window.YTCrossMixApp && typeof window.YTCrossMixApp.handlePlayPause === 'function') {
            window.YTCrossMixApp.handlePlayPause();
            return;
        }

        this.isPlaying = !this.isPlaying;
        this.updatePlayButtonState();
    }

    handleNext() {
        console.log('⏭️ Next integración');
        
        if (this.domElements.nextButton && !this.domElements.nextButton.disabled) {
            this.domElements.nextButton.click();
            return;
        }

        if (window.YTCrossMixApp && typeof window.YTCrossMixApp.handleNext === 'function') {
            window.YTCrossMixApp.handleNext();
            return;
        }

        this.showMessage('Siguiente canción');
    }

    updatePlayButtonState() {
        const playIcon = this.isPlaying ? 'fa-pause' : 'fa-play';
        
        const playButtons = [
            this.domElements.playButton,
            this.domElements.miniPlayBtn,
            this.domElements.bottomPlayer?.querySelector('#botonPlay')
        ].filter(Boolean);

        playButtons.forEach(button => {
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = `fas ${playIcon}`;
            }
        });
    }

    // ===== BÚSQUEDA =====
    async performSearch(query) {
        console.log('🔍 Buscando:', query);
        
        if (!this.domElements.searchResults) {
            console.warn('No hay contenedor de resultados');
            return;
        }

        this.domElements.searchResults.innerHTML = `
            <div class="search-placeholder">
                <div class="spinner"></div>
                <p>Buscando "${query}"...</p>
            </div>
        `;

        try {
            if (window.SearchManager && window.SearchManager.performSearch) {
                await window.SearchManager.performSearch(query);
                return;
            }

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

    renderMockSearchResults(query) {
        const mockResults = Array.from({length: 6}, (_, i) => ({
            title: `Resultado ${i + 1} para "${query}"`,
            author: `Artista ${i + 1}`,
            thumbnail: `https://via.placeholder.com/180x135?text=Video+${i + 1}`,
            duration: `${2 + i}:${30 + (i * 10)}`
        }));

        const resultsHTML = mockResults.map(result => `
            <div class="video-result">
                <div class="thumbnail-container">
                    <img src="${result.thumbnail}" alt="${result.title}" class="thumbnail" loading="lazy">
                    <span class="duration">${result.duration}</span>
                </div>
                <div class="video-details">
                    <h3 class="video-title">${result.title}</h3>
                    <p class="video-author">${result.author}</p>
                    <button class="search-result-add-button">
                        <i class="fas fa-plus"></i>
                        Añadir
                    </button>
                </div>
            </div>
        `).join('');

        this.domElements.searchResults.innerHTML = resultsHTML;
    }

    // ===== MANEJO DE VISTA =====
    handleViewChange(fromView, toView) {
        switch (toView) {
            case 'search':
                if (this.domElements.searchInput) {
                    setTimeout(() => this.domElements.searchInput.focus(), 100);
                }
                break;
                
            case 'playing':
                this.restorePlaylistExpansions();
                this.loadPlayingContent();
                break;
                
            case 'library':
                this.loadLibraryContent();
                break;
                
            case 'home':
                this.loadHomeContent();
                break;
        }
    }

    loadPlayingContent() {
        setTimeout(() => {
            if (window.UIManager && typeof window.UIManager.updatePlaylistsUI === 'function') {
                window.UIManager.updatePlaylistsUI();
            }
        }, 50);
    }

    loadLibraryContent() {
        setTimeout(() => {
            if (window.PlaylistGridManager && typeof window.PlaylistGridManager.renderPlaylistsGrid === 'function') {
                window.PlaylistGridManager.renderPlaylistsGrid();
            }
        }, 100);
    }

    loadHomeContent() {
        this.updateHomeOverview();
    }

    updateHomeOverview() {
        const overview = document.getElementById('playlistOverview');
        if (!overview) return;

        const playlistCount = window.PlaylistState?.playlistsData?.length || 0;
        const totalVideos = window.PlaylistManager?.getFlattenedPlaylist()?.length || 0;
        
        overview.innerHTML = `
            <div class="overview-section">
                <h3 class="overview-title">
                    <i class="fas fa-list-ul"></i>
                    Tus Playlists
                </h3>
                <div class="overview-content">
                    <p>${playlistCount} playlists cargadas</p>
                    <p>${totalVideos} videos en total</p>
                </div>
            </div>
            <div class="overview-section">
                <h3 class="overview-title">
                    <i class="fas fa-music"></i>
                    Reproducción
                </h3>
                <div class="overview-content">
                    <p>Estado: ${this.isPlaying ? 'Reproduciendo' : 'Detenido'}</p>
                    <p>Video actual: ${this.currentTrack?.title || 'Ninguno'}</p>
                </div>
            </div>
        `;
    }

    // ===== EXPANSIONES DE PLAYLIST =====
    savePlaylistExpansions() {
        this.expandedPlaylists.clear();
        const expandedElements = document.querySelectorAll('.playlist-group-mobile.expanded');
        expandedElements.forEach(element => {
            const playlistId = element.dataset.playlistId;
            if (playlistId) {
                this.expandedPlaylists.add(playlistId);
            }
        });
        console.log('💾 Expansiones guardadas:', Array.from(this.expandedPlaylists));
    }

    restorePlaylistExpansions() {
        console.log('📂 Restaurando expansiones:', Array.from(this.expandedPlaylists));
        if (window.PlaylistState && window.PlaylistState.playlistsData) {
            window.PlaylistState.playlistsData.forEach(playlist => {
                if (this.expandedPlaylists.has(playlist.id)) {
                    playlist.isExpanded = true;
                }
            });
        }
    }

    // ===== TRACK INFO =====
    updateCurrentTrack(trackInfo) {
        console.log('🎵 Actualizando track:', trackInfo);
        
        this.currentTrack = trackInfo;
        this.updateMiniPlayer(trackInfo);
        this.updatePlayingView(trackInfo);
        this.updateBottomPlayer(trackInfo);
        
        this.dispatchEvent('trackChanged', trackInfo);
    }

    updateMiniPlayer(trackInfo) {
        if (!this.domElements.miniPlayer || !trackInfo) return;

        const titleEl = this.domElements.miniPlayer.querySelector('.mini-track-title');
        const artistEl = this.domElements.miniPlayer.querySelector('.mini-track-artist');
        const imageEl = this.domElements.miniPlayer.querySelector('.mini-track-image');

        if (titleEl) titleEl.textContent = trackInfo.title || 'Selecciona música';
        if (artistEl) artistEl.textContent = trackInfo.artist || 'YT CrossMix';
        if (imageEl && trackInfo.thumbnail) imageEl.src = trackInfo.thumbnail;
    }

    updatePlayingView(trackInfo) {
        const titleEl = document.getElementById('nowPlayingTitle');
        const artistEl = document.getElementById('nowPlayingArtist');

        if (titleEl) titleEl.textContent = trackInfo.title || 'Selecciona una canción';
        if (artistEl) artistEl.textContent = trackInfo.artist || 'YT CrossMix';
    }

    updateBottomPlayer(trackInfo) {
        const playerTitle = document.getElementById('playerTitle');
        const playerArtist = document.getElementById('playerArtist'); 
        const playerThumbnail = document.getElementById('playerThumbnail');
        
        if (playerTitle) playerTitle.textContent = trackInfo.title || 'Selecciona una canción';
        if (playerArtist) playerArtist.textContent = trackInfo.artist || 'YT CrossMix';
        if (playerThumbnail && trackInfo.thumbnail) playerThumbnail.src = trackInfo.thumbnail;
    }

    // ===== RESIZE HANDLING =====
    handleResize() {
        const wasDesktop = this.isDesktop;
        this.detectDeviceType();
        
        if (wasDesktop !== this.isDesktop) {
            this.setupDeviceInterface();
        }
        
        this.dispatchEvent('resize', { width: window.innerWidth, height: window.innerHeight });
    }

    // ===== EVENTOS Y LISTENERS =====
    setupEventListeners() {
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 250));

        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.handleResize(), 100);
        });

        window.addEventListener('online', () => this.showMessage('Conexión restaurada'));
        window.addEventListener('offline', () => this.showMessage('Sin conexión'));

        this.preventMobileZoom();
    }

    preventMobileZoom() {
        if (!this.isMobile) return;
        
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) e.preventDefault();
        }, { passive: false });

        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
    }

    // ===== ERROR HANDLING =====
    setupErrorHandling() {
        window.addEventListener('error', (e) => {
            console.error('Error global:', e.error);
            if (e.error && !e.error.message?.includes('Extension')) {
                this.showError('Error en la aplicación');
            }
        });

        window.addEventListener('unhandledrejection', (e) => {
            console.error('Promise rechazada:', e.reason);
            e.preventDefault();
        });
    }

    // ===== UTILIDADES =====
    waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            } else {
                resolve();
            }
        });
    }

    showMessage(message, duration = 4000) {
        const messageEl = document.createElement('div');
        messageEl.textContent = message;
        messageEl.className = 'floating-message';
        
        document.body.appendChild(messageEl);
        
        Object.assign(messageEl.style, {
            position: 'fixed',
            bottom: 'calc(64px + 64px + 20px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%) translateY(100px) scale(0.8)',
            zIndex: '10000',
            background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(26, 26, 26, 0.9))',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '500',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(20px)',
            opacity: '0',
            transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        });

        requestAnimationFrame(() => {
            messageEl.style.transform = 'translateX(-50%) translateY(0) scale(1)';
            messageEl.style.opacity = '1';
        });

        setTimeout(() => {
            messageEl.style.opacity = '0';
            setTimeout(() => messageEl.remove(), 400);
        }, duration);
    }

    showError(message) {
        this.showMessage('❌ ' + message, 6000);
    }

    dispatchEvent(eventName, detail = null) {
        const event = new CustomEvent(eventName, { detail, bubbles: true });
        document.dispatchEvent(event);
    }

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== CONECTAR CON SISTEMA EXISTENTE =====
    connectWithExistingModules() {
        const checkModules = () => {
            const modules = [
                'PlaylistManager', 'SearchManager', 'PlaybackController', 
                'UIManager', 'YouTubeAPIManager', 'PlaylistState', 'AppState'
            ];
            
            const available = modules.filter(name => window[name]);
            const missing = modules.filter(name => !window[name]);
            
            console.log('📦 Módulos disponibles:', available);
            if (missing.length > 0) {
                console.warn('⚠️ Módulos faltantes:', missing);
            }
            
            this.setupModuleListeners();
        };
        
        checkModules();
        setTimeout(checkModules, 2000);
    }

    setupModuleListeners() {
        // Listener para cambios de estado del reproductor
        document.addEventListener('playerStateChanged', (e) => {
            if (e.detail && e.detail.state === 1) { // PLAYING
                this.isPlaying = true;
                this.updatePlayButtonState();
                
                if (e.detail.videoId && window.PlaylistState) {
                    this.syncTrackInfo(e.detail);
                }
            } else {
                this.isPlaying = false;
                this.updatePlayButtonState();
            }
        });

        // Listener para playlists actualizadas
        document.addEventListener('playlistsUpdated', () => {
            if (this.currentView === 'library') {
                this.loadLibraryContent();
            } else if (this.currentView === 'home') {
                this.updateHomeOverview();
            }
        });

        // Listener para cuando los reproductores estén listos
        window.addEventListener('playersReady', () => {
            console.log('🎵 Reproductores listos - habilitando controles');
            this.updateControlsState();
        });

        // Listeners de autenticación
        document.addEventListener('authError', (e) => {
            this.showError('Error de autenticación: ' + e.detail.message);
        });

        document.addEventListener('userLoggedOut', () => {
            this.showMessage('Sesión cerrada');
            if (this.currentView === 'library') {
                this.loadLibraryContent();
            }
        });

        document.addEventListener('playlistsFetched', (e) => {
            this.showMessage(`${e.detail.length} playlists cargadas`);
            if (this.currentView === 'library') {
                setTimeout(() => this.loadLibraryContent(), 500);
            }
        });
    }

    syncTrackInfo(playerDetail) {
        if (!window.PlaylistState || !window.PlaylistManager) return;
        
        const currentInfo = window.PlaylistState.currentPlayingInfo;
        const flatList = window.PlaylistManager.getFlattenedPlaylist();
        const currentVideo = flatList.find(v => v.videoId === currentInfo.videoId);
        
        if (currentVideo) {
            this.updateCurrentTrack({
                title: currentVideo.title,
                artist: currentVideo.channelTitle || 'Desconocido',
                thumbnail: currentVideo.thumbnail
            });
        }
    }

    updateControlsState() {
        const hasPlaylists = window.PlaylistState?.playlistsData?.length > 0;
        const flatList = window.PlaylistManager?.getFlattenedPlaylist() || [];
        
        [this.domElements.playButton, this.domElements.miniPlayBtn].forEach(btn => {
            if (btn) btn.disabled = flatList.length === 0;
        });
        
        console.log(`🎮 Controles actualizados: ${flatList.length} videos disponibles`);
    }

    // ===== MÉTODOS PÚBLICOS =====
    debug() {
        console.log('=== YT CROSSMIX INTEGRATION DEBUG V4 ===');
        console.log('Estado:', {
            isInitialized: this.isInitialized,
            currentView: this.currentView,
            isPlaying: this.isPlaying,
            isDesktop: this.isDesktop,
            elementsFound: Object.fromEntries(
                Object.entries(this.domElements).map(([key, el]) => [key, !!el])
            )
        });
        console.log('=======================================');
    }

    reset() {
        this.currentView = 'home';
        this.isPlaying = false;
        this.currentTrack = null;
        this.switchView('home');
        this.updatePlayButtonState();
        this.showMessage('Aplicación reiniciada');
    }
}

// ===== CSS CRÍTICOS INTEGRADOS =====
const criticalCSS = `
/* CRITICAL MOBILE FIXES V4 */
:root {
    --mobile-safe-area-bottom: env(safe-area-inset-bottom, 0px);
    --mobile-header-height: 64px;
    --mobile-mini-player-height: 64px;
    --mobile-bottom-nav-height: 80px;
    --primary-bg: #0f0f0f;
    --secondary-bg: #1a1a1a;
    --accent-color: #ff6b35;
    --text-primary: #ffffff;
    --text-secondary: #aaaaaa;
    --border-color: #373737;
}

.app-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--primary-bg);
    overflow-x: hidden;
}

.mobile-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin-bottom: calc(var(--mobile-mini-player-height) + var(--mobile-bottom-nav-height) + var(--mobile-safe-area-bottom));
}

.content-view {
    display: none;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
}

.content-view.active {
    display: flex !important;
    flex-direction: column;
}

.mobile-header {
    height: var(--mobile-header-height);
    background: var(--secondary-bg);
    display: flex;
    align-items: center;
    padding: 0 16px;
    position: sticky;
    top: 0;
    z-index: 1000;
    flex-shrink: 0;
}

.bottom-nav {
    position: fixed;
    bottom: var(--mobile-safe-area-bottom);
    left: 0;
    right: 0;
    height: var(--mobile-bottom-nav-height);
    background: var(--secondary-bg);
    display: flex;
    z-index: 999;
}

.nav-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #717171;
    cursor: pointer;
    padding: 8px;
    min-height: 44px;
}

.nav-tab.active {
    color: var(--accent-color);
}

.mini-player {
    position: fixed;
    bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-area-bottom));
    left: 0;
    right: 0;
    height: var(--mobile-mini-player-height);
    background: var(--secondary-bg);
    display: flex;
    align-items: center;
    padding: 0 16px;
    z-index: 998;
}

.mini-player-track {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
}

.mini-track-image {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    margin-right: 12px;
    object-fit: cover;
}

.mini-track-info {
    flex: 1;
    min-width: 0;
}

.mini-track-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.content-body {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
}

.search-results {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    width: 100%;
}

@media (min-width: 480px) {
    .search-results {
        grid-template-columns: repeat(3, 1fr);
    }
}

.video-result {
    background: var(--secondary-bg);
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s;
}

.video-result:hover {
    transform: translateY(-2px);
}

.thumbnail-container {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    overflow: hidden;
}

.thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.duration {
    position: absolute;
    bottom: 4px;
    right: 4px;
    background: rgba(0,0,0,0.8);
    color: white;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 2px;
}

.video-details {
    padding: 8px;
}

.video-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.video-author {
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 8px;
}

.search-result-add-button {
    width: 100%;
    height: 32px;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: 16px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
}

.search-placeholder {
    grid-column: 1 / -1;
    text-align: center;
    padding: 40px 0;
    color: var(--text-secondary);
}

.search-placeholder i {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
}

.spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255,255,255,0.1);
    border-radius: 50%;
    border-top: 2px solid var(--accent-color);
    animation: spin 1s linear infinite;
    margin: 0 auto 12px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

@media (min-width: 1024px) {
    .mobile-header,
    .bottom-nav,
    .mini-player {
        display: none !important;
    }
    
    .desktop-sidebar {
        display: block !important;
    }
    
    .bottom-player {
        display: flex !important;
    }
    
    .mobile-main {
        margin-bottom: 80px;
    }
}

.hidden { display: none !important; }
.is-mobile .mobile-only { display: block; }
.is-desktop .desktop-only { display: block; }
.is-mobile .desktop-only { display: none; }
.is-desktop .mobile-only { display: none; }
`;

// ===== INICIALIZACIÓN AUTOMÁTICA =====

// Inyectar CSS críticos
const styleSheet = document.createElement('style');
styleSheet.textContent = criticalCSS;
document.head.appendChild(styleSheet);

// Crear instancia global
const integration = new YTCrossMixIntegration();

// Auto-inicializar
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🚀 Iniciando sistema de integración V4...');
        
        await integration.initialize();
        
        // Conectar con módulos existentes
        integration.connectWithExistingModules();
        
        // Hacer disponible globalmente
        window.YTCrossMixIntegration = integration;
        window.integration = integration;
        
        // Funciones globales de compatibilidad
        window.switchView = (view) => integration.switchView(view);
        window.updateMiniPlayer = (data) => integration.updateCurrentTrack(data);
        window.debugIntegration = () => integration.debug();
        window.resetIntegration = () => integration.reset();
        
        console.log('✅ Sistema de integración V4 listo y funcionando');
        
        setTimeout(() => {
            integration.showMessage('🎉 YT CrossMix listo para usar');
        }, 1000);
        
    } catch (error) {
        console.error('💥 Error crítico en integración:', error);
        document.body.innerHTML = `
            <div style="
                position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
                background: #0f0f0f; color: white; display: flex; 
                align-items: center; justify-content: center; 
                flex-direction: column; font-family: Arial; text-align: center;
                padding: 20px;
            ">
                <h1 style="color: #ff6b35; margin-bottom: 20px;">⚠️ Error de Inicialización</h1>
                <p>Ha ocurrido un error al cargar YT CrossMix.</p>
                <p style="font-size: 14px; opacity: 0.7; margin-top: 10px;">
                    Intenta recargar la página. Si el problema persiste, verifica la consola.
                </p>
                <button onclick="location.reload()" style="
                    margin-top: 20px; padding: 12px 24px; 
                    background: #ff6b35; color: white; border: none; 
                    border-radius: 6px; cursor: pointer; font-size: 14px;
                ">
                    🔄 Recargar Página
                </button>
            </div>
        `;
    }
});

// Export para uso en módulos
export { YTCrossMixIntegration, integration };
