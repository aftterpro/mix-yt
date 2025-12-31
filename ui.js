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
        console.log('🎬 Maximizando reproductor...');
        const p1 = document.getElementById('player1');
        const p2 = document.getElementById('player2');
        const fullContainer = document.getElementById('videoWrapper'); 
        const persistentLayer = document.getElementById('persistent-player-layer');

        if (fullContainer) {
            // 1. Mover los reproductores de vuelta al contenedor grande
            // Solo si no están ya ahí para evitar recargas innecesarias
            if (p1 && p1.parentElement !== fullContainer) fullContainer.appendChild(p1);
            if (p2 && p2.parentElement !== fullContainer) fullContainer.appendChild(p2);
            
            // 2. Resetear estilos del contenedor flotante
            if (persistentLayer) {
                persistentLayer.style.transition = 'none'; // Quitar animación para reset instantáneo
                persistentLayer.style.display = 'none';
                persistentLayer.style.opacity = '0';
                persistentLayer.style.pointerEvents = 'none';
                persistentLayer.style.width = '100%'; 
                persistentLayer.style.height = '100%';
            }
            
            // 3. Actualizar estado global
            document.body.classList.remove('mini-player-active');
        }
    }
showMiniPlayerFloat() {
        let persistentLayer = document.getElementById('persistent-player-layer');
        const p1 = document.getElementById('player1');
        const p2 = document.getElementById('player2');
        
        // 1. Crear capa si no existe (Safety Check)
        if (!persistentLayer) {
            console.warn('⚠️ persistent-player-layer no encontrado, creando contenedor...');
            persistentLayer = document.createElement('div');
            persistentLayer.id = 'persistent-player-layer';
            persistentLayer.className = 'persistent-player-layer';
            document.body.appendChild(persistentLayer);
        } 

        // ✅ CORRECCIÓN: Definir miniPosition
        const miniPosition = {
            bottom: 80,    // Altura desde abajo (ajustar según tu barra de navegación)
            right: 20,     // Distancia desde la derecha
            width: 320,    // Ancho del mini player
            height: 180    // Alto del mini player (16:9)
        };

        // 4. Aplicar estilos y animación (Zoom Effect)
        // Usamos requestAnimationFrame para asegurar que el navegador procese el cambio
        requestAnimationFrame(() => {
            persistentLayer.style.display = 'block';
            persistentLayer.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
            persistentLayer.style.position = 'fixed';
            
            // Coordenadas (Ahora sí usa la variable definida arriba)
            persistentLayer.style.bottom = `${miniPosition.bottom}px`;
            persistentLayer.style.right = `${miniPosition.right}px`;
            persistentLayer.style.top = 'auto';  
            persistentLayer.style.left = 'auto'; 
            
            // Dimensiones
            persistentLayer.style.width = `${miniPosition.width}px`;
            persistentLayer.style.height = `${miniPosition.height}px`;
            
            // Visibilidad
            persistentLayer.style.borderRadius = '12px';
            persistentLayer.style.zIndex = '999999'; // Encima de todo
            persistentLayer.style.opacity = '1';
            persistentLayer.style.visibility = 'visible';
            persistentLayer.style.pointerEvents = 'auto';
            
            document.body.classList.add('mini-player-active');
        });
        
        console.log('✅ Mini player activado');
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

    renderSearchResults(items) {
       }

    createSearchResultCard(video) {
        // ✅ Validación robusta de ID
        let videoId = video.videoId || video.id;
        
        if (!videoId || videoId === 'undefined') return null;

        const title = video.title || 'Título desconocido';
        const artist = video.uploaderName || video.artist || 'Artista desconocido';
        const thumbnail = video.thumbnail || video.thumbnailUrl || './electronic.ico';
        
        // ✅ Procesar duración de forma robusta
        let durationInSeconds = 0;
        let durationDisplay = '';
        
        if (typeof video.duration === 'number') {
            durationInSeconds = video.duration;
            durationDisplay = this.formatDuration(video.duration);
        } else if (typeof video.duration === 'string') {
            // Intentar parsear "3:45"
            const parts = video.duration.split(':').map(Number);
            if (parts.length === 2) durationInSeconds = parts[0] * 60 + parts[1];
            if (parts.length === 3) durationInSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            durationDisplay = video.duration;
        }

        const div = document.createElement('div');
        div.className = 'track-item card-track search-result-card';
        div.dataset.videoId = videoId;

        // Estructura HTML de la tarjeta
        div.innerHTML = `
            <div class="search-result-thumbnail">
                <img src="${thumbnail}" 
                     alt="${this.escapeHTML(title)}" 
                     loading="lazy" 
                     onerror="this.src='./electronic.ico';">
                ${durationDisplay ? `<span class="search-result-duration">${durationDisplay}</span>` : ''}
            </div>
            
            <div class="search-result-info">
                <h3 class="search-result-title" title="${this.escapeHTML(title)}">
                    ${this.escapeHTML(title)}
                </h3>
                <p class="search-result-author">
                    ${this.escapeHTML(artist)}
                </p>
            </div>
            
            <button class="add-to-queue-btn" 
                    data-video-id="${videoId}"
                    data-title="${this.escapeHTML(title)}"
                    data-thumbnail="${thumbnail}"
                    data-duration="${durationInSeconds}"
                    data-artist="${this.escapeHTML(artist)}"
                    title="Añadir a la cola">
                <i class="fas fa-plus"></i>
            </button>
        `;

        // ✅ Event Listener para añadir a cola
        const addBtn = div.querySelector('.add-to-queue-btn');
        if (addBtn) {
            addBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Evitar click en la tarjeta padre
                e.preventDefault();
                
                console.log(`🎵 Añadiendo: ${videoId}`);
                
                const videoData = {
                    videoId: videoId,
                    title: addBtn.dataset.title,
                    thumbnail: addBtn.dataset.thumbnail,
                    duration: parseInt(addBtn.dataset.duration) || 0,
                    uploaderName: addBtn.dataset.artist,
                    artist: addBtn.dataset.artist
                };

                // Feedback visual: Cargando
                addBtn.disabled = true;
                const originalHTML = addBtn.innerHTML;
                addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                try {
                    if (window.playlistManager) {
                        await window.playlistManager.addVideoToQueue(videoData);
                        
                        // Feedback: Éxito
                        addBtn.innerHTML = '<i class="fas fa-check"></i>';
                        addBtn.classList.add('success');
                        
                        setTimeout(() => {
                            addBtn.innerHTML = originalHTML;
                            addBtn.disabled = false;
                            addBtn.classList.remove('success');
                        }, 1500);
                    } else {
                        throw new Error('Gestor de playlist no listo');
                    }
                } catch (error) {
                    console.error('❌ Error:', error);
                    // Feedback: Error
                    addBtn.innerHTML = '<i class="fas fa-times"></i>';
                    addBtn.classList.add('error');
                    setTimeout(() => {
                        addBtn.innerHTML = originalHTML;
                        addBtn.disabled = false;
                        addBtn.classList.remove('error');
                    }, 1500);
                }
            });
        }

        // Click en la tarjeta para reproducir inmediatamente (Opcional)
        // div.addEventListener('click', () => { ... });

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
