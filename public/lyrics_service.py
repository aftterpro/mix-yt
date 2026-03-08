from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import os

app = Flask(__name__)
CORS(app)

@app.route('/get-lyrics')
def get_lyrics():
    video_id = request.args.get("id")

    if not video_id or len(video_id) != 11:
        return jsonify({"error": "ID inválido"}), 400

    output_base = f"/tmp/{video_id}"

    try:
        cmd = [
            "yt-dlp",
            "--skip-download",
            "--write-subs",
            "--sub-format", "lrc",
            "--output", output_base,
            f"https://www.youtube.com/watch?v={video_id}"
        ]

        subprocess.run(cmd, check=True, timeout=20)

        for file in os.listdir("/tmp"):
            if file.startswith(video_id) and file.endswith(".lrc"):
                path = os.path.join("/tmp", file)

                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()

                os.remove(path)

                return jsonify({
                    "status": "success",
                    "data": content
                })

        return jsonify({
            "status": "error",
            "message": "No se encontraron subtítulos"
        }), 404

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Timeout al obtener letras"}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Importante: host 0.0.0.0 para que sea accesible desde fuera
    app.run(host='0.0.0.0', port=5000)
