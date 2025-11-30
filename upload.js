// upload.js modificado para llamar a la función Netlify
document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const statusMessage = document.getElementById('statusMessage');

    uploadForm.addEventListener('submit', function (event) {
        event.preventDefault();

        // En lugar de FormData (para archivos), recogemos los datos necesarios para LRCLIB
        const dataToSend = {
            trackName: "Example Track", // Reemplaza con datos reales de tu UI/app
            artistName: "Example Artist",
            albumName: "Example Album",
            duration: 240, // Reemplaza con datos reales de tu UI/app
            plainLyrics: "This is a plain lyric line 1\nline 2.",
            syncedLyrics: "[00:01.00]This is synced line 1"
        };
        
        publishLyrics(dataToSend);
    });

    function publishLyrics(lyricsData) {
        statusMessage.textContent = 'Iniciando proceso de publicación (solicitando PoW)...';
        statusMessage.style.color = 'blue';

        // Llama a tu Netlify Function a través del proxy definido en netlify.toml
        // La URL es la ruta definida en netlify.toml: "/api/lyrics/"
        fetch('/api/lyrics/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(lyricsData)
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            // Si la función devuelve un error (400, 500, etc.), lo manejamos aquí
            throw new Error('Error de la función Netlify: ' + response.statusText);
        })
        .then(data => {
            statusMessage.textContent = data.message || '¡Publicación completada!';
            statusMessage.style.color = 'green';
            console.log('Respuesta final:', data);
        })
        .catch(error => {
            statusMessage.textContent = 'Falló la publicación: ' + error.message;
            statusMessage.style.color = 'red';
            console.error('Error:', error);
        });
    }
});
