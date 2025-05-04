// Módulo: Configuración y Variables Globales
const CROSSFADE_DURATION = 15; // Duración del crossfade en segundos
let player1, player2;
let currentPlayer = 1;
let monitorInterval; // Declarar fuera para controlar el intervalo
let playersInitialized = false; // Estado global para saber si ambos reproductores están listos
let youtubeAPIReady = false;
let isTransitioning = false; // Flag para estado de transición
let isAudioFading = false; // NUEVO: Flag específico para la duración del fundido de audio
let hasOutroCrossfadeStarted = false; // NUEVO: Flag para indicar si el crossfade fue disparado por un segmento "outro" de SB

let playlistsData = []; // Array principal para almacenar todas las playlists [{id, name, thumbnailUrl, videos:[], isExpanded}, ...]
let currentPlayingInfo = { // Para rastrear qué video/playlist está sonando
    playlistId: null,
    videoId: null,
    flattenedIndex: -1 // Índice en la lista aplanada para reproducción
};
let pendingVisualTransition = {
    playerNum: null, // 1 o 2 (el número del reproductor que debería entrar visualmente)
    outgoingElement: null, // Elemento DOM del reproductor que se desvanece (sale)
    incomingElement: null, // Elemento DOM del reproductor que aparece (entra)
    // Puedes añadir videoId aquí para una comprobación extra si es necesario
    // outgoingVideoId: null, // Video ID del reproductor saliente
    // incomingVideoId: null  // Video ID del reproductor entrante (nextVideoId)
}
// Variables para Búsqueda y Scroll Infinito
let isLoadingMore = false; // Flag para evitar cargas múltiples simultáneas
let nextPageContext = null; // Para guardar información de la siguiente página (si la API la provee)
let currentSearchQuery = ''; // Guarda la última consulta realizada
const resultsContainer = document.getElementById('resultsContainer'); // Contenedor scrollable
const resultsDiv = document.getElementById('results'); // Contenedor de la grilla

// Variables para SponsorBlock y Seek
let segmentosCache = {}; // Objeto para almacenar los segmentos por videoId
let lastSeekEndTime = -1; // Último punto de salto para evitar bucles
let lastSeekVideoId = null; // Video ID asociado al último salto

function mostrarMensajeFlotante(mensaje) {
    const mensajeDiv = document.createElement('div');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = 'mensaje-flotante';
    const playlistContainer = document.getElementById('playlistContainer'); // Obtener referencia al contenedor
    playlistContainer.insertAdjacentElement('afterend', mensajeDiv); // Insertar después del contenedor

    setTimeout(() => {
        mensajeDiv.classList.add('fadeOut');
        setTimeout(() => {
            mensajeDiv.remove();
        }, 1000);
    7},6000);// 6segundos
}
mostrarMensajeFlotante("¡Recomendamos primero agregar una playlist!"); // Comentado para no molestar siempre

// Módulo: Carga del API de YouTube (Optimizado)
function loadYouTubeAPI() {
    if (youtubeAPIReady) return;
    youtubeAPIReady = true;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api'; // URL oficial
    script.async = true;
    document.head.appendChild(script); // Añadir al head
    // La función onYouTubeIframeAPIReady será llamada automáticamente por la API
}
// Esta función es llamada por la API de YouTube cuando está lista
function onYouTubeIframeAPIReady() {
    initializePlayers();
}

