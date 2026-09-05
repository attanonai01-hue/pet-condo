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


/* =========================
   GET ALL LISTINGS
========================= */

export async function GET() {

  const { url, key } =
    getSupabaseConfig();


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

    const select =
      encodeURIComponent(
        "*,listing_images(id,image_url,sort_order)"
      );


    const response =
      await fetch(
        `${url}/rest/v1/listings?select=${select}`,
        {
          method: "GET",

          headers: {
            apikey: key,
            Accept: "application/json"
          },

          cache: "no-store"
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


/* =========================
   CREATE LISTING
========================= */

export async function POST(request) {

  const { url, key } =
    getSupabaseConfig();


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
      Number(
        body.price
      );


    if (!condoName) {

      return Response.json(
        {
          error:
            "กรุณากรอกชื่อคอนโด"
        },
        {
          status: 400
        }
      );

    }


    if (!location) {

      return Response.json(
        {
          error:
            "กรุณากรอกทำเล"
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
          error:
            "กรุณากรอกราคาให้ถูกต้อง"
        },
        {
          status: 400
        }
      );

    }


    let imageUrls = [];


    if (
      Array.isArray(
        body.image_urls
      )
    ) {

      imageUrls =
        body.image_urls
          .filter(
            function(value) {

              return (
                typeof value === "string" &&
                /^https?:\/\//i.test(value)
              );

            }
          )
          .slice(0, 10);

    }


    const coverImage =
      imageUrls[0] ||
      String(
        body.image_url || ""
      ).trim();


    const listingPayload = {

      condo_name:
        condoName,

      location:
        location,

      price:
        price,

      bedrooms:
        body.bedrooms === null ||
        body.bedrooms === undefined
          ? null
          : Number(body.bedrooms),

      bathrooms:
        body.bathrooms === null ||
        body.bathrooms === undefined
          ? null
          : Number(body.bathrooms),

      size_sqm:
        body.size_sqm === null ||
        body.size_sqm === undefined
          ? null
          : Number(body.size_sqm),

      floor:
        body.floor === null ||
        body.floor === undefined
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
        ).trim(),

      image_url:
        coverImage

    };


    /* สร้างประกาศ */

    const listingResponse =
      await fetch(
        `${url}/rest/v1/listings`,
        {
          method: "POST",

          headers: {

            apikey:
              key,

            "Content-Type":
              "application/json",

            Prefer:
              "return=representation"

          },

          body:
            JSON.stringify(
              listingPayload
            ),

          cache:
            "no-store"

        }
      );


    const listingText =
      await listingResponse.text();


    if (!listingResponse.ok) {

      return new Response(
        listingText,
        {
          status:
            listingResponse.status,

          headers: {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        }
      );

    }


    const inserted =
      JSON.parse(
        listingText
      );


    const listing =
      inserted[0];


    if (
      !listing ||
      !listing.id
    ) {

      throw new Error(
        "สร้างประกาศสำเร็จ แต่ไม่พบ Listing ID"
      );

    }


    /* บันทึกรูปทั้งหมด */

    if (
      imageUrls.length > 0
    ) {

      const imageRows =
        imageUrls.map(
          function(imageUrl, index) {

            return {

              listing_id:
                listing.id,

              image_url:
                imageUrl,

              sort_order:
                index

            };

          }
        );


      const imageResponse =
        await fetch(
          `${url}/rest/v1/listing_images`,
          {
            method: "POST",

            headers: {

              apikey:
                key,

              "Content-Type":
                "application/json",

              Prefer:
                "return=minimal"

            },

            body:
              JSON.stringify(
                imageRows
              ),

            cache:
              "no-store"

          }
        );


      const imageErrorText =
        await imageResponse.text();


      if (!imageResponse.ok) {

        return Response.json(
          {
            error:
              "สร้างประกาศแล้ว แต่บันทึกรูป Gallery ไม่สำเร็จ",

            details:
              imageErrorText,

            listing_id:
              listing.id
          },
          {
            status: 500
          }
        );

      }

    }


    return Response.json(
      {
        success: true,
        listing: listing
      },
      {
        status: 201
      }
    );

  }

  catch(error) {

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
