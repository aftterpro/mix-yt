// ===== 5. AUTH.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// auth.js - Solo modificaciones críticas

export class GoogleAuthManager {
    constructor() {
        // Configuración igual...
        this.CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
        this.SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
        this.tokenClient = null;
        this.gapiReady = false;
        this.gisReady = false;
        this.isAuthenticated = false;
        this.authStatusCallback = null;
        this.isInitializing = false;
    }

    async tokenResponseCallback(tokenResponse) {
        if (tokenResponse && tokenResponse.access_token) {
            try {
                gapi.client.setToken(tokenResponse);
                
                const tokenData = {
                    ...tokenResponse,
                    timestamp: Date.now()
                };
                localStorage.setItem('google_token', JSON.stringify(tokenData));
                
                console.log("Acceso concedido. Token guardado.");
                this.isAuthenticated = true;
                this.updateUI(true);
                
                // ✅ Actualizar estado unificado
                if (window.unifiedStateManager) {
                    window.unifiedStateManager.set('auth.isAuthenticated', true);
                    window.unifiedStateManager.set('auth.token', tokenData);
                }
                
                await this.getPlaylists();
                
                if (this.authStatusCallback) {
                    this.authStatusCallback(true);
                }
                
                // ✅ Usar sistema de mensajes unificado
                window.unifiedMessageManager?.show("Autenticación exitosa. Cargando tus playlists...", 'success');
                
            } catch (error) {
                console.error("Error procesando token:", error);
                window.unifiedMessageManager?.show("Error al procesar la autenticación.", 'error');
            }
        } else {
            console.error("No se obtuvo el token de acceso.");
            this.isAuthenticated = false;
            this.updateUI(false);
            
            // ✅ Actualizar estado unificado
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('auth.isAuthenticated', false);
            }
            
            if (this.authStatusCallback) {
                this.authStatusCallback(false);
            }
            
            window.unifiedMessageManager?.show("Autenticación denegada o fallida.", 'error');
        }
    }

    async getPlaylists() {
        if (!this.isAuthenticated || !this.gapiReady) {
            console.error('No autenticado o GAPI no está listo');
            return;
        }

        // ✅ Usar loading manager unificado
        window.unifiedLoadingManager?.show('youtube-playlists', {
            type: 'overlay',
            message: 'Cargando playlists de YouTube...'
        });
        
        try {
            let allPlaylists = [];
            let nextPageToken = null;
            
            do {
                const response = await gapi.client.youtube.playlists.list({
                    'part': ['snippet', 'contentDetails'],
                    'mine': true,
                    'maxResults': 50,
                    'pageToken': nextPageToken
                });
                
                if (response.result && response.result.items) {
                    allPlaylists = allPlaylists.concat(response.result.items);
                }
                
                nextPageToken = response.result?.nextPageToken;
            } while (nextPageToken);
            
            console.log(`Se obtuvieron ${allPlaylists.length} playlists de YouTube`);
            
            if (allPlaylists.length === 0) {
                window.unifiedMessageManager?.show("No se encontraron playlists en tu biblioteca de YouTube.", 'warning');
                return;
            }
            
            // Disparar evento para PlaylistManager
            document.dispatchEvent(new CustomEvent('playlistsFetched', { 
                detail: allPlaylists 
            }));
                        
        } catch (err) {
            console.error("Error al obtener playlists de YouTube:", err);
            window.unifiedMessageManager?.show("Error al cargar las playlists de YouTube.", 'error');
            
            if (err.status === 401) {
                localStorage.removeItem('google_token');
                this.isAuthenticated = false;
                this.updateUI(false);
                
                // ✅ Actualizar estado unificado
                if (window.unifiedStateManager) {
                    window.unifiedStateManager.set('auth.isAuthenticated', false);
                }
            }
        } finally {
            // ✅ Usar loading manager unificado
            window.unifiedLoadingManager?.hide('youtube-playlists');
        }
    }

    handleSignOutClick() {
        try {
            const token = gapi.client.getToken();
            
            if (token && token.access_token) {
                google.accounts.oauth2.revoke(token.access_token, () => {
                    console.log('Token revocado exitosamente.');
                });
                gapi.client.setToken('');
            }
            
            localStorage.removeItem('google_token');
            
            console.log('Sesión cerrada.');
            this.isAuthenticated = false;
            this.updateUI(false);
            
            // ✅ Actualizar estado unificado
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('auth.isAuthenticated', false);
                window.unifiedStateManager.set('auth.token', null);
            }
            
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
            
            // ✅ Usar sistema de mensajes unificado
            window.unifiedMessageManager?.show("Sesión cerrada exitosamente.", 'success');
            
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            
            // Forzar limpieza local
            localStorage.removeItem('google_token');
            this.isAuthenticated = false;
            this.updateUI(false);
            
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('auth.isAuthenticated', false);
            }
            
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
        }
    }

 // Actualizar interfaz según estado de autenticación
    updateUI(isLoggedIn) {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (isLoggedIn) {
            if (signInButton) {
                signInButton.classList.add('hidden');
                signInButton.disabled = false;
            }
            if (signOutButton) {
                signOutButton.classList.remove('hidden');
                signOutButton.disabled = false;
            }
        } else {
            if (signInButton) {
                signInButton.classList.remove('hidden');
                signInButton.disabled = false;
            }
            if (signOutButton) {
                signOutButton.classList.add('hidden');
                signOutButton.disabled = false;
            }
        }
    }
    // Configurar listeners de botones
    setupButtonListeners() {
        // Esperar a que el DOM esté listo
        const setupButtons = () => {
            const signInButton = document.getElementById('googleSignInButton');
            const signOutButton = document.getElementById('googleSignOutButton');
            
            if (signInButton) {
                // Remover listeners existentes
                signInButton.replaceWith(signInButton.cloneNode(true));
                const newSignInButton = document.getElementById('googleSignInButton');
                
                newSignInButton.addEventListener('click', () => {
                    console.log('Click en botón de iniciar sesión');
                    this.handleAuthClick();
                });
            }
            
            if (signOutButton) {
                // Remover listeners existentes
                signOutButton.replaceWith(signOutButton.cloneNode(true));
                const newSignOutButton = document.getElementById('googleSignOutButton');
                
                newSignOutButton.addEventListener('click', () => {
                    console.log('Click en botón de cerrar sesión');
                    this.handleSignOutClick();
                });
            }
            
            // Estado inicial
            this.updateUI(false);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupButtons);
        } else {
            setupButtons();
        }
    }
    // Mostrar spinner de carga
    showLoadingSpinner() {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.classList.remove('hidden');
        }
    }
    // Ocultar spinner de carga
    hideLoadingSpinner() {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.classList.add('hidden');
        }
    }
    // Establecer callback para cambios de estado de autenticación
    onAuthStatusChange(callback) {
        this.authStatusCallback = callback;
    }
    // Métodos de utilidad
    isUserAuthenticated() {
        return this.isAuthenticated && this.gapiReady;
    }
    async forceTokenRefresh() {
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken({ prompt: '' });
        }
    }
    // Método para debugging
    getDebugInfo() {
        return {
            isAuthenticated: this.isAuthenticated,
            gapiReady: this.gapiReady,
            gisReady: this.gisReady,
            hasToken: !!gapi?.client?.getToken(),
            tokenClient: !!this.tokenClient
        };
    }
}

// Crear instancia única
export const authManager = new GoogleAuthManager();
