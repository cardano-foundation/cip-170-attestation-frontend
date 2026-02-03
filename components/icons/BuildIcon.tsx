interface IconProps {
  className?: string;
  size?: number;
}

export default function BuildIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M14.7 6.3C15.0314 5.96863 15.0314 5.43137 14.7 5.1L12.9 3.3C12.5686 2.96863 12.0314 2.96863 11.7 3.3L9.9 5.1C9.56863 5.43137 9.56863 5.96863 9.9 6.3L11.7 8.1C12.0314 8.43137 12.5686 8.43137 12.9 8.1L14.7 6.3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 4L4 11L13 20L20 13L13 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 16L18 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
