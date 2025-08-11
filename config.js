//Configuración y Variables Globales
export const CONFIG = {
    CROSSFADE_DURATION: 15, // Duración del crossfade en segundos
    YOUTUBE_LIBRARY_SOURCE_ID: 'youtube_library',
    PIPED_INSTANCES: [
        //"https://pipedapi.reallyaweso.me",
        "https://pipedapi.ducks.party",
        "https://piapi.ggtyler.dev"
    ]
};

// Variables globales del estado de la aplicación
export const AppState = {
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
};

// Variables para playlists
export const PlaylistState = {
    playlistsData: [],
    currentPlayingInfo: {
        playlistId: null,
        videoId: null,
        flattenedIndex: -1
    }
};

// Variables para búsqueda
export const SearchState = {
    isLoadingMore: false,
    nextPageContext: null,
    currentSearchQuery: '',
    resultsContainer: null,
    resultsDiv: null
};

// Variables para SponsorBlock
export const SponsorBlockState = {
    segmentosCache: {},
    lastSeekEndTime: -1,
    lastSeekVideoId: null
};
