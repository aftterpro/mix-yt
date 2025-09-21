// youtube-client.js - Cliente YouTube.js v1.4.5 con scroll infinito
console.log('🎵 Cargando YouTube.js Client v1.4.5...');

class YouTubeJSClient {
    constructor() {
        this.youtube = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return true;
        
        try {
            console.log('🚀 Inicializando YouTube.js v1.4.5...');
            
            // Cargar YouTube.js desde CDN correcto
            if (!window.Innertube) {
                await this.loadYouTubeJS();
            }
            
            // SINTAXIS CORRECTA para v1.4.5
            this.youtube = await new window.Innertube({ 
                gl: 'US', // Geo location
                visitor_data: undefined // Opcional
            });
            
            this.initialized = true;
            console.log('✅ YouTube.js v1.4.5 inicializado correctamente');
            return true;
            
        } catch (error) {
            console.error('❌ Error inicializando YouTube.js:', error);
            this.initialized = false;
            return false;
        }
    }

    async loadYouTubeJS() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            // URL CORRECTA para v1.4.5
            script.src = 'https://cdn.jsdelivr.net/npm/youtubei.js@1.4.5/dist/innertube.umd.js';
            script.onload = () => {
                console.log('📦 YouTube.js v1.4.5 CDN cargado');
                // Verificar que se cargó correctamente
                if (window.Innertube) {
                    resolve();
                } else {
                    reject(new Error('Innertube no disponible después de cargar'));
                }
            };
            script.onerror = () => {
                console.error('❌ Error cargando YouTube.js desde CDN');
                reject(new Error('Error cargando YouTube.js'));
            };
            document.head.appendChild(script);
        });
    }

    async search(query, continuation = null) {
        const initSuccess = await this.init();
        if (!initSuccess) {
            throw new Error('YouTube.js no pudo inicializarse');
        }

        try {
            console.log(`🔍 Buscando: "${query}"${continuation ? ' (siguiente página)' : ''}`);
            
            let search;
            if (continuation && continuation.getContinuation) {
                // Continuar búsqueda existente
                search = await continuation.getContinuation();
            } else {
                // Nueva búsqueda con opciones correctas para v1.4.5
                search = await this.youtube.search(query, { 
                    client: 'YOUTUBE',
                    type: 'video' // Solo videos
                });
            }
            
            // La estructura de respuesta en v1.4.5
            const videos = search.videos || search.results || [];
            console.log(`📹 ${videos.length} videos encontrados con YouTube.js v1.4.5`);
            
            return {
                items: videos.map(video => this.formatVideo(video)),
                nextpage: search.has_continuation ? search : null,
                query: query,
                total: search.estimated_results || videos.length
            };
            
        } catch (error) {
            console.error('❌ Error en búsqueda YouTube.js v1.4.5:', error);
            throw error;
        }
    }

    formatVideo(video) {
        try {
            // Estructura para v1.4.5
            return {
                videoId: video.id || video.video_id,
                title: video.title || video.text || 'Título no disponible',
                thumbnail: this.getBestThumbnail(video),
                duration: this.getDuration(video),
                uploaderName: this.getChannelName(video),
                author: this.getChannelName(video),
                url: `https://www.youtube.com/watch?v=${video.id || video.video_id}`,
                views: this.getViews(video),
                published: this.getPublished(video)
            };
        } catch (error) {
            console.warn('⚠️ Error formateando video:', error);
            return {
                videoId: video.id || Math.random().toString(36),
                title: 'Error al cargar video',
                thumbnail: './electronic.ico',
                duration: 0,
                uploaderName: 'Desconocido',
                author: 'Desconocido'
            };
        }
    }

    getBestThumbnail(video) {
        try {
            // Diferentes estructuras posibles en v1.4.5
            if (video.thumbnails && video.thumbnails.length > 0) {
                const best = video.thumbnails.find(t => t.width >= 320) || video.thumbnails[0];
                return best.url;
            }
            if (video.thumbnail) return video.thumbnail;
            if (video.snippet?.thumbnails?.high?.url) return video.snippet.thumbnails.high.url;
            return `https://i.ytimg.com/vi/${video.id || video.video_id}/hqdefault.jpg`;
        } catch (e) {
            return './electronic.ico';
        }
    }

    getDuration(video) {
        try {
            // Diferentes formas de obtener duración en v1.4.5
            if (video.duration?.seconds) return video.duration.seconds;
            if (video.duration?.text) return this.parseDurationText(video.duration.text);
            if (video.lengthSeconds) return parseInt(video.lengthSeconds);
            if (video.snippet?.duration) return this.parseDurationText(video.snippet.duration);
            return 0;
        } catch (e) {
            return 0;
        }
    }

    getChannelName(video) {
        try {
            if (video.author) return video.author;
            if (video.channel?.name) return video.channel.name;
            if (video.snippet?.channelTitle) return video.snippet.channelTitle;
            if (video.uploader) return video.uploader;
            return 'Canal desconocido';
        } catch (e) {
            return 'Canal desconocido';
        }
    }

    getViews(video) {
        try {
            if (video.view_count) return video.view_count;
            if (video.views) return video.views;
            if (video.snippet?.viewCount) return video.snippet.viewCount;
            return '0';
        } catch (e) {
            return '0';
        }
    }

    getPublished(video) {
        try {
            if (video.published) return video.published;
            if (video.publishedAt) return video.publishedAt;
            if (video.snippet?.publishedAt) return video.snippet.publishedAt;
            return '';
        } catch (e) {
            return '';
        }
    }

    parseDurationText(durationText) {
        if (!durationText || typeof durationText !== 'string') return 0;
        
        try {
            // PT1M30S format
            if (durationText.startsWith('PT')) {
                let totalSeconds = 0;
                const hoursMatch = durationText.match(/(\d+)H/);
                const minutesMatch = durationText.match(/(\d+)M/);
                const secondsMatch = durationText.match(/(\d+)S/);
                
                if (hoursMatch) totalSeconds += parseInt(hoursMatch[1]) * 3600;
                if (minutesMatch) totalSeconds += parseInt(minutesMatch[1]) * 60;
                if (secondsMatch) totalSeconds += parseInt(secondsMatch[1]);
                
                return totalSeconds;
            }
            
            // MM:SS or HH:MM:SS format
            const parts = durationText.split(':').reverse();
            let seconds = 0;
            
            parts.forEach((part, index) => {
                const num = parseInt(part.replace(/\D/g, ''));
                if (!isNaN(num)) {
                    seconds += num * Math.pow(60, index);
                }
            });
            
            return seconds;
        } catch (e) {
            return 0;
        }
    }

    isAvailable() {
        return this.initialized && this.youtube !== null;
    }

    async getPlaylist(playlistId) {
        const initSuccess = await this.init();
        if (!initSuccess) {
            throw new Error('YouTube.js no pudo inicializarse');
        }

        try {
            console.log(`📋 Obteniendo playlist: ${playlistId}`);
            const playlist = await this.youtube.getPlaylist(playlistId, { client: 'YOUTUBE' });
            
            return {
                id: playlistId,
                name: playlist.title || 'Playlist sin título',
                description: playlist.description || '',
                videoCount: playlist.video_count || playlist.videos?.length || 0,
                videos: playlist.videos?.map(video => this.formatVideo(video)) || []
            };
        } catch (error) {
            console.error('❌ Error obteniendo playlist:', error);
            throw error;
        }
    }
}

// Crear instancia global
window.youtubeJSClient = new YouTubeJSClient();

console.log('✅ YouTube.js Client v1.4.5 cargado');
