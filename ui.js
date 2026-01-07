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
            window.addEventListener('resize', () => this.handleResize());
    }

    // ==========================================
    // GESTIÓN DE VISTAS Y PANELES
    // ==========================================
    handleResize() {
    console.log('🔄 Ventana redimensionada');
    
    // Solo reajustar si estamos en fullPlayer
    const isFullPlayer = document.body.classList.contains('full-player-active');
    
    if (isFullPlayer) {
        // Esperar a que el resize termine
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            console.log('📐 Reajustando player en fullscreen');
            this.movePlayersToFullView();
        }, 300);
    }
}
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
    if (!layer) {
        console.error('❌ persistent-player-layer no encontrado');
        return;
    }

    console.log('🎬 Expandiendo a pantalla completa');

    const activePlayerId = window.currentPlayer === 1 ? 'player1' : 'player2';
    const activePlayer = document.getElementById(activePlayerId);
    
    if (!activePlayer) {
        console.error('❌ Player activo no encontrado');
        return;
    }
    
    // ✅ MOVER PLAYER A LA CAPA PERSISTENTE
    if (!layer.contains(activePlayer)) {
        layer.appendChild(activePlayer);
    }

    // ✅ OBTENER EL CONTENEDOR CORRECTO (dentro de .video-container-full)
    const fullPlayerView = document.getElementById('fullPlayerView');
    const videoContainer = fullPlayerView?.querySelector('.video-container-full');
    
    if (!videoContainer) {
        console.error('❌ video-container-full no encontrado');
        return;
    }

    // ✅ CALCULAR DIMENSIONES DEL CONTENEDOR
    const containerRect = videoContainer.getBoundingClientRect();
    
    console.log('📐 Contenedor:', {
        width: containerRect.width,
        height: containerRect.height,
        top: containerRect.top,
        left: containerRect.left
    });

    // ✅ CONFIGURAR LA CAPA PERSISTENTE
    layer.style.transition = 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
    layer.style.zIndex = '55'; // ✅ Debajo de la cola (100)
    layer.style.pointerEvents = 'none'; // ✅ No bloquear clicks
    
    // ✅ ANIMAR A LAS DIMENSIONES DEL CONTENEDOR
    requestAnimationFrame(() => {
        layer.style.position = 'fixed';
        layer.style.top = `${containerRect.top}px`;
        layer.style.left = `${containerRect.left}px`;
        layer.style.width = `${containerRect.width}px`;
        layer.style.height = `${containerRect.height}px`;
        layer.style.borderRadius = '12px'; // ✅ Mantener bordes redondeados
        layer.style.boxShadow = 'none';
        layer.style.opacity = '1';
        layer.style.visibility = 'visible';
        
        // ✅ ASEGURAR QUE EL PLAYER INTERNO OCUPE TODO EL ESPACIO
        activePlayer.style.cssText = `
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            z-index: 10 !important;
            background: #000 !important;
        `;
        
        document.body.classList.remove('mini-player-active');
        document.body.classList.add('full-player-active');
        
        console.log('✅ Player expandido correctamente');
    });
}
showMiniPlayerFloat() {
    const layer = document.getElementById('persistent-player-layer');
    if (!layer) {
        console.error('❌ persistent-player-layer no encontrado');
        return;
    }

    console.log('🔍 Mostrando mini player flotante');

    const activePlayerId = window.currentPlayer === 1 ? 'player1' : 'player2';
    const activePlayer = document.getElementById(activePlayerId);
    
    if (activePlayer && !layer.contains(activePlayer)) {
        layer.appendChild(activePlayer);
    }

    layer.style.display = 'block';
    layer.style.position = 'fixed';
    layer.style.zIndex = '999999'; 
    layer.style.pointerEvents = 'auto';
    layer.style.transition = 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';

    const miniWidth = 320;
    const miniHeight = 180;
    const bottomOffset = 110; // Altura del bottom-player + espacio
    const rightOffset = 20;

    requestAnimationFrame(() => {
        layer.style.top = 'auto';
        layer.style.left = 'auto';
        layer.style.bottom = `${bottomOffset}px`;
        layer.style.right = `${rightOffset}px`;
        layer.style.width = `${miniWidth}px`;
        layer.style.height = `${miniHeight}px`;
        layer.style.borderRadius = '12px';
        layer.style.boxShadow = '0 10px 40px rgba(0,0,0,0.8)';
        layer.style.opacity = '1';
        layer.style.visibility = 'visible';
        
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
    // ✅ VALIDACIÓN ROBUSTA DEL VIDEO ID
    let videoId = video.videoId || video.id;
    
    // Si el ID es un objeto, extraer el videoId interno
    if (videoId && typeof videoId === 'object') {
        videoId = videoId.videoId || null;
    }
    
    // Validación estricta
    if (!videoId || videoId === 'undefined' || typeof videoId !== 'string' || videoId.trim() === '') {
        console.error('❌ Video ID inválido:', video);
        return null; // No crear tarjeta si no hay ID válido
    }

    const title = video.title || 'Título desconocido';
    const artist = video.uploaderName || video.artist || 'Artista desconocido';
    const thumbnail = video.thumbnail || video.thumbnailUrl || './electronic.ico';
    
    // ✅ VALIDACIÓN MEJORADA DE DURACIÓN
    let durationDisplay = '';
    if (video.duration) {
        if (typeof video.duration === 'number') {
            durationDisplay = this.formatDuration(video.duration);
        } else if (typeof video.duration === 'string') {
            durationDisplay = video.duration;
        }
    }

    const div = document.createElement('div');
    div.className = 'track-item card-track search-result-card';
    div.dataset.videoId = videoId; // ✅ Guardar ID validado

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
            <button class="search-result-add-next-btn" 
                    data-video-id="${videoId}"
                    data-title="${this.escapeHTML(title)}"
                    data-thumbnail="${thumbnail}"
                    data-duration="${video.duration || 0}"
                    data-artist="${this.escapeHTML(artist)}"
                    title="Reproducir siguiente">
                <i class="fas fa-forward"></i>
            </button>
            <button class="add-to-queue-btn" 
                    data-video-id="${videoId}"
                    title="Añadir a la cola">
                <i class="fas fa-plus"></i>
            </button>
        </div>
    `;

    // ✅ EVENTO: Click en tarjeta para reproducir
    div.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // Ignorar clicks en botones
        
        if (window.unifiedCore && window.unifiedCore.playVideoFromSearch) {
            window.unifiedCore.playVideoFromSearch({
                id: videoId,
                title: title,
                thumbnail: thumbnail,
                channel: artist,
                duration: video.duration || 0
            });
        }
    });

    // ✅ EVENTO: Botón "Añadir a cola" MEJORADO
    const addBtn = div.querySelector('.add-to-queue-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const btnVideoId = addBtn.dataset.videoId;
            if (!btnVideoId || btnVideoId === 'undefined') {
                console.error('❌ ID inválido en botón');
                return;
            }
            
            const icon = addBtn.querySelector('i');
            icon.className = 'fas fa-spinner fa-spin';
            addBtn.disabled = true;
            
            try {
                // ✅ CREAR OBJETO DE VIDEO COMPLETO
                const videoData = {
                    videoId: btnVideoId,
                    title: title,
                    thumbnail: thumbnail,
                    duration: video.duration || 0,
                    uploaderName: artist,
                    author: artist,
                    artist: artist
                };
                
                await window.unifiedCore.addVideoToQueue(videoData);
                
                icon.className = 'fas fa-check';
                addBtn.style.background = '#4caf50';
                
                setTimeout(() => {
                    icon.className = 'fas fa-plus';
                    addBtn.style.background = '';
                    addBtn.disabled = false;
                }, 1500);
                
            } catch (err) {
                console.error('❌ Error añadiendo:', err);
                icon.className = 'fas fa-times';
                addBtn.style.background = '#f44336';
                
                setTimeout(() => {
                    icon.className = 'fas fa-plus';
                    addBtn.style.background = '';
                    addBtn.disabled = false;
                }, 1500);
            }
        });
    }

    // ✅ EVENTO: Botón "Siguiente" MEJORADO
    const nextBtn = div.querySelector('.search-result-add-next-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const btnVideoId = nextBtn.dataset.videoId;
            if (!btnVideoId || btnVideoId === 'undefined') {
                console.error('❌ ID inválido en botón siguiente');
                return;
            }
            
            const icon = nextBtn.querySelector('i');
            icon.className = 'fas fa-spinner fa-spin';
            nextBtn.disabled = true;
            
            try {
                const videoData = {
                    videoId: btnVideoId,
                    title: nextBtn.dataset.title || title,
                    thumbnail: nextBtn.dataset.thumbnail || thumbnail,
                    duration: parseInt(nextBtn.dataset.duration) || 0,
                    uploaderName: nextBtn.dataset.artist || artist,
                    author: nextBtn.dataset.artist || artist,
                    artist: nextBtn.dataset.artist || artist
                };
                
                await window.unifiedCore.addVideoToQueueAfterCurrent(videoData);
                
                icon.className = 'fas fa-check';
                nextBtn.style.background = '#4caf50';
                
                setTimeout(() => {
                    icon.className = 'fas fa-forward';
                    nextBtn.style.background = '';
                    nextBtn.disabled = false;
                }, 1500);
                
            } catch (err) {
                console.error('❌ Error añadiendo siguiente:', err);
                icon.className = 'fas fa-times';
                nextBtn.style.background = '#f44336';
                
                setTimeout(() => {
                    icon.className = 'fas fa-forward';
                    nextBtn.style.background = '';
                    nextBtn.disabled = false;
                }, 1500);
            }
        });
    }

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
