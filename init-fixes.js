// ===== CORRECCIONES CRÍTICAS PARA INIT.JS =====
// Estas correcciones deben aplicarse al init.js existente

// ===== 1. CORRECCIÓN DE CARGA DE MÓDULOS =====
// En la función setupModule, agregar estas correcciones:


// ===== 2. FUNCIONES DE SETUP FALTANTES =====

setupSearchEventListeners() {
    console.log('🔍 Configurando event listeners de búsqueda...');
    
    const searchInputs = [
        'sidebarSearchInput',
        'mobileSearchInput', 
        'searchInput2',
        'searchInput' // Input oculto de compatibilidad
    ];
    
    searchInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            // ✅ CRÍTICO: Limpiar listeners existentes
            input.replaceWith(input.cloneNode(true));
            const newInput = document.getElementById(inputId);
            
            newInput.addEventListener('input', this.debounce((e) => {
                const query = e.target.value.trim();
                if (query.length > 2) {
                    console.log(`🔍 Búsqueda iniciada: "${query}"`);
                    
                    // ✅ Cambiar a vista de búsqueda
                    if (window.UIManager?.switchView) {
                        window.UIManager.switchView('search');
                    }
                    
                    // ✅ CRÍTICO: Ejecutar búsqueda
                    if (window.SearchManager?.performSearch) {
                        window.SearchManager.performSearch(query);
                    } else {
                        console.error('❌ SearchManager.performSearch no disponible');
                    }
                    
                    // ✅ Dispatch evento
                    document.dispatchEvent(new CustomEvent('search-started', {
                        detail: { query }
                    }));
                }
            }, 300));
            
            console.log(`✅ Event listener configurado para: ${inputId}`);
        } else {
            console.warn(`⚠️ Input no encontrado: ${inputId}`);
        }
    });
    
    // ✅ CRÍTICO: Event listener para Enter key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const activeInput = document.activeElement;
            if (activeInput && activeInput.id && searchInputs.includes(activeInput.id)) {
                const query = activeInput.value.trim();
                if (query.length > 2) {
                    // Trigger búsqueda inmediata
                    if (window.SearchManager?.performSearch) {
                        window.SearchManager.performSearch(query);
                    }
                }
            }
        }
    });
}

setupPlaylistUrlButton() {
    console.log('🔗 Configurando botón de playlist URL...');
    
    const urlButton = document.getElementById('añadirUrlButton');
    const urlInput = document.getElementById('searchInput2');
    
    if (urlButton && urlInput) {
        // ✅ CRÍTICO: Limpiar listener existente
        urlButton.replaceWith(urlButton.cloneNode(true));
        const newButton = document.getElementById('añadirUrlButton');
        
        newButton.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const url = urlInput.value.trim();
            if (!url) {
                window.unifiedMessageManager?.show('Ingresa una URL de playlist de YouTube', 'warning');
                return;
            }
            
            // ✅ CRÍTICO: Validar URL de YouTube
            if (!this.isValidYouTubePlaylistUrl(url)) {
                window.unifiedMessageManager?.show('URL de playlist de YouTube no válida', 'error');
                return;
            }
            
            // ✅ CRÍTICO: Extraer ID de playlist
            const playlistId = this.extractPlaylistId(url);
            if (!playlistId) {
                window.unifiedMessageManager?.show('No se pudo extraer el ID de la playlist', 'error');
                return;
            }
            
            console.log(`🔗 Procesando playlist: ${playlistId}`);
            
            // ✅ Mostrar loading
            window.unifiedLoadingManager?.show('playlist-load', {
                type: 'overlay',
                message: 'Cargando playlist de YouTube...'
            });
            
            try {
                // ✅ CRÍTICO: Cargar playlist usando Piped API
                await this.loadPlaylistFromUrl(playlistId);
                
                // ✅ Limpiar input
                urlInput.value = '';
                
            } catch (error) {
                console.error('Error cargando playlist:', error);
                window.unifiedMessageManager?.show('Error cargando la playlist. Intenta de nuevo.', 'error');
            } finally {
                window.unifiedLoadingManager?.hide('playlist-load');
            }
        });
        
        // ✅ Event listener para Enter en input
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                newButton.click();
            }
        });
        
        console.log('✅ Botón de playlist URL configurado');
    } else {
        console.error('❌ CRÍTICO: Botón o input de playlist URL no encontrados');
    }
}

