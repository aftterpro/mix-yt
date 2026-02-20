console.log('🎵 Cargando módulo de subida de letras (Auto-inyección)...');

class LyricsUploader {
    constructor() {
        this.apiUrl = '/publish-lyrics';
        this.observer = null;
        this.setupAutoInjection();
    }

    // Usar MutationObserver para detectar cuando se renderiza el tab de letras
    setupAutoInjection() {
        document.addEventListener('DOMContentLoaded', () => {
            const lyricsContent = document.getElementById('lyricsContent');
            
            if (lyricsContent) {
                // Observar cambios en el contenedor de letras
                this.observer = new MutationObserver(() => {
                    this.tryInjectButton();
                });
                
                this.observer.observe(lyricsContent, { 
                    childList: true, 
                    subtree: true 
                });
                
                // Intento inicial
                this.tryInjectButton();
            } else {
                console.warn('❌ Contenedor lyricsContent no encontrado al inicio');
                // Reintentar si el DOM carga lento
                setTimeout(() => this.setupAutoInjection(), 1000);
            }
        });
    }

    tryInjectButton() {
        // Buscar el contenedor interno donde debe ir el botón
        const container = document.querySelector('.lyrics-container .lyrics-header');
        
        // Si existe el header y NO tiene ya el botón
        if (container && !container.querySelector('.upload-lyrics-btn')) {
            this.injectUploadButton(container);
        }
    }

    injectUploadButton(headerContainer) {
        console.log('💉 Inyectando botón de subir letras...');
        
        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'upload-lyrics-btn';
        uploadBtn.innerHTML = '<i class="fas fa-file-upload"></i>';
        uploadBtn.title = "Subir o Corregir Letras";
        
        // Estilos integrados para que se vea bien en el header
        uploadBtn.style.cssText = `
            background: transparent;
            color: var(--text-secondary, #aaa);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 50%;
            width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; margin-left: 8px;
            transition: all 0.2s;
        `;
        
        uploadBtn.onmouseenter = () => {
            uploadBtn.style.color = '#fff';
            uploadBtn.style.borderColor = 'var(--primary-color)';
            uploadBtn.style.background = 'rgba(255, 107, 53, 0.1)';
        };
        
        uploadBtn.onmouseleave = () => {
            uploadBtn.style.color = '#aaa';
            uploadBtn.style.borderColor = 'rgba(255,255,255,0.2)';
            uploadBtn.style.background = 'transparent';
        };

        uploadBtn.onclick = (e) => {
            e.stopPropagation(); // Evitar colapso si está en un acordeón
            this.showUploadDialog();
        };

        // Insertar al final del header
        headerContainer.appendChild(uploadBtn);
    }

    showUploadDialog() {
        const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
        // Obtener la lista aplanada desde el core
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
                    <h3><i class="fas fa-edit"></i> Editor de Letras</h3>
                    <button class="close-dialog"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="upload-form-body">
                    <div class="form-row">
                        <div class="form-group" style="flex:2">
                            <label>Canción</label>
                            <input type="text" id="trackName" value="${this.escapeHTML(currentVideo.title)}" class="dark-input">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Duración (s)</label>
                            <input type="number" id="duration" value="${Math.round(currentVideo.duration || 0)}" class="dark-input" readonly>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Artista</label>
                        <input type="text" id="artistName" value="${this.escapeHTML(currentVideo.artist || currentVideo.uploaderName)}" class="dark-input">
                    </div>
                    
                    <div class="form-group" style="flex:1; display:flex; flex-direction:column;">
                        <label>Letras Sincronizadas (LRC)</label>
                        <textarea id="syncedLyrics" class="lyrics-editor" placeholder="[00:12.00] Primera línea..."></textarea>
                    </div>
                    
                    <div class="preview-box" id="previewBox">
                        <small>Vista previa en vivo:</small>
                        <div id="previewLine" style="color:var(--primary-color); font-weight:bold; min-height:20px;">--</div>
                    </div>
                </div>

                <div class="dialog-footer">
                    <span id="uploadStatus"></span>
                    <button class="preview-btn" id="btnTestSync"><i class="fas fa-play"></i> Probar</button>
                    <button class="submit-btn" id="btnSubmit"><i class="fas fa-cloud-upload-alt"></i> Enviar</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Lógica del modal
        const textarea = dialog.querySelector('#syncedLyrics');
        const previewLine = dialog.querySelector('#previewLine');
        
        // Cerrar
        const close = () => {
            if(this.testInterval) clearInterval(this.testInterval);
            dialog.remove();
        };
        dialog.querySelector('.close-dialog').onclick = close;
        dialog.querySelector('.lyrics-upload-overlay').onclick = close;

        // Probar sincronización
        dialog.querySelector('#btnTestSync').onclick = () => {
            this.startSyncTest(textarea.value, previewLine);
        };

        // Enviar
        dialog.querySelector('#btnSubmit').onclick = () => {
            const data = {
                trackName: dialog.querySelector('#trackName').value,
                artistName: dialog.querySelector('#artistName').value,
                duration: dialog.querySelector('#duration').value,
                syncedLyrics: textarea.value,
                plainLyrics: textarea.value.replace(/\[.*?\]/g, '').trim()
            };
            this.uploadLyrics(data, dialog);
        };
    }

