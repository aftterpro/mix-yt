// state.js - NUEVO ARCHIVO UNIFICADO DE ESTADOS
// Reemplaza config.js y unifica todos los estados

export const CONFIG = {
    CROSSFADE_DURATION: 15, // Duración del crossfade en segundos
    YOUTUBE_LIBRARY_SOURCE_ID: 'youtube_library',
    PIPED_INSTANCES: [
        "https://api.piped.private.coffee"
        //"https://pipedapi.reallyaweso.me",
        //"https://pipedapi.ducks.party"
        //"https://piapi.ggtyler.dev"
    ]
};

// Sistema de estados unificado con Observer pattern
class StateManager {
    constructor() {
        this.subscribers = new Map();
        this.states = {
            app: {
                player1: null,
                player2: null,
                currentPlayer: 1,
                monitorInterval: null,
                playersInitialized: false,
                youtubeAPIReady: false,
                isTransitioning: false,
                isAudioFading: false,
                hasOutroCrossfadeStarted: false,
                crossfadeInterval: null,
                crossfadeInProgress: false,
                reproduccionIniciada: false
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
            
            ui: {
                currentView: 'home',
                isPlaying: false,
                currentTrack: null,
                isDesktop: window.innerWidth >= 1024,
                expandedPlaylists: new Set()
            }
        };
        
        this.setupGlobalReferences();
    }
    
    // Mantener compatibilidad con código existente
    setupGlobalReferences() {
        // Referencias legacy
        window.appState = this.states.app;
        window.playlistState = this.states.playlist;
        window.searchState = this.states.search;
        window.sponsorBlockState = this.states.sponsorBlock;
        
        // Referencias nuevas
        window.AppState = this.states.app;
        window.PlaylistState = this.states.playlist;
        window.SearchState = this.states.search;
        window.SponsorBlockState = this.states.sponsorBlock;
        window.UIState = this.states.ui;
        
        // State manager global
        window.StateManager = this;
    }
    
    // Obtener estado específico
    get(statePath) {
        const parts = statePath.split('.');
        let current = this.states;
        
        for (const part of parts) {
            if (current[part] === undefined) {
                console.warn(`⚠️ Estado no encontrado: ${statePath}`);
                return undefined;
            }
            current = current[part];
        }
        
        return current;
    }
    
    // Actualizar estado específico
    set(statePath, value) {
        const parts = statePath.split('.');
        const lastPart = parts.pop();
        let current = this.states;
        
        for (const part of parts) {
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
        
        const oldValue = current[lastPart];
        current[lastPart] = value;
        
        // Notificar subscribers
        this.notify(statePath, value, oldValue);
        
        return value;
    }
    
    // Suscribirse a cambios de estado
    subscribe(statePath, callback) {
        if (!this.subscribers.has(statePath)) {
            this.subscribers.set(statePath, new Set());
        }
        
        this.subscribers.get(statePath).add(callback);
        
        // Retornar función para unsuscribe
        return () => {
            const pathSubscribers = this.subscribers.get(statePath);
            if (pathSubscribers) {
                pathSubscribers.delete(callback);
            }
        };
    }
    
    // Notificar cambios
    notify(statePath, newValue, oldValue) {
        const pathSubscribers = this.subscribers.get(statePath);
        if (pathSubscribers) {
            pathSubscribers.forEach(callback => {
                try {
                    callback(newValue, oldValue, statePath);
                } catch (error) {
                    console.error('Error en subscriber callback:', error);
                }
            });
        }
        
        // También notificar subscribers de rutas padre
        const parts = statePath.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            const parentSubscribers = this.subscribers.get(parentPath);
            if (parentSubscribers) {
                parentSubscribers.forEach(callback => {
                    try {
                        callback(this.get(parentPath), undefined, parentPath);
                    } catch (error) {
                        console.error('Error en parent subscriber callback:', error);
                    }
                });
            }
        }
    }
    
    // Reset completo de estados
    reset() {
        console.log('🔄 Reseteando todos los estados...');
        
        // Reset app state
        Object.assign(this.states.app, {
            currentPlayer: 1,
            monitorInterval: null,
            isTransitioning: false,
            isAudioFading: false,
            hasOutroCrossfadeStarted: false,
            crossfadeInterval: null,
            crossfadeInProgress: false,
            reproduccionIniciada: false
        });
        
        // Reset playlist state
        Object.assign(this.states.playlist, {
            currentPlayingInfo: {
                playlistId: null,
                videoId: null,
                flattenedIndex: -1
            }
        });
        
        // Reset search state
        Object.assign(this.states.search, {
            isLoadingMore: false,
            nextPageContext: null,
            currentSearchQuery: ''
        });
        
        // Reset sponsor block state
        Object.assign(this.states.sponsorBlock, {
            segmentosCache: {},
            lastSeekEndTime: -1,
            lastSeekVideoId: null
        });
        
        // Reset UI state
        Object.assign(this.states.ui, {
            currentView: 'home',
            isPlaying: false,
            currentTrack: null,
            expandedPlaylists: new Set()
        });
        
        // Notificar reset completo
        this.notify('*', 'reset', 'reset');
        
        console.log('✅ Estados reseteados');
    }
    
    // Debug de estados
    debug() {
        console.log('=== STATE MANAGER DEBUG ===');
        console.log('App State:', this.states.app);
        console.log('Playlist State:', this.states.playlist);
        console.log('Search State:', this.states.search);
        console.log('SponsorBlock State:', this.states.sponsorBlock);
        console.log('UI State:', this.states.ui);
        console.log('Subscribers:', Array.from(this.subscribers.keys()));
        console.log('===========================');
    }
    
    // Health check
    getHealthCheck() {
        return {
            statesInitialized: !!this.states,
            globalReferencesSet: !!(window.AppState && window.PlaylistState),
            subscribersActive: this.subscribers.size,
            playersReady: this.states.app.playersInitialized,
            reproductionStarted: this.states.app.reproduccionIniciada,
            currentView: this.states.ui.currentView,
            playlistsLoaded: this.states.playlist.playlistsData.length
        };
    }
}

// Crear instancia única global
export const stateManager = new StateManager();

// Exportar estados individuales para compatibilidad
export const AppState = stateManager.states.app;
export const PlaylistState = stateManager.states.playlist;
export const SearchState = stateManager.states.search;
export const SponsorBlockState = stateManager.states.sponsorBlock;
export const UIState = stateManager.states.ui;

// Funciones de conveniencia
export function getState(path) {
    return stateManager.get(path);
}

export function setState(path, value) {
    return stateManager.set(path, value);
}

export function subscribeToState(path, callback) {
    return stateManager.subscribe(path, callback);
}

// Hacer disponible globalmente para debugging
window.stateManager = stateManager;
window.debugStates = () => stateManager.debug();