import { Context } from "https://edge.netlify.com";

// Función auxiliar para convertir ArrayBuffer a Hex
function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async (request: Request, context: Context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { trackName, artistName, duration, plainLyrics, syncedLyrics, albumName } = body;

    if (!trackName || !artistName || !duration) {
      return new Response(JSON.stringify({ error: "Datos incompletos" }), { status: 400, headers: corsHeaders });
    }

    // 1. Obtener Challenge
    console.log("🔐 Solicitando PoW...");
    const challengeRes = await fetch("https://lrclib.net/api/publish-challenge", { method: "POST" });
    
    if (!challengeRes.ok) throw new Error("Fallo al obtener challenge");
    
    const { prefix, target } = await challengeRes.json();
    
    // 2. Resolver PoW (Minería rápida con Web Crypto)
    console.log(`⛏️ Minando: Prefix ${prefix}, Target ${target}`);
    
    let nonce = 0;
    let token = "";
    let hashHex = "";
    const encoder = new TextEncoder();

    // Loop de minería (Fuerza bruta)
    while (true) {
      nonce++;
      token = `${prefix}:${nonce}`;
      const data = encoder.encode(token);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      hashHex = toHex(hashBuffer);

      if (hashHex.startsWith(target)) {
        break; // ¡Encontrado!
      }
      
      // Seguridad para evitar loop infinito en Edge (max 1 millón de intentos)
      if (nonce > 1000000) throw new Error("Timeout computacional PoW");
    }

    console.log(`✅ PoW Resuelto: ${token}`);

    // 3. Publicar
    const publishRes = await fetch("https://lrclib.net/api/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Publish-Token": token
      },
      body: JSON.stringify({
        trackName,
        artistName,
        albumName: albumName || "",
        duration: parseFloat(duration),
        plainLyrics: plainLyrics || "",
        syncedLyrics: syncedLyrics || ""
      })
    });

    if (publishRes.status === 201) {
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    } else {
      const errData = await publishRes.json();
      return new Response(JSON.stringify(errData), { status: publishRes.status, headers: corsHeaders });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
};