import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#182544",
          borderRadius: 8,
          color: "#D9A63A",
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        S
      </div>
    ),
    size,
  );
}