function initializePlayers() {
    if (player1 && player2) return; // Evitar reinicialización

    player1 = new YT.Player('player1', {
        height: '100%',
        width: '100%',
        playerVars: {
             'playsinline': 1 // Importante para móviles
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
    player2 = new YT.Player('player2', {
        height: '100%',
        width: '100%',
         playerVars: {
             'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    // Verificar si AMBOS están listos
    if (player1 && typeof player1.getPlayerState === 'function' &&
        player2 && typeof player2.getPlayerState === 'function') {
        if (!playersInitialized) {
            playersInitialized = true;
            console.log("Ambos reproductores listos.");
            // Habilitar botón Play solo si hay videos cargados
             const flatList = getFlattenedPlaylist();
            document.getElementById('botonPlay').disabled = flatList.length === 0;
        }
    }
    // Iniciar monitor solo UNA VEZ cuando los players estén listos
    if (playersInitialized && !monitorInterval) {
        monitorInterval = setInterval(monitorPlayers, 300); // Chequear cada 300ms
        console.log('Monitor iniciado (intervalo: 300ms)');
    }
}

function onPlayerError(event) {
    console.error("Error del reproductor:", event.data, "Player:", event.target === player1 ? '1' : '2');
    let videoTitle = "este video";
    try {
      // Intentar obtener el título del video que falló
      const videoData = event.target.getVideoData();
      if(videoData && videoData.title) {
        videoTitle = `"${videoData.title}"`;
      }
    } catch (e) { /* Ignorar si no se puede obtener */}

    let errorMsg = `Ocurrió un error desconocido (${event.data}) al reproducir ${videoTitle}.`;
    switch (event.data) {
        case 2: errorMsg = `Error: ID de video inválido para ${videoTitle}.`; break;
        case 5: errorMsg = `Error al reproducir ${videoTitle}. (Posible problema de HTML5 o derechos).`; break;
        case 100: errorMsg = `Error: Video ${videoTitle} no encontrado.`; break;
        case 101:
        case 150: errorMsg = `Error: El propietario de ${videoTitle} no permite la reproducción incrustada.`; break;
    }
    mostrarMensajeFlotante(errorMsg);

    // Intentar saltar al siguiente si el error impide la reproducción
    if ([2, 5, 100, 101, 150].includes(event.data)) {
         console.log("Intentando saltar al siguiente video debido a error...");
         // Llamar a playNextVideo SIN argumentos debería funcionar con la lógica adaptada
         setTimeout(playNextVideo, 500); // Pequeño delay antes de saltar
    }
}
function onPlayerStateChange(event) {
    const playerState = event.data;
    const changedPlayerNum = event.target === player1 ? 1 : 2; // Número del reproductor que cambió de estado
    const videoId = event.target.getVideoData()?.video_id; // ID del video en ese reproductor
    const playerInstance = event.target; // Instancia del reproductor que cambió de estado

     // --- Lógica para Disparar la Transición Visual cuando el Reproductor Entrante está Listo ---
     // Verificar si este reproductor que cambió de estado es el que está registrado en pendingVisualTransition.
     // Si es así, y alcanza BUFFERING o PLAYING, disparar la animación visual.
     // IMPORTANTE: Limpiar pendingVisualTransition justo DESPUÉS de disparar la animación.

     if (pendingVisualTransition.playerNum === changedPlayerNum && // ¿Es el reproductor que esperamos para la transición visual?
         (playerState === YT.PlayerState.BUFFERING || playerState === YT.PlayerState.PLAYING) && // ¿Alcanzó un estado listo para mostrar video?
         pendingVisualTransition.playerNum !== null) // ¿Hay una transición visual pendiente activa? (Protección extra)
         {

          // Agregar una comprobación extra de videoId. Asegurarse de que el video ID del reproductor
          // que entró en BUFFERING/PLAYING coincide con el video ID que intentamos hacer transición (ya en currentPlayingInfo.videoId).
          // currentPlayingInfo.videoId ya fue actualizado al video entrante en playNextVideo
          const intendedNextVideoId = currentPlayingInfo.videoId;

          if (!videoId || videoId !== intendedNextVideoId) {
               console.warn(`onPlayerStateChange [Visual]: Player ${changedPlayerNum} (${videoId}) entró en BUFFERING/PLAYING, pero no coincide con el video entrante esperado (${intendedNextVideoId}). No disparando transición visual para este video.`);
               // NO limpiar pendingVisualTransition aquí. Esperar al video correcto o a la próxima llamada a playNextVideo.
               // Todavía procesar otra lógica de estado abajo para este reproductor.
          } else {
               // ¡Este es el reproductor entrante esperado (${changedPlayerNum}) entrando en BUFFERING/PLAYING con el video correcto (${videoId})!
               // ¡Es hora de disparar la transición visual!

               console.log(`onPlayerStateChange [Visual]: Reproductor entrante ${changedPlayerNum} (${videoId}) entró en BUFFERING/PLAYING. Disparando transición visual.`);

               // Obtener los elementos DOM que fueron registrados en pendingVisualTransition
               const outgoingElement = pendingVisualTransition.outgoingElement; // Elemento saliente
               const incomingElement = pendingVisualTransition.incomingElement; // Elemento entrante

               if (outgoingElement && incomingElement) {
                   // Aplicar las clases CSS para iniciar la animación de desvanecimiento y fundido
                   // Asegurarse de que el elemento entrante esté visible y no oculto antes de aplicar fade-in
                   incomingElement.classList.remove('hidden'); // Asegurar visibilidad inicial
                   outgoingElement.classList.add('fade-out'); // Iniciar desvanecimiento en el saliente
                   incomingElement.classList.remove('fade-out'); // Limpiar por si acaso
                   incomingElement.classList.add('fade-in'); // Iniciar fundido en el entrante

                   // Nota: El z-index correcto para .fade-in (mayor que .fade-out) debe estar definido en tu CSS.


                   // --- Adjuntar Manejador transitionend y setTimeout de Respaldo (Lógica movida de playNextVideo) ---
                   // Adjuntar el listener al elemento saliente (el que se desvanece a opacidad 0).
                    let transitionEndHandler = (event) => {
                        // Asegurarse de que este listener solo se dispare para la transición de 'opacity' en el elemento correcto (el reproductor saliente)
                        if (event.propertyName !== 'opacity' || event.target !== outgoingElement) {
                            // console.log(`onPlayerStateChange [Visual]: Ignorando transitionend en ${event.target.id} para propiedad ${event.propertyName}. Esperando opacity en ${outgoingElement.id}.`);
                            return; // Ignorar eventos de transición para otras propiedades o en otros elementos
                        }
                        console.log(`onPlayerStateChange [Visual]: Evento transitionend disparado en ${event.target.id} por propiedad ${event.propertyName}. Realizando limpieza FINAL.`);
                        // Eliminar el event listener después de que se dispare
                        event.target.removeEventListener('transitionend', transitionEndHandler);
                        // Limpiar el timeout de respaldo asociado
                        clearTimeout(transitionEndHandler.fallbackTimeoutId);


                        // --- Lógica de Limpieza FINAL (Después de que el Desvanecimiento Visual se Completa) ---
                        // Esta lógica marca el fin de la transición GENERAL.
                        try {
                            console.log(`onPlayerStateChange [Visual]: Limpieza FINAL de transición visual iniciada.`);

                            // Detener explícitamente el video anterior (el que acaba de desvanecerse).
                            // Obtener la instancia del reproductor que LÓGICAMENTE estaba sonando antes de la transición.
                            // Este es el reproductor cuyo elemento es 'outgoingElement'.
                             const previousPlayerInstance = (outgoingElement.id === 'player1') ? player1 : player2;

                            // Solo intentar detener si la instancia es válida y no está ya terminada
                            // Añadir un pequeño retraso para asegurar que stopVideo no interfiera con el inicio del nuevo video? (Probar si es necesario)
                             // setTimeout(() => { ... stopVideo() ... }, 50);
                             if (previousPlayerInstance && typeof previousPlayerInstance.stopVideo === 'function' && previousPlayerInstance.getPlayerState() !== YT.PlayerState.ENDED) {
                                  console.log(`onPlayerStateChange [Visual]: Limpieza - Llamando a stopVideo() en Player saliente ${outgoingElement.id}.`);
                                  previousPlayerInstance.stopVideo();
                             } else {
                                  // console.log(`onPlayerStateChange [Visual]: Limpieza - No se llama stopVideo() en Player saliente ${outgoingElement.id} (no válido o ya ENDED).`);
                             }


                            // Ocultar completamente el contenedor del reproductor antiguo después del desvanecimiento
                            if (outgoingElement) {
                                outgoingElement.classList.remove('fade-out', 'fade-in'); // Eliminar clases de desvanecimiento
                                outgoingElement.classList.add('hidden'); // Ocultar completamente (con display: none)
                            }
                            // Eliminar la clase fade-in del contenedor del nuevo reproductor (ya debería estar completamente visible)
                            if (incomingElement) {
                                incomingElement.classList.remove('fade-in', 'fade-out'); // Limpiar clases de desvanecimiento
                                 // Asegurarse de que el z-index o capa del reproductor entrante sea el predeterminado si se ajustó con CSS
                                 // incomingElement.style.zIndex = ''; // Si tu CSS usa z-index en .fade-in
                            }

                            // La limpieza de caché SB del video anterior (eliminación de caché)
                            // y el reseteo de lastSeek para ese video
                            // se manejan en playNextVideo en un setTimeout.

                        } catch (cleanupError) {
                             console.error("onPlayerStateChange [Visual]: Error durante la limpieza FINAL de transitionend:", cleanupError);
                        } finally {
                             console.log(`onPlayerStateChange [Visual]: Limpieza FINAL de transitionend COMPLETADA.`);
                             // Aquí es donde se resetean los flags que indican que la transición GENERAL ha terminado.
                             isTransitioning = false; // La transición visual y general ha terminado.
                             // isAudioFading se gestiona dentro de crossfadeAudio.
                             // hasOutroCrossfadeStarted se resetea al entrar en PLAYING del nuevo video.
                        }
                    };

                   // Adjuntar el event listener para el final de la transición de opacidad en el elemento saliente
                    outgoingElement.addEventListener('transitionend', transitionEndHandler);

                   // --- Agregar un setTimeout de respaldo por si transitionend no se dispara (ej. si la duración es 0 o se interrumpe) ---
                    const fallbackTimeoutMs = CROSSFADE_DURATION * 1000 + 200; // Duración en ms + un pequeño buffer (ej. 200ms)
                    console.log(`onPlayerStateChange [Visual]: Estableciendo setTimeout de respaldo (${fallbackTimeoutMs}ms).`);
                    // Almacenar el ID del timeout en la propia función manejadora para que pueda ser limpiado si transitionend se dispara primero.
                    transitionEndHandler.fallbackTimeoutId = setTimeout(() => {
                        console.warn(`onPlayerStateChange [Visual]: setTimeout de respaldo disparado después de ${fallbackTimeoutMs}ms.`);
                        // Si el timeout se dispara, eliminar el listener de transitionend para evitar que se dispare después.
                        if (outgoingElement) {
                             outgoingElement.removeEventListener('transitionend', transitionEndHandler);
                        }
                        // Ejecutar la lógica de limpieza directamente, simulando el evento transitionend.
                        // Pasamos propiedades básicas del evento original para que la lógica de limpieza funcione.
                        transitionEndHandler({ propertyName: 'opacity', target: outgoingElement, isFallback: true });
                    }, fallbackTimeoutMs);


               } else {
                    // Si los elementos DOM (outgoing/incoming) no se encontraron al disparar la transición visual (error inesperado),
                    // ejecutar la lógica de limpieza inmediatamente como respaldo.
                    console.warn("onPlayerStateChange [Visual]: Elementos DOM (outgoing/incoming) para transición visual no encontrados al disparar. Ejecutando limpieza inmediata como respaldo.");
                     try {
                         console.log(`onPlayerStateChange [Visual]: Ejecutando lógica post-transición inmediata.`);
                          // Intentar detener el reproductor saliente previsto
                         // El reproductor saliente previsto es el que NO acaba de entrar en BUFFERING/PLAYING.
                         const previousPlayerInstance = (changedPlayerNum === 1) ? player2 : player1;
                         if (previousPlayerInstance && typeof previousPlayerInstance.stopVideo === 'function') {
                              console.log(`onPlayerStateChange [Visual]: Llamando a stopVideo() en Player saliente previsto inmediatamente.`);
                              previousPlayerInstance.stopVideo();
                         }
                          // Intentar ocultar el elemento saliente previsto
                         const intendedOutgoingElement = document.getElementById(`player${changedPlayerNum === 1 ? 2 : 1}`);
                          if (intendedOutgoingElement) {
                               intendedOutgoingElement.classList.remove('fade-out', 'fade-in');
                               intendedOutgoingElement.classList.add('hidden');
                          }
                          // Asegurarse de que el elemento entrante no quede oculto/desvaneciéndose si se encontró
                          if (incomingElement) { incomingElement.classList.remove('fade-in', 'fade-out', 'hidden'); }

                          // La limpieza de caché SB del video anterior también se programa en playNextVideo.

                     } catch(immediateError) {
                          console.error("onPlayerStateChange [Visual]: Error durante la lógica post-transición inmediata:", immediateError);
                     } finally {
                          // Resetear flags generales aquí también, ya que la transición visual no pudo dispararse o completarse normalmente.
                          isTransitioning = false;
                          isAudioFading = false;
                          hasOutroCrossfadeStarted = false; // Asumimos que si falló la transición visual, este flag también se limpia
                          console.log(`onPlayerStateChange [Visual]: Limpieza inmediata FINALIZADA. Flags reseteados.`);
                     }
               }

               // Limpiar el estado de transición visual pendiente *después* de disparar (o intentar disparar) la transición visual.
               // Ya no estamos esperando una transición visual pendiente para este reproductor.
               pendingVisualTransition = { playerNum: null, outgoingElement: null, incomingElement: null };
               console.log("onPlayerStateChange [Visual]: Estado de transición visual pendiente limpiado.");
          }
     }


     // --- Lógica Principal de Manejo de Estados ---
     // Esta parte se ejecuta independientemente de si se disparó una transición visual arriba.
     // Actualiza el estado lógico (currentPlayingInfo, currentPlayer) y resetea flags generales cuando
     // un video *conocido* alcanza el estado PLAYING.

     if (playerState === YT.PlayerState.PLAYING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO. Video: ${videoId || 'Unknown ID'}`);

         const flatList = getFlattenedPlaylist();
         const playingVideoIndex = flatList.findIndex(v => v.videoId === videoId);

         // Si el ID del video está disponible y se encuentra en nuestros datos de playlists (es un video conocido)
         if (videoId && playingVideoIndex !== -1) {
              const playingVideoObject = flatList[playingVideoIndex];
              // Actualizar currentPlayingInfo al video que acaba de comenzar a reproducir.
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = playingVideoObject.sourcePlaylistId;
              currentPlayingInfo.flattenedIndex = playingVideoIndex;
              console.log(`onPlayerStateChange: Información de reproducción actual actualizada vía cambio de estado PLAYING: ${playingVideoIndex} (Video: ${videoId})`);
              updatePlaylistsUI(); // Actualizar UI para resaltar el video que ahora está sonando

             // Establecer currentPlayer al número del reproductor que acaba de comenzar a reproducir este video conocido.
             if (currentPlayer !== changedPlayerNum) {
                  console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum} en estado PLAYING.`);
                  currentPlayer = changedPlayerNum;
             }

             // NOTA: Los flags generales (isTransitioning, isAudioFading, hasOutroCrossfadeStarted)
             // AHORA se resetean en la lógica de limpieza FINAL de la transición visual
             // (en el manejador transitionend o el timeout de respaldo), NO NECESARIAMENTE AQUÍ.
             // Sin embargo, si la transición visual no se dispara por alguna razón (ej. no hay elementos DOM),
             // la lógica de limpieza inmediata de respaldo también los resetea.
             // Mantengamos un reset aquí como SALVAGUARDA adicional si la lógica visual falla por completo,
             // pero la fuente principal de reseteo es el fin de la animación visual.

             // Salvaguarda: Si isTransitioning es true aquí, pero pendingVisualTransition ya es null (significa que el disparo visual ocurrió)
             // y de alguna forma no se reseteó al final, podríamos resetearlo.
             // Pero la lógica actual en la limpieza FINAL es más fiable.
             // Resetear solo hasOutroCrossfadeStarted aquí parece más seguro, ya que está ligado al trigger de SB.

              // Resetear hasOutroCrossfadeStarted cuando el NUEVO video conocido comienza a reproducir.
              // Esto es importante para que el próximo segmento 'outro' pueda disparar otra transición.
             console.log(`onPlayerStateChange: Reseteando flag hasOutroCrossfadeStarted.`);
             hasOutroCrossfadeStarted = false;


         } else if (videoId && playingVideoIndex === -1) {
             // Un video desconocido comenzó a reproducir.
             console.warn(`onPlayerStateChange: Video desconocido (${videoId}) comenzó a reproducir en Player ${changedPlayerNum}.`);
             // Actualizar currentPlayingInfo para reflejar que un video desconocido está reproduciendo.
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = null; // Playlist es desconocida
              currentPlayingInfo.flattenedIndex = -1; // Índice es desconocido
               updatePlaylistsUI(); // Actualizar UI (probablemente eliminará el resaltado anterior)
               // Establecer currentPlayer para el reproductor del video desconocido.
               if (currentPlayer !== changedPlayerNum) {
                   console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum} basándose en video desconocido en estado PLAYING.`);
                    currentPlayer = changedPlayerNum;
               }
                // Resetear flags generales de transición incluso para videos desconocidos que comienzan a reproducir.
                // Esto es una SALVAGUARDA por si un video desconocido interrumpe un crossfade.
                console.log(`onPlayerStateChange: Reseteando flags isTransitioning, isAudioFading, hasOutroCrossfadeStarted para video desconocido.`);
                isTransitioning = false; // Asumimos que la transición general se interrumpe
                isAudioFading = false;
                hasOutroCrossfadeStarted = false;
                // Limpiar el estado visual pendiente si un video desconocido interrumpe el flujo.
                 pendingVisualTransition = { playerNum: null, outgoingElement: null, incomingElement: null };


         } else {
               // El reproductor entró en estado PLAYING, pero videoId aún no está disponible.
               console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO, pero el videoId aún no está disponible.`);
               // NO resetear flags ni cambiar currentPlayer aquí. Esperar a que el videoId esté disponible (en un futuro evento PLAYING o BUFFERING).
               // El disparo de la transición visual arriba ya ocurrió si estaba pendiente para este reproductor y alcanzó BUFFERING/PLAYING con videoId.
         }

          // Llamar a checkAndSkipSegment con forceCheck=true al entrar en estado PLAYING para verificar segmentos iniciales.
          if (videoId) { // Asegurarse de tener el videoId antes de intentar verificar segmentos
             checkAndSkipSegment(event.target, true); // Usar forceCheck=true
          }

     } else if (playerState === YT.PlayerState.PAUSED) {
        console.log('onPlayerStateChange: Video pausado en Player', changedPlayerNum);
         // Si el reproductor pausado es el actual y la reproducción inició
         if (changedPlayerNum === currentPlayer && reproduccionIniciada) {
             // Lógica al pausar el video principal (ej. actualizar botón de play/pause)
         }

     } else if (playerState === YT.PlayerState.BUFFERING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está BUFFERING. Video: ${videoId || 'Unknown ID'}`);
         // El disparo de la transición visual está al inicio de esta función si hay una transición pendiente para este reproductor y alcanza BUFFERING.
         // Si el videoId aún no está disponible en este estado BUFFERING, el disparo visual podría no ocurrir hasta PLAYING.

     } else if (playerState === YT.PlayerState.CUED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está CUED. Video: ${videoId || 'Unknown ID'}`);
         // Este estado es el predeterminado después de cueVideoById().
         // Si un reproductor entra en CUED *después* de playVideo(), indica un posible problema.

         // --- Lógica de Reintento para Estado CUED Inesperado ---
         // Verificar si este reproductor que entró en estado CUED es el que se esperaba que fuera el 'siguiente' durante una transición en curso.
         // Esto lo sabemos si pendingVisualTransition.playerNum es igual a changedPlayerNum.
         // currentPlayingInfo.videoId ya fue actualizado al video entrante en playNextVideo.
         const intendedNextVideoId = currentPlayingInfo.videoId;


         // Si el reproductor que entró en estado CUED ES el que esperamos para la transición (según pendingVisualTransition)
         // Y el ID del video coincide con el que intentamos cargar/reproducir (si el videoId está disponible)
         // Y estamos en el proceso general de transición (`isTransitioning` es true) // Menos fiable que pendingVisualTransition
         // Usamos pendingVisualTransition.playerNum !== null como indicador de transición general iniciada.
         if (changedPlayerNum === pendingVisualTransition.playerNum && // ¿Este es el player que espera la transición visual?
             (videoId === intendedNextVideoId || !videoId) && // ¿El video coincide o aún no tenemos el ID?
             pendingVisualTransition.playerNum !== null // ¿Hay una transición general pendiente?
             ) {
             console.warn(`onPlayerStateChange: Reproductor siguiente previsto (${changedPlayerNum}) entró en estado CUED inesperadamente después de la llamada a playVideo() durante la transición. Video: ${videoId || 'Unknown ID'}. Intentando playVideo() de nuevo.`);
             // Reintentar llamar a playVideo() después de un pequeño retraso.
             setTimeout(() => {
                 try {
                     // Verificar si el reproductor sigue válido y *aún* en estado CUED antes de reintentar
                     if (playerInstance && typeof playerInstance.playVideo === 'function' && playerInstance.getPlayerState() === YT.PlayerState.CUED) {
                          console.log(`onPlayerStateChange: Reintentando playVideo() en Player ${changedPlayerNum} desde estado CUED.`);
                         playerInstance.playVideo(); // Llamar playVideo de nuevo
                     } else {
                          console.log(`onPlayerStateChange: No se reintenta playVideo() - Player ${changedPlayerNum} ya no está en estado CUED o es inválido.`);
                     }
                 } catch(e) { console.error("onPlayerStateChange: Error reintentando playVideo desde estado CUED:", e); }
             }, 500); // Reintentar después de 500ms
         } else if (playerState === YT.PlayerState.CUED) {
              // Si un reproductor entra en CUED pero NO es el que esperamos para la transición (pendingVisualTransition.playerNum es null o diferente),
              // es probable que sea el reproductor anterior siendo "limpiado" o preparado por la API después de stopVideo(). Es normal.
               console.log(`onPlayerStateChange: Player ${changedPlayerNum} entró en estado CUED normalmente. Video: ${videoId || 'Unknown ID'}.`);
         }


     } else if (playerState === YT.PlayerState.ENDED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} estado ENDED. Video: ${videoId || 'Unknown ID'}`);
         // Determinar si el video que terminó es el que lógicamente estaba sonando antes de que se llamara playNextVideo.
         // currentPlayingInfo ya fue actualizado al siguiente video en playNextVideo.
         // Necesitamos el ID del video ANTERIOR para saber si *ese* video terminó inesperadamente.
         // La limpieza FINAL (cuando la animación visual termina) se encarga de detener el reproductor anterior explícitamente.
         // Este ENDED para el reproductor anterior puede ocurrir DESPUÉS de stopVideo().

         // Comprobar si el video que terminó ES el video que LÓGICAMENTE estaba sonando *justo antes* de que se llamara a playNextVideo.
         // No tenemos el ID del video anterior fácilmente aquí.
         // Una aproximación: Si el reproductor que terminó NO es el reproductor LÓGICO actual (currentPlayer),
         // Y NO hay una transición general en curso (verificada por pendingVisualTransition).
         // Esto podría indicar que el video anterior terminó por sí solo inesperadamente.
         if (changedPlayerNum !== currentPlayer && pendingVisualTransition.playerNum === null) {
              console.log(`onPlayerStateChange: Otro player ${changedPlayerNum} estado ENDED. Video: ${videoId || 'Unknown ID'}. (No es el reproductor activo actual y no hay transición general en curso).`);
              // Si el video que terminó fue el que lógicamente estaba sonando ANTES (el que debía desvanecerse),
              // y la transición *no* se inició por alguna razón, esto podría ser un problema.
              // Sin embargo, si la transición sí se inició (pendingVisualTransition no es null), este ENDED
              // es esperado para el reproductor saliente después de que stopVideo sea llamado en la limpieza FINAL.
         }
         // Si el video que terminó ES el reproductor LÓGICO actual (currentPlayer),
         // Y NO estamos en una transición general en curso, significa que el video actual terminó inesperadamente.
         // currentPlayingInfo.videoId apunta al video que supuestamente *debería* estar sonando.
         const currentLogicalVideoId = currentPlayingInfo.videoId; // Video que *debería* estar sonando AHORA
         const endedVideoMatchesCurrentLogical = (videoId && currentLogicalVideoId === videoId);

         if (endedVideoMatchesCurrentLogical && pendingVisualTransition.playerNum === null && !isAudioFading) {
             console.log(`onPlayerStateChange: Video actual LÓGICO (${videoId}) terminó inesperadamente. Intentando playNextVideo.`);
             // Disparar la transición al siguiente video.
             playNextVideo();
         } else {
             // Si el video que terminó no es el actual lógico, o hay una transición en curso, este ENDED es esperado o irrelevante para el trigger principal.
              console.log(`onPlayerStateChange: Player ${changedPlayerNum} estado ENDED (${videoId || 'Unknown ID'}). (No es el reproductor actual lógico terminando inesperadamente O hay transición/fundido en curso).`);
         }
    }
    // Otros estados como UNSTARTED (Sin iniciar) no suelen requerir manejo específico aquí.
}
// Módulo: Interacción con API de Búsqueda (Piped)
const performSearch = async (query, nextPage = null) => {
    if (!resultsDiv) return;

    // Limpiar y mostrar estado si es búsqueda NUEVA
    if (!nextPage) {
        console.log(`Iniciando NUEVA búsqueda para: ${query}`);
        currentSearchQuery = query; // Guarda la nueva query
        nextPageContext = null; // Resetea el contexto de paginación
        resultsDiv.innerHTML = '<p>Buscando...</p>'; // Mostrar "Buscando..."
    } else {
        console.log(`Cargando MÁS resultados para: ${currentSearchQuery} (Página: ${nextPage})`);
        showLoadMoreSpinner(); // Mostrar indicador al cargar más
    }

    isLoadingMore = true; // Marcar como cargando

    try {
        // Construir URL: Añadir 'nextpage' si existe
        let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(currentSearchQuery)}`;
        if (nextPage) {
            apiUrl += `&nextpage=${encodeURIComponent(nextPage)}`; // Usar token/página
        }
        const response = await fetch(apiUrl);

        // Mejor manejo de errores HTTP
        if (!response.ok) {
            let errorDetails = `Error: ${response.status} ${response.statusText}`;
            let errorBody = null;
            try {
                errorBody = await response.json(); // Intenta leer cuerpo del error
                errorDetails = errorBody.error || errorDetails; // Usa mensaje del cuerpo si existe
                console.error("Error Body from Netlify Function:", errorBody);
            } catch (e) {
                console.warn("Could not parse error response body as JSON.");
                // Si no es JSON, intentar leer como texto
                try {
                    errorDetails = await response.text();
                } catch (e2) { /* Ignorar si falla */}
            }
            // Asegurarse que sea un objeto Error
            const error = new Error(errorDetails);
            error.status = response.status; // Añadir status al objeto error
            error.body = errorBody; // Añadir cuerpo si se pudo parsear
            throw error;
        }

        const data = await response.json();
        // Llamar a displaySearchResultsPiped, indicando si se deben añadir (append=true)
        displaySearchResultsPiped(data, !!nextPage); // append es true si nextPage tiene valor

    } catch (error) {
        console.error("Error fetching search results (app.js):", error.message, error);
        const displayError = error.message || "Error desconocido al buscar.";
        // Mostrar el mensaje de error que ahora viene más detallado
        if (!nextPage) {
            resultsDiv.innerHTML = `<p>${displayError}</p>`;
        } else {
             mostrarMensajeFlotante(displayError);
             hideLoadMoreSpinner();
        }
        isLoadingMore = false; // Resetea el flag en error
    }
};

