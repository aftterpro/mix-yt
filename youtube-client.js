// youtube-client.js - Sistema con proxy CORS para Piped
console.log('🎵 Cargando YouTube Client con proxy CORS...');

class YouTubeSimplifiedClient {
    constructor() {
        this.initialized = false;
        // Usar la función específica de Piped en Netlify
        this.netlifyFunction = '/.netlify/functions/search';
        // Instancias de Piped como fallback directo
        this.pipedInstances = [
            "https://api.piped.private.coffee"
         //   "https://pipedapi.orangenet.cc", 
          //  "https://api.piped.adminforge.de"
        ];
        this.currentInstanceIndex = 0;
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Client inicializado con proxy CORS');
        return true;
    }

    getCurrentInstance() {
        return this.pipedInstances[this.currentInstanceIndex];
    }

    rotateInstance() {
        this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.pipedInstances.length;
        console.log(`🔄 Rotando a instancia: ${this.getCurrentInstance()}`);
    }

    async search(query, continuation = null) {
        if (!this.initialized) await this.init();

        console.log(`🔍 Búsqueda: "${query}"${continuation ? ' (página siguiente)' : ''}`);

        try {
            return await this.searchViaCorsProxy(query, continuation);
        } catch (error) {
            console.warn('⚠️ Error con proxy CORS:', error.message);
            
            // Fallback directo (aunque tenga CORS)
            try {
                console.log('🔄 Intentando acceso directo...');
                return await this.searchDirect(query, continuation);
            } catch (directError) {
                console.error('❌ Error con acceso directo:', directError.message);
                // Fallback a resultados generados
                return this.searchFallback(query, continuation);
            }
        }
    }

    async searchViaCorsProxy(query, continuation) {
        console.log('📡 Usando función Piped de Netlify');
        
        let targetUrl;
        let fetchOptions = {
            headers: {
                'Accept': 'application/json'
            }
        };

        if (continuation) {
            console.log(`📄 Paginación via función Netlify`);
            
            // Construir URL para paginación
            const encodedQuery = encodeURIComponent(query);
            const encodedToken = encodeURIComponent(JSON.stringify(continuation));
            
            targetUrl = `/.netlify/functions/piped-search?q=${encodedQuery}&nextpage=${encodedToken}`;
            fetchOptions.method = 'GET';
            
        } else {
            // Primera búsqueda
            targetUrl = `/.netlify/functions/piped-search?q=${encodeURIComponent(query)}`;
            fetchOptions.method = 'GET';
        }

        console.log(`📡 Netlify Function URL: ${targetUrl.substring(0, 80)}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        fetchOptions.signal = controller.signal;

        try {
            const response = await fetch(targetUrl, fetchOptions);
            clearTimeout(timeoutId);
            
            console.log(`📊 Respuesta Netlify: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Error desconocido');
                throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
            }

            const data = await response.json();
            return this.normalizeResponse(data, query, continuation);

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Timeout de búsqueda (15s)');
            }
            
