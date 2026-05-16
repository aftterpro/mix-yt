// =============================================
// YT CrossMix - Spotify Effect
// =============================================

const CONFIG = {
    origin: window.location.origin,
    apiBase: "/search"
};

const CROSSFADE_DURATION = 12;

window.playersInitialized = false;
let currentPlayer = 1;
let player1, player2;
let playerReady = false;
window.playlistVideos = [];
let playlistVideos = window.playlistVideos;
let manualVideos = [];
let monitorInterval;
let playersInitialized = false;
let youtubeAPIReady = false;
let currentIndex = 0;
let reproduccionIniciada = false;

// =============================================
// SPOTIFY COLOR EXTRACTOR - Paleta dinámica
// =============================================
class SpotifyColorEngine {
    constructor() {
        this.currentPalette = { primary: '#1DB954', dark: '#121212', text: '#fff' };
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
}

   async extractFromThumbnail(thumbnailUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        // Sin crossOrigin para evitar CORS bloqueado — usamos el fallback de paleta
        img.onload = () => {
            try {
                this.canvas.width = 50;
                this.canvas.height = 50;
                this.ctx.drawImage(img, 0, 0, 50, 50);
                const data = this.ctx.getImageData(0, 0, 50, 50).data;
                resolve(this.getDominantColors(data));
            } catch (e) {
                // CORS bloqueó getImageData — usamos color por hash de URL
                resolve(this.colorFromString(thumbnailUrl));
            }
        };
        img.onerror = () => resolve(this.colorFromString(thumbnailUrl));
        img.src = thumbnailUrl;  
    });
}

colorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    const hslColor = `hsl(${h}, 50%, 35%)`;
    const darkColor = `hsl(${h}, 50%, 20%)`;
    return {
        primary: hslColor,
        primaryDark: darkColor,
        text: '#ffffff',
        luminance: 0.3
    };
}

    getDominantColors(data) {
        const colorMap = {};
        for (let i = 0; i < data.length; i += 16) {
            const r = Math.floor(data[i] / 32) * 32;
            const g = Math.floor(data[i+1] / 32) * 32;
            const b = Math.floor(data[i+2] / 32) * 32;
            const key = `${r},${g},${b}`;
            colorMap[key] = (colorMap[key] || 0) + 1;
        }
        const sorted = Object.entries(colorMap).sort((a, b) => b[1] - a[1]);
        const dominant = sorted[0]?.[0]?.split(',').map(Number) || [29, 185, 84];

        const luminance = (0.299 * dominant[0] + 0.587 * dominant[1] + 0.114 * dominant[2]) / 255;
        const isDark = luminance < 0.5;

        return {
            primary: `rgb(${dominant[0]}, ${dominant[1]}, ${dominant[2]})`,
            primaryDark: `rgb(${Math.floor(dominant[0]*0.6)}, ${Math.floor(dominant[1]*0.6)}, ${Math.floor(dominant[2]*0.6)})`,
            text: isDark ? '#ffffff' : '#000000',
            luminance
        };
    }

    applyPalette(palette) {
        this.currentPalette = palette;
        const root = document.documentElement;

        root.style.setProperty('--spotify-accent', palette.primary);
        root.style.setProperty('--spotify-accent-dark', palette.primaryDark || palette.primary);

        // Extraer los valores RGB para usar opacidades RGBA de forma segura
        const rgbMatch = palette.primary.match(/\d+, \d+, \d+/);
        const rgb = rgbMatch ? rgbMatch[0] : '29, 185, 84'; // Default verde Spotify

        const nowPlayingSection = document.getElementById('now-playing-bg');
        if (nowPlayingSection) {
            // Gradiente mucho más suave (solo 15% opacidad inicial)
            nowPlayingSection.style.background = `linear-gradient(180deg, rgba(${rgb}, 0.15) 0%, rgba(${rgb}, 0.02) 40%, var(--spotify-black) 100%)`;
            nowPlayingSection.style.transition = 'background 1.5s ease';
        }

        const playerPanel = document.getElementById('player-panel');
        if (playerPanel) {
            // Fondo general casi negro
            playerPanel.style.background = `linear-gradient(160deg, rgba(${rgb}, 0.08) 0%, var(--spotify-black) 50%)`;
            playerPanel.style.transition = 'background 1.5s ease';
        }
    }
}

window.colorEngine = new SpotifyColorEngine();

// =============================================
// NOW PLAYING - Panel estilo Spotify
// =============================================
class NowPlayingManager {
    constructor() {
        this.currentVideo = null;
        this.isLiked = false;
        this.videoMode = false; // Guardamos el estado del modo video aquí
        this.createNowPlayingUI();
    }

