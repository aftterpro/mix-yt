// youtube-direct.js - API directa de YouTube sin dependencias
console.log('🎵 Cargando YouTube Direct API...');

class YouTubeDirectClient {
    constructor() {
        this.initialized = false;
        this.apiKeys = [
            'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', // Clave pública de YouTube
            'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
            'AIzaSyCG-5uKBM8N8Kjb8vCzwqzJX8X5JzDyf6w'
        ];
        this.currentApiKeyIndex = 0;
        this.baseUrl = 'https://www.googleapis.com/youtube/v3';
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Direct API inicializado');
        return true;
    }

    getCurrentApiKey() {
        return this.apiKeys[this.currentApiKeyIndex];
    }

    rotateApiKey() {
        this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % this.apiKeys.length;
        console.log(`🔄 Rotando a API key ${this.currentApiKeyIndex + 1}`);
    }

    async search(query, pageToken = null) {
        if (!this.initialized) await this.init();

        try {
            console.log(`🔍 Búsqueda directa YouTube: "${query}"${pageToken ? ' (página siguiente)' : ''}`);
            
            let url = `${this.baseUrl}/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=20&key=${this.getCurrentApiKey()}`;
            
            if (pageToken) {
                url += `&pageToken=${pageToken}`;
            }

            const response = await fetch(url);
            
            if (response.status === 403) {
                // Cuota agotada, rotar clave
                this.rotateApiKey();
                throw new Error('Cuota agotada, intenta de nuevo');
            }
            
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Obtener duraciones de videos (requiere llamada adicional)
            const videoIds = data.items?.map(item => item.id.videoId).join(',');
            const detailedVideos = videoIds ? await this.getVideoDetails(videoIds) : [];
            
            const formattedVideos = data.items?.map(item => {
                const details = detailedVideos.find(d => d.id === item.id.videoId);
                return this.formatVideo(item, details);
            }) || [];

            console.log(`📹 ${formattedVideos.length} videos encontrados`);

            return {
                items: formattedVideos,
                nextpage: data.nextPageToken || null,
                query: query,
                total: formattedVideos.length
            };

        } catch (error) {
            console.error('❌ Error en búsqueda YouTube Direct:', error);
            throw error;
        }
    }

    async getVideoDetails(videoIds) {
        try {
            const url = `${this.baseUrl}/videos?part=contentDetails,statistics&id=${videoIds}&key=${this.getCurrentApiKey()}`;
            const response = await fetch(url);
            
            if (!response.ok) return [];
            
            const data = await response.json();
            return data.items || [];
        } catch (error) {
            console.warn('⚠️ Error obteniendo detalles de videos:', error);
            return [];
        }
    }

    formatVideo(item, details = null) {
        try {
            return {
                videoId: item.id.videoId,
                title: item.snippet.title,
                thumbnail: this.getBestThumbnail(item.snippet.thumbnails),
                duration: details ? this.parseDuration(details.contentDetails.duration) : 0,
                uploaderName: item.snippet.channelTitle,
                author: item.snippet.channelTitle,
                url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                views: details?.statistics?.viewCount || '0',
                published: item.snippet.publishedAt
            };
        } catch (error) {
            console.warn('⚠️ Error formateando video:', error);
            return {
                videoId: item.id?.videoId || Math.random().toString(36),
                title: 'Error al cargar video',
                thumbnail: './electronic.ico',
                duration: 0,
                uploaderName: 'Desconocido',
                author: 'Desconocido'
            };
        }
    }

    getBestThumbnail(thumbnails) {
        if (!thumbnails) return './electronic.ico';
        
        // Priorizar calidad: maxres > high > medium > default
        if (thumbnails.maxres) return thumbnails.maxres.url;
        if (thumbnails.high) return thumbnails.high.url;
        if (thumbnails.medium) return thumbnails.medium.url;
        if (thumbnails.default) return thumbnails.default.url;
        
        return './electronic.ico';
    }

    parseDuration(duration) {
        if (!duration) return 0;
        
        // Formato PT4M13S
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;
        
        const hours = parseInt(match[1] || '0');
        const minutes = parseInt(match[2] || '0');
        const seconds = parseInt(match[3] || '0');
        
        return hours * 3600 + minutes * 60 + seconds;
    }

    async getPlaylist(playlistId) {
        try {
            console.log(`📋 Obteniendo playlist: ${playlistId}`);
            
            // Obtener información de la playlist
            let url = `${this.baseUrl}/playlists?part=snippet&id=${playlistId}&key=${this.getCurrentApiKey()}`;
            let response = await fetch(url);
            let data = await response.json();
            
            const playlistInfo = data.items?.[0];
            if (!playlistInfo) throw new Error('Playlist no encontrada');
            
            // Obtener videos de la playlist
            url = `${this.baseUrl}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${this.getCurrentApiKey()}`;
            response = await fetch(url);
            data = await response.json();
            
            const videos = data.items?.map(item => ({
                videoId: item.snippet.resourceId.videoId,
                title: item.snippet.title,
                thumbnail: this.getBestThumbnail(item.snippet.thumbnails),
                duration: 0, // Requeriría llamada adicional
                uploaderName: item.snippet.channelTitle,
                author: item.snippet.channelTitle
            })) || [];
            
            return {
                id: playlistId,
                name: playlistInfo.snippet.title,
                description: playlistInfo.snippet.description,
                videoCount: videos.length,
                videos: videos
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo playlist:', error);
            throw error;
        }
    }

    isAvailable() {
        return this.initialized;
    }

    // Método para obtener tendencias
    async getTrending(regionCode = 'US') {
        try {
            const url = `${this.baseUrl}/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=20&key=${this.getCurrentApiKey()}`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('Error obteniendo tendencias');
            
            const data = await response.json();
            
            return {
                items: data.items?.map(item => ({
                    videoId: item.id,
                    title: item.snippet.title,
                    thumbnail: this.getBestThumbnail(item.snippet.thumbnails),
                    duration: this.parseDuration(item.contentDetails.duration),
                    uploaderName: item.snippet.channelTitle,
                    author: item.snippet.channelTitle,
                    views: item.statistics.viewCount,
                    published: item.snippet.publishedAt
                })) || []
            };
        } catch (error) {
            console.error('❌ Error obteniendo tendencias:', error);
            throw error;
        }
    }
}

// Crear instancia global
window.youtubeJSClient = new YouTubeDirectClient();

console.log('✅ YouTube Direct Client cargado (sin dependencias externas)');
