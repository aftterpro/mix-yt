// ===== CORE.JS - SISTEMA UNIFICADO YT CROSSMIX =====
// Fase 1: Reemplaza main-app.js, app-bootstrap.js e integration-fix.js

import { CONFIG } from './config.js';

// ===== 1. ESTADO UNIFICADO =====
class UnifiedStateManager {
    constructor() {
        this.state = {
            app: {
                player1: null,
                player2: null,
                currentPlayer: 1,
                playersInitialized: false,
                youtubeAPIReady: false,
                isTransitioning: false,
                isAudioFading: false,
                hasOutroCrossfadeStarted: false,
                crossfadeInterval: null,
                crossfadeInProgress: false,
                reproduccionIniciada: false,
                monitorInterval: null
            },
            ui: {
                currentView: 'home',
                isDesktop: window.innerWidth >= 1024,
                isPlaying: false,
                currentTrack: null,
                expandedPlaylists: new Set()
            },
            playlist: {
                playlistsData: [],
                currentPlayingInfo: {
                    playlistId: null,
                    videoId: null,
                    flattenedIndex: -1
                }
            },
            search: {
                isLoadingMore: false,
                nextPageContext: null,
                currentSearchQuery: '',
                resultsContainer: null,
                resultsDiv: null
            },
            sponsorBlock: {
                segmentosCache: {},
                lastSeekEndTime: -1,
                lastSeekVideoId: null
            },
            auth: {
                isAuthenticated: false,
                token: null,
                user: null
            }
        };
        
        this.subscribers = new Map();
        this.setupGlobalReferences();
    }
    
    setupGlobalReferences() {
        // ✅ REFERENCIAS ÚNICAS - NO duplicar
        window.State = this.state;
        window.stateManager = this;
        
        // Mantener compatibilidad temporal (ELIMINAR después de migración)
        window.AppState = this.state.app;
        window.PlaylistState = this.state.playlist;
        window.SearchState = this.state.search;
        window.SponsorBlockState = this.state.sponsorBlock;
        window.UIState = this.state.ui;
        
        console.log('📊 Estado unificado configurado');
    }
    
    get(path) {
        const parts = path.split('.');
        let current = this.state;
        for (const part of parts) {
            if (current[part] === undefined) {
                console.warn(`⚠️ Estado no encontrado: ${path}`);
                return undefined;
            }
            current = current[part];
        }
        return current;
    }
    
    set(path, value) {
        const parts = path.split('.');
        const lastPart = parts.pop();
        let current = this.state;
        
        for (const part of parts) {
            if (!current[part]) current[part] = {};
            current = current[part];
        }
        
        const oldValue = current[lastPart];
        current[lastPart] = value;
        
        this.notifySubscribers(path, value, oldValue);
        return value;
    }
    
    subscribe(path, callback) {
        if (!this.subscribers.has(path)) {
            this.subscribers.set(path, new Set());
        }
        this.subscribers.get(path).add(callback);
        
        return () => this.subscribers.get(path)?.delete(callback);
    }
    
    notifySubscribers(path, newValue, oldValue) {
        const pathSubscribers = this.subscribers.get(path);
        if (pathSubscribers) {
            pathSubscribers.forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error('State subscriber error:', error);
                }
            });
        }
    }
    
    reset() {
        console.log('🔄 Reseteando estado unificado...');
        
        // Reset manteniendo estructura
        Object.assign(this.state.app, {
            currentPlayer: 1,
            isTransitioning: false,
            isAudioFading: false,
            hasOutroCrossfadeStarted: false,
            crossfadeInProgress: false,
            reproduccionIniciada: false,
            monitorInterval: null,
            crossfadeInterval: null
        });
        
        Object.assign(this.state.playlist, {
            currentPlayingInfo: {
                playlistId: null,
                videoId: null,
                flattenedIndex: -1
            }
        });
        
        this.state.ui.currentView = 'home';
        this.state.ui.isPlaying = false;
        this.state.ui.currentTrack = null;
        
        this.notifySubscribers('*', 'reset', 'reset');
    }
    
    debug() {
        console.log('=== ESTADO UNIFICADO DEBUG ===');
        console.log('App:', this.state.app);
        console.log('UI:', this.state.ui);
        console.log('Playlist:', this.state.playlist);
        console.log('Auth:', this.state.auth);
        console.log('Subscribers:', Array.from(this.subscribers.keys()));
        console.log('==============================');
    }
}

