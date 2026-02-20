from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import os

app = Flask(__name__)
CORS(app)

@app.route('/get-lyrics')
def get_lyrics():
    video_id = request.args.get('id')
    if not video_id:
        return jsonify({"error": "ID no proporcionado"}), 400

    try:
        # Comando para descargar solo los subtítulos/letras en formato lrc
        # --skip-download: No descarga el video, solo el texto
        # --write-subs y --all-subs: Busca cualquier subtítulo disponible
        cmd = [
            'yt-dlp', 
            '--skip-download', 
            '--write-subs', 
            '--sub-format', 'lrc', 
            '--output', f'/tmp/{video_id}',
            f'https://www.youtube.com/watch?v={video_id}'
        ]
        
        subprocess.run(cmd, check=True)
        
        # Buscar el archivo generado (yt-dlp le añade la extensión del idioma, ej: .es.lrc)
        lyrics_file = None
        for f in os.listdir('/tmp'):
            if f.startswith(video_id) and f.endswith('.lrc'):
                lyrics_file = os.path.join('/tmp', f)
                break
        
        if lyrics_file and os.path.exists(lyrics_file):
            with open(lyrics_file, 'r', encoding='utf-8') as f:
                content = f.read()
            os.remove(lyrics_file) # Limpiar después de leer
            return jsonify({"status": "success", "data": content})
        else:
            return jsonify({"status": "error", "message": "No se encontraron subtítulos sincronizados"}), 404

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Importante: host 0.0.0.0 para que sea accesible desde fuera
    app.run(host='0.0.0.0', port=5000)