// --- Función para mostrar resultados ---
const displaySearchResultsPiped = (results, append = false) => {
    if (!resultsDiv) {
        console.error("Results div not found!");
        return;
    }
    if (!append) {
        resultsDiv.innerHTML = '';
    }
    if (!results || !results.items || !Array.isArray(results.items)) {
        if (!append && (!results || results.items?.length === 0)) { // Mostrar solo si es búsqueda inicial y no hay NADA
            resultsDiv.innerHTML = "<p>No se encontraron resultados.</p>";
        }
        nextPageContext = results?.nextpage || null; // Guardar contexto incluso si no hay items
        isLoadingMore = false;
        hideLoadMoreSpinner();
        return;
    }

    // Guardar el contexto para la siguiente página
    nextPageContext = results.nextpage || null;
    console.log("Next page context:", nextPageContext);

    results.items.forEach(video => {
        const authorName = video.uploaderName || 'Autor Desconocido';
        const videoId = video.videoId || video.url?.split('v=')[1];

        if (!videoId) {
            console.warn("Resultado omitido, no se pudo obtener videoId:", video);
            return;
        }
        // Evitar duplicados al añadir MÁS resultados
        if (append && resultsDiv.querySelector(`.video-result[data-video-id="${videoId}"]`)) {
            // console.log(`Video duplicado omitido al añadir: ${video.title}`);
            return;
        }

        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');
        const thumbnail = document.createElement('img');
        thumbnail.src = video.thumbnail;
        thumbnail.alt = video.title;
        thumbnail.classList.add('thumbnail');
        thumbnail.loading = "lazy";
        thumbnailContainer.appendChild(thumbnail);
        if (video.duration && video.duration > 0) {
            const durationSpan = document.createElement('span');
            durationSpan.textContent = formatDuration(video.duration);
            durationSpan.classList.add('duration');
            thumbnailContainer.appendChild(durationSpan);
        }
        videoDiv.appendChild(thumbnailContainer);

        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('video-details');
        const title = document.createElement('h3');
        title.textContent = video.title;
        title.classList.add('video-title');
        title.title = video.title;
        detailsDiv.appendChild(title);
        const author = document.createElement('p');
        author.textContent = authorName;
        author.classList.add('video-author');
        detailsDiv.appendChild(author);
                // --- Botón Añadir ---
        const addToPlaylistButton = document.createElement('button');
        // Estilos base del botón (pueden estar en CSS)
        addToPlaylistButton.innerHTML = '<i class="fa-solid fa-plus"></i><span class="add-text"> Añadir</span>';
        addToPlaylistButton.classList.add('add-to-playlist', 'search-result-add-button'); // Añadir clase específica
        // Guardar datos del video en el botón
        addToPlaylistButton.dataset.videoId = videoId;
        addToPlaylistButton.dataset.videoTitle = video.title;
        addToPlaylistButton.dataset.videoThumbnail = video.thumbnail;
        const durationSeconds = typeof video.duration === 'number' ? video.duration : parseDuration(video.duration);
        addToPlaylistButton.dataset.videoDuration = durationSeconds;
        
        addToPlaylistButton.addEventListener('click', (event) => {
            // Extraer datos del botón presionado
            const button = event.currentTarget;
            const videoData = {
                videoId: button.dataset.videoId,
                title: button.dataset.videoTitle,
                thumbnail: button.dataset.videoThumbnail,
                duration: parseInt(button.dataset.videoDuration, 10),
            };
            // Llamar a la nueva función manejadora
            handleSearchResultAddClick(event, videoData);
        });
      
        detailsDiv.appendChild(addToPlaylistButton);
        videoDiv.appendChild(detailsDiv);
        resultsDiv.appendChild(videoDiv);
    }); // Fin del forEach de resultados

    if (append) {
        hideLoadMoreSpinner();
    }
    isLoadingMore = false;
};
function handleSearchResultAddClick(event, videoData) {
    event.preventDefault(); // Evitar comportamiento por defecto
    event.stopPropagation(); // Detener propagación

    const addButton = event.currentTarget; // El botón que fue clickeado
// Determine if there are any playlists loaded that are not the empty manual playlist
 const userLoadedPlaylists = playlistsData.filter(p => p.id !== 'manual' || p.videos.length > 0);

if (userLoadedPlaylists.length === 0) {
    // Case: No playlists loaded (or only manual is present and empty). Add directly to the manual playlist.
    console.log("No loaded playlists or only empty manual, adding direct to manual playlist.");
    addVideoToManualPlaylist(videoData); // Call the function to add to the manual playlist
} else {
    // Case: There are other playlists available. Show the menu to let the user choose.
    console.log("Showing menu to select destination playlist (Add action).");
    // Call the new generic popup function with the action type 'add'
    // No sourcePlaylistId is needed for 'add' from search results.
    showPlaylistSelectionPopup(addButton, videoData, 'add'); // <-- NEW CALL HERE
  }
}
// --- NUEVA: Función específica para añadir a "Mis Vídeos Añadidos" ---
function addVideoToManualPlaylist(videoData) {
    const manualPlaylistId = 'manual';
    let manualPlaylist = playlistsData.find(p => p.id === manualPlaylistId);

    // Crear playlist manual si no existe
    if (!manualPlaylist) {
        manualPlaylist = {
            id: manualPlaylistId,
            name: 'Mis Vídeos Añadidos',
            thumbnailUrl: 'https://via.placeholder.com/50?text=+',
            videos: [],
            isExpanded: true
        };
        // Asegurar que la manual siempre quede al principio si se crea ahora
        playlistsData.unshift(manualPlaylist);
        console.log("Playlist 'manual' creada y añadida al inicio.");
    }

    // Verificar duplicados DENTRO de la playlist manual
    const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante(`"${videoData.title}" ya está en "${manualPlaylist.name}".`);
        return;
    }

    // Crear el objeto de video
    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: videoData.duration || 0, // Ya debería ser número
    };

    // Añadir al final de la playlist manual
    manualPlaylist.videos.push(videoObject);
    mostrarMensajeFlotante(`Video añadido a "${manualPlaylist.name}": ${videoObject.title}`);
    console.log(`Video añadido a playlist '${manualPlaylistId}': ${videoObject.title}`);

    updatePlaylistsUI(); // Actualizar la UI
    checkAndEnablePlayButton(); // Habilitar botón Play si corresponde
}
// --- NUEVA: Función para añadir a una Playlist ESPECÍFICA ---
function addVideoToSpecificPlaylist(videoData, targetPlaylistId) {
    const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);
    if (!targetPlaylist) {
        console.error(`Error: Playlist destino ${targetPlaylistId} no encontrada.`);
        mostrarMensajeFlotante("Error: No se encontró la playlist destino.");
        return;
    }

    // Verificar duplicados en la playlist destino
    const isDuplicate = targetPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante(`"${videoData.title}" ya está en "${targetPlaylist.name}".`);
        return;
    }

    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: videoData.duration || 0,
    };

    // --- Lógica de Inserción: "Debajo del video que se está reproduciendo" ---
    let targetIndex = targetPlaylist.videos.length; // Por defecto, añadir al final

    if (currentPlayingInfo.playlistId === targetPlaylistId && currentPlayingInfo.flattenedIndex >= 0) {
        // Si el video actual está en la playlist destino
        const currentVideoLocalIndex = targetPlaylist.videos.findIndex(v => v.videoId === currentPlayingInfo.videoId);
        if (currentVideoLocalIndex !== -1) {
            targetIndex = currentVideoLocalIndex + 1; // Insertar justo después
            console.log(`Insertando después del video actual (índice local ${currentVideoLocalIndex}) en ${targetPlaylistId}. Nuevo índice: ${targetIndex}`);
        } else {
             console.log(`Video actual (${currentPlayingInfo.videoId}) no encontrado localmente en ${targetPlaylistId}, añadiendo al final.`);
        }
    } else {
        // Si no hay nada sonando, o está en otra playlist, añadir al final
        console.log(`Video actual no está en ${targetPlaylistId} (o nada suena), añadiendo al final.`);
         targetIndex = targetPlaylist.videos.length;
    }

    // Insertar el video en el array
    targetPlaylist.videos.splice(targetIndex, 0, videoObject);
    mostrarMensajeFlotante(`Video añadido a "${targetPlaylist.name}": ${videoObject.title}`);
    console.log(`Video ${videoObject.videoId} añadido a playlist '${targetPlaylistId}' en índice ${targetIndex}.`);

    updatePlaylistsUI(); // Actualizar UI
    updateCurrentPlayingIndex(); // Recalcular índice aplanado
    checkAndEnablePlayButton(); // Habilitar botón Play si corresponde
}
// --- NUEVA: Función auxiliar para habilitar botón Play ---
function checkAndEnablePlayButton() {
     const flatList = getFlattenedPlaylist();
     if (flatList.length > 0 && playersInitialized) {
         botonPlay.disabled = false;
     }
}
// --- Scroll Infinito ---
const handleScroll = () => {
    if (isLoadingMore || !nextPageContext || !currentSearchQuery) {
        return;
    }
    const scrollThreshold = 300; // Píxeles antes del final para empezar a cargar
    const bottomReached = resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - scrollThreshold;
    if (bottomReached) {
        console.log("Scroll cerca del final, intentando cargar más...");
        performSearch(currentSearchQuery, nextPageContext);
    }
};
resultsContainer.addEventListener('scroll', handleScroll);

// --- Funciones Spinner "Cargar Más" ---
function showLoadMoreSpinner() {
    let spinner = document.getElementById('loadMoreSpinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loadMoreSpinner';
        spinner.className = 'loading-spinner-small';
        resultsContainer.appendChild(spinner); // Añadir al contenedor scrollable
    }
    spinner.style.display = 'flex';
}
function hideLoadMoreSpinner() {
    const spinner = document.getElementById('loadMoreSpinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}

// Módulo: Manejo de Playlists (Nueva Lógica con Pestañas)

// --- Función para obtener la lista aplanada para reproducción ---
function getFlattenedPlaylist() {
    let flatList = [];
    playlistsData.forEach(playlist => {
        // ¡IMPORTANTE! Aplanar todos los videos, independientemente de si la pestaña está expandida o no,
        // para mantener un orden de reproducción consistente.
        playlist.videos.forEach(video => {
            flatList.push({ ...video, sourcePlaylistId: playlist.id });
        });
    });
    return flatList;
}

// --- Actualizar índice basado en video actual ---
function updateCurrentPlayingIndex() {
    const flatList = getFlattenedPlaylist();
    let playingVideoId = null;
    let activePlayerNum = null;

    // Determinar qué player está sonando
     try {
         if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) {
             playingVideoId = player1.getVideoData()?.video_id;
             activePlayerNum = 1;
         } else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) {
             playingVideoId = player2.getVideoData()?.video_id;
             activePlayerNum = 2;
         }
     } catch (e) {
         console.error("Error getting playing video data:", e);
         // Mantener índice previo si hay error?
     }
    
    if (playingVideoId) {
        // Solo actualizar si el video que suena ha cambiado o el índice es inválido
         if (currentPlayingInfo.videoId !== playingVideoId || currentPlayingInfo.flattenedIndex < 0) {
             const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
             if (newFlatIndex !== -1) {
                  const currentVideoObject = flatList[newFlatIndex];
                  currentPlayingInfo.videoId = playingVideoId;
                  currentPlayingInfo.playlistId = currentVideoObject.sourcePlaylistId;
                  currentPlayingInfo.flattenedIndex = newFlatIndex;
                  console.log(`Índice aplanado actualizado a: ${newFlatIndex} (Video: ${playingVideoId})`);
                  // Actualizar UI para reflejar el cambio de resaltado
                  updatePlaylistsUI();
             } else {
                 console.warn(`Video ${playingVideoId} sonando, pero no encontrado en la lista aplanada actualizada.`);
                  // Podríamos buscar por playlistId también si el ID no coincide? O resetear?
                   currentPlayingInfo.flattenedIndex = -1; // Marcar como desconocido
             }
         }
          // Asegurarse que currentPlayer esté sincronizado con el player que realmente suena
          if (activePlayerNum && currentPlayer !== activePlayerNum) {
             console.log(`Sincronizando currentPlayer a ${activePlayerNum}`);
             currentPlayer = activePlayerNum;
          }

    } else {
         // Si nada suena, el índice es -1 (o el último conocido si se pausó?)
         // Por simplicidad, si nada suena activamente, consideramos índice -1
         if (currentPlayingInfo.flattenedIndex !== -1) {
            console.log("Reproducción detenida o sin iniciar, reseteando índice aplanado.");
            currentPlayingInfo.videoId = null;
            currentPlayingInfo.playlistId = null;
            currentPlayingInfo.flattenedIndex = -1;
            // Actualizar UI para quitar resaltado
            updatePlaylistsUI();
         }
    }
}

