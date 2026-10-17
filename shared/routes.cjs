function distance(a, b) {
  const rad = (v) => (v * Math.PI) / 180,
    lat = rad(b.latitude - a.latitude),
    lng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function nearestRoute(items, origin) {
  const left = items.filter(
    (i) =>
      i.location &&
      Number.isFinite(i.location.latitude) &&
      Number.isFinite(i.location.longitude),
  );
  const result = [];
  let point = origin || left[0]?.location;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++)
      if (
        distance(point, left[i].location) < distance(point, left[best].location)
      )
        best = i;
    const [next] = left.splice(best, 1);
    result.push(next);
    point = next.location;
  }
  return [...result, ...items.filter((i) => !result.includes(i))];
}
module.exports = { distance, nearestRoute };
