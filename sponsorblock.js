//  Manejo de SponsorBlock
import { PlaybackController } from './playbackController.js';
import { SponsorBlockState, CONFIG, AppState } from './state.js';

export class SponsorBlockManager {
    // Verificar y saltar segmentos
    static checkAndSkipSegment(player, forceCheck = false) {
        const currentTime = player.getCurrentTime();
        const videoId = player.getVideoData()?.video_id;

        if (!videoId || isNaN(currentTime)) {
            return;
        }

        const playerState = player.getPlayerState();
        if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING && !forceCheck) {
            return;
        }

        // Manejar el seguimiento del último salto
        if (videoId !== SponsorBlockState.lastSeekVideoId) {
            console.log(`checkAndSkipSegment: Video cambió a ${videoId}. Reseteando lastSeekEndTime.`);
            SponsorBlockState.lastSeekEndTime = -1;
            SponsorBlockState.lastSeekVideoId = videoId;
        } else {
            if (SponsorBlockState.lastSeekEndTime !== -1 && currentTime >= SponsorBlockState.lastSeekEndTime + 0.2) {
                console.log(`checkAndSkipSegment: Reseteando lastSeekEndTime (${SponsorBlockState.lastSeekEndTime.toFixed(2)}) porque currentTime (${currentTime.toFixed(2)}) pasó el punto.`);
                SponsorBlockState.lastSeekEndTime = -1;
            }
            if (SponsorBlockState.lastSeekEndTime !== -1) {
                return;
            }
        }

        // Buscar segmentos
        const segments = SponsorBlockState.segmentosCache[videoId];

        if (segments === undefined) {
            console.log(`checkAndSkipSegment: Segmentos undefined para ${videoId}. Iniciando obtención.`);
            SponsorBlockManager.obtenerSegmentosSponsorBlock(videoId);
            return;
        }

        if (segments === 'fetching') {
            return;
        }

        if (segments === null || segments.length === 0) {
            return;
        }

        // Procesar segmentos
        const segmentToSkip = segments.find(segment => {
            const start = segment.startTime;
            const end = segment.endTime;
            const isWithinSegment = currentTime >= start && currentTime < end;
            const isAfterLastSeek = SponsorBlockState.lastSeekEndTime === -1 || end > SponsorBlockState.lastSeekEndTime;
            return isWithinSegment && isAfterLastSeek;
        });

