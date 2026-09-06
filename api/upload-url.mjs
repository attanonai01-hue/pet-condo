function getConfig() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const secretKey =
    process.env.SUPABASE_SECRET_KEY || "";

  const url = rawUrl
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  return {
    url,
    publishableKey,
    secretKey
  };
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


/* =========================================
   ตรวจ User JWT กับ Supabase Auth จริง
========================================= */

async function verifyUser(
  request,
  url,
  publishableKey
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
          apikey:
            publishableKey,

          Authorization:
            `Bearer ${token}`
        },

        cache:
          "no-store"
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


/* =========================================
   POST /api/upload-url
========================================= */

export async function POST(request) {

  const {
    url,
    publishableKey,
    secretKey
  } = getConfig();


  if (
    !url ||
    !publishableKey ||
    !secretKey
  ) {

    console.error(
      "Missing Supabase environment variables"
    );


    return json(
      {
        error:
          "Server configuration error"
      },
      500
    );
  }


  /* -----------------------------------------
     1. ตรวจ User
  ----------------------------------------- */

  const auth =
    await verifyUser(
      request,
      url,
      publishableKey
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


  const user =
    auth.user;


  if (
    !user.email_confirmed_at &&
    !user.confirmed_at
  ) {

    return json(
      {
        error:
          "กรุณายืนยัน Email ก่อนอัปโหลดรูป"
      },
      403
    );
  }


  /* -----------------------------------------
     2. รับข้อมูลไฟล์
  ----------------------------------------- */

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


  const contentType =
    String(
      body.content_type || ""
    )
    .trim()
    .toLowerCase();


  const fileSize =
    Number(
      body.file_size
    );


  /* -----------------------------------------
     3. จำกัด MIME
  ----------------------------------------- */

  const allowedTypes = {
    "image/jpeg":
      "jpg",

    "image/png":
      "png",

    "image/webp":
      "webp"
  };


  const extension =
    allowedTypes[
      contentType
    ];


  if (!extension) {

    return json(
      {
        error:
          "รองรับเฉพาะ JPG, PNG และ WEBP"
      },
      400
    );
  }


  /* -----------------------------------------
     4. จำกัดขนาด 10 MB ที่ API อีกชั้น
  ----------------------------------------- */

  const MAX_SIZE =
    10 * 1024 * 1024;


  if (
    !Number.isFinite(fileSize) ||
    fileSize <= 0 ||
    fileSize > MAX_SIZE
  ) {

    return json(
      {
        error:
          "ไฟล์ต้องมีขนาดไม่เกิน 10 MB"
      },
      400
    );
  }


  /*
    ไม่ใช้ชื่อไฟล์จาก User
    ป้องกัน path traversal / ชื่อแปลก ๆ
  */

  const fileName =
    `${Date.now()}-${crypto.randomUUID()}.${extension}`;


  /*
    Folder แรกเป็น User UUID
  */

  const path =
    `${user.id}/listings/${fileName}`;


  try {

    /* =====================================
       5. ใช้ Database Rate Limit

       20 รูป / ชั่วโมง
       100 รูป / 24 ชั่วโมง
    ===================================== */

    const grantResponse =
      await fetch(
        `${url}/rest/v1/rpc/request_storage_upload_grant`,
        {
          method: "POST",

          headers: {

            /*
              sb_secret_ ใช้เฉพาะ apikey
              ห้ามส่งกลับไป Browser
            */

            apikey:
              secretKey,

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              p_user_id:
                user.id
            }),

          cache:
            "no-store"
        }
      );


    if (!grantResponse.ok) {

      const grantError =
        await grantResponse.text();


      console.error(
        "Upload grant error:",
        grantResponse.status,
        grantError
      );


      if (
        grantError.includes(
          "Hourly upload limit reached"
        )
      ) {

        return json(
          {
            error:
              "อัปโหลดรูปครบ 20 รูปต่อชั่วโมงแล้ว กรุณารอสักครู่"
          },
          429
        );
      }


      if (
        grantError.includes(
          "Daily upload limit reached"
        )
      ) {

        return json(
          {
            error:
              "อัปโหลดรูปครบ 100 รูปต่อวันแล้ว"
          },
          429
        );
      }


      return json(
        {
          error:
            "ไม่สามารถอนุญาตการอัปโหลดได้"
        },
        500
      );
    }


    /* =====================================
       6. สร้าง Signed Upload URL

       Secret Key อยู่บน Server เท่านั้น
    ===================================== */

    const encodedPath =
      path
        .split("/")
        .map(
          encodeURIComponent
        )
        .join("/");


    const signedResponse =
      await fetch(
        `${url}/storage/v1/object/upload/sign/listing-images/${encodedPath}`,
        {
          method: "POST",

          headers: {

            apikey:
              secretKey,

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({}),

          cache:
            "no-store"
        }
      );


    const signedText =
      await signedResponse.text();


    if (!signedResponse.ok) {

      console.error(
        "Signed upload error:",
        signedResponse.status,
        signedText
      );


      return json(
        {
          error:
            "สร้างสิทธิ์อัปโหลดรูปไม่สำเร็จ"
        },
        500
      );
    }


    let signedData;


    try {

      signedData =
        JSON.parse(
          signedText
        );

    }

    catch {

      return json(
        {
          error:
            "Signed upload response ไม่ถูกต้อง"
        },
        500
      );
    }


    /*
      Supabase ส่ง URL ที่มี token กลับมา
    */

    const returnedUrl =
      signedData.url ||
      signedData.signedURL ||
      signedData.signedUrl;


    if (!returnedUrl) {

      console.error(
        "No signed URL:",
        signedData
      );


      return json(
        {
          error:
            "ไม่พบ Signed Upload URL"
        },
        500
      );
    }


    const fullSignedUrl =
      returnedUrl.startsWith(
        "http"
      )
        ? returnedUrl
        : `${url}/storage/v1${returnedUrl}`;


    const parsedUrl =
      new URL(
        fullSignedUrl
      );


    const uploadToken =
      parsedUrl.searchParams.get(
        "token"
      );


    if (!uploadToken) {

      return json(
        {
          error:
            "ไม่พบ Upload Token"
        },
        500
      );
    }


    /* =====================================
       7. ส่งเฉพาะข้อมูลที่ Browser ต้องใช้

       ❌ ไม่ส่ง Secret Key
    ===================================== */

    return json(
      {
        success:
          true,

        path:
          path,

        token:
          uploadToken
      },
      200
    );

  }

  catch(error) {

    console.error(
      "upload-url error:",
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
