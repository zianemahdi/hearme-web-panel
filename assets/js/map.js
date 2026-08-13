/* =========================================================================
 * HearMe — Carte MapLibre (satellite par défaut, comme l'app Android)
 * Sans clé : imagerie Esri (raster) + fond "Plan" OpenFreeMap (vectoriel).
 * ========================================================================= */
window.HM = window.HM || {};

HM.map = (function () {
  let map = null, marker = null, points = [], style = "sat", accuracy = null;

  const PLAN_STYLE = "https://tiles.openfreemap.org/styles/liberty";

  function satStyle() {
    return {
      version: 8,
      sources: {
        esri: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          attribution: "Imagerie © Esri, Maxar, Earthstar Geographics",
        },
      },
      layers: [{ id: "esri", type: "raster", source: "esri" }],
    };
  }

  function drawOverlays() {
    if (!map || !map.isStyleLoaded()) return;
    // Trace de l'historique (ligne).
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: points.map((p) => [p.lon, p.lat]) },
    };
    if (map.getSource("hm-path")) {
      map.getSource("hm-path").setData(line);
    } else {
      map.addSource("hm-path", { type: "geojson", data: line });
      map.addLayer({
        id: "hm-path-line", type: "line", source: "hm-path",
        paint: { "line-color": "#c24df0", "line-width": 3, "line-opacity": 0.7 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    }
    // Cercle de précision autour du dernier point.
    if (accuracy && points[0]) {
      const circle = geoCircle(points[0].lon, points[0].lat, accuracy);
      if (map.getSource("hm-acc")) map.getSource("hm-acc").setData(circle);
      else {
        map.addSource("hm-acc", { type: "geojson", data: circle });
        map.addLayer({
          id: "hm-acc-fill", type: "fill", source: "hm-acc",
          paint: { "fill-color": "#7c5cff", "fill-opacity": 0.12 },
        }, "hm-path-line");
      }
    }
  }

  /** Petit polygone approximant un cercle de rayon r (m) autour de (lon,lat). */
  function geoCircle(lon, lat, r) {
    const pts = [], km = r / 1000, dLat = km / 110.574;
    const dLon = km / (111.320 * Math.cos((lat * Math.PI) / 180) || 1);
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
    }
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [pts] } };
  }

  function init(elId, center, zoom) {
    map = new maplibregl.Map({
      container: elId,
      style: satStyle(),
      center: center || HM.config.MAP.defaultCenter,
      zoom: zoom || HM.config.MAP.defaultZoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const el = document.createElement("div");
    el.className = "hm-pin";
    marker = new maplibregl.Marker({ element: el })
      .setLngLat(center || HM.config.MAP.defaultCenter)
      .addTo(map);

    map.on("style.load", drawOverlays);

    // Bouton de bascule Satellite / Plan.
    addToggle();
    return map;
  }

  function addToggle() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Plan";
    btn.className =
      "absolute z-10 top-3 left-3 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 " +
      "text-xs font-medium text-white backdrop-blur hover:bg-black/70";
    btn.addEventListener("click", () => {
      style = style === "sat" ? "plan" : "sat";
      btn.textContent = style === "sat" ? "Plan" : "Satellite";
      map.setStyle(style === "sat" ? satStyle() : PLAN_STYLE);
    });
    const wrap = map.getContainer();
    wrap.style.position = "relative";
    wrap.appendChild(btn);
  }

  /** Met à jour la dernière position. opts.fly = recentrer avec animation. */
  function setLatest(lat, lon, acc, opts) {
    opts = opts || {};
    accuracy = acc || null;
    if (marker) marker.setLngLat([lon, lat]);
    if (opts.fly) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), speed: 0.8 });
    drawOverlays();
  }

  /** Remplace l'historique (points: [{lat,lon,accuracy_m}], du + récent au + ancien). */
  function setPath(list) {
    points = list.slice(0, HM.config.MAP.maxLocationsPath);
    if (points[0]) { accuracy = points[0].accuracy_m || null; if (marker) marker.setLngLat([points[0].lon, points[0].lat]); }
    drawOverlays();
  }

  function recenter() {
    if (points[0]) map.flyTo({ center: [points[0].lon, points[0].lat], zoom: 15, speed: 0.9 });
  }

  return { init, setLatest, setPath, recenter };
})();
