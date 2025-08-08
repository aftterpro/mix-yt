// Importar todos los módulos
import {
  initializePlayers,
  onYouTubeIframeAPIReady,
} from "./youtube-api.js";
import { performSearch, handleScroll } from "./search.js";
import {
  handlePlaylistLoaded,
  handleSearchResultAddClick,
  addVideoToManualPlaylist,
  addVideoToSpecificPlaylist,
  updatePlaylistsUI,
  getFlattenedPlaylist,
  updateCurrentPlayingIndex,
  checkAndEnablePlayButton
} from "./playlists.js";
import { mostrarMensajeFlotante } from "./ui.js";
import { setupEventListeners } from "./events.js";
import { loadYouTubeAPI } from "./youtube-api.js";

// --- Variables Globales ---
export const CROSSFADE_DURATION = 15; // Duración del crossfade en segundos
export let currentPlayer = 1;
export let isTransitioning = false;
export let isAudioFading = false;
export let hasOutroCrossfadeStarted = false;
export let crossfadeInterval = null;
export let crossfadeInProgress = false;
export const YOUTUBE_LIBRARY_SOURCE_ID = 'youtube_library';

// Variables de estado del reproductor
export let playersInitialized = false;

// Variables para la búsqueda
export let isLoadingMore = false;
export let nextPageContext = null;
export let currentSearchQuery = '';

// Variables para las playlists
export let playlistsData = [];
export let currentPlayingInfo = {
  playlistId: null,
  videoId: null,
  flattenedIndex: -1
};

// Referencias a los reproductores de YouTube
export let player1, player2;
export let monitorInterval;

// Referencias a elementos del DOM (pueden ser exportadas si son necesarias en otros módulos)
export const resultsContainer = document.getElementById('resultsContainer');
export const resultsDiv = document.getElementById('results');
export const botonPlay = document.getElementById('botonPlay');

// --- Funciones de Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM Content Loaded.");
    mostrarMensajeFlotante("Cardo totalmente")
  loadYouTubeAPI();
  setupEventListeners(); // Mover todos los event listeners aquí
});

// Asignar funciones globales para la API de YouTube
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
