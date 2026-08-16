export async function onRequestPost(context) {
  try {
    // Ambil GEMINI_API_KEY dari environment variable (ter-setting di Cloudflare Pages)
    const apiKey = context.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API Key tidak ditemukan di server" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Ambil payload JSON dari request frontend
    const requestData = await context.request.json();

    // URL resmi endpoint Gemini API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    // Lakukan request forward ke API Gemini dengan mempertahankan payload asli
    const geminiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestData)
    });

    // Cek apakah response dari Gemini berhasil
    if (!geminiResponse.ok) {
      return new Response(JSON.stringify({ error: `HTTP Error: ${geminiResponse.status}` }), {
        status: geminiResponse.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Ambil data JSON dari Gemini
    const geminiData = await geminiResponse.json();

    // Kembalikan data tersebut langsung ke frontend
    return new Response(JSON.stringify(geminiData), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    // Tangkap error lainnya dan kembalikan ke client
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
