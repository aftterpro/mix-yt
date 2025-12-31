/* =============================================
    Gestor de Interfaz de Usuario
   ============================================= */

console.log('🎨 Cargando UIManager...');

class UIManager {
    constructor() {
        // Elementos cacheados para mejorar rendimiento
        this.elements = {
            nowPlayingTitle: document.getElementById('nowPlayingTitle'),
            nowPlayingArtist: document.getElementById('nowPlayingArtist'),
            playerTitle: document.getElementById('playerTitle'),
            playerArtist: document.getElementById('playerArtist'),
            playerThumbnail: document.getElementById('playerThumbnail'),
            playBtns: ['botonPlay', 'miniPlayBtn'],
            progressBar: document.getElementById('progress-fill'),
            currentTime: document.getElementById('currentTime'),
            totalTime: document.getElementById('totalTime'),
            searchResults: document.getElementById('searchResults'),
            overviewGrid: document.getElementById('overviewGrid'),
            queueCount: document.getElementById('queueCount')
        };
    }

    // ==========================================
    // GESTIÓN DE VISTAS Y PANELES
    // ==========================================
    
    switchView(viewName) {
        // 1. Construir el ID correcto (ej: 'home' -> 'homeView')
        const targetId = viewName.endsWith('View') ? viewName : viewName + 'View';
        
        console.log(`🔄 Cambiando vista a: ${viewName} (Buscando ID: ${targetId})`);

        // 2. Actualizar botones del menú (nav-items)
        document.querySelectorAll('.nav-item, .tab, .nav-tab').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            }
        });

        // 3. Ocultar TODAS las vistas primero
        document.querySelectorAll('.content-view, .view-section').forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none'; // Forzar ocultamiento
        });

        // 4. Mostrar la vista correcta
        const targetView = document.getElementById(targetId);
        if (targetView) {
            targetView.classList.add('active');
            // Quitar el 'display: none' inline para que el CSS (.active) mande
            targetView.style.display = ''; 
        } else {
            console.error(`❌ No se encontró la vista con ID: ${targetId}`);
            // Intentar recuperar home si falla
            if (viewName !== 'home') this.switchView('home');
            return;
        }

        // 5. Gestión del Mini Player (Expandir/Contraer)
        this.togglePlayerVisibility(viewName);
    }

    togglePlayerVisibility(viewName) {
        // Lógica simplificada para determinar si estamos en Full Player
        const isFullPlayer = (viewName === 'fullPlayer' || viewName === 'fullPlayerView');
        
        // Verificar si hay algo reproduciendo
        const hasActiveVideo = window.reproduccionIniciada || 
                               (window.currentPlayingInfo?.flattenedIndex >= 0) ||
                               document.body.classList.contains('has-active-video'); // Clase auxiliar útil

        if (isFullPlayer) {
            // MODO: Pantalla Completa
            this.movePlayersToFullView();
        } else {
            // MODO: Navegación Normal (Home, Search, Library)
            if (hasActiveVideo) {
                this.showMiniPlayerFloat();
            } else {
                // Si no hay video, ocultar todo rastro del player flotante
                const persistentLayer = document.getElementById('persistent-player-layer');
                if (persistentLayer) {
                    persistentLayer.style.opacity = '0';
                    persistentLayer.style.pointerEvents = 'none';
                    // Mover fuera de pantalla por seguridad
                    persistentLayer.style.bottom = '-500px';
                }
                document.body.classList.remove('mini-player-active');
            }
        }
    }

    // ==========================================
    // MOVIMIENTO DE REPRODUCTORES (CORE LÓGICO)
    // ==========================================

   movePlayersToFullView() {
    const layer = document.getElementById('persistent-player-layer');
    if (!layer) return;

    console.log('🎬 Expandiendo a pantalla completa');

    layer.style.transition = 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
    
    requestAnimationFrame(() => {
        layer.style.top = '0';
        layer.style.left = '0';
        layer.style.width = '100vw';
        layer.style.height = '100vh';
        layer.style.bottom = 'auto';
        layer.style.right = 'auto';
        layer.style.borderRadius = '0px';
        layer.style.boxShadow = 'none';
        
        document.body.classList.remove('mini-player-active');
    });
}
showMiniPlayerFloat() {
    const layer = document.getElementById('persistent-player-layer');
    if (!layer) return;

    console.log('🔍 Aplicando efecto miniatura (zoom hacia esquina)');

    // Aseguramos que el contenedor tenga las propiedades base para la animación
    layer.style.display = 'block';
    layer.style.position = 'fixed';
    layer.style.zIndex = '9999';
    layer.style.pointerEvents = 'auto';
    layer.style.transition = 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
    layer.style.transformOrigin = 'bottom right'; // El zoom se dirige hacia la esquina inferior derecha

    // Valores para el "estado miniatura"
    const miniWidth = 300;
    const miniHeight = 168; // Proporción 16:9
    const offset = 20; // Espacio desde el borde

    requestAnimationFrame(() => {
        layer.style.bottom = `${offset}px`;
        layer.style.right = `${offset}px`;
        layer.style.width = `${miniWidth}px`;
        layer.style.height = `${miniHeight}px`;
        layer.style.borderRadius = '12px';
        layer.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        layer.style.opacity = '1';
        layer.style.visibility = 'visible';
        
        // Si quieres un efecto de escala real además del cambio de tamaño:
        // layer.style.transform = 'scale(1)'; 
        
        document.body.classList.add('mini-player-active');
    });
}
    forceMiniPlayerVisibility() {
        // Fallback de emergencia
        const persistentLayer = document.getElementById('persistent-player-layer');
        if (persistentLayer) {
            persistentLayer.style.display = 'block';
            persistentLayer.style.visibility = 'visible';
            persistentLayer.style.opacity = '1';
            persistentLayer.style.zIndex = '999999';
        }
    }

    // ==========================================
    // INTERFAZ DEL REPRODUCTOR (DATA)
    // ==========================================

    updateNowPlaying(videoData) {
        if (!videoData) return;
        
        const artist = videoData.artist || videoData.uploaderName || 'Desconocido';
        const title = videoData.title || 'Sin título';
        const thumb = videoData.thumbnail || './electronic.ico';

        // Actualizar textos en todas partes
        if (this.elements.nowPlayingTitle) this.elements.nowPlayingTitle.textContent = title;
        if (this.elements.nowPlayingArtist) this.elements.nowPlayingArtist.textContent = artist;
        if (this.elements.playerTitle) this.elements.playerTitle.textContent = title;
        if (this.elements.playerArtist) this.elements.playerArtist.textContent = artist;
        
        // Actualizar thumbnails
        if (this.elements.playerThumbnail) this.elements.playerThumbnail.src = thumb;
        
        // Actualizar título de la ventana
        document.title = `▶ ${title} - YT CrossMix`;
    }

    updatePlayButton(state) {
        const iconClass = state === 'play' ? 'fa-play' : 'fa-pause';
        
        this.elements.playBtns.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                const icon = btn.querySelector('i');
                if (icon) icon.className = `fas ${iconClass}`;
            }
        });
    }

    enablePlayButton(enable = true) {
        const ids = [
            'botonPlay', 'botonNext', 'prevButton', 
            'miniPlayBtn', 'miniNextBtn', 'miniPrevBtn',  
            'shuffleBtn', 'repeatBtn'
        ];
        ids.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !enable;
        });
    }

    updateProgressBar(current, total) {
        if (total > 0 && this.elements.progressBar) {
            const percent = (current / total) * 100;
            this.elements.progressBar.style.width = `${percent}%`;
        }
        
        if (this.elements.currentTime) this.elements.currentTime.textContent = this.formatDuration(current);
        if (this.elements.totalTime) this.elements.totalTime.textContent = this.formatDuration(total);
    }

    // ==========================================
    // BÚSQUEDA Y RESULTADOS
    // ==========================================

   clearSearchResults() {
    const container = document.getElementById('searchResults');
    if (container) {
        container.innerHTML = `
            <div class="search-placeholder">
                <i class="fas fa-search"></i>
                <p>Busca música, artistas o playlists</p>
            </div>
        `;
        console.log('✅ Resultados de búsqueda limpiados');
    } else {
        console.warn('⚠️ searchResults no encontrado en clearSearchResults');
    }
}

