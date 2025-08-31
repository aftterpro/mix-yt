// ===== SYSTEM-FIXES.JS - CORRECCIONES COMPLETAS PARA YT CROSSMIX =====
// Archivo separado con todas las correcciones críticas

console.log('🔧 Cargando correcciones del sistema YT CrossMix...');

// ===== 1. FIX CRÍTICO: MESSAGE MANAGER =====
class UnifiedMessageManagerFix {
    static create() {
        if (window.unifiedMessageManager && typeof window.unifiedMessageManager.show === 'function') {
            return; // Ya existe y funciona
        }
        
        console.log('🔧 Creando MessageManager funcional...');
        
        window.unifiedMessageManager = {
            show: (message, type = 'info', duration = 3000) => {
                console.log(`💬 [${type.toUpperCase()}] ${message}`);
                
                const messageEl = document.createElement('div');
                messageEl.className = 'unified-message-fix';
                messageEl.style.cssText = `
                    position: fixed;
                    bottom: calc(80px + env(safe-area-inset-bottom, 0px));
                    left: 50%;
                    transform: translateX(-50%) translateY(100px);
                    z-index: 10001;
                    background: ${UnifiedMessageManagerFix.getBackgroundForType(type)};
                    color: white;
                    padding: 12px 20px;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 500;
                    max-width: calc(100vw - 32px);
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    opacity: 0;
                    transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                    cursor: pointer;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                `;
                
                messageEl.textContent = message;
                document.body.appendChild(messageEl);
                
                // Animación de entrada
                requestAnimationFrame(() => {
                    messageEl.style.opacity = '1';
                    messageEl.style.transform = 'translateX(-50%) translateY(0)';
                });
                
                // Click to dismiss
                messageEl.addEventListener('click', () => {
                    UnifiedMessageManagerFix.hide(messageEl);
                });
                
                // Auto-remove
                setTimeout(() => {
                    UnifiedMessageManagerFix.hide(messageEl);
                }, duration);
                
                return messageEl;
            },
            
            hide: (messageEl) => UnifiedMessageManagerFix.hide(messageEl)
        };
        
        console.log('✅ MessageManager funcional creado');
    }
    
    static hide(messageEl) {
        if (!messageEl || !messageEl.parentNode) return;
        
        messageEl.style.opacity = '0';
        messageEl.style.transform = 'translateX(-50%) translateY(-20px) scale(0.9)';
        
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
        }, 400);
    }
    
    static getBackgroundForType(type) {
        const backgrounds = {
            'success': 'linear-gradient(135deg, rgba(76, 175, 80, 0.95), rgba(56, 142, 60, 0.95))',
            'error': 'linear-gradient(135deg, rgba(244, 67, 54, 0.95), rgba(211, 47, 47, 0.95))',
            'warning': 'linear-gradient(135deg, rgba(255, 193, 7, 0.95), rgba(245, 124, 0, 0.95))',
            'info': 'linear-gradient(135deg, rgba(33, 150, 243, 0.95), rgba(21, 101, 192, 0.95))'
        };
        return backgrounds[type] || backgrounds.info;
    }
}

