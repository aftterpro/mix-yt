from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import json

app = Flask(__name__)
CORS(app) # Esto permite que tu app mix-yt.pages.dev acceda sin errores

@app.route('/get-lyrics')
def get_lyrics():
    video_id = request.args.get('id')
    
    # PASO 1: Intentar con yt-dlp (Busca subtítulos/letras en el video)
    # Es extremadamente ligero para tu RAM de 1GB
    try:
        cmd = [
            'yt-dlp', '--skip-download', '--write-subs', '--sub-format', 'lrc/srt',
            '--print', 'subtitles', '--output', '%(id)s', 
            f'https://www.youtube.com/watch?v={video_id}'
        ]
        # Aquí procesamos la salida para enviarla al frontend
        return jsonify({"status": "success", "source": "youtube_subs", "data": "..." })
    except:
        return jsonify({"error": "No se encontraron letras"}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
