console.log('🎵 Cargando módulo de subida de letras...');

class LyricsUploader {
    constructor() {
        this.apiUrl = 'https://lrclib.net/api';
        this.setupUI();
    }

setupUI() {
    // Añadir botón de subida en la pestaña de letras
    document.addEventListener('DOMContentLoaded', () => {
        // CORRECCIÓN: Usar una función de espera para asegurar que la vista se renderizó.
        // La vista de la cola es dinámica.
        this.waitForLyricsTab(); 
    });
}

waitForLyricsTab(attempts = 0) {
    const lyricsTab = document.querySelector('[data-tab-content="lyrics"]');
    
    if (lyricsTab && attempts < 20) {
        // Aseguramos que el tab tiene la estructura esperada
        if (lyricsTab.querySelector('.lyrics-container')) {
             console.log('✅ Tab de letras encontrado, inyectando botón.');
             this.injectUploadButton(lyricsTab);
        } else {
             // Si solo existe el tab, intentamos de nuevo por si se está llenando
             if (attempts < 5) {
                setTimeout(() => this.waitForLyricsTab(attempts + 1), 100);
             } else {
                // Si el tab existe, inyectar el botón directamente
                this.injectUploadButton(lyricsTab);
             }
        }
    } else if (attempts < 20) {
        // Intenta hasta 20 veces (2 segundos)
        setTimeout(() => this.waitForLyricsTab(attempts + 1), 100);
    } else {
        console.error('❌ No se encontró el tab de letras después de varios intentos.');
    }
}
    injectUploadButton(container) {
        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'upload-lyrics-btn';
        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Subir Letras';
        uploadBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            z-index: 10;
        `;
        
        uploadBtn.addEventListener('click', () => this.showUploadDialog());
        container.style.position = 'relative';
        container.appendChild(uploadBtn);
    }

    showUploadDialog() {
        // Obtener info del video actual
        const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
        const flatList = window.unifiedCore?.getFlattenedPlaylist() || [];
        const currentVideo = flatList[currentIndex];

        if (!currentVideo) {
            alert('No hay canción reproduciéndose');
            return;
        }

        const dialog = document.createElement('div');
        dialog.className = 'lyrics-upload-dialog';
        dialog.innerHTML = `
            <div class="lyrics-upload-overlay" onclick="this.parentElement.remove()"></div>
            <div class="lyrics-upload-content">
                <h2>Subir Letras a LRCLIB</h2>
                <form id="lyricsUploadForm">
                    <div class="form-group">
                        <label>Canción:</label>
                        <input type="text" id="trackName" value="${this.escapeHTML(currentVideo.title)}" required>
                    </div>
                    <div class="form-group">
                        <label>Artista:</label>
                        <input type="text" id="artistName" value="${this.escapeHTML(currentVideo.artist || currentVideo.uploaderName)}" required>
                    </div>
                    <div class="form-group">
                        <label>Álbum (opcional):</label>
                        <input type="text" id="albumName">
                    </div>
                    <div class="form-group">
                        <label>Duración (segundos):</label>
                        <input type="number" id="duration" value="${currentVideo.duration || 0}" required>
                    </div>
                    <div class="form-group">
                        <label>Letras Sincronizadas (LRC):</label>
                        <textarea id="syncedLyrics" rows="10" placeholder="[00:12.00]Primera línea
[00:17.20]Segunda línea"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Letras Planas (opcional):</label>
                        <textarea id="plainLyrics" rows="5" placeholder="Primera línea
Segunda línea"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" onclick="this.closest('.lyrics-upload-dialog').remove()">Cancelar</button>
                        <button type="submit" class="primary-btn">Subir</button>
                    </div>
                </form>
                <div id="uploadStatus"></div>
            </div>
        `;

        document.body.appendChild(dialog);

        const form = dialog.querySelector('#lyricsUploadForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.uploadLyrics(form, dialog);
        });
    }

 async uploadLyrics(form, dialog) {
    const statusDiv = dialog.querySelector('#uploadStatus');
    statusDiv.textContent = 'Preparando datos...';
    statusDiv.style.color = 'blue';

    // Obtener video actual
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    const flatList = window.unifiedCore?.getFlattenedPlaylist() || [];
    const currentVideo = flatList[currentIndex];

    if (!currentVideo) {
        statusDiv.textContent = '❌ No hay video reproduciéndose';
        statusDiv.style.color = 'red';
        return;
    }

    const formData = {
        trackName: form.querySelector('#trackName').value.trim(),
        artistName: form.querySelector('#artistName').value.trim(),
        albumName: form.querySelector('#albumName').value.trim(),
        duration: parseInt(form.querySelector('#duration').value),
        syncedLyrics: form.querySelector('#syncedLyrics').value.trim(),
        plainLyrics: form.querySelector('#plainLyrics').value.trim()
    };

    // Validaciones
    if (!formData.trackName || !formData.artistName || !formData.duration) {
        statusDiv.textContent = '❌ Faltan campos requeridos';
        statusDiv.style.color = 'red';
        return;
    }

    if (!formData.syncedLyrics && !formData.plainLyrics) {
        const confirmInstrumental = confirm('No hay letras. ¿Marcar como instrumental?');
        if (!confirmInstrumental) return;
    }

    // ✅ NUEVO: Mostrar popup de confirmación
    const confirmed = await this.showConfirmationPopup(currentVideo, formData);
    if (!confirmed) {
        statusDiv.textContent = '❌ Subida cancelada';
        statusDiv.style.color = 'orange';
        return;
    }

    try {
        // Paso 1: Obtener desafío
        statusDiv.textContent = '🔐 Obteniendo desafío...';
        const challengeResponse = await fetch(`${this.apiUrl}/request-challenge`, {
            method: 'POST'
        });

        if (!challengeResponse.ok) {
            throw new Error('No se pudo obtener el desafío');
        }

        const challenge = await challengeResponse.json();
        console.log('✅ Desafío obtenido:', challenge);
        
        // Paso 2: Resolver PoW
        statusDiv.textContent = '⚙️ Resolviendo prueba de trabajo...';
        const publishToken = await this.solveProofOfWork(challenge.prefix, challenge.target);
        console.log('✅ PoW resuelto');
        
        // Paso 3: Publicar letras
        statusDiv.textContent = '📤 Publicando letras...';
        const publishResponse = await fetch(`${this.apiUrl}/publish`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Publish-Token': publishToken
            },
            body: JSON.stringify(formData)
        });

        if (publishResponse.status === 201) {
            statusDiv.textContent = '✅ ¡Letras publicadas con éxito!';
            statusDiv.style.color = 'green';
            
            console.log('✅ Letras subidas para:', currentVideo.videoId);
            
            setTimeout(() => {
                dialog.remove();
                if (window.playlistManager) {
                    window.playlistManager.loadLyrics();
                }
            }, 2000);
        } else {
            const errorData = await publishResponse.json();
            throw new Error(errorData.message || `Error HTTP ${publishResponse.status}`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
        statusDiv.textContent = `❌ Error: ${error.message}`;
        statusDiv.style.color = 'red';
    }
}

// ✅ NUEVA FUNCIÓN: Popup de confirmación
showConfirmationPopup(currentVideo, formData) {
    return new Promise((resolve) => {
        // Parsear primera línea de LRC para preview
        let lrcPreview = 'Sin letras sincronizadas';
        if (formData.syncedLyrics) {
            const lines = formData.syncedLyrics.split('\n').filter(line => line.trim());
            lrcPreview = lines.slice(0, 3).join('\n');
            if (lines.length > 3) lrcPreview += '\n...';
        }

        const confirmDialog = document.createElement('div');
        confirmDialog.className = 'lyrics-confirm-dialog';
        confirmDialog.innerHTML = `
            <div class="lyrics-confirm-overlay"></div>
            <div class="lyrics-confirm-content">
                <h3>🎵 Confirmar Subida de Letras</h3>
                
                <div class="confirm-section">
                    <label>📹 Video de YouTube:</label>
                    <div class="confirm-value">
                        <a href="https://youtube.com/watch?v=${currentVideo.videoId}" 
                           target="_blank" 
                           rel="noopener noreferrer">
                            ${currentVideo.videoId}
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    </div>
                </div>

                <div class="confirm-section">
                    <label>🎵 Título:</label>
                    <div class="confirm-value">${this.escapeHTML(formData.trackName)}</div>
                </div>

                <div class="confirm-section">
                    <label>🎤 Artista:</label>
                    <div class="confirm-value">${this.escapeHTML(formData.artistName)}</div>
                </div>

                ${formData.albumName ? `
                <div class="confirm-section">
                    <label>💿 Álbum:</label>
                    <div class="confirm-value">${this.escapeHTML(formData.albumName)}</div>
                </div>
                ` : ''}

                <div class="confirm-section">
                    <label>⏱️ Duración:</label>
                    <div class="confirm-value">${formData.duration} segundos</div>
                </div>

                <div class="confirm-section">
                    <label>📝 Preview LRC:</label>
                    <div class="confirm-lrc-preview">${this.escapeHTML(lrcPreview)}</div>
                </div>

                <div class="confirm-actions">
                    <button type="button" class="cancel-btn" id="confirmCancel">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button type="button" class="confirm-btn" id="confirmUpload">
                        <i class="fas fa-check"></i> Confirmar y Subir
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(confirmDialog);

        // Event listeners
        const cancelBtn = confirmDialog.querySelector('#confirmCancel');
        const confirmBtn = confirmDialog.querySelector('#confirmUpload');
        const overlay = confirmDialog.querySelector('.lyrics-confirm-overlay');

        const cleanup = () => {
            confirmDialog.remove();
        };

        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(false);
        });

        confirmBtn.addEventListener('click', () => {
            cleanup();
            resolve(true);
        });

        overlay.addEventListener('click', () => {
            cleanup();
            resolve(false);
        });
    });
}
    async solveProofOfWork(prefix, target) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(URL.createObjectURL(new Blob([`
                self.onmessage = async function(e) {
                    const { prefix, target } = e.data;
                    let nonce = 0;
                    
                    while (true) {
                        const token = prefix + ':' + nonce;
                        const hashBuffer = await crypto.subtle.digest(
                            'SHA-256',
                            new TextEncoder().encode(token)
                        );
                        const hashArray = Array.from(new Uint8Array(hashBuffer));
                        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                        
                        if (hashHex.startsWith(target.slice(0, 8).toLowerCase())) {
                            self.postMessage({ success: true, token });
                            break;
                        }
                        
                        nonce++;
                        
                        if (nonce % 10000 === 0) {
                            self.postMessage({ progress: nonce });
                        }
                    }
                };
            `], { type: 'application/javascript' })));

            worker.onmessage = (e) => {
                if (e.data.success) {
                    worker.terminate();
                    resolve(e.data.token);
                }
            };

            worker.onerror = (error) => {
                worker.terminate();
                reject(error);
            };

            worker.postMessage({ prefix, target });

            // Timeout de 2 minutos
            setTimeout(() => {
                worker.terminate();
                reject(new Error('Timeout resolviendo PoW'));
            }, 120000);
        });
    }

    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// CSS para el diálogo
