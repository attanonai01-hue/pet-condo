export async function GET(request) {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!rawUrl || !key) {
    return Response.json(
      {
        error: "Supabase environment variables are missing"
      },
      {
        status: 500
      }
    );
  }

  // รองรับกรณีที่ใส่ /rest/v1/ ติดมากับ URL
  const supabaseUrl = rawUrl
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/listings?select=*`,
      {
        headers: {
          apikey: key,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return new Response(text, {
        status: response.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      });
    }

    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    return Response.json(
      {
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}
