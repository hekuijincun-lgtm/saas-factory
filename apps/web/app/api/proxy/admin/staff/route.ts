import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

const API_BASE = process.env.API_BASE!

function getTenantId(req: NextRequest) {
  return req.nextUrl.searchParams.get("tenantId") || "default"
}

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req)

  const res = await fetch(`${API_BASE}/admin/staff?tenantId=${tenantId}`, {
    method: "GET",
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req)
  const body = await req.json()

  const res = await fetch(`${API_BASE}/admin/staff?tenantId=${tenantId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