createSearchResultCard(video) {
    // Validación y extracción de ID de video (soporta múltiples formatos de respuesta)
    let videoId = video.videoId || video.id;
    if (!videoId || videoId === 'undefined') {
        if (video.id && typeof video.id === 'object') videoId = video.id.videoId;
        if (!videoId) return null;
    }

    const title = video.title || 'Título desconocido';
    const artist = video.uploaderName || video.artist || 'Artista desconocido';
    const thumbnail = video.thumbnail || video.thumbnailUrl || './electronic.ico';
    
    // Formateo de duración
    let durationDisplay = '';
    if (video.duration) {
        durationDisplay = typeof video.duration === 'number' 
            ? this.formatDuration(video.duration) 
            : video.duration;
    }

    const div = document.createElement('div');
    div.className = 'track-item card-track search-result-card';
    div.dataset.videoId = videoId;

    div.innerHTML = `
        <div class="search-result-thumbnail">
            <img src="${thumbnail}" alt="${this.escapeHTML(title)}" loading="lazy" onerror="this.src='./electronic.ico';">
            ${durationDisplay ? `<span class="search-result-duration">${durationDisplay}</span>` : ''}
        </div>
        <div class="search-result-info">
            <h3 class="search-result-title" title="${this.escapeHTML(title)}">${this.escapeHTML(title)}</h3>
            <p class="search-result-author">${this.escapeHTML(artist)}</p>
        </div>
        <div class="search-result-actions">
             <button class="search-result-add-next-btn" title="Reproducir siguiente">
                <i class="fas fa-forward"></i>
            </button>
            <button class="add-to-queue-btn" title="Añadir a la cola">
                <i class="fas fa-plus"></i>
            </button>
        </div>
    `;

    // Evento: Reproducción inmediata al hacer click en la tarjeta (vía Core)
    div.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (window.unifiedCore && window.unifiedCore.playVideoFromSearch) {
            window.unifiedCore.playVideoFromSearch({
                id: videoId, title, thumbnail, channel: artist, duration: video.duration
            });
        }
    });

    // Evento: Botón añadir a la cola
    const addBtn = div.querySelector('.add-to-queue-btn');
    addBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const icon = addBtn.querySelector('i');
        icon.className = 'fas fa-spinner fa-spin';
        try {
            await window.unifiedCore.addVideoToQueue({
                videoId, title, thumbnail, duration: video.duration, artist
            });
            icon.className = 'fas fa-check';
            setTimeout(() => icon.className = 'fas fa-plus', 1500);
        } catch (err) { icon.className = 'fas fa-times'; }
    });

    // Evento: Botón reproducir a continuación
    const nextBtn = div.querySelector('.search-result-add-next-btn');
    nextBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const icon = nextBtn.querySelector('i');
        icon.className = 'fas fa-spinner fa-spin';
        try {
            await window.unifiedCore.addVideoToQueueAfterCurrent({
                videoId, title, thumbnail, duration: video.duration, artist
            });
            icon.className = 'fas fa-check';
            setTimeout(() => icon.className = 'fas fa-forward', 1500);
        } catch (err) { icon.className = 'fas fa-times'; }
    });

    return div;
}

    // ==========================================
    // NOTIFICACIONES Y ESTADÍSTICAS
    // ==========================================

    showMessage(message, type = 'info') {
        const container = document.getElementById('floatingMessageContainer') || document.body;
        const msg = document.createElement('div');
        msg.className = `floating-message ${type}`;
        msg.textContent = message;
        
        // Estilos inline por seguridad si falla CSS
        msg.style.zIndex = '10000';
        
        container.appendChild(msg);
        
        // Animación de entrada/salida
        setTimeout(() => {
            msg.style.opacity = '0';
            setTimeout(() => msg.remove(), 500);
        }, 3000);
    }

    updateOverviewStats(playlistsCount, videosCount) {
        if (!this.elements.overviewGrid) return;
        
        const stats = this.elements.overviewGrid.querySelectorAll('.overview-stat');
        if (stats.length >= 2) {
            stats[0].textContent = `${playlistsCount} playlists`;
            stats[1].textContent = `${videosCount} videos`;
        }
    }

    updateQueueCount(count) {
        if (this.elements.queueCount) this.elements.queueCount.textContent = count;
    }

    updateStatusIndicator(text, type) {
        const ind = document.getElementById('unifiedStatusIndicator');
        if (ind) {
            ind.textContent = text;
            ind.className = `status-indicator ${type}`;
        }
    }

    // ==========================================
    // UTILIDADES
    // ==========================================

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Inicializar globalmente
window.uiManager = new UIManager();