// --- Manejar carga de Playlist desde URL ---
async function handlePlaylistLoaded(playlistInfo) { // Marcar como async si usa await interno
    console.log('Datos de playlist recibidos:', playlistInfo);

    // --- VALIDACIÓN INICIAL ---
    if (!playlistInfo || !playlistInfo.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
        // Intenta obtener ID incluso si falla para mensaje de error
        const failedPlaylistId = playlistInfo?.id || playlistInfo?.url?.split('list=')[1] || 'desconocida';
        mostrarMensajeFlotante(`No se encontraron videos válidos en la playlist ${failedPlaylistId}.`);
        console.error("Respuesta inválida de getPlaylistInfo:", playlistInfo);
        return;
    }

    const playlistId = playlistInfo.id || playlistInfo.url?.split('list=')[1] || `playlist_${Date.now()}`;

    if (playlistsData.some(p => p.id === playlistId)) {
        mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" ya está cargada.`);
        return;
    }

    const loadedVideos = playlistInfo.relatedStreams.map(video => ({
        videoId: video.url?.split('v=')[1],
        title: video.title || "Título Desconocido",
        thumbnail: video.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: parseDuration(video.duration) || 0,
    })).filter(v => v.videoId); // Filtrar videos sin ID válido

    if (loadedVideos.length === 0) {
        mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" no contiene videos válidos.`);
        return;
    }

    const newPlaylist = {
        id: playlistId,
        name: playlistInfo.name || "Playlist Sin Nombre",
        thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || 'https://via.placeholder.com/50?text=?',
        videos: loadedVideos,
        isExpanded: true
    };

    // --- LÓGICA DE ORDENAMIENTO (CASO 2) ---
    const manualPlaylistIndex = playlistsData.findIndex(p => p.id === 'manual');
    if (manualPlaylistIndex !== -1) {
        // Si existe la playlist 'manual', insertar la nueva DESPUÉS de ella
        playlistsData.splice(manualPlaylistIndex + 1, 0, newPlaylist);
    } else {
        // Si no existe 'manual', añadir al final (o al principio si se prefiere)
        playlistsData.push(newPlaylist);
        console.log(`Playlist '${newPlaylist.name}' añadida al final.`);
    }
    // --- FIN LÓGICA ORDENAMIENTO ---
    mostrarMensajeFlotante(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos).`);
    updatePlaylistsUI();
    checkAndEnablePlayButton();
}

// --- Renderizar/Actualizar UI de Playlists con Pestañas ---
function updatePlaylistsUI() {
    const playlistContainer = document.getElementById('playlistContainer');
    if (!playlistContainer) return;
    const currentScrollTop = playlistContainer.scrollTop; // Guardar posición scroll
    playlistContainer.innerHTML = ''; // Limpiar contenedor principal

    // Obtener info del video sonando para resaltarlo
     const playingVideoId = currentPlayingInfo.videoId;

    if (playlistsData.length === 0) {
         // Opcional: Mostrar mensaje si no hay playlists
         playlistContainer.innerHTML = '<p style="padding: 10px; color: #888; text-align: center;">Añade playlists o videos.</p>';
         return;
    }

    playlistsData.forEach((playlist) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = `playlist-group ${playlist.isExpanded ? 'expanded' : ''}`;
        groupDiv.dataset.playlistId = playlist.id;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'playlist-group-header';
        headerDiv.innerHTML = `
            <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" class="playlist-group-thumb" loading="lazy">
            <span class="playlist-group-name">${playlist.name} (${playlist.videos.length})</span>
            <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} expand-icon"></i>
        `;
        headerDiv.addEventListener('click', () => togglePlaylistExpansion(playlist.id));
        groupDiv.appendChild(headerDiv);

        const videosDiv = document.createElement('div');
        videosDiv.className = 'playlist-group-videos';
        // Aplicar max-height inicial para animación CSS (el CSS debe ocultarlo si no tiene 'expanded')
         if (playlist.isExpanded) {
              // Calcular altura después de añadir items, o poner un valor grande inicial
              // videosDiv.style.maxHeight = '1000px'; // Temporal
         } else {
              videosDiv.style.maxHeight = '0px';
         }
        playlist.videos.forEach((video) => {
            // Usar función helper para crear cada item
            const item = createPlaylistItemElement(video, playlist.id, playingVideoId);
            videosDiv.appendChild(item);
        });

        groupDiv.appendChild(videosDiv);
        playlistContainer.appendChild(groupDiv);

         // Ajustar max-height después de añadir contenido si está expandido (para animación)
         if (playlist.isExpanded) {
             // Pequeño delay para asegurar que los elementos estén en el DOM
             // requestAnimationFrame(() => { // O setTimeout(..., 0)
                videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
             // });
         }
    });

    playlistContainer.scrollTop = currentScrollTop; // Restaurar posición scroll

    // Volver a habilitar Drag and Drop (Fase 1 - dentro de la misma lista)
    enableDragAndDrop();
}

// --- Helper para crear elemento de Video en Playlist ---
function createPlaylistItemElement(video, playlistId, playingVideoId) {
    // Crear el contenedor principal para el item de la playlist
    const item = document.createElement('div');
    item.className = 'playlist-item';
    item.draggable = true; // Permitir arrastrar para drag and drop
    item.dataset.videoId = video.videoId; // Almacenar ID del video en el dataset
    item.dataset.playlistId = playlistId; // Almacenar ID de la playlist en el dataset

    // Contenedor para la imagen (thumbnail)
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    const img = document.createElement('img');
    img.src = video.thumbnail; // URL del thumbnail
    img.alt = video.title; // Texto alternativo para accesibilidad
    img.className = 'drag-handle'; // Clase para usar como manejador de arrastre
    img.loading = 'lazy'; // Carga perezosa para optimización
    imageContainer.appendChild(img);

    // Resaltar si el video está sonando actualmente
    if (video.videoId === playingVideoId) {
        item.classList.add('playing'); // Agregar clase 'playing' al item
        const icon = document.createElement('i'); // Icono de volumen/sonando
        icon.className = 'fa-solid fa-volume-high playing-icon';
        imageContainer.appendChild(icon);
    }
    item.appendChild(imageContainer); // Añadir contenedor de imagen al item principal

    // Contenedor para el texto (título y duración)
    const textContainer = document.createElement('div');
    // Usar innerHTML para agregar fácilmente múltiples párrafos con estilos inline básicos
    textContainer.innerHTML = `
        <p style="margin: 0; font-size: 12px; font-weight: bold;" title="${video.title}">${video.title}</p>
        <p style="margin: 0; font-size: 10px; color: #999;">Duración: ${formatDuration(video.duration)}</p>
    `;
    item.appendChild(textContainer); // Añadir contenedor de texto al item principal

    // --- Estructura del Menú Contextual (los 3 puntos) ---
    const deleteMenu = document.createElement('div'); // Contenedor para el botón y el contenido del menú
    deleteMenu.className = 'delete-menu';
    const menuButton = document.createElement('button'); // El botón de 3 puntos que abre/cierra el menú
    menuButton.className = 'delete-menu-button';
    menuButton.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    const menuContent = document.createElement('div'); // Contenedor principal del contenido del menú (las opciones: Eliminar, Mover, etc.)
    menuContent.className = 'delete-menu-content'; // Asegúrate de que tu CSS oculte esto por defecto (display: none;)

    // --- Botones del Menú ---

    // 1. Botón "Eliminar"
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button-item'; // Clase para estilizar los items del menú
    deleteButton.title = 'Eliminar de esta playlist';
    deleteButton.innerHTML = '<i class="fa-solid fa-xmark"></i> Eliminar';
    menuContent.appendChild(deleteButton); // Añadir botón Eliminar al contenido del menú

    // 2. Botón "Reproducir Después"
    const playNextButton = document.createElement('button');
    playNextButton.className = 'play-next-button'; // Clase para estilizar
    playNextButton.title = 'Poner después del video actual';
    playNextButton.innerHTML = '<i class="fa-solid fa-arrow-right-to-line"></i> Reproducir Despues';
    menuContent.appendChild(playNextButton); // Añadir botón Reproducir Después al contenido del menú

    // 3. Botón "Mover a otra playlist" (Este disparará el popup genérico)
    const moveToPlaylistButton = document.createElement('button');
    moveToPlaylistButton.className = 'move-to-playlist-button'; // Clase para estilizar
    moveToPlaylistButton.title = 'Mover este video a otra playlist';
    moveToPlaylistButton.innerHTML = '<i class="fa-solid fa-folder-tree"></i> Mover a playlist';
    menuContent.appendChild(moveToPlaylistButton); // Añadir botón Mover a playlist al contenido del menú


    // --- Añadir el botón del menú y el contenido del menú al contenedor deleteMenu ---
    deleteMenu.appendChild(menuButton);
    deleteMenu.appendChild(menuContent);
    // Añadir el contenedor deleteMenu (que contiene el botón y el menú desplegable) al item principal
    item.appendChild(deleteMenu);

    // --- Listeners de Eventos ---

    // --- Listener para el botón de 3 puntos (menuButton) ---
    // Este listener controla la visibilidad del contenido del menú (menuContent)
    menuButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Detener la propagación para que el click no cierre inmediatamente el menú via el listener global

        // Cerrar cualquier otro menú contextual abierto antes de abrir este
        // Asegúrate de que tu función closeAllContextMenus() cierre todos los elementos con la clase .delete-menu-content
        closeAllContextMenus();

        // Alternar la visualización del contenido de este menú específico
        // Verificar el estilo de visualización actual o si tiene la clase 'visible'
        if (menuContent.style.display === 'block' || menuContent.classList.contains('visible')) {
            // Si está visible, ocultarlo
            menuContent.style.display = 'none';
            menuContent.classList.remove('visible'); // Eliminar clase si la usas para estilizar
        } else {
            // Si está oculto, mostrarlo
            menuContent.style.display = 'block';
            // Opcional: Posicionar el menú relativo al botón si tu CSS no lo hace (ajustar valores si es necesario)
            // menuContent.style.position = 'absolute'; // Si el contenedor padre (deleteMenu) tiene relative/absolute
            // menuContent.style.top = `${menuButton.offsetHeight}px`; // Posicionar justo debajo del botón
            // menuContent.style.left = '0'; // Alinear a la izquierda del botón

            menuContent.classList.add('visible'); // Agregar clase si la usas para estilizar
        }
    });
    // --- Listener para el botón "Eliminar" (sin cambios en lógica interna) ---
    deleteButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Evitar que el click dentro del menú cierre el menú globalmente
        deleteVideo(playlistId, video.videoId); // Llamar a tu función para eliminar el video
        closeAllContextMenus(); // Cerrar el menú después de realizar la acción
    });

    // --- Listener para el botón "Reproducir Despues" (lógica de mover/insertar) ---
    playNextButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Evitar que el click dentro del menú cierre el menú globalmente
        console.log("Click en 'Reproducir Despues'");
        closeAllContextMenus(); // Cerrar el menú

        const sourceVideoId = video.videoId; // ID del video a mover
        const sourcePlaylistId = playlistId; // ID de la playlist de origen

        // --- Lógica para calcular la posición de "Reproducir Después" ---
        let targetFlatIndex;
        // Si no hay nada sonando (-1), ponerlo al inicio o después del primero si ya hay algo
        if (currentPlayingInfo.flattenedIndex < 0) {
             // Si el video a reproducir después es el primero de su propia playlist y no hay nada sonando, ponerlo en el índice aplanado 0.
             // Si no, ponerlo en el índice aplanado 0 (será el primero).
             const sourcePlaylist = playlistsData.find(p => p.id === sourcePlaylistId);
             const sourceIndexInOwn = sourcePlaylist ? sourcePlaylist.videos.findIndex(v => v.videoId === sourceVideoId) : -1;

             // Si es el primer video de su playlist O la playlist de origen es la manual (donde se añaden nuevos)
             if (sourceIndexInOwn === 0 || sourcePlaylistId === 'manual') {
                  targetFlatIndex = 0; // Ponerlo al principio absoluto
             } else {
                  targetFlatIndex = 0; // Si no es el primer video de su playlist, ponerlo al principio absoluto también
             }
            console.log(`Nada sonando, moviendo ${sourceVideoId} a índice aplanado ${targetFlatIndex}`);
        } else {
             // Si ya hay algo sonando, ponerlo justo después del video actual
             targetFlatIndex = currentPlayingInfo.flattenedIndex + 1;
             console.log(`Sonando ${currentPlayingInfo.videoId}, moviendo ${sourceVideoId} a índice aplanado ${targetFlatIndex} (después del actual).`);
        }
        // Asegurarse de que el índice aplanado destino no exceda el tamaño total de la lista
        const flatList = getFlattenedPlaylist();
        targetFlatIndex = Math.max(0, Math.min(targetFlatIndex, flatList.length)); // Permite añadir al final (índice == length)


        // --- Lógica para encontrar la playlist destino y el índice local a partir del índice aplanado ---
        let cumulativeIndex = 0;
        let targetLocalIndex = -1; // Índice dentro de la playlist destino
        let targetPlaylistId = null; // ID de la playlist destino

        for (const p of playlistsData) {
            const playlistVideoCount = p.videos.length;
            const endOfPlaylistIndex = cumulativeIndex + playlistVideoCount;

            // Si el índice aplanado destino cae dentro de esta playlist O
            // si el índice aplanado destino es justo al final de esta playlist Y es la última playlist,
            // significa que el video debe insertarse aquí.
            if (targetFlatIndex < endOfPlaylistIndex || (targetFlatIndex === endOfPlaylistIndex && p === playlistsData[playlistsData.length -1]) ) {
                targetPlaylistId = p.id;
                targetLocalIndex = targetFlatIndex - cumulativeIndex; // El índice local es la diferencia

                // Asegurarse de que el índice local no exceda el tamaño actual de la playlist (para añadir al final)
                targetLocalIndex = Math.min(targetLocalIndex, p.videos.length);

                break; // Encontramos la playlist destino, salimos del bucle
            }
            cumulativeIndex += playlistVideoCount; // Sumar el tamaño de la playlist actual
        }

        // Ejecutar la función de movimiento si se encontró una playlist y un índice destino válidos
        if (targetPlaylistId !== null && targetLocalIndex !== -1) {
             // Asegurarse de que no estamos intentando moverlo a la misma posición de donde viene
             const sourcePlaylist = playlistsData.find(p => p.id === sourcePlaylistId);
             const sourceLocalIndex = sourcePlaylist ? sourcePlaylist.videos.findIndex(v => v.videoId === sourceVideoId) : -1;

             if (!(sourcePlaylistId === targetPlaylistId && sourceLocalIndex === targetLocalIndex)) {
                console.log(`Moviendo ${sourceVideoId} (de ${sourcePlaylistId}) a Playlist ${targetPlaylistId} en índice local ${targetLocalIndex} para 'Reproducir Después'`);
                moveVideo(sourceVideoId, sourcePlaylistId, targetPlaylistId, targetLocalIndex); // Llamar a la función general de mover
             } else {
                  console.log(`Video ${sourceVideoId} ya está en la posición de 'Reproducir Después', no se mueve.`);
             }
        } else {
            console.error("createPlaylistItemElement: No se pudo determinar la playlist/índice destino para 'Reproducir Despues'.");
            mostrarMensajeFlotante("Error al calcular la posición para 'Reproducir Después'.");
        }
    });
    // --- Listener para el botón "Mover a playlist" (MODIFICADO) ---
    // Este listener dispara la nueva función genérica de popup de selección de playlist.
    // Ya lo modificaste en un paso anterior, solo asegúrate de que este es el código que tienes.
    moveToPlaylistButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Detener la propagación del evento de click
        console.log("Click en 'Mover a playlist'");

        // Define los datos del video y el ID de la playlist de origen necesarios para la acción de mover
        const sourceVideoId = video.videoId; // Obtener ID del video del objeto 'video' pasado a la función
        const sourcePlaylistId = playlistId; // Obtener ID de la playlist del parámetro 'playlistId'

        // Crear un objeto videoData simplificado necesario por el manejador del popup genérico
        // La función moveVideo eventualmente solo necesita el videoId, pero pasar más contexto puede ser útil.
        const videoDataForMove = {
            videoId: sourceVideoId,
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration,
        };

        // Llamar a la nueva función genérica que muestra el popup de selección de playlist con:
        // - El botón del menú (el de 3 puntos) como elemento de anclaje para el posicionamiento
        // - Los datos del video que se está moviendo
        // - El tipo de acción 'move'
        // - El sourcePlaylistId desde el cual se está moviendo el video
        showPlaylistSelectionPopup(menuButton, // Anclaje al elemento del botón de 3 puntos
                                     videoDataForMove,
                                     'move', // Indicar que la acción es 'mover'
                                     sourcePlaylistId); // Pasar el ID de la playlist de origen
    });
    // Devolver el elemento item completo que fue creado
    return item;
}
// --- NEW: Generic Playlist Selection Popup ---
// Handles both "Add to Playlist" and "Move to Playlist"
function showPlaylistSelectionPopup(anchorElement, videoData, actionType, sourcePlaylistId = null) {
    // Close any other open popups of this type
    closePlaylistSelectionPopups();
    // Also close the main context menus (3 dots menu) to avoid overlap
    closeAllContextMenus();

    const menu = document.createElement('div');
    // Use a specific class for this popup type, reuse styling from add-to-playlist-menu
    menu.className = 'playlist-selection-popup-menu add-to-playlist-menu';

    let availablePlaylists = playlistsData; // Start with all playlists
    let popupTitleText = '';
    let itemClickHandler = null;

    if (actionType === 'add') {
        // Logic for adding from search results
        popupTitleText = "Add video to:";
        // No filtering needed, allow adding to any playlist including manual
        // The addVideoToSpecificPlaylist function handles duplicate checks.
        availablePlaylists = playlistsData;

        itemClickHandler = (event) => {
            event.stopPropagation(); // Prevent event from bubbling further
            const targetPId = event.currentTarget.dataset.targetPlaylistId;
            console.log(`Adding ${videoData.videoId} to playlist ${targetPId}`);
            // Call the function that handles adding to a specific playlist
            addVideoToSpecificPlaylist(videoData, targetPId);
            // Close the popup after an item is clicked
            closePlaylistSelectionPopups();
        };

    } else if (actionType === 'move') {
        // Logic for moving from within a playlist
        popupTitleText = "Move video to:";
        // Filter out the source playlist itself, as you can't move a video to the playlist it's already in via this menu.
        availablePlaylists = playlistsData.filter(p => p.id !== sourcePlaylistId);

        // If there are no other playlists to move to, show a message and don't show the popup.
        if (availablePlaylists.length === 0) {
            mostrarMensajeFlotante("No other playlists to move to.");
            return;
        }

        itemClickHandler = (event) => {
            event.stopPropagation(); // Prevent event from bubbling further
            const targetPId = event.currentTarget.dataset.targetPlaylistId;
            console.log(`Moving ${videoData.videoId} from ${sourcePlaylistId} to ${targetPId}`);
            // When moving via this menu, insert at the start of the target list (index 0)
            const targetInsertionIndex = 0;
            // Use the general moveVideo function which handles source and target playlists
            moveVideo(videoData.videoId, sourcePlaylistId, targetPId, targetInsertionIndex);
            // Close the popup after an item is clicked
            closePlaylistSelectionPopups();
        };
    } else {
        // Handle case where actionType is invalid
        console.error("showPlaylistSelectionPopup: Invalid actionType:", actionType);
        return;
    }

     // Create the title element for the popup
    const title = document.createElement('div');
    title.textContent = popupTitleText;
    // Use styling from both move and add titles for flexibility
    title.className = 'playlist-selection-popup-title move-to-playlist-popup-title add-to-playlist-popup-title';
    menu.appendChild(title);

    // Create buttons for each available playlist
    availablePlaylists.forEach(playlist => {
        const item = document.createElement('button');
        // Use styling from previous item types
        item.className = 'playlist-selection-popup-item add-to-playlist-menu-item';
        item.dataset.targetPlaylistId = playlist.id; // Store the target playlist ID on the button

        // Add thumbnail and name to the button
        item.innerHTML = `
            <img src="${playlist.thumbnailUrl || 'https://via.placeholder.com/50?text=?'}"" alt="" loading="lazy">
            <span>${playlist.name}</span>
        `;
        item.title = `${popupTitleText} "${playlist.name}"`; // Dynamic button title attribute

        // Add the previously defined click handler
        item.addEventListener('click', itemClickHandler);
        menu.appendChild(item);
    });

    // --- Positioning Logic ---
    // Append the menu to the body to avoid overflow issues within smaller containers
    document.body.appendChild(menu);
    // Get the position of the element that triggered the popup (e.g., the '+' or '...' button)
    const anchorRect = anchorElement.getBoundingClientRect();

    // Calculate initial position (e.g., aligned to the left/bottom of the anchor element)
    let top = window.scrollY + anchorRect.bottom + 2; // 2px padding below anchor
    let left = window.scrollX + anchorRect.left;

    menu.style.position = 'absolute';
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    // Set a minimum width based on the anchor element, plus some padding
    menu.style.minWidth = `${anchorRect.width + 50}px`;
    menu.style.zIndex = '1000'; // Ensure it's above other content

    // --- Adjust Position to fit on screen ---
    // Use requestAnimationFrame to ensure the menu is in the DOM and has dimensions before calculating adjustments
    requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect();

        // Adjust horizontally if it goes off the right edge
        if (menuRect.right > window.innerWidth - 10) { // 10px margin from the right edge
            // Align the right edge of the menu with the right edge of the anchor (or near it)
            left = window.scrollX + anchorRect.right - menuRect.width;
            // Ensure it doesn't go off the left edge after adjusting
            menu.style.left = `${Math.max(10, left)}px`;
        }
        // Adjust horizontally if it goes off the left edge (less common if aligning left, but good practice)
        if (menuRect.left < 10) {
            menu.style.left = '10px';
        }

        // Adjust vertically if it goes off the bottom edge
        if (menuRect.bottom > window.innerHeight - 10) { // 10px margin from the bottom edge
            // Position the menu above the anchor element
            top = window.scrollY + anchorRect.top - menuRect.height - 2; // 2px padding above anchor
            // Ensure it doesn't go off the top edge after adjusting
             menu.style.top = `${Math.max(10, top)}px`;
        }
         // Adjust vertically if it goes off the top edge (less common)
         if (menuRect.top < 10) {
            menu.style.top = '10px';
        }
    });


    // --- Add listener to close if clicked outside ---
    // Use a small timeout to prevent the click that opened the menu from immediately closing it
    setTimeout(() => {
         // Add a one-time event listener on the document during the capture phase
         // The capture phase ensures the click is intercepted before it reaches elements inside the menu.
         document.addEventListener('click', closePlaylistSelectionPopups, { once: true, capture: true });
         // Stop propagation of clicks *inside* the menu itself to prevent the document listener from triggering
         menu.addEventListener('click', e => e.stopPropagation());
    }, 10); // 10ms delay should be sufficient

}

// --- NEW: Generic function to close playlist selection popups ---
// Finds all elements with the class 'playlist-selection-popup-menu' and removes them from the DOM.
function closePlaylistSelectionPopups() {
    document.querySelectorAll('.playlist-selection-popup-menu').forEach(menu => menu.remove());
}
// --- NUEVA: Función para cerrar TODOS los menús contextuales (3 puntos) ---
function closeAllContextMenus() {
     document.querySelectorAll('#playlistContainer .delete-menu-content').forEach(menu => {
          menu.style.display = 'none';
     });
}
// --- Función para alternar expansión/colapso ---
function togglePlaylistExpansion(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    // Alternar el estado
    playlist.isExpanded = !playlist.isExpanded;

    const groupDiv = document.querySelector(`.playlist-group[data-playlist-id="${playlistId}"]`);
    const videosDiv = groupDiv?.querySelector('.playlist-group-videos');
    const icon = groupDiv?.querySelector('.expand-icon');

    if (groupDiv && videosDiv && icon) {
        // Actualizar clases para icono y estado general
        groupDiv.classList.toggle('expanded', playlist.isExpanded);
        icon.classList.toggle('fa-chevron-up', playlist.isExpanded);
        icon.classList.toggle('fa-chevron-down', !playlist.isExpanded);

        // Detener transiciones pendientes en este elemento para evitar conflictos
        videosDiv.removeEventListener('transitionend', handleTransitionEnd); // Quitar listener anterior si existe

        if (playlist.isExpanded) {
            // 1. (CSS ya NO debería tener display: none) Asegurar que sea visible para medir
            videosDiv.style.display = 'block'; // O 'flex', 'grid' si usas eso internamente
            videosDiv.style.maxHeight = '0px'; // Asegurar que parte de 0

            // 2. Calcular altura necesaria
            const scrollHeight = videosDiv.scrollHeight;

            // 3. Aplicar altura para iniciar animación
            requestAnimationFrame(() => { // Esperar al siguiente frame
                videosDiv.style.maxHeight = scrollHeight + 'px';
            });

            // 4. Opcional: Remover max-height explícito después de la animación para altura natural
            videosDiv.addEventListener('transitionend', handleTransitionEnd, { once: true });

        } else {
            // --- COLAPSAR ---
            // 1. Establecer max-height a su altura actual ANTES de animar a 0
            videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';

            // 2. Forzar reflow para que la transición se aplique desde la altura actual
            requestAnimationFrame(() => {
                 // 3. Animar a max-height 0
                 videosDiv.style.maxHeight = '0px';
            });

            // 4. Opcional: Poner display: none DESPUÉS de que termine la animación
             videosDiv.addEventListener('transitionend', handleTransitionEnd, { once: true });
        }
    } else {
        // Fallback si no se encuentran los elementos: re-renderizar todo
        console.warn("Elementos no encontrados para toggle, re-renderizando UI completa.");
        updatePlaylistsUI();
    }
}

// --- Función manejadora para el final de la transición ---
function handleTransitionEnd(event) {
    // Asegurarse que la transición completada sea de 'max-height'
    if (event.propertyName !== 'max-height') {
        return;
    }

    const videosDiv = event.target;
    const groupDiv = videosDiv.closest('.playlist-group');
    const playlistId = groupDiv?.dataset.playlistId;
    const playlist = playlistsData.find(p => p.id === playlistId);

    if (playlist && videosDiv) {
        if (playlist.isExpanded) {
            // Si terminó de expandirse, quitar max-height para que la altura sea automática
            videosDiv.style.maxHeight = 'none';
            // console.log(`Playlist ${playlistId} expandida, max-height: none`);
        } else {
            // Si terminó de colapsarse, ahora sí podemos ocultarlo con display si queremos
            // videosDiv.style.display = 'none'; // Opcional, max-height 0 ya lo oculta visualmente
            // console.log(`Playlist ${playlistId} colapsada, max-height: 0`);
        }
    }
}

// --- Eliminar Video ---
function deleteVideo(playlistId, videoId) {
    const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
    if (playlistIndex === -1) return;

    const videoIndex = playlistsData[playlistIndex].videos.findIndex(v => v.videoId === videoId);
    if (videoIndex === -1) return;

    const deletedVideoTitle = playlistsData[playlistIndex].videos[videoIndex].title;
    playlistsData[playlistIndex].videos.splice(videoIndex, 1); // Eliminar del array

    mostrarMensajeFlotante(`Video "${deletedVideoTitle}" eliminado.`);
    console.log(`Eliminando video: ${deletedVideoTitle} de playlist ${playlistId}`);

    // Opcional: Eliminar playlist si queda vacía (excepto la manual)
    if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
         mostrarMensajeFlotante(`Playlist "${playlistsData[playlistIndex].name}" eliminada (vacía).`);
         playlistsData.splice(playlistIndex, 1);
    }

    updatePlaylistsUI(); // Actualizar UI
    updateCurrentPlayingIndex(); // Recalcular índice por si acaso
}

// --- REESCRIBIR COMPLETAMENTE enableDragAndDrop ---
function enableDragAndDrop() {
    const playlistContainer = document.getElementById('playlistContainer');
    if (!playlistContainer) return;

    let draggedItemElement = null; // Elemento DOM que se arrastra
    let draggedVideoData = null;   // Objeto { videoId, sourcePlaylistId }
    let placeholder = null;        // Elemento visual temporal

    // Crear placeholder una vez
    function createPlaceholder() {
        const ph = document.createElement('div');
        ph.className = 'playlist-item placeholder';
        ph.style.height = '40px'; // Altura aprox de un item
        ph.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
        ph.style.border = '1px dashed #007bff';
        ph.style.margin = '4px 0';
        return ph;
    }
    placeholder = createPlaceholder();

    // --- Event Listeners en los ITEMS (.playlist-item) ---
    playlistContainer.querySelectorAll('.playlist-item').forEach(item => {
        // DRAG START: Inicia el arrastre
        item.addEventListener('dragstart', (event) => {
            const targetItem = event.target.closest('.playlist-item');
            if (!targetItem) return;

            draggedItemElement = targetItem;
            draggedVideoData = {
                videoId: targetItem.dataset.videoId,
                sourcePlaylistId: targetItem.dataset.playlistId
            };

            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedVideoData.videoId); // Guardar ID

            // Añadir clase con delay
            setTimeout(() => targetItem.classList.add('dragging'), 0);
            console.log(`Drag Start: Video ${draggedVideoData.videoId} from Playlist ${draggedVideoData.sourcePlaylistId}`);
        });

        // DRAG END: Termina el arrastre (se suelte o se cancele)
        item.addEventListener('dragend', (event) => {
            if (draggedItemElement) {
                draggedItemElement.classList.remove('dragging');
            }
            if(placeholder && placeholder.parentNode) {
                 placeholder.remove(); // Limpiar placeholder
            }
             // Limpiar clases visuales de drop target
            document.querySelectorAll('.drag-over-area').forEach(el => el.classList.remove('drag-over-area'));
            draggedItemElement = null;
            draggedVideoData = null;
        });

         // DRAG OVER: Cuando se arrastra SOBRE otro item
         item.addEventListener('dragover', (event) => {
             event.preventDefault(); // Necesario
             event.dataTransfer.dropEffect = 'move';
             const targetItem = event.target.closest('.playlist-item');
             if (!targetItem || targetItem === draggedItemElement) return; // No sobre sí mismo

             // Insertar placeholder ANTES del item sobre el que estamos
              const targetRect = targetItem.getBoundingClientRect();
              const offsetY = event.clientY - targetRect.top;
              // Decidir si insertar antes o después basado en la mitad del item
              if (offsetY < targetRect.height / 2) {
                   targetItem.parentNode.insertBefore(placeholder, targetItem);
              } else {
                   targetItem.parentNode.insertBefore(placeholder, targetItem.nextSibling);
              }
        });
        // DROP: Cuando se SUELTA sobre otro item
        item.addEventListener('drop', (event) => {
            event.preventDefault();
             if (placeholder && placeholder.parentNode) {
                 placeholder.remove();
             }
            const targetItem = event.target.closest('.playlist-item');
            if (!targetItem || !draggedVideoData || targetItem === draggedItemElement) {
                console.log("Drop sobre item inválido o sobre sí mismo.");
                return;
            }

            const targetPlaylistId = targetItem.dataset.playlistId;
            const droppedVideoId = event.dataTransfer.getData('text/plain'); // Debería coincidir con draggedVideoData.videoId

             // Calcular índice destino basado en la posición donde estaba el placeholder
             const videoElements = Array.from(targetItem.parentNode.children).filter(el => el !== placeholder && !el.classList.contains('dragging'));
             // El índice será la posición del targetItem en la lista filtrada
             let targetIndex = videoElements.indexOf(targetItem);

            // Si el placeholder estaba DESPUÉS del targetItem, el índice es +1
             // (Esto es más complejo, usar la posición del placeholder es mejor)
             // O más simple: obtener el índice del targetItem real y decidir antes/después
              const targetRect = targetItem.getBoundingClientRect();
              const offsetY = event.clientY - targetRect.top;
              if (offsetY >= targetRect.height / 2) {
                   targetIndex++; // Insertar después
              }

            console.log(`Drop: Video ${droppedVideoId} (from ${draggedVideoData.sourcePlaylistId}) sobre item ${targetItem.dataset.videoId} (Playlist ${targetPlaylistId}, índice ${targetIndex})`);

            // Llamar a la función unificada para mover
            moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
        });
    });

    // --- Event Listeners en los CONTENEDORES de Videos (.playlist-group-videos) ---
    playlistContainer.querySelectorAll('.playlist-group-videos').forEach(container => {

        // DRAG OVER: Arrastrando sobre el área del contenedor (para añadir al final)
        container.addEventListener('dragover', (event) => {
             event.preventDefault();
             event.dataTransfer.dropEffect = 'move';
             // Añadir indicador visual solo si no hay items hijos (o si estamos al final?)
             if (container.children.length === 0 || event.offsetY > container.scrollHeight - 20) {
                 container.classList.add('drag-over-area');
                  // Añadir placeholder al final si no está ya ahí
                  if (!placeholder.parentNode || placeholder.nextSibling) {
                     container.appendChild(placeholder);
                  }
             } else {
                 container.classList.remove('drag-over-area');
                 // El dragover sobre un item manejará el placeholder
             }
        });

         // DRAG LEAVE: Saliendo del área del contenedor
         container.addEventListener('dragleave', (event) => {
              // Quitar indicador si salimos del área Y no entramos en un hijo
             if (!container.contains(event.relatedTarget)) {
                  container.classList.remove('drag-over-area');
                   if(placeholder.parentNode === container) placeholder.remove();
             }
         });

        // DROP: Soltando sobre el área del contenedor (generalmente para añadir al final)
        container.addEventListener('drop', (event) => {
            event.preventDefault();
             if (placeholder && placeholder.parentNode) {
                 placeholder.remove();
             }
             container.classList.remove('drag-over-area');
            const groupDiv = event.target.closest('.playlist-group');
            if (!groupDiv || !draggedVideoData) return;

            const targetPlaylistId = groupDiv.dataset.playlistId;
            const droppedVideoId = event.dataTransfer.getData('text/plain');

            // Mover al final de esta playlist
             const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);
             const targetIndex = targetPlaylist ? targetPlaylist.videos.length : 0; // Índice final

            console.log(`Drop: Video ${droppedVideoId} (from ${draggedVideoData.sourcePlaylistId}) al final de Playlist ${targetPlaylistId}`);
            moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
        });
    });
}
// --- Función Unificada para Mover Videos (dentro y entre playlists) ---
function moveVideo(videoId, sourcePlaylistId, targetPlaylistId, targetIndex) {
    if (!videoId || !sourcePlaylistId || !targetPlaylistId) {
        console.error("moveVideo: Argumentos inválidos.");
        return;
    }

    // Encontrar playlist origen
    const sourcePlaylistIndex = playlistsData.findIndex(p => p.id === sourcePlaylistId);
    if (sourcePlaylistIndex === -1) {
        console.error(`moveVideo: Playlist origen ${sourcePlaylistId} no encontrada.`);
        return;
    }
    const sourcePlaylist = playlistsData[sourcePlaylistIndex];

    // Encontrar video en playlist origen
    const videoIndexInSource = sourcePlaylist.videos.findIndex(v => v.videoId === videoId);
    if (videoIndexInSource === -1) {
        console.error(`moveVideo: Video ${videoId} no encontrado en playlist origen ${sourcePlaylistId}.`);
        return;
    }

    // Encontrar playlist destino
    const targetPlaylistIndex = playlistsData.findIndex(p => p.id === targetPlaylistId);
    if (targetPlaylistIndex === -1) {
        console.error(`moveVideo: Playlist destino ${targetPlaylistId} no encontrada.`);
        return;
    }
    const targetPlaylist = playlistsData[targetPlaylistIndex];

    // --- Lógica de Movimiento ---
    // 1. Quitar el video de la playlist origen
    const [movedVideoData] = sourcePlaylist.videos.splice(videoIndexInSource, 1);

    // 2. Asegurar que targetIndex esté dentro de los límites de la playlist destino
    targetIndex = Math.max(0, Math.min(targetIndex, targetPlaylist.videos.length));

    // 3. Insertar el video en la playlist destino en el índice correcto
    targetPlaylist.videos.splice(targetIndex, 0, movedVideoData);

    console.log(`Video ${videoId} movido de ${sourcePlaylistId} a ${targetPlaylistId} en índice ${targetIndex}.`);

    // 4. Actualizar la UI completa
    updatePlaylistsUI();

    // 5. Recalcular el índice de reproducción aplanado
    // Es crucial llamar a esto DESPUÉS de actualizar playlistsData
    updateCurrentPlayingIndex();
}

// Módulo: Reproducción y Crossfade (Adaptado Parcialmente)
async function playNextVideo() {
    const currentFlatIndex = currentPlayingInfo.flattenedIndex;
    console.log(`playNextVideo [Data]: Llamada. Índice aplanado actual: ${currentFlatIndex}, isTransitioning=${isTransitioning}, isAudioFading=${isAudioFading}, pendingVisualTransition=${pendingVisualTransition.playerNum !== null}`);

    // Protección para evitar iniciar una nueva transición si ya hay una transición visual pendiente o en curso.
    // Usamos pendingVisualTransition.playerNum como el indicador principal de una transición general iniciada.
    if (pendingVisualTransition.playerNum !== null) {
        console.warn("playNextVideo [Data]: Transición general ya en curso (pendingVisualTransition no es null), cancelando nueva llamada.");
        return;
    }

    // A partir de aquí, una nueva transición GENERAL comienza.
    // Establecer isTransitioning a true para indicar que el proceso general de playNextVideo ha iniciado.
    isTransitioning = true;
    console.log(`playNextVideo [Data]: *** Transición PRINCIPAL INICIADA desde índice aplanado ${currentFlatIndex}. Flag isTransitioning=true. ***`);


    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        console.log("playNextVideo [Data]: No hay videos en la lista aplanada.");
        // Manejar el fin de la reproducción si la lista está vacía
        stopMonitoring();
        reproduccionIniciada = false;
        // Asegúrate de que los IDs de botones son correctos en tu HTML si ajustas UI aquí
        // document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        // document.getElementById('botonPlay').disabled = true;
        currentPlayingInfo = { flattenedIndex: -1, videoId: null, playlistId: null };
        updatePlaylistsUI();
        // Resetear flags al salir temprano
        isTransitioning = false;
        isAudioFading = false;
        hasOutroCrossfadeStarted = false;
         // Limpiar estado visual pendiente (ya es null, pero por seguridad)
        pendingVisualTransition = { playerNum: null, outgoingElement: null, incomingElement: null };
        console.log(`playNextVideo [Data]: *** Transición ABORTADA (Sin videos). Flag isTransitioning=false. ***`);
        return;
    }

    // Determinar el índice del siguiente video
    let nextIndex = currentFlatIndex + 1;

    // Si llegamos al final de la lista, preguntar al usuario si desea repetir o detener.
    if (nextIndex >= flatList.length) {
        console.log('playNextVideo [Data]: Fin de la lista aplanada detectado.');
        // askToRepeatPlaylist() debe manejar la UI y flags si es necesario, y posiblemente llamar a playVideoByIndex(0) si se repite.
        askToRepeatPlaylist();
        // Resetear flags al llegar al final de la lista (la transición no continúa a un siguiente video)
        isTransitioning = false;
        isAudioFading = false;
        hasOutroCrossfadeStarted = false;
         // Limpiar estado visual pendiente
        pendingVisualTransition = { playerNum: null, outgoingElement: null, incomingElement: null };
        console.log(`playNextVideo [Data]: *** Transición FINALIZADA (Fin de lista). Flag isTransitioning=false. ***`);
        return;
    }

    // Guardar ID del video saliente para limpieza posterior (en el manejador transitionend/timeout)
    const previousVideoIdForCleanup = currentPlayingInfo.videoId;
    // NOTA: currentPlayingInfo se actualizará más abajo al siguiente video LÓGICO.

    try {
        // Obtener el objeto del siguiente video
        const nextVideo = flatList[nextIndex];
        if (!nextVideo || !nextVideo.videoId) {
             throw new Error(`Video siguiente inválido en el índice aplanado ${nextIndex}.`);
        }
        const nextVideoId = nextVideo.videoId; // ID del video que sonará a continuación

        // Identificar instancias y elementos DOM de los reproductores basándose en el reproductor lógico actual.
        // El reproductor lógico actual (currentPlayer) es el que está sonando AHORA y debe desvanecerse (saliendo).
        // El otro reproductor será el que sonará A CONTINUACIÓN (entrando).
        const currentPlayerLogicalNum = currentPlayer; // El número del reproductor que está sonando lógicamente AHORA
        const previousPlayerInstance = (currentPlayerLogicalNum === 1) ? player1 : player2; // Instancia del reproductor saliente
        const nextPlayerInstance = (currentPlayerLogicalNum === 1) ? player2 : player1;     // Instancia del reproductor entrante
        const nextPlayerLogicalNum = (currentPlayerLogicalNum === 1) ? 2 : 1; // El número lógico del reproductor entrante

        // Obtener los elementos DOM correspondientes para aplicar clases CSS
        const currentPlayerElement = document.getElementById(`player${currentPlayerLogicalNum}`); // Elemento DOM saliente
        const nextPlayerElement = document.getElementById(`player${nextPlayerLogicalNum}`);     // Elemento DOM entrante


        // Validar instancias de reproductores y métodos requeridos para la transición.
        if (!previousPlayerInstance || typeof previousPlayerInstance.setVolume !== 'function' || typeof previousPlayerInstance.getVolume !== 'function' || typeof previousPlayerInstance.stopVideo !== 'function' ||
            !nextPlayerInstance || typeof nextPlayerInstance.cueVideoById !== 'function' || typeof nextPlayerInstance.playVideo !== 'function' || typeof nextPlayerInstance.setVolume !== 'function' || typeof nextPlayerInstance.getPlayerState !== 'function') {
             throw new Error("Instancias de reproductores o funciones de API requeridas faltan para el crossfade.");
        }

        // Validar elementos DOM requeridos.
        if (!currentPlayerElement || !nextPlayerElement) {
             throw new Error("Elementos DOM de reproductores no encontrados para la transición visual.");
        }

        // --- Paso 1: Preparar el siguiente video (cargarlo sin reproducir aún) ---
        // Usamos cueVideoById para cargar el video pero no iniciará la reproducción inmediatamente.
        console.log(`playNextVideo [Data]: Llamando a cueVideoById('${nextVideoId}') en Player ${nextPlayerLogicalNum}.`);
        nextPlayerInstance.cueVideoById(nextVideoId);


        // --- Paso 2: Asegurarse de que el contenedor del siguiente reproductor esté listo para ser visible ---
        // Antes de que se dispare la transición visual (en onPlayerStateChange),
        // el elemento del reproductor entrante debe estar en un estado donde pueda volverse visible.
        // Quitamos la clase 'hidden' y cualquier clase residual de desvanecimiento.
        // La opacidad y el z-index iniciales deben estar definidos en tu CSS para .video-player (opacity: 1, z-index: 1).
        nextPlayerElement.classList.remove('hidden'); // Asegurar que no esté display: none o visibility: hidden
        nextPlayerElement.classList.remove('fade-out', 'fade-in'); // Limpiar clases residuales

        // El elemento saliente debe estar visible y sin clases de desvanecimiento al inicio del proceso.
        // Su desvanecimiento se iniciará cuando el nuevo video esté listo visualmente.
        currentPlayerElement.classList.remove('hidden');
        currentPlayerElement.classList.remove('fade-out', 'fade-in');


        // --- Paso 3: Establecer volúmenes iniciales ANTES de iniciar la reproducción/fundido ---
        // El reproductor saliente debe estar a volumen completo.
        // El reproductor entrante debe estar silenciado (volumen 0).
        try { previousPlayerInstance.setVolume(previousPlayerInstance.getVolume() || 100); console.log(`playNextVideo [Data]: Volumen inicial reproductor previo (saliendo): ${previousPlayerInstance.getVolume()}`); } catch(e) { console.warn("playNextVideo [Data]: Error obteniendo/estableciendo volumen de reproductor previo, por defecto 100:", e); previousPlayerInstance.setVolume(100); }
        try { nextPlayerInstance.setVolume(0); console.log(`playNextVideo [Data]: Volumen inicial reproductor siguiente (entrando): 0`);} catch(e) { console.warn("playNextVideo [Data]: Error estableciendo volumen de reproductor siguiente a 0:", e); }


        // --- Paso 4: Actualizar el estado lógico y la UI inmediatamente ---
        // Esto actualiza currentPlayingInfo al *siguiente* video para el resaltado en la UI,
        // incluso si el video aún no está sonando visualmente.
        currentPlayingInfo = {
             flattenedIndex: nextIndex,
             videoId: nextVideoId,
             playlistId: nextVideo.sourcePlaylistId
        };
        console.log(`playNextVideo [Data]: Estado lógico actualizado a índice ${nextIndex} (Video: ${nextVideoId}).`);
        updatePlaylistsUI(); // Actualizar el resaltado en la UI


        // --- Paso 5: Iniciar la Reproducción del Siguiente Video y Programar el Fundido de Audio ---

         try {
            console.log(`playNextVideo [Data]: Estado de Player ${nextPlayerLogicalNum} ANTES de playVideo(): ${nextPlayerInstance.getPlayerState()}`);
            if (nextPlayerInstance && typeof nextPlayerInstance.playVideo === 'function') {
                 console.log(`playNextVideo [Data]: Llamando a playVideo() en Player ${nextPlayerLogicalNum} para iniciar reproducción para fundido de entrada.`);
                 nextPlayerInstance.playVideo();
                 // La API de YouTube comenzará a cargar y preparar el video y audio, aunque el volumen esté en 0.
                 // onPlayerStateChange debería capturar BUFFERING y luego PLAYING para este reproductor.
            } else {
                 console.warn(`playNextVideo [Data]: Instancia de reproductor siguiente inválida o playVideo falta.`);
                  throw new Error("Fallo al iniciar reproducción en reproductor siguiente.");
            }
             console.log(`playNextVideo [Data]: Estado de Player ${nextPlayerLogicalNum} DESPUÉS de playVideo(): ${nextPlayerInstance.getPlayerState()}`);
         } catch(e) {
             console.error("playNextVideo [Data]: Error llamando a playVideo en reproductor siguiente:", e);
              // Si falla playVideo, resetear flags y estado
              isTransitioning = false; // Resetear el flag general de transición
              isAudioFading = false; // Resetear el flag de fundido de audio
              hasOutroCrossfadeStarted = false; // Resetear flag de outro
               // Limpiar clases visuales que pudieron haberse aplicado por error temprano (aunque no deberían con este código)
               if (currentPlayerElement) currentPlayerElement.classList.remove('fade-out', 'fade-in', 'hidden');
               if (nextPlayerElement) nextPlayerElement.classList.remove('fade-in', 'fade-out', 'hidden');
               // Revertir estado lógico a lo que estaba sonando antes del intento fallido
               const flatListIfAvailable = getFlattenedPlaylist();
               const previousVideo = flatListIfAvailable.length > currentFlatIndex && currentFlatIndex >= 0 ? flatListIfAvailable[currentFlatIndex] : null;
               currentPlayingInfo.flattenedIndex = currentFlatIndex >= 0 ? currentFlatIndex : -1;
               currentPlayingInfo.videoId = previousVideo ? previousVideo.videoId : null;
               currentPlayingInfo.playlistId = previousVideo ? previousVideo.sourcePlaylistId : null;
               updatePlaylistsUI(); // Actualizar UI de vuelta
               mostrarMensajeFlotante(`Error CRÍTICO iniciando video ${nextVideoId}: ${e.message}`);
               // Limpiar estado de transición visual pendiente que pudo haberse preparado
               pendingVisualTransition = { playerNum: null, outgoingElement: null, incomingElement: null };
               // Decide si quieres detener completamente aquí o solo reportar el error
               // stopMonitoring(); reproduccionIniciada = false; // Considerar que la reproducción se detuvo lógicamente
               throw e; // Volver a lanzar para que se capture arriba si es necesario
         }


        // Programar el inicio del Fundido de Audio después de un pequeño retraso.
        // Este retraso da tiempo al reproductor de YouTube para comenzar a cargar/preparar el audio
        // después de la llamada a playVideo() antes de ajustar su volumen.
        const audioFadeStartDelay = 50; // Milisegundos
        console.log(`playNextVideo [Data]: Programando crossfadeAudio en ${audioFadeStartDelay}ms.`);
        // crossfadeAudio gestiona el flag isAudioFading internamente.
        setTimeout(() => {
            console.log(`playNextVideo [Data]: Iniciando crossfadeAudio.`);
             crossfadeAudio(previousPlayerInstance, nextPlayerInstance); // Inicia el fundido de volúmenes
        }, audioFadeStartDelay);


        // --- Paso 6: Preparar el Estado para la Transición Visual (Aplazada) ---
        // NO aplicamos clases visuales AQUÍ. Eso se hará en onPlayerStateChange
        // cuando el reproductor entrante esté listo para mostrar contenido (BUFFERING o PLAYING).
        // Registramos en pendingVisualTransition qué reproductores/elementos están involucrados y qué reproductor # es el entrante.
        // El simple hecho de que pendingVisualTransition.playerNum NO sea null indica que una transición general está en curso.
        pendingVisualTransition = {
            playerNum: nextPlayerLogicalNum, // El número del reproductor entrante que esperamos
            outgoingElement: currentPlayerElement, // Elemento DOM saliente
            incomingElement: nextPlayerElement, // Elemento DOM entrante
            // outgoingVideoId: previousVideoIdForCleanup, // Video ID saliente para limpieza (si se necesita acceder aquí)
            // incomingVideoId: nextVideoId // Video ID entrante (si se necesita acceder aquí)
        };
        console.log(`playNextVideo [Data]: Transición visual aplazada. Esperando estado BUFFERING/PLAYING en Player ${pendingVisualTransition.playerNum}.`);
        // --- Paso 7: La Limpieza Final (stopVideo, ocultar elemento, reset de flags GENERALES) se disparará cuando la Transición Visual termine ---
        // (El manejador transitionEndHandler o el setTimeout de respaldo en onPlayerStateChange se encargarán de esto).

         // Limpiar SponsorBlock del video anterior después de un breve retraso para no interferir con el inicio del nuevo video.
         // Esto se hace mejor aquí en playNextVideo ya que tenemos acceso fácil a previousVideoIdForCleanup.
         const cleanupDelayMs = 500; // ms después de iniciar playNextVideo
         console.log(`playNextVideo [Data]: Programando limpieza de caché SB del video anterior (${previousVideoIdForCleanup}) en ${cleanupDelayMs}ms.`);
         setTimeout(() => {
              if (previousVideoIdForCleanup && segmentosCache[previousVideoIdForCleanup]) {
                   console.log(`playNextVideo [Data]: Limpieza - Limpiando caché SB para video ANTERIOR: ${previousVideoIdForCleanup}`);
                   delete segmentosCache[previousVideoIdForCleanup];
                   // También puedes resetear lastSeek si estaba relacionado con el video anterior
                    if (lastSeekVideoId === previousVideoIdForCleanup) {
                         console.log(`playNextVideo [Data]: Limpieza - Reseteando lastSeekEndTime y lastSeekVideoId para video ANTERIOR: ${previousVideoIdForCleanup}.`);
                         lastSeekEndTime = -1;
                         lastSeekVideoId = null;
                    }
              } else {
                   console.log(`playNextVideo [Data]: Limpieza - No se encontró caché SB para video ANTERIOR (${previousVideoIdForCleanup}) en caché o ya fue limpiado.`);
              }
         }, cleanupDelayMs);


    } catch (error) {
        console.error("playNextVideo [Data]: Error CRÍTICO durante playNextVideo:", error);
        // Asegurarse de que los flags se reseteen y el estado se revierta en caso de error CRÍTICO
        // antes de que comience la transición o si falla temprano.
        isTransitioning = false; // Resetear el flag general de transición
        isAudioFading = false;
        hasOutroCrossfadeStarted = false; // Resetear flag de outro
         // Limpiar clases visuales que pudieron haberse aplicado por error temprano (aunque no deberían con este código)
        if (currentPlayerElement) currentPlayerElement.classList.remove('fade-out', 'fade-in', 'hidden');
        if (nextPlayerElement) nextPlayerElement.classList.remove('fade-in', 'fade-out', 'hidden');
        // Revertir estado lógico a lo que estaba sonando antes del intento fallido
        const flatListIfAvailable = getFlattenedPlaylist(); // Intentar obtener la lista de nuevo por si acaso
        const previousVideo = flatListIfAvailable.length > currentFlatIndex && currentFlatIndex >= 0 ? flatListIfAvailable[currentFlatIndex] : null; // Usar el índice ANTES del intento de avance
         currentPlayingInfo.flattenedIndex = currentFlatIndex >= 0 ? currentFlatIndex : -1;
         currentPlayingInfo.videoId = previousVideo ? previousVideo.videoId : null;
         currentPlayingInfo.playlistId = previousVideo ? previousVideo.sourcePlaylistId : null;
        console.log(`playNextVideo [Data]: *** Transición INTERRUMPIDA (Error Crítico). Flag=false. Estado REVERTIDO a índice ${currentFlatIndex} ***`);
        mostrarMensajeFlotante(`Error CRÍTICO cambiando video: ${error.message}`);
        updatePlaylistsUI(); // Actualizar la UI para reflejar el estado revertido
        // Detener el monitoreo en caso de error crítico si la reproducción no puede continuar
        // stopMonitoring(); reproduccionIniciada = false; // Considerar que la reproducción se detuvo lógicamente
        // Limpiar cualquier estado de transición visual pendiente que pudo haberse preparado
        pendingVisualTransition = { playerNum: null, outgoingElement: null, incomingElement: null };
    }
}
function crossfadeAudio(playerOut, playerIn) {
    const fadeStartTime = Date.now();

    // Protección contra iniciar un nuevo fundido si ya hay uno en curso
    if (isAudioFading) {
         console.log("Crossfade Audio: Ya desvaneciendo, saltando nueva solicitud.");
         // Si se solicita un nuevo fundido mientras uno está activo, ¿debería detenerse el existente?
         // Por ahora, simplemente saltamos la nueva solicitud. Si el comportamiento es extraño, considerar detener el anterior.
         return;
    }

    // Usar los reproductores pasados como argumentos para determinar quién se desvanece y quién entra
    const previousPlayer = playerToFadeOut; // El reproductor cuyo volumen disminuirá
    const nextPlayer = playerToFadeIn;     // El reproductor cuyo volumen aumentará

    // Validar las instancias de reproductores y los métodos requeridos
    if (!previousPlayer || !nextPlayer || typeof previousPlayer.setVolume !== 'function' || typeof nextPlayer.setVolume !== 'function') {
        console.error("Crossfade Audio: Reproductores inválidos pasados como argumentos.");
        isAudioFading = false; // Asegurarse de que el flag se resetee si la entrada es inválida
        return; // Salir de la ejecución de la función
    }

    // Loguear qué reproductores se están desvaneciendo basándose en su referencia interna (player1/player2) para depuración
    console.log(`Crossfade START @ ${new Date(fadeStartTime).toLocaleTimeString()}: Desvaneciendo Player ${previousPlayer === player1 ? 1:2}, Fundiendo Player ${nextPlayer === player1 ? 1:2}`);
    isAudioFading = true; // <<<--- MARCAR EL INICIO DEL PROCESO DE FUNDIDO DE AUDIO

    // Los volúmenes iniciales se espera que se establezcan en playNextVideo (por ejemplo, previousPlayer en 100, nextPlayer en 0)
    // El intervalo ahora gestionará el fundido desde esos volúmenes iniciales hacia los volúmenes objetivo (0 y 100).

    let currentVolume = previousPlayer.getVolume(); // Iniciar desvanecimiento desde su volumen actual
    let nextVolume = nextPlayer.getVolume();      // Iniciar fundido de entrada desde su volumen actual (debería ser 0 desde playNextVideo)

    // Asegurar que los volúmenes iniciales estén dentro del rango válido [0, 100]
    currentVolume = Math.max(0, Math.min(100, currentVolume));
    nextVolume = Math.max(0, Math.min(100, nextVolume));

    // Calcular el número de pasos y el tiempo de intervalo para el fundido
    const crossfadeSteps = Math.max(1, Math.floor(CROSSFADE_DURATION * 10)); // Apuntar a 10 pasos por segundo para suavidad
    const volumeStep = crossfadeSteps > 0 ? 100 / crossfadeSteps : 100; // Cuánto cambia el volumen por paso
    const intervalTime = crossfadeSteps > 0 ? Math.max(10, Math.floor(CROSSFADE_DURATION * 1000 / crossfadeSteps)) : 100; // Tiempo entre pasos (mínimo 10ms)

    // Limpiar cualquier intervalo de crossfade anterior por si acaso
    if (window.crossfadeIntervalId) {
        clearInterval(window.crossfadeIntervalId);
        window.crossfadeIntervalId = null;
        console.log("Crossfade: Intervalo previo limpiado.");
    }

    // Iniciar el intervalo para ajustar volúmenes gradualmente
    const intervalId = setInterval(() => {
         // Volver a validar reproductores dentro del intervalo. Las instancias de reproductor podrían volverse inválidas.
         if (!previousPlayer || !nextPlayer || typeof previousPlayer.setVolume !== 'function' || typeof nextPlayer.setVolume !== 'function') {
             console.error(`Crossfade Interval @ ${Date.now() - fadeStartTime}ms: Reproductores inválidos en intervalo, deteniendo fundido.`);
             clearInterval(intervalId);
             window.crossfadeIntervalId = null; // Limpiar el ID del intervalo
             isAudioFading = false; // <<<--- RESETEAR FLAG EN ERROR
             return; // Detener la ejecución del intervalo
        }

        // Calcular los nuevos volúmenes para este paso
        currentVolume = Math.max(0, currentVolume - volumeStep); // Disminuir volumen del reproductor de salida, no bajar de 0
        nextVolume = Math.min(100, nextVolume + volumeStep);      // Aumentar volumen del reproductor de entrada, no subir de 100

        try {
            // Aplicar los nuevos volúmenes a las instancias de reproductores
            if(previousPlayer) previousPlayer.setVolume(currentVolume);
            if(nextPlayer) nextPlayer.setVolume(nextVolume);
        } catch (e) {
             // Loguear cualquier error durante el establecimiento de volumen y detener el fundido
             console.error(`Crossfade Interval @ ${Date.now() - fadeStartTime}ms: Error estableciendo volumen:`, e);
             clearInterval(intervalId);
             window.crossfadeIntervalId = null; // Limpiar el ID del intervalo
             isAudioFading = false; // <<<--- RESETEAR FLAG EN ERROR
             return; // Detener la ejecución del intervalo
        }

        // --- Verificar si el crossfade está completo ---
        // El fundido está completo cuando el reproductor de salida está en o por debajo de 0 volumen Y
        // el reproductor de entrada está en o por encima de 100 volumen.
        if (currentVolume <= 0 && nextVolume >= 100) {
            // Limpiar el intervalo cuando el fundido haya terminado
            clearInterval(intervalId);
            window.crossfadeIntervalId = null; // Limpiar el ID del intervalo
            const fadeEndTime = Date.now();
            console.log(`Crossfade audio FINALIZADO @ ${new Date(fadeEndTime).toLocaleTimeString()} (Duración: ${(fadeEndTime - fadeStartTime)/1000}s).`);
            isAudioFading = false; // <<<--- MARCAR EL FIN DEL PROCESO DE FUNDIDO DE AUDIO

             // Opcional: Agregar una callback o un evento aquí si algo necesita suceder exactamente cuando termina el fundido de audio
             // (como detener el video anterior si no se hizo en el manejador transitionend)
        }
    }, intervalTime); // Ejecutar la función del intervalo cada 'intervalTime' milisegundos
    window.crossfadeIntervalId = intervalId; // Almacenar el ID del intervalo
}
// --- Preguntar para repetir ---
function askToRepeatPlaylist() {
    // Usar confirm() o un modal más elegante
    const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
    if (repeat) {
        currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 }; // Resetear índice
        playFirstVideo(); // Iniciar desde el principio
    } else {
        stopMonitoring();
        mostrarMensajeFlotante("Playlist finalizada. Gracias por usar YT CrossMix :)");
        // Quizás detener ambos players y limpiar estado
         try {
            if(player1) player1.stopVideo();
            if(player2) player2.stopVideo();
         } catch(e) {}
         document.getElementById('botonPlay').disabled = getFlattenedPlaylist().length === 0; // Habilitar Play si hay videos
         reproduccionIniciada = false; // Permitir reiniciar con Play
    }
}

// --- Reproducir Primer Video ---
function playFirstVideo() {
    if (!playersInitialized) {
        console.error('Los reproductores no están inicializados.');
        mostrarMensajeFlotante("Los reproductores aún no están listos.");
        return;
    }
    stopMonitoring();
    isTransitioning = false; // Asegurarse que no esté en transición

    const flatList = getFlattenedPlaylist();
    if (flatList.length > 0) {
        const firstVideo = flatList[0];
        // Configurar estado inicial
        currentPlayingInfo.flattenedIndex = 0;
        currentPlayingInfo.videoId = firstVideo.videoId;
        currentPlayingInfo.playlistId = firstVideo.sourcePlaylistId;

        console.log('Reproduciendo el primer video:', firstVideo.videoId);

        try {
            // Player 1 siempre inicia
            if (player2) player2.stopVideo(); // Detener player 2
            player1.loadVideoById(firstVideo.videoId);
            player1.setVolume(100);

            document.getElementById('player1').classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2').classList.add('hidden');
            currentPlayer = 1; // Player 1 es el activo

            reproduccionIniciada = true; // Marcar que la reproducción ha comenzado
            document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>'; // Icono pausa

            startMonitoring();
            updatePlaylistsUI();
        } catch (e) {
             console.error("Error al iniciar el primer video:", e);
             mostrarMensajeFlotante("Error al intentar reproducir el primer video.");
             reproduccionIniciada = false; // Falló el inicio
              document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        }
    } else {
         console.log("No hay videos en la lista para reproducir.");
         mostrarMensajeFlotante("No hay videos en la lista para reproducir.");
         document.getElementById('botonPlay').disabled = true;
          reproduccionIniciada = false;
    }
}
// Módulo: Monitoreo de Reproductores (Adaptado Parcialmente)

function startMonitoring(interval) {
    if (!monitorInterval) {
        // Usar intervalo más corto para precisión en saltos y crossfade
        monitorInterval = setInterval(monitorPlayers, 300); // 300ms
        console.log('Monitoreo iniciado (intervalo: 300ms).');
    }
}
function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        console.log('Monitoreo detenido.');
    }
}
function monitorPlayers() {
    // Log opcional para depuración:
    // console.log(`Monitor: Corriendo (isTransitioning: ${isTransitioning}, isAudioFading: ${isAudioFading}, hasOutroCrossfadeStarted: ${hasOutroCrossfadeStarted}, pendingVisualTransition: ${pendingVisualTransition.playerNum !== null}, Initialized: ${playersInitialized}, reproduccionIniciada: ${reproduccionIniciada})`);

    if (!playersInitialized || !reproduccionIniciada) {
        return; // No ejecutar la lógica de monitoreo si no está listo
    }

    // Obtener el reproductor activo (el que lógicamente está reproduciendo el video actual según currentPlayer)
    const activePlayer = (currentPlayer === 1) ? player1 : player2;

    // Validar el reproductor activo
    if (!activePlayer || typeof activePlayer.getPlayerState !== 'function' || typeof activePlayer.getCurrentTime !== 'function' || typeof activePlayer.getDuration !== 'function' || typeof activePlayer.getVideoData !== 'function') {
        console.warn("Monitor: El reproductor activo es inválido.");
        stopMonitoring(); // Detener el monitoreo si el reproductor activo es inválido
        return;
    }

    const playerState = activePlayer.getPlayerState();
    const currentTime = activePlayer.getCurrentTime();
    const videoDuration = activePlayer.getDuration();
    const videoId = activePlayer.getVideoData()?.video_id; // Obtener videoId de forma segura

    // Si no hay datos de video válidos, solo verificar SponsorBlock, no triggers basados en tiempo.
    if (!videoId || isNaN(videoDuration) || videoDuration <= 0) {
        // console.log("Monitor: No hay datos de video o duración válida.");
        checkAndSkipSegment(activePlayer); // Aún así, verificar SponsorBlock incluso si la duración es extraña
        return; // No se pueden realizar comprobaciones basadas en tiempo
    }

     // Llamar a checkAndSkipSegment en cada tick del monitor.
     // checkAndSkipSegment maneja la obtención de segmentos (estado undefined/'fetching') y el salto (incluyendo outro trigger).
     checkAndSkipSegment(activePlayer);


    // --- Verificar Tiempo Restante para Disparar Crossfade (Disparo basado en tiempo) ---
    // Disparar playNextVideo si el tiempo restante está dentro de la ventana de CROSSFADE_DURATION,
    // Y NO hay ya una transición GENERAL (verificada por pendingVisualTransition),
    // Y el crossfade AÚN NO ha sido disparado por la lógica de detección de "outro" (verificada por hasOutroCrossfadeStarted).
    const timeRemaining = videoDuration - currentTime;
    // console.log(`Monitor: Tiempo restante: ${timeRemaining.toFixed(1)}s`);

    // Disparar playNextVideo SOLAMENTE si:
    // 1. El reproductor está realmente en estado PLAYING
    // 2. El tiempo restante es menor o igual que la duración del crossfade MÁS un pequeño buffer (ej. 0.5s)
    // 3. El tiempo restante es mayor que 0
    // 4. NO hay una transición visual PENDIENTE o EN CURSO (`pendingVisualTransition.playerNum` es null)
    // 5. El crossfade AÚN NO ha sido disparado por la lógica de detección de "outro" (`hasOutroCrossfadeStarted` es false)
    if (playerState === YT.PlayerState.PLAYING &&
        timeRemaining <= CROSSFADE_DURATION + 0.5 && // La ventana comienza CROSSFADE_DURATION + buffer antes del final
        timeRemaining > 0 && // Asegurarse de que el tiempo restante sea positivo
        pendingVisualTransition.playerNum === null && // Crucial: No disparar si ya hay una transición general en curso (indicado por pendingVisualTransition)
        !hasOutroCrossfadeStarted) // Crucial: No disparar si un "outro" ya lo hizo
         {
        console.log(`Monitor: Tiempo restante (${timeRemaining.toFixed(1)}s) dentro de la ventana de crossfade (${CROSSFADE_DURATION}s + buffer). Disparando playNextVideo basado en tiempo.`);
        // No establecemos hasOutroCrossfadeStarted aquí, ya que este es el trigger basado en tiempo.
        playNextVideo();
    }

    // --- Salvaguarda: Considerar detener el reproductor inactivo si sigue sonando inesperadamente ---
    // Esto es una comprobación adicional. La limpieza de la transición debería detenerlo.
    const inactivePlayer = (currentPlayer === 1) ? player2 : player1; // El reproductor que NO es el lógico actual
     if (inactivePlayer && typeof inactivePlayer.getPlayerState === 'function' && typeof inactivePlayer.stopVideo === 'function') {
        const inactiveState = inactivePlayer.getPlayerState();
        // Si el reproductor inactivo está en estado PLAYING, Y NO hay una transición general en curso (verificada por pendingVisualTransition),
        // Y no es el reproductor que lógicamente debería estar activo, detenerlo.
        if (inactiveState === YT.PlayerState.PLAYING &&
            pendingVisualTransition.playerNum === null && // No hay transición general en curso
            inactivePlayer !== activePlayer) // Asegurarse de que no intentamos detener el reproductor activo
            {
            console.warn("Monitor: Reproductor inactivo detectado aún REPRODUCIENDO fuera de transición. Deteniéndolo.");
            try {
                inactivePlayer.stopVideo();
            } catch(e) { console.error("Monitor: Error deteniendo reproductor inactivo:", e); }
        }
    }
}
// --- SponsorBlock: Chequear y Saltar Segmento ---
 const currentTime = player.getCurrentTime();
    const videoId = player.getVideoData()?.video_id;

    if (!videoId || isNaN(currentTime)) {
        // console.log("SB Check: No hay videoId o currentTime válido.");
        return;
    }

    const playerState = player.getPlayerState();
    if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING && !forceCheck) {
         // console.log(`SB Check: Reproductor no reproduciendo o cargando (Estado: ${playerState}). Saltando comprobación.`);
        return;
    }

    // --- Manejar el seguimiento del último salto ---
    // Resetea lastSeekEndTime si el video ha cambiado para permitir nuevos saltos.
    if (videoId !== lastSeekVideoId) {
        console.log(`checkAndSkipSegment: Video cambió a ${videoId}. Reseteando lastSeekEndTime.`);
        lastSeekEndTime = -1; // Resetear para el nuevo video
        lastSeekVideoId = videoId; // Rastrear videoId actual
        // Cuando el video cambia, la entrada de caché para el nuevo videoId estará undefined, 'fetching', cacheada o null.
        // La lógica de obtención y procesamiento está abajo.
    } else {
         // Para el mismo video, verificar si ya pasamos el tiempo del último salto registrado.
         // Esto evita que se dispare la lógica de salto inmediatamente después de un seekTo.
         if (lastSeekEndTime !== -1 && currentTime >= lastSeekEndTime + 0.2) { // Agregar un pequeño buffer (0.2s)
             console.log(`checkAndSkipSegment: Reseteando lastSeekEndTime (${lastSeekEndTime.toFixed(2)}) porque currentTime (${currentTime.toFixed(2)}) pasó el punto.`);
             lastSeekEndTime = -1; // Limpiar el último salto
         }
         // Si lastSeekEndTime NO es -1, significa que acabamos de realizar un salto y debemos esperar antes de buscar otro segmento para saltar.
         if (lastSeekEndTime !== -1) {
             // console.log(`SB Check: Esperando después de salto previo (${lastSeekEndTime.toFixed(2)}).`);
             return; // No verificar segmentos para saltar justo después de un salto.
         }
    }

    // --- Buscar Segmentos en Caché ---
    const segments = segmentosCache[videoId]; // Obtener el estado actual del caché para este videoId

    // Si segmentosCache[videoId] es undefined, significa que aún no hemos intentado obtenerlos para este video.
    // Iniciamos la obtención (que marcará el estado como 'fetching') y luego salimos de esta comprobación para esperar.
    if (segments === undefined) {
        console.log(`checkAndSkipSegment: Segmentos undefined para ${videoId}. Iniciando obtención.`);
        // obtenerSegmentosSponsorBlock es asíncrona y establece segmentosCache[videoId] a 'fetching' sincrónicamente.
        obtenerSegmentosSponsorBlock(videoId);
        return; // Salir de checkAndSkipSegment para este tick del monitor, los segmentos no están listos.
    }

    // Si segmentosCache[videoId] es 'fetching', significa que la obtención está en curso.
    // Simplemente salimos de esta comprobación para esperar a que termine en un ciclo futuro.
     if (segments === 'fetching') {
         // console.log(`SB Check: Segmentos aún obteniendo para ${videoId}. Esperando.`);
         return; // Salir de checkAndSkipSegment para este tick del monitor.
     }

    // Si llegamos aquí, 'segments' es un array ([] o [segmentos...]) o null (si la obtención falló).
    // Si es null o un array vacío, no hay segmentos que verificar. Salir de esta comprobación.
    if (segments === null || segments.length === 0) {
        // console.log(`SB Check: No hay segmentos para verificar para ${videoId} (caché nulo o vacío).`);
        return; // Salir si el caché es null o el array está vacío.
    }

    // Si llegamos aquí, 'segments' es un array no vacío [segmentos...].
    // Proceder a encontrar y saltar segmentos.

    // --- Procesar Segmentos (Si hay y son válidos) ---
    // Buscar un segmento cuyo tiempo actual (currentTime) caiga dentro de su rango [startTime, endTime).
    // Asegurarse de que el segmento encontrado sea "posterior" al último punto de salto (si hubo uno).
    const segmentToSkip = segments.find(segment => {
        // Leemos los tiempos directamente de las propiedades startTime y endTime (validado en obtenerSegmentosSponsorBlock)
        const start = segment.startTime;
        const end = segment.endTime;
        // No es estrictamente necesario volver a validar isNaN aquí si la validación previa en obtenerSegmentosSponsorBlock fue exitosa.

        // Verificar si el tiempo actual está dentro del rango del segmento (inicio <= currentTime < fin)
        const isWithinSegment = currentTime >= start && currentTime < end;

        // Verificar si el final de este segmento es después del tiempo del último salto.
        const isAfterLastSeek = lastSeekEndTime === -1 || end > lastSeekEndTime;

        return isWithinSegment && isAfterLastSeek;
    });

    // Si se encontró un segmento que cumple las condiciones
    if (segmentToSkip) {
        // Obtenemos los detalles del segmento encontrado
        const segmentStart = segmentToSkip.startTime; // Tiempo de inicio del segmento
        const segmentEnd = segmentToSkip.endTime;     // Tiempo de fin del segmento
        const segmentType = segmentToSkip.category;   // Categoría del segmento (sponsor, outro, etc.)

        // --- Manejar Segmentos Outro Específicamente ---
        // Si la categoría es "outro", aplicamos la lógica de crossfade.
        if (segmentType === 'outro') {
            const timeRemainingInSegment = segmentEnd - currentTime; // Tiempo restante dentro del segmento outro
            console.log(`SPONSORBLOCK OUTRO: Segmento outro detectado (${segmentType}) de ${segmentStart.toFixed(1)}s a ${segmentEnd.toFixed(1)}s. Tiempo restante en el outro: ${timeRemainingInSegment.toFixed(1)}s.`);

            // Si el tiempo restante en el segmento outro es menor o igual que la duración del crossfade MÁS un buffer,
            // Y NO hay una transición GENERAL en curso (verificada por pendingVisualTransition),
            // Y el crossfade AÚN NO ha sido disparado por la lógica de outro (para evitar doble disparo).
            // Disparamos playNextVideo para iniciar el crossfade.
            if (timeRemainingInSegment <= CROSSFADE_DURATION + 0.5 && timeRemainingInSegment > 0 &&
                pendingVisualTransition.playerNum === null && // No hay transición general en curso
                !hasOutroCrossfadeStarted) // Evitar doble disparo por outro para el mismo segmento
                 {
                 console.log(`SPONSORBLOCK OUTRO: Tiempo restante en outro (${timeRemainingInSegment.toFixed(1)}s) dentro de la ventana de crossfade (${CROSSFADE_DURATION}s + buffer). Disparando playNextVideo basado en outro.`);
                 hasOutroCrossfadeStarted = true; // Establecer este flag para indicar que el outro disparó el crossfade (evita el disparo basado en tiempo)
                 playNextVideo(); // Llamar a playNextVideo para iniciar la transición
            } else {
                 // Si el tiempo restante es mayor que la ventana de crossfade, o ya hay transición/outro trigger, no hacemos nada.
                 console.log(`SPONSORBLOCK OUTRO: Tiempo restante en outro (${timeRemainingInSegment.toFixed(1)}s) fuera de la ventana de crossfade (${CROSSFADE_DURATION}s) O transición ya en curso. No se realiza salto/disparo inmediato.`);
            }
             // IMPORTANTE: Para segmentos "outro", NO llamamos a player.seekTo(). Dejamos que la reproducción continúe para que el crossfade ocurra al final del segmento.

        } else {
            // --- Manejar Otros Tipos de Segmentos (Sponsor, Self-promo, Intro, etc.) ---
            // Para todas las demás categorías, realizamos un salto inmediato al final del segmento.
            const skipToTime = segmentEnd; // El punto de salto es el final del segmento
             console.log(`SPONSORBLOCK SKIP: Saltando segmento (${segmentType}) de ${segmentStart.toFixed(1)}s a ${segmentEnd.toFixed(1)}s. Saltando a ${skipToTime.toFixed(1)}s.`);

            try {
                player.seekTo(skipToTime, true); // Realizar el salto. El 'true' permite que el reproductor se detenga/ponga en pausa al buscar si es necesario.
                lastSeekEndTime = skipToTime; // Registrar el tiempo al que saltamos para evitar que checkAndSkipSegment re-salte inmediatamente el mismo segmento o segmentos superpuestos justo antes de este punto.
            } catch (e) {
                console.error("SPONSORBLOCK SKIP: Error realizando seekTo:", e);
            }
        }
    }

     // --- hasOutroCrossfadeStarted se resetea a false en onPlayerStateChange (estado PLAYING del NUEVO video) ---
}
// --- SponsorBlock: Obtener Segmentos ---
async function obtenerSegmentosSponsorBlock(videoId) {
    // Si ya hay segmentos en caché (es un array) o ya se está obteniendo ('fetching'), no hacer nada.
    if (segmentosCache[videoId] === 'fetching' || Array.isArray(segmentosCache[videoId])) {
         // console.log(`SB Fetch: Segmentos ya en caché o obteniendo para ${videoId}. Saliendo.`);
         return null; // O simplemente return; si la función no necesita retornar un valor aquí
    }

    // Si llegamos aquí, segmentosCache[videoId] es undefined.
    // Marcar el estado como 'fetching' SINCRÓNICAMENTE ANTES de la llamada await fetch.
    segmentosCache[videoId] = 'fetching';
    console.log(`SB Fetch: Iniciando obtención para ${videoId}. Marcando estado 'fetching'.`);

    const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd'; // Tu userId
    const apiUrl = `/api/segments/${videoId}`; // URL relativa a tu función Netlify
    console.log(`SB Fetch: Llamando a la API local SB: ${apiUrl}`);

    try {
        // Tu llamada fetch con el encabezado X-UserID
        const response = await fetch(apiUrl, {
            headers: {
                'X-UserID': userId // Tu encabezado X-UserID
            }
        });

        if (!response.ok) {
             console.error(`SB Fetch: Error desde la API SB (${apiUrl}): ${response.status} ${response.statusText}`);
             throw new Error(`API SB Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
             console.warn(`SB Fetch: La API SB (${apiUrl}) no devolvió un array para ${videoId}. Respuesta:`, data);
              throw new Error(`API SB Error: Respuesta no es un array`);
        }

        console.log(`SB Fetch: Segmentos recibidos de API SB para ${videoId} (crudos): ${data.length}`);

        // --- LÓGICA DE VALIDACIÓN DE SEGMENTOS AJUSTADA para startTime/endTime ---
        const validSegments = data.filter(segment => {
            // 1. Verificar que el segmento existe y tiene las propiedades startTime y endTime
            if (!segment || typeof segment.startTime === 'undefined' || typeof segment.endTime === 'undefined') {
                console.warn(`SB Fetch: Segmento inválido detectado (faltan startTime/endTime):`, segment);
                return false; // Filtrar segmento inválido
            }

            // 2. Verificar que startTime y endTime son números válidos
            const start = parseFloat(segment.startTime);
            const end = parseFloat(segment.endTime);

            if (isNaN(start) || isNaN(end)) {
                 console.warn(`SB Fetch: Segmento inválido detectado (startTime/endTime no son números válidos):`, segment);
                 console.warn("Segmento inválido:", segment); // Log detallado del segmento problemático
                 return false; // Filtrar segmento inválido
            }

            // 3. Opcional: Comprobación básica de coherencia de tiempos (end >= start)
            if (start < 0 || end < 0 || end < start) {
                 console.warn(`SB Fetch: Segmento inválido detectado (tiempos incoherentes):`, segment);
                 console.warn("Segmento inválido:", segment); // Log detallado del segmento problemático
                 return false; // Filtrar segmento inválido
            }

            // Si pasa todas las comprobaciones, el segmento es válido
            return true;
        });

        console.log(`SB Fetch: Segmentos válidos después de validación para ${videoId}: ${validSegments.length}`);
        // Opcional: Ordenar segmentos válidos por tiempo de inicio
        validSegments.sort((a, b) => a.startTime - b.startTime); // Ordenar usando las propiedades numéricas

        // Añadir duración del video si viene en el primer segmento válido (si tu API la incluye)
        if (validSegments.length > 0 && typeof validSegments[0].videoDuration !== 'undefined') {
             console.log(`SB Fetch: Duración del video según SB para ${videoId}: ${validSegments[0].videoDuration}s`);
             // Si necesitas usar esta duración en otro lugar, podrías almacenarla:
             // segmentosCache[videoId].videoDuration = validSegments[0].videoDuration;
        }


        // Almacenar los SEGMENTOS VÁLIDOS (el array filtrado) en caché
        segmentosCache[videoId] = validSegments; // Almacenar el array (puede ser vacío si ninguno fue válido)
        return validSegments; // Devolver el array filtrado (puede ser vacío)

    } catch (error) {
        console.error(`SB Fetch: Error en fetch/procesamiento SB para ${apiUrl}:`, error);
        // En caso de cualquier error, establecer segmentosCache[videoId] a null.
        segmentosCache[videoId] = null; // Establecer a null en caché
        return null; // Devolver null para indicar el fallo
    }
    // Después de fetch (exitoso o fallido), segmentosCache[videoId] ya no será 'fetching'.
}
// Módulo: Manejo de Eventos y Botones

