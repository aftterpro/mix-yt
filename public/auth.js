// =============================================
//  Lógica de Autenticación y Playlists
// =============================================

let CLIENT_ID = null;

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
async function iniciarApp() {
    try {
        const res = await fetch('/api/auth-config');
        const config = await res.json();
        CLIENT_ID = config.clientId;
        console.log("🔑 Client ID cargado correctamente");
        initializeGoogleAPIs(); 
    } catch (e) {
        console.error("❌ Error cargando configuración:", e);
    }
}

document.addEventListener('DOMContentLoaded', iniciarApp);
async function loadAuthConfig() {
    try {
        console.log("⏳ Solicitando configuración de Auth...");
        const response = await fetch('/api/auth-config'); // Asegúrate que esta ruta exista en Cloudflare Functions
        const config = await response.json();
        
        if (config.clientId) {
            CLIENT_ID = config.clientId;
            console.log("✅ Configuración cargada. CLIENT_ID recibido.");
            
            // SOLO AHORA iniciamos Google, una vez que tenemos el ID
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
    if (typeof gapi === 'undefined') {
        console.error('❌ GAPI no disponible');
        return;
    }
    
      gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest'],
       
    }).then(() => {
        gapiReady = true;
        console.log('✅ GAPI Client inicializado correctamente');
        checkAndUpdateUI();
        
        const token = localStorage.getItem('yt_access_token');
        if (token) {
            gapi.client.setToken({ access_token: token });
            isAuthorized = true;
            updateAuthUI();
            loadUserPlaylistsUI();
        }
    }).catch((err) => {
        console.error('❌ Error GAPI:', err);
        gapiReady = false;
  
        const authControls = document.getElementById('auth-controls');
        if (authControls) {
            const errorMsg = document.createElement('small');
            errorMsg.style.color = 'red';
            errorMsg.textContent = 'Error al inicializar Google API';
            authControls.appendChild(errorMsg);
        }
    });
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
    const btn = document.getElementById('googleSignInButton');
    if (btn) {
        if (gapiReady && gisReady) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }
    }
}

// =============================================
// LÓGICA DE USUARIO
// =============================================

window.handleAuthClick = function() {
    // Verificar que tokenClient existe
    if (!tokenClient) {
        console.error('❌ Token client no inicializado');
        alert('El sistema de autenticación no está listo. Por favor, recarga la página.');
        return;
    }
    
    // Verificar que GAPI está disponible y el client está inicializado
    if (typeof gapi === 'undefined' || !gapi.client) {
        console.error('❌ GAPI client no disponible');
        alert('Google API no está cargado. Por favor, recarga la página.');
        return;
    }
    
    // Verificar si ya hay un token activo
    try {
        const currentToken = gapi.client.getToken();
        if (currentToken === null || !currentToken) {
            // No hay token, solicitar con consentimiento
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            // Ya hay token, solicitar uno nuevo sin prompt
            tokenClient.requestAccessToken({ prompt: '' });
        }
    } catch (error) {
        console.error('❌ Error al verificar token:', error);
        // Si hay error al verificar, intentar obtener token con consentimiento
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
};

window.handleSignOutClick = function() {
    // Verificar que GAPI existe
    if (typeof gapi === 'undefined' || !gapi.client) {
        console.error('❌ GAPI no disponible para cerrar sesión');
        return;
    }
    
    try {
        const token = gapi.client.getToken();
        if (token !== null) {
            // Verificar que google.accounts.oauth2 existe
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                google.accounts.oauth2.revoke(token.access_token);
            }
            gapi.client.setToken('');
            localStorage.removeItem('yt_access_token');
            isAuthorized = false;
            updateAuthUI();
            document.getElementById('user-playlists-content').innerHTML = '<p>Inicia sesión para ver tus playlists</p>';
            
            // Asegurar que volvemos a la vista principal
            document.getElementById('user-playlist-details').style.display = 'none';
            document.getElementById('user-playlists-overview').style.display = 'block';
        }
    } catch (error) {
        console.error('❌ Error al cerrar sesión:', error);
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
async function viewPlaylistDetails(playlistId, playlistTitle) {
    document.getElementById('user-playlists-overview').style.display = 'none';
    document.getElementById('user-playlist-details').style.display = 'block';
    
    document.getElementById('details-playlist-title').textContent = playlistTitle;
    currentDetailPlaylistId = playlistId;

    const listContainer = document.getElementById('details-video-list');
    listContainer.innerHTML = '<p style="padding: 20px;">Cargando vista previa de videos...</p>';

    try {
        const response = await gapi.client.youtube.playlistItems.list({
            playlistId: playlistId,
            part: 'snippet,contentDetails', // Se añade contentDetails para obtener el videoId correctamente
            maxResults: 50
        });

        listContainer.innerHTML = '';

        if (response.result.items.length === 0) {
            listContainer.innerHTML = '<p style="padding: 20px;">Esta playlist está vacía.</p>';
            return;
        }

        response.result.items.forEach(item => {
            if (item.snippet.title === "Private video" || item.snippet.title === "Deleted video") return;

            const vidEl = document.createElement('div');
            vidEl.className = 'detail-video-item';
            const thumb = item.snippet.thumbnails?.default?.url || 'https://via.placeholder.com/60';
            
            // ✅ Nueva estructura con botón de añadir
            vidEl.innerHTML = `
                <img src="${thumb}" alt="thumbnail">
                <div class="detail-video-info">
                    <h5>${item.snippet.title}</h5>
                    <p>${item.snippet.videoOwnerChannelTitle || 'Artista desconocido'}</p>
                </div>
                <button class="detail-add-btn" title="Añadir a Cola">
                    <i class="fas fa-plus-circle"></i>
                </button>
            `;

            // ✅ Event listener para el botón añadir desde la vista de detalle
            vidEl.querySelector('.detail-add-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
                if (!videoId) return;
                
                addToPlaylist({
                    videoId,
                    title: item.snippet.title,
                    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                    duration: 0, // La duración se puede obtener bajo demanda si es necesario
                    artist: item.snippet.videoOwnerChannelTitle || ''
                });
            });

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
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                playlistId: playlistId,
                part: 'snippet,contentDetails',
                maxResults: 50,
                pageToken: nextPageToken
            });

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

            // ✅ Reemplazo del .map() para incluir artist
            const items = response.result.items.map(item => ({
                videoId: item.contentDetails.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                duration: durMap[item.contentDetails.videoId] || 0,
                artist: item.snippet.videoOwnerChannelTitle || '', // ✅ Pasar el canal como artist
                manual: false
            })).filter(i => i.title !== "Private video" && i.title !== "Deleted video");

            allVideos = [...allVideos, ...items];
            nextPageToken = response.result.nextPageToken;

        } while (nextPageToken && allVideos.length < 300);

        if (window.playlistVideos) {
            window.playlistVideos.push(...allVideos);
            window.updatePlaylistDOM();
            mostrarMensajeFlotante(`✅ ¡${allVideos.length} videos añadidos a la Cola!`);
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
    document.addEventListener('DOMContentLoaded', loadAuthConfig);
} else {
    loadAuthConfig();
}
