import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, ApiError } from "./api";
export type DriverPosition = {
  courier_id: string;
  name: string;
  sharing: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  captured_at?: number;
  updated_at: number;
  track: { latitude: number; longitude: number }[];
};
export function LiveDeliveryMap() {
  const [positions, setPositions] = useState<DriverPosition[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      api<{ positions: DriverPosition[] }>("/admin/couriers/locations")
        .then((r) => {
          if (active) {
            setPositions(r.positions);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="operation-panel">
      <h2>Motoboys no mapa</h2>
      <p>
        A posição aparece somente com compartilhamento autorizado. Atualiza a
        cada 10 segundos; posições antigas ficam sinalizadas. O trajeto recente
        mostra até duas horas e os pontos expiram em 24 horas.
      </p>
      {error && <p role="alert">{error}</p>}
      <PositionMap positions={positions} selected={selected} />
      <div className="driver-position-list">
        {positions.map((p) => {
          const age = Date.now() - (p.captured_at || p.updated_at),
            stale = age > 90000;
          return (
            <button
              className="button secondary"
              key={p.courier_id}
              onClick={() => setSelected(p.courier_id)}
            >
              <strong>{p.name}</strong>
              <span>
                {p.sharing
                  ? stale
                    ? "Posição desatualizada"
                    : "Compartilhando"
                  : "Compartilhamento encerrado"}{" "}
                ·{" "}
                {new Date(p.captured_at || p.updated_at).toLocaleTimeString(
                  "pt-BR",
                )}
                {p.sharing && ` · precisão ${Math.round(p.accuracy || 0)} m`}
              </span>
            </button>
          );
        })}
        {!positions.some((p) => p.sharing) && (
          <p>Nenhum entregador compartilhou uma posição ativa.</p>
        )}
      </div>
      <small>
        Se o mapa não carregar, confira internet e acesso ao OpenStreetMap. Os
        links de rota dos pedidos continuam disponíveis.
      </small>
    </section>
  );
}
export function PositionMap({
  positions,
  selected,
}: {
  positions: DriverPosition[];
  selected?: string;
}) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null),
    fitted = useRef(false);
  useEffect(() => {
    if (!node.current) return;
    const instance = L.map(node.current, { scrollWheelZoom: false }).setView(
      [-14.2, -51.9],
      4,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(instance);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(node.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      layer.current = null;
      fitted.current = false;
    };
  }, []);
  useEffect(() => {
    const current = map.current,
      group = layer.current;
    if (!current || !group) return;
    group.clearLayers();
    const valid = positions.filter(
      (p): p is DriverPosition & { latitude: number; longitude: number } =>
        !!p.sharing && p.latitude != null && p.longitude != null,
    );
    for (const p of valid) {
      const stale = Date.now() - (p.captured_at || p.updated_at) > 90000,
        color = stale ? "#8b8e87" : "#ef5a36";
      const text = document.createElement("div");
      text.textContent = `${p.name} · ${stale ? "posição desatualizada" : "compartilhando"} · ${new Date(p.captured_at || p.updated_at).toLocaleTimeString("pt-BR")}`;
      L.circleMarker([p.latitude, p.longitude], {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      })
        .addTo(group)
        .bindTooltip(text, { permanent: true, direction: "top" });
      if (p.accuracy)
        L.circle([p.latitude, p.longitude], {
          radius: Math.min(p.accuracy, 10000),
          color,
          weight: 1,
          fillOpacity: 0.07,
        }).addTo(group);
      if (p.track?.length > 1)
        L.polyline(
          p.track.map((t) => [t.latitude, t.longitude] as L.LatLngTuple),
          { color, weight: 3, opacity: 0.6 },
        ).addTo(group);
    }
    const active = valid.find((p) => p.courier_id === selected);
    if (active) current.setView([active.latitude, active.longitude], 16);
    else if (valid.length && !fitted.current) {
      current.fitBounds(
        L.latLngBounds(valid.map((p) => [p.latitude, p.longitude])),
        { padding: [35, 35], maxZoom: 16 },
      );
      fitted.current = true;
    }
  }, [positions, selected]);
  return (
    <div
      ref={node}
      className="delivery-map"
      aria-label="Mapa de localização compartilhada dos entregadores"
    />
  );
}
export function CourierLocationSharing() {
  const [sharing, setSharing] = useState(false),
    [message, setMessage] = useState(""),
    [point, setPoint] = useState<GeolocationPosition | null>(null),
    [sentAt, setSentAt] = useState<number | null>(null);
  const lifecycle = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!sharing) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setMessage(
        "O compartilhamento GPS exige HTTPS no celular. Use o endereço seguro da loja.",
      );
      setSharing(false);
      return;
    }
    let latest: GeolocationPosition | null = null,
      last = 0,
      sending = false,
      alive = true;
    let trackingId = "";
    const started = lifecycle.current
      .catch(() => {})
      .then(async () => {
        if (!alive) return;
        const result = await api<{ trackingId: string }>(
          "/courier/location/start",
          "POST",
        );
        trackingId = result.trackingId;
      });
    lifecycle.current = started;
    started.catch((e) => {
      if (alive) {
        setMessage(
          e instanceof Error
            ? e.message
            : "Falha ao iniciar o compartilhamento.",
        );
        setSharing(false);
      }
    });
    const send = async () => {
      if (
        !alive ||
        !latest ||
        sending ||
        !navigator.onLine ||
        Date.now() - last < 10000
      )
        return;
      sending = true;
      last = Date.now();
      try {
        await started;
        if (!alive || !trackingId) return;
        await api("/courier/location", "POST", {
          trackingId,
          sharing: true,
          latitude: latest.coords.latitude,
          longitude: latest.coords.longitude,
          accuracy: Math.min(latest.coords.accuracy, 100000),
          capturedAt: latest.timestamp,
        });
        if (alive) {
          setSentAt(Date.now());
          setMessage("Sua localização está sendo compartilhada com a loja.");
        }
      } catch (e) {
        if (alive) {
          setMessage(e instanceof Error ? e.message : "Falha ao compartilhar.");
          if (e instanceof ApiError && [401, 409].includes(e.status))
            setSharing(false);
        }
      } finally {
        sending = false;
      }
    };
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        latest = p;
        setPoint(p);
        send();
      },
      (e) => {
        setMessage(
          e.code === 1
            ? "Permissão de localização negada. Autorize nas configurações do navegador para compartilhar."
            : "GPS indisponível. Mantenha o aplicativo aberto e tente novamente.",
        );
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    const interval = setInterval(send, 10000);
    return () => {
      alive = false;
      clearInterval(interval);
      navigator.geolocation.clearWatch(watch);
      lifecycle.current = started
        .catch(() => {})
        .then(async () => {
          if (trackingId)
            await api("/courier/location", "POST", {
              sharing: false,
              trackingId,
            });
        })
        .catch(() => {});
    };
  }, [sharing]);
  const position: DriverPosition[] =
    sharing && point
      ? [
          {
            courier_id: "me",
            name: "Você",
            sharing: 1,
            latitude: point.coords.latitude,
            longitude: point.coords.longitude,
            accuracy: point.coords.accuracy,
            captured_at: point.timestamp,
            updated_at: sentAt || Date.now(),
            track: [],
          },
        ]
      : [];
  return (
    <section className="operation-panel">
      <h2>Compartilhar minha localização</h2>
      <p>
        A loja poderá ver sua posição durante o trabalho. Autorize o GPS e
        mantenha o aplicativo aberto. Você pode interromper quando quiser.
      </p>
      <button
        className={"button " + (sharing ? "secondary" : "primary")}
        onClick={() => {
          setSharing(!sharing);
          setMessage(
            sharing
              ? "Compartilhamento encerrado neste aparelho."
              : "Aguardando autorização e sinal do GPS…",
          );
        }}
      >
        {sharing
          ? "Parar compartilhamento"
          : "Compartilhar localização com a loja"}
      </button>
      <p role="status">{message}</p>
      {sentAt && (
        <small>
          Último envio: {new Date(sentAt).toLocaleTimeString("pt-BR")}
        </small>
      )}
      {sharing && point && (
        <>
          <p>Precisão aproximada: {Math.round(point.coords.accuracy)} m</p>
          <PositionMap positions={position} selected="me" />
        </>
      )}
    </section>
  );
}
