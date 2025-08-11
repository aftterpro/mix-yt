// Utilidades y Funciones Auxiliares
import { CONFIG } from './config.js';

export class Utils {
    // Debounce para optimizar eventos frecuentes
    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }

    // Formato MM:SS para mostrar duración
    static formatDuration(duration) {
        if (isNaN(duration) || duration < 0) {
            return "0:00";
        }
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
        return `${minutes}:${formattedSeconds}`;
    }

    // Parsear duración (de varios formatos a segundos)
    static parseDuration(durationInput) {
        if (typeof durationInput === 'number') {
            return Math.floor(durationInput);
        }
        if (typeof durationInput !== 'string') return 0;

        // Intentar formato PT0H0M0S (YouTube API)
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

        // Intentar parsear como número directo
        const directNumber = parseInt(durationInput, 10);
        if (!isNaN(directNumber)) {
            return directNumber;
        }

        return 0;
    }

    // Extraer ID de playlist de URL
    static extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            console.error("URL inválida para extraer ID de playlist:", url);
            return null;
        }
    }

    // Obtener instancia aleatoria de Piped
    static getRandomPipedInstance() {
        const randomIndex = Math.floor(Math.random() * CONFIG.PIPED_INSTANCES.length);
        return CONFIG.PIPED_INSTANCES[randomIndex];
    }

    // Fetch con reintentos
    static async fetchDataWithRetry(url, options = {}, maxRetries = 2, retryDelay = 800) {
        let retries = 0;
        while (retries <= maxRetries) {
            try {
                console.log(`fetchDataWithRetry: Intento ${retries + 1} para ${url}`);
                const response = await fetch(url, options);
                if (!response.ok) {
                    let errorBodyText = `HTTP error! status: ${response.status}`;
                    try { 
                        errorBodyText = await response.text(); 
                    } catch(e) {}
                    throw new Error(errorBodyText);
                }
                return await response.json();
            } catch (error) {
                console.error(`Error fetching ${url}, reintento ${retries + 1}/${maxRetries + 1}:`, error.message);
                retries++;
                if (retries <= maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelay * retries));
                } else {
                    console.error(`fetchDataWithRetry: Fallaron todos los ${maxRetries + 1} intentos para ${url}`);
                    throw error;
                }
            }
        }
    }

    // Obtener info de Playlist usando Piped
    static async getPlaylistInfo(playlistId) {
        const instanceUrl = Utils.getRandomPipedInstance();
        const targetUrl = `${instanceUrl}/playlists/${playlistId}`;
        
        try {
            const data = await Utils.fetchDataWithRetry(targetUrl);
            if (!data || !data.relatedStreams) {
                throw new Error("La respuesta de la API no contiene videos válidos.");
            }
            return data;
        } catch (error) {
            console.error("Error al obtener la información de la playlist:", error.message);
            throw error;
        }
    }

    // Validar si un elemento está visible en el viewport
    static isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // Scroll suave a un elemento
    static scrollToElement(element, behavior = 'smooth') {
        if (element && typeof element.scrollIntoView === 'function') {
            element.scrollIntoView({
                behavior: behavior,
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }

    // Generar ID único
    static generateUniqueId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Validar URL de YouTube
    static isValidYouTubeUrl(url) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        return youtubeRegex.test(url);
    }

    // Extraer video ID de URL de YouTube
    static extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        return match ? match[1] : null;
    }

    // Limpiar string para uso como ID HTML
    static sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9-_]/g, '_');
    }

    // Throttle para limitar frecuencia de ejecución
    static throttle(func, delay) {
        let timeoutId;
        let lastExecTime = 0;
        return function (...args) {
            const currentTime = Date.now();
            if (currentTime - lastExecTime > delay) {
                func.apply(this, args);
                lastExecTime = currentTime;
            } else {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    func.apply(this, args);
                    lastExecTime = Date.now();
                }, delay - (currentTime - lastExecTime));
            }
        };
    }

    // Formatear número de vistas
    static formatViewCount(count) {
        if (count >= 1000000) {
            return (count / 1000000).toFixed(1) + 'M';
        } else if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'K';
        }
        return count.toString();
    }

    // Formatear fecha relativa
    static formatRelativeTime(date) {
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            return 'hace 1 día';
        } else if (diffDays < 30) {
            return `hace ${diffDays} días`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
        } else {
            const years = Math.floor(diffDays / 365);
            return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
        }
    }

    // Copiar texto al portapapeles
    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback para navegadores que no soportan clipboard API
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (err) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    // Detectar si el dispositivo es móvil
    static isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // Detectar soporte para touch
    static isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    // Escape HTML para prevenir XSS
    static escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Deep clone de objetos
    static deepClone(obj) {
        if (obj === null || typeof obj !== "object") return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        if (typeof obj === "object") {
            const copy = {};
            Object.keys(obj).forEach(key => {
                copy[key] = Utils.deepClone(obj[key]);
            });
            return copy;
        }
    }

    // Comparar arrays por contenido
    static arraysEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (a.length !== b.length) return false;

        for (let i = 0; i < a.length; ++i) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    // Wait/Sleep utility
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
