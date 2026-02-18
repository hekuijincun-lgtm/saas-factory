import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"
const API_BASE = process.env.API_BASE!

function getTenantId(req: NextRequest) {
  return req.nextUrl.searchParams.get("tenantId") || "default"
}

function getId(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/")
  return parts[parts.length - 1]
}

export async function PATCH(req: NextRequest) {
  const tenantId = getTenantId(req)
  const id = getId(req)
  const body = await req.json()

  const res = await fetch(`${API_BASE}/admin/staff/${id}?tenantId=${tenantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(req: NextRequest) {
  const tenantId = getTenantId(req)
  const id = getId(req)

  const res = await fetch(`${API_BASE}/admin/staff/${id}?tenantId=${tenantId}`, {
    method: "DELETE",
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