// ===== 2. FIX CRÍTICO: AUTH MANAGER =====
class AuthManagerFix {
    static async ensure() {
        if (window.authManager && typeof window.authManager.handleAuthClick === 'function') {
            return true; // Ya existe y funciona
        }
        
        console.log('🔧 Corrigiendo AuthManager...');
        
        try {
            // Intentar cargar el módulo de autenticación
            if (typeof window.authManager === 'undefined') {
                // Crear placeholder temporal
                window.authManager = {
                    isInitializing: false,
                    gapiReady: false,
                    gisReady: false,
                    isAuthenticated: false,
                    
                    async initialize() {
                        console.log('🔐 Inicializando AuthManager...');
                        this.isInitializing = true;
                        
                        try {
                            // Esperar a que las APIs de Google estén disponibles
                            await this.waitForGoogleAPIs();
                            
                            // Configurar GAPI
                            await this.initializeGAPI();
                            
                            // Configurar GIS
                            this.initializeGIS();
                            
                            this.isInitializing = false;
                            console.log('✅ AuthManager inicializado');
                            return true;
                            
                        } catch (error) {
                            console.error('❌ Error inicializando AuthManager:', error);
                            this.isInitializing = false;
                            throw error;
                        }
                    },
                    
                    waitForGoogleAPIs() {
                        return new Promise((resolve, reject) => {
                            const checkAPIs = () => {
                                if (window.gapi && window.google?.accounts) {
                                    resolve();
                                } else {
                                    setTimeout(checkAPIs, 100);
                                }
                            };
                            checkAPIs();
                            
                            setTimeout(() => reject(new Error('Timeout esperando APIs de Google')), 15000);
                        });
                    },
                    
                    async initializeGAPI() {
                        return new Promise((resolve, reject) => {
                            gapi.load('client', {
                                callback: async () => {
                                    try {
                                        await gapi.client.init({
                                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
                                        });
                                        this.gapiReady = true;
                                        resolve();
                                    } catch (error) {
                                        reject(error);
                                    }
                                },
                                onerror: reject
                            });
                        });
                    },
                    
                    initializeGIS() {
                        if (window.google?.accounts) {
                            this.tokenClient = google.accounts.oauth2.initTokenClient({
                                client_id: '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com',
                                scope: 'https://www.googleapis.com/auth/youtube.readonly',
                                callback: (tokenResponse) => this.handleTokenResponse(tokenResponse)
                            });
                            this.gisReady = true;
                        }
                    },
                    
                    handleAuthClick() {
                        console.log('🔐 Click en autenticación');
                        
                        if (!this.gapiReady || !this.gisReady) {
                            window.unifiedMessageManager?.show('Sistema de autenticación inicializando...', 'warning');
                            this.initialize().then(() => {
                                this.handleAuthClick();
                            }).catch(error => {
                                window.unifiedMessageManager?.show('Error inicializando autenticación', 'error');
                            });
                            return;
                        }
                        
                        if (this.tokenClient) {
                            this.tokenClient.requestAccessToken({ prompt: 'consent' });
                        } else {
                            window.unifiedMessageManager?.show('Error: Cliente de tokens no disponible', 'error');
                        }
                    },
                    
                    handleTokenResponse(tokenResponse) {
                        if (tokenResponse && tokenResponse.access_token) {
                            gapi.client.setToken(tokenResponse);
                            this.isAuthenticated = true;
                            
                            localStorage.setItem('google_token', JSON.stringify({
                                ...tokenResponse,
                                timestamp: Date.now()
                            }));
                            
                            window.unifiedMessageManager?.show('Autenticación exitosa', 'success');
                            
                            // Actualizar UI
                            this.updateUI(true);
                            
                            // Cargar playlists
                            setTimeout(() => {
                                this.getPlaylists();
                            }, 1000);
                            
                        } else {
                            window.unifiedMessageManager?.show('Error en la autenticación', 'error');
                        }
                    },
                    
                    async getPlaylists() {
                        console.log('📚 Obteniendo playlists de YouTube...');
                        
                        try {
                            const response = await gapi.client.youtube.playlists.list({
                                'part': ['snippet', 'contentDetails'],
                                'mine': true,
                                'maxResults': 50
                            });
                            
                            if (response.result && response.result.items) {
                                const playlists = response.result.items;
                                console.log(`✅ ${playlists.length} playlists obtenidas`);
                                
                                // Disparar evento
                                document.dispatchEvent(new CustomEvent('playlistsFetched', {
                                    detail: playlists
                                }));
                                
                                window.unifiedMessageManager?.show(`${playlists.length} playlists cargadas`, 'success');
                            }
                            
                        } catch (error) {
                            console.error('❌ Error obteniendo playlists:', error);
                            window.unifiedMessageManager?.show('Error cargando playlists', 'error');
                        }
                    },
                    
                    updateUI(isLoggedIn) {
                        const signInButton = document.getElementById('googleSignInButton');
                        const signOutButton = document.getElementById('googleSignOutButton');
                        
                        if (isLoggedIn) {
                            if (signInButton) {
                                signInButton.classList.add('hidden');
                            }
                            if (signOutButton) {
                                signOutButton.classList.remove('hidden');
                            }
                        } else {
                            if (signInButton) {
                                signInButton.classList.remove('hidden');
                            }
                            if (signOutButton) {
                                signOutButton.classList.add('hidden');
                            }
                        }
                    },
                    
                    isUserAuthenticated() {
                        return this.isAuthenticated && this.gapiReady;
                    }
                };
                
                // Auto-inicializar si las APIs están disponibles
                if (window.gapi && window.google?.accounts) {
                    window.authManager.initialize().catch(console.error);
                }
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Error configurando AuthManager:', error);
            
            // Crear placeholder que al menos no rompa la aplicación
            window.authManager = {
                handleAuthClick: () => {
                    window.unifiedMessageManager?.show(
                        'Error: Sistema de autenticación no disponible. Recarga la página.',
                        'error',
                        5000
                    );
                },
                isUserAuthenticated: () => false
            };
            
            return false;
        }
    }
}

// ===== 3. FIX CRÍTICO: COLA DE REPRODUCCIÓN =====
class QueueManagerFix {
    static setup() {
        console.log('📋 Configurando cola de reproducción...');
        
        // Setup botón de cola
        const queueButton = document.getElementById('queueButton');
        if (queueButton) {
            QueueManagerFix.setupQueueButton(queueButton);
        }
        
        // Setup botón de cerrar cola
        const queueCloseBtn = document.getElementById('queueCloseBtn');
        if (queueCloseBtn) {
            QueueManagerFix.setupCloseButton(queueCloseBtn);
        }
        
        // Configurar cola como popup
        QueueManagerFix.configureQueuePopup();
        
        console.log('✅ Cola de reproducción configurada');
    }
    