// --- Botón Play/Pause Principal --- (Asumiendo que botonPlay ahora también pausa)
const botonPlay = document.getElementById("botonPlay");
let reproduccionIniciada = false; // Para controlar el primer Play

botonPlay.disabled = true; // Deshabilitado al inicio
botonPlay.addEventListener('click', () => {
     const activePlayer = currentPlayer === 1 ? player1 : player2;
     if (!playersInitialized || !activePlayer) {
          mostrarMensajeFlotante("El reproductor no está listo.");
          return;
     }

     const playerState = activePlayer.getPlayerState();

     if (!reproduccionIniciada) {
         // --- Primer Play ---
          const flatList = getFlattenedPlaylist();
          if (flatList.length > 0) {
               reproduccionIniciada = true;
               playFirstVideo(); // Inicia la reproducción desde el principio
               botonPlay.innerHTML = '<i class="fas fa-pause"></i>'; // Cambiar icono a Pausa
               // botonPlay.disabled = true; // Deshabilitar hasta que termine? O dejar para pausar
          } else {
               mostrarMensajeFlotante("No hay videos en la lista para reproducir.");
          }
     } else {
          // --- Play/Pause después del inicio ---
           if (playerState === YT.PlayerState.PLAYING) {
                activePlayer.pauseVideo();
                botonPlay.innerHTML = '<i class="fas fa-play"></i>'; // Cambiar icono a Play
                stopMonitoring(); // Detener monitoreo al pausar manualmente
           } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
               activePlayer.playVideo();
               botonPlay.innerHTML = '<i class="fas fa-pause"></i>'; // Cambiar icono a Pausa
               startMonitoring(); // Reanudar monitoreo
           }
     }
});