async loadGoogleAPIs() {
    console.log('📡 Cargando APIs de Google...');
    
    return new Promise((resolve, reject) => {
        // ✅ CRÍTICO: Cargar GAPI primero
        if (!window.gapi) {
            const gapiScript = document.createElement('script');
            gapiScript.src = 'https://apis.google.com/js/api.js';
            gapiScript.async = true;
            gapiScript.defer = true;
            
            gapiScript.onload = () => {
                console.log('✅ GAPI cargado');
                
                // ✅ Luego cargar GIS
                if (!window.google?.accounts) {
                    const gisScript = document.createElement('script');
                    gisScript.src = 'https://accounts.google.com/gsi/client';
                    gisScript.async = true;
                    gisScript.defer = true;
                    
                    gisScript.onload = () => {
                        console.log('✅ GIS cargado');
                        resolve();
                    };
                    
                    gisScript.onerror = () => {
                        console.error('❌ Error cargando GIS');
                        reject(new Error('Error cargando Google Identity Services'));
                    };
                    
                    document.head.appendChild(gisScript);
                } else {
                    resolve();
                }
            };
            
            gapiScript.onerror = () => {
                console.error('❌ Error cargando GAPI');
                reject(new Error('Error cargando Google API'));
            };
            
            document.head.appendChild(gapiScript);
        } else {
            console.log('✅ APIs de Google ya disponibles');
            resolve();
        }
    });
}

setupAuthButtons(authManager) {
    console.log('🔐 Configurando botones de autenticación...');
    
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');
    
    if (signInButton) {
        // ✅ CRÍTICO: Limpiar listener existente
        signInButton.replaceWith(signInButton.cloneNode(true));
        const newSignInButton = document.getElementById('googleSignInButton');
        
        newSignInButton.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('🔐 Iniciando autenticación...');
            
            try {
                // ✅ CRÍTICO: Usar método correcto del authManager
                if (authManager.handleAuthClick) {
                    await authManager.handleAuthClick();
                } else if (authManager.signIn) {
                    await authManager.signIn();
                } else {
                    console.error('❌ Método de autenticación no disponible');
                    window.unifiedMessageManager?.show('Error en sistema de autenticación', 'error');
                }
            } catch (error) {
                console.error('Error en autenticación:', error);
                window.unifiedMessageManager?.show('Error al iniciar sesión. Intenta de nuevo.', 'error');
            }
        });
        
        console.log('✅ Botón de sign-in configurado');
    }
    
    if (signOutButton) {
        // ✅ CRÍTICO: Limpiar listener existente
        signOutButton.replaceWith(signOutButton.cloneNode(true));
        const newSignOutButton = document.getElementById('googleSignOutButton');
        
        newSignOutButton.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('🔐 Cerrando sesión...');
            
            try {
                if (authManager.handleSignOutClick) {
                    authManager.handleSignOutClick();
                } else if (authManager.signOut) {
                    authManager.signOut();
                } else {
                    console.error('❌ Método de sign-out no disponible');
                }
            } catch (error) {
                console.error('Error cerrando sesión:', error);
                window.unifiedMessageManager?.show('Error al cerrar sesión', 'error');
            }
        });
        
        console.log('✅ Botón de sign-out configurado');
    }
    
    // ✅ CRÍTICO: Setup inicial de UI
    if (authManager.updateUI) {
        authManager.updateUI(false); // Estado inicial: no autenticado
    }
}

createSearchResultsContainer() {
    console.log('🔧 Creando contenedor de resultados de búsqueda...');
    
    const searchView = document.getElementById('searchView');
    if (searchView) {
        const searchResults = document.createElement('div');
        searchResults.id = 'searchResults';
        searchResults.className = 'search-results';
        searchResults.innerHTML = `
            <div class="search-placeholder">
                <i class="fas fa-search"></i>
                <p>Busca música, artistas o playlists</p>
                <p><small>Sistema Unificado Activo</small></p>
            </div>
        `;
        
        searchView.appendChild(searchResults);
        console.log('✅ Contenedor de búsqueda creado');
    } else {
        console.error('❌ CRÍTICO: #searchView no encontrado');
    }
}

// ===== 3. FUNCIONES UTILITARIAS FALTANTES =====

isValidYouTubePlaylistUrl(url) {
    try {
        const urlObj = new URL(url);
        return (
            (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com' || urlObj.hostname === 'youtu.be') &&
            (urlObj.pathname.includes('/playlist') || urlObj.searchParams.has('list'))
        );
    } catch (error) {
        return false;
    }
}

extractPlaylistId(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('list');
    } catch (error) {
        console.error('Error extrayendo playlist ID:', error);
        return null;
    }
}

