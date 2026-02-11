// =============================================
// CONFIGURACIÓN OAUTH
// =============================================
let CLIENT_ID = '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
let isAuthorized = false;
let tokenClient = null;
let gapiReady = false;
let gisReady = false;

// =============================================
// INICIALIZACIÓN DE APIS
// =============================================
function initializeGoogleAPIs() {
    // Cargar GAPI
    if (typeof gapi !== 'undefined') {
        gapi.load('client', gapiInitialize_auth);
    }
    
    // Cargar GIS
    const checkGIS = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            clearInterval(checkGIS);
            gisInitalize_auth();
        }
    }, 500);
}

window.gapiInitialize_auth = function() {
    gapi.client.init({
        // Nota: La API Key debe estar restringida en Google Console
        apiKey: 'AIzaSyDg1EMvKc4D--b6hXTSOhR3ANrLPHsyIH4', 
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
    }).then(() => {
        gapiReady = true;
        console.log('✅ GAPI cargado.');
        checkAndUpdateUI();
        // Intentar restaurar sesión si hay token guardado
        const token = localStorage.getItem('yt_access_token');
        if (token) {
             gapi.client.setToken({ access_token: token });
             isAuthorized = true;
             updateAuthUI();
             loadUserPlaylistsUI(); // Cargar playlists automáticamente
        }
    }).catch((err) => {
        console.error('❌ Error GAPI:', err);
    });
};

window.gisInitalize_auth = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse.error) {
                console.error('❌ Error Token:', tokenResponse.error);
                return;
            }
            const token = tokenResponse.access_token;
            localStorage.setItem('yt_access_token', token); // Guardar persistencia simple
            gapi.client.setToken({ access_token: token });
            isAuthorized = true;
            updateAuthUI();
            loadUserPlaylistsUI(); // Cargar playlists al loguearse
        },
    });
    gisReady = true;
    checkAndUpdateUI();
};

function checkAndUpdateUI() {
    if (gapiReady && gisReady) {
        const btn = document.getElementById('googleSignInButton');
        if (btn) btn.disabled = false;
    }
}

// =============================================
// ACCIONES DE USUARIO
// =============================================
window.handleAuthClick = function() {
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
};

window.handleSignOutClick = function() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        localStorage.removeItem('yt_access_token');
        isAuthorized = false;
        updateAuthUI();
        document.getElementById('user-playlists').innerHTML = ''; // Limpiar UI
    }
};

function updateAuthUI() {
    const loginBtn = document.getElementById('googleSignInButton');
    const logoutBtn = document.getElementById('googleSignOutButton');
    const playlistPanel = document.getElementById('youtube-playlists-container');

    if (isAuthorized) {
        if(loginBtn) loginBtn.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'inline-block';
        if(playlistPanel) playlistPanel.style.display = 'block';
    } else {
        if(loginBtn) loginBtn.style.display = 'inline-block';
        if(logoutBtn) logoutBtn.style.display = 'none';
        if(playlistPanel) playlistPanel.style.display = 'none';
    }
}

// =============================================
// LÓGICA DE IMPORTACIÓN A LA APP (INTEGRACIÓN)
// =============================================

// 1. Cargar lista de playlists del usuario en el DOM
async function loadUserPlaylistsUI() {
    if (!isAuthorized) return;
    
    try {
        const response = await gapi.client.youtube.playlists.list({
            part: 'snippet,contentDetails',
            mine: true,
            maxResults: 50
        });

        const container = document.getElementById('user-playlists');
        if (!container) return;
        
        container.innerHTML = '<h3>Mis Playlists de YouTube</h3>';
        
        const list = document.createElement('div');
        list.className = 'yt-playlist-list';
        list.style.display = 'flex';
        list.style.gap = '10px';
        list.style.overflowX = 'auto';
        list.style.padding = '10px 0';

        response.result.items.forEach(playlist => {
            const item = document.createElement('div');
            item.className = 'yt-playlist-item';
            item.style.minWidth = '120px';
            item.style.cursor = 'pointer';
            item.style.textAlign = 'center';
            
            const thumb = playlist.snippet.thumbnails?.default?.url || 'https://via.placeholder.com/120';
            
            item.innerHTML = `
                <img src="\${thumb}" style="width:120px; border-radius:5px;">
                <p style="font-size:12px; margin:5px 0;">\${playlist.snippet.title}</p>
                <small>\${playlist.contentDetails.itemCount} videos</small>
            `;

            // AL HACER CLIC: IMPORTAR A LA APP
            item.onclick = () => importPlaylistToApp(playlist.id, playlist.snippet.title);
            
            list.appendChild(item);
        });

        container.appendChild(list);

    } catch (error) {
        console.error('Error cargando playlists:', error);
    }
}

