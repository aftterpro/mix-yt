async uploadLyrics(form, dialog) {
    const statusDiv = dialog.querySelector('#uploadStatus');
    statusDiv.textContent = 'Preparando datos...';
    statusDiv.style.color = 'blue';

    // ✅ OBTENER VIDEO ACTUAL
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

    // ✅ AÑADIR METADATA DEL VIDEO
    console.log('📝 Subiendo letras para:', {
        videoId: currentVideo.videoId,
        title: formData.trackName,
        artist: formData.artistName,
        duration: formData.duration
    });

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
        statusDiv.textContent = '⚙️ Resolviendo prueba de trabajo (puede tardar)...';
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
            
            console.log('✅ Letras subidas exitosamente para:', currentVideo.videoId);
            
            setTimeout(() => {
                dialog.remove();
                // Recargar letras
                if (window.playlistManager) {
                    window.playlistManager.loadLyrics();
                }
            }, 2000);
        } else {
            const errorData = await publishResponse.json();
            throw new Error(errorData.message || `Error HTTP ${publishResponse.status}`);
        }

    } catch (error) {
        console.error('❌ Error subiendo letras:', error);
        statusDiv.textContent = `❌ Error: ${error.message}`;
        statusDiv.style.color = 'red';
    }
}
