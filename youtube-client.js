// youtube-scraper.js - Sistema sin API keys ni dependencias
console.log('🎵 Cargando YouTube Scraper (sin API keys)...');

class YouTubeScraper {
    constructor() {
        this.initialized = false;
        this.corsProxy = 'https://api.allorigins.win/raw?url=';
        // Fallback proxies
        this.proxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/'
        ];
        this.currentProxyIndex = 0;
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Scraper inicializado (sin API keys)');
        return true;
    }

    getCurrentProxy() {
        return this.proxies[this.currentProxyIndex];
    }

    rotateProxy() {
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
        console.log(`🔄 Rotando proxy: ${this.getCurrentProxy()}`);
    }

    async search(query, continuation = null) {
        if (!this.initialized) await this.init();

        try {
            console.log(`🔍 Buscando sin API: "${query}"${continuation ? ' (página siguiente)' : ''}`);
            
            // Usar el endpoint de búsqueda interna de YouTube
            const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
            const proxiedUrl = this.getCurrentProxy() + encodeURIComponent(searchUrl);
            
            const response = await fetch(proxiedUrl);
            
            if (!response.ok) {
                this.rotateProxy();
                throw new Error(`Error de proxy: ${response.status}`);
            }
            
            const html = await response.text();
            const videos = this.extractVideosFromHTML(html);
            
            console.log(`📹 ${videos.length} videos extraídos`);
            
            return {
                items: videos,
                nextpage: null, // Por simplicidad, no implementamos paginación
                query: query,
                total: videos.length
            };

        } catch (error) {
            console.error('❌ Error en scraping:', error);
            // Fallback a tu sistema Piped actual
            throw error;
        }
    }

    extractVideosFromHTML(html) {
        try {
            const videos = [];
            
            // Buscar el script con datos JSON
            const scriptMatch = html.match(/var ytInitialData = ({.*?});/);
            if (scriptMatch) {
                const data = JSON.parse(scriptMatch[1]);
                const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
                
                if (contents) {
                    contents.forEach(section => {
                        const items = section?.itemSectionRenderer?.contents || [];
                        items.forEach(item => {
                            const videoRenderer = item.videoRenderer;
                            if (videoRenderer) {
                                videos.push(this.formatScrapedVideo(videoRenderer));
                            }
                        });
                    });
                }
            }
            
            // Fallback: usar regex para extraer datos básicos
            if (videos.length === 0) {
                videos.push(...this.extractWithRegex(html));
            }
            
            return videos.slice(0, 20); // Limitar a 20 resultados
            
        } catch (error) {
            console.error('❌ Error extrayendo videos:', error);
            return [];
        }
    }

    formatScrapedVideo(videoRenderer) {
        try {
            const videoId = videoRenderer.videoId;
            const title = videoRenderer.title?.runs?.[0]?.text || 'Título no disponible';
            const thumbnail = videoRenderer.thumbnail?.thumbnails?.[0]?.url || './electronic.ico';
            const duration = this.parseScrapedDuration(videoRenderer.lengthText?.simpleText);
            const channel = videoRenderer.ownerText?.runs?.[0]?.text || 'Canal desconocido';
            
            return {
                videoId,
                title,
                thumbnail,
                duration,
                uploaderName: channel,
                author: channel,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                views: videoRenderer.viewCountText?.simpleText || '0',
                published: videoRenderer.publishedTimeText?.simpleText || ''
            };
        } catch (error) {
            return {
                videoId: Math.random().toString(36),
                title: 'Error extrayendo video',
                thumbnail: './electronic.ico',
                duration: 0,
                uploaderName: 'Desconocido',
                author: 'Desconocido'
            };
        }
    }

    extractWithRegex(html) {
        const videos = [];
        const videoRegex = /"videoId":"([^"]+)"/g;
        const titleRegex = /"title":{"runs":\[{"text":"([^"]+)"/g;
        
        let match;
        const videoIds = [];
        
        while ((match = videoRegex.exec(html)) !== null) {
            videoIds.push(match[1]);
        }
        
        videoIds.slice(0, 10).forEach((videoId, index) => {
            videos.push({
                videoId,
                title: `Video ${index + 1}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                duration: 0,
                uploaderName: 'YouTube',
                author: 'YouTube'
            });
        });
        
        return videos;
    }

    parseScrapedDuration(durationText) {
        if (!durationText) return 0;
        
        const parts = durationText.split(':').reverse();
        let seconds = 0;
        
        parts.forEach((part, index) => {
            seconds += parseInt(part) * Math.pow(60, index);
        });
        
        return seconds || 0;
    }

    isAvailable() {
        return this.initialized;
    }

    async getPlaylist(playlistId) {
        // Implementar scraping de playlists si es necesario
        throw new Error('Scraping de playlists no implementado aún');
    }
}

// Crear instancia global
window.youtubeJSClient = new YouTubeScraper();

console.log('✅ YouTube Scraper cargado');