     update(video) {
        this.currentVideo = video;
        if (!video) return;

        const title = document.getElementById('np-title');
        const artist = document.getElementById('np-artist');
        const artwork = document.getElementById('np-artwork');

        if (title) {
            title.textContent = video.title || 'Sin título';
            if (video.title && video.title.length > 30) {
                title.classList.add('scrolling-text');
            } else {
                title.classList.remove('scrolling-text');
            }
        }
        if (artist) artist.textContent = video.artist || video.uploaderName || 'Artista desconocido';

        const thumbUrl = video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/maxresdefault.jpg`;
        if (artwork) {
            artwork.style.opacity = '0';
            artwork.style.transform = 'scale(0.9) rotate(-2deg)';
            setTimeout(() => {
                artwork.src = thumbUrl;
                artwork.onload = () => {
                    artwork.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    // AQUI ESTÁ LA MAGIA: Solo restaurar opacidad si NO estamos en modo video
                    if (!this.videoMode) {
                        artwork.style.opacity = '1';
                    }
                    artwork.style.transform = 'scale(1) rotate(0deg)';
                };
            }, 200);
        }

        window.colorEngine.extractFromThumbnail(thumbUrl).then(palette => {
            window.colorEngine.applyPalette(palette);
        });
    }
createNowPlayingUI() {
        const panel = document.createElement('div');
        panel.id = 'spotify-now-playing';
        panel.innerHTML = `
            <div id="now-playing-bg"></div>
            <div class="np-artwork-container" style="transition: all 0.5s ease;">
                <div class="np-artwork-shadow"></div>
                <img id="np-artwork" src="" alt="artwork" class="np-artwork" style="transition: opacity 0.5s ease, transform 0.3s ease;">
                <div class="np-artwork-overlay" style="transition: opacity 0.5s ease;"></div>
            </div>
            <div class="np-info">
                <div class="np-title-row">
                    <div class="np-texts">
                        <div id="np-title" class="np-title">Esperando canción...</div>
                        <div id="np-artist" class="np-artist">Selecciona una playlist</div>
                    </div>
                    <button id="np-like-btn" class="np-action-btn" title="Me gusta"><i class="far fa-heart"></i></button>
                </div>
                <div class="np-progress-container">
                    <span id="np-current-time" class="np-time">0:00</span>
                    <div class="np-progress-bar" id="np-progress-bar">
                        <div class="np-progress-fill" id="np-progress-fill"></div>
                        <div class="np-progress-thumb" id="np-progress-thumb"></div>
                    </div>
                    <span id="np-total-time" class="np-time">0:00</span>
                </div>
                <div class="np-controls">
                    <button class="np-ctrl-btn" id="np-shuffle-btn" title="Aleatorio"><i class="fas fa-random"></i></button>
                    <button class="np-ctrl-btn" id="np-prev-btn" title="Anterior"><i class="fas fa-step-backward"></i></button>
                    <button class="np-ctrl-btn np-play-btn" id="np-play-pause-btn" title="Play/Pause"><i class="fas fa-play" id="np-play-icon"></i></button>
                    <button class="np-ctrl-btn" id="np-next-btn" title="Siguiente"><i class="fas fa-step-forward"></i></button>
                    <button class="np-ctrl-btn" id="np-repeat-btn" title="Repetir"><i class="fas fa-redo"></i></button>
                </div>
                <div class="np-volume-row">
                    <i class="fas fa-volume-down np-vol-icon"></i>
                    <div class="np-volume-bar" id="np-volume-bar">
                        <div class="np-volume-fill" id="np-volume-fill" style="width:80%"></div>
                        <div class="np-volume-thumb"></div>
                    </div>
                    <i class="fas fa-volume-up np-vol-icon"></i>
                    <div class="np-crossfade-label">
                        <i class="fas fa-water"></i><span id="np-crossfade-val">${CROSSFADE_DURATION}s</span>
                    </div>
                    <button id="np-view-toggle" class="np-ctrl-btn" title="Cambiar vista"><i class="fas fa-film"></i></button>
                </div>
            </div>
        `;
        document.getElementById('player-panel').prepend(panel);

        const style = document.createElement('style');
        style.textContent = `
            #spotify-now-playing {
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 20px 16px 12px;
                gap: 16px;
                flex: 1;
                overflow-y: auto;
                min-height: 0;
            }
            #now-playing-bg {
                position: absolute;
                inset: 0;
                pointer-events: none;
                z-index: 0;
            }
            .np-artwork-container {
                position: relative;
                width: 220px;
                height: 220px;
                flex-shrink: 0;
                z-index: 1;
                border-radius: 8px;
                overflow: hidden;
            }
            .np-info {
                width: 100%;
                position: relative;
                z-index: 1;
            }
            .video-player {
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                transition: opacity 0.5s ease;
            }
        `;
        document.head.appendChild(style);

        const videoContainer = document.getElementById('videoContainer');
        const artworkContainer = document.querySelector('.np-artwork-container');
        if (videoContainer && artworkContainer) {
            artworkContainer.appendChild(videoContainer);
           
        videoContainer.style.position = 'absolute';
        videoContainer.style.top = '0';
        videoContainer.style.left = '0';
        videoContainer.style.width = '100%';
        videoContainer.style.height = '100%';
 
        videoContainer.style.opacity = '1';            
        videoContainer.style.visibility = 'visible';   
        videoContainer.style.pointerEvents = 'none';
        videoContainer.style.zIndex = '0';  
        videoContainer.style.borderRadius = '8px';
        videoContainer.style.overflow = 'hidden';
            
            const p2 = document.getElementById('player2');
        if (p2) {
            p2.style.opacity = '0';
            p2.style.visibility = 'hidden';
            p2.style.pointerEvents = 'none';
            }
        }

        this.setupControls();
        this.setupProgressBarScrubbing();
        this.setupVolumeScrubbing();
        this.startProgressUpdater();
    }

    setupControls() {
        document.getElementById('np-play-pause-btn')?.addEventListener('click', () => {
            const player = currentPlayer === 1 ? player1 : player2;

            if (!reproduccionIniciada) {
                if (window.playlistVideos.length === 0) {
                    mostrarMensajeFlotante('⚠️ Añade una playlist o canción primero');
                    return;
                }
                reproduccionIniciada = true;
                currentIndex = 0;
                window.crossfadeTriggered = false;
                
                const tryPlay = () => {
                    if (playersInitialized) {
                        playFirstVideo();
                    } else {
                        setTimeout(tryPlay, 200);
                    }
                };
                tryPlay();
                return;
            }

            if (!player || typeof player.getPlayerState !== 'function') return;
            try {
                const state = player.getPlayerState();
                const icon = document.getElementById('np-play-icon');
                if (state === YT.PlayerState.PLAYING) {
                    player.pauseVideo();
                    if (icon) icon.className = 'fas fa-play';
                } else {
                    player.playVideo();
                    if (icon) icon.className = 'fas fa-pause';
                }
            } catch (e) {
                console.warn('Error en play-pause:', e);
            }
        });

        document.getElementById('np-next-btn')?.addEventListener('click', () => playNextVideo());
        document.getElementById('np-prev-btn')?.addEventListener('click', () => playPrevVideo());

        document.getElementById('np-shuffle-btn')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            btn.classList.toggle('active');
            if (btn.classList.contains('active')) {
                shufflePlaylist();
                mostrarMensajeFlotante('🔀 Modo aleatorio activado');
            } else {
                mostrarMensajeFlotante('Modo aleatorio desactivado');
            }
        });

        let repeatMode = 0; 
        document.getElementById('np-repeat-btn')?.addEventListener('click', (e) => {
            repeatMode = (repeatMode + 1) % 3;
            const btn = e.currentTarget;
            const icon = btn.querySelector('i');
            const modes = [
                { class: '', icon: 'fa-redo', label: 'Repetición desactivada' },
                { class: 'active', icon: 'fa-redo', label: '🔁 Repetir lista' },
                { class: 'active repeat-one', icon: 'fa-redo-alt', label: '🔂 Repetir canción' }
            ];
            btn.className = `np-ctrl-btn ${modes[repeatMode].class}`;
            if (icon) icon.className = `fas ${modes[repeatMode].icon}`;
            window.repeatMode = repeatMode;
            mostrarMensajeFlotante(modes[repeatMode].label);
        });

  document.getElementById('np-view-toggle')?.addEventListener('click', () => {
    this.videoMode = !this.videoMode;
    const videoContainer = document.getElementById('videoContainer');
    const artworkContainer = document.querySelector('.np-artwork-container');
    const artwork = document.getElementById('np-artwork');
    const overlay = document.querySelector('.np-artwork-overlay');
    const icon = document.querySelector('#np-view-toggle i');

    if (this.videoMode) {
        // MODO VIDEO
        if (artworkContainer) {
            artworkContainer.style.width = '100%';
            artworkContainer.style.height = 'auto';
            artworkContainer.style.aspectRatio = '16/9';
        }
        if (videoContainer) {
            // Mantener todo visible, solo traer al frente
            videoContainer.style.opacity = '1';
            videoContainer.style.visibility = 'visible'; 
            videoContainer.style.pointerEvents = 'auto';
            videoContainer.style.zIndex = '10'; // <-- Video por encima de la portada
        }
          
        const activeEl = document.getElementById(`player${currentPlayer}`);
        if (activeEl) {
            activeEl.style.opacity = '1';
            activeEl.style.visibility = 'visible';
        }
        if (artwork) artwork.style.opacity = '0';
        if (overlay) overlay.style.opacity = '0';
        if (icon) icon.className = 'fas fa-image';
        mostrarMensajeFlotante('🎬 Modo video');
    } else {
        // MODO PORTADA
        if (artworkContainer) {
            artworkContainer.style.width = '220px';
            artworkContainer.style.height = '220px';
            artworkContainer.style.aspectRatio = 'auto';
        }
        if (videoContainer) {
             videoContainer.style.opacity = '1'; 
            videoContainer.style.visibility = 'visible'; 
            videoContainer.style.pointerEvents = 'none';
            videoContainer.style.zIndex = '0';  
        }
        if (artwork) {
            artwork.style.opacity = '1';
            artwork.style.position = 'relative'; 
            artwork.style.zIndex = '2'; // <-- Portada por encima del video
        }
        if (overlay) overlay.style.opacity = '1';
        if (icon) icon.className = 'fas fa-film';
        mostrarMensajeFlotante('🖼️ Modo portada');
    }
});

        document.getElementById('np-like-btn')?.addEventListener('click', (e) => {
            this.isLiked = !this.isLiked;
            const icon = e.currentTarget.querySelector('i');
            if (icon) {
                icon.className = this.isLiked ? 'fas fa-heart' : 'far fa-heart';
                icon.style.color = this.isLiked ? '#1DB954' : '';
            }
            mostrarMensajeFlotante(this.isLiked ? '❤️ Añadido a favoritos' : 'Eliminado de favoritos');
        });
    }

    setupProgressBarScrubbing() {
        const bar = document.getElementById('np-progress-bar');
        if (!bar) return;
        let isDragging = false;

        bar.addEventListener('mousedown', (e) => {
            isDragging = true;
            this.seekTo(e, bar);
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) this.seekTo(e, bar);
        });
        document.addEventListener('mouseup', () => { isDragging = false; });

        bar.addEventListener('touchstart', (e) => {
            isDragging = true;
            this.seekTo(e.touches[0], bar);
        });
        document.addEventListener('touchmove', (e) => {
            if (isDragging) this.seekTo(e.touches[0], bar);
        });
        document.addEventListener('touchend', () => { isDragging = false; });
    }

    seekTo(e, bar) {
        const rect = bar.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const pct = x / rect.width;
        const player = currentPlayer === 1 ? player1 : player2;
        if (player && player.getDuration) {
            const duration = player.getDuration();
            player.seekTo(pct * duration, true);
        }
    }

    setupVolumeScrubbing() {
        const bar = document.getElementById('np-volume-bar');
        if (!bar) return;
        let isDragging = false;
        let currentVolume = 80;

        const setVolume = (e) => {
            const rect = bar.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            currentVolume = Math.round((x / rect.width) * 100);
            document.getElementById('np-volume-fill').style.width = currentVolume + '%';
            const player = currentPlayer === 1 ? player1 : player2;
            if (player) player.setVolume(currentVolume);
        };

        bar.addEventListener('mousedown', (e) => { isDragging = true; setVolume(e); });
        document.addEventListener('mousemove', (e) => { if (isDragging) setVolume(e); });
        document.addEventListener('mouseup', () => { isDragging = false; });
    }

    startProgressUpdater() {
        setInterval(() => {
            const player = currentPlayer === 1 ? player1 : player2;
            if (!player || !player.getCurrentTime) return;
            try {
                const current = player.getCurrentTime();
                const duration = player.getDuration();
                if (!duration || isNaN(current)) return;

                const pct = (current / duration) * 100;
                const fill = document.getElementById('np-progress-fill');
                const thumb = document.getElementById('np-progress-thumb');
                if (fill) fill.style.width = pct + '%';
                if (thumb) thumb.style.left = pct + '%';

                document.getElementById('np-current-time').textContent = formatDuration(Math.floor(current));
                document.getElementById('np-total-time').textContent = formatDuration(Math.floor(duration));

                // Actualizar estado play/pause
                const state = player.getPlayerState();
                const icon = document.getElementById('np-play-icon');
                if (icon) {
                    icon.className = state === YT.PlayerState.PLAYING ? 'fas fa-pause' : 'fas fa-play';
                }
            } catch (e) {}
        }, 500);
    }
}

window.nowPlayingManager = null; // Se inicializa en DOMContentLoaded

// =============================================
// SMART SEARCH - Búsqueda inteligente al estilo Spotify
// =============================================
class SmartSearch {
    constructor() {
        this.genres = [
            { name: 'Pop', icon: '🎵', query: 'pop hits 2024' },
            { name: 'Rock', icon: '🎸', query: 'rock classics' },
            { name: 'Hip-Hop', icon: '🎤', query: 'hip hop rap 2024' },
            { name: 'Electronic', icon: '🎛️', query: 'electronic dance music' },
            { name: 'Jazz', icon: '🎷', query: 'jazz music' },
            { name: 'Reggaeton', icon: '🌴', query: 'reggaeton 2024' },
            { name: 'R&B', icon: '🎙️', query: 'rnb soul music' },
            { name: 'Classical', icon: '🎻', query: 'classical music orchestra' },
            { name: 'Lo-fi', icon: '🌙', query: 'lofi hip hop chill beats' },
            { name: 'Metal', icon: '⚡', query: 'heavy metal rock' },
            { name: 'Latin', icon: '💃', query: 'latin pop music 2024' },
            { name: 'K-Pop', icon: '🌸', query: 'kpop 2024' }
        ];
        this.recentSearches = JSON.parse(localStorage.getItem('ytcm_recent_searches') || '[]');
        this.searchHistory = [];
        this.setupSmartUI();
    }

    setupSmartUI() {
        const searchPanel = document.getElementById('search-panel');
        if (!searchPanel) return;

        // Añadir géneros rápidos
        const genresContainer = document.createElement('div');
        genresContainer.id = 'genres-grid';
        genresContainer.innerHTML = `
            <div class="genres-title">Explora por género</div>
            <div class="genres-chips">
                ${this.genres.map(g => `
                    <button class="genre-chip" data-query="${g.query}">
                        <span class="genre-icon">${g.icon}</span>
                        <span>${g.name}</span>
                    </button>
                `).join('')}
            </div>
        `;
        searchPanel.insertBefore(genresContainer, document.getElementById('resultsContainer'));

        // Añadir sugerencias de búsqueda recientes
        this.renderRecentSearches();

        // Eventos de géneros
        genresContainer.querySelectorAll('.genre-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const query = chip.dataset.query;
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.value = query;
                performSearch(query);
                // Marcar chip activo
                genresContainer.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            });
        });
    }

    renderRecentSearches() {
        const existing = document.getElementById('recent-searches');
        if (existing) existing.remove();
        if (this.recentSearches.length === 0) return;

        const container = document.createElement('div');
        container.id = 'recent-searches';
        container.innerHTML = `
            <div class="recent-title">
                <span>Búsquedas recientes</span>
                <button id="clear-recent" class="clear-btn">Limpiar</button>
            </div>
            <div class="recent-chips">
                ${this.recentSearches.slice(0, 6).map(q => `
                    <button class="recent-chip" data-query="${q}">
                        <i class="fas fa-history"></i> ${q}
                    </button>
                `).join('')}
            </div>
        `;
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer) resultsContainer.before(container);

        container.querySelectorAll('.recent-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const q = chip.dataset.query;
                document.getElementById('searchInput').value = q;
                performSearch(q);
            });
        });

        document.getElementById('clear-recent')?.addEventListener('click', () => {
            this.recentSearches = [];
            localStorage.removeItem('ytcm_recent_searches');
            this.renderRecentSearches();
        });
    }

    saveSearch(query) {
        if (!query || query.length < 2) return;
        this.recentSearches = [query, ...this.recentSearches.filter(q => q !== query)].slice(0, 10);
        localStorage.setItem('ytcm_recent_searches', JSON.stringify(this.recentSearches));
        this.renderRecentSearches();
    }
}

window.smartSearch = null; // Se inicializa en DOMContentLoaded

// =============================================
// DISPLAY DE RESULTADOS - Estilo Spotify Cards
// =============================================

function displaySearchResultsPiped(results = []) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    if (!Array.isArray(results) || results.length === 0) {
        resultsDiv.innerHTML = `<div class="no-results-spotify"><i class="fas fa-search"></i><p>Sin resultados</p></div>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    results.forEach((video, index) => {
        if (!video?.videoId) return;

        // ✅ Normalización de duración: asegurar que sea número desde el inicio
        const durationSecs = parseDuration(video.duration);
        const durationDisplay = durationSecs > 0 ? formatDuration(durationSecs) : '';

        const normalizedVideo = {
            videoId: video.videoId,
            title: video.title || 'Sin título',
            thumbnail: `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`,
            duration: durationSecs,
            artist: video.artist || video.uploaderName || video.author || 'YouTube'
        };

        const el = document.createElement('div');
        el.className = 'result-spotify';
        el.style.animationDelay = `${index * 0.04}s`;
        el.innerHTML = `
            <div class="result-num">${index + 1}</div>
            <div class="result-thumb-container">
                <img src="${normalizedVideo.thumbnail}" onerror="this.src='https://i.ytimg.com/vi/${video.videoId}/default.jpg'">
                <div class="result-play-overlay"><i class="fas fa-play"></i></div>
            </div>
            <div class="result-info">
                <div class="result-title">${normalizedVideo.title}</div>
                <div class="result-artist">${normalizedVideo.artist}</div>
            </div>
            <div class="result-duration">${durationDisplay}</div>
            <button class="result-add-btn" title="Añadir a cola"><i class="fas fa-plus"></i></button>
            <button class="result-play-now-btn" title="Reproducir ahora"><i class="fas fa-play-circle"></i></button>
        `;

        el.querySelector('.result-add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            addToPlaylist(normalizedVideo);
        });
        el.querySelector('.result-play-now-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            insertAndPlayNow(normalizedVideo);
        });
        el.addEventListener('click', () => addToPlaylist(normalizedVideo));
        fragment.appendChild(el);
    });
    resultsDiv.appendChild(fragment);
}