// ===== 2. CORE PRINCIPAL =====
class YTCrossMixCore {
    constructor() {
        this.stateManager = new UnifiedStateManager();
        this.modules = new Map();
        this.initialized = false;
        this.startTime = Date.now();
        
        this.initSteps = [
            { name: 'initDOM', critical: true },
            { name: 'initYouTubeAPI', critical: true },
            { name: 'initAuth', critical: false },
            { name: 'initUI', critical: true },
            { name: 'initPlayback', critical: true },
            { name: 'finalizeSetup', critical: false }
        ];
        
        this.setupErrorHandling();
    }
    
    async initialize() {
        if (this.initialized) {
            console.warn('⚠️ Core ya inicializado');
            return this;
        }
        
        console.log('🚀 Iniciando YT CrossMix Core Unificado...');
        
        try {
            for (const step of this.initSteps) {
                await this.executeStep(step);
            }
            
            this.initialized = true;
            const totalTime = Date.now() - this.startTime;
            
            console.log(`✅ YT CrossMix Core inicializado en ${totalTime}ms`);
            this.dispatchReady();
            
            return this;
            
        } catch (error) {
            console.error('💥 Error crítico en inicialización Core:', error);
            this.handleCriticalError(error);
            throw error;
        }
    }
    
    async executeStep(step) {
        console.log(`📋 Ejecutando: ${step.name}`);
        
        try {
            await this[step.name]();
            console.log(`✅ ${step.name} completado`);
            
        } catch (error) {
            console.error(`❌ ${step.name} falló:`, error);
            
            if (step.critical) {
                throw new Error(`Paso crítico falló: ${step.name} - ${error.message}`);
            } else {
                console.warn(`⚠️ Continuando sin ${step.name} (no crítico)`);
            }
        }
    }
    
    // ===== PASOS DE INICIALIZACIÓN =====
    
    async initDOM() {
        await this.waitForDOM();
        this.setupCriticalElements();
        this.detectDevice();
        this.setupViewport();
        
        console.log('🏠 DOM inicializado');
    }
    
