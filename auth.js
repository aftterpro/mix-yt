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
    if (typeof gapi !== 'undefined') gapi.load('client', gapiInitialize_auth);
    
    const checkGIS = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            clearInterval(checkGIS);
            gisInitalize_auth();
        }
    }, 500);
}

window.gapiInitialize_auth = function() {
    gapi.client.init({
        apiKey: 'AIzaSyDg1EMvKc4D--b6hXTSOhR3ANrLPHsyIH4', 
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
    }).then(() => {
        gapiReady = true;
        checkAndUpdateUI();
        const token = localStorage.getItem('yt_access_token');
        if (token) {
             gapi.client.setToken({ access_token: token });
             isAuthorized = true;
             updateAuthUI();
             loadUserPlaylistsUI();
        }
    }).catch((err) => console.error('❌ Error GAPI:', err));
};

window.gisInitalize_auth = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse.error) return;
            const token = tokenResponse.access_token;
            localStorage.setItem('yt_access_token', token);
            gapi.client.setToken({ access_token: token });
            isAuthorized = true;
            updateAuthUI();
            loadUserPlaylistsUI();
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
// INTERFAZ DE USUARIO Y LÓGICA
// =============================================

window.handleAuthClick = function() {
    if (!tokenClient) return;
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
        document.getElementById('user-playlists-content').innerHTML = '';
    }
};

function updateAuthUI() {
    const loginBtn = document.getElementById('googleSignInButton');
    const logoutBtn = document.getElementById('googleSignOutButton');
    
    if (isAuthorized) {
        if(loginBtn) loginBtn.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
        if(loginBtn) loginBtn.style.display = 'inline-block';
        if(logoutBtn) logoutBtn.style.display = 'none';
    }
}

// CARGAR PLAYLISTS DEL USUARIO (Corrección de Template Strings)
async function loadUserPlaylistsUI() {
    if (!isAuthorized) return;
    
    try {
        const response = await gapi.client.youtube.playlists.list({
            part: 'snippet,contentDetails',
            mine: true,
            maxResults: 50
        });

        // Apuntamos al contenido de la pestaña específica
        const container = document.getElementById('user-playlists-content');
        if (!container) return;
        
        container.innerHTML = ''; // Limpiar
        
        const list = document.createElement('div');
        list.className = 'yt-playlist-grid'; // Clase para CSS grid

        response.result.items.forEach(playlist => {
            const item = document.createElement('div');
            item.className = 'yt-playlist-card';
            
            const thumb = playlist.snippet.thumbnails?.medium?.url || 
                          playlist.snippet.thumbnails?.default?.url || 
                          'https://via.placeholder.com/120';
            
            // CORRECCIÓN: Uso de backticks (`) SIN escapar las variables
            item.innerHTML = `
                <div class="card-image">
                    <img src="${thumb}" alt="${playlist.snippet.title}">
                    <div class="video-count">${playlist.contentDetails.itemCount} videos</div>
                </div>
                <div class="card-info">
                    <h4>${playlist.snippet.title}</h4>
                    <button class="import-btn"><i class="fas fa-file-import"></i> Cargar</button>
                </div>
            `;

            item.onclick = () => importPlaylistToApp(playlist.id, playlist.snippet.title);
            list.appendChild(item);
        });

        container.appendChild(list);

    } catch (error) {
        console.error('Error cargando playlists:', error);
    }
}

// IMPORTAR A LA APP PRINCIPAL
async function importPlaylistToApp(playlistId, playlistTitle) {
    if (!isAuthorized) return;
    mostrarMensajeFlotante(`Importando: ${playlistTitle}...`);
    
    let allVideos = [];
    let nextPageToken = null;

    try {
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                playlistId: playlistId,
                part: 'snippet,contentDetails',
                maxResults: 50,
                pageToken: nextPageToken
            });

            // Obtener IDs para consultar duración exacta
            const vidIds = response.result.items.map(i => i.contentDetails.videoId).join(',');
            const durationRes = await gapi.client.youtube.videos.list({
                part: 'contentDetails',
                id: vidIds
            });
            
            const durMap = {};
            durationRes.result.items.forEach(v => {
                durMap[v.id] = parseDuration(v.contentDetails.duration);
            });

            const items = response.result.items.map(item => ({
                videoId: item.contentDetails.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                duration: durMap[item.contentDetails.videoId] || 0,
                manual: false
            }));

            allVideos = [...allVideos, ...items];
            nextPageToken = response.result.nextPageToken;

        } while (nextPageToken && allVideos.length < 200);

        if (window.playlistVideos) {
            window.playlistVideos.push(...allVideos);
            window.updatePlaylistDOM();
            mostrarMensajeFlotante(`¡${allVideos.length} videos añadidos a la Cola!`);
            
            // Cambiar automáticamente a la pestaña de Cola
            document.querySelector('.tab-btn[data-tab="cola"]').click();
            
            const btn = document.getElementById('iniciarButton');
            if(btn) btn.disabled = false;
        }

    } catch (error) {
        console.error("Error import:", error);
        mostrarMensajeFlotante("Error al importar playlist.");
    }
}

function parseDuration(duration) {
    if (!duration) return 0;
    if (typeof duration === 'number') return duration;
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (match) {
        const hours = (parseInt(match[1]) || 0);
        const minutes = (parseInt(match[2]) || 0);
        const seconds = (parseInt(match[3]) || 0);
        return (hours * 3600) + (minutes * 60) + seconds;
    }
    return 0;
}

document.addEventListener('DOMContentLoaded', initializeGoogleAPIs);
