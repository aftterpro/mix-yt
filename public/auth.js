// =============================================
//  Lógica de Autenticación y Playlists
// =============================================

let CLIENT_ID = '228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
let isAuthorized = false;
let tokenClient = null;
let gapiReady = false;
let gisReady = false;
// Variable para saber qué playlist estamos viendo en detalle
let currentDetailPlaylistId = null; 

// =============================================
// INICIALIZACIÓN
// =============================================
async function loadAuthConfig() {
    try {
        // Pide las claves a tu función Cloudflare
        const response = await fetch('/api/auth-config');
        const config = await response.json();
        
        if (config.clientId) {
            CLIENT_ID = config.clientId;
            console.log("✅ Configuración cargada. CLIENT_ID recibido.");
            
            // Paso 2: AHORA sí inicializamos Google
            initializeGoogleAPIs(); 
        } else {
            console.error("❌ No se recibió clientId del servidor");
        }
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
    }
}
function initializeGoogleAPIs() {
    if (typeof gapi !== 'undefined') gapi.load('client', gapiInitialize_auth);
    
    const checkGIS = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            clearInterval(checkGIS);
            gisInitalize_auth();
        }
    }, 500);

    // Configurar el botón de "Atrás" en la vista de detalles
    setupBackButton();
}

function setupBackButton() {
    const backBtn = document.getElementById('back-to-playlists-btn');
    if(backBtn) {
        backBtn.addEventListener('click', () => {
            // Ocultar detalles, mostrar overview
            document.getElementById('user-playlist-details').style.display = 'none';
            document.getElementById('user-playlists-overview').style.display = 'block';
            currentDetailPlaylistId = null;
        });
    }

    // Configurar el botón "Añadir todo" del encabezado
    const importAllBtn = document.getElementById('import-current-playlist-btn');
    if(importAllBtn) {
        importAllBtn.addEventListener('click', () => {
            if(currentDetailPlaylistId) {
                const title = document.getElementById('details-playlist-title').textContent;
                // Llamamos a la función de importación real
                importPlaylistToApp(currentDetailPlaylistId, title);
            }
        });
    }
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
// LÓGICA DE USUARIO
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
        document.getElementById('user-playlists-content').innerHTML = '<p>Inicia sesión para ver tus playlists</p>';
        // Asegurar que volvemos a la vista principal si estábamos en detalles
        document.getElementById('user-playlist-details').style.display = 'none';
        document.getElementById('user-playlists-overview').style.display = 'block';
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

// ----- CARGAR LISTA DE PLAYLISTS (VISTA GENERAL) -----
async function loadUserPlaylistsUI() {
    if (!isAuthorized) return;
    const container = document.getElementById('user-playlists-content');
    if (!container) return;
    container.innerHTML = '<p>Cargando playlists...</p>';
    
    try {
        const response = await gapi.client.youtube.playlists.list({
            part: 'snippet,contentDetails',
            mine: true,
            maxResults: 50
        });

        container.innerHTML = ''; // Limpiar cargando
        
        if(response.result.items.length === 0) {
            container.innerHTML = '<p>No se encontraron playlists.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'yt-playlist-grid';

        response.result.items.forEach(playlist => {
            const item = document.createElement('div');
            item.className = 'yt-playlist-card';
            const thumb = playlist.snippet.thumbnails?.medium?.url || playlist.snippet.thumbnails?.default?.url || 'https://via.placeholder.com/120';
            
            item.innerHTML = `
                <div class="card-image">
                    <img src="${thumb}" alt="${playlist.snippet.title}">
                    <div class="video-count">${playlist.contentDetails.itemCount} videos</div>
                </div>
                <div class="card-info">
                    <h4>${playlist.snippet.title}</h4>
                    <button class="import-btn"><i class="fas fa-eye"></i> Ver videos</button>
                </div>
            `;

            item.onclick = () => viewPlaylistDetails(playlist.id, playlist.snippet.title);
            list.appendChild(item);
        });

        container.appendChild(list);

    } catch (error) {
        console.error('Error cargando playlists:', error);
        container.innerHTML = '<p>Error al cargar playlists.</p>';
    }
}

// ----- NUEVA FUNCIÓN: VER DETALLES DE PLAYLIST (SUB-PÁGINA) -----
async function viewPlaylistDetails(playlistId, playlistTitle) {
    // 1. Cambiar la interfaz: Ocultar overview, mostrar detalles
    document.getElementById('user-playlists-overview').style.display = 'none';
    document.getElementById('user-playlist-details').style.display = 'block';
    
    // 2. Actualizar header
    document.getElementById('details-playlist-title').textContent = playlistTitle;
    currentDetailPlaylistId = playlistId;

    const listContainer = document.getElementById('details-video-list');
    listContainer.innerHTML = '<p style="padding: 20px;">Cargando vista previa de videos...</p>';

    try {
        // Carga rápida solo de snippets (títulos e imágenes) para previsualizar
        const response = await gapi.client.youtube.playlistItems.list({
            playlistId: playlistId,
            part: 'snippet',
            maxResults: 50 // Muestra los primeros 50
        });

        listContainer.innerHTML = ''; // Limpiar mensaje

        if (response.result.items.length === 0) {
            listContainer.innerHTML = '<p style="padding: 20px;">Esta playlist está vacía.</p>';
            return;
        }

        response.result.items.forEach(item => {
            if (item.snippet.title === "Private video" || item.snippet.title === "Deleted video") return;

            const vidEl = document.createElement('div');
            vidEl.className = 'detail-video-item';
            const thumb = item.snippet.thumbnails?.default?.url || 'https://via.placeholder.com/60';
            
            vidEl.innerHTML = `
                <img src="${thumb}" alt="thumbnail">
                <div class="detail-video-info">
                    <h5>${item.snippet.title}</h5>
                    <p>Por: ${item.snippet.videoOwnerChannelTitle}</p>
                </div>
            `;
            listContainer.appendChild(vidEl);
        });

    } catch (error) {
        console.error("Error loading details:", error);
        listContainer.innerHTML = '<p style="padding: 20px;">Error al cargar los videos.</p>';
    }
}
async function importPlaylistToApp(playlistId, playlistTitle) {
    if (!isAuthorized) return;
    mostrarMensajeFlotante(`Iniciando importación de: ${playlistTitle}...`);
    
    let allVideos = [];
    let nextPageToken = null;

    try {
        // Bucle para obtener TODOS los videos (paginación)
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                playlistId: playlistId,
                part: 'snippet,contentDetails',
                maxResults: 50,
                pageToken: nextPageToken
            });

            // Obtener IDs para consultar duración exacta (necesario para el reproductor)
            const vidIds = response.result.items.map(i => i.contentDetails.videoId).join(',');
            let durMap = {};
            
            if(vidIds.length > 0) {
                 const durationRes = await gapi.client.youtube.videos.list({
                    part: 'contentDetails',
                    id: vidIds
                });
                durationRes.result.items.forEach(v => {
                    durMap[v.id] = parseDuration(v.contentDetails.duration);
                });
            }

            const items = response.result.items.map(item => ({
                videoId: item.contentDetails.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                duration: durMap[item.contentDetails.videoId] || 0,
                manual: false
            })).filter(i => i.title !== "Private video" && i.title !== "Deleted video");

            allVideos = [...allVideos, ...items];
            nextPageToken = response.result.nextPageToken;

        } while (nextPageToken && allVideos.length < 300); // Límite de seguridad aumentado a 300

        if (window.playlistVideos) {
            window.playlistVideos.push(...allVideos);
            window.updatePlaylistDOM();
            mostrarMensajeFlotante(`✅ ¡${allVideos.length} videos añadidos a la Cola!`);
            
            // OPCIONAL: Volver automáticamente a la pestaña de Cola tras importar
             document.querySelector('.tab-btn[data-tab="cola"]').click();
            
            const btn = document.getElementById('iniciarButton');
            if(btn) btn.disabled = false;
        }

    } catch (error) {
        console.error("Error import:", error);
        mostrarMensajeFlotante("❌ Error al importar playlist.");
    }
}

// Función auxiliar para duración
function parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (match) {
        const hours = (parseInt(match[1]) || 0);
        const minutes = (parseInt(match[2]) || 0);
        const seconds = (parseInt(match[3]) || 0);
        return (hours * 3600) + (minutes * 60) + seconds;
    }
    return 0;
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAuthConfig); // Cambiado aquí
} else {
    loadAuthConfig(); // Cambiado aquí
}
document.addEventListener('DOMContentLoaded', initializeGoogleAPIs);
