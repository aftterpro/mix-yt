// Módulo de Autenticación de Google y API de YouTube (Versión Modular Mejorada)

import { mostrarMensajeFlotante } from './ui.js';
import { PlaylistManager } from './playlistManager.js';
import { Utils } from './utils.js';

class GoogleAuthManager {
    constructor() {
        this.CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
        this.SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
        this.tokenClient = null;
        this.gapiReady = false;
        this.gisReady = false;
        this.isAuthenticated = false;
        this.authStatusCallback = null;
    }

    // Inicializar el módulo de autenticación
    async initialize() {
        console.log('Inicializando GoogleAuthManager...');
        
        // Configurar listeners para botones
        this.setupButtonListeners();
        
        // Cargar scripts de Google
        await this.loadGoogleScripts();
        
        // Verificar estado de autenticación guardado
        this.checkSavedAuthStatus();
        
        return this;
    }

    // Cargar scripts de Google API
    async loadGoogleScripts() {
        return new Promise((resolve) => {
            // Hacer las funciones disponibles globalmente para los callbacks
            window.gapiInitialize = () => this.gapiInitialize();
            window.gisInitalize = () => this.gisInitialize();
            
            // Cargar GAPI
            if (!window.gapi) {
                const gapiScript = document.createElement('script');
                gapiScript.src = 'https://apis.google.com/js/api.js';
                gapiScript.async = true;
                gapiScript.defer = true;
                gapiScript.onload = () => this.gapiInitialize();
                document.head.appendChild(gapiScript);
            } else {
                this.gapiInitialize();
            }
            
            // Cargar GIS
            if (!window.google?.accounts) {
                const gisScript = document.createElement('script');
                gisScript.src = 'https://accounts.google.com/gsi/client';
                gisScript.async = true;
                gisScript.defer = true;
                gisScript.onload = () => this.gisInitialize();
                document.head.appendChild(gisScript);
            } else {
                this.gisInitialize();
            }
            
            // Resolver cuando ambos estén listos
            const checkReady = setInterval(() => {
                if (this.gapiReady && this.gisReady) {
                    clearInterval(checkReady);
                    resolve();
                }
            }, 100);
        });
    }

    // Inicializar GAPI
    gapiInitialize() {
        if (!window.gapi) return;
        
        gapi.load('client', () => {
            gapi.client.init({}).then(() => {
                return gapi.client.load('https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest');
            }).then(() => {
                console.log("GAPI client for YouTube loaded.");
                this.gapiReady = true;
                this.tryStartApp();
            }).catch(err => {
                console.error("Error inicializando GAPI client", err);
                mostrarMensajeFlotante('Error al inicializar cliente de YouTube');
            });
        });
    }

