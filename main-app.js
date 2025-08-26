// main-app.js - IMPLEMENTACIÓN COMPLETA DE FUNCIONALIDADES
// Este archivo conecta todas las funcionalidades principales

import { bootstrap } from './app-bootstrap.js';
import { AppState, PlaylistState, SearchState } from './config.js';
import { mostrarMensajeFlotante } from './messages.js';

class MainApp {
    constructor() {
        this.initialized = false;
        this.searchTimeout = null;
        this.authInitialized = false;
    }

async initialize() {
    if (this.initialized) return;
    
    console.log('🚀 Inicializando MainApp como sistema principal...');
    
    // Inicializar bootstrap directamente
    await this.initializeBootstrap();
        
        // Configurar funcionalidades principales
        this.setupSearch();
        this.setupAuthentication();
        this.setupPlaybackHandlers();
        this.setupUI();
        
        this.initialized = true;
        console.log('✅ MainApp inicializado');
    }
// ===== INICIALIZACIÓN DE BOOTSTRAP =====
async initializeBootstrap() {
    try {
        console.log('🚀 Iniciando sistemas core...');
        
        // Importar y configurar bootstrap
        const { bootstrap } = await import('./app-bootstrap.js');
        await bootstrap.initialize();
        
        // Importar y configurar integration
        const { integration } = await import('./integration-fix.js');
        if (integration && !integration.isInitialized) {
            await integration.initialize();
        }
        
        console.log('✅ Sistemas core inicializados');
    } catch (error) {
        console.error('💥 Error inicializando sistemas core:', error);
        throw error;
    }
}
    // ===== CONFIGURACIÓN DE BÚSQUEDA =====
    setupSearch() {
        console.log('🔍 Configurando búsqueda...');
        
        // Configurar inputs de búsqueda
        const searchInputs = [
            document.getElementById('searchInput'),
            document.getElementById('sidebarSearchInput')
        ].filter(Boolean);

        searchInputs.forEach(input => {
            if (input.dataset.searchConfigured) return;
            input.dataset.searchConfigured = 'true';

            input.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                
                // Sincronizar inputs
                searchInputs.forEach(otherInput => {
                    if (otherInput !== input && otherInput.value !== query) {
                        otherInput.value = query;
                    }
                });
                
                // Realizar búsqueda con debounce
                clearTimeout(this.searchTimeout);
                if (query.length > 0) {
                    this.switchToSearchView();
                    if (query.length > 2) {
                        this.searchTimeout = setTimeout(() => {
                            this.performSearch(query);
                        }, 500);
                    }
                } else {
                    this.clearSearchResults();
                }
            });

            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query.length > 0) {
                        this.performSearch(query);
                    }
                }
            });
        });

        console.log('✅ Búsqueda configurada');
    }

    async performSearch(query) {
        console.log('🔍 Realizando búsqueda:', query);
        
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) {
            console.error('Container de resultados no encontrado');
            return;
        }

        // Mostrar loading
        searchResults.innerHTML = `
            <div class="search-placeholder">
                <div class="spinner"></div>
                <p>Buscando "${query}"...</p>
            </div>
        `;

        try {
            const response = await fetch(`/.netlify/functions/search?q=${encodeURIComponent(query)}`);
            
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.displaySearchResults(data, query);

        } catch (error) {
            console.error('Error en búsqueda:', error);
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al buscar. Intenta de nuevo.</p>
                    <p style="font-size: 12px; opacity: 0.7;">${error.message}</p>
                </div>
            `;
            mostrarMensajeFlotante('Error en la búsqueda', 3000, 'error');
        }
    }

    displaySearchResults(data, query) {
        const searchResults = document.getElementById('searchResults');
        if (!data || !data.items || data.items.length === 0) {
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>No se encontraron resultados para "${query}"</p>
                </div>
            `;
            return;
        }

        const resultsHTML = data.items.map(video => {
            const videoId = video.videoId || video.url?.split('v=')[1];
            if (!videoId) return '';

            return `
                <div class="video-result" data-video-id="${videoId}">
                    <div class="thumbnail-container">
                        <img src="${video.thumbnail}" alt="${video.title}" class="thumbnail" loading="lazy">
                        <span class="duration">${this.formatDuration(video.duration)}</span>
                    </div>
                    <div class="video-details">
                        <h3 class="video-title" title="${video.title}">${video.title}</h3>
                        <p class="video-author">${video.uploaderName || 'Desconocido'}</p>
                        <button class="search-result-add-button" onclick="mainApp.addToQueue('${videoId}', '${video.title.replace(/'/g, "\\'")}', '${video.thumbnail}', ${video.duration || 0})">
                            <i class="fas fa-plus"></i>
                            Añadir
                        </button>
                    </div>
                </div>
            `;
        }).filter(Boolean).join('');

        searchResults.innerHTML = resultsHTML;
        console.log(`✅ Mostrados ${data.items.length} resultados de búsqueda`);
    }

    clearSearchResults() {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                </div>
            `;
        }
    }

    switchToSearchView() {
        if (window.integration && window.integration.switchView) {
            window.integration.switchView('search');
        } else {
            // Fallback manual
            document.querySelectorAll('.content-view').forEach(view => {
                view.classList.remove('active');
            });
            const searchView = document.getElementById('searchView');
            if (searchView) {
                searchView.classList.add('active');
            }
        }
    }

    // ===== CONFIGURACIÓN DE AUTENTICACIÓN =====
    setupAuthentication() {
        console.log('🔐 Configurando autenticación...');
        
        const signInBtn = document.getElementById('googleSignInButton');
        const signOutBtn = document.getElementById('googleSignOutButton');

        if (signInBtn && !signInBtn.dataset.authConfigured) {
            signInBtn.dataset.authConfigured = 'true';
            signInBtn.addEventListener('click', () => this.handleGoogleAuth());
        }

        if (signOutBtn && !signOutBtn.dataset.authConfigured) {
            signOutBtn.dataset.authConfigured = 'true';
            signOutBtn.addEventListener('click', () => this.handleGoogleSignOut());
        }

        // Verificar estado de autenticación guardado
        this.checkSavedAuth();
        
        console.log('✅ Autenticación configurada');
    }

    async handleGoogleAuth() {
        console.log('🔐 Iniciando autenticación con Google...');
        mostrarMensajeFlotante('Conectando con Google...', 3000, 'info');

        try {
            // Intentar usar el AuthManager si está disponible
            if (window.authManager && typeof window.authManager.handleAuthClick === 'function') {
                window.authManager.handleAuthClick();
                return;
            }

            // Fallback: simulación para desarrollo
            console.warn('⚠️ AuthManager no disponible, usando simulación');
            this.simulateAuth();

        } catch (error) {
            console.error('Error en autenticación:', error);
            mostrarMensajeFlotante('Error al conectar con Google', 4000, 'error');
        }
    }

    simulateAuth() {
        // Simulación para desarrollo/testing
        setTimeout(() => {
            this.updateAuthUI(true);
            this.loadDemoPlaylists();
            mostrarMensajeFlotante('¡Conectado! (Modo demo)', 3000, 'success');
        }, 2000);
    }

    handleGoogleSignOut() {
        console.log('🔐 Cerrando sesión...');
        
        if (window.authManager && typeof window.authManager.handleSignOutClick === 'function') {
            window.authManager.handleSignOutClick();
        } else {
            // Fallback
            this.updateAuthUI(false);
            this.clearPlaylists();
            mostrarMensajeFlotante('Sesión cerrada', 2000, 'info');
        }
    }

    updateAuthUI(isAuthenticated) {
        const signInBtn = document.getElementById('googleSignInButton');
        const signOutBtn = document.getElementById('googleSignOutButton');

        if (signInBtn && signOutBtn) {
            if (isAuthenticated) {
                signInBtn.classList.add('hidden');
                signOutBtn.classList.remove('hidden');
            } else {
                signInBtn.classList.remove('hidden');
                signOutBtn.classList.add('hidden');
            }
        }
    }

    checkSavedAuth() {
        const savedToken = localStorage.getItem('google_token');
        if (savedToken) {
            try {
                const tokenData = JSON.parse(savedToken);
                const tokenAge = Date.now() - (tokenData.timestamp || 0);
                const maxAge = 24 * 60 * 60 * 1000; // 24 horas

                if (tokenAge < maxAge && tokenData.access_token) {
                    console.log('🔐 Token válido encontrado');
                    this.updateAuthUI(true);
                    // Intentar cargar playlists
                    if (window.authManager && window.authManager.getPlaylists) {
                        setTimeout(() => window.authManager.getPlaylists(), 1000);
                    }
                } else {
                    localStorage.removeItem('google_token');
                }
            } catch (e) {
                localStorage.removeItem('google_token');
            }
        }
    }

    loadDemoPlaylists() {
        // Cargar playlists demo para testing
        const demoPlaylists = [
            {
                id: 'demo1',
                name: 'Mi Música Demo',
                thumbnailUrl: 'https://via.placeholder.com/120x90?text=Demo+1',
                videos: [],
                isExpanded: false,
                source: 'demo'
            },
            {
                id: 'demo2',
                name: 'Rock Clásico Demo',
                thumbnailUrl: 'https://via.placeholder.com/120x90?text=Demo+2',
                videos: [],
                isExpanded: false,
                source: 'demo'
            }
        ];

        if (PlaylistState.playlistsData) {
            PlaylistState.playlistsData.push(...demoPlaylists);
        } else {
            PlaylistState.playlistsData = demoPlaylists;
        }

        // Actualizar UI
        if (window.UIManager && window.UIManager.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
    }

    clearPlaylists() {
        if (PlaylistState.playlistsData) {
            PlaylistState.playlistsData.length = 0;
        }
        if (window.UIManager && window.UIManager.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
    }

    // ===== FUNCIONES DE COLA Y REPRODUCCIÓN =====
    addToQueue(videoId, title, thumbnail, duration) {
        console.log('➕ Añadiendo a la cola:', title);

        // Crear o encontrar playlist de cola
        let queuePlaylist = PlaylistState.playlistsData?.find(p => p.id === 'queue');
        if (!queuePlaylist) {
            queuePlaylist = {
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: 'https://via.placeholder.com/50?text=▶',
                videos: [],
                isExpanded: true
            };
            
            if (PlaylistState.playlistsData) {
                PlaylistState.playlistsData.unshift(queuePlaylist);
            } else {
                PlaylistState.playlistsData = [queuePlaylist];
            }
        }

        // Añadir video
        const videoObject = {
            videoId: videoId,
            title: title,
            thumbnail: thumbnail || 'https://via.placeholder.com/120x90?text=♪',
            duration: duration || 0,
            channelTitle: 'YouTube'
        };

        queuePlaylist.videos.push(videoObject);

        // Actualizar UI
        if (window.UIManager && window.UIManager.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }

        // Habilitar botón play si es el primer video
        if (queuePlaylist.videos.length === 1) {
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.disabled = false;
            }
        }

        mostrarMensajeFlotante(`"${title}" añadido a la cola`, 3000, 'success');
    }

    // ===== CONFIGURACIÓN DE CONTROLES DE REPRODUCCIÓN =====
    setupPlaybackHandlers() {
        console.log('🎵 Configurando controles de reproducción...');

        const playButton = document.getElementById('botonPlay');
        const nextButton = document.getElementById('botonNext');

        if (playButton && !playButton.dataset.handlerConfigured) {
            playButton.dataset.handlerConfigured = 'true';
            playButton.addEventListener('click', () => this.handlePlayPause());
        }

        if (nextButton && !nextButton.dataset.handlerConfigured) {
            nextButton.dataset.handlerConfigured = 'true';
            nextButton.addEventListener('click', () => this.handleNext());
        }

        console.log('✅ Controles de reproducción configurados');
    }

    handlePlayPause() {
        console.log('🎵 Play/Pause clicked');

        if (!AppState.reproduccionIniciada) {
            // Iniciar reproducción
            if (window.PlaybackController && window.PlaybackController.playFirstVideo) {
                window.PlaybackController.playFirstVideo();
            } else {
                mostrarMensajeFlotante('Añade música a la cola primero', 3000, 'warning');
            }
        } else {
            // Pausar/reanudar
            const activePlayer = AppState.currentPlayer === 1 ? AppState.player1 : AppState.player2;
            if (activePlayer) {
                const state = activePlayer.getPlayerState();
                if (state === YT.PlayerState.PLAYING) {
                    activePlayer.pauseVideo();
                    document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
                } else {
                    activePlayer.playVideo();
                    document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>';
                }
            }
        }
    }

    handleNext() {
        console.log('⏭️ Next clicked');
        
        if (window.PlaybackController && window.PlaybackController.playNextVideo) {
            window.PlaybackController.playNextVideo();
        } else {
            mostrarMensajeFlotante('No hay más videos en la cola', 2000, 'info');
        }
    }

    // ===== CONFIGURACIÓN DE UI =====
    setupUI() {
        console.log('🎨 Configurando UI...');

        // Configurar navegación manual si integration-fix no está disponible
        if (!window.integration) {
            this.setupBasicNavigation();
        }

        // Configurar botón de añadir playlist
        const addPlaylistBtn = document.getElementById('añadirUrlButton');
        if (addPlaylistBtn && !addPlaylistBtn.dataset.uiConfigured) {
            addPlaylistBtn.dataset.uiConfigured = 'true';
            addPlaylistBtn.addEventListener('click', () => this.handleAddPlaylist());
        }

        console.log('✅ UI configurada');
    }

    setupBasicNavigation() {
        const navItems = document.querySelectorAll('[data-view]');
        navItems.forEach(item => {
            if (item.dataset.navConfigured) return;
            item.dataset.navConfigured = 'true';

            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view);
            });
        });
    }

    switchView(viewName) {
        console.log('📱 Cambiando vista a:', viewName);

        // Actualizar vistas de contenido
        document.querySelectorAll('.content-view').forEach(view => {
            const isActive = view.id === `${viewName}View`;
            view.classList.toggle('active', isActive);
        });

        // Actualizar navegación
        document.querySelectorAll('[data-view]').forEach(item => {
            const isActive = item.dataset.view === viewName;
            item.classList.toggle('active', isActive);
        });
    }

    handleAddPlaylist() {
        const urlInput = document.getElementById('searchInput2');
        if (!urlInput) return;

        const url = urlInput.value.trim();
        if (!url) {
            mostrarMensajeFlotante('Introduce una URL de playlist', 3000, 'warning');
            return;
        }

        console.log('➕ Añadiendo playlist desde URL:', url);
        mostrarMensajeFlotante('Cargando playlist...', 3000, 'info');
        
        // Limpiar input
        urlInput.value = '';

        // Simular carga (en producción usaría PlaylistManager)
        setTimeout(() => {
            mostrarMensajeFlotante('Función de playlist URL próximamente', 3000, 'info');
        }, 2000);
    }

    // ===== UTILIDADES =====
    formatDuration(duration) {
        if (!duration || isNaN(duration)) return '0:00';
        
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // ===== DEBUG =====
    debug() {
        console.log('=== MAIN APP DEBUG ===');
        console.log('Initialized:', this.initialized);
        console.log('Auth initialized:', this.authInitialized);
        console.log('Playlist count:', PlaylistState.playlistsData?.length || 0);
        console.log('Search state:', SearchState);
        console.log('App state:', AppState);
        console.log('=====================');
    }
}

// Crear instancia global
const mainApp = new MainApp();

// Auto-inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏁 DOM listo - Iniciando MainApp...');
    mainApp.initialize().catch(error => {
        console.error('💥 Error crítico en MainApp:', error);
        // Mostrar error al usuario (similar al que está en app-bootstrap.js)
    });
});

// Exportar globalmente
window.mainApp = mainApp;
window.debugMainApp = () => mainApp.debug();

export default mainApp;