            throw error;
        }
    }

    async searchDirect(query, continuation) {
        const instanceUrl = this.getCurrentInstance();
        let targetUrl;
        let fetchOptions = {
            headers: {
                'User-Agent': 'YT-CrossMix-Search/2.0',
                'Accept': 'application/json'
            },
            mode: 'cors'
        };

        if (continuation) {
            // Para paginación directa, usar GET con parámetros
            const encodedQuery = encodeURIComponent(query);
            const encodedToken = encodeURIComponent(JSON.stringify(continuation));
            
            targetUrl = `${instanceUrl}/nextpage/search?query=${encodedQuery}&nextpage=${encodedToken}`;
            fetchOptions.method = 'GET';
            
        } else {
            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
        }

        console.log(`🔗 Directo: ${targetUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        fetchOptions.signal = controller.signal;

        try {
            const response = await fetch(targetUrl, fetchOptions);
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                // Rotar instancia automáticamente si falla
                this.rotateInstance();
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return this.normalizeResponse(data, query, continuation);

        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    normalizeResponse(data, query, continuation) {
        console.log(`📊 Datos recibidos:`, {
            itemsCount: data.items?.length || 0,
            hasNextpage: !!data.nextpage,
            nextpageType: typeof data.nextpage
        });

        // Normalizar respuesta
        const items = (data.items || []).filter(item => 
            item && 
            item.title && 
            (item.url || item.videoId) &&
            item.thumbnail &&
            !item.url?.includes('/channel/') &&
            !item.url?.includes('/playlist/')
        ).map(item => ({
            videoId: item.videoId || this.extractVideoId(item.url),
            title: item.title.trim(),
            thumbnail: item.thumbnail,
            duration: typeof item.duration === 'number' ? item.duration : this.parseDurationString(item.duration),
            uploaderName: item.uploaderName?.trim() || 'Unknown',
            url: item.url,
            views: item.views || 0,
            uploadedDate: item.uploadedDate || null
        }));

        console.log(`✅ ${items.length} videos válidos procesados`);

        return {
            items: items,
            nextpage: data.nextpage || null,
            suggestion: data.suggestion || null,
            corrected: data.corrected || false,
            metadata: {
                query: query,
                timestamp: new Date().toISOString(),
                resultsCount: items.length,
                hasNextPage: !!data.nextpage,
                isNextPageRequest: !!continuation
            }
        };
    }

    // Extraer videoId de URL
    extractVideoId(url) {
        if (!url) return null;
        
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/ // ID directo
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        
        return url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
    }

    // Parsear duración de string a segundos
    parseDurationString(duration) {
        if (typeof duration === 'number') return duration;
        if (!duration || typeof duration !== 'string') return 0;
        
        // Formato MM:SS o HH:MM:SS
        const parts = duration.split(':').map(p => parseInt(p, 10));
        
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        } else if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        
        return 0;
    }

    searchFallback(query, continuation) {
        console.log('🔄 Usando fallback de resultados populares');
        
        // Base de datos expandida de música popular
        const musicDatabase = [
            // Pop Internacional
            { artist: 'Taylor Swift', song: 'Anti-Hero', id: 'b1kbLWvqugk', genre: 'pop' },
            { artist: 'Taylor Swift', song: 'Shake It Off', id: 'nfWlot6h_JM', genre: 'pop' },
            { artist: 'Ariana Grande', song: 'positions', id: 'tcYodQoapMg', genre: 'pop' },
            { artist: 'Dua Lipa', song: 'Levitating', id: 'TUVcZfQe-Kw', genre: 'pop' },
            { artist: 'The Weeknd', song: 'Blinding Lights', id: 'fHI8X4OXluQ', genre: 'r&b' },
            { artist: 'Harry Styles', song: 'As It Was', id: 'H5v3kku4y6Q', genre: 'pop' },
            { artist: 'Billie Eilish', song: 'bad guy', id: 'DyDfgMOUjCI', genre: 'alternative' },
            { artist: 'Ed Sheeran', song: 'Shape of You', id: 'JGwWNGJdvx8', genre: 'pop' },
            
            // Reggaeton/Latino
            { artist: 'Bad Bunny', song: 'Tití Me Preguntó', id: 'kGh_h2eKe8k', genre: 'reggaeton' },
            { artist: 'Bad Bunny', song: 'Me Porto Bonito', id: 'saGYMhApaH8', genre: 'reggaeton' },
            { artist: 'Karol G', song: 'BICHOTA', id: 'RqrXhwS33yc', genre: 'reggaeton' },
            { artist: 'J Balvin', song: 'Mi Gente', id: 'qqR8Q-wAW3E', genre: 'reggaeton' },
            
            // Rock/Alternative  
            { artist: 'Imagine Dragons', song: 'Believer', id: '7wtfhZwyrcc', genre: 'rock' },
            { artist: 'OneRepublic', song: 'Counting Stars', id: 'hT_nvWreIhg', genre: 'pop-rock' },
            { artist: 'Maroon 5', song: 'Sugar', id: '09R8_2nJtjg', genre: 'pop-rock' },
            
            // Hip-Hop/Rap
            { artist: 'Post Malone', song: 'Circles', id: 'wXhTHyIgQ_U', genre: 'hip-hop' },
            { artist: 'Drake', song: 'God\'s Plan', id: 'xpVfcZ0ZcFM', genre: 'hip-hop' },
            
            // Electrónica/Dance
            { artist: 'David Guetta', song: 'Titanium', id: 'JRfuAukYTKg', genre: 'electronic' },
            { artist: 'Calvin Harris', song: 'Feel So Close', id: 'dGghkjpNCQ8', genre: 'electronic' },
            
            // Clásicos
            { artist: 'Queen', song: 'Bohemian Rhapsody', id: 'fJ9rUzIMcZQ', genre: 'rock' },
            { artist: 'Michael Jackson', song: 'Billie Jean', id: 'Zi_XLOBDo_Y', genre: 'pop' }
        ];

        const queryLower = query.toLowerCase();
        
        // Búsqueda inteligente
        let matches = musicDatabase.filter(video => {
            const artistMatch = video.artist.toLowerCase().includes(queryLower);
            const songMatch = video.song.toLowerCase().includes(queryLower);
            const genreMatch = video.genre.toLowerCase().includes(queryLower);
            
            return artistMatch || songMatch || genreMatch;
        });

        // Si no hay coincidencias, usar resultados populares mezclados
        if (matches.length === 0) {
            matches = this.shuffleArray([...musicDatabase]).slice(0, 20);
        } else {
            matches = this.shuffleArray([...matches]).slice(0, 15);
        }

        const results = matches.map(video => ({
            videoId: video.id,
            title: `${video.artist} - ${video.song}`,
            thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
            duration: 180 + Math.floor(Math.random() * 120), // 3-5 minutos
            uploaderName: video.artist,
            author: video.artist,
            url: `https://www.youtube.com/watch?v=${video.id}`,
            views: this.generateViews(),
            published: this.generatePublishDate()
        }));

        return {
            items: results,
            nextpage: null, // Sin paginación en fallback
            query: query,
            total: results.length,
            metadata: {
                source: 'fallback',
                query: query,
                timestamp: new Date().toISOString()
            }
        };
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    generateViews() {
        const min = 1000000; // 1M
        const max = 500000000; // 500M
        return Math.floor(Math.random() * (max - min) + min).toLocaleString();
    }

    generatePublishDate() {
        const dates = [
            'hace 1 semana', 'hace 2 semanas', 'hace 1 mes', 
            'hace 2 meses', 'hace 3 meses', 'hace 6 meses', 'hace 1 año'
        ];
        return dates[Math.floor(Math.random() * dates.length)];
    }

    isAvailable() {
        return this.initialized;
    }

    // Método para obtener playlist via función Netlify (implementación futura)
    async getPlaylist(playlistId) {
        // Por ahora intentar acceso directo
        const instanceUrl = this.getCurrentInstance();
        const targetUrl = `${instanceUrl}/playlists/${playlistId}`;
        
        try {
            const response = await fetch(targetUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'YT-CrossMix-Search/2.0'
                },
                mode: 'cors'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`❌ Error obteniendo playlist ${playlistId}:`, error);
            throw error;
        }
    }

    // Método para testing de la función Netlify
    async testNetlifyFunction() {
        console.log('🧪 Probando función Netlify piped-search...');
        
        try {
            const testUrl = `${this.netlifyFunction}?q=test`;
            console.log(`🔍 Probando: ${testUrl}`);
            
            const start = Date.now();
            const response = await fetch(testUrl, {
                headers: {
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(5000)
            });
            
            const time = Date.now() - start;
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Función Netlify: OK (${time}ms, ${data.items?.length || 0} items)`);
                return {
                    status: 'OK',
                    responseTime: `${time}ms`,
                    itemsCount: data.items?.length || 0,
                    instance: data.metadata?.instance || 'unknown'
                };
            } else {
                console.log(`❌ Función Netlify: ERROR ${response.status}`);
                return {
                    status: `ERROR ${response.status}`,
                    responseTime: `${time}ms`,
                    itemsCount: 0
                };
            }
        } catch (error) {
            console.log(`❌ Función Netlify: FAILED - ${error.message}`);
            return {
                status: `FAILED: ${error.message}`,
                responseTime: 'N/A',
                itemsCount: 0
            };
        }
    }
}

// Crear instancia global
window.youtubeJSClient = new YouTubeSimplifiedClient();

// Función global para testing
window.testNetlifyPipedFunction = function() {
    return window.youtubeJSClient.testNetlifyFunction();
};

console.log('✅ YouTube Client con función Netlify piped-search cargado');