    static setupQueueButton(queueButton) {
        // Remover listeners existentes
        const newQueueButton = queueButton.cloneNode(true);
        queueButton.parentNode.replaceChild(newQueueButton, queueButton);
        
        newQueueButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('📋 Click en botón de cola');
            QueueManagerFix.toggleQueue();
        });
    }
    
    static setupCloseButton(queueCloseBtn) {
        // Remover listeners existentes
        const newCloseBtn = queueCloseBtn.cloneNode(true);
        queueCloseBtn.parentNode.replaceChild(newCloseBtn, queueCloseBtn);
        
        newCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('❌ Click en cerrar cola');
            QueueManagerFix.hideQueue();
        });
    }
    
    static configureQueuePopup() {
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) return;
        
        // Aplicar estilos para popup
        queueSection.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        `;
        
        // Inicialmente oculto
        if (!queueSection.classList.contains('hidden')) {
            queueSection.classList.add('hidden');
        }
        
        // Configurar contenedor de playlist
        const playlistContainer = queueSection.querySelector('#playlistContainer');
        if (playlistContainer) {
            playlistContainer.style.cssText = `
                width: 90vw;
                max-width: 800px;
                max-height: 70vh;
                background: var(--background-secondary, #181818);
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            `;
        }
    }
    
    static toggleQueue() {
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) {
            console.warn('⚠️ queueSection no encontrado');
            return;
        }
        
        if (queueSection.classList.contains('hidden')) {
            QueueManagerFix.showQueue();
        } else {
            QueueManagerFix.hideQueue();
        }
    }
    
    static showQueue() {
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) return;
        
        console.log('📋 Mostrando cola');
        
        // Actualizar contenido antes de mostrar
        QueueManagerFix.updateQueueContent();
        
        // Mostrar
        queueSection.classList.remove('hidden');
        queueSection.style.opacity = '1';
        queueSection.style.visibility = 'visible';
        
        // Focus para accesibilidad
        const closeBtn = queueSection.querySelector('#queueCloseBtn');
        if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 100);
        }
    }
    
    static hideQueue() {
        const queueSection = document.getElementById('queueSection');
        if (!queueSection) return;
        
        console.log('📋 Ocultando cola');
        
        queueSection.classList.add('hidden');
        queueSection.style.opacity = '0';
        queueSection.style.visibility = 'hidden';
    }
    
    static updateQueueContent() {
        const playlistContainer = document.getElementById('playlistContainer');
        if (!playlistContainer) return;
        
        // Obtener cola del estado
        const state = window.unifiedStateManager?.state;
        const manualPlaylist = state?.playlist?.playlistsData?.find(p => p.id === 'manual');
        
        if (!manualPlaylist || !manualPlaylist.videos || manualPlaylist.videos.length === 0) {
            playlistContainer.innerHTML = `
                <div class="empty-queue-message">
                    <i class="fas fa-music"></i>
                    <p>La cola está vacía</p>
                    <p>Añade música desde la biblioteca o búsqueda</p>
                </div>
            `;
        } else {
            playlistContainer.innerHTML = '';
            
            manualPlaylist.videos.forEach((video, index) => {
                const videoItem = QueueManagerFix.createQueueVideoItem(video, index);
                playlistContainer.appendChild(videoItem);
            });
        }
    }
    
    static createQueueVideoItem(video, index) {
        const item = document.createElement('div');
        item.className = 'playlist-video-item queue-video-item';
        item.dataset.videoId = video.videoId;
        
        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/default.jpg`;
        const duration = QueueManagerFix.formatDuration(video.duration);
        
        item.innerHTML = `
            <div class="video-index">${index + 1}</div>
            <img src="${thumbnailUrl}" class="video-thumbnail" alt="${video.title}">
            <div class="video-info">
                <div class="video-title">${QueueManagerFix.escapeHtml(video.title)}</div>
                <div class="video-meta">
                    <span class="video-channel">${QueueManagerFix.escapeHtml(video.channelTitle || 'YouTube')}</span>
                    ${duration ? `<span class="video-duration">${duration}</span>` : ''}
                </div>
            </div>
            <div class="video-actions">
                <button class="video-action-btn" data-action="remove-from-queue" 
                        data-video-id="${video.videoId}" title="Eliminar de la cola">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        return item;
    }
    
    static formatDuration(duration) {
        if (!duration || isNaN(duration)) return "0:00";
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    static escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ===== 4. FIX CRÍTICO: UI MÓVIL =====
class MobileUIFix {
    static setup() {
        console.log('📱 Configurando UI móvil...');
        
        MobileUIFix.ensureElements();
        MobileUIFix.applyResponsiveStyles();
        MobileUIFix.setupEventListeners();
        
        console.log('✅ UI móvil configurada');
    }
    
    static ensureElements() {
        // Verificar que todos los elementos móviles existan
        MobileUIFix.ensureMobileHeader();
        MobileUIFix.ensureMiniPlayer();
        MobileUIFix.ensureBottomNav();
    }
    
    static ensureMobileHeader() {
        let mobileHeader = document.querySelector('.mobile-header');
        if (!mobileHeader) {
            mobileHeader = document.createElement('div');
            mobileHeader.className = 'mobile-header';
            mobileHeader.innerHTML = `
                <div class="mobile-logo">
                    <div class="logo-icon"><i class="fas fa-music"></i></div>
                    <span class="logo-text">YT CrossMix</span>
                </div>
                <div class="mobile-search">
                    <input type="text" id="mobileSearchInput" class="mobile-search-input" 
                           placeholder="Buscar música..." data-requires-unified>
                </div>
                <div class="mobile-user-actions">
                    <button class="mobile-menu-btn" data-requires-unified>
                        <i class="fas fa-user"></i>
                    </button>
                </div>
            `;
            document.body.insertBefore(mobileHeader, document.body.firstChild);
        }
    }
    
    static ensureMiniPlayer() {
        let miniPlayer = document.querySelector('.mini-player');
        if (!miniPlayer) {
            miniPlayer = document.createElement('div');
            miniPlayer.className = 'mini-player';
            miniPlayer.innerHTML = `
                <div class="mini-player-track">
                    <img src="" alt="Playing" class="mini-track-image">
                    <div class="mini-track-info">
                        <div class="mini-track-title">Selecciona una canción</div>
                        <div class="mini-track-artist">YT CrossMix</div>
                    </div>
                </div>
                <div class="mini-player-controls">
                    <button class="mini-control-btn" id="miniPlayBtn" data-requires-unified>
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="mini-control-btn" id="miniNextBtn" data-requires-unified>
                        <i class="fas fa-step-forward"></i>
                    </button>
                </div>
            `;
            document.body.appendChild(miniPlayer);
        }
    }
    
    static ensureBottomNav() {
        let bottomNav = document.querySelector('.bottom-nav');
        if (!bottomNav) {
            bottomNav = document.createElement('div');
            bottomNav.className = 'bottom-nav';
            bottomNav.innerHTML = `
                <button class="nav-tab active" data-view="home" data-requires-unified>
                    <i class="fas fa-home"></i>
                    <span>Inicio</span>
                </button>
                <button class="nav-tab" data-view="search" data-requires-unified>
                    <i class="fas fa-search"></i>
                    <span>Buscar</span>
                </button>
                <button class="nav-tab" data-view="library" data-requires-unified>
                    <i class="fas fa-folder"></i>
                    <span>Biblioteca</span>
                </button>
                <button class="nav-tab" data-view="playing" data-requires-unified>
                    <i class="fas fa-music"></i>
                    <span>Reproduciendo</span>
                </button>
            `;
            document.body.appendChild(bottomNav);
        }
    }
    
    static applyResponsiveStyles() {
        const isMobile = window.innerWidth <= 768;
        
        const mobileHeader = document.querySelector('.mobile-header');
        const miniPlayer = document.querySelector('.mini-player');
        const bottomNav = document.querySelector('.bottom-nav');
        const desktopSidebar = document.querySelector('.desktop-sidebar');
        const bottomPlayer = document.querySelector('.bottom-player');
        const mainContent = document.querySelector('.main-content');
        
        if (isMobile) {
            // Mostrar elementos móviles
            if (mobileHeader) mobileHeader.style.display = 'flex';
            if (miniPlayer) miniPlayer.style.display = 'flex';
            if (bottomNav) bottomNav.style.display = 'flex';
            
            // Ocultar elementos desktop
            if (desktopSidebar) desktopSidebar.style.display = 'none';
            if (bottomPlayer) bottomPlayer.style.display = 'none';
            
            // Ajustar main content
            if (mainContent) {
                mainContent.style.marginTop = '56px';
                mainContent.style.paddingBottom = '124px'; // 60px bottom nav + 64px mini player
            }
            
        } else {
            // Ocultar elementos móviles
            if (mobileHeader) mobileHeader.style.display = 'none';
            if (miniPlayer) miniPlayer.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            
            // Mostrar elementos desktop
            if (desktopSidebar) desktopSidebar.style.display = 'flex';
            if (bottomPlayer) bottomPlayer.style.display = 'flex';
            
            // Resetear main content
            if (mainContent) {
                mainContent.style.marginTop = '';
                mainContent.style.paddingBottom = '80px'; // Solo bottom player
            }
        }
    }
    
    static setupEventListeners() {
        window.addEventListener('resize', () => {
            MobileUIFix.applyResponsiveStyles();
        });
        
        // Setup mini player controls
        const miniPlayBtn = document.getElementById('miniPlayBtn');
        const miniNextBtn = document.getElementById('miniNextBtn');
        
        if (miniPlayBtn) {
            miniPlayBtn.addEventListener('click', () => {
                console.log('📱 Mini play button clicked');
                if (window.UIManager?.handlePlayButtonClick) {
                    window.UIManager.handlePlayButtonClick();
                }
            });
        }
        
        if (miniNextBtn) {
            miniNextBtn.addEventListener('click', () => {
                console.log('📱 Mini next button clicked');
                if (window.UIManager?.handleNextButtonClick) {
                    window.UIManager.handleNextButtonClick();
                }
            });
        }
    }
}

// ===== 5. FIX: VISIBILIDAD DE BOTONES =====
class ButtonVisibilityFix {
    static setup() {
        console.log('👁️ Configurando visibilidad de botones...');
        
        ButtonVisibilityFix.setupViewChangeListener();
        ButtonVisibilityFix.updateButtonVisibility();
        
        console.log('✅ Visibilidad de botones configurada');
    }
    
    static updateButtonVisibility() {
        const currentView = ButtonVisibilityFix.getCurrentView();
        
        // Botones que solo deben estar en biblioteca
        const libraryOnlyButtons = [
            document.getElementById('debugButton'),
            document.getElementById('resetButton')
        ];
        
        libraryOnlyButtons.forEach(button => {
            if (button) {
                if (currentView === 'library') {
                    button.style.display = '';
                    button.classList.remove('hide-outside-library');
                } else {
                    button.style.display = 'none';
                    button.classList.add('hide-outside-library');
                }
            }
        });
        
        // Los botones de auth siempre visibles
        const authButtons = [
            document.getElementById('googleSignInButton'),
            document.getElementById('googleSignOutButton')
        ];
        
        authButtons.forEach(button => {
            if (button) {
                button.style.display = '';
            }
        });
    }
    
    static getCurrentView() {
        const activeView = document.querySelector('.content-view.active');
        return activeView ? activeView.id.replace('View', '') : 'home';
    }
    
    static setupViewChangeListener() {
        // Observer para cambios de clase en content views
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (mutation.target.classList.contains('content-view')) {
                        ButtonVisibilityFix.updateButtonVisibility();
                    }
                }
            });
        });
        
        // Observar cambios en todas las vistas
        document.querySelectorAll('.content-view').forEach(view => {
            observer.observe(view, { attributes: true });
        });
        
        // También escuchar eventos del state manager
        window.addEventListener('ytcrossmix:state:changed', (event) => {
            if (event.detail.path === 'ui.currentView') {
                ButtonVisibilityFix.updateButtonVisibility();
            }
        });
    }
}

// ===== 6. COORDINADOR PRINCIPAL DE CORRECCIONES =====
class SystemFixCoordinator {
    static async applyAllFixes() {
        console.log('🔧 Aplicando todas las correcciones del sistema...');
        
        try {
            // 1. Corregir Message Manager (crítico)
            UnifiedMessageManagerFix.create();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 2. Corregir Auth Manager
            await AuthManagerFix.ensure();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 3. Configurar cola
            QueueManagerFix.setup();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 4. Configurar UI móvil
            MobileUIFix.setup();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 5. Configurar visibilidad de botones
            ButtonVisibilityFix.setup();
            
            // 6. Configurar event listeners globales
            SystemFixCoordinator.setupGlobalEventListeners();
            
            console.log('✅ Todas las correcciones aplicadas exitosamente');
            
            // Mostrar mensaje de éxito
            setTimeout(() => {
                window.unifiedMessageManager?.show(
                    '🔧 Sistema corregido y optimizado', 
                    'success', 
                    3000
                );
            }, 1000);
            
        } catch (error) {
            console.error('💥 Error aplicando correcciones:', error);
            
            setTimeout(() => {
                window.unifiedMessageManager?.show(
                    'Error aplicando algunas correcciones', 
                    'warning', 
                    4000
                );
            }, 1000);
        }
    }
    
    static setupGlobalEventListeners() {
        // Listener para clics en botones de autenticación
        document.addEventListener('click', (e) => {
            const authButton = e.target.closest('#googleSignInButton');
            if (authButton) {
                e.preventDefault();
                console.log('🔐 Click en botón de autenticación');
                
                if (window.authManager?.handleAuthClick) {
                    window.authManager.handleAuthClick();
                } else {
                    window.unifiedMessageManager?.show(
                        'Sistema de autenticación no disponible',
                        'error'
                    );
                }
            }
        });
        
        // Error boundary para funciones faltantes
        window.addEventListener('error', (event) => {
            if (event.error && event.error.message.includes('unifiedMessageManager')) {
                console.warn('🔧 Recreando MessageManager...');
                UnifiedMessageManagerFix.create();
            }
        });
        
        // Override console.error para capturar errores específicos
        const originalError = console.error;
        console.error = function(...args) {
            const message = args.join(' ');
            
            if (message.includes('unifiedMessageManager?.show is not a function')) {
                console.warn('🔧 Corrigiendo MessageManager automáticamente...');
                UnifiedMessageManagerFix.create();
                return;
            }
            
            originalError.apply(console, args);
        };
        
        console.log('✅ Event listeners globales configurados');
    }
    
    static setupAutoFixes() {
        // Auto-corrección cada 30 segundos para problemas persistentes
        setInterval(() => {
            // Verificar MessageManager
            if (!window.unifiedMessageManager || 
                typeof window.unifiedMessageManager.show !== 'function') {
                console.log('🔧 Auto-corrección: MessageManager');
                UnifiedMessageManagerFix.create();
            }
            
            // Verificar UI móvil
            if (window.innerWidth <= 768) {
                const bottomNav = document.querySelector('.bottom-nav');
                if (bottomNav && bottomNav.style.display === 'none') {
                    console.log('🔧 Auto-corrección: UI móvil');
                    MobileUIFix.applyResponsiveStyles();
                }
            }
        }, 30000);
    }
}

// ===== 7. FUNCIONES GLOBALES DE DEBUG =====
window.fixSystem = () => SystemFixCoordinator.applyAllFixes();
window.fixMessages = () => UnifiedMessageManagerFix.create();
window.fixAuth = () => AuthManagerFix.ensure();
window.fixQueue = () => QueueManagerFix.setup();
window.fixMobile = () => MobileUIFix.setup();
window.fixButtons = () => ButtonVisibilityFix.updateButtonVisibility();

window.testAllFixes = () => {
    console.log('🧪 Testing all fixes...');
    
    // Test message
    window.unifiedMessageManager?.show('🧪 Test message system', 'success');
    
    // Test queue
    setTimeout(() => {
        QueueManagerFix.showQueue();
        setTimeout(() => QueueManagerFix.hideQueue(), 2000);
    }, 1000);
    
    // Test mobile
    MobileUIFix.applyResponsiveStyles();
    
    console.log('✅ All fixes tested');
};

window.getSystemStatus = () => {
    return {
        messageManager: !!(window.unifiedMessageManager && 
                          typeof window.unifiedMessageManager.show === 'function'),
        authManager: !!(window.authManager && 
                       typeof window.authManager.handleAuthClick === 'function'),
        queueButton: !!document.getElementById('queueButton'),
        mobileElements: {
            header: !!document.querySelector('.mobile-header'),
            miniPlayer: !!document.querySelector('.mini-player'),
            bottomNav: !!document.querySelector('.bottom-nav')
        },
        isMobile: window.innerWidth <= 768,
        timestamp: Date.now()
    };
};

// ===== 8. AUTO-INICIALIZACIÓN =====
function initializeSystemFixes() {
    console.log('🚀 Inicializando sistema de correcciones...');
    
    // Aplicar correcciones inmediatas
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => SystemFixCoordinator.applyAllFixes(), 500);
        });
    } else {
        setTimeout(() => SystemFixCoordinator.applyAllFixes(), 500);
    }
    
    // Esperar al sistema unificado si está disponible
    if (window.ytCrossMixUnified?.initialized) {
        console.log('✅ Sistema unificado disponible, aplicando correcciones...');
        SystemFixCoordinator.applyAllFixes();
    } else {
        window.addEventListener('ytcrossmix:unified:ready', () => {
            console.log('🎉 Sistema unificado listo, aplicando correcciones...');
            setTimeout(() => SystemFixCoordinator.applyAllFixes(), 1000);
        });
    }
    
    // Setup auto-correcciones
    SystemFixCoordinator.setupAutoFixes();
    
    console.log('✅ Sistema de correcciones inicializado');
}

// ===== 9. CSS ADICIONAL PARA CORRECCIONES =====
function injectFixStyles() {
    const style = document.createElement('style');
    style.id = 'system-fixes-styles';
    style.textContent = `
        /* Correcciones críticas de estilos */
        
        /* Message Manager Fix */
        .unified-message-fix {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            z-index: 10001 !important;
            pointer-events: auto !important;
        }
        
        /* Mobile UI Fixes */
        @media (max-width: 768px) {
            .mobile-header {
                display: flex !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                height: 56px !important;
                background: var(--background-secondary, #181818) !important;
                border-bottom: 1px solid var(--border-color, #3e3e3e) !important;
                z-index: 400 !important;
                align-items: center;
                justify-content: space-between;
                padding: 0 16px;
            }

            .mobile-logo {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .logo-icon {
                width: 28px;
                height: 28px;
                background: var(--primary-color, #ff6b35);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 14px;
            }

            .logo-text {
                font-size: 18px;
                font-weight: 600;
                color: var(--text-primary, #ffffff);
            }

            .mobile-search {
                flex: 1;
                max-width: 300px;
                margin: 0 16px;
            }

            .mobile-search-input {
                width: 100%;
                background: var(--background-elevated, #272727);
                border: 1px solid var(--border-color, #3e3e3e);
                border-radius: 20px;
                padding: 8px 16px;
                color: var(--text-primary, #ffffff);
                font-size: 14px;
            }

            .mobile-search-input::placeholder {
                color: var(--text-secondary, #aaaaaa);
            }

            .bottom-nav {
                display: flex !important;
                position: fixed !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                height: 60px !important;
                background: var(--background-secondary, #181818) !important;
                border-top: 1px solid var(--border-color, #3e3e3e) !important;
                z-index: 100 !important;
            }

            .nav-tab {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: none;
                border: none;
                color: var(--text-secondary, #aaaaaa);
                font-size: 10px;
                cursor: pointer;
                transition: color 0.2s ease;
                text-decoration: none;
                padding: 8px;
            }

            .nav-tab i {
                font-size: 18px;
                margin-bottom: 4px;
            }

            .nav-tab.active {
                color: var(--primary-color, #ff6b35);
            }

            .mini-player {
                display: flex !important;
                position: fixed !important;
                bottom: 60px !important;
                left: 0 !important;
                right: 0 !important;
                height: 64px !important;
                background: var(--background-secondary, #181818) !important;
                border-top: 1px solid var(--border-color, #3e3e3e) !important;
                z-index: 300 !important;
                align-items: center;
                padding: 0 16px;
            }

            .mini-player-track {
                display: flex;
                align-items: center;
                gap: 12px;
                flex: 1;
                min-width: 0;
            }

            .mini-track-image {
                width: 40px;
                height: 40px;
                object-fit: cover;
                border-radius: 6px;
            }

            .mini-track-info {
                min-width: 0;
                flex: 1;
            }

            .mini-track-title {
                font-size: 14px;
                font-weight: 500;
                color: var(--text-primary, #ffffff);
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .mini-track-artist {
                font-size: 12px;
                color: var(--text-secondary, #aaaaaa);
            }

            .mini-player-controls {
                display: flex;
                gap: 8px;
            }

            .mini-control-btn {
                background: none;
                border: none;
                color: var(--text-secondary, #aaaaaa);
                font-size: 18px;
                cursor: pointer;
                padding: 8px;
                border-radius: 50%;
                transition: all 0.2s ease;
            }

            .mini-control-btn:hover {
                background: var(--background-hover, #3e3e3e);
                color: var(--text-primary, #ffffff);
            }

            .main-content {
                margin-top: 56px !important;
                padding-bottom: 124px !important;
            }

            .desktop-sidebar {
                display: none !important;
            }

            .bottom-player {
                display: none !important;
            }
        }

        @media (min-width: 769px) {
            .mobile-header,
            .bottom-nav,
            .mini-player {
                display: none !important;
            }

            .desktop-sidebar {
                display: flex !important;
            }

            .bottom-player {
                display: flex !important;
            }

            .main-content {
                margin-top: 0 !important;
                padding-bottom: 80px !important;
            }
        }

        /* Queue Popup Fix */
        .queue-section {
            transition: all 0.3s ease !important;
        }

        .queue-section:not(.hidden) {
            opacity: 1 !important;
            visibility: visible !important;
        }

        .queue-section.hidden {
            opacity: 0 !important;
            visibility: hidden !important;
        }

        /* Button Visibility Fix */
        .hide-outside-library {
            display: none !important;
        }

        /* Force show elements that might be hidden incorrectly */
        .force-show {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
        }

        /* Loading states */
        .system-loading {
            opacity: 0.7;
            pointer-events: none;
        }

        .system-ready {
            opacity: 1;
            pointer-events: auto;
            transition: opacity 0.3s ease;
        }

        /* Error states */
        .system-error {
            border: 2px solid #f44336 !important;
            background: rgba(244, 67, 54, 0.1) !important;
        }

        .system-warning {
            border: 2px solid #ff9800 !important;
            background: rgba(255, 152, 0, 0.1) !important;
        }

        /* Debug indicators */
        .debug-indicator {
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 4px 8px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            font-size: 11px;
            border-radius: 4px;
            z-index: 9999;
        }

        .debug-indicator.success { background: rgba(76, 175, 80, 0.8); }
        .debug-indicator.error { background: rgba(244, 67, 54, 0.8); }
        .debug-indicator.warning { background: rgba(255, 193, 7, 0.8); color: black; }

        /* Accessibility improvements */
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        /* High contrast mode */
        @media (prefers-contrast: high) {
            .unified-message-fix {
                border: 2px solid currentColor !important;
            }
            
            .mini-control-btn:focus,
            .nav-tab:focus {
                outline: 3px solid currentColor !important;
                outline-offset: 2px !important;
            }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
            .unified-message-fix,
            .queue-section,
            .mini-control-btn,
            .nav-tab {
                transition: none !important;
                animation: none !important;
            }
        }
    `;
    
    // Insertar estilos si no existen
    if (!document.getElementById('system-fixes-styles')) {
        document.head.appendChild(style);
        console.log('✅ Estilos de corrección inyectados');
    }
}

// ===== 10. VERIFICACIÓN DE INTEGRIDAD =====
function verifySystemIntegrity() {
    const issues = [];
    
    // Verificar elementos críticos
    const criticalElements = [
        'queueButton',
        'queueSection', 
        'playlistContainer',
        'googleSignInButton'
    ];
    
    criticalElements.forEach(id => {
        if (!document.getElementById(id)) {
            issues.push(`Elemento faltante: ${id}`);
        }
    });
    
    // Verificar funciones críticas
    if (!window.unifiedMessageManager || 
        typeof window.unifiedMessageManager.show !== 'function') {
        issues.push('MessageManager no funcional');
    }
    
    // Verificar elementos móviles en mobile
    if (window.innerWidth <= 768) {
        const mobileElements = ['.mobile-header', '.bottom-nav', '.mini-player'];
        mobileElements.forEach(selector => {
            const element = document.querySelector(selector);
            if (!element || element.style.display === 'none') {
                issues.push(`Elemento móvil oculto: ${selector}`);
            }
        });
    }
    
    if (issues.length > 0) {
        console.warn('⚠️ Problemas de integridad detectados:', issues);
        return false;
    }
    
    console.log('✅ Verificación de integridad: TODO OK');
    return true;
}

// ===== 11. EJECUTAR INICIALIZACIÓN =====
console.log('🔧 Sistema de correcciones YT CrossMix cargado');
console.log('🆘 Funciones disponibles:');
console.log('   - fixSystem() - Aplicar todas las correcciones');
console.log('   - fixMessages() - Corregir sistema de mensajes');
console.log('   - fixAuth() - Corregir autenticación');
console.log('   - fixQueue() - Corregir cola de reproducción');
console.log('   - fixMobile() - Corregir UI móvil');
console.log('   - testAllFixes() - Probar todas las correcciones');
console.log('   - getSystemStatus() - Estado del sistema');

// Inyectar estilos
injectFixStyles();

// Inicializar correcciones
initializeSystemFixes();

// Verificación periódica
setInterval(() => {
    if (!verifySystemIntegrity()) {
        console.log('🔧 Problemas detectados, re-aplicando correcciones...');
        SystemFixCoordinator.applyAllFixes();
    }
}, 60000); // Cada minuto

// ===== EXPORT PARA MÓDULOS =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        UnifiedMessageManagerFix,
        AuthManagerFix,
        QueueManagerFix,
        MobileUIFix,
        ButtonVisibilityFix,
        SystemFixCoordinator
    };
}

console.log('🎉 Sistema de correcciones completamente cargado y listo');
