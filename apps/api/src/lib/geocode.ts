export async function geocodeAddress(
  address: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}&language=ja&region=JP`;
  const res = await fetch(url);
  const data = await res.json() as any;
  if (data.status !== 'OK' || !data.results?.[0]) return null;
  return data.results[0].geometry.location;
}