// 2. Importar videos de la playlist seleccionada a las variables de app.js
async function importPlaylistToApp(playlistId, playlistTitle) {
    if (!isAuthorized) return;
    
    mostrarMensajeFlotante(`Cargando playlist: \${playlistTitle}...`);
    
    let allVideos = [];
    let nextPageToken = null;

    try {
        // Obtener todos los videos (paginación)
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                playlistId: playlistId,
                part: 'snippet,contentDetails',
                maxResults: 50,
                pageToken: nextPageToken
            });

            const items = response.result.items;
            
            // Obtener duraciones reales (API playlistItems no da duración exacta)
            const videoIds = items.map(item => item.contentDetails.videoId).join(',');
            
            // Llamada auxiliar para duraciones
            const videosResponse = await gapi.client.youtube.videos.list({
                part: 'contentDetails',
                id: videoIds
            });
            
            const durationsMap = {};
            videosResponse.result.items.forEach(v => {
                durationsMap[v.id] = parseDuration(v.contentDetails.duration);
            });

            // Mapear al formato de app.js
            const processedVideos = items.map(item => {
                const vidId = item.contentDetails.videoId;
                return {
                    videoId: vidId,
                    title: item.snippet.title,
                    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                    duration: durationsMap[vidId] || 0, // Usar la duración parseada
                    manual: false
                };
            });

            allVideos = [...allVideos, ...processedVideos];
            nextPageToken = response.result.nextPageToken;

        } while (nextPageToken && allVideos.length < 200); // Límite de seguridad 200 videos

        // ===============================================
        // INTEGRACIÓN CON VARIABLES GLOBALES DE APP.JS
        // ===============================================
        if (typeof window.playlistVideos !== 'undefined') {
            // Añadir al array global
            window.playlistVideos.push(...allVideos);
            
            // Actualizar DOM
            if (typeof window.updatePlaylistDOM === 'function') {
                window.updatePlaylistDOM();
            }
            
            // Notificar
            mostrarMensajeFlotante(`¡\${allVideos.length} videos importados!`);
            console.log('Playlist importada:', window.playlistVideos);
            
            // Habilitar botón de inicio si estaba deshabilitado
            const iniciarBtn = document.getElementById('iniciarButton');
            if(iniciarBtn) {
                iniciarBtn.disabled = false;
            }
        } else {
            console.error('No se encontraron las variables de app.js (playlistVideos)');
            mostrarMensajeFlotante('Error: No se pudo conectar con la app principal.');
        }

    } catch (error) {
        console.error("Error importando playlist:", error);
        mostrarMensajeFlotante("Error al importar la playlist.");
    }
}

// =============================================
// UTILIDADES (CORRECCIÓN DEL ERROR duration.match)
// =============================================

// Esta función reemplaza la versión conflictiva y maneja números y strings
function parseDuration(duration) {
    // 1. Si ya es número, devolverlo (esto arregla el crash)
    if (typeof duration === 'number') return duration;
    
    // 2. Si es null/undefined, devolver 0
    if (!duration) return 0;

    // 3. Si es formato string ISO 8601 (PT1H2M10S)
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (match) {
        const hours = (parseInt(match[1]) || 0);
        const minutes = (parseInt(match[2]) || 0);
        const seconds = (parseInt(match[3]) || 0);
        return (hours * 3600) + (minutes * 60) + seconds;
    }
    
    // 4. Fallback por seguridad
    return 0;
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', initializeGoogleAPIs);
