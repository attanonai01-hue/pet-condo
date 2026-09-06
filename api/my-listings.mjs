function getConfig() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const url = rawUrl
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  return { url, key };
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}


async function verifyUser(
  request,
  url,
  key
) {
  const authHeader =
    request.headers.get(
      "authorization"
    ) || "";


  if (
    !authHeader.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }


  const token =
    authHeader.slice(7);


  if (!token) {
    return null;
  }


  const response =
    await fetch(
      `${url}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          apikey: key,

          Authorization:
            `Bearer ${token}`
        },

        cache: "no-store"
      }
    );


  if (!response.ok) {
    return null;
  }


  const user =
    await response.json();


  if (
    !user ||
    !user.id
  ) {
    return null;
  }


  return {
    user,
    token
  };
}



export async function GET(
  request
) {
  const { url, key } =
    getConfig();


  if (!url || !key) {
    return json(
      {
        error:
          "Server configuration error"
      },
      500
    );
  }


  const auth =
    await verifyUser(
      request,
      url,
      key
    );


  if (!auth) {
    return json(
      {
        error:
          "กรุณาเข้าสู่ระบบ"
      },
      401
    );
  }


  const {
    user,
    token
  } = auth;


  try {
    const select =
      encodeURIComponent(
        "*,listing_images(id,image_url,sort_order)"
      );


    const response =
      await fetch(
        `${url}/rest/v1/listings?select=${select}&owner_id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "GET",

          headers: {
            apikey: key,

            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/json"
          },

          cache: "no-store"
        }
      );


    const text =
      await response.text();


    if (!response.ok) {
      console.error(
        "My listings error:",
        text
      );


      return json(
        {
          error:
            "โหลดประกาศของคุณไม่สำเร็จ"
        },
        response.status
      );
    }


    return new Response(
      text,
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/json; charset=utf-8",

          "Cache-Control":
            "no-store"
        }
      }
    );

  }

  catch(error) {
    console.error(error);


    return json(
      {
        error:
          "เกิดข้อผิดพลาด"
      },
      500
    );
  }
}
