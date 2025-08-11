// Módulo de Autenticación de Google y API de YouTube (Versión Modular Corregida)
import { PlaylistManager } from './playlistManager.js';
import { Utils } from './utils.js';
import { mostrarMensajeFlotante } from './ui.js';

class GoogleAuthManager {
    constructor() {
        this.CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
        this.SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
        this.tokenClient = null;
        this.gapiReady = false;
        this.gisReady = false;
        this.isAuthenticated = false;
        this.authStatusCallback = null;
        this.isInitializing = false;
    }

    // Inicializar el módulo de autenticación
    async initialize() {
        if (this.isInitializing) {
            console.log('GoogleAuthManager ya se está inicializando...');
            return this;
        }
        
        console.log('Inicializando GoogleAuthManager...');
        this.isInitializing = true;
        
        try {
            // Configurar listeners para botones
            this.setupButtonListeners();
            
            // Cargar scripts de Google
            await this.loadGoogleScripts();
            
            // Verificar estado de autenticación guardado
            this.checkSavedAuthStatus();
            
            this.isInitializing = false;
            console.log('GoogleAuthManager inicializado correctamente');
            return this;
        } catch (error) {
            console.error('Error inicializando GoogleAuthManager:', error);
            this.isInitializing = false;
            throw error;
        }
    }

    // Cargar scripts de Google API
    async loadGoogleScripts() {
        return new Promise((resolve, reject) => {
            let scriptsLoaded = 0;
            const totalScripts = 2;
            
            const checkAllLoaded = () => {
                scriptsLoaded++;
                if (scriptsLoaded === totalScripts) {
                    // Pequeña pausa para asegurar que todo esté cargado
                    setTimeout(() => resolve(), 100);
                }
            };
            
            // Cargar GAPI
            if (!window.gapi) {
                const gapiScript = document.createElement('script');
                gapiScript.src = 'https://apis.google.com/js/api.js';
                gapiScript.async = true;
                gapiScript.defer = true;
                gapiScript.onload = () => {
                    this.gapiInitialize().then(checkAllLoaded).catch(reject);
                };
                gapiScript.onerror = () => reject(new Error('Error cargando GAPI script'));
                document.head.appendChild(gapiScript);
            } else {
                this.gapiInitialize().then(checkAllLoaded).catch(reject);
            }
            
            // Cargar GIS
            if (!window.google?.accounts) {
                const gisScript = document.createElement('script');
                gisScript.src = 'https://accounts.google.com/gsi/client';
                gisScript.async = true;
                gisScript.defer = true;
                gisScript.onload = () => {
                    this.gisInitialize().then(checkAllLoaded).catch(reject);
                };
                gisScript.onerror = () => reject(new Error('Error cargando GIS script'));
                document.head.appendChild(gisScript);
            } else {
                this.gisInitialize().then(checkAllLoaded).catch(reject);
            }
        });
    }

