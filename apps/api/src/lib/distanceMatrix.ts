export async function getTravelMinutes(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<number | null> {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
    + `?origins=${originLat},${originLng}`
    + `&destinations=${destLat},${destLng}`
    + `&mode=driving`
    + `&departure_time=now`
    + `&language=ja`
    + `&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json() as any;
  const element = data.rows?.[0]?.elements?.[0];
  if (element?.status !== 'OK') return null;
  const seconds = element.duration_in_traffic?.value ?? element.duration?.value;
  return Math.ceil(seconds / 60);
}
