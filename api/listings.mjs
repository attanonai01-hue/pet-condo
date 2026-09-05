function getSupabaseConfig() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const url = rawUrl
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  return {
    url,
    key
  };
}


export async function GET() {
  const { url, key } = getSupabaseConfig();

  if (!url || !key) {
    return Response.json(
      {
        error: "Supabase environment variables are missing"
      },
      {
        status: 500
      }
    );
  }


  try {
    const response = await fetch(
      `${url}/rest/v1/listings?select=*`,
      {
        method: "GET",

        headers: {
          apikey: key,
          Accept: "application/json"
        },

        cache: "no-store"
      }
    );


    const text = await response.text();


    if (!response.ok) {
      return new Response(
        text,
        {
          status: response.status,

          headers: {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        }
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



export async function POST(request) {
  const { url, key } = getSupabaseConfig();


  if (!url || !key) {
    return Response.json(
      {
        error:
          "Supabase environment variables are missing"
      },
      {
        status: 500
      }
    );
  }


  try {
    const body =
      await request.json();


    const condoName =
      String(
        body.condo_name || ""
      ).trim();


    const location =
      String(
        body.location || ""
      ).trim();


    const price =
      Number(body.price);


    if (!condoName) {
      return Response.json(
        {
          error: "กรุณากรอกชื่อคอนโด"
        },
        {
          status: 400
        }
      );
    }


    if (!location) {
      return Response.json(
        {
          error: "กรุณากรอกทำเล"
        },
        {
          status: 400
        }
      );
    }


    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return Response.json(
        {
          error: "กรุณากรอกราคาให้ถูกต้อง"
        },
        {
          status: 400
        }
      );
    }


    const payload = {

      condo_name:
        condoName,

      location:
        location,

      price:
        price,

      bedrooms:
        body.bedrooms === null
          ? null
          : Number(body.bedrooms),

      bathrooms:
        body.bathrooms === null
          ? null
          : Number(body.bathrooms),

      size_sqm:
        body.size_sqm === null
          ? null
          : Number(body.size_sqm),

      floor:
        body.floor === null
          ? null
          : Number(body.floor),

      pet_dog:
        body.pet_dog === true,

      pet_cat:
        body.pet_cat === true,

      description:
        String(
          body.description || ""
        ).trim(),

      contact:
        String(
          body.contact || ""
        ).trim()
    };


    const response = await fetch(
      `${url}/rest/v1/listings`,
      {
        method: "POST",

        headers: {
          apikey: key,

          "Content-Type":
            "application/json",

          Prefer:
            "return=representation"
        },

        body:
          JSON.stringify(payload),

        cache:
          "no-store"
      }
    );


    const text =
      await response.text();


    if (!response.ok) {

      return new Response(
        text,
        {
          status:
            response.status,

          headers: {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        }
      );

    }


    return new Response(
      text,
      {
        status: 201,

        headers: {
          "Content-Type":
            "application/json; charset=utf-8"
        }
      }
    );

  } catch (error) {

    return Response.json(
      {
        error:
          error.message
      },
      {
        status: 500
      }
    );
  }
}