// =============================================
// QUEUE DISPLAY - Lista estilo Spotify
// =============================================

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        const ytVideoData = event.target.getVideoData();
        const icon = document.getElementById('np-play-icon');
        if (icon) icon.className = 'fas fa-pause';

        const fullVideo = window.playlistVideos?.find(v => v.videoId === ytVideoData.video_id) || {
            videoId: ytVideoData.video_id,
            video_id: ytVideoData.video_id,
            title: ytVideoData.title,
            artist: ytVideoData.author || '',
            author: ytVideoData.author || ''
        };

        if (window.nowPlayingManager) {
            window.nowPlayingManager.update(fullVideo);
        }

        setTimeout(() => {
            if (window.lyricsManager) window.lyricsManager.loadLyricsForCurrentVideo(fullVideo);
            if (window.relatedManager) window.relatedManager.loadRelatedForVideo(fullVideo);
        }, 800);
    } else if (event.data === YT.PlayerState.PAUSED) {
        const icon = document.getElementById('np-play-icon');
        if (icon) icon.className = 'fas fa-play';
    }
}

function updatePlaylistDOM() {
    const playlistContainer = document.getElementById('playlist');
    if (!playlistContainer) return;
    
    const urlInput = document.getElementById('searchInput2');
    const savedUrl = urlInput ? urlInput.value : '';
    
    playlistContainer.innerHTML = '';

    if (window.playlistVideos.length === 0) {
        playlistContainer.innerHTML = `
            <div class="queue-empty">
                <i class="fas fa-music"></i>
                <p>Tu cola está vacía</p>
                <small>Busca canciones o añade una playlist</small>
            </div>`;
        if (urlInput && savedUrl) urlInput.value = savedUrl;
        return;
    }

    const header = document.createElement('div');
    header.className = 'queue-header';
    header.innerHTML = `
        <span class="queue-count">${window.playlistVideos.length} canciones</span>
        <button class="queue-clear-btn" onclick="clearPlaylist()">
            <i class="fas fa-trash-alt"></i> Limpiar
        </button>
    `;
    playlistContainer.appendChild(header);

    if (currentIndex >= 0 && window.playlistVideos[currentIndex]) {
        const nowSection = document.createElement('div');
        nowSection.className = 'queue-section-label';
        nowSection.textContent = 'Reproduciendo ahora';
        playlistContainer.appendChild(nowSection);
    }

    const fragment = document.createDocumentFragment();

    window.playlistVideos.forEach((video, index) => {
        const item = document.createElement('div');
        item.className = 'queue-item' + (index === currentIndex ? ' queue-item--playing' : '');
        item.draggable = true;
        item.dataset.index = index;

        const isPlaying = index === currentIndex;
        const duration = formatDuration(video.duration || 0);

        item.innerHTML = `
            <div class="queue-item-left">
                ${isPlaying
                    ? '<div class="queue-playing-indicator"><span></span><span></span><span></span></div>'
                    : `<span class="queue-num">${index + 1}</span>`
                }
            </div>
            <div class="queue-thumb-wrap">
                <img src="${video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`}"
                     alt="${video.title}"
                     onerror="this.src='https://i.ytimg.com/vi/${video.videoId}/default.jpg'">
                ${!isPlaying ? '<div class="queue-hover-play"><i class="fas fa-play"></i></div>' : ''}
            </div>
            <div class="queue-info">
                <div class="queue-title ${isPlaying ? 'queue-title--active' : ''}">${video.title}</div>
                <div class="queue-artist">${video.artist || video.uploaderName || ''}</div>
            </div>
            <div class="queue-duration">${duration}</div>
            <button class="queue-delete-btn" data-id="${video.videoId}" title="Eliminar">
                <i class="fas fa-times"></i>
            </button>
        `;

        if (index === currentIndex + 1) {
            const nextSection = document.createElement('div');
            nextSection.className = 'queue-section-label';
            nextSection.textContent = 'A continuación';
            fragment.appendChild(nextSection);
        }

        item.addEventListener('click', (e) => {
            if (e.target.closest('.queue-delete-btn')) return;
            
            if (!reproduccionIniciada) {
                currentIndex = index;
                reproduccionIniciada = true;
                playFirstVideo();
            } else {
                window.playSpecificVideoWithCrossfade(index);
            }
        });

        item.querySelector('.queue-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteVideo(video.videoId);
        });

        fragment.appendChild(item);
    });

    playlistContainer.appendChild(fragment);
    enableDragAndDrop();

    const currentItem = playlistContainer.querySelector('.queue-item--playing');
    if (currentItem) {
        setTimeout(() => currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }

    const playBtn = document.getElementById('np-play-pause-btn');
    if (playBtn) {
        if (window.playlistVideos.length > 0) {
            playBtn.style.opacity = '1';
            playBtn.style.cursor = 'pointer';
            playBtn.title = reproduccionIniciada ? 'Play/Pause' : '▶ Iniciar reproducción';
        } else {
            playBtn.style.opacity = '0.4';
            playBtn.title = 'Añade canciones primero';
        }
    }

    if (urlInput && savedUrl) urlInput.value = savedUrl;
}
// =============================================
// ACCIONES DE PLAYLIST
// =============================================
function clearPlaylist() {
    if (!confirm('¿Limpiar toda la cola?')) return;
    window.playlistVideos.length = 0;
    manualVideos = [];
    currentIndex = 0;
    reproduccionIniciada = false;
    updatePlaylistDOM();
    mostrarMensajeFlotante('Cola limpiada');
}

function shufflePlaylist() {
    const current = window.playlistVideos[currentIndex];
    const rest = window.playlistVideos.filter((_, i) => i !== currentIndex);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    window.playlistVideos.length = 0;
    window.playlistVideos.push(current, ...rest);
    currentIndex = 0;
    updatePlaylistDOM();
    mostrarMensajeFlotante('🔀 Lista mezclada');
}

function insertAndPlayNow(videoData) {
    if (!videoData?.videoId) return;
    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || 'Sin título',
        thumbnail: videoData.thumbnail || `https://i.ytimg.com/vi/${videoData.videoId}/mqdefault.jpg`,
        duration: parseDuration(videoData.duration) || 0,
        artist: videoData.artist || videoData.uploaderName || '',
        manual: true
    };

    // Insertar en posición siguiente
    window.playlistVideos.splice(currentIndex + 1, 0, videoObject);
    updatePlaylistDOM();
    playNextVideo();
    mostrarMensajeFlotante(`▶️ Reproduciendo: ${videoObject.title}`);
}

