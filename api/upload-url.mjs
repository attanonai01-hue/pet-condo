import { createClient } from "@supabase/supabase-js";


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
   ตรวจ USER JWT กับ SUPABASE AUTH
========================================= */

async function verifyUser(
  token,
  url,
  publishableKey
) {

  try {

    const userClient =
      createClient(
        url,
        publishableKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );


    const {
      data,
      error
    } =
      await userClient
        .auth
        .getUser(
          token
        );


    if (
      error ||
      !data?.user
    ) {

      console.error(
        "Auth verification failed:",
        error?.message
      );

      return null;
    }


    return data.user;

  }

  catch(error) {

    console.error(
      "verifyUser error:",
      error
    );

    return null;
  }
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
     1. ตรวจ ENVIRONMENT
  ===================================== */

  if (
    !url ||
    !publishableKey ||
    !secretKey
  ) {

    console.error(
      "Missing environment variables",
      {
        hasUrl:
          Boolean(url),

        hasPublishableKey:
          Boolean(publishableKey),

        hasSecretKey:
          Boolean(secretKey)
      }
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
     2. รับ ACCESS TOKEN
  ===================================== */

  const authHeader =
    request.headers.get(
      "authorization"
    ) || "";


  if (
    !authHeader.startsWith(
      "Bearer "
    )
  ) {

    return json(
      {
        error:
          "กรุณาเข้าสู่ระบบ"
      },
      401
    );
  }


  const token =
    authHeader
      .slice(7)
      .trim();


  if (!token) {

    return json(
      {
        error:
          "Session ไม่ถูกต้อง"
      },
      401
    );
  }


  /* =====================================
     3. ตรวจ USER จริงกับ AUTH SERVER
  ===================================== */

  const user =
    await verifyUser(
      token,
      url,
      publishableKey
    );


  if (!user) {

    return json(
      {
        error:
          "Session หมดอายุ กรุณา Login ใหม่"
      },
      401
    );
  }


  /* =====================================
     4. ต้องยืนยัน EMAIL
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
     5. REQUEST ต้องเป็น JSON
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
     6. อ่าน BODY
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
     7. MIME WHITELIST
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
     8. จำกัดขนาด 10 MB ที่ SERVER
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
     9. USER CLIENT ที่ส่ง JWT ต่อไปยัง DB

     เพื่อให้ auth.uid() ใน RPC
     เห็น User จริง
  ===================================== */

  const userDbClient =
    createClient(
      url,
      publishableKey,
      {
        global: {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        },

        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );


  /* =====================================
     10. DATABASE UPLOAD QUOTA

     20 รูป / ชั่วโมง
     100 รูป / 24 ชั่วโมง
  ===================================== */

  const {
    error: grantError
  } =
    await userDbClient
      .rpc(
        "request_storage_upload_grant_v2"
      );


  if (grantError) {

    console.error(
      "Upload grant error:",
      grantError
    );


    const errorText =
      String(
        grantError.message || ""
      );


    if (
      errorText.includes(
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
      errorText.includes(
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
      errorText.includes(
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
     11. สร้าง PATH ฝั่ง SERVER

     Browser ตั้ง path เองไม่ได้
  ===================================== */

  const fileName =
    `${Date.now()}-${crypto.randomUUID()}.${extension}`;


  const path =
    `${user.id}/listings/${fileName}`;


  /* =====================================
     12. ADMIN STORAGE CLIENT

     ใช้ SECRET KEY เฉพาะฝั่ง SERVER
  ===================================== */

  const adminClient =
    createClient(
      url,
      secretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );


  /* =====================================
     13. สร้าง SIGNED UPLOAD TOKEN
  ===================================== */

  const {
    data: signedData,
    error: signedError
  } =
    await adminClient
      .storage
      .from(
        "listing-images"
      )
      .createSignedUploadUrl(
        path,
        {
          upsert: false
        }
      );


  if (signedError) {

    console.error(
      "createSignedUploadUrl error:",
      signedError
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
     14. ต้องมี TOKEN
  ===================================== */

  if (
    !signedData ||
    !signedData.token
  ) {

    console.error(
      "Signed upload token missing:",
      signedData
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
     15. ส่งกลับ BROWSER

     ไม่มี SECRET KEY หลุดออกไป
  ===================================== */

  return json(
    {
      success:
        true,

      path:
        path,

      token:
        signedData.token
    },
    200
  );
}