// --- Botón Next ---
document.getElementById('botonNext').addEventListener('click', () => {
     if (!reproduccionIniciada){
        mostrarMensajeFlotante("Inicia la reproducción primero con el botón Play.");
        return;
     }
     console.log("Botón Mix/Next presionado.");
     // Detener monitoreo brevemente para evitar doble salto
     stopMonitoring();
     playNextVideo(); // Llama a la función adaptada
     // El monitoreo se reiniciará automáticamente si la reproducción continúa
     // O se puede reiniciar aquí con un pequeño delay
     setTimeout(startMonitoring, 500);
});

// --- Búsqueda por palabras ---
const searchInput = document.getElementById('searchInput');
const debouncedSearch = debounce((query) => {
    performSearch(query); // Llama a la búsqueda inicial
}, 500);

searchInput.addEventListener('input', (event) => {
    const query = event.target.value.trim();
    if (query.length > 2) {
        debouncedSearch(query);
    } else {
        resultsDiv.innerHTML = ''; // Limpiar si input corto o vacío
        currentSearchQuery = '';
        nextPageContext = null;
        isLoadingMore = false;
        hideLoadMoreSpinner();
    }
});

// --- Añadir Playlist por URL ---
const añadirUrlButton = document.getElementById('añadirUrlButton');
const searchInput2 = document.getElementById('searchInput2');

