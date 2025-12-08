console.log('🎵 Cargando módulo de subida de letras avanzado...');

class LyricsUploader {
    constructor() {
        this.apiUrl = 'https://lrclib.net/api';
        this.setupUI();
    }

    setupUI() {
        document.addEventListener('DOMContentLoaded', () => {
            this.waitForLyricsTab(); 
        });
    }

    waitForLyricsTab(attempts = 0) {
        const lyricsTab = document.querySelector('[data-tab-content="lyrics"]');
        if (lyricsTab && attempts < 20) {
            // Verificar si el contenedor interno existe, sino esperar
            if (lyricsTab.querySelector('.lyrics-container') || attempts > 5) {
                 this.injectUploadButton(lyricsTab);
            } else {
                setTimeout(() => this.waitForLyricsTab(attempts + 1), 200);
            }
        } else if (attempts < 20) {
            setTimeout(() => this.waitForLyricsTab(attempts + 1), 200);
        }
    }

    injectUploadButton(container) {
        // Evitar duplicados
        if (container.querySelector('.upload-lyrics-btn')) return;

        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'upload-lyrics-btn';
        uploadBtn.innerHTML = '<i class="fas fa-file-upload"></i> Subir / Corregir';
        uploadBtn.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            background: rgba(255, 255, 255, 0.1);
            color: #aaa;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 6px;
            z-index: 20;
            transition: all 0.2s;
        `;
        
        uploadBtn.addEventListener('mouseenter', () => {
            uploadBtn.style.background = 'var(--primary-color)';
            uploadBtn.style.color = 'white';
            uploadBtn.style.borderColor = 'var(--primary-color)';
        });
        
        uploadBtn.addEventListener('mouseleave', () => {
            uploadBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            uploadBtn.style.color = '#aaa';
            uploadBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        });

        uploadBtn.addEventListener('click', () => this.showUploadDialog());
        container.appendChild(uploadBtn);
    }

    showUploadDialog() {
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
            <div class="lyrics-upload-overlay"></div>
            <div class="lyrics-upload-content">
                <div class="dialog-header">
                    <h2><i class="fas fa-edit"></i> Editor de Letras</h2>
                    <button class="close-dialog"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="upload-split-view">
                    <div class="upload-form-section">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Canción</label>
                                <input type="text" id="trackName" value="${this.escapeHTML(currentVideo.title)}" class="dark-input">
                            </div>
                            <div class="form-group">
                                <label>Artista</label>
                                <input type="text" id="artistName" value="${this.escapeHTML(currentVideo.artist || currentVideo.uploaderName)}" class="dark-input">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Álbum</label>
                                <input type="text" id="albumName" placeholder="Opcional" class="dark-input">
                            </div>
                            <div class="form-group small">
                                <label>Duración (s)</label>
                                <input type="number" id="duration" value="${currentVideo.duration || 0}" class="dark-input" readonly style="opacity:0.7">
                            </div>
                        </div>
                        
                        <div class="form-group" style="flex:1; display:flex; flex-direction:column;">
                            <label>Letras Sincronizadas (LRC)</label>
                            <textarea id="syncedLyrics" class="lyrics-editor" placeholder="[00:12.00] Primera línea..."></textarea>
                        </div>
                    </div>

                    <div class="upload-preview-section">
                        <label>Previsualización en tiempo real</label>
                        <div id="previewContainer" class="lyrics-preview-box">
                            <p class="preview-placeholder">Escribe o pega el LRC para ver la vista previa...</p>
                        </div>
                    </div>
                </div>

                <div class="dialog-footer">
                    <span id="uploadStatus"></span>
                    <button class="preview-btn" id="btnPreviewAction"><i class="fas fa-play"></i> Probar Sincronización</button>
                    <button class="submit-btn" id="btnSubmitAction"><i class="fas fa-cloud-upload-alt"></i> Publicar</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Event Listeners
        const textarea = dialog.querySelector('#syncedLyrics');
        const previewContainer = dialog.querySelector('#previewContainer');
        const closeBtn = dialog.querySelector('.close-dialog');
        const overlay = dialog.querySelector('.lyrics-upload-overlay');
        const submitBtn = dialog.querySelector('#btnSubmitAction');
        const previewActionBtn = dialog.querySelector('#btnPreviewAction');

        // Cerrar
        const close = () => dialog.remove();
        closeBtn.onclick = close;
        overlay.onclick = close;

        // Previsualización en vivo (al escribir)
        textarea.addEventListener('input', () => {
            this.updatePreview(textarea.value, previewContainer);
        });

        // Botón "Probar Sincronización" (Sincroniza con el audio actual)
        previewActionBtn.onclick = () => {
            this.startLivePreview(textarea.value, previewContainer);
        };

        // Enviar
        submitBtn.onclick = () => {
            const formData = {
                trackName: dialog.querySelector('#trackName').value,
                artistName: dialog.querySelector('#artistName').value,
                albumName: dialog.querySelector('#albumName').value,
                duration: dialog.querySelector('#duration').value,
                syncedLyrics: textarea.value,
                plainLyrics: textarea.value.replace(/\[.*?\]/g, '').trim()
            };
            this.uploadLyrics(formData, dialog);
        };
    }

    updatePreview(lrcText, container) {
        if (!lrcText.trim()) {
            container.innerHTML = '<p class="preview-placeholder">Escribe LRC para visualizar...</p>';
            return;
        }
        
        const lines = this.parseLRC(lrcText);
        container.innerHTML = lines.map(line => 
            `<p class="preview-line" data-time="${line.time}">
                <span class="timestamp">[${this.formatTime(line.time)}]</span> ${line.text}
            </p>`
        ).join('');
    }

    startLivePreview(lrcText, container) {
        if (!lrcText.trim()) return;
        
        // Detener intervalo anterior si existe
        if (this.previewInterval) clearInterval(this.previewInterval);
        
        const lines = this.parseLRC(lrcText);
        this.updatePreview(lrcText, container);
        const domLines = container.querySelectorAll('.preview-line');
        
        this.previewInterval = setInterval(() => {
            // Obtener tiempo del reproductor real
            const player = window.player1?.getPlayerState() === 1 ? window.player1 : window.player2;
            if (!player) return;
            
            const currentTime = player.getCurrentTime();
            
            // Encontrar línea activa
            let activeIndex = -1;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (currentTime >= lines[i].time) {
                    activeIndex = i;
                    break;
                }
            }
            
            // Actualizar clases
            domLines.forEach((el, idx) => {
                el.classList.remove('active', 'past');
                if (idx === activeIndex) {
                    el.classList.add('active');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (idx < activeIndex) {
                    el.classList.add('past');
                }
            });
        }, 200);
    }

    async uploadLyrics(formData, dialog) {
        const statusDiv = dialog.querySelector('#uploadStatus');
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';
        statusDiv.className = 'status-loading';

        try {
            // 1. Obtener Challenge
            const challengeRes = await fetch(`${this.apiUrl}/request-challenge`, { method: 'POST' });
            if (!challengeRes.ok) throw new Error('Error de conexión con LRCLIB');
            const challenge = await challengeRes.json();

            // 2. Solver PoW (Web Worker simple inline)
            const token = await this.solveProofOfWork(challenge.prefix, challenge.target);

            // 3. Publicar
            const res = await fetch(`${this.apiUrl}/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Publish-Token': token
                },
                body: JSON.stringify(formData)
            });

            if (res.status === 201) {
                statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> ¡Enviado!';
                statusDiv.className = 'status-success';
                setTimeout(() => dialog.remove(), 1500);
            } else {
                throw new Error('Error al publicar');
            }

        } catch (e) {
            statusDiv.innerHTML = `<i class="fas fa-times-circle"></i> ${e.message}`;
            statusDiv.className = 'status-error';
        }
    }

    // Utilidades
    parseLRC(text) {
        const lines = text.split('\n');
        const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
        return lines.map(line => {
            const match = line.match(regex);
            if (!match) return null;
            const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseFloat(`0.${match[3]}`);
            return { time, text: match[4].trim() };
        }).filter(x => x);
    }

    formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${min.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}.${ms.toString().padStart(2,'0')}`;
    }

    async solveProofOfWork(prefix, target) {
        // Implementación simplificada para el ejemplo (deberías usar tu worker existente)
        // Aquí asumimos que tienes el worker del archivo anterior
        return window.lyricsUploader.solveProofOfWork(prefix, target); 
    }

    escapeHTML(str) {
        if(!str) return '';
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    }
}

// Estilos necesarios para el nuevo modal
const style = document.createElement('style');
style.textContent = `
    .lyrics-upload-dialog { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; display: flex; align-items: center; justify-content: center; }
    .lyrics-upload-overlay { position: absolute; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(5px); }
    .lyrics-upload-content { position: relative; width: 900px; height: 80vh; background: #181818; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #333; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
    
    .dialog-header { padding: 15px 20px; background: #202020; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
    .dialog-header h2 { margin: 0; font-size: 18px; color: #fff; }
    .close-dialog { background: none; border: none; color: #aaa; font-size: 20px; cursor: pointer; }
    
    .upload-split-view { display: flex; flex: 1; overflow: hidden; }
    .upload-form-section { flex: 1; padding: 20px; display: flex; flex-direction: column; border-right: 1px solid #333; gap: 15px; }
    .upload-preview-section { flex: 1; padding: 20px; display: flex; flex-direction: column; background: #121212; }
    
    .form-row { display: flex; gap: 15px; }
    .form-group { flex: 1; }
    .form-group.small { flex: 0 0 100px; }
    .form-group label { display: block; font-size: 12px; color: #888; margin-bottom: 5px; }
    .dark-input { width: 100%; background: #2a2a2a; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; }
    .lyrics-editor { width: 100%; flex: 1; background: #2a2a2a; border: 1px solid #444; color: #eee; padding: 10px; border-radius: 4px; font-family: monospace; resize: none; line-height: 1.5; }
    
    .lyrics-preview-box { flex: 1; background: #000; border-radius: 8px; padding: 15px; overflow-y: auto; font-family: sans-serif; }
    .preview-line { padding: 8px 10px; margin: 0; border-radius: 4px; color: #666; font-size: 14px; transition: all 0.2s; }
    .preview-line .timestamp { font-family: monospace; color: #444; font-size: 11px; margin-right: 10px; }
    .preview-line.active { background: #222; color: #fff; font-weight: bold; font-size: 16px; border-left: 3px solid var(--primary-color); }
    .preview-line.past { color: #444; }
    
    .dialog-footer { padding: 15px 20px; background: #202020; border-top: 1px solid #333; display: flex; justify-content: flex-end; align-items: center; gap: 10px; }
    .preview-btn { background: #333; color: #fff; border: 1px solid #555; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
    .submit-btn { background: var(--primary-color); color: #fff; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    
    .status-loading { color: #3498db; margin-right: auto; }
    .status-success { color: #2ecc71; margin-right: auto; }
    .status-error { color: #e74c3c; margin-right: auto; font-size: 12px; }
`;
document.head.appendChild(style);

// Inicializar
window.lyricsUploader = new LyricsUploader();
