import { ImageResponse } from "next/og";

export const alt = "StockPulse — See your stock clearly.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#F7F3EA",
          color: "#25345F",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(800px 400px at 20% 0%, rgba(217,166,58,0.22), transparent 55%), radial-gradient(700px 360px at 100% 20%, rgba(24,37,68,0.08), transparent 50%)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -1 }}>StockPulse</div>
          <div
            style={{
              marginTop: 16,
              width: 96,
              height: 6,
              borderRadius: 999,
              background: "#D9A63A",
            }}
          />
          <div style={{ marginTop: 28, fontSize: 40, fontWeight: 600, maxWidth: 800 }}>
            See your stock clearly.
          </div>
          <div style={{ marginTop: 16, fontSize: 24, color: "#70758A", maxWidth: 720 }}>
            Warehouse, shop, and online stock in one calm place.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
