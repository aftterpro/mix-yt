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

    // Validaciones
    if (!playersLayer) {
        console.warn('⚠️ persistent-player-layer no encontrado');
        return;
    }

    if (!targetContainer) {
        console.warn(`⚠️ Contenedor ${targetContainerId} no encontrado`);
        return;
    }

    if (targetContainer.classList.contains('hidden')) {
        playersLayer.style.opacity = '0';
        playersLayer.style.pointerEvents = 'none';
        return;
    }

    const rect = targetContainer.getBoundingClientRect();
    
    // Validar dimensiones
    if (rect.width === 0 || rect.height === 0) {
        console.warn(`⚠️ ${targetContainerId} sin dimensiones válidas`);
        return;
    }

    // Ajuste de altura para Full Player
    let finalHeight = rect.height;
    if (targetContainerId === 'videoWrapper') {
        const calculatedHeight = rect.width * (9 / 16);
        if (finalHeight > 500 || finalHeight > rect.width) {
            finalHeight = calculatedHeight;
            targetContainer.style.height = `${calculatedHeight}px`;
        }
    }

    // Aplicar posición
    playersLayer.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
    playersLayer.style.top = `${rect.top}px`;
    playersLayer.style.left = `${rect.left}px`;
    playersLayer.style.width = `${rect.width}px`;
    playersLayer.style.height = `${finalHeight}px`;
    
    // Estilos específicos según vista
    if (targetContainerId === 'videoWrapper') {
        playersLayer.style.opacity = '1';
        playersLayer.style.pointerEvents = 'auto';
        playersLayer.style.zIndex = '60';
        playersLayer.style.borderRadius = '12px';
        playersLayer.style.display = 'block';
    }

    console.log(`✅ Player posicionado en ${targetContainerId}:`, {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: finalHeight
    });
}
movePlayersToFullView() {
    console.log('🎬 movePlayersToFullView iniciado');
    
    let persistentLayer = document.getElementById('persistent-player-layer');
    
    // ✅ Crear capa si no existe
    if (!persistentLayer) {
        console.warn('⚠️ Creando persistent-player-layer...');
        persistentLayer = document.createElement('div');
        persistentLayer.id = 'persistent-player-layer';
        persistentLayer.style.cssText = `
            position: fixed;
            background: #000;
            overflow: hidden;
            pointer-events: auto;
            transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
            z-index: 60;
        `;
        document.body.appendChild(persistentLayer);
        
        // Mover players al layer
        const p1 = document.getElementById('player1');
        const p2 = document.getElementById('player2');
        if (p1) persistentLayer.appendChild(p1);
        if (p2) persistentLayer.appendChild(p2);
    }
    
    const videoWrapper = document.getElementById('videoWrapper');
    if (!videoWrapper) {
        console.error('❌ videoWrapper no encontrado');
        return;
    }

    const rect = videoWrapper.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) {
        console.warn('⚠️ videoWrapper sin dimensiones, forzando...');
        videoWrapper.style.width = '100%';
        videoWrapper.style.height = '100%';
        videoWrapper.style.minHeight = '400px';
        
        requestAnimationFrame(() => this.movePlayersToFullView());
        return;
    }

    console.log('✅ Dimensiones OK:', rect);
    
    // Aplicar posición
    persistentLayer.style.display = 'block';
    persistentLayer.style.top = `${rect.top}px`;
    persistentLayer.style.left = `${rect.left}px`;
    persistentLayer.style.width = `${rect.width}px`;
    persistentLayer.style.height = `${rect.height}px`;
    persistentLayer.style.borderRadius = '12px';
    persistentLayer.style.opacity = '1';
    persistentLayer.style.pointerEvents = 'auto';
    
    document.body.classList.remove('mini-player-active');
    
    // Asegurar visibilidad de players
    const players = persistentLayer.querySelectorAll('.video-player');
    players.forEach(player => {
        if (!player.classList.contains('hidden')) {
            player.style.display = 'block';
            player.style.visibility = 'visible';
        }
    });
    
    console.log('✅ movePlayersToFullView completado');
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

 renderSearchResults(items, isContinuation = false) {
    const container = this.elements.searchResults;
    if (!container) {
        console.error('❌ Contenedor searchResults no encontrado');
        return;
    }

    // ✅ CORRECCIÓN: Validar y normalizar datos
    let videosToRender = [];
    
    if (Array.isArray(items)) {
        videosToRender = items;
    } else if (items && Array.isArray(items.items)) {
        videosToRender = items.items;
    } else if (items && typeof items === 'object') {
        console.warn('⚠️ UI: Objeto recibido no es array, intentando convertir');
        videosToRender = [items];
    } else {
        console.error('❌ UI: Datos inválidos recibidos:', items);
        container.innerHTML = '<div class="search-placeholder"><p>Error: datos inválidos</p></div>';
        return;
    }

    // Limpiar contenedor si es búsqueda nueva
    if (!isContinuation) {
        container.innerHTML = '';
    } else {
        // Remover loader si existe
        const loader = container.querySelector('.search-loading-more, .search-loading');
        if (loader) loader.remove();
    }

    // Validar que hay videos para mostrar
    if (!videosToRender || videosToRender.length === 0) {
        if (!isContinuation) {
            container.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>No se encontraron videos</p>
                </div>
            `;
        }
        return;
    }

    console.log(`✅ Renderizando ${videosToRender.length} videos`);

    // ✅ CORRECCIÓN: Usar DocumentFragment para mejor rendimiento
    const fragment = document.createDocumentFragment();
    
    videosToRender.forEach(video => {
        if (!video) return;
        
        const card = this.createSearchResultCard(video);
        if (card) fragment.appendChild(card);
    });

    container.appendChild(fragment);
    
    console.log(`✅ ${container.children.length} videos en el DOM`);
}
createSearchResultCard(video) {
    // ✅ CORRECCIÓN: Validación robusta de videoId
    let videoId = video.videoId || video.id;
    
    if (!videoId || videoId === 'undefined') {
        console.warn('⚠️ Video sin ID válido, omitiendo:', video);
        return null;
    }

    const title = video.title || 'Título desconocido';
    const artist = video.uploaderName || video.artist || 'Artista desconocido';
    const thumbnail = video.thumbnail || video.thumbnailUrl || './electronic.ico';
    
    // ✅ CORRECCIÓN: Procesar duración de forma robusta
    let durationInSeconds = 0;
    let durationDisplay = '';
    
    if (typeof video.duration === 'number' && video.duration > 0) {
        durationInSeconds = video.duration;
        durationDisplay = this.formatDuration(video.duration);
    } else if (typeof video.duration === 'string' && video.duration) {
        // Convertir string "3:45" a segundos
        const parts = video.duration.split(':').map(Number);
        if (parts.length === 2) {
            durationInSeconds = (parts[0] * 60) + parts[1];
        } else if (parts.length === 3) {
            durationInSeconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        }
        durationDisplay = video.duration;
    }

    const div = document.createElement('div');
    div.className = 'track-item card-track search-result-card';
    div.dataset.videoId = videoId;

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

    // ✅ CORRECCIÓN: Event listener con manejo de errores
    const addBtn = div.querySelector('.add-to-queue-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            console.log(`🎵 Añadiendo: ${videoId} (${durationInSeconds}s)`);
            
            const videoData = {
                videoId: videoId,
                title: addBtn.dataset.title,
                thumbnail: addBtn.dataset.thumbnail,
                duration: durationInSeconds,
                uploaderName: addBtn.dataset.artist,
                artist: addBtn.dataset.artist
            };

            // Estado de carga
            addBtn.disabled = true;
            const originalHTML = addBtn.innerHTML;
            addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                if (window.playlistManager) {
                    await window.playlistManager.addVideoToQueue(videoData);
                    
                    // Éxito
                    addBtn.innerHTML = '<i class="fas fa-check"></i>';
                    addBtn.classList.add('success');
                    
                    setTimeout(() => {
                        addBtn.innerHTML = originalHTML;
                        addBtn.disabled = false;
                        addBtn.classList.remove('success');
                    }, 1500);
                } else {
                    throw new Error('PlaylistManager no disponible');
                }
            } catch (error) {
                console.error('❌ Error añadiendo video:', error);
                
                // Error
                addBtn.innerHTML = '<i class="fas fa-times"></i>';
                addBtn.classList.add('error');
                
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage(
                        'Error añadiendo video: ' + error.message, 
                        'error'
                    );
                }
                
                setTimeout(() => {
                    addBtn.innerHTML = originalHTML;
                    addBtn.disabled = false;
                    addBtn.classList.remove('error');
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