        if (segmentToSkip) {
            const segmentStart = segmentToSkip.startTime;
            const segmentEnd = segmentToSkip.endTime;
            const segmentType = segmentToSkip.category;

            // Manejar segmentos outro específicamente
            if (segmentType === 'outro') {
                const timeRemainingInSegment = segmentEnd - currentTime;
                console.log(`SPONSORBLOCK OUTRO: Segmento outro detectado (${segmentType}) de ${segmentStart.toFixed(1)}s a ${segmentEnd.toFixed(1)}s. Tiempo restante en el outro: ${timeRemainingInSegment.toFixed(1)}s.`);

                if (timeRemainingInSegment <= CONFIG.CROSSFADE_DURATION + 0.5 && 
                    timeRemainingInSegment > 0 && 
                    !AppState.isTransitioning && 
                    !AppState.hasOutroCrossfadeStarted) {
                    console.log(`SPONSORBLOCK OUTRO: Disparando playNextVideo basado en outro.`);
                    AppState.hasOutroCrossfadeStarted = true;
                    PlaybackController.playNextVideo();
                } else {
                    console.log(`SPONSORBLOCK OUTRO: Tiempo restante en outro (${timeRemainingInSegment.toFixed(1)}s) fuera de la ventana de crossfade.`);
                }
            } else {
                // Manejar otros tipos de segmentos
                const skipToTime = segmentEnd;
                console.log(`SPONSORBLOCK SKIP: Saltando segmento (${segmentType}) de ${segmentStart.toFixed(1)}s a ${segmentEnd.toFixed(1)}s. Saltando a ${skipToTime.toFixed(1)}s.`);

                try {
                    player.seekTo(skipToTime, true);
                    SponsorBlockState.lastSeekEndTime = skipToTime;
                } catch (e) {
                    console.error("SPONSORBLOCK SKIP: Error realizando seekTo:", e);
                }
            }
        }
    }

    // Obtener segmentos de SponsorBlock
    static async obtenerSegmentosSponsorBlock(videoId) {
        if (SponsorBlockState.segmentosCache[videoId] === 'fetching' || Array.isArray(SponsorBlockState.segmentosCache[videoId])) {
            return null;
        }

        SponsorBlockState.segmentosCache[videoId] = 'fetching';
        console.log(`SB Fetch: Iniciando obtención para ${videoId}. Marcando estado 'fetching'.`);

        const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd';
        const apiUrl = `/api/segments/${videoId}`;
        console.log(`SB Fetch: Llamando a la API local SB: ${apiUrl}`);

        try {
            const response = await fetch(apiUrl, {
                headers: {
                    'X-UserID': userId
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

            // Validación de segmentos
            const validSegments = data.filter(segment => {
                if (!segment || typeof segment.startTime === 'undefined' || typeof segment.endTime === 'undefined') {
                    console.warn(`SB Fetch: Segmento inválido detectado (faltan startTime/endTime):`, segment);
                    return false;
                }

                const start = parseFloat(segment.startTime);
                const end = parseFloat(segment.endTime);

                if (isNaN(start) || isNaN(end)) {
                    console.warn(`SB Fetch: Segmento inválido detectado (startTime/endTime no son números válidos):`, segment);
                    return false;
                }

                if (start < 0 || end < 0 || end < start) {
                    console.warn(`SB Fetch: Segmento inválido detectado (tiempos incoherentes):`, segment);
                    return false;
                }

                return true;
            });

            console.log(`SB Fetch: Segmentos válidos después de validación para ${videoId}: ${validSegments.length}`);
            validSegments.sort((a, b) => a.startTime - b.startTime);

            if (validSegments.length > 0 && typeof validSegments[0].videoDuration !== 'undefined') {
                console.log(`SB Fetch: Duración del video según SB para ${videoId}: ${validSegments[0].videoDuration}s`);
            }

            SponsorBlockState.segmentosCache[videoId] = validSegments;
            return validSegments;

        } catch (error) {
            console.error(`SB Fetch: Error en fetch/procesamiento SB para ${apiUrl}:`, error);
            SponsorBlockState.segmentosCache[videoId] = null;
            return null;
        }
    }

    // Limpiar caché de segmentos para un video específico
    static clearSegmentCache(videoId) {
        if (SponsorBlockState.segmentosCache[videoId]) {
            delete SponsorBlockState.segmentosCache[videoId];
            console.log(`SB Cache: Limpiado caché para video ${videoId}`);
        }
    }

    // Limpiar todo el caché de segmentos
    static clearAllSegmentCache() {
        SponsorBlockState.segmentosCache = {};
        SponsorBlockState.lastSeekEndTime = -1;
        SponsorBlockState.lastSeekVideoId = null;
        console.log('SB Cache: Limpiado todo el caché de segmentos');
    }

    // Obtener estadísticas del caché
    static getCacheStats() {
        const cacheKeys = Object.keys(SponsorBlockState.segmentosCache);
        const stats = {
            totalVideos: cacheKeys.length,
            fetchingVideos: cacheKeys.filter(key => SponsorBlockState.segmentosCache[key] === 'fetching').length,
            failedVideos: cacheKeys.filter(key => SponsorBlockState.segmentosCache[key] === null).length,
            loadedVideos: cacheKeys.filter(key => Array.isArray(SponsorBlockState.segmentosCache[key])).length
        };
        return stats;
    }
}

