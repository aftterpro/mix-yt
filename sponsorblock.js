// ===== 6. SPONSORBLOCK.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// sponsorblock.js - Versión adaptada al sistema unificado

export class SponsorBlockManager {
    
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

        // ✅ Usar estado unificado
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        const sponsorState = state.sponsorBlock;

        // Manejar seguimiento del último salto
        if (videoId !== sponsorState.lastSeekVideoId) {
            console.log(`SponsorBlock: Video cambió a ${videoId}. Reseteando lastSeekEndTime.`);
            window.unifiedStateManager.set('sponsorBlock.lastSeekEndTime', -1);
            window.unifiedStateManager.set('sponsorBlock.lastSeekVideoId', videoId);
        } else {
            if (sponsorState.lastSeekEndTime !== -1 && currentTime >= sponsorState.lastSeekEndTime + 0.2) {
                console.log(`SponsorBlock: Reseteando lastSeekEndTime porque currentTime pasó el punto.`);
                window.unifiedStateManager.set('sponsorBlock.lastSeekEndTime', -1);
            }
            if (sponsorState.lastSeekEndTime !== -1) {
                return;
            }
        }

        // Buscar segmentos en caché
        const segments = sponsorState.segmentosCache[videoId];

        if (segments === undefined) {
            console.log(`SponsorBlock: Segmentos undefined para ${videoId}. Iniciando obtención.`);
            SponsorBlockManager.obtenerSegmentosSponsorBlock(videoId);
            return;
        }

        if (segments === 'fetching' || segments === null || segments.length === 0) {
            return;
        }

        // Procesar segmentos
        const segmentToSkip = segments.find(segment => {
            const start = segment.startTime;
            const end = segment.endTime;
            const isWithinSegment = currentTime >= start && currentTime < end;
            const isAfterLastSeek = sponsorState.lastSeekEndTime === -1 || end > sponsorState.lastSeekEndTime;
            return isWithinSegment && isAfterLastSeek;
        });

        if (segmentToSkip) {
            const segmentEnd = segmentToSkip.endTime;
            const segmentType = segmentToSkip.category;

            if (segmentType === 'outro') {
                const timeRemainingInSegment = segmentEnd - currentTime;
                console.log(`SponsorBlock OUTRO: Segmento outro detectado. Tiempo restante: ${timeRemainingInSegment.toFixed(1)}s.`);

                const CROSSFADE_DURATION = 15; // Usar constante
                if (timeRemainingInSegment <= CROSSFADE_DURATION + 0.5 && 
                    timeRemainingInSegment > 0 && 
                    !state.app.isTransitioning && 
                    !state.app.hasOutroCrossfadeStarted) {
                    
                    console.log(`SponsorBlock OUTRO: Disparando playNextVideo.`);
                    window.unifiedStateManager.set('app.hasOutroCrossfadeStarted', true);
                    
                    // Usar PlaybackController unificado
                    if (window.PlaybackController?.playNextVideo) {
                        window.PlaybackController.playNextVideo();
                    }
                }
            } else {
                // Skip normal
                const skipToTime = segmentEnd;
                console.log(`SponsorBlock SKIP: Saltando segmento (${segmentType}) a ${skipToTime.toFixed(1)}s.`);

                try {
                    player.seekTo(skipToTime, true);
                    window.unifiedStateManager.set('sponsorBlock.lastSeekEndTime', skipToTime);
                } catch (e) {
                    console.error("SponsorBlock SKIP: Error realizando seekTo:", e);
                }
            }
        }
    }

    static async obtenerSegmentosSponsorBlock(videoId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return null;

        const sponsorState = state.sponsorBlock;
        
        if (sponsorState.segmentosCache[videoId] === 'fetching' || 
            Array.isArray(sponsorState.segmentosCache[videoId])) {
            return null;
        }

        // ✅ Actualizar caché usando estado unificado
        const newCache = { ...sponsorState.segmentosCache };
        newCache[videoId] = 'fetching';
        window.unifiedStateManager.set('sponsorBlock.segmentosCache', newCache);

        console.log(`SponsorBlock Fetch: Iniciando obtención para ${videoId}.`);

        const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd';
        const apiUrl = `/.netlify/functions/sponsorblock/segments/${videoId}`;

        try {
            const response = await fetch(apiUrl, {
                headers: {
                    'X-UserID': userId
                }
            });

            if (!response.ok) {
                throw new Error(`API SB Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error(`API SB Error: Respuesta no es un array`);
            }

            console.log(`SponsorBlock Fetch: Segmentos recibidos para ${videoId}: ${data.length}`);

            // Validación de segmentos
            const validSegments = data.filter(segment => {
                if (!segment || typeof segment.startTime === 'undefined' || typeof segment.endTime === 'undefined') {
                    return false;
                }

                const start = parseFloat(segment.startTime);
                const end = parseFloat(segment.endTime);

                if (isNaN(start) || isNaN(end) || start < 0 || end < 0 || end < start) {
                    return false;
                }

                return true;
            });

            validSegments.sort((a, b) => a.startTime - b.startTime);

            // ✅ Actualizar caché usando estado unificado
            const finalCache = { ...window.unifiedStateManager.state.sponsorBlock.segmentosCache };
            finalCache[videoId] = validSegments;
            window.unifiedStateManager.set('sponsorBlock.segmentosCache', finalCache);

            console.log(`SponsorBlock Fetch: Segmentos válidos para ${videoId}: ${validSegments.length}`);
            return validSegments;

        } catch (error) {
            console.error(`SponsorBlock Fetch: Error para ${videoId}:`, error);
            
            // ✅ Actualizar caché con null usando estado unificado
            const errorCache = { ...window.unifiedStateManager.state.sponsorBlock.segmentosCache };
            errorCache[videoId] = null;
            window.unifiedStateManager.set('sponsorBlock.segmentosCache', errorCache);
            
            return null;
        }
    }

    static clearSegmentCache(videoId) {
        const state = window.unifiedStateManager?.state;
        if (!state) return;

        if (state.sponsorBlock.segmentosCache[videoId]) {
            const newCache = { ...state.sponsorBlock.segmentosCache };
            delete newCache[videoId];
            window.unifiedStateManager.set('sponsorBlock.segmentosCache', newCache);
            console.log(`SponsorBlock Cache: Limpiado caché para video ${videoId}`);
        }
    }

    static clearAllSegmentCache() {
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('sponsorBlock.segmentosCache', {});
            window.unifiedStateManager.set('sponsorBlock.lastSeekEndTime', -1);
            window.unifiedStateManager.set('sponsorBlock.lastSeekVideoId', null);
            console.log('SponsorBlock Cache: Limpiado todo el caché');
        }
    }
}