const addToPlaylist = (videoData) => {
    if (!videoData?.videoId) {
        mostrarMensajeFlotante('⚠️ Error: datos de video inválidos');
        return;
    }
    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || 'Sin título',
        thumbnail: videoData.thumbnail || `https://i.ytimg.com/vi/${videoData.videoId}/mqdefault.jpg`,
        duration: parseDuration(videoData.duration) || 0,
        artist: videoData.artist || videoData.uploaderName || '',
        manual: true
    };

    const isDuplicate = window.playlistVideos.some(v => v.videoId === videoObject.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante('Este video ya está en la cola');
        return;
    }

    window.playlistVideos.splice(currentIndex + 1, 0, videoObject);
    manualVideos.push(videoObject);
    mostrarMensajeFlotante(`✅ Añadido: ${videoObject.title}`);
    updatePlaylistDOM();
};

function deleteVideo(videoId) {
    const idx = window.playlistVideos.findIndex(v => v.videoId === videoId);
    if (idx === -1) return;
    const title = window.playlistVideos[idx].title;
    window.playlistVideos.splice(idx, 1);
    manualVideos = manualVideos.filter(v => v.videoId !== videoId);
    if (currentIndex >= idx && currentIndex > 0) currentIndex--;
    updatePlaylistDOM();
    mostrarMensajeFlotante(`Eliminado: ${title}`);
}

function rearrangePlaylist(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [moved] = window.playlistVideos.splice(fromIndex, 1);
    window.playlistVideos.splice(toIndex, 0, moved);
    if (currentIndex === fromIndex) currentIndex = toIndex;
    else if (fromIndex < currentIndex && toIndex >= currentIndex) currentIndex--;
    else if (fromIndex > currentIndex && toIndex <= currentIndex) currentIndex++;
}

