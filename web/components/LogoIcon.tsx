'use client';

type Props = { size?: number; className?: string };

export default function LogoIcon({ size = 32, className }: Props) {
  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M16 4c-4.4 0-8 3.6-8 8 0 6 8 14 8 14s8-8 8-14c0-4.4-3.6-8-8-8zm0 10.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"
        fill="currentColor"
      />
    </svg>
  );
}