    async initYouTubeAPI() {
        console.log('🎥 Inicializando YouTube API...');
        
        return new Promise((resolve, reject) => {
            // Verificar si YT ya está disponible
            if (window.YT?.Player) {
                console.log('YT ya disponible, creando reproductores...');
                this.createYouTubePlayers();
                resolve();
                return;
            }
            
            // ✅ CALLBACK ÚNICO - No duplicar
            window.onYouTubeIframeAPIReady = () => {
                console.log('📺 YouTube API lista, creando reproductores...');
                this.createYouTubePlayers();
                resolve();
            };
            
            // Cargar script si no existe
            if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
                const script = document.createElement('script');
                script.src = 'https://www.youtube.com/iframe_api';
                script.async = true;
                script.onerror = reject;
                document.head.appendChild(script);
                console.log('📡 Cargando YouTube API script...');
            }
        });
    }
    
    async initAuth() {
        try {
            console.log('🔐 Inicializando autenticación...');
            const { authManager } = await import('./auth.js');
            this.modules.set('auth', authManager);
            await authManager.initialize();
            console.log('✅ Auth manager inicializado');
        } catch (error) {
            console.warn('⚠️ Error inicializando auth (no crítico):', error);
        }
    }
    
    async initUI() {
        console.log('🎨 Inicializando UI...');
        
        try {
            const { UIManager } = await import('./ui.js');
            this.modules.set('ui', UIManager);
            
            this.setupResponsive();
            this.setupNavigation();
            this.setupBasicControls();
            
            console.log('✅ UI Manager inicializado');
        } catch (error) {
            console.warn('⚠️ UI Manager no disponible, usando fallbacks');
            this.setupFallbackUI();
        }
    }
    
    async initPlayback() {
        try {
            console.log('🎵 Inicializando sistema de reproducción...');
            const { PlaybackController } = await import('./playbackController.js');
            this.modules.set('playback', PlaybackController);
            console.log('✅ Playback Controller cargado');
        } catch (error) {
            console.warn('⚠️ Error cargando PlaybackController:', error);
        }
    }
    
    async finalizeSetup() {
        console.log('🔧 Finalizando configuración...');
        
        // Setup global functions
        this.setupGlobalFunctions();
        
        // Setup event listeners globales
        this.setupGlobalEvents();
        
        // Health check
        this.performHealthCheck();
        
        console.log('✅ Configuración finalizada');
    }
    
    // ===== CREACIÓN DE REPRODUCTORES =====
    
    createYouTubePlayers() {
        const state = this.stateManager.state;
        
        // Verificar elementos DOM
        const player1El = document.getElementById('player1');
        const player2El = document.getElementById('player2');
        
        if (!player1El || !player2El) {
            console.error('❌ Elementos player1 o player2 no encontrados');
            throw new Error('Elementos de reproductores no encontrados en DOM');
        }
        
        console.log('🎬 Creando reproductores YouTube...');
        
        try {
            const playerConfig = {
                height: '315',
                width: '560',
                playerVars: {
                    'playsinline': 1,
                    'controls': 1,
                    'modestbranding': 1,
                    'rel': 0,
                    'showinfo': 0,
                    'enablejsapi': 1,
                    'origin': window.location.origin,
                    'autoplay': 0,
                    'mute': 0
                }
            };
            
            state.app.player1 = new YT.Player('player1', {
                ...playerConfig,
                events: {
                    'onReady': (e) => this.onPlayerReady(e, 1),
                    'onStateChange': (e) => this.onPlayerStateChange(e, 1),
                    'onError': (e) => this.onPlayerError(e, 1)
                }
            });
            
            state.app.player2 = new YT.Player('player2', {
                ...playerConfig,
                events: {
                    'onReady': (e) => this.onPlayerReady(e, 2),
                    'onStateChange': (e) => this.onPlayerStateChange(e, 2),
                    'onError': (e) => this.onPlayerError(e, 2)
                }
            });
            
            console.log('✅ Reproductores YouTube creados');
            
        } catch (error) {
            console.error('💥 Error creando reproductores:', error);
            throw error;
        }
    }
    
    onPlayerReady(event, playerNum) {
        console.log(`✅ Player ${playerNum} listo`);
        
        const state = this.stateManager.state;
        
        // Verificar si ambos están listos
        if (state.app.player1 && state.app.player2 && 
            typeof state.app.player1.getPlayerState === 'function' &&
            typeof state.app.player2.getPlayerState === 'function') {
            
            if (!state.app.playersInitialized) {
                state.app.playersInitialized = true;
                this.stateManager.set('app.playersInitialized', true);
                
                console.log('🎉 Ambos reproductores listos');
                
                // Habilitar controles
                this.enableControls();
                
                // Iniciar monitoring si hay PlaybackController
                this.startPlaybackMonitoring();
                
                // Dispatch evento
                window.dispatchEvent(new CustomEvent('playersReady'));
            }
        }
    }
    
    onPlayerStateChange(event, playerNum) {
        const playerState = event.data;
        const videoId = event.target.getVideoData()?.video_id;
        
        console.log(`🎵 Player ${playerNum} estado: ${this.getStateString(playerState)} (${videoId || 'No ID'})`);
        
        // Actualizar estado
        this.stateManager.set(`app.player${playerNum}State`, playerState);
        
        // Notificar cambios
        window.dispatchEvent(new CustomEvent('playerStateChanged', {
            detail: { 
                playerNum, 
                state: playerState, 
                videoId,
                playerInstance: event.target
            }
        }));
        
        if (playerState === YT.PlayerState.PLAYING) {
            this.handlePlayingState(playerNum, videoId);
        } else if (playerState === YT.PlayerState.ENDED) {
            this.handleEndedState(playerNum, videoId);
        }
    }
    
    onPlayerError(event, playerNum) {
        const errorCode = event.data;
        console.error(`❌ Error Player ${playerNum}:`, errorCode);
        
        const errorMessages = {
            2: 'ID de video inválido',
            5: 'Error de HTML5 o derechos de autor',
            100: 'Video no encontrado o eliminado',
            101: 'Reproducción incrustada no permitida por el propietario',
            150: 'Reproducción incrustada no permitida por el propietario'
        };
        
        const message = errorMessages[errorCode] || `Error desconocido (${errorCode})`;
        this.showMessage(`Player ${playerNum}: ${message}`, 'error');
        
        // Auto-skip en errores críticos
        if ([100, 101, 150].includes(errorCode)) {
            console.log('🔄 Auto-skip por error crítico...');
            setTimeout(() => this.skipToNext(), 1000);
        }
    }
    
    // ===== MANEJADORES DE ESTADO =====
    
    handlePlayingState(playerNum, videoId) {
        this.stateManager.set('ui.isPlaying', true);
        this.stateManager.set('ui.currentTrack', { videoId, playerNum });
        
        // Reset crossfade flags
        this.stateManager.set('app.hasOutroCrossfadeStarted', false);
        
        // Actualizar UI
        this.updatePlayButton(true);
        
        // SponsorBlock check
        this.checkSponsorBlock(playerNum);
    }
    
    handleEndedState(playerNum, videoId) {
        console.log(`🏁 Player ${playerNum} terminó: ${videoId}`);
        
        window.dispatchEvent(new CustomEvent('playerEnded', {
            detail: { playerNum, videoId }
        }));
    }
    
    async checkSponsorBlock(playerNum) {
        try {
            const { SponsorBlockManager } = await import('./sponsorblock.js');
            const player = this.stateManager.state.app[`player${playerNum}`];
            
            if (SponsorBlockManager && player) {
                SponsorBlockManager.checkAndSkipSegment(player, true);
            }
        } catch (error) {
            console.warn('SponsorBlock no disponible:', error);
        }
    }
    
    // ===== CONFIGURACIÓN DOM Y UI =====
    
    waitForDOM() {
        return new Promise(resolve => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            } else {
                resolve();
            }
        });
    }
    
    setupCriticalElements() {
        const requiredElements = [
            { id: 'player1', tag: 'div', className: 'video-player', parent: '#videoContainer' },
            { id: 'player2', tag: 'div', className: 'video-player hidden', parent: '#videoContainer' },
            { id: 'botonPlay', tag: 'button', className: 'control-button primary', parent: '.player-controls' },
            { id: 'botonNext', tag: 'button', className: 'control-button', parent: '.player-controls' },
            { id: 'videoContainer', tag: 'div', className: 'video-container', parent: '.now-playing-container' }
        ];
        
        requiredElements.forEach(({ id, tag, className, parent }) => {
            if (!document.getElementById(id)) {
                const element = document.createElement(tag);
                element.id = id;
                element.className = className;
                
                if (id === 'botonPlay') {
                    element.innerHTML = '<i class="fas fa-play"></i>';
                    element.disabled = true;
                    element.title = 'Reproducir/Pausar';
                } else if (id === 'botonNext') {
                    element.innerHTML = '<i class="fas fa-step-forward"></i>';
                    element.disabled = true;
                    element.title = 'Siguiente';
                }
                
                const container = document.querySelector(parent) || 
                                 document.querySelector('.player-controls') ||
                                 document.querySelector('.now-playing-container') ||
                                 document.body;
                
                if (container) {
                    container.appendChild(element);
                    console.log(`🔧 Elemento ${id} creado automáticamente`);
                }
            }
        });
    }
    
    detectDevice() {
        const isDesktop = window.innerWidth >= 1024;
        const isMobile = !isDesktop;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        
        this.stateManager.set('ui.isDesktop', isDesktop);
        this.stateManager.set('ui.isMobile', isMobile);
        this.stateManager.set('ui.isTablet', isTablet);
        
        document.body.classList.toggle('is-desktop', isDesktop);
        document.body.classList.toggle('is-mobile', isMobile);
        document.body.classList.toggle('is-tablet', isTablet);
        
        console.log(`📱 Dispositivo detectado: ${isDesktop ? 'Desktop' : isTablet ? 'Tablet' : 'Mobile'}`);
    }
    
    setupViewport() {
        // Viewport height dinámico para móviles
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setViewportHeight();
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', () => {
            setTimeout(setViewportHeight, 100);
        });
    }
    
    setupResponsive() {
        const handleResize = this.debounce(() => {
            this.detectDevice();
            this.updateLayoutForDevice();
        }, 250);
        
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', () => {
            setTimeout(handleResize, 100);
        });
        
        // Configuración inicial
        this.updateLayoutForDevice();
    }
    
    updateLayoutForDevice() {
        const isDesktop = this.stateManager.get('ui.isDesktop');
        
        // Mostrar/ocultar elementos según dispositivo
        const desktopElements = document.querySelectorAll('.desktop-sidebar, .bottom-player');
        const mobileElements = document.querySelectorAll('.mobile-header, .bottom-nav, .mini-player');
        
        desktopElements.forEach(el => {
            if (el) el.style.display = isDesktop ? (el.classList.contains('bottom-player') ? 'flex' : 'block') : 'none';
        });
        
        mobileElements.forEach(el => {
            if (el) el.style.display = isDesktop ? 'none' : (el.classList.contains('bottom-nav') || el.classList.contains('mini-player') ? 'flex' : 'block');
        });
        
        console.log(`🎨 Layout actualizado para: ${isDesktop ? 'Desktop' : 'Mobile'}`);
    }
    
    setupNavigation() {
        console.log('🧭 Configurando navegación unificada...');
        
        // Event delegation unificado
        document.addEventListener('click', (e) => {
            const navElement = e.target.closest('[data-view]');
            if (navElement) {
                e.preventDefault();
                e.stopPropagation();
                
                const view = navElement.dataset.view;
                if (view) {
                    setTimeout(() => this.switchView(view), 10);
                }
            }
        }, true);
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            
            switch (e.key) {
                case 'Escape':
                    this.closeModals();
                    break;
                case ' ':
                    if (!e.target.closest('button')) {
                        e.preventDefault();
                        this.togglePlay();
                    }
                    break;
            }
        });
    }
    
    setupBasicControls() {
        console.log('🎮 Configurando controles básicos...');
        
        // Play button
        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.togglePlay();
            });
        }
        
        // Next button
        const nextButton = document.getElementById('botonNext');
        if (nextButton) {
            nextButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.skipToNext();
            });
        }
    }
    
    setupFallbackUI() {
        console.log('🆘 Configurando UI de emergencia...');
        
        // Navigation básica
        document.querySelectorAll('[data-view]').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchView(element.dataset.view);
            });
        });
    }
    
    // ===== NAVEGACIÓN Y CONTROLES =====
    
    switchView(newView) {
        const currentView = this.stateManager.get('ui.currentView');
        if (currentView === newView) return;
        
        console.log(`🔄 Cambiando vista: ${currentView} → ${newView}`);
        
        // Ocultar todas las vistas
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });
        
        // Mostrar vista objetivo
        const targetView = document.getElementById(`${newView}View`);
        if (targetView) {
            targetView.classList.add('active');
            targetView.style.display = 'flex';
        }
        
        // Actualizar navegación
        document.querySelectorAll('[data-view]').forEach(item => {
            item.classList.toggle('active', item.dataset.view === newView);
        });
        
        this.stateManager.set('ui.currentView', newView);
        
        // Scroll al top
        if (targetView) {
            targetView.scrollTop = 0;
        }
        
        // Notificar cambio
        window.dispatchEvent(new CustomEvent('viewChanged', {
            detail: { from: currentView, to: newView }
        }));
    }
    
    togglePlay() {
        const playButton = document.getElementById('botonPlay');
        if (!playButton || playButton.disabled) return;
        
        console.log('🎵 Toggle play solicitado');
        
        const playback = this.modules.get('playback');
        const isPlaying = this.stateManager.get('ui.isPlaying');
        const hasStarted = this.stateManager.get('app.reproduccionIniciada');
        
        if (playback) {
            if (!hasStarted) {
                playback.playFirstVideo?.();
            } else {
                // Toggle current player
                this.toggleCurrentPlayer();
            }
        } else {
            this.showMessage('Sistema de reproducción no disponible', 'warning');
        }
    }
    
    toggleCurrentPlayer() {
        const state = this.stateManager.state.app;
        const activePlayer = state.currentPlayer === 1 ? state.player1 : state.player2;
        
        if (activePlayer && typeof activePlayer.getPlayerState === 'function') {
            const currentState = activePlayer.getPlayerState();
            
            if (currentState === YT.PlayerState.PLAYING) {
                activePlayer.pauseVideo();
                this.updatePlayButton(false);
            } else if (currentState === YT.PlayerState.PAUSED) {
                activePlayer.playVideo();
                this.updatePlayButton(true);
            }
        }
    }
    
    skipToNext() {
        console.log('⏭️ Skip to next solicitado');
        
        const playback = this.modules.get('playback');
        if (playback?.playNextVideo) {
            playback.playNextVideo();
        } else {
            this.showMessage('Función siguiente no disponible', 'warning');
        }
    }
    
    enableControls() {
        const playButton = document.getElementById('botonPlay');
        const nextButton = document.getElementById('botonNext');
        
        if (playButton) {
            playButton.disabled = false;
            console.log('✅ Controles habilitados');
        }
        
        if (nextButton) {
            nextButton.disabled = false;
        }
    }
    
    updatePlayButton(isPlaying) {
        const playButton = document.getElementById('botonPlay');
        const miniPlayBtn = document.getElementById('miniPlayBtn');
        
        const icon = isPlaying ? 'fa-pause' : 'fa-play';
        
        if (playButton) {
            const iconEl = playButton.querySelector('i');
            if (iconEl) {
                iconEl.className = `fas ${icon}`;
            }
        }
        
        if (miniPlayBtn) {
            const iconEl = miniPlayBtn.querySelector('i');
            if (iconEl) {
                iconEl.className = `fas ${icon}`;
            }
        }
    }
    
    closeModals() {
        document.querySelectorAll('.modal, .mobile-context-modal, .delete-menu-content').forEach(modal => {
            if (modal.style.display !== 'none') {
                modal.remove();
            }
        });
    }
    
    // ===== UTILIDADES =====
    
    startPlaybackMonitoring() {
        const playback = this.modules.get('playback');
        if (playback?.startMonitoring) {
            console.log('🔄 Iniciando monitoring de reproducción...');
            playback.startMonitoring();
        }
    }
    
    getStateString(state) {
        const states = {
            [-1]: 'UNSTARTED',
            [0]: 'ENDED',
            [1]: 'PLAYING',
            [2]: 'PAUSED',
            [3]: 'BUFFERING',
            [5]: 'CUED'
        };
        return states[state] || 'UNKNOWN';
    }
    
    setupErrorHandling() {
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
            if (e.error && !e.error.message?.includes('Extension')) {
                this.showMessage('Error en la aplicación', 'error');
            }
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled promise rejection:', e.reason);
            e.preventDefault();
        });
    }
    
    setupGlobalFunctions() {
        // Funciones globales de utilidad
        window.ytCrossMix = this;
        window.State = this.stateManager.state;
        window.stateManager = this.stateManager;
        
        window.showMessage = (msg, type, duration) => this.showMessage(msg, type, duration);
        window.switchView = (view) => this.switchView(view);
        window.debugApp = () => this.stateManager.debug();
        window.resetApp = () => this.reset();
        
        console.log('🌐 Funciones globales configuradas');
    }
    
    setupGlobalEvents() {
        // Online/Offline status
        window.addEventListener('online', () => {
            console.log('🌐 Conexión restaurada');
            this.showMessage('Conexión restaurada', 'success', 2000);
        });
        
        window.addEventListener('offline', () => {
            console.log('🌐 Sin conexión');
            this.showMessage('Sin conexión a internet', 'warning', 3000);
        });
        
        // Cleanup al cerrar
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    // ===== SISTEMA DE MENSAJES UNIFICADO =====
    
    showMessage(message, type = 'info', duration = 3000) {
        if (!message) return;
        
        console.log(`💬 Mensaje [${type}]:`, message);
        
        const messageEl = document.createElement('div');
        messageEl.textContent = message;
        messageEl.className = 'floating-message';
        
        const colors = {
            info: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(26, 26, 26, 0.9))',
            success: 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9))',
            error: 'linear-gradient(135deg, rgba(244, 67, 54, 0.9), rgba(211, 47, 47, 0.9))',
            warning: 'linear-gradient(135deg, rgba(255, 193, 7, 0.9), rgba(245, 124, 0, 0.9))'
        };
        
        Object.assign(messageEl.style, {
            position: 'fixed',
            bottom: 'calc(64px + 64px + 20px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%) translateY(100px) scale(0.8)',
            zIndex: '10001',
            background: colors[type] || colors.info,
            color: 'white',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '500',
            maxWidth: 'calc(100vw - 32px)',
            wordWrap: 'break-word',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            opacity: '0',
            transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            pointerEvents: 'none'
        });
        
        document.body.appendChild(messageEl);
        
        // Animación de entrada
        requestAnimationFrame(() => {
            messageEl.style.transform = 'translateX(-50%) translateY(0) scale(1)';
            messageEl.style.opacity = '1';
        });
        
        // Auto-remove
        setTimeout(() => {
            messageEl.style.opacity = '0';
            setTimeout(() => messageEl.remove(), 400);
        }, duration);
        
        // Click para cerrar
        messageEl.addEventListener('click', () => {
            messageEl.style.opacity = '0';
            setTimeout(() => messageEl.remove(), 200);
        });
    }
    
    // ===== HEALTH CHECK Y DIAGNÓSTICO =====
    
    performHealthCheck() {
        const health = {
            core: this.initialized,
            dom: document.readyState === 'complete',
            youtube: this.stateManager.get('app.playersInitialized'),
            modules: this.modules.size,
            state: !!this.stateManager.state,
            ui: {
                currentView: this.stateManager.get('ui.currentView'),
                isDesktop: this.stateManager.get('ui.isDesktop')
            }
        };
        
        console.log('🔍 Health Check:', health);
        
        const issues = [];
        if (!health.core) issues.push('Core no inicializado');
        if (!health.youtube) issues.push('YouTube no listo');
        if (health.modules < 2) issues.push('Módulos insuficientes');
        
        if (issues.length > 0) {
            console.warn('⚠️ Issues detectados:', issues);
        } else {
            console.log('✅ Health Check: Todo OK');
        }
        
        return health;
    }
    
    // ===== MANEJO DE ERRORES =====
    
    handleCriticalError(error) {
        console.error('💀 Error crítico en Core:', error);
        
        this.showMessage('Error crítico en la aplicación', 'error', 8000);
        
        // Intentar recuperación básica
        try {
            this.cleanup();
            this.stateManager.reset();
        } catch (recoveryError) {
            console.error('💥 Falló la recuperación:', recoveryError);
            this.showCriticalErrorView(error, recoveryError);
        }
    }
    
    showCriticalErrorView(error, recoveryError = null) {
        document.body.innerHTML = `
            <div style="
                display: flex; align-items: center; justify-content: center;
                min-height: 100vh; background: #0f0f0f; color: white;
                font-family: 'Roboto', sans-serif; text-align: center; padding: 20px;
            ">
                <div>
                    <h1>💀 YT CrossMix - Error Crítico</h1>
                    <p>La aplicación encontró un error irrecuperable.</p>
                    <details style="margin: 20px 0; text-align: left;">
                        <summary>Detalles del error</summary>
                        <pre style="background: #333; padding: 10px; border-radius: 4px; margin-top: 10px; font-size: 12px;">
Error Principal: ${error.message}
Stack: ${error.stack}
${recoveryError ? `
Error de Recuperación: ${recoveryError.message}` : ''}
                        </pre>
                    </details>
                    <button onclick="location.reload()" style="
                        background: #ff6b35; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; margin: 10px;
                    ">Recargar Página</button>
                    <button onclick="localStorage.clear(); location.reload()" style="
                        background: #666; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; margin: 10px;
                    ">Limpiar y Recargar</button>
                </div>
            </div>
        `;
    }
    
    // ===== CLEANUP Y RESET =====
    
    cleanup() {
        console.log('🧹 Limpiando Core...');
        
        const state = this.stateManager.state.app;
        
        // Limpiar intervalos
        if (state.monitorInterval) {
            clearInterval(state.monitorInterval);
            state.monitorInterval = null;
        }
        
        if (state.crossfadeInterval) {
            clearInterval(state.crossfadeInterval);
            state.crossfadeInterval = null;
        }
        
        // Pausar reproductores
        try {
            if (state.player1?.pauseVideo) state.player1.pauseVideo();
            if (state.player2?.pauseVideo) state.player2.pauseVideo();
        } catch (error) {
            console.warn('Error pausando reproductores:', error);
        }
        
        console.log('✅ Cleanup completado');
    }
    
    reset() {
        if (confirm('¿Seguro que quieres reiniciar la aplicación?')) {
            console.log('🔄 Reiniciando Core...');
            
            try {
                this.cleanup();
                this.stateManager.reset();
                this.switchView('home');
                this.updatePlayButton(false);
                
                this.showMessage('Aplicación reiniciada correctamente', 'success');
                
            } catch (error) {
                console.error('Error en reset:', error);
                this.showMessage('Error reiniciando aplicación', 'error');
            }
        }
    }
    
    // ===== FINALIZACIÓN =====
    
    dispatchReady() {
        console.log('🎉 YT CrossMix Core completamente listo');
        
        window.dispatchEvent(new CustomEvent('ytcrossmix:ready', {
            detail: { 
                timestamp: Date.now(),
                core: this,
                state: this.stateManager.state
            }
        }));
        
        this.showMessage('🎵 YT CrossMix listo para usar', 'success');
    }
    
    // ===== UTILIDADES =====
    
    debounce(func, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    }
    
    getDebugInfo() {
        return {
            initialized: this.initialized,
            modules: Array.from(this.modules.keys()),
            state: this.stateManager.state,
            health: this.performHealthCheck()
        };
    }
}