// =============================================
// DRAG AND DROP - Mejorado
// =============================================
function enableDragAndDrop() {
    const container = document.getElementById('playlist');
    if (!container) return;

    let dragSrcIndex = null;

    // Usamos delegación de eventos en el container
    container.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.queue-item');
        if (!item) return;
        dragSrcIndex = parseInt(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrcIndex);
    });

    container.addEventListener('dragend', (e) => {
        document.querySelectorAll('.queue-item').forEach(el => {
            el.classList.remove('dragging', 'drag-over');
        });
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const item = e.target.closest('.queue-item');
        if (!item) return;
        document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('drag-over'));
        if (!item.classList.contains('dragging')) {
            item.classList.add('drag-over');
        }
    });

    container.addEventListener('dragleave', (e) => {
        const item = e.target.closest('.queue-item');
        if (item) item.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.target.closest('.queue-item');
        if (!target || dragSrcIndex === null) return;

        const destIndex = parseInt(target.dataset.index);
        if (dragSrcIndex === destIndex) return;

        // Reordenar array
        const [moved] = window.playlistVideos.splice(dragSrcIndex, 1);
        window.playlistVideos.splice(destIndex, 0, moved);

        // Actualizar currentIndex
        if (currentIndex === dragSrcIndex) {
            currentIndex = destIndex;
        } else if (dragSrcIndex < currentIndex && destIndex >= currentIndex) {
            currentIndex--;
        } else if (dragSrcIndex > currentIndex && destIndex <= currentIndex) {
            currentIndex++;
        }

        dragSrcIndex = null;
        updatePlaylistDOM(); // re-render con índices actualizados
    });
}

// =============================================
// REPRODUCCIÓN Y CROSSFADE
// =============================================
function loadYouTubeAPI() {
    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        if (window.YT && window.YT.Player) initializePlayers();
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
}

window.onYouTubeIframeAPIReady = () => {
    console.log('✅ YouTube API lista');
    initializePlayers();
    window.initializePlayers = initializePlayers; // exponer para youtube-client.js
};

function initializePlayers() {
    if (window._appPlayersCreated) return;
    window._appPlayersCreated = true;

    let p1Ready = false;
    let p2Ready = false;

    function checkBothReady() {
        if (p1Ready && p2Ready) {
            playersInitialized = true;
            window.playersInitialized = true;
            playerReady = true;
            console.log('✅ Ambos players inicializados y listos');
        }
    }

    const cfg = {
        height: '100%', width: '100%',
        playerVars: { 
            origin: 'https://www.youtube.com', 
            enablejsapi: 1, 
            controls: 0, 
            rel: 0, 
            modestbranding: 1, 
            widget_referrer: 'https://www.youtube.com', 
            playsinline: 1 
        },
        events: {
            onReady: function(e) {
                const id = e.target.getIframe().id;
                if (id === 'player1') p1Ready = true;
                if (id === 'player2') p2Ready = true;
                checkBothReady();
            },
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
        }
    };
    player1 = new YT.Player('player1', cfg);
    player2 = new YT.Player('player2', cfg);
    window.player1 = player1;
    window.player2 = player2;
}

function onPlayerReady() {
    playerReady = true;
    // Verificar si ambos players están listos
    const p1ok = window.player1 && typeof window.player1.loadVideoById === 'function';
    const p2ok = window.player2 && typeof window.player2.loadVideoById === 'function';
    if (p1ok && p2ok) {
        playersInitialized = true;
        window.playersInitialized = true;
        console.log("✅ Ambos players listos");
    }
    // NO iniciar reproducción automáticamente — el usuario debe presionar play
}

function onPlayerError(event) {
    const errores = {
        2: 'ID de video inválido.',
        5: 'Restricción de reproducción.',
        100: 'Video no encontrado.',
        101: 'Incrustación no permitida.',
        150: 'Incrustación no permitida.'
    };
    const msg = errores[event.data] || 'Error del reproductor';
    console.warn(`⚠️ Error YT [${event.data}]: ${msg}`);
    mostrarMensajeFlotante(`⚠️ ${msg} - Siguiente video...`);
    // Error 2 puede ocurrir si el player aún no está completamente listo;
    // solo saltar si hay una lista activa con reproducción iniciada
    if ([2, 5, 100, 101, 150].includes(event.data) && reproduccionIniciada) {
        setTimeout(() => playNextVideo(), 1500);
    }
}

function playVideo(videoId, player) {
    player.loadVideoById(videoId);
}

function playPrevVideo() {
    if (currentIndex > 0) {
        currentIndex--;
        const player = currentPlayer === 1 ? player1 : player2;
        const video = window.playlistVideos[currentIndex];
        if (video) {
            playVideo(video.videoId, player);
            if (window.nowPlayingManager) window.nowPlayingManager.update(video);
        }
        updatePlaylistDOM();
    } else {
        // Reiniciar canción actual
        const player = currentPlayer === 1 ? player1 : player2;
        player?.seekTo(0, true);
    }
}
window.playSpecificVideoWithCrossfade = function(targetIndex) {
    if (targetIndex === currentIndex) return; // Si ya suena, no hacer nada

    const currentEl = document.getElementById(`player${currentPlayer}`);
    const nextPlayerNum = currentPlayer === 1 ? 2 : 1;
    const nextPlayerObj = currentPlayer === 1 ? player2 : player1;
    const nextEl = document.getElementById(`player${nextPlayerNum}`);
    
    currentIndex = targetIndex;
    const video = window.playlistVideos[currentIndex];

    // Cargar en el reproductor oculto
    nextPlayerObj.loadVideoById(video.videoId);

    if (window.sponsorBlockManager) {
        window.sponsorBlockManager.cargarSegmentos(video.videoId).catch(() => {});
    }

    if (window.nowPlayingManager) window.nowPlayingManager.update(video);
    updatePlaylistDOM();

    // Transición visual cruzada
    currentEl.classList.add('fade-out');
    nextEl.classList.remove('hidden');
    nextEl.classList.add('fade-in');

    // Bloquear el monitor automático para que no salte videos durante el efecto
    window.crossfadeTriggered = true;

    // Terminar transición después de 1.5s y llamar al crossfade de volumen
    setTimeout(() => {
        currentEl.classList.add('hidden');
        currentEl.classList.remove('fade-out');
        nextEl.classList.remove('fade-in');
        currentPlayer = nextPlayerNum;
        window.crossfadeTriggered = false;
        crossfadeAudio(); 
    }, 1500);
}
function playNextVideo() {
    Object.keys(_triggerCache).forEach(k => delete _triggerCache[k]);
    if (window.relatedManager) window.relatedManager.lastId = null;
    if (window.lyricsManager) window.lyricsManager.stopSync();

    const list = window.playlistVideos;

    if (window.repeatMode === 2) {
        const player = currentPlayer === 1 ? player1 : player2;
        player?.seekTo(0, true);
        player?.playVideo();
        return;
    }

    if (currentIndex < list.length - 1) {
        currentIndex++;
    } else if (window.repeatMode === 1) {
        currentIndex = 0;
    } else {
        askToRepeatPlaylist();
        return;
    }

    const currentEl = document.getElementById(`player${currentPlayer}`);
    const nextPlayerNum = currentPlayer === 1 ? 2 : 1;
    const nextPlayerObj = currentPlayer === 1 ? player2 : player1;
    const nextEl = document.getElementById(`player${nextPlayerNum}`);
    const nextVideoId = list[currentIndex].videoId;

    nextPlayerObj.loadVideoById(nextVideoId);

    if (window.sponsorBlockManager) {
        window.sponsorBlockManager.cargarSegmentos(nextVideoId).catch(() => {});
    }

    if (window.nowPlayingManager) window.nowPlayingManager.update(list[currentIndex]);

    updatePlaylistDOM();

    currentEl.classList.add('fade-out');
    nextEl.classList.remove('hidden');
    nextEl.classList.add('fade-in');

    setTimeout(() => {
        currentEl.classList.add('hidden');
        currentEl.classList.remove('fade-out');
        nextEl.classList.remove('fade-in');
        currentPlayer = nextPlayerNum;
        window.crossfadeTriggered = false;
        crossfadeAudio();
    }, 1500);
}

