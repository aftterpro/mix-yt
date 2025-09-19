// youtube-client.js - Cliente YouTube.js con scroll infinito
console.log('🎵 Cargando YouTube.js Client...');

class YouTubeJSClient {
    constructor() {
        this.youtube = null;
        this.initialized = false;
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Inicializando YouTube.js...');
            
            // Importar YouTube.js desde CDN
            if (!window.Innertube) {
                await this.loadYouTubeJS();
            }
            
            this.youtube = await window.Innertube.create();
            this.initialized = true;
            console.log('✅ YouTube.js inicializado correctamente');
            
        } catch (error) {
            console.error('❌ Error inicializando YouTube.js:', error);
            this.initialized = false;
        }
    }

    async loadYouTubeJS() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/youtubei.js@latest/dist/bundle.js';
            script.onload = () => {
                console.log('📦 YouTube.js CDN cargado');
                resolve();
            };
            script.onerror = () => reject(new Error('Error cargando YouTube.js'));
            document.head.appendChild(script);
        });
    }

    async search(query, continuation = null) {
        if (!this.initialized) {
            await this.init();
        }

        if (!this.youtube) {
            throw new Error('YouTube.js no está disponible');
        }

        try {
            console.log(`🔍 Buscando con YouTube.js: "${query}"${continuation ? ' (página siguiente)' : ''}`);
            
            let search;
            if (continuation) {
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
            console.log(`📹 ${videos.length} videos encontrados`);
            
            return {
                items: videos.map(video => this.formatVideo(video)),
                nextpage: search.has_continuation ? search : null, // Pasar objeto completo
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
                thumbnail: video.thumbnails?.[0]?.url || video.thumbnail?.url || './electronic.ico',
                duration: video.duration?.seconds_total || this.parseDurationText(video.duration?.text),
                uploaderName: video.author?.name || video.channel?.name || 'Canal desconocido',
                author: video.author?.name || video.channel?.name || 'Canal desconocido',
                url: `https://www.youtube.com/watch?v=${video.id}`,
                views: video.view_count?.text || video.views?.text,
                published: video.published?.text || video.published_time?.text
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

    parseDurationText(durationText) {
        if (!durationText) return 0;
        
        const parts = durationText.split(':').reverse();
        let seconds = 0;
        
        parts.forEach((part, index) => {
            seconds += parseInt(part) * Math.pow(60, index);
        });
        
        return seconds || 0;
    }

    async getPlaylist(playlistId) {
        if (!this.initialized) {
            await this.init();
        }

        try {
            console.log(`📋 Obteniendo playlist: ${playlistId}`);
            const playlist = await this.youtube.getPlaylist(playlistId);
            
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

    // Método para obtener sugerencias de búsqueda
    async getSearchSuggestions(query) {
        if (!this.initialized) await this.init();
        
        try {
            const suggestions = await this.youtube.getSearchSuggestions(query);
            return suggestions.map(s => s.text);
        } catch (error) {
            console.warn('⚠️ Error obteniendo sugerencias:', error);
            return [];
        }
    }
}

// Crear instancia global
window.youtubeJSClient = new YouTubeJSClient();

console.log('✅ YouTube.js Client cargado');