const style = document.createElement('style');
style.textContent = `
    .lyrics-upload-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .lyrics-upload-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(5px);
    }

    .lyrics-upload-content {
        position: relative;
        background: var(--yt-bg-raised);
        border-radius: 12px;
        padding: 24px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }

    .lyrics-upload-content h2 {
        margin-top: 0;
        color: var(--yt-text-primary);
    }

    .form-group {
        margin-bottom: 16px;
    }

    .form-group label {
        display: block;
        margin-bottom: 8px;
        color: var(--yt-text-secondary);
        font-size: 14px;
    }

    .form-group input,
    .form-group textarea {
        width: 100%;
        padding: 10px;
        background: var(--yt-bg-elevated);
        border: 1px solid var(--yt-layer-20);
        border-radius: 6px;
        color: var(--yt-text-primary);
        font-family: monospace;
        font-size: 13px;
    }

    .form-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
    }

    .form-actions button {
        padding: 10px 20px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 14px;
    }

    .form-actions .primary-btn {
        background: var(--primary-color);
        color: white;
    }

    #uploadStatus {
        margin-top: 16px;
        padding: 12px;
        border-radius: 6px;
        background: var(--yt-bg-elevated);
        text-align: center;
    }
    .lyrics-confirm-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
    }

    .lyrics-confirm-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(8px);
    }

    .lyrics-confirm-content {
        position: relative;
        background: var(--yt-bg-raised);
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 70vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        border: 1px solid var(--yt-layer-20);
        animation: slideUp 0.3s ease;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .lyrics-confirm-content h3 {
        margin-top: 0;
        margin-bottom: 20px;
        color: var(--yt-text-primary);
        font-size: 18px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .confirm-section {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--yt-layer-10);
    }

    .confirm-section:last-of-type {
        border-bottom: none;
    }

    .confirm-section label {
        display: block;
        color: var(--yt-text-secondary);
        font-size: 12px;
        margin-bottom: 6px;
        font-weight: 500;
    }

    .confirm-value {
        color: var(--yt-text-primary);
        font-size: 14px;
        word-break: break-word;
    }

    .confirm-value a {
        color: var(--primary-color);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .confirm-value a:hover {
        text-decoration: underline;
    }

    .confirm-lrc-preview {
        background: var(--yt-bg-base);
        border: 1px solid var(--yt-layer-15);
        border-radius: 6px;
        padding: 12px;
        color: var(--yt-text-primary);
        font-family: monospace;
        font-size: 12px;
        line-height: 1.6;
        white-space: pre-wrap;
        max-height: 100px;
        overflow-y: auto;
    }

    .confirm-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--yt-layer-10);
    }

    .confirm-actions button {
        padding: 10px 20px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease;
    }

    .cancel-btn {
        background: var(--yt-layer-15);
        color: var(--yt-text-primary);
    }

    .cancel-btn:hover {
        background: var(--yt-layer-20);
    }

    .confirm-btn {
        background: var(--primary-color);
        color: white;
    }

    .confirm-btn:hover {
        background: var(--primary-dark);
        transform: translateY(-1px);
    }
`;
document.head.appendChild(style);

// Inicializar
window.lyricsUploader = new LyricsUploader();
console.log('✅ Módulo de subida de letras cargado');