window.playSpecificVideoWithCrossfade = function(targetIndex) {
    if (targetIndex === currentIndex) return; 

    if (window.relatedManager) window.relatedManager.lastId = null;
    if (window.lyricsManager) window.lyricsManager.stopSync();

    const currentEl = document.getElementById(`player${currentPlayer}`);
    const nextPlayerNum = currentPlayer === 1 ? 2 : 1;
    const nextPlayerObj = currentPlayer === 1 ? player2 : player1;
    const nextEl = document.getElementById(`player${nextPlayerNum}`);
    
    currentIndex = targetIndex;
    const video = window.playlistVideos[currentIndex];

    nextPlayerObj.loadVideoById(video.videoId);

    if (window.sponsorBlockManager) {
        window.sponsorBlockManager.cargarSegmentos(video.videoId).catch(() => {});
    }

    if (window.nowPlayingManager) window.nowPlayingManager.update(video);
    updatePlaylistDOM();

    currentEl.classList.add('fade-out');
    nextEl.classList.remove('hidden');
    nextEl.classList.add('fade-in');

    window.crossfadeTriggered = true;

    setTimeout(() => {
        currentEl.classList.add('hidden');
        currentEl.classList.remove('fade-out');
        nextEl.classList.remove('fade-in');
        currentPlayer = nextPlayerNum;
        window.crossfadeTriggered = false;
        crossfadeAudio(); 
    }, 1500);
}

function crossfadeAudio() {
    const prevPlayer = currentPlayer === 1 ? player2 : player1;
    const nextPlayer = currentPlayer === 1 ? player1 : player2;
    let progress = 0;
    const steps = (CROSSFADE_DURATION * 1000) / 100;
    const increment = 1 / steps;

    const interval = setInterval(() => {
        progress += increment;
        const outVol = Math.cos(progress * 0.5 * Math.PI) * 100;
        const inVol = Math.sin(progress * 0.5 * Math.PI) * 100;

        prevPlayer?.setVolume?.(Math.max(0, outVol));
        nextPlayer?.setVolume?.(Math.min(100, inVol));

   if (progress >= 1) {
        clearInterval(interval);
        prevPlayer?.pauseVideo?.();
        nextPlayer?.setVolume?.(100);
        if (window.nowPlayingManager?.videoMode) {
            const activeEl = document.getElementById(`player${currentPlayer}`);
            const inactiveEl = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
            if (activeEl) { 
                activeEl.style.opacity = '1'; 
                activeEl.style.visibility = 'visible'; 
            }
            if (inactiveEl) { 
                // AQUI ESTABA EL ERROR: Decía activeEl en lugar de inactiveEl
                inactiveEl.style.opacity = '0'; 
                inactiveEl.style.visibility = 'hidden'; 
            }
        }
    }
    }, 100);
}

// =============================================
// MONITOR DE REPRODUCTORES
// =============================================
function startMonitoring() {
    if (!monitorInterval) {
        monitorInterval = setInterval(monitorPlayers, 500);
    }
}

function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
}

const _triggerCache = {}; // Cache global para tiempos de disparo

function monitorPlayers() {
    if (typeof YT === 'undefined' || !player1 || !player2 || !playersInitialized) return;

    const currentPlayerInstance = currentPlayer === 1 ? player1 : player2;
    if (!currentPlayerInstance?.getPlayerState) return;

    const state = currentPlayerInstance.getPlayerState();
    if (state !== YT.PlayerState.PLAYING) return;

    let videoId, currentTime, duration;
    try {
        const data = currentPlayerInstance.getVideoData();
        videoId = data?.video_id;
        currentTime = currentPlayerInstance.getCurrentTime();
        duration = currentPlayerInstance.getDuration();
    } catch (e) { return; }

    if (!videoId || isNaN(duration) || duration <= 0) return;

    // SponsorBlock solo se procesa si no estamos ya en transición
    if (!window.crossfadeTriggered) {
        if (window.sponsorBlockManager?.checkAndSkip(currentPlayerInstance)) return;
    }

    // ✅ Cachear triggerTime para evitar recalcular 2 veces por segundo
    if (!_triggerCache[videoId]) {
        if (window.sponsorBlockManager) {
            _triggerCache[videoId] = window.sponsorBlockManager.calculateCrossfadeTriggerTime(duration, videoId, CROSSFADE_DURATION);
        } else {
            _triggerCache[videoId] = duration - CROSSFADE_DURATION;
        }
        console.log(`📍 TriggerTime establecido para ${videoId}: ${_triggerCache[videoId].toFixed(1)}s`);
    }

    const triggerTime = _triggerCache[videoId];

    // ✅ Log reducido: cada 30 segundos en lugar de cada 5
    const flooredTime = Math.floor(currentTime);
    if (flooredTime % 30 === 0 && flooredTime !== window._lastLogTime) {
        window._lastLogTime = flooredTime;
        console.log(`⏱️ P${currentPlayer} activo | ${flooredTime}s / ${duration.toFixed(0)}s | Mezcla@${triggerTime.toFixed(0)}s`);
    }

    if (currentTime >= triggerTime && !window.crossfadeTriggered) {
        window.crossfadeTriggered = true;
        playNextVideo();
    }
}

// =============================================
// PLAYLIST LOADING
// =============================================
function extractPlaylistId(url) {
    try {
        if (!url.includes('http') && url.length > 10) return url.trim();
        const urlObj = new URL(url);
        return urlObj.searchParams.get('list') || null;
    } catch (e) {
        return url.length > 10 ? url.trim() : null;
    }
}

async function getPlaylistInfo(playlistId) {
    try {
        const res = await fetch(`${CONFIG.apiBase}?id=${playlistId}`, { mode: 'cors' });
        if (!res.ok) throw new Error(`Error API: ${res.status}`);
        const data = await res.json();
        return { items: data.items || [], name: data.metadata?.title || 'Playlist importada' };
    } catch (e) {
        console.error('Error playlist:', e);
        mostrarMensajeFlotante('❌ Error al cargar la playlist');
        return null;
    }
}