    startSyncTest(lrcText, displayElement) {
        if(this.testInterval) clearInterval(this.testInterval);
        
        const lines = this.parseLRC(lrcText);
        if(!lines.length) {
            displayElement.textContent = "No hay líneas LRC válidas";
            return;
        }

        this.testInterval = setInterval(() => {
            const player = (window.currentPlayer === 1) ? window.player1 : window.player2;
            if (!player || typeof player.getCurrentTime !== 'function') return;
            
            const time = player.getCurrentTime();
            
            // Buscar línea activa
            let currentText = "...";
            for (let i = lines.length - 1; i >= 0; i--) {
                if (time >= lines[i].time) {
                    currentText = lines[i].text;
                    break;
                }
            }
            displayElement.textContent = `[${time.toFixed(1)}s] ${currentText}`;
        }, 100);
    }

    async uploadLyrics(formData, dialog) {
        const statusDiv = dialog.querySelector('#uploadStatus');
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        statusDiv.style.color = '#3498db';

        try {
            // 1. Obtener Challenge
            const challengeRes = await fetch(`${this.apiUrl}/request-challenge`, { method: 'POST' });
            if (!challengeRes.ok) throw new Error('Error de conexión');
            const challenge = await challengeRes.json();

            // 2. Resolver PoW (Worker inline)
            const token = await this.solvePoW(challenge.prefix, challenge.target);

            // 3. Enviar
            const res = await fetch(`${this.apiUrl}/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Publish-Token': token
                },
                body: JSON.stringify(formData)
            });

            if (res.status === 201) {
                statusDiv.innerHTML = '¡Enviado!';
                statusDiv.style.color = '#2ecc71';
                setTimeout(() => {
                    if(this.testInterval) clearInterval(this.testInterval);
                    dialog.remove();
                    if(window.playlistManager) window.playlistManager.loadLyrics();
                }, 1500);
            } else {
                throw new Error('Error al guardar');
            }
        } catch (e) {
            statusDiv.innerHTML = `Error: ${e.message}`;
            statusDiv.style.color = '#e74c3c';
        }
    }

    parseLRC(text) {
        return text.split('\n').map(line => {
            const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
            if (!match) return null;
            const time = parseInt(match[1])*60 + parseInt(match[2]) + parseFloat(`0.${match[3]}`);
            return { time, text: match[4].trim() };
        }).filter(x => x);
    }

    async solvePoW(prefix, target) {
        // Implementación simple de PoW
        return new Promise((resolve) => {
            const workerCode = `
                self.onmessage = async ({data}) => {
                    const {prefix, target} = data;
                    let nonce = 0;
                    while(true) {
                        const str = prefix + ':' + nonce;
                        const buf = new TextEncoder().encode(str);
                        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
                        const hashArr = Array.from(new Uint8Array(hashBuf));
                        const hex = hashArr.map(b => b.toString(16).padStart(2,'0')).join('');
                        if(hex.startsWith(target.toLowerCase().substr(0, 6))) { // Target aproximado
                            self.postMessage(prefix + ':' + nonce);
                            break;
                        }
                        nonce++;
                    }
                };
            `;
            const blob = new Blob([workerCode], {type: 'application/javascript'});
            const worker = new Worker(URL.createObjectURL(blob));
            worker.onmessage = (e) => {
                worker.terminate();
                resolve(e.data);
            };
            worker.postMessage({prefix, target});
        });
    }

    escapeHTML(str) {
        return str ? str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[t])) : '';
    }
}

// Estilos CSS necesarios para el modal
const css = `
.lyrics-upload-dialog { position: fixed; top:0; left:0; width:100%; height:100%; z-index:99999; display:flex; align-items:center; justify-content:center; }
.lyrics-upload-overlay { position: absolute; width:100%; height:100%; background:rgba(0,0,0,0.8); backdrop-filter:blur(5px); }
.lyrics-upload-content { position: relative; width:90%; max-width:600px; background:#181818; border-radius:12px; border:1px solid #333; padding:20px; box-shadow:0 10px 40px rgba(0,0,0,0.5); }
.dialog-header { display:flex; justify-content:space-between; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px; }
.dialog-header h3 { margin:0; color:#fff; }
.close-dialog { background:none; border:none; color:#fff; font-size:20px; cursor:pointer; }
.form-row { display:flex; gap:10px; margin-bottom:10px; }
.form-group label { display:block; font-size:12px; color:#888; margin-bottom:5px; }
.dark-input, .lyrics-editor { width:100%; background:#2a2a2a; border:1px solid #444; color:#fff; padding:8px; border-radius:4px; box-sizing:border-box; }
.lyrics-editor { height:200px; font-family:monospace; line-height:1.4; resize:vertical; }
.dialog-footer { margin-top:15px; display:flex; justify-content:flex-end; gap:10px; align-items:center; }
.submit-btn { background:var(--primary-color); color:#fff; border:none; padding:8px 20px; border-radius:4px; cursor:pointer; font-weight:bold; }
.preview-btn { background:#333; color:#fff; border:1px solid #555; padding:8px 15px; border-radius:4px; cursor:pointer; }
.preview-box { background:#000; padding:10px; border-radius:4px; margin-top:10px; font-family:monospace; text-align:center; }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

// Iniciar
window.lyricsUploader = new LyricsUploader();