// ===== 3. INICIALIZACIÓN AUTOMÁTICA =====

let coreInstance = null;

async function initializeYTCrossMix() {
    if (coreInstance) {
        console.warn('⚠️ YT CrossMix ya inicializado');
        return coreInstance;
    }
    
    console.log('🚀 Iniciando YT CrossMix Core Sistema Unificado...');
    
    try {
        coreInstance = new YTCrossMixCore();
        await coreInstance.initialize();
        
        console.log('✅ YT CrossMix inicializado exitosamente');
        return coreInstance;
        
    } catch (error) {
        console.error('💥 Error fatal iniciando YT CrossMix:', error);
        
        // Mostrar error básico
        document.body.innerHTML = `
            <div style="
                display: flex; align-items: center; justify-content: center;
                min-height: 100vh; background: #0f0f0f; color: white;
                font-family: 'Roboto', sans-serif; text-align: center; padding: 20px;
            ">
                <div>
                    <h1>❌ Error de Inicialización</h1>
                    <p>YT CrossMix no pudo cargar correctamente.</p>
                    <code style="background: #333; padding: 10px; border-radius: 4px; display: block; margin: 20px 0;">
                        ${error.message}
                    </code>
                    <button onclick="location.reload()" style="
                        background: #ff6b35; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; margin-top: 20px;
                    ">Recargar Página</button>
                </div>
            </div>
        `;
        
        throw error;
    }
}

// ===== AUTO-INICIALIZACIÓN =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeYTCrossMix);
} else {
    initializeYTCrossMix();
}

// ===== EXPORTS =====
export { YTCrossMixCore, UnifiedStateManager, initializeYTCrossMix };