    // Inicializar GIS (Google Identity Services)
    gisInitialize() {
        if (!window.google?.accounts?.oauth2) {
            console.error('Google Identity Services no está disponible');
            return;
        }
        
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: (tokenResponse) => this.tokenResponseCallback(tokenResponse),
        });
        
        console.log("GIS client initialized.");
        this.gisReady = true;
        this.tryStartApp();
    }

    // Verificar si ambas APIs están listas
    tryStartApp() {
        if (this.gapiReady && this.gisReady) {
            console.log("Ambas APIs de Google están listas. Comprobando estado de autenticación.");
            this.checkAuthStatus();
        }
    }

    // Manejar respuesta del token
    async tokenResponseCallback(tokenResponse) {
        if (tokenResponse && tokenResponse.access_token) {
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
        } else {
            console.error("No se obtuvo el token de acceso o la autenticación fue denegada.");
            this.isAuthenticated = false;
            this.updateUI(false);
            
            if (this.authStatusCallback) {
                this.authStatusCallback(false);
            }
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
                    gapi.client.setToken(tokenData);
                    this.isAuthenticated = true;
                    this.updateUI(true);
                    
                    // Obtener playlists si el token es válido
                    this.validateAndRefreshToken(tokenData);
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
            await gapi.client.youtube.playlists.list({
                'part': ['snippet'],
                'mine': true,
                'maxResults': 1
            });
            
            console.log('Token válido, obteniendo playlists...');
            await this.getPlaylists();
            
        } catch (error) {
            console.log('Token inválido o expirado, solicitando nuevo...');
            localStorage.removeItem('google_token');
            this.isAuthenticated = false;
            this.updateUI(false);
            
            // Opcionalmente, solicitar nuevo token automáticamente
            // this.handleAuthClick();
        }
    }

    // Verificar estado de autenticación actual
    checkAuthStatus() {
        let token = gapi.client.getToken();
        
        if (!token) {
            // Intentar recuperar el token guardado
            const savedToken = localStorage.getItem('google_token');
            if (savedToken) {
                try {
                    const parsedToken = JSON.parse(savedToken);
                    if (parsedToken && parsedToken.access_token) {
                        gapi.client.setToken(parsedToken);
                        token = parsedToken;
                    }
                } catch (e) {
                    localStorage.removeItem('google_token');
                }
            }
        }
        
        if (token && token.access_token) {
            console.log("Autenticación verificada: token existente y válido.");
            this.isAuthenticated = true;
            this.updateUI(true);
            this.getPlaylists();
        } else {
            console.log("No hay token activo. Mostrando botón de inicio de sesión.");
            this.isAuthenticated = false;
            this.updateUI(false);
        }
    }

    // Obtener playlists del usuario
    async getPlaylists() {
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
                
                if (response.result.items) {
                    allPlaylists = allPlaylists.concat(response.result.items);
                }
                
                nextPageToken = response.result.nextPageToken;
            } while (nextPageToken);
            
            console.log(`Se obtuvieron ${allPlaylists.length} playlists de YouTube`);
            
            // Disparar evento para que PlaylistManager procese las playlists
            document.dispatchEvent(new CustomEvent('playlistsFetched', { 
                detail: allPlaylists 
            }));
            
            mostrarMensajeFlotante(`${allPlaylists.length} playlists cargadas de tu biblioteca`);
            
        } catch (err) {
            console.error("Error al obtener playlists de YouTube:", err);
            mostrarMensajeFlotante('Error al cargar playlists de YouTube');
            this.updateUI(false);
        } finally {
            this.hideLoadingSpinner();
        }
    }

    // Obtener videos de una playlist específica
    async getPlaylistVideos(playlistId) {
        if (!this.isAuthenticated) {
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
                
                if (response.result.items) {
                    // Formatear videos para compatibilidad con el sistema
                    const formattedVideos = response.result.items.map(item => ({
                        videoId: item.snippet.resourceId.videoId,
                        title: item.snippet.title,
                        thumbnail: item.snippet.thumbnails.medium?.url || 
                                 item.snippet.thumbnails.default.url,
                        duration: 0, // YouTube API no proporciona duración aquí
                        channelTitle: item.snippet.channelTitle
                    }));
                    
                    allVideos = allVideos.concat(formattedVideos);
                }
                
                nextPageToken = response.result.nextPageToken;
            } while (nextPageToken);
            
            // Obtener duraciones de los videos (requiere llamada adicional)
            if (allVideos.length > 0) {
                await this.fetchVideoDurations(allVideos);
            }
            
            return allVideos;
            
        } catch (error) {
            console.error('Error al obtener videos de playlist:', error);
            mostrarMensajeFlotante('Error al cargar videos de la playlist');
            return null;
        }
    }

    // Obtener duraciones de videos
    async fetchVideoDurations(videos) {
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
                
                if (response.result.items) {
                    response.result.items.forEach(item => {
                        const video = videos.find(v => v.videoId === item.id);
                        if (video) {
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
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            console.error('Cliente de autenticación no inicializado');
            mostrarMensajeFlotante('Error: Sistema de autenticación no listo');
        }
    }

    // Manejar click en cerrar sesión
    handleSignOutClick() {
        const token = gapi.client.getToken();
        
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token, () => {
                gapi.client.setToken('');
                
                // Eliminar token guardado
                localStorage.removeItem('google_token');
                
                console.log('Token revocado y sesión cerrada.');
                this.isAuthenticated = false;
                this.updateUI(false);
                
                // Disparar evento de cierre de sesión
                document.dispatchEvent(new CustomEvent('userLoggedOut'));
                
                mostrarMensajeFlotante('Sesión cerrada correctamente');
            });
        }
    }

    // Actualizar interfaz según estado de autenticación
    updateUI(isLoggedIn) {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        const playlistContainer = document.getElementById('playlistContainer');
        
        if (isLoggedIn) {
            if (signInButton) signInButton.classList.add('hidden');
            if (signOutButton) signOutButton.classList.remove('hidden');
            if (playlistContainer) playlistContainer.classList.remove('hidden');
        } else {
            if (signInButton) signInButton.classList.remove('hidden');
            if (signOutButton) signOutButton.classList.add('hidden');
        }
    }

    // Configurar listeners de botones
    setupButtonListeners() {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (signInButton) {
            signInButton.addEventListener('click', () => this.handleAuthClick());
        }
        
        if (signOutButton) {
            signOutButton.addEventListener('click', () => this.handleSignOutClick());
        }
        
        // Estado inicial
        this.updateUI(false);
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
        return this.isAuthenticated;
    }

    async forceTokenRefresh() {
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken({ prompt: '' });
        }
    }
}

// Crear y exportar instancia única
export const authManager = new GoogleAuthManager();

// Exportar clase para casos especiales
export { GoogleAuthManager };
