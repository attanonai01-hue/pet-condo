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
   ตรวจ USER JWT กับ Supabase Auth
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
        method:
          "GET",

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

    console.error(
      "Auth verification failed:",
      response.status
    );

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


  /* =====================================
     1. ตรวจ Environment
  ===================================== */

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


  /* =====================================
     2. ตรวจ User จริง
  ===================================== */

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
          "กรุณาเข้าสู่ระบบใหม่"
      },
      401
    );
  }


  const {
    user,
    token
  } = auth;


  /* =====================================
     3. ต้องยืนยัน Email
  ===================================== */

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


  /* =====================================
     4. ตรวจ Content-Type ของ Request
  ===================================== */

  const requestContentType =
    request.headers.get(
      "content-type"
    ) || "";


  if (
    !requestContentType.includes(
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


  /* =====================================
     5. อ่าน Body
  ===================================== */

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


  /* =====================================
     6. MIME Whitelist
  ===================================== */

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


  /* =====================================
     7. จำกัด 10 MB ที่ Server
  ===================================== */

  const MAX_FILE_SIZE =
    10 * 1024 * 1024;


  if (
    !Number.isFinite(
      fileSize
    ) ||
    fileSize <= 0 ||
    fileSize >
      MAX_FILE_SIZE
  ) {

    return json(
      {
        error:
          "ไฟล์ต้องมีขนาดไม่เกิน 10 MB"
      },
      400
    );
  }


  /* =====================================
     8. ให้ DATABASE ตรวจ Upload quota

     สำคัญ:
     ใช้ USER JWT
     เพื่อให้ auth.uid() ทำงานจริง
  ===================================== */

  const grantResponse =
    await fetch(
      `${url}/rest/v1/rpc/request_storage_upload_grant_v2`,
      {
        method:
          "POST",

        headers: {

          apikey:
            publishableKey,

          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({}),

        cache:
          "no-store"
      }
    );


  const grantText =
    await grantResponse.text();


  if (!grantResponse.ok) {

    console.error(
      "Upload grant V2 error:",
      grantResponse.status,
      grantText
    );


    if (
      grantText.includes(
        "HOURLY_UPLOAD_LIMIT"
      )
    ) {

      return json(
        {
          error:
            "อัปโหลดครบ 20 รูปต่อชั่วโมงแล้ว กรุณารอก่อน"
        },
        429
      );
    }


    if (
      grantText.includes(
        "DAILY_UPLOAD_LIMIT"
      )
    ) {

      return json(
        {
          error:
            "อัปโหลดครบ 100 รูปภายใน 24 ชั่วโมงแล้ว"
        },
        429
      );
    }


    if (
      grantText.includes(
        "NOT_AUTHENTICATED"
      )
    ) {

      return json(
        {
          error:
            "Session ไม่ถูกต้อง กรุณา Login ใหม่"
        },
        401
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
     9. สร้างชื่อไฟล์ฝั่ง Server

     ไม่ใช้ชื่อไฟล์จาก User
  ===================================== */

  const fileName =
    `${Date.now()}-${crypto.randomUUID()}.${extension}`;


  /*
    User แต่ละคนถูกแยก Folder
  */

  const path =
    `${user.id}/listings/${fileName}`;


  const encodedPath =
    path
      .split("/")
      .map(
        part =>
          encodeURIComponent(
            part
          )
      )
      .join("/");


  /* =====================================
     10. สร้าง SIGNED UPLOAD URL

     SECRET KEY ใช้ตรงนี้เท่านั้น

     ห้ามส่ง Secret Key กลับ Browser
  ===================================== */

  const signedResponse =
    await fetch(
      `${url}/storage/v1/object/upload/sign/listing-images/${encodedPath}`,
      {
        method:
          "POST",

        headers: {

          /*
            sb_secret_ เป็น opaque API key
            จึงส่งใน apikey header
          */

          apikey:
            secretKey,

          "Content-Type":
            "application/json",

          "x-upsert":
            "false"

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
      "Create signed upload error:",
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


  /* =====================================
     11. อ่าน Token
  ===================================== */

  let signedData;


  try {

    signedData =
      JSON.parse(
        signedText
      );

  }

  catch {

    console.error(
      "Invalid signed upload response:",
      signedText
    );


    return json(
      {
        error:
          "ระบบอัปโหลดตอบกลับไม่ถูกต้อง"
      },
      500
    );
  }


  /*
    Storage API จะคืน path ที่มี
    ?token=...
  */

  const returnedUrl =
    signedData.url ||
    signedData.signedUrl ||
    signedData.signedURL;


  if (!returnedUrl) {

    console.error(
      "Signed URL missing:",
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


  let signedUrl;


  try {

    signedUrl =
      returnedUrl.startsWith(
        "http"
      )
        ? new URL(
            returnedUrl
          )
        : new URL(
            `${url}/storage/v1${returnedUrl}`
          );

  }

  catch(error) {

    console.error(
      "Signed URL parse error:",
      error
    );


    return json(
      {
        error:
          "Signed URL ไม่ถูกต้อง"
      },
      500
    );
  }


  const uploadToken =
    signedUrl.searchParams
      .get(
        "token"
      );


  if (!uploadToken) {

    console.error(
      "Upload token missing"
    );


    return json(
      {
        error:
          "ไม่พบ Upload Token"
      },
      500
    );
  }


  /* =====================================
     12. ส่งกลับ Browser

     มีแค่:
     - path
     - temporary token

     ไม่มี SECRET KEY
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
