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


function json(
  data,
  status = 200
) {
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
  const header =
    request.headers.get(
      "authorization"
    ) || "";


  if (
    !header.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }


  const token =
    header.slice(7);


  const response =
    await fetch(
      `${url}/auth/v1/user`,
      {
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


function cleanString(
  value,
  max
) {
  return String(value || "")
    .trim()
    .slice(0, max);
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


async function getOwnedListing(
  id,
  userId,
  token,
  url,
  key
) {
  const response =
    await fetch(
      `${url}/rest/v1/listings?select=*&id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(userId)}&limit=1`,
      {
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


  const rows =
    await response.json();


  return rows[0] || null;
}



/* ===================================
   PATCH
   แก้ไขประกาศ
=================================== */

export async function PATCH(
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


  const requestUrl =
    new URL(
      request.url
    );


  const listingId =
    requestUrl.searchParams
      .get("id");


  if (!listingId) {
    return json(
      {
        error:
          "ไม่พบ Listing ID"
      },
      400
    );
  }


  const currentListing =
    await getOwnedListing(
      listingId,
      user.id,
      token,
      url,
      key
    );


  if (!currentListing) {
    return json(
      {
        error:
          "ไม่พบประกาศ หรือคุณไม่มีสิทธิ์แก้ไข"
      },
      404
    );
  }


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
          "ชื่อคอนโดไม่ถูกต้อง"
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
          "ทำเลไม่ถูกต้อง"
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


  /* ===================================
     โหลด Gallery ปัจจุบัน
  =================================== */

  const galleryResponse =
    await fetch(
      `${url}/rest/v1/listing_images?select=id,image_url,sort_order&listing_id=eq.${encodeURIComponent(listingId)}&order=sort_order.asc`,
      {
        headers: {
          apikey: key,

          Authorization:
            `Bearer ${token}`
        },

        cache: "no-store"
      }
    );


  let currentImages =
    [];


  if (
    galleryResponse.ok
  ) {
    currentImages =
      await galleryResponse.json();
  }


  const removeIds =
    Array.isArray(
      body.remove_image_ids
    )
      ? body.remove_image_ids
          .filter(
            value =>
              typeof value ===
              "string"
          )
          .slice(0, 10)
      : [];


  const removeSet =
    new Set(
      removeIds
    );


  const remainingImages =
    currentImages.filter(
      image =>
        !removeSet.has(
          image.id
        )
    );


  let newImageUrls =
    Array.isArray(
      body.new_image_urls
    )
      ? body.new_image_urls
          .filter(
            value =>
              typeof value ===
              "string"
          )
          .slice(0, 10)
      : [];


  const allowedPrefix =
    `${url}/storage/v1/object/public/listing-images/${user.id}/`;


  for (
    const imageUrl
    of newImageUrls
  ) {
    if (
      !imageUrl.startsWith(
        allowedPrefix
      )
    ) {
      return json(
        {
          error:
            "พบรูปภาพที่ไม่ได้รับอนุญาต"
        },
        400
      );
    }
  }


  if (
    remainingImages.length +
    newImageUrls.length >
    10
  ) {
    return json(
      {
        error:
          "หนึ่งประกาศมีรูปได้สูงสุด 10 รูป"
      },
      400
    );
  }


  if (
    remainingImages.length +
    newImageUrls.length ===
    0
  ) {
    return json(
      {
        error:
          "ต้องมีรูปอย่างน้อย 1 รูป"
      },
      400
    );
  }


  /* ===================================
     ลบ Metadata รูปที่ User เลือกลบ
  =================================== */

  for (
    const imageId
    of removeIds
  ) {
    const response =
      await fetch(
        `${url}/rest/v1/listing_images?id=eq.${encodeURIComponent(imageId)}&listing_id=eq.${encodeURIComponent(listingId)}`,
        {
          method: "DELETE",

          headers: {
            apikey: key,

            Authorization:
              `Bearer ${token}`
          }
        }
      );


    if (!response.ok) {
      return json(
        {
          error:
            "ลบข้อมูลรูปไม่สำเร็จ"
        },
        500
      );
    }
  }


  /* ===================================
     เรียงรูปเดิมใหม่
  =================================== */

  for (
    let i = 0;
    i < remainingImages.length;
    i++
  ) {
    await fetch(
      `${url}/rest/v1/listing_images?id=eq.${encodeURIComponent(remainingImages[i].id)}&listing_id=eq.${encodeURIComponent(listingId)}`,
      {
        method: "PATCH",

        headers: {
          apikey: key,

          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            sort_order: i
          })
      }
    );
  }


  /* ===================================
     เพิ่ม Metadata รูปใหม่
  =================================== */

  if (
    newImageUrls.length > 0
  ) {
    const newRows =
      newImageUrls.map(
        function(
          imageUrl,
          index
        ) {
          return {
            listing_id:
              listingId,

            image_url:
              imageUrl,

            sort_order:
              remainingImages.length +
              index
          };
        }
      );


    const insertImages =
      await fetch(
        `${url}/rest/v1/listing_images`,
        {
          method: "POST",

          headers: {
            apikey: key,

            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json",

            Prefer:
              "return=minimal"
          },

          body:
            JSON.stringify(
              newRows
            )
        }
      );


    if (!insertImages.ok) {
      const text =
        await insertImages.text();


      console.error(
        text
      );


      return json(
        {
          error:
            "เพิ่มรูปใหม่ไม่สำเร็จ"
        },
        500
      );
    }
  }


  /* ===================================
     รูปหน้าปก
  =================================== */

  const coverImage =
    remainingImages[0]?.image_url ||
    newImageUrls[0] ||
    currentListing.image_url ||
    null;


  const updatePayload = {
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


  /*
    ไม่มี owner_id อยู่ใน payload
    User จึงเปลี่ยนเจ้าของไม่ได้
  */


  const updateResponse =
    await fetch(
      `${url}/rest/v1/listings?id=eq.${encodeURIComponent(listingId)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",

        headers: {
          apikey: key,

          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json",

          Prefer:
            "return=representation"
        },

        body:
          JSON.stringify(
            updatePayload
          )
      }
    );


  const updateText =
    await updateResponse.text();


  if (
    !updateResponse.ok
  ) {
    console.error(
      updateText
    );


    return json(
      {
        error:
          "แก้ไขประกาศไม่สำเร็จ"
      },
      updateResponse.status
    );
  }


  return json({
    success: true,

    listing_id:
      listingId
  });
}



/* ===================================
   DELETE
   ลบประกาศ
=================================== */

export async function DELETE(
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


  const requestUrl =
    new URL(
      request.url
    );


  const listingId =
    requestUrl.searchParams
      .get("id");


  if (!listingId) {
    return json(
      {
        error:
          "ไม่พบ Listing ID"
      },
      400
    );
  }


  const listing =
    await getOwnedListing(
      listingId,
      user.id,
      token,
      url,
      key
    );


  if (!listing) {
    return json(
      {
        error:
          "ไม่พบประกาศ หรือคุณไม่มีสิทธิ์ลบ"
      },
      404
    );
  }


  /* เก็บ URLs ก่อน Cascade */

  const imageResponse =
    await fetch(
      `${url}/rest/v1/listing_images?select=image_url&listing_id=eq.${encodeURIComponent(listingId)}`,
      {
        headers: {
          apikey: key,

          Authorization:
            `Bearer ${token}`
        },

        cache:
          "no-store"
      }
    );


  let imageUrls =
    [];


  if (
    imageResponse.ok
  ) {
    const rows =
      await imageResponse.json();


    imageUrls =
      rows.map(
        row =>
          row.image_url
      );
  }


  const deleteResponse =
    await fetch(
      `${url}/rest/v1/listings?id=eq.${encodeURIComponent(listingId)}&owner_id=eq.${encodeURIComponent(user.id)}`,
      {
        method:
          "DELETE",

        headers: {
          apikey: key,

          Authorization:
            `Bearer ${token}`
        }
      }
    );


  if (
    !deleteResponse.ok
  ) {
    return json(
      {
        error:
          "ลบประกาศไม่สำเร็จ"
      },
      deleteResponse.status
    );
  }


  return json({
    success: true,
    image_urls: imageUrls
  });
}
