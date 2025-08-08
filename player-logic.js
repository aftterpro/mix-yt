// player-logic.js
import { getFlattenedPlaylist, updatePlaylistsUI, updateCurrentPlayingIndex } from "./playlists.js";
import { playNextVideo, checkAndSkipSegment } from "./video-control.js";
import { mostrarMensajeFlotante } from "./ui.js";
import {
    player1,
    player2,
    playersInitialized,
    setPlayersInitialized,
    monitorInterval,
    setMonitorInterval,
    currentPlayer,
    setCurrentPlayer,
    isTransitioning,
    setIsTransitioning,
    hasOutroCrossfadeStarted,
    setHasOutroCrossfadeStarted,
    currentPlayingInfo,
    setCurrentPlayingInfo,
    botonPlay
} from "./app.js";

// Lógica de inicialización de los reproductores
export function initializePlayers() {
  if (playersInitialized) return;
  player1 = new YT.Player('player1', {
    height: '100%',
    width: '100%',
    playerVars: { 'playsinline': 1 },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange,
      'onError': onPlayerError
    }
  });
  player2 = new YT.Player('player2', {
    height: '100%',
    width: '100%',
    playerVars: { 'playsinline': 1 },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange,
      'onError': onPlayerError
    }
  });
}

export function onPlayerReady(event) {
  if (player1 && typeof player1.getPlayerState === 'function' &&
    player2 && typeof player2.getPlayerState === 'function') {
    if (!playersInitialized) {
      playersInitialized = true;
      console.log("Ambos reproductores listos.");
      const flatList = getFlattenedPlaylist();
      botonPlay.disabled = flatList.length === 0;
    }
  }
  if (playersInitialized && !monitorInterval) {
    monitorInterval = setInterval(monitorPlayers, 300);
    console.log('Monitor iniciado (intervalo: 300ms)');
  }
}

export function onPlayerError(event) {
  console.error("Error del reproductor:", event.data, "Player:", event.target === player1 ? '1' : '2');
  let videoTitle = "este video";
  try {
    const videoData = event.target.getVideoData();
    if(videoData && videoData.title) {
      videoTitle = `"${videoData.title}"`;
    }
  } catch (e) { /* Ignorar si no se puede obtener */ }

  mostrarMensajeFlotante("Este video no se puede reproducir");
 playNextVideo()
  
}

