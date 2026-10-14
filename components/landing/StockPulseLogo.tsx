import Link from "next/link";

/**
 * Responsive header mark.
 * Phone: compact icon + shorter wordmark so it never crowds Sign in / menu.
 * Laptop+: icon 61px (3px under the previous 64px desktop size).
 */
export function StockPulseLogo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="StockPulse"
      className={`inline-flex min-w-0 max-w-full items-center gap-2 sm:gap-2.5 ${className}`}
    >
      <svg
        width="61"
        height="61"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-9 w-9 shrink-0 sm:h-12 sm:w-12 md:h-[61px] md:w-[61px]"
        aria-hidden
      >
        <path
          d="M44 18c0-6.5-5.8-11-14.5-11C20.2 7 14 12.2 14 19.5c0 5.8 3.6 9.2 11.8 11.2l8.4 2.1C43 35.2 48 38.6 48 45.2 48 53.4 40.8 59 29.5 59 17.6 59 10 52.4 10 43"
          stroke="#25345F"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 46c0 5.2 4.6 9 11.5 9 7.2 0 12.5-3.6 12.5-9.2 0-4.6-3.2-7.2-10.8-9.1l-7.6-1.9C17.8 32.6 14 28.8 14 22.5"
          stroke="#C4A35A"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <rect x="28" y="22" width="4.5" height="10" rx="1.2" fill="#C4A35A" />
        <rect x="35" y="17" width="4.5" height="15" rx="1.2" fill="#C4A35A" />
        <rect x="42" y="12" width="4.5" height="20" rx="1.2" fill="#D9A63A" />
      </svg>
      <span className="min-w-0 whitespace-nowrap leading-none tracking-tight">
        <span className="text-[1.15rem] font-bold text-[#25345F] sm:text-[1.45rem] md:text-[1.95rem]">Stock</span>
        <span className="text-[1.15rem] font-bold text-[#C4A35A] sm:text-[1.45rem] md:text-[1.95rem]">Pulse</span>
      </span>
    </Link>
  );
}