async loadPlaylistFromUrl(playlistId) {
    console.log(`📚 Cargando playlist: ${playlistId}`);
    
    try {
        // ✅ CRÍTICO: Usar Piped API para obtener playlist
        const pipedInstances = [
            "https://api.piped.private.coffee",
            "https://pipedapi.ducks.party"
        ];
        
        let playlistData = null;
        let lastError = null;
        
        // ✅ Intentar con diferentes instancias de Piped
        for (const instance of pipedInstances) {
            try {
                console.log(`📡 Intentando con instancia: ${instance}`);
                
                const response = await fetch(`${instance}/playlists/${playlistId}`);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                playlistData = await response.json();
                console.log(`✅ Playlist obtenida de: ${instance}`);
                break;
                
            } catch (error) {
                console.warn(`⚠️ Fallo instancia ${instance}:`, error.message);
                lastError = error;
                continue;
            }
        }
        
        if (!playlistData) {
            throw new Error(`No se pudo cargar la playlist desde ninguna instancia: ${lastError?.message}`);
        }
        
        // ✅ CRÍTICO: Procesar con PlaylistManager
        if (window.PlaylistManager?.handlePlaylistLoaded) {
            await window.PlaylistManager.handlePlaylistLoaded({
                id: playlistId,
                name: playlistData.name || 'Playlist Sin Nombre',
                thumbnailUrl: playlistData.thumbnailUrl || '',
                relatedStreams: playlistData.relatedStreams || []
            });
            
            console.log(`✅ Playlist procesada: ${playlistData.name}`);
            window.unifiedMessageManager?.show(`Playlist "${playlistData.name}" cargada exitosamente`, 'success');
        } else {
            throw new Error('PlaylistManager.handlePlaylistLoaded no disponible');
        }
        
    } catch (error) {
        console.error('❌ Error cargando playlist:', error);
        throw error;
    }
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

// ===== 4. CORRECCIÓN DE SECUENCIA DE INICIALIZACIÓN =====

async finalizeInitialization() {
    console.log('🏁 Finalizando inicialización corregida...');
    
    // ✅ CRÍTICO: Verificar que todos los componentes críticos están listos
    const criticalChecks = {
        unifiedStateManager: !!window.unifiedStateManager,
        unifiedMessageManager: !!window.unifiedMessageManager,
        unifiedLoadingManager: !!window.unifiedLoadingManager,
        searchResults: !!document.getElementById('searchResults'),
        playlistsGrid: !!document.getElementById('playlistsGrid'),
        playlistContainer: !!document.getElementById('playlistContainer')
    };
    
    console.log('🔍 Verificaciones críticas:', criticalChecks);
    
    const failedChecks = Object.entries(criticalChecks)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
    
    if (failedChecks.length > 0) {
        console.error('❌ CRÍTICO: Verificaciones fallidas:', failedChecks);
        
        // ✅ Intentar crear elementos faltantes
        if (!criticalChecks.searchResults) {
            this.createSearchResultsContainer();
        }
        
        // ✅ Mostrar advertencia
        window.unifiedMessageManager?.show(
            `Advertencia: ${failedChecks.length} componente(s) no inicializados correctamente`, 
            'warning', 
            5000
        );
    }
    
    // ✅ Setup de navegación global
    this.setupGlobalNavigation();
    
    // ✅ Setup de eventos globales corregidos
    this.setupCorrectedGlobalEvents();
    
    // ✅ Cleanup de elementos temporales
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.classList.add('hidden');
    }
    
    // ✅ Habilitar elementos que requieren sistema unificado
    const elementsRequiringUnified = document.querySelectorAll('[data-requires-unified]');
    elementsRequiringUnified.forEach(el => {
        el.classList.add('unified-ready');
    });
    
    // ✅ Remover clase de loading del body
    document.body.classList.remove('unified-loading');
    
    // ✅ Health check final
    setTimeout(() => {
        this.performFinalHealthCheck();
    }, 2000);
    
    console.log('✅ Finalización corregida completada');
}