export function onPlayerStateChange(event) {
 const playerState = event.data;
    const changedPlayerNum = event.target === player1 ? 1 : 2;
    const videoId = event.target.getVideoData()?.video_id;
    const playerInstance = event.target;

     if (playerState === YT.PlayerState.PLAYING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO. Video: ${videoId || 'Unknown ID'}`);

         const flatList = getFlattenedPlaylist();
         const playingVideoIndex = flatList.findIndex(v => v.videoId === videoId);

         if (videoId && playingVideoIndex !== -1) {
              const playingVideoObject = flatList[playingVideoIndex];
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = playingVideoObject.sourcePlaylistId;
              currentPlayingInfo.flattenedIndex = playingVideoIndex;
              console.log(`onPlayerStateChange: Información de reproducción actual actualizada vía cambio de estado: ${playingVideoIndex} (Video: ${videoId})`);
              updatePlaylistsUI();

             if (currentPlayer !== changedPlayerNum) {
                  console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum}.`);
                  currentPlayer = changedPlayerNum;
             }

             if (isTransitioning) {
                 console.log(`onPlayerStateChange: Video conocido (${videoId}) comenzó a reproducir. Reseteando flag isTransitioning.`);
                 isTransitioning = false;
             }

              // --- CORRECCIÓN: Resetear hasOutroCrossfadeStarted cuando un NUEVO video comienza a reproducir ---
             console.log(`onPlayerStateChange: Reseteando flag hasOutroCrossfadeStarted.`);
             hasOutroCrossfadeStarted = false; // Resetear el flag

         } else if (videoId && playingVideoIndex === -1) {
             console.warn(`onPlayerStateChange: Video desconocido (${videoId}) comenzó a reproducir en Player ${changedPlayerNum}.`);
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = null;
              currentPlayingInfo.flattenedIndex = -1;
               updatePlaylistsUI();
               if (currentPlayer !== changedPlayerNum) {
                   console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum} basándose en video desconocido.`);
                    currentPlayer = changedPlayerNum;
               }
                console.log(`onPlayerStateChange: Reseteando flag hasOutroCrossfadeStarted para video desconocido.`);
                hasOutroCrossfadeStarted = false;

         } else {
               console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO, pero el videoId aún no está disponible.`);
         }

          // Llamar a checkAndSkipSegment con forceCheck=true al entrar en estado PLAYING
          if (videoId) {
             checkAndSkipSegment(event.target, true);
          }

     } else if (playerState === YT.PlayerState.PAUSED) {
        console.log('onPlayerStateChange: Video pausado en Player', changedPlayerNum);
         if (changedPlayerNum === currentPlayer && reproduccionIniciada) {
             // Handled by button
         }
     } else if (playerState === YT.PlayerState.BUFFERING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está BUFFERING. Video: ${videoId || 'Unknown ID'}`);

     } else if (playerState === YT.PlayerState.CUED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está CUED. Video: ${videoId || 'Unknown ID'}`);

         const intendedNextPlayerNum = currentPlayer === 1 ? 2 : 1;
         const intendedNextVideoId = currentPlayingInfo.flattenedIndex !== -1 ? getFlattenedPlaylist()[currentPlayingInfo.flattenedIndex]?.videoId : null;

         if (changedPlayerNum === intendedNextPlayerNum && videoId === intendedNextVideoId && isTransitioning) {
             console.warn(`onPlayerStateChange: Reproductor siguiente previsto (${changedPlayerNum}) entró en estado CUED inesperadamente después de la llamada a playVideo() durante la transición. Video: ${videoId}. Intentando playVideo() de nuevo.`);
             setTimeout(() => {
                 try {
                     if (playerInstance && typeof playerInstance.playVideo === 'function' && playerInstance.getPlayerState() === YT.PlayerState.CUED) {
                          console.log(`onPlayerStateChange: Reintentando playVideo() en Player ${changedPlayerNum} desde estado CUED.`);
                         playerInstance.playVideo();
                     } else {
                          console.log(`onPlayerStateChange: No se reintenta playVideo() - Player ${changedPlayerNum} ya no está en estado CUED o es inválido.`);
                     }
                 } catch(e) { console.error("onPlayerStateChange: Error reintentando playVideo desde estado CUED:", e); }
             }, 500);
         } else if (playerState === YT.PlayerState.CUED) {
               console.log(`onPlayerStateChange: Player ${changedPlayerNum} entró en estado CUED normalmente. Video: ${videoId || 'Unknown ID'}.`);
         }

     } else if (playerState === YT.PlayerState.ENDED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} estado ENDED. Video: ${videoId || 'Unknown ID'}`);
         const endedVideoMatchesCurrent = (videoId && currentPlayingInfo.videoId === videoId);

         if (endedVideoMatchesCurrent && !isTransitioning && !isAudioFading) {
             console.log(`onPlayerStateChange: Video actual (${videoId}) terminó inesperadamente. Intentando playNextVideo.`);
             playNextVideo();
         } else if (changedPlayerNum !== currentPlayer) {
             console.log(`onPlayerStateChange: Otro player ${changedPlayerNum} estado ENDED. Video: ${videoId}. (No es el reproductor activo actual)`);
         }
    }
}

export function monitorPlayers() {
 // --- Chequeos de estado global ---
    if (!playersInitialized || !reproduccionIniciada) return;

    const activePlayer = (currentPlayer === 1) ? player1 : player2;

    // --- Validación del reproductor activo ---
    if (!activePlayer ||
        typeof activePlayer.getPlayerState !== 'function' ||
        typeof activePlayer.getCurrentTime !== 'function' ||
        typeof activePlayer.getDuration !== 'function' ||
        typeof activePlayer.getVideoData !== 'function') {
        console.warn("Monitor: El reproductor activo es inválido.");
        stopMonitoring();
        return;
    }

    const playerState = activePlayer.getPlayerState();
    const currentTime = activePlayer.getCurrentTime();
    const videoDuration = activePlayer.getDuration();
    const videoId = activePlayer.getVideoData()?.video_id;

    // --- Validación de video y duración ---
    if (!videoId || isNaN(videoDuration) || videoDuration <= 0) {
        checkAndSkipSegment(activePlayer);
        return;
    }

    // --- SponsorBlock: asegurar que los segmentos estén gestionados ---
    if (!segmentosCache[videoId]) {
        checkAndSkipSegment(activePlayer);
    } else if (segmentosCache[videoId] === 'fetching') {
        checkAndSkipSegment(activePlayer);
    } else {
        checkAndSkipSegment(activePlayer);
    }
    // --- Crossfade basado en tiempo restante (MODIFICADO) ---
    const timeRemaining = videoDuration - currentTime;

    // MODIFICACIÓN: Solo disparar si NO hay crossfade en progreso
    if (
        playerState === YT.PlayerState.PLAYING &&
        timeRemaining <= CROSSFADE_DURATION + 0.5 &&
        timeRemaining > 0 &&
        !hasOutroCrossfadeStarted &&
        !crossfadeInProgress // NUEVA CONDICIÓN
    ) {
        console.log(`Monitor: Tiempo restante (${timeRemaining.toFixed(1)}s) dentro de la ventana de crossfade. Disparando playNextVideo basado en tiempo.`);
        playNextVideo();
    }

    // --- Salvaguarda: detener reproductor inactivo si sigue sonando (MODIFICADO) ---
    const inactivePlayer = (currentPlayer === 1) ? player2 : player1;
    if (
        inactivePlayer &&
        typeof inactivePlayer.getPlayerState === 'function' &&
        typeof inactivePlayer.stopVideo === 'function' &&
        !crossfadeInProgress // NO detener durante crossfade
    ) {
        const inactiveState = inactivePlayer.getPlayerState();
        if (
            inactiveState === YT.PlayerState.PLAYING &&
            inactivePlayer !== activePlayer
        ) {
            console.warn("Monitor: Reproductor inactivo detectado aún REPRODUCIENDO. Deteniéndolo.");
            try { inactivePlayer.stopVideo(); }
            catch(e) { console.error("Monitor: Error deteniendo reproductor inactivo:", e); }
        }
    }}