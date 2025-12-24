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
        // 1. Actualizar Tabs/Botones de navegación
        document.querySelectorAll('.nav-item, .tab, .nav-tab').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === viewName) item.classList.add('active');
        });

        // 2. Ocultar/Mostrar Contenedores
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
            // Scroll al top si no es el reproductor full
            if (viewName !== 'fullPlayer' && view.dataset.view !== viewName) {
                view.scrollTop = 0;
            }
        });

        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) targetView.classList.add('active');

        // 3. Gestión específica del Mini Player vs Full Player
        this.togglePlayerVisibility(viewName);
    }

    togglePlayerVisibility(viewName) {
        const miniPlayer = document.getElementById('miniPlayerFloat');
        const persistentLayer = document.getElementById('persistent-player-layer');
        const hasActiveVideo = window.reproduccionIniciada || 
                               (window.currentPlayingInfo?.flattenedIndex >= 0);

        if (viewName === 'fullPlayer') {
            // Entrando a Full Player
            if (miniPlayer) miniPlayer.classList.add('hidden');
            document.body.classList.remove('mini-player-active');
            
            if (persistentLayer) {
                persistentLayer.style.display = 'block';
                persistentLayer.style.opacity = '1';
                persistentLayer.style.pointerEvents = 'auto';
            }
            // Efecto visual de expansión
            this.movePlayersToFullView();
        } else {
            // Saliendo de Full Player
            if (hasActiveVideo) {
                this.showMiniPlayerFloat();
            } else {
                if (miniPlayer) miniPlayer.classList.add('hidden');
                if (persistentLayer) {
                    persistentLayer.style.opacity = '0';
                    persistentLayer.style.pointerEvents = 'none';
                }
            }
        }
    }

    // ==========================================
    // INTERFAZ DEL REPRODUCTOR
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
        if (this.elements.playerThumbnail) this.elements.playerThumbnail.src = thumb;
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
        const ids = ['botonPlay', 'botonNext', 'prevButton', 'miniPlayBtn', 'miniNextBtn'];
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
    // MOVIMIENTO DE REPRODUCTORES (VISUAL)
    // ==========================================

    updatePlayerPosition(targetContainerId) {
        const playersLayer = document.getElementById('persistent-player-layer');
        const targetContainer = document.getElementById(targetContainerId);

        if (!playersLayer || !targetContainer || targetContainer.classList.contains('hidden')) {
            if (playersLayer) {
                playersLayer.style.opacity = '0';
                playersLayer.style.pointerEvents = 'none';
            }
            return;
        }

        const rect = targetContainer.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        // Ajuste de altura para Full Player
        let finalHeight = rect.height;
        if (targetContainerId === 'videoWrapper') {
            const calculatedHeight = rect.width * (9 / 16);
            if (finalHeight > 500 || finalHeight > rect.width) {
                finalHeight = calculatedHeight;
                targetContainer.style.height = `${calculatedHeight}px`;
            }
        }

        playersLayer.style.top = `${rect.top}px`;
        playersLayer.style.left = `${rect.left}px`;
        playersLayer.style.width = `${rect.width}px`;
        playersLayer.style.height = `${finalHeight}px`;
        
        // Estilos específicos según vista
        if (targetContainerId === 'videoWrapper') {
            playersLayer.style.opacity = '1';
            playersLayer.style.pointerEvents = 'auto';
            playersLayer.style.zIndex = '60'; // Corrección Z-Index
            playersLayer.style.borderRadius = '12px';
        }
    }