function displayPlaylist(playlist) {
    if (!playlist?.items?.length) {
        mostrarMensajeFlotante('No se encontraron videos en la playlist');
        return;
    }

    const loaded = playlist.items.map(video => {
        if (!video.videoId) return null;
        return {
            videoId: video.videoId,
            title: video.title || 'Sin título',
            thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`,
            duration: parseDuration(video.duration) || 0,
            artist: video.artist || video.uploaderName || '',
            manual: false
        };
    }).filter(Boolean);

    window.playlistVideos.push(...loaded);
    playlistVideos = window.playlistVideos;

    mostrarMensajeFlotante(`✅ Añadidas ${loaded.length} canciones a la cola`);
    updatePlaylistDOM();
}
function playFirstVideo() {
    if (!window.playersInitialized || !window.player1 || typeof window.player1.loadVideoById !== "function") {
        console.log("⏳ Players no listos, reintentando...");
        setTimeout(playFirstVideo, 300);
        return;
    }

    const video = window.playlistVideos[currentIndex];
    if (!video) return;

    currentPlayer = 1;
    window.crossfadeTriggered = false;

    const p1 = document.getElementById('player1'); // Nuevo
    const p2 = document.getElementById('player2');
    
    if (p2) {
        p2.style.opacity = '0';
        p2.style.visibility = 'hidden';
        p2.style.pointerEvents = 'none';
    }
    
    // Validar si el Modo Video está activo para revelar p1
    if (p1 && window.nowPlayingManager?.videoMode) {
        p1.style.opacity = '1';
        p1.style.visibility = 'visible';
    }

    window.player1.loadVideoById(video.videoId);
    window.player1.setVolume(80);

    if (window.nowPlayingManager) window.nowPlayingManager.update(video);
    startMonitoring();
    updatePlaylistDOM();
    mostrarMensajeFlotante(`▶️ Reproduciendo: ${video.title}`);
}
function getThumbnail(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// fallback seguro
function safeThumbnail(img, videoId) {
  img.onerror = () => {
    img.src = "https://via.placeholder.com/320x180?text=No+Image";
  };
  img.src = getThumbnail(videoId);
}
function askToRepeatPlaylist() {
    mostrarMensajeFlotante('✅ Fin de la lista');
    stopMonitoring();
}
// limpia spam de youtube 
window.addEventListener('error', (e) => {
  if (
    e.message?.includes('youtube.com') ||
    e.message?.includes('ERR_BLOCKED_BY_CLIENT')
  ) {
    e.preventDefault();
  }
});

// =============================================
// BÚSQUEDA
// =============================================

const performSearch = async (query) => {
    const resultsContainer = document.getElementById('results');
    if (!resultsContainer || !query || query.trim().length < 2) return;

    const q = query.trim();
    if (window.smartSearch) window.smartSearch.saveSearch(q);

    resultsContainer.innerHTML = `<div class="search-loading"><span>Buscando "${q}"...</span></div>`;

    try {
        let items = [];
     
        if (window.isAuthorized && window.gapi?.client?.youtube) {
            console.log("🔍 Buscando vía GAPI oficial...");
            const response = await gapi.client.youtube.search.list({
                part: 'snippet',
                q: q,
                maxResults: 25,
                type: 'video'
            });
            items = response.result.items.map(v => ({
                videoId: v.id.videoId,
                title: v.snippet.title,
                thumbnail: v.snippet.thumbnails.medium.url,
                artist: v.snippet.channelTitle,
                duration: "0:00"
            }));
        } else {
         
            console.log("🌐 Buscando vía Backend Proxy...");
            const data = await window.youtubeJSClient.search(q);
            items = data.items || [];
        }

        if (items.length === 0) {
            resultsContainer.innerHTML = `<div class="no-results-spotify"><p>Sin resultados</p></div>`;
        } else {
            displaySearchResultsPiped(items);
        }
    } catch (e) {
        console.error('Error:', e);
        resultsContainer.innerHTML = `<div class="no-results-spotify"><p>YouTube bloqueó la conexión</p></div>`;
    }
};

// =============================================
// UTILIDADES
// =============================================
function formatDuration(duration) {
    if (isNaN(duration) || duration < 0) return '0:00';
    const h = Math.floor(duration / 3600);
    const m = Math.floor((duration % 3600) / 60);
    const s = Math.floor(duration % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
}

function parseDuration(d) {
    if (typeof d === 'number') return d;
    if (typeof d !== 'string') return 0;
    if (d.includes(':')) {
        const parts = d.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (parseInt(m[1])||0)*3600 + (parseInt(m[2])||0)*60 + (parseInt(m[3])||0);
}

function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function mostrarMensajeFlotante(mensaje, duracion = 3500) {
    let container = document.getElementById('mensaje-flotante-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mensaje-flotante-container';
        Object.assign(container.style, {
            position: 'fixed', bottom: '20px', left: '50%',
            transform: 'translateX(-50%)', zIndex: '9999',
            display: 'flex', flexDirection: 'column', gap: '8px',
            pointerEvents: 'none'
        });
        document.body.appendChild(container);
    }

    const div = document.createElement('div');
    div.className = 'spotify-toast';
    div.textContent = mensaje;
    container.appendChild(div);

    requestAnimationFrame(() => div.classList.add('toast-visible'));

    setTimeout(() => {
        div.classList.remove('toast-visible');
        setTimeout(() => div.remove(), 400);
    }, duracion);
}
window.mostrarMensajeFlotante = mostrarMensajeFlotante;

// =============================================
// SETUP DE EVENTOS
// =============================================
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(performSearch, 350);
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim();
            if (q.length > 1) debouncedSearch(q);
            else {
                document.getElementById('results').innerHTML = '';
                // Mostrar géneros cuando no hay query
                document.getElementById('genres-grid')?.style.setProperty('display', 'block');
            }
        });
        // Enter para buscar
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const q = e.target.value.trim();
                if (q) performSearch(q);
            }
        });
    }

    // Botón añadir URL playlist
    document.getElementById('añadirUrlButton')?.addEventListener('click', async () => {
        const input = document.getElementById('searchInput2');
        const url = input?.value.trim();
        const playlistId = extractPlaylistId(url);

        if (!playlistId) {
            mostrarMensajeFlotante('⚠️ URL de playlist no válida');
            return;
        }

        mostrarMensajeFlotante('⏳ Cargando playlist...');
        const info = await getPlaylistInfo(playlistId);
        if (info?.items?.length) {
            displayPlaylist(info);
            if (input) input.value = '';
            document.getElementById('iniciarButton').disabled = false;
        } else {
            mostrarMensajeFlotante('❌ No se pudo cargar la playlist');
        }
    });

    // Botón iniciar
    const iniciarBtn = document.getElementById('iniciarButton');
    if (iniciarBtn) {
        iniciarBtn.disabled = true;
        iniciarBtn.addEventListener('click', () => {
            if (window.playlistVideos.length > 0 && !reproduccionIniciada) {
                reproduccionIniciada = true;
                currentIndex = 0;
                if (playersInitialized) {
                    playFirstVideo();
                } else {
                    // Reintentar cuando estén listos
                    const check = setInterval(() => {
                        if (playersInitialized) {
                            clearInterval(check);
                            playFirstVideo();
                        }
                    }, 200);
                }
                iniciarBtn.disabled = true;
            }
        });
    }

    // Botón Mix (aleatorio)
    document.getElementById('mixButton')?.addEventListener('click', () => {
        shufflePlaylist();
        if (reproduccionIniciada) playNextVideo();
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(`tab-${btn.dataset.tab}`);
            if (target) target.classList.add('active');
        });
    });

    // Soporte teclado global
    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        if (e.code === 'Space') {
            e.preventDefault();
            document.getElementById('np-play-pause-btn')?.click();
        }
        if (e.code === 'ArrowRight') playNextVideo();
        if (e.code === 'ArrowLeft') playPrevVideo();
    });
}

// =============================================
// LETRAS MEJORADAS
// =============================================
class LyricsManager {
    constructor() {
        this.currentLrc = [];
        this.syncInterval = null;
        this.activeLineIndex = -1;
        this.cache = new Map();
    }

    cleanData(video) {
        let artist = (video.artist || video.uploaderName || video.author || '')
            .replace(/VEVO$/i, '').replace(/\s*-\s*Topic$/i, '').replace(/Official/i, '').trim();
        let title = (video.title || '')
            .replace(/[\(\[](official|video|audio|lyric|hd|hq|remix|4k|mv|en vivo|live).*?[\)\]]/gi, '').trim();

        if (title.includes(' - ')) {
            const [p0, p1] = title.split(' - ');
            if (p0.toLowerCase().includes(artist.toLowerCase().split(' ')[0])) {
                artist = p0.trim(); title = p1.trim();
            }
        }
        title = title.split(/\s(\(|\[)?(ft\.|feat\.|starring)/i)[0].trim();
        artist = artist.split(/\s(\(|\[)?(ft\.|feat\.|,|&|y\s)/i)[0].trim();

        let duration = 0;
        if (typeof video.duration === 'number') duration = video.duration;
        else if (typeof video.duration === 'string') duration = parseDuration(video.duration);

        return { artist, title, duration: Math.round(duration) };
    }

    async loadLyricsForCurrentVideo(video) {
        const container = document.getElementById('lyricsContent');
        if (!container) return;
        this.stopSync();

        const clean = this.cleanData(video);
        const cacheKey = `${clean.artist}-${clean.title}`.toLowerCase();

        if (!this.cache.has(cacheKey)) {
            container.innerHTML = `
                <div class="lyrics-loading">
                    <div class="lyrics-spinner"></div>
                    <p>Buscando letra de "${clean.title}"...</p>
                </div>`;
        }

        try {
            const data = await this.getOrFetchLyrics(clean, cacheKey);
            if (!data) throw new Error('Sin datos');
            this.renderLyricsUI(data, clean.artist, clean.title);
            this.prefetchNext();
        } catch (e) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-music" style="opacity:0.3"></i>
                    <p>Letra no disponible</p>
                    <small>${clean.title}</small>
                </div>`;
        }
    }

    async getOrFetchLyrics(clean, cacheKey) {
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        try {
            const data = await Promise.any([
                this.fetchFromOracle(clean),
                this.fetchFromLrclib(clean)
            ]);
            if (data) this.cache.set(cacheKey, data);
            return data;
        } catch {
            throw new Error('Todos los proveedores fallaron');
        }
    }

async fetchFromOracle(clean) {
    const activePlayer = currentPlayer === 1 ? player1 : player2;
    let videoId = null;
    try { videoId = activePlayer?.getVideoData()?.video_id; } catch {}
    if (!videoId) throw new Error('Sin videoId');

    const ctrl = new AbortController();
    // Aumentamos a 65s porque yt-dlp puede tardar
    setTimeout(() => ctrl.abort(), 65000); 

    const res = await fetch(`https://lyric.sys-lab.app/get-lyrics?id=${videoId}`, { signal: ctrl.signal });
    const data = await res.json();
    if (data.status !== 'success' || !data.data) throw new Error('Oracle: no encontrado');
    return { syncedLyrics: data.data, plainLyrics: data.data.replace(/\[.*?\]/g, ''), provider: 'YT-Subtitles' };
}

    async fetchFromLrclib(clean) {
        const q = encodeURIComponent(`${clean.artist} ${clean.title}`);
        const res = await fetch(`https://lrclib.net/api/search?q=${q}`);
        const data = await res.json();
        if (!data?.length) throw new Error('LRCLIB: no encontrado');
        const best = data[0];
        return {
            syncedLyrics: best.syncedLyrics,
            plainLyrics: best.plainLyrics,
            provider: 'LRCLib'
        };
    }

    prefetchNext() {
        const next = window.playlistVideos[currentIndex + 1];
        if (!next) return;
        const clean = this.cleanData(next);
        const key = `${clean.artist}-${clean.title}`.toLowerCase();
        if (!this.cache.has(key)) {
            this.getOrFetchLyrics(clean, key).catch(() => {});
        }
    }

    renderLyricsUI(data, artist, title) {
        const container = document.getElementById('lyricsContent');
        if (!container) return;

        const isSynced = data.syncedLyrics?.includes('[');
        container.innerHTML = '';

        container.innerHTML = `
            <div class="lyrics-header">
                <div style="flex:1">
                    <strong style="display:block;font-size:1.1em;color:#fff">${this.escape(title)}</strong>
                    <small style="color:#aaa">${this.escape(artist)}</small>
                </div>
                <span class="lyrics-source-badge">${data.provider}</span>
            </div>
            <div class="lyrics-body ${isSynced ? 'synced' : 'plain'}">
                ${isSynced ? this.renderSynced(data.syncedLyrics) : this.renderPlain(data.plainLyrics)}
            </div>
        `;

        if (isSynced) this.startSync();
    }

    renderSynced(lrc) {
        this.currentLrc = this.parseLRC(lrc);
        return this.currentLrc.map(line =>
            `<p class="lyric-line" data-time="${line.time}">${this.escape(line.text) || '♪'}</p>`
        ).join('');
    }

    renderPlain(text) {
        return `<div class="plain-lyrics">${(text || '').replace(/\n/g, '<br>')}</div>`;
    }

    startSync() {
        this.stopSync();
        this.activeLineIndex = -1;
        this.syncInterval = setInterval(() => {
            const p = currentPlayer === 1 ? player1 : player2;
            if (!p?.getCurrentTime) return;
            const time = p.getCurrentTime();
            const lines = document.querySelectorAll('.lyrics-body.synced .lyric-line');
            let newIdx = -1;
            for (let i = 0; i < this.currentLrc.length; i++) {
                if (time >= this.currentLrc[i].time) newIdx = i;
                else break;
            }
            if (newIdx !== this.activeLineIndex && newIdx >= 0 && lines[newIdx]) {
                lines[this.activeLineIndex]?.classList.remove('active');
                lines[newIdx].classList.add('active');
                lines[newIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.activeLineIndex = newIdx;
            }
        }, 100);
    }

    stopSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = null;
    }

    parseLRC(lrc) {
        if (!lrc) return [];
        return lrc.split('\n').map(line => {
            const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (!m) return null;
            return {
                time: parseInt(m[1])*60 + parseInt(m[2]) + parseFloat('0.'+m[3]),
                text: m[4].trim()
            };
        }).filter(Boolean);
    }

    escape(s) {
        if (!s) return '';
        return s.replace(/[&<>'"]/g, t => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[t] || t));
    }
}

// =============================================
// RELACIONADOS MEJORADOS
// =============================================
class RelatedManager {
    constructor() { this.lastId = null; }

   async loadRelatedForVideo(video) {
    const container = document.getElementById('relatedVideosList');
    const currentVideoId = video?.video_id || video?.videoId;
    
    if (!container || !currentVideoId) return;
    if (this.lastId === currentVideoId) return;
    this.lastId = currentVideoId;

    container.innerHTML = `
        <div class="related-loading">
            <div class="related-spinner"></div>
            <p>Buscando recomendaciones...</p>
        </div>`;

    try {
        // Obtener datos del video actual desde la playlist para tener mejor info
        const playlistVideo = window.playlistVideos?.find(v => v.videoId === currentVideoId);
        
        let artist = playlistVideo?.artist || video.author || video.artist || video.uploaderName || '';
        let title = playlistVideo?.title || video.title || '';
        
        // Limpiar título
        let cleanTitle = title
            .replace(/[\(\[].*?[\)\]]/g, '')
            .replace(/official|video|audio|lyric|hd|hq|mv|4k|en vivo|live/gi, '')
            .trim();
        
        // Limpiar artista — quitar VEVO, Topic, etc.
        let cleanArtist = artist
            .replace(/VEVO$/i, '')
            .replace(/\s*-\s*Topic$/i, '')
            .replace(/Official/i, '')
            .trim();

        // Estrategia de queries: de más específica a más general
        const queries = [];
        if (cleanArtist && cleanTitle) {
            queries.push(`${cleanArtist} ${cleanTitle}`);
            queries.push(`${cleanArtist} mix`);
        } else if (cleanTitle) {
            queries.push(cleanTitle);
        }
        queries.push('top hits music 2024'); // fallback garantizado

        let items = [];
        for (const q of queries) {
            try {
                const data = await window.youtubeJSClient.search(q);
                const candidates = (data?.items || []).filter(v => 
                    v.videoId && v.videoId !== currentVideoId
                );
                if (candidates.length >= 3) {
                    items = candidates.slice(0, 12);
                    break;
                }
            } catch (e) {
                console.warn('Query falló:', q, e);
            }
        }

        if (items.length === 0) throw new Error('Sin resultados en todas las queries');

        container.innerHTML = '<div class="related-header">Recomendaciones sugeridas</div>';
        const list = document.createElement('div');
        list.className = 'related-grid';

        items.forEach(v => {
            const item = document.createElement('div');
            item.className = 'related-card';
            item.innerHTML = `
                <div class="related-thumb">
                    <img src="${v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`}" alt="">
                    <div class="related-play-overlay"><i class="fas fa-play"></i></div>
                </div>
                <div class="related-info">
                    <div class="related-title">${v.title || 'Sin título'}</div>
                    <div class="related-artist">${v.artist || v.uploaderName || 'Sugerencia'}</div>
                </div>
                <button class="related-add-btn" title="Añadir a cola"><i class="fas fa-plus"></i></button>
            `;

            item.querySelector('.related-add-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                window.addToPlaylist(v);
            });
            item.addEventListener('click', (e) => {
                if (e.target.closest('.related-add-btn')) return;
                window.insertAndPlayNow(v);
            });
            list.appendChild(item);
        });

        container.appendChild(list);

    } catch (e) {
        console.error("Recomendados falló:", e);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-magic-wand-sparkles" style="opacity:0.3"></i>
                <p>No pudimos cargar similares específicos.</p>
                <button class="retry-btn" style="margin-top:10px; padding:6px 16px; border-radius:12px; background:var(--spotify-green); color:black; border:none; cursor:pointer; font-weight:bold;">Explorar Mix Pop</button>
            </div>`;
        container.querySelector('.retry-btn').addEventListener('click', () => {
            this.lastId = null;
            this.loadRelatedForVideo({ videoId: 'dQw4w9WgXcQ', video_id: 'dQw4w9WgXcQ', author: 'Top Hits', title: 'pop hits 2024' });
        });
    }
}
}

// =============================================
// INICIALIZACIÓN
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 YT CrossMix iniciando...');
    
    // 1. Exportar funciones y cargar config de Auth
    if (window.youtubeJSClient) await window.youtubeJSClient.init();

    // 2. Inicializar UI Managers 
    window.nowPlayingManager = new NowPlayingManager();
    window.lyricsManager = new LyricsManager();
    window.relatedManager = new RelatedManager();
    window.smartSearch = new SmartSearch();

    // 3. Cargar API de YouTube
    loadYouTubeAPI();

    // 4. Setup de eventos
    setupEventListeners();
    updatePlaylistDOM();
});
