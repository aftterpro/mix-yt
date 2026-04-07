import azure.functions as func
import json
import subprocess
import os
import requests

app = func.FunctionApp()

def get_lrclib_fast(title):
    try:
        url = f"https://lrclib.net/api/search?q={requests.utils.quote(title)}"
        res = requests.get(url, timeout=5)
        if res.status_code == 200 and res.json():
            return res.json()[0].get("syncedLyrics")
    except:
        return None
    return None

@app.route(route="get-lyrics", auth_level=func.AuthLevel.ANONYMOUS)
def get_lyrics(req: func.HttpRequest) -> func.HttpResponse:
    video_id = req.params.get('id')
    
    if not video_id:
        return func.HttpResponse("ID faltante", status_code=400)

    # En Azure Functions, escribimos en /tmp que es el único lugar con permiso
    output_base = f"/tmp/{video_id}"

    try:
        # Intentamos obtener el título primero para el Plan B rápido
        cmd_meta = ["yt-dlp", "--get-title", f"https://www.youtube.com/watch?v={video_id}"]
        meta_res = subprocess.run(cmd_meta, capture_output=True, text=True, timeout=10)
        title = meta_res.stdout.strip() if meta_res.returncode == 0 else ""

        # PLAN B: Si tenemos título, buscamos en LRCLIB de una (Súper rápido)
        if title:
            lyrics = get_lrclib_fast(title)
            if lyrics:
                return func.HttpResponse(
                    json.dumps({"status": "success", "source": "lrclib", "data": lyrics}),
                    mimetype="application/json"
                )

        # PLAN A: Intentar con yt-dlp (por si LRCLIB no la tiene)
        cmd_full = [
            "yt-dlp", "--skip-download", "--write-auto-subs", 
            "--convert-subs", "lrc", "--output", output_base,
            f"https://www.youtube.com/watch?v={video_id}"
        ]
        subprocess.run(cmd_full, timeout=15)

        # Buscar el archivo generado
        for file in os.listdir("/tmp"):
            if file.startswith(video_id) and file.endswith(".lrc"):
                with open(os.path.join("/tmp", file), "r") as f:
                    content = f.read()
                os.remove(os.path.join("/tmp", file))
                return func.HttpResponse(
                    json.dumps({"status": "success", "source": "youtube", "data": content}),
                    mimetype="application/json"
                )

    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

    return func.HttpResponse(json.dumps({"message": "No encontrado"}), status_code=404)

