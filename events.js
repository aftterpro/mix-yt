
import { handleScroll } from "./search.js";
import { addYouTubeLibraryPlaylists, clearYouTubeLibraryPlaylists } from "./playlists.js";

export function setupEventListeners() {
    // Escuchar el evento de scroll para la carga infinita
    const resultsContainer = document.getElementById('resultsContainer');
    if (resultsContainer) {
        resultsContainer.addEventListener('scroll', handleScroll);
    }
    
    // Escucha de eventos desde auth.js
    document.addEventListener('playlistsFetched', (event) => {
        console.log("Evento 'playlistsFetched' recibido en app.js");
        const libraryPlaylists = event.detail;
        addYouTubeLibraryPlaylists(libraryPlaylists);
    });

    document.addEventListener('userLoggedOut', () => {
        console.log("Evento 'userLoggedOut' recibido en app.js");
        clearYouTubeLibraryPlaylists();
    });

    // ... otros event listeners
}