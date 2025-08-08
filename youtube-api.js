import { onPlayerReady, onPlayerStateChange, onPlayerError, monitorPlayers } from './player-logic.js';
import { initializePlayers } from './player-logic.js';

export let youtubeAPIReady = false;

// Carga el script de la API de YouTube
export function loadYouTubeAPI() {
    if (youtubeAPIReady) return;
    youtubeAPIReady = true;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
}

// Llamada por la API de YouTube cuando está lista
export function onYouTubeIframeAPIReady() {
    initializePlayers();
}