    // Inicializar GAPI
    async gapiInitialize() {
        return new Promise((resolve, reject) => {
            if (!window.gapi) {
                reject(new Error('GAPI no está disponible'));
                return;
            }
            
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: '', // No necesitamos API key para OAuth
                        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
                    });
                    
                    console.log("GAPI client for YouTube loaded.");
                    this.gapiReady = true;
                    resolve();
                } catch (err) {
                    console.error("Error inicializando GAPI client:", err);
                    reject(err);
                }
            });
        });
    }

    // Inicializar GIS (Google Identity Services)
    async gisInitialize() {
        return new Promise((resolve, reject) => {
            if (!window.google?.accounts?.oauth2) {
                reject(new Error('Google Identity Services no está disponible'));
                return;
            }
            
            try {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.CLIENT_ID,
                    scope: this.SCOPES,
                    callback: (tokenResponse) => this.tokenResponseCallback(tokenResponse),
                });
                
                console.log("GIS client initialized.");
                this.gisReady = true;
                resolve();
            } catch (error) {
                console.error("Error inicializando GIS client:", error);
                reject(error);
            }
        });
    }

    // Manejar respuesta del token
    async tokenResponseCallback(tokenResponse) {
        if (tokenResponse && tokenResponse.access_token) {
            try {
                // Configurar el token en gapi
                gapi.client.setToken(tokenResponse);
                
                // Guardar token en localStorage con timestamp
                const tokenData = {
                    ...tokenResponse,
                    timestamp: Date.now()
                };
                localStorage.setItem('google_token', JSON.stringify(tokenData));
                
                console.log("Acceso concedido. Token guardado.");
                this.isAuthenticated = true;
                this.updateUI(true);
                
                // Obtener playlists automáticamente
                await this.getPlaylists();
                
                // Ejecutar callback si existe
                if (this.authStatusCallback) {
                    this.authStatusCallback(true);
                }
                
                mostrarMensajeFlotante("Autenticación exitosa. Cargando tus playlists...");
                
            } catch (error) {
                console.error("Error procesando token:", error);
                mostrarMensajeFlotante("Error al procesar la autenticación.");
            }
        } else {
            console.error("No se obtuvo el token de acceso o la autenticación fue denegada.");
            this.isAuthenticated = false;
            this.updateUI(false);
            
            if (this.authStatusCallback) {
                this.authStatusCallback(false);
            }
            
            mostrarMensajeFlotante("Autenticación denegada o fallida.");
        }
    }

    // Verificar estado de autenticación guardado
    checkSavedAuthStatus() {
        const savedToken = localStorage.getItem('google_token');
        if (savedToken) {
            try {
                const tokenData = JSON.parse(savedToken);
                
                // Verificar si el token no es muy antiguo (24 horas)
                const tokenAge = Date.now() - (tokenData.timestamp || 0);
                const maxAge = 24 * 60 * 60 * 1000; // 24 horas
                
                if (tokenAge < maxAge && tokenData.access_token) {
                    console.log('Token recuperado de localStorage');
                    
                    if (this.gapiReady) {
                        gapi.client.setToken(tokenData);
                        this.isAuthenticated = true;
                        this.updateUI(true);
                        
                        // Validar el token haciendo una llamada simple
                        this.validateAndRefreshToken(tokenData);
                    } else {
                        // Si GAPI no está listo, esperar un poco
                        setTimeout(() => this.checkSavedAuthStatus(), 500);
                        return;
                    }
                } else {
                    console.log('Token expirado, limpiando...');
                    localStorage.removeItem('google_token');
                    this.updateUI(false);
                }
            } catch (e) {
                console.error('Error al recuperar token guardado:', e);
                localStorage.removeItem('google_token');
                this.updateUI(false);
            }
        } else {
            this.updateUI(false);
        }
    }

    // Validar y refrescar token si es necesario
    async validateAndRefreshToken(tokenData) {
        try {
            // Intentar hacer una llamada simple para verificar si el token funciona
            const response = await gapi.client.youtube.playlists.list({
                'part': ['snippet'],
                'mine': true,
                'maxResults': 1
            });
            
            console.log('Token válido, obteniendo playlists...');
            await this.getPlaylists();
            
        } catch (error) {
            console.log('Token inválido o expirado:', error);
            localStorage.removeItem('google_token');
            this.isAuthenticated = false;
            this.updateUI(false);
            mostrarMensajeFlotante("Sesión expirada. Por favor, inicia sesión nuevamente.");
        }
    }

    // Obtener playlists del usuario
    async getPlaylists() {
        if (!this.isAuthenticated || !this.gapiReady) {
            console.error('No autenticado o GAPI no está listo');
            return;
        }

        this.showLoadingSpinner();
        
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
                mostrarMensajeFlotante("No se encontraron playlists en tu biblioteca de YouTube.");
                return;
            }
            
            // Disparar evento para que PlaylistManager procese las playlists
            document.dispatchEvent(new CustomEvent('playlistsFetched', { 
                detail: allPlaylists 
            }));
                        
        } catch (err) {
            console.error("Error al obtener playlists de YouTube:", err);
            mostrarMensajeFlotante("Error al cargar las playlists de YouTube.");
            
            // Si el error es de autenticación, limpiar token
            if (err.status === 401) {
                localStorage.removeItem('google_token');
                this.isAuthenticated = false;
                this.updateUI(false);
            }
        } finally {
            this.hideLoadingSpinner();
        }
    }

    // Obtener videos de una playlist específica
    async getPlaylistVideos(playlistId) {
        if (!this.isAuthenticated || !this.gapiReady) {
            console.error('No autenticado para obtener videos de playlist');
            return null;
        }
        
        try {
            let allVideos = [];
            let nextPageToken = null;
            
            do {
                const response = await gapi.client.youtube.playlistItems.list({
                    'part': ['snippet', 'contentDetails'],
                    'playlistId': playlistId,
                    'maxResults': 50,
                    'pageToken': nextPageToken
                });
                
                if (response.result && response.result.items) {
                    // Filtrar videos válidos (no eliminados/privados)
                    const validItems = response.result.items.filter(item => 
                        item.snippet.resourceId && 
                        item.snippet.resourceId.videoId &&
                        item.snippet.title !== 'Private video' &&
                        item.snippet.title !== 'Deleted video'
                    );
                    
                    // Formatear videos para compatibilidad con el sistema
                    const formattedVideos = validItems.map(item => ({
                        videoId: item.snippet.resourceId.videoId,
                        title: item.snippet.title,
                        thumbnail: item.snippet.thumbnails?.medium?.url || 
                                 item.snippet.thumbnails?.default?.url ||
                                 'https://via.placeholder.com/120x90?text=No+Thumb',
                        duration: 0, // Se obtendrá en el siguiente paso
                        channelTitle: item.snippet.channelTitle || 'Canal desconocido'
                    }));
                    
                    allVideos = allVideos.concat(formattedVideos);
                }
                
                nextPageToken = response.result?.nextPageToken;
            } while (nextPageToken);
            
            // Obtener duraciones de los videos (requiere llamada adicional)
            if (allVideos.length > 0) {
                await this.fetchVideoDurations(allVideos);
            }
            
            return allVideos;
            
        } catch (error) {
            console.error('Error al obtener videos de playlist:', error);
            return null;
        }
    }

    // Obtener duraciones de videos
    async fetchVideoDurations(videos) {
        if (!videos || videos.length === 0) return;
        
        try {
            // YouTube API permite hasta 50 IDs por llamada
            const chunks = [];
            for (let i = 0; i < videos.length; i += 50) {
                chunks.push(videos.slice(i, i + 50));
            }
            
            for (const chunk of chunks) {
                const videoIds = chunk.map(v => v.videoId).join(',');
                
                const response = await gapi.client.youtube.videos.list({
                    'part': ['contentDetails'],
                    'id': videoIds
                });
                
                if (response.result && response.result.items) {
                    response.result.items.forEach(item => {
                        const video = videos.find(v => v.videoId === item.id);
                        if (video && item.contentDetails) {
                            // Convertir duración ISO 8601 a segundos
                            video.duration = Utils.parseISO8601Duration(item.contentDetails.duration);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error al obtener duraciones de videos:', error);
        }
    }

    // Manejar click en iniciar sesión
    handleAuthClick() {
        if (!this.gisReady || !this.tokenClient) {
            mostrarMensajeFlotante("El sistema de autenticación no está listo. Intenta de nuevo en unos segundos.");
            console.error('Cliente de autenticación no inicializado');
            return;
        }

        try {
            this.tokenClient.requestAccessToken({ 
                prompt: 'consent' 
            });
        } catch (error) {
            console.error('Error al solicitar token:', error);
            mostrarMensajeFlotante("Error al iniciar el proceso de autenticación.");
        }
    }

    // Manejar click en cerrar sesión
    handleSignOutClick() {
        try {
            const token = gapi.client.getToken();
            
            if (token && token.access_token) {
                // Revocar token
                google.accounts.oauth2.revoke(token.access_token, () => {
                    console.log('Token revocado exitosamente.');
                });
                
                // Limpiar token del cliente
                gapi.client.setToken('');
            }
            
            // Eliminar token guardado
            localStorage.removeItem('google_token');
            
            console.log('Sesión cerrada.');
            this.isAuthenticated = false;
            this.updateUI(false);
            
            // Disparar evento de cierre de sesión
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
            
            mostrarMensajeFlotante("Sesión cerrada exitosamente.");
            
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            
            // Forzar limpieza local incluso si hay error
            localStorage.removeItem('google_token');
            this.isAuthenticated = false;
            this.updateUI(false);
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

// Crear y exportar instancia única
export const authManager = new GoogleAuthManager();

// Exportar clase para casos especiales
export { GoogleAuthManager };
