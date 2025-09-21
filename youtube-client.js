// youtube-client.js - Cliente YouTube.js con scroll infinito
console.log('🎵 Cargando YouTube.js Client...');

class YouTubeJSClient {
    constructor() {
        this.youtube = null;
        this.initialized = false;
        // No inicializar automáticamente para evitar errores en carga
    }

    async init() {
        if (this.initialized) return true;
        
        try {
            console.log('🚀 Inicializando YouTube.js...');
            
            // Cargar YouTube.js desde CDN si no está disponible
            if (!window.Innertube) {
                await this.loadYouTubeJS();
            }
            
            // Crear instancia de Innertube
            this.youtube = await window.Innertube.create();
            this.initialized = true;
            console.log('✅ YouTube.js inicializado correctamente');
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
            script.src = 'https://unpkg.com/youtubei.js@10.3.0/dist/bundle.js';
            script.onload = () => {
                console.log('📦 YouTube.js CDN cargado desde unpkg');
                resolve();
            };
            script.onerror = () => {
                console.error('❌ Error cargando YouTube.js desde CDN');
                reject(new Error('Error cargando YouTube.js'));
            };
            document.head.appendChild(script);
        });
    }

    async search(query, continuation = null) {
        // Asegurar inicialización
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
                // Nueva búsqueda
                search = await this.youtube.search(query, { 
                    type: 'video',
                    sort_by: 'relevance'
                });
            }
            
            const videos = search.videos || [];
            console.log(`📹 ${videos.length} videos encontrados con YouTube.js`);
            
            return {
                items: videos.map(video => this.formatVideo(video)),
                nextpage: search.has_continuation ? search : null,
                query: query,
                total: search.estimated_results || videos.length
            };
            
        } catch (error) {
            console.error('❌ Error en búsqueda YouTube.js:', error);
            throw error;
        }
    }

    formatVideo(video) {
        try {
            return {
                videoId: video.id,
                title: video.title?.text || video.title || 'Título no disponible',
                thumbnail: this.getBestThumbnail(video),
                duration: this.getDuration(video),
                uploaderName: video.author?.name || video.channel?.name || 'Canal desconocido',
                author: video.author?.name || video.channel?.name || 'Canal desconocido',
                url: `https://www.youtube.com/watch?v=${video.id}`,
                views: video.view_count?.text || video.views?.text || '0',
                published: video.published?.text || video.published_time?.text || ''
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
            if (video.thumbnails && video.thumbnails.length > 0) {
                // Buscar la mejor calidad disponible
                const thumbnail = video.thumbnails.find(t => t.width >= 320) || video.thumbnails[0];
                return thumbnail.url;
            }
            if (video.thumbnail?.url) return video.thumbnail.url;
            return './electronic.ico';
        } catch (e) {
            return './electronic.ico';
        }
    }

    getDuration(video) {
        try {
            if (video.duration?.seconds_total) {
                return video.duration.seconds_total;
            }
            if (video.duration?.text) {
                return this.parseDurationText(video.duration.text);
            }
            return 0;
        } catch (e) {
            return 0;
        }
    }

    parseDurationText(durationText) {
        if (!durationText || typeof durationText !== 'string') return 0;
        
        try {
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

    // Método para verificar si está disponible
    isAvailable() {
        return this.initialized && this.youtube !== null;
    }
}

// Crear instancia global pero no inicializar automáticamente
window.youtubeJSClient = new YouTubeJSClient();

console.log('✅ YouTube.js Client cargado (inicialización bajo demanda)');