setupGlobalNavigation() {
    console.log('🧭 Configurando navegación global...');
    
    // ✅ Navegación del sidebar
    const sidebarNavItems = document.querySelectorAll('.sidebar-nav [data-view], .nav-item[data-view]');
    sidebarNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            if (view && window.UIManager?.switchView) {
                console.log(`🧭 Navegando a vista: ${view}`);
                window.UIManager.switchView(view);
            }
        });
    });
    
    // ✅ Navegación bottom nav (mobile)
    const bottomNavItems = document.querySelectorAll('.bottom-nav [data-view], .nav-tab[data-view]');
    bottomNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            if (view && window.UIManager?.switchView) {
                console.log(`📱 Navegando a vista: ${view}`);
                window.UIManager.switchView(view);
            }
        });
    });
    
    console.log('✅ Navegación global configurada');
}

setupCorrectedGlobalEvents() {
    console.log('🌐 Configurando eventos globales corregidos...');
    
    // ✅ CRÍTICO: Event listener para playback controls
    const playButton = document.getElementById('botonPlay');
    const nextButton = document.getElementById('botonNext');
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    const miniNextBtn = document.getElementById('miniNextBtn');
    
    if (playButton) {
        playButton.addEventListener('click', () => {
            console.log('▶️ Play button clicked');
            if (window.PlaybackController) {
                const state = window.unifiedStateManager?.state;
                if (state?.app.reproduccionIniciada) {
                    // Pausar/reanudar
                    const currentPlayer = state.app.currentPlayer === 1 ? state.app.player1 : state.app.player2;
                    if (currentPlayer) {
                        const playerState = currentPlayer.getPlayerState();
                        if (playerState === YT.PlayerState.PLAYING) {
                            currentPlayer.pauseVideo();
                        } else {
                            currentPlayer.playVideo();
                        }
                    }
                } else {
                    // Iniciar reproducción
                    window.PlaybackController.playFirstVideo();
                }
            }
        });
    }
    
    if (nextButton) {
        nextButton.addEventListener('click', () => {
            console.log('⏭️ Next button clicked');
            if (window.PlaybackController?.playNextVideo) {
                window.PlaybackController.playNextVideo();
            }
        });
    }
    
    // ✅ Event listeners para mini player
    if (miniPlayBtn) {
        miniPlayBtn.addEventListener('click', () => playButton?.click());
    }
    
    if (miniNextBtn) {
        miniNextBtn.addEventListener('click', () => nextButton?.click());
    }
    
    // ✅ Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Espacebar para play/pause (solo si no está en un input)
        if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            e.preventDefault();
            playButton?.click();
        }
        
        // Arrow right para next
        if (e.code === 'ArrowRight' && e.ctrlKey) {
            e.preventDefault();
            nextButton?.click();
        }
    });
    
    console.log('✅ Eventos globales corregidos configurados');
}

performFinalHealthCheck() {
    console.log('🔍 Realizando health check final...');
    
    const health = {
        timestamp: Date.now(),
        core: !!window.ytCrossMixUnified?.initialized,
        modules: this.moduleLoader?.loaded?.size || 0,
        state: !!window.unifiedStateManager?.state,
        youtube: !!window.unifiedYouTubeManager?.apiReady,
        players: !!window.unifiedYouTubeManager?.playersReady,
        ui: !!window.UIManager,
        search: !!window.SearchManager,
        playlist: !!window.PlaylistManager,
        auth: !!window.authManager,
        online: navigator.onLine,
        critical_elements: {
            searchResults: !!document.getElementById('searchResults'),
            playlistsGrid: !!document.getElementById('playlistsGrid'),
            playButton: !!document.getElementById('botonPlay'),
            signInButton: !!document.getElementById('googleSignInButton')
        }
    };
    
    console.log('🔍 Health Check Final:', health);
    
    // ✅ Reportar problemas críticos
    const criticalIssues = [];
    if (!health.core) criticalIssues.push('Core no inicializado');
    if (!health.state) criticalIssues.push('State Manager no disponible');
    if (!health.ui) criticalIssues.push('UI Manager no disponible');
    if (!health.search) criticalIssues.push('Search Manager no disponible');
    if (!health.critical_elements.searchResults) criticalIssues.push('Search Results container faltante');
    
    if (criticalIssues.length > 0) {
        console.error('⚠️ PROBLEMAS CRÍTICOS DETECTADOS:', criticalIssues);
        window.unifiedMessageManager?.show(
            `${criticalIssues.length} problema(s) crítico(s) detectado(s). Ver consola.`, 
            'warning', 
            8000
        );
    } else {
        console.log('✅ Health check final: TODO OK');
        window.unifiedMessageManager?.show('🎵 YT CrossMix listo para usar', 'success', 3000);
    }
    
    return health;
}
