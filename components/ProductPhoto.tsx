export function ProductPhoto({
  src,
  name,
  size = "md",
}: {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  if (!src) return null;
  const box = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-10 w-10" : "h-12 w-12";
  return (
    <img
      src={src}
      alt={name}
      className={`${box} shrink-0 rounded-[12px] object-cover`}
    />
  );
}
