// youtube-music-ui.js - Integración de UI estilo YouTube Music con el código existente

/**
 * YouTube Music UI Manager
 * Maneja la nueva interfaz estilo YouTube Music y la integra con el código existente
 */
export class YouTubeMusicUI {
    constructor() {
        this.currentView = 'home';
        this.isMobileMenuOpen = false;
        this.isInitialized = false;
        
        // Referencias DOM
        this.sidebar = null;
        this.mobileMenuToggle = null;
        this.mobileOverlay = null;
        this.navItems = [];
        this.contentViews = [];
        
        // Estados
        this.searchTimeout = null;
        this.currentPlaylist = null;
        this.isPlaying = false;
    }

    /**
     * Inicializa la nueva UI
     */
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            console.log('Inicializando YouTube Music UI...');
            
            // Obtener referencias DOM
            this.getDOMReferences();
            
            // Configurar event listeners
            this.setupEventListeners();
            
            // Configurar navegación
            this.setupNavigation();
            
            // Configurar menú móvil
            this.setupMobileMenu();
            
            // Configurar búsqueda mejorada
            this.setupEnhancedSearch();
            
            // Integrar con el código existente
            this.integrateWithExistingCode();
            
            // Cargar vista inicial
            this.switchView('home');
            
            this.isInitialized = true;
            console.log('YouTube Music UI inicializada correctamente');
            
        } catch (error) {
            console.error('Error inicializando YouTube Music UI:', error);
        }
    }

    /**
     * Obtiene referencias a elementos DOM
     */
    getDOMReferences() {
        this.sidebar = document.getElementById('sidebar');
        this.mobileMenuToggle = document.getElementById('mobileMenuToggle');
        this.mobileOverlay = document.getElementById('mobileOverlay');
        this.navItems = document.querySelectorAll('.nav-item[data-view]');
        this.contentViews = document.querySelectorAll('.content-view');
        
        // Referencias adicionales
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');
        this.playlistsContainer = document.getElementById('playlistsContainer');
        this.playlistCount = document.getElementById('playlistCount');
        
        // Referencias del reproductor
        this.playerTitle = document.getElementById('playerTitle');
        this.playerArtist = document.getElementById('playerArtist');
        this.playerThumbnail = document.getElementById('playerThumbnail');
        this.nowPlayingTitle = document.getElementById('nowPlayingTitle');
        this.nowPlayingArtist = document.getElementById('nowPlayingArtist');
        this.nowPlayingArt = document.getElementById('nowPlayingArt');
    }

    /**
     * Configura event listeners generales
     */
    setupEventListeners() {
        // Listener para cambios de tamaño de ventana
        window.addEventListener('resize', () => {
            this.handleWindowResize();
        });

        // Listener para clics globales (cerrar menús)
        document.addEventListener('click', (e) => {
            this.handleGlobalClick(e);
        });

        // Listeners para efectos hover mejorados
        this.setupHoverEffects();
        
        // Listener para teclas de acceso rápido
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    }

    /**
     * Configura la navegación principal
     */
    setupNavigation() {
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view);
            });
        });
    }

    /**
     * Cambia entre vistas
     */
    switchView(view) {
        // Actualizar navegación activa
        this.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });

        // Mostrar vista correspondiente con animación
        this.contentViews.forEach(contentView => {
            const isActive = contentView.id === `${view}View`;
            
            if (isActive) {
                contentView.style.display = 'block';
                contentView.classList.add('fade-in');
                // Cargar contenido específico de la vista
                this.loadViewContent(view);
            } else {
                contentView.style.display = 'none';
                contentView.classList.remove('fade-in');
            }
        });

        this.currentView = view;
        
        // Cerrar menú móvil si está abierto
        if (this.isMobileMenuOpen) {
            this.toggleMobileMenu();
        }
        
        // Disparar evento personalizado
        this.dispatchCustomEvent('viewChanged', { view });
    }

    /**
     * Carga contenido específico de cada vista
     */
    loadViewContent(view) {
        switch (view) {
            case 'home':
                this.loadHomeContent();
                break;
            case 'search':
                this.loadSearchContent();
                break;
            case 'playing':
                this.loadPlayingContent();
                break;
        }
    }

    /**
     * Carga contenido de la vista Home
     */
    loadHomeContent() {
        const playlistOverview = document.getElementById('playlistOverview');
        if (!playlistOverview) return;

        // Obtener estadísticas de playlists del código existente
        if (window.YTCrossMixApp) {
            const stats = window.YTCrossMixApp.getStats();
            this.renderHomeStats(playlistOverview, stats);
        }
    }

    /**
     * Renderiza estadísticas en la vista Home
     */
    renderHomeStats(container, stats) {
        container.innerHTML = `
            <div class="overview-section">
                <h3 class="overview-title">
                    <i class="fas fa-list-ul"></i>
                    Tus Playlists
                </h3>
                <div class="overview-content">
                    <p>${stats.playlists} playlists cargadas</p>
                    <p>${stats.totalVideos} videos en total</p>
                </div>
            </div>
            
            <div class="overview-section">
                <h3 class="overview-title">
                    <i class="fas fa-music"></i>
                    Reproducción
                </h3>
                <div class="overview-content">
                    <p>Estado: ${stats.isPlaying ? 'Reproduciendo' : 'Detenido'}</p>
                    <p>Video actual: ${stats.currentVideo ? 'Sí' : 'Ninguno'}</p>
                </div>
            </div>
            
            <div class="overview-section">
                <h3 class="overview-title">
                    <i class="fas fa-cog"></i>
                    Sistema
                </h3>
                <div class="overview-content">
                    <p>API YouTube: ${stats.youtubeAPIReady ? '✅' : '❌'}</p>
                    <p>Reproductores: ${stats.playersInitialized ? '✅' : '❌'}</p>
                </div>
            </div>
        `;
    }

    /**
     * Configura el menú móvil
     */
    setupMobileMenu() {
        if (this.mobileMenuToggle) {
            this.mobileMenuToggle.addEventListener('click', () => {
                this.toggleMobileMenu();
            });
        }
        
        if (this.mobileOverlay) {
            this.mobileOverlay.addEventListener('click', () => {
                this.toggleMobileMenu();
            });
        }
    }

    /**
     * Toggle del menú móvil
     */
    toggleMobileMenu() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
        
        if (this.sidebar) {
            this.sidebar.classList.toggle('open', this.isMobileMenuOpen);
        }
        
        if (this.mobileOverlay) {
            this.mobileOverlay.classList.toggle('active', this.isMobileMenuOpen);
        }
        
        // Prevenir scroll del body cuando el menú está abierto
        document.body.style.overflow = this.isMobileMenuOpen ? 'hidden' : '';
    }

    /**
     * Configura búsqueda mejorada
     */
    setupEnhancedSearch() {
        if (!this.searchInput) return;
        
        this.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            // Limpiar timeout anterior
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }
            
            // Debounce de búsqueda
            this.searchTimeout = setTimeout(() => {
                if (query.length > 2) {
                    this.switchView('search');
                    this.performEnhancedSearch(query);
                } else if (query.length === 0) {
                    this.clearSearchResults();
                }
            }, 300);
        });
    }

    /**
     * Realiza búsqueda mejorada
     */
    async performEnhancedSearch(query) {
        if (!this.searchResults) return;
        
        try {
            // Mostrar estado de carga
            this.showSearchLoading();
            
            // Usar el SearchManager existente si está disponible
            if (window.SearchManager) {
                await window.SearchManager.performSearch(query);
            }
            
        } catch (error) {
            console.error('Error en búsqueda mejorada:', error);
            this.showSearchError('Error al realizar la búsqueda');
        }
    }

    /**
     * Muestra estado de carga en búsqueda
     */
    showSearchLoading() {
        if (this.searchResults) {
            this.searchResults.innerHTML = `
                <div class="search-placeholder">
                    <div class="loading-spinner"></div>
                    <p>Buscando...</p>
                </div>
            `;
        }
    }

    /**
     * Muestra error en búsqueda
     */
    showSearchError(message) {
        if (this.searchResults) {
            this.searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    /**
     * Limpia resultados de búsqueda
     */
    clearSearchResults() {
        if (this.searchResults) {
            this.searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                </div>
            `;
        }
    }

    /**
     * Configura efectos hover mejorados
     */
    setupHoverEffects() {
        // Efecto para tarjetas de resultado
        document.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.result-card, .playlist-card');
            if (card && !card.classList.contains('hover-effect-active')) {
                card.classList.add('hover-effect-active');
                card.style.transform = 'translateY(-4px)';
            }
        });

        document.addEventListener('mouseout', (e) => {
            const card = e.target.closest('.result-card, .playlist-card');
            if (card && card.classList.contains('hover-effect-active')) {
                card.classList.remove('hover-effect-active');
                card.style.transform = 'translateY(0)';
            }
        });

        // Efecto de ripple en botones
        this.setupRippleEffect();
    }

    /**
     * Configura efecto ripple en botones
     */
    setupRippleEffect() {
        document.addEventListener('click', (e) => {
            const button = e.target.closest('button, .btn');
            if (!button) return;

            const ripple = document.createElement('span');
            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                pointer-events: none;
                transform: scale(0);
                animation: ripple 0.6s ease-out;
            `;

            // Asegurar posición relativa del botón
            if (getComputedStyle(button).position === 'static') {
                button.style.position = 'relative';
            }
            button.style.overflow = 'hidden';

            button.appendChild(ripple);

            // Limpiar después de la animación
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });

        // Añadir CSS para la animación ripple
        if (!document.getElementById('ripple-animation')) {
            const style = document.createElement('style');
            style.id = 'ripple-animation';
            style.textContent = `
                @keyframes ripple {
                    to {
                        transform: scale(2);
                        opacity: 0;
                    }
                }
            `;