movePlayersToFullView() {
        const persistentLayer = document.getElementById('persistent-player-layer');
        const videoWrapper = document.getElementById('videoWrapper');
        
        if (!persistentLayer || !videoWrapper) {
            console.warn('⚠️ No se encontró persistent layer o videoWrapper');
            return;
        }

        // Asegurar que videoWrapper sea visible y tenga dimensiones
        const rect = videoWrapper.getBoundingClientRect();
        
        if (rect.width === 0 || rect.height === 0) {
            console.warn('⚠️ videoWrapper no tiene dimensiones');
            // Forzar dimensiones
            videoWrapper.style.width = '100%';
            videoWrapper.style.height = '100%';
            videoWrapper.style.minHeight = '400px';
            
            // Reintentar después del reflow
            requestAnimationFrame(() => this.movePlayersToFullView());
            return;
        }

        console.log('🎬 Moviendo a Full View:', rect);
        
        persistentLayer.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
        persistentLayer.style.display = 'block';
        persistentLayer.style.position = 'fixed';
        persistentLayer.style.top = `${rect.top}px`;
        persistentLayer.style.left = `${rect.left}px`;
        persistentLayer.style.width = `${rect.width}px`;
        persistentLayer.style.height = `${rect.height}px`;
        persistentLayer.style.zIndex = '60';
        persistentLayer.style.borderRadius = '12px';
        persistentLayer.style.opacity = '1';
        persistentLayer.style.pointerEvents = 'auto';
        persistentLayer.style.backgroundColor = '#000';
        
        document.body.classList.remove('mini-player-active');
        const players = persistentLayer.querySelectorAll('.video-player');
        players.forEach(player => {
            if (!player.classList.contains('hidden')) {
                player.style.display = 'block';
                player.style.visibility = 'visible';
            }
        });
    }

    showMiniPlayerFloat() {
        const miniPlayer = document.getElementById('miniPlayerFloat');
        const persistentLayer = document.getElementById('persistent-player-layer');
        
        if (!miniPlayer || !persistentLayer) return;

        miniPlayer.classList.remove('hidden');
        miniPlayer.style.display = 'block';
        
        const rect = miniPlayer.getBoundingClientRect();
        
        persistentLayer.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
        persistentLayer.style.top = `${rect.top}px`;
        persistentLayer.style.left = `${rect.left}px`;
        persistentLayer.style.width = `${rect.width}px`;
        persistentLayer.style.height = `${rect.height}px`;
        persistentLayer.style.borderRadius = '12px';
        persistentLayer.style.zIndex = '999999'; // Encima de todo
        persistentLayer.style.opacity = '1';
        
        document.body.classList.add('mini-player-active');
    }

    forceMiniPlayerVisibility() {
        // Lógica para forzar visibilidad si CSS falla
        const miniPlayer = document.getElementById('miniPlayerFloat');
        if (miniPlayer) {
            miniPlayer.classList.remove('hidden');
            miniPlayer.style.display = 'block';
            miniPlayer.style.visibility = 'visible';
            miniPlayer.style.opacity = '1';
            
            // Forzar actualización de posición del layer
            requestAnimationFrame(() => this.showMiniPlayerFloat());
        }
    }

    // ==========================================
    // BÚSQUEDA Y RESULTADOS
    // ==========================================

    clearSearchResults() {
        if (this.elements.searchResults) {
            this.elements.searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                </div>
            `;
        }
    }

   renderSearchResults(items, isContinuation = false) {renderSearchResults(items, isContinuation = false) {
        const container = this.elements.searchResults;
        if (!container) return;

        // --- CORRECCIÓN 1: Asegurar que 'items' sea un array ---
        let videosToRender = [];
        
        if (Array.isArray(items)) {
            videosToRender = items;
        } else if (items && Array.isArray(items.items)) {
            // Si la API devuelve { items: [...], nextPageToken: ... }
            videosToRender = items.items;
        } else if (items && typeof items === 'object') {
             // Caso raro: objeto único
             console.warn('UI: Recibido objeto no array, intentando convertir', items);
             videosToRender = [items];
        }

        if (!isContinuation) container.innerHTML = '';
        else {
             const loader = container.querySelector('.search-loading-more');
             if (loader) loader.remove();
        }

        // Si después de limpiar sigue vacío o nulo
        if (!videosToRender || videosToRender.length === 0) {
            if (!isContinuation) container.innerHTML = '<div class="search-placeholder"><p>No se encontraron videos.</p></div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        
        // Usamos videosToRender en lugar de items
        videosToRender.forEach(video => {
            // Validación extra para evitar errores si llega un item vacío
            if (!video) return; 
            const card = this.createSearchResultCard(video);
            fragment.appendChild(card);
        });

        container.appendChild(fragment);
    }
       
createSearchResultCard(video) {
        // 1. Validación temprana: Si no hay ID, no renderizamos nada (evita errores)
        const videoId = video.videoId || video.id;
        if (!videoId) return document.createDocumentFragment();

        // 2. Normalización de datos (Fallbacks)
        const title = video.title || 'Título desconocido';
        const artist = video.uploaderName || video.artist || 'Artista desconocido';
        const thumbnail = video.thumbnail || video.thumbnailUrl || './electronic.ico';
        
        // Formatear duración solo si es necesario
        let durationDisplay = '';
        if (typeof video.duration === 'number') {
            durationDisplay = this.formatDuration(video.duration);
        } else {
            durationDisplay = video.duration || '';
        }

        // 3. Creación del Elemento
        const div = document.createElement('div');
        // Combinamos clases: 
        // 'track-item' y 'card-track': Para que herede estilos de lista/grid de tu CSS.
        // 'search-result-card': Por si tienes estilos específicos de búsqueda.
        div.className = 'track-item card-track search-result-card';
        div.dataset.videoId = videoId; // Útil para debug o clicks generales

        // 4. HTML Optimizado
        // Nota: Agregamos 'play-video-card-btn' al contenedor de la imagen para permitir play directo
        div.innerHTML = `
            <div class="search-result-thumbnail play-video-card-btn" data-video-id="${videoId}" role="button">
                <img src="${thumbnail}" 
                     alt="${this.escapeHTML(title)}" 
                     loading="lazy" 
                     onerror="this.src='./electronic.ico';">
                ${durationDisplay ? `<span class="search-result-duration">${durationDisplay}</span>` : ''}
                <div class="play-overlay"><i class="fas fa-play"></i></div>
            </div>
            
            <div class="search-result-info">
                <h3 title="${this.escapeHTML(title)}">${this.escapeHTML(title)}</h3>
                <p>${this.escapeHTML(artist)}</p>
            </div>
            
            <button class="add-to-queue-btn" 
                    data-video-id="${videoId}"
                    title="Añadir a la cola">
                <i class="fas fa-plus"></i>
            </button>
        `;

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
        
        // Estilos básicos si no existen en CSS
        if (!document.querySelector('.floating-message')) {
            msg.style.position = 'fixed';
            msg.style.bottom = '100px';
            msg.style.left = '50%';
            msg.style.transform = 'translateX(-50%)';
            msg.style.zIndex = '10000';
            msg.style.padding = '10px 20px';
            msg.style.background = 'rgba(0,0,0,0.8)';
            msg.style.borderRadius = '20px';
        }

        container.appendChild(msg);
        setTimeout(() => {
            msg.style.opacity = '0';
            setTimeout(() => msg.remove(), 500);
        }, 3000);
    }

    updateOverviewStats(playlistsCount, videosCount) {
        if (!this.elements.overviewGrid) return;
        
        const pStat = this.elements.overviewGrid.querySelector('.overview-stat');
        const vStat = this.elements.overviewGrid.querySelector('.overview-stat:nth-child(2)');
        
        if (pStat) pStat.textContent = `${playlistsCount} playlists`;
        if (vStat) vStat.textContent = `${videosCount} videos`;
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
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Inicializar globalmente
window.uiManager = new UIManager();