añadirUrlButton.addEventListener('click', async () => {
    const url = searchInput2.value.trim();
    const playlistIdFromUrl = extractPlaylistId(url); // Función existente

    if (!playlistIdFromUrl) {
        alert('URL de la playlist no válida.');
        return;
    }
    mostrarMensajeFlotante("Buscando información de la playlist...");
    searchInput2.value = ''; // Limpiar input inmediatamente

    try {
        const playlistInfo = await getPlaylistInfo(playlistIdFromUrl); // Función existente
        if (playlistInfo) {
            // Pasar ID explícitamente si la API no lo devuelve consistentemente
            playlistInfo.id = playlistIdFromUrl;
            handlePlaylistLoaded(playlistInfo); // Llamar a la nueva función de manejo
        } else {
            // getPlaylistInfo ya debería mostrar error si falla
            // mostrarMensajeFlotante('No se pudo obtener información de la playlist.');
        }
    } catch (error) {
         console.error("Error en proceso de añadir URL:", error);
         mostrarMensajeFlotante(`Error al cargar playlist: ${error.message}`);
    }
});
// --- Funciones Auxiliares (Debounce, Formato Duración, Parseo Duración, etc.) ---

// Debounce para la busqueda
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// Formato MM:SS para mostrar duración
function formatDuration(duration) {
    if (isNaN(duration) || duration < 0) {
        return "0:00"; // Devolver 0:00 si es inválido
    }
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${formattedSeconds}`;
}

// Parsear duración (de varios formatos a segundos)
function parseDuration(durationInput) {
    if (typeof durationInput === 'number') {
        return Math.floor(durationInput); // Devolver entero si ya es número
    }
    if (typeof durationInput !== 'string') return 0;

    // Intentar formato PT0H0M0S (YouTube API a veces)
    const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (isoMatch) {
        const hours = parseInt(isoMatch[1] || '0', 10);
        const minutes = parseInt(isoMatch[2] || '0', 10);
        const seconds = parseFloat(isoMatch[3] || '0');
        return Math.floor(hours * 3600 + minutes * 60 + seconds);
    }

    // Intentar formato MM:SS o HH:MM:SS
    const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
    if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
        return timeParts[0] * 60 + timeParts[1];
    } else if (timeParts.length === 3 && !isNaN(timeParts[0]) && !isNaN(timeParts[1]) && !isNaN(timeParts[2])) {
        return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    }

    // Intentar parsear como número directo (si es string "180")
    const directNumber = parseInt(durationInput, 10);
    if (!isNaN(directNumber)) {
         return directNumber;
    }

    return 0; // Fallback
}
// --- Carga de Playlist desde URL (Piped API + Proxy + Retry) ---
const pipedInstances = [ // Lista de instancias Piped
   //  "https://api.piped.private.coffee",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party"
   
];
function getRandomPipedInstance() {
    const randomIndex = Math.floor(Math.random() * pipedInstances.length);
    return pipedInstances[randomIndex];
}
// Función fetch con reintentos (usada por getPlaylistInfo)
async function fetchDataWithRetry(url, options = {}, maxRetries = 2, retryDelay = 800) {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            console.log(`fetchDataWithRetry: Intento ${retries + 1} para ${url}`);
            const response = await fetch(url, options);
            if (!response.ok) {
                 // Intentar leer cuerpo del error
                 let errorBodyText = `HTTP error! status: ${response.status}`;
                 try { errorBodyText = await response.text(); } catch(e){}
                throw new Error(errorBodyText);
            }
            return await response.json(); // Asume que la respuesta es JSON
        } catch (error) {
            console.error(`Error fetching ${url}, reintento ${retries + 1}/${maxRetries + 1}:`, error.message);
            retries++;
            if (retries <= maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, retryDelay * retries)); // Incrementar delay
            } else {
                 console.error(`fetchDataWithRetry: Fallaron todos los ${maxRetries + 1} intentos para ${url}`);
                throw error; // Lanza el error después de todos los reintentos
            }
        }
    }
}
// Obtener info de Playlist usando Piped
async function getPlaylistInfo(playlistId) {
    const instanceUrl = getRandomPipedInstance();
    const targetUrl = `${instanceUrl}/playlists/${playlistId}`;
    try {
        // Pasar directamente targetUrl si no necesitas proxy
        const data = await fetchDataWithRetry(targetUrl);
        if (!data || !data.relatedStreams) {
            throw new Error("La respuesta de la API no contiene videos válidos.");
        }
        // Devolver data completa, handlePlaylistLoaded extraerá lo necesario
        return data;
    } catch (error) {
        console.error("Error al obtener la información de la playlist:", error.message);
        mostrarMensajeFlotante(`Error al cargar playlist: ${error.message}`);
        // return null; // Devolver null ya no es necesario, el error se propaga
         throw error; // Re-lanzar para que el .catch en el listener lo maneje
    }
}
// Extraer ID de playlist de URL
function extractPlaylistId(url) {
    try {
        const urlObject = new URL(url);
        return urlObject.searchParams.get('list');
    } catch (e) {
        console.error("URL inválida para extraer ID de playlist:", url);
        return null;
    }
}
// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
     // Asegurarse que la playlist manual exista al inicio (si no hay datos guardados)
     if (!playlistsData.some(p => p.id === 'manual')) {
        playlistsData.push({ id: 'manual', name: 'Mis Vídeos Añadidos', thumbnailUrl: 'https://mix-yt.netlify.app/electronic.ico', videos: [], isExpanded: true });
     }
     updatePlaylistsUI(); // Render inicial de la UI de playlists
     loadYouTubeAPI(); // Iniciar carga de la API de YouTube
});

// Cerrar menús contextuales si se hace click fuera
document.addEventListener('click', (event) => {
    // Close contextual menus (the 3 dots menu) if the click target is not inside a .delete-menu
    if (!event.target.closest('.delete-menu')) {
        closeAllContextMenus();
    }
    // Close the generic playlist selection popups if the click target is not inside a .playlist-selection-popup-menu
    // Ensure this new class is used for both Add and Move popups (which it is in the new code)
    if (!event.target.closest('.playlist-selection-popup-menu')) {
        closePlaylistSelectionPopups(); // <-- NEW CALL HERE
    }
}, true); // Keep using the capture phase for better reliability
