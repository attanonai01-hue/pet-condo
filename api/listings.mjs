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


function cleanString(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}


function numberOrNull(
  value,
  min,
  max
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    return null;
  }

  return number;
}


/* =====================================
   VERIFY USER JWT
===================================== */

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

    throw new Error(
      "UNAUTHORIZED"
    );
  }


  const token =
    authHeader.slice(7);


  if (!token) {

    throw new Error(
      "UNAUTHORIZED"
    );
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

    throw new Error(
      "UNAUTHORIZED"
    );
  }


  const user =
    await response.json();


  if (
    !user ||
    !user.id
  ) {

    throw new Error(
      "UNAUTHORIZED"
    );
  }


  if (
    !user.email_confirmed_at &&
    !user.confirmed_at
  ) {

    throw new Error(
      "EMAIL_NOT_VERIFIED"
    );
  }


  return {
    user,
    token
  };
}


/* =====================================
   GET PUBLIC LISTINGS
===================================== */

export async function GET() {

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
            Accept:
              "application/json"
          },

          cache:
            "no-store"
        }
      );


    const text =
      await response.text();


    if (!response.ok) {

      console.error(
        "Supabase GET error:",
        response.status,
        text
      );


      return json(
        {
          error:
            "ไม่สามารถโหลดประกาศได้"
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
            "public, max-age=0, s-maxage=30, stale-while-revalidate=60"
        }
      }
    );

  }

  catch(error) {

    console.error(error);

    return json(
      {
        error:
          "Server error"
      },
      500
    );
  }
}


/* =====================================
   CREATE LISTING
===================================== */

export async function POST(
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


  try {

    /* -----------------------
       CHECK CONTENT TYPE
    ----------------------- */

    const contentType =
      request.headers.get(
        "content-type"
      ) || "";


    if (
      !contentType.includes(
        "application/json"
      )
    ) {

      return json(
        {
          error:
            "Invalid content type"
        },
        415
      );
    }


    /* -----------------------
       BODY SIZE PROTECTION
    ----------------------- */

    const contentLength =
      Number(
        request.headers.get(
          "content-length"
        ) || 0
      );


    if (
      contentLength >
      32 * 1024
    ) {

      return json(
        {
          error:
            "Request too large"
        },
        413
      );
    }


    /* -----------------------
       VERIFY AUTH
    ----------------------- */

    let auth;


    try {

      auth =
        await verifyUser(
          request,
          url,
          key
        );

    }

    catch(error) {

      if (
        error.message ===
        "EMAIL_NOT_VERIFIED"
      ) {

        return json(
          {
            error:
              "กรุณายืนยัน Email ก่อนลงประกาศ"
          },
          403
        );

      }


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
    } =
      auth;


    /* -----------------------
       PARSE BODY
    ----------------------- */

    let body;


    try {

      body =
        await request.json();

    }

    catch {

      return json(
        {
          error:
            "ข้อมูลไม่ถูกต้อง"
        },
        400
      );

    }


    /* -----------------------
       VALIDATION
    ----------------------- */

    const condoName =
      cleanString(
        body.condo_name,
        120
      );


    const location =
      cleanString(
        body.location,
        200
      );


    const description =
      cleanString(
        body.description,
        5000
      );


    const contact =
      cleanString(
        body.contact,
        300
      );


    const price =
      Number(
        body.price
      );


    if (
      condoName.length < 2
    ) {

      return json(
        {
          error:
            "กรุณากรอกชื่อคอนโด"
        },
        400
      );

    }


    if (
      location.length < 2
    ) {

      return json(
        {
          error:
            "กรุณากรอกทำเล"
        },
        400
      );

    }


    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      price > 10000000
    ) {

      return json(
        {
          error:
            "ราคาไม่ถูกต้อง"
        },
        400
      );

    }


    /* -----------------------
       VALIDATE IMAGES
    ----------------------- */

    let imageUrls = [];


    if (
      Array.isArray(
        body.image_urls
      )
    ) {

      imageUrls =
        body.image_urls
          .filter(
            value =>
              typeof value ===
              "string"
          )
          .slice(0, 10);

    }


    const allowedPrefix =
      `${url}/storage/v1/object/public/listing-images/${user.id}/`;


    for (
      const imageUrl
      of imageUrls
    ) {

      if (
        !imageUrl.startsWith(
          allowedPrefix
        )
      ) {

        return json(
          {
            error:
              "พบ URL รูปภาพที่ไม่ได้รับอนุญาต"
          },
          400
        );

      }

    }


    const coverImage =
      imageUrls[0] || null;


    /* -----------------------
       IMPORTANT:
       owner_id มาจาก User ที่
       Auth server ยืนยันแล้วเท่านั้น
    ----------------------- */

    const listingPayload = {

      owner_id:
        user.id,

      condo_name:
        condoName,

      location:
        location,

      price:
        price,

      bedrooms:
        numberOrNull(
          body.bedrooms,
          0,
          20
        ),

      bathrooms:
        numberOrNull(
          body.bathrooms,
          0,
          20
        ),

      size_sqm:
        numberOrNull(
          body.size_sqm,
          0,
          10000
        ),

      floor:
        numberOrNull(
          body.floor,
          -10,
          300
        ),

      pet_dog:
        body.pet_dog === true,

      pet_cat:
        body.pet_cat === true,

      description:
        description,

      contact:
        contact,

      image_url:
        coverImage

    };


    /* -----------------------
       INSERT AS USER
       RLS WILL CHECK AGAIN
    ----------------------- */

    const listingResponse =
      await fetch(
        `${url}/rest/v1/listings`,
        {
          method: "POST",

          headers: {

            apikey:
              key,

            Authorization:
              `Bearer ${token}`,

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


    if (
      !listingResponse.ok
    ) {

      console.error(
        "Create listing error:",
        listingResponse.status,
        listingText
      );


      return json(
        {
          error:
            "สร้างประกาศไม่สำเร็จ"
        },
        listingResponse.status
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

      return json(
        {
          error:
            "ไม่พบ Listing ID"
        },
        500
      );

    }


    /* -----------------------
       INSERT GALLERY
    ----------------------- */

    if (
      imageUrls.length > 0
    ) {

      const imageRows =
        imageUrls.map(
          function(
            imageUrl,
            index
          ) {

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

              Authorization:
                `Bearer ${token}`,

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


      if (
        !imageResponse.ok
      ) {

        const imageError =
          await imageResponse.text();


        console.error(
          "Gallery insert error:",
          imageError
        );


        /*
          ถ้า Gallery พัง
          ลบ Listing ที่เพิ่งสร้าง
          ไม่ทิ้งข้อมูลครึ่ง ๆ กลาง ๆ
        */

        await fetch(
          `${url}/rest/v1/listings?id=eq.${encodeURIComponent(listing.id)}`,
          {
            method: "DELETE",

            headers: {
              apikey:
                key,

              Authorization:
                `Bearer ${token}`
            }
          }
        );


        return json(
          {
            error:
              "บันทึกรูปประกาศไม่สำเร็จ"
          },
          500
        );

      }

    }


    return json(
      {
        success:
          true,

        listing_id:
          listing.id
      },
      201
    );

  }

  catch(error) {

    console.error(
      "POST error:",
      error
    );


    return json(
      {
        error:
          "เกิดข้อผิดพลาด กรุณาลองใหม่"
      },
      500
    );

  }

}